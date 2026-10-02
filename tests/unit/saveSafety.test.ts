import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, SaveTooNewError, Sim, loadSaveFile } from '../../src/game';
import type { SaveFile } from '../../src/game';
import { OLD_BACKUP_MAX_AGE_MS, SaveStore, syncDir } from '../../src/main/saveStore';
import { gameSaveVerdict } from '../../src/main/saveVerdict';
import type { BugglebrookApi } from '../../src/shared/ipc';
import { memoryApi } from '../../src/renderer/src/app/memorySaves';
import { SaveService } from '../../src/renderer/src/app/saveService';
import { SaveTrouble, retryDelay } from '../../src/renderer/src/app/saveTrouble';

// The pre-release review's save items: P-01 (never destroy a save that will
// not load), P-22 (a second, older backup; only good saves rotate), and P-30
// (directories flushed after a rename).

const saveOf = (sim: Sim): SaveFile => ({
  version: SAVE_VERSION,
  savedAt: '2026-10-02T00:00:00.000Z',
  world: sim.serialize(),
  view: { cameraX: 40 },
  meta: { createdAt: '2026-10-01T00:00:00.000Z', thumb: null },
});

/** A real save after `ticks` of play. */
const worldAt = (ticks: number): string => {
  const sim = Sim.create({ seed: 'safety' });
  sim.run(ticks);
  return JSON.stringify(saveOf(sim));
};

/** The same save, as a newer game would have written it. */
const fromNewerGame = (text: string): string =>
  JSON.stringify({ ...(JSON.parse(text) as object), version: SAVE_VERSION + 1, hatsOnHats: true });

let dir: string;
let saves: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bb-safety-'));
  saves = join(dir, 'saves');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const files = (): string[] => readdirSync(saves).sort();
/** Every file in the save folder with its bytes and modified time, to prove nothing changed. */
const snapshot = (): Record<string, { text: string; at: number }> =>
  Object.fromEntries(
    files().map((f) => [
      f,
      { text: readFileSync(join(saves, f), 'utf8'), at: statSync(join(saves, f)).mtimeMs },
    ]),
  );

/** The renderer's SaveService talking straight to a main-process SaveStore, as over IPC. */
function wire(store: SaveStore): BugglebrookApi['saves'] {
  return {
    list: () => store.list(),
    read: (slot) => store.read(slot),
    write: (slot, data) => store.write(slot, data),
    remove: (slot) => store.remove(slot),
    readBackup: (slot, kind) => store.readBackup(slot, kind),
    recover: (slot, from) => store.recover(slot, from),
    setAside: (slot) => store.setAside(slot),
  };
}

describe('a save that will not load is never destroyed (P-01)', () => {
  it('leaves a save from a newer game, and its backup, exactly as they are through many menu visits', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    const good = worldAt(60);
    await store.write(0, good);
    await store.write(0, worldAt(120));
    // A newer build wrote the slot, then the player went back to this one.
    writeFileSync(join(saves, 'slot-1.json'), fromNewerGame(worldAt(180)));
    writeFileSync(join(saves, 'slot-1.bak.json'), fromNewerGame(worldAt(120)));
    const before = snapshot();
    const service = new SaveService(wire(new SaveStore(saves, gameSaveVerdict)));
    for (let visit = 0; visit < 4; visit++) {
      const slots = await service.list();
      expect(slots[0]).toMatchObject({ exists: true, save: null, locked: 'newer' });
    }
    const opened = await service.loadWithRecovery(0);
    expect(opened).toEqual({ save: null, recovered: false, locked: 'newer' });
    expect(snapshot()).toEqual(before);
    expect(service.problems.some((p) => p.includes('newer than this game'))).toBe(true);
  });

  it('keeps a slot whose save and backups are all broken locked and untouched', async () => {
    mkdirSync(saves, { recursive: true });
    writeFileSync(join(saves, 'slot-2.json'), `{"version": ${SAVE_VERSION}, "world": `);
    writeFileSync(join(saves, 'slot-2.bak.json'), `{"version": ${SAVE_VERSION}, "world": {}}`);
    writeFileSync(join(saves, 'slot-2.old.json'), 'nope');
    const before = snapshot();
    const service = new SaveService(wire(new SaveStore(saves, gameSaveVerdict)));
    for (let visit = 0; visit < 3; visit++) expect((await service.list())[1]!.locked).toBe('broken');
    expect(snapshot()).toEqual(before);
  });

  it('recovers only from a backup that loads, falling back to the older one, and sets the save aside', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    const first = worldAt(60);
    await store.write(2, first);
    await store.write(2, worldAt(120));
    await store.write(2, worldAt(180));
    // The newest backup is broken too (a valid-JSON save from a buggy build, written by hand here).
    writeFileSync(join(saves, 'slot-3.bak.json'), `{"version": ${SAVE_VERSION}}`);
    writeFileSync(join(saves, 'slot-3.json'), 'garbage');
    const service = new SaveService(wire(store));
    const loaded = await service.loadWithRecovery(2);
    expect(loaded.recovered).toBe(true);
    expect(loaded.locked).toBeNull();
    expect(loaded.save!.world.tick).toBe(60);
    expect(await store.read(2)).toBe(first);
    expect(readFileSync(join(saves, 'slot-3.corrupt-1.json'), 'utf8')).toBe('garbage');
  });

  it('never overwrites a save set aside earlier: each one gets the next number', async () => {
    const store = new SaveStore(saves);
    await store.write(0, '{"v":1}');
    await store.write(0, '{"v":2}');
    mkdirSync(saves, { recursive: true });
    writeFileSync(join(saves, 'slot-1.corrupt.json'), 'from an old build');
    writeFileSync(join(saves, 'slot-1.json'), 'broken once');
    expect(await store.recover(0)).toBe('{"v":1}');
    writeFileSync(join(saves, 'slot-1.json'), 'broken twice');
    expect(await store.recover(0)).toBe('{"v":1}');
    expect(readFileSync(join(saves, 'slot-1.corrupt.json'), 'utf8')).toBe('from an old build');
    expect(readFileSync(join(saves, 'slot-1.corrupt-1.json'), 'utf8')).toBe('broken once');
    expect(readFileSync(join(saves, 'slot-1.corrupt-2.json'), 'utf8')).toBe('broken twice');
  });

  it('will not recover from a backup that does not load', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    mkdirSync(saves, { recursive: true });
    writeFileSync(join(saves, 'slot-1.json'), 'broken');
    writeFileSync(join(saves, 'slot-1.bak.json'), '{"version": 3}');
    expect(await store.recover(0, 'bak')).toBeNull();
    expect(await store.recover(0, 'old')).toBeNull();
    expect(files()).toEqual(['slot-1.bak.json', 'slot-1.json']);
  });

  it('never writes over a save from a newer game, even if asked', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    mkdirSync(saves, { recursive: true });
    const newer = fromNewerGame(worldAt(60));
    writeFileSync(join(saves, 'slot-1.json'), newer);
    await expect(store.write(0, worldAt(30))).rejects.toThrow(/newer game/);
    expect(readFileSync(join(saves, 'slot-1.json'), 'utf8')).toBe(newer);
  });

  it('binning a locked slot moves all its files aside instead of deleting them', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    await store.write(1, worldAt(60));
    await store.write(1, worldAt(120));
    writeFileSync(join(saves, 'slot-2.json'), fromNewerGame(worldAt(120)));
    const service = new SaveService(wire(store));
    const slot = (await service.list())[1]!;
    expect(slot.locked).toBe('newer');
    await service.remove(1, slot.locked);
    expect(files()).toEqual(['slot-2.aside-1.bak.json', 'slot-2.aside-1.json', 'slot-2.aside-1.old.json']);
    expect((await service.list())[1]).toMatchObject({ exists: false, locked: null });
    // A second locked save set aside later gets its own number.
    await store.write(1, worldAt(60));
    writeFileSync(join(saves, 'slot-2.json'), 'broken');
    await service.remove(1, 'broken');
    expect(files()).toContain('slot-2.aside-2.json');
    expect(readFileSync(join(saves, 'slot-2.aside-2.json'), 'utf8')).toBe('broken');
  });

  it('works the same through the in-memory store the browser build uses', async () => {
    const api = memoryApi();
    const service = new SaveService(api.saves);
    await api.saves.write(0, fromNewerGame(worldAt(10)));
    expect((await service.loadWithRecovery(0)).locked).toBe('newer');
    await service.remove(0, 'newer');
    expect(await api.saves.read(0)).toBeNull();
  });
});

describe('backups (P-22)', () => {
  it('only a save that loads ever becomes a backup', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    const good = worldAt(60);
    await store.write(0, good);
    await store.write(0, worldAt(120));
    // Valid JSON that does not load (a broken build's save) sits in the slot.
    writeFileSync(join(saves, 'slot-1.json'), `{"version": ${SAVE_VERSION}, "world": {"entities": "lots"}}`);
    await store.write(0, worldAt(180));
    // The broken save did not become the backup: the last good one is still there.
    expect(await store.readBackup(0)).toBe(good);
    expect(await store.readBackup(0, 'old')).toBe(good);
    expect(await store.read(0)).toBe(worldAt(180));
  });

  it('runs writes to a slot one after another, so each backup is the save before it', async () => {
    const store = new SaveStore(saves);
    await Promise.all([1, 2, 3, 4, 5].map((v) => store.write(0, `{"v":${v}}`)));
    expect(await store.read(0)).toBe('{"v":5}');
    expect(await store.readBackup(0)).toBe('{"v":4}');
    expect(await store.readBackup(0, 'old')).toBe('{"v":1}');
    expect(files().filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a backup keeps its bytes when the save moves on (backups are links, never edited in place)', async () => {
    const store = new SaveStore(saves);
    await store.write(1, '{"v":1}');
    await store.write(1, '{"v":2}');
    await store.write(1, '{"v":3}');
    expect(readFileSync(join(saves, 'slot-2.bak.json'), 'utf8')).toBe('{"v":2}');
    expect(readFileSync(join(saves, 'slot-2.old.json'), 'utf8')).toBe('{"v":1}');
    expect(readFileSync(join(saves, 'slot-2.json'), 'utf8')).toBe('{"v":3}');
  });

  it('refuses to write a save that does not load, and says why', async () => {
    const store = new SaveStore(saves, gameSaveVerdict);
    await store.write(0, worldAt(60));
    await expect(store.write(0, `{"version": ${SAVE_VERSION}}`)).rejects.toThrow(/does not load/);
    await expect(store.write(0, 'x'.repeat(6_000_000))).rejects.toThrow(/too large/);
    expect(loadSaveFile((await store.read(0))!).world.tick).toBe(60);
  });

  it('keeps an older backup from the start of the session, refreshed daily in a long one', async () => {
    let now = 1_000_000;
    const store = new SaveStore(saves, undefined, () => now);
    await store.write(0, '{"v":1}');
    await store.write(0, '{"v":2}');
    for (let v = 3; v <= 6; v++) await store.write(0, `{"v":${v}}`);
    expect(await store.readBackup(0, 'old')).toBe('{"v":1}');
    expect(await store.readBackup(0)).toBe('{"v":5}');
    // A day later, it moves on.
    now = Date.now() + OLD_BACKUP_MAX_AGE_MS + 1000;
    await store.write(0, '{"v":7}');
    expect(await store.readBackup(0, 'old')).toBe('{"v":6}');
    // A new session takes the save it found at its first write.
    const next = new SaveStore(saves);
    await next.write(0, '{"v":8}');
    expect(await next.readBackup(0, 'old')).toBe('{"v":7}');
  });

  it('rejects unknown backup kinds from IPC', async () => {
    const store = new SaveStore(saves);
    expect(() => SaveStore.assertBackup('../../etc')).toThrow(/Invalid backup/);
    expect(SaveStore.assertBackup(undefined)).toBe('bak');
    await expect(store.readBackup(0, 'corrupt' as never)).rejects.toThrow(/Invalid backup/);
  });
});

describe('save loader verdicts', () => {
  it('tells a newer save from a broken one', () => {
    expect(gameSaveVerdict(worldAt(1))).toEqual({ ok: true });
    expect(gameSaveVerdict(fromNewerGame(worldAt(1)))).toMatchObject({ ok: false, newer: true });
    expect(gameSaveVerdict('{')).toMatchObject({ ok: false, newer: false });
    expect(() => loadSaveFile(fromNewerGame(worldAt(1)))).toThrow(SaveTooNewError);
  });
});

describe('directory flushes (P-30)', () => {
  it('flushes a directory on Linux and macOS and skips it on Windows', async () => {
    mkdirSync(saves, { recursive: true });
    expect(await syncDir(saves, 'win32')).toBe(false);
    if (process.platform !== 'win32') expect(await syncDir(saves)).toBe(true);
    // A missing directory is not an error worth failing a save over.
    expect(await syncDir(join(dir, 'nowhere'), 'linux')).toBe(false);
  });

  it('restores a backup with an atomic, flushed write (no temp file left)', async () => {
    const store = new SaveStore(saves);
    await store.write(0, '{"v":1}');
    await store.write(0, '{"v":2}');
    writeFileSync(join(saves, 'slot-1.json'), 'bad');
    await store.recover(0);
    expect(files().filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(await store.read(0)).toBe('{"v":1}');
  });
});

describe('failed saves (P-02)', () => {
  it('puts the cloud up at the first failure and keeps it until a save works', () => {
    const t = new SaveTrouble();
    expect(t.state()).toEqual({ shown: false, failures: 0, retryIn: null, reason: null });
    expect(t.failed('ENOSPC: no space left on device')).toBe(5);
    expect(t.state()).toMatchObject({ shown: true, failures: 1, reason: 'ENOSPC: no space left on device' });
    expect(t.succeeded()).toBe(true);
    expect(t.state()).toEqual({ shown: false, failures: 0, retryIn: null, reason: null });
    // A save that works with nothing wrong before is not news.
    expect(t.succeeded()).toBe(false);
  });

  it('tries again on its own, waiting longer each time, at most a minute apart', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(retryDelay)).toEqual([5, 10, 20, 40, 60, 60, 60]);
    const t = new SaveTrouble();
    t.failed('EACCES');
    let tries = 0;
    // 4.9 s of frames: not yet; then it is time.
    for (let i = 0; i < 49; i++) if (t.tick(0.1)) tries++;
    expect(tries).toBe(0);
    for (let i = 0; i < 2; i++) if (t.tick(0.1)) tries++;
    expect(tries).toBe(1);
    // Nothing more is waiting until that try fails again.
    for (let i = 0; i < 1000; i++) if (t.tick(0.1)) tries++;
    expect(tries).toBe(1);
    expect(t.failed('EACCES')).toBe(10);
  });
});
