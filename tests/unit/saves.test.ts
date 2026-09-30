import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SaveStore } from '../../src/main/saveStore';
import { SaveService } from '../../src/renderer/src/app/saveService';
import { memoryApi } from '../../src/renderer/src/app/memorySaves';
import { Sim } from '../../src/game';

describe('SaveStore (main process)', () => {
  let dir: string;
  let store: SaveStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bb-saves-'));
    store = new SaveStore(join(dir, 'saves'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists three empty slots on a fresh profile', async () => {
    expect(await store.list()).toEqual([0, 1, 2].map((slot) => ({ slot, exists: false, modifiedMs: null })));
    expect(await store.read(0)).toBeNull();
  });

  it('writes, reads, lists, and removes a slot', async () => {
    await store.write(1, '{"a":1}');
    expect(await store.read(1)).toBe('{"a":1}');
    const list = await store.list();
    expect(list.map((s) => s.exists)).toEqual([false, true, false]);
    expect(list[1]!.modifiedMs).toBeGreaterThan(0);
    await store.remove(1);
    expect(await store.read(1)).toBeNull();
  });

  it('overwrites atomically and leaves no temp files', async () => {
    await store.write(0, '{"v":1}');
    await store.write(0, '{"v":2}');
    expect(await store.read(0)).toBe('{"v":2}');
    expect(readdirSync(join(dir, 'saves')).sort()).toEqual(['slot-1.bak.json', 'slot-1.json']);
  });

  it('sweeps temp files left by a crash', async () => {
    await store.write(0, '{}');
    writeFileSync(join(dir, 'saves', 'slot-2.json.tmp'), 'partial');
    await store.sweep();
    expect(readdirSync(join(dir, 'saves'))).toEqual(['slot-1.json']);
  });

  it('rejects bad slots and bad payloads from IPC', async () => {
    for (const slot of [-1, 3, 1.5, '0', null, Number.NaN])
      expect(() => SaveStore.assertSlot(slot)).toThrow(/Invalid save slot/);
    await expect(store.write(0, { not: 'a string' })).rejects.toThrow(/must be a string/);
    await expect(store.write(0, '{broken')).rejects.toThrow();
    await expect(store.write(0, 'x'.repeat(5_000_001))).rejects.toThrow(/too large/);
    expect(() => store.pathFor(7)).toThrow();
  });
});

describe('SaveService (renderer)', () => {
  it('saves a sim and loads it back', async () => {
    const service = new SaveService(memoryApi().saves, () => new Date('2026-05-05T00:00:00Z'));
    const sim = Sim.create({ seed: 'svc' });
    sim.run(60);
    const written = await service.save(0, sim, { cameraX: 4 });
    expect(written.savedAt).toBe('2026-05-05T00:00:00.000Z');
    const loaded = await service.load(0);
    expect(loaded).toEqual(written);
    const slots = await service.list();
    expect(slots.map((s) => s.exists)).toEqual([true, false, false]);
    expect(slots[0]!.save?.world.entities.length).toBe(sim.entities.size);
  });

  it('treats a corrupt slot as unreadable instead of crashing', async () => {
    const api = memoryApi();
    await api.saves.write(2, '{"version": 999}');
    const service = new SaveService(api.saves);
    const original = console.error;
    console.error = () => undefined;
    try {
      expect(await service.load(2)).toBeNull();
    } finally {
      console.error = original;
    }
  });
});
