import { link, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MAX_SAVE_CHARS, SLOT_COUNT } from '../shared/ipc';
import type { BackupKind, SlotInfo } from '../shared/ipc';

/**
 * Flush a directory's entries (a rename, a new file) to disk. Without it, a
 * power cut soon after a rename can bring back the old name on Linux and
 * macOS. Windows has no directory handles to flush, so it is skipped there.
 * Best effort: a file system that refuses is no reason to fail a save.
 */
export async function syncDir(dir: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform === 'win32') return false;
  try {
    const handle = await open(dir, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Write text to `path` atomically: into `path.tmp`, flushed to disk, then
 * renamed over `path`, and the directory flushed too. A crash at any point
 * leaves either the old file or the new one, never half of either.
 * `beforeRename` lets tests abort at the worst moment.
 */
export async function writeAtomic(
  path: string,
  data: string,
  beforeRename?: () => Promise<void> | void,
): Promise<void> {
  const tmp = `${path}.tmp`;
  const file = await open(tmp, 'w');
  try {
    await file.writeFile(data, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  await beforeRename?.();
  await rename(tmp, path);
  await syncDir(dirname(path));
}

/**
 * Make `to` a copy of `from`, whose text is `text`, atomically. A hard link
 * when the file system has them: the bytes are already on disk, so a backup
 * costs no rewrite and no second fsync of the whole save (P-20). Saves are
 * never changed in place (`writeAtomic` always makes a new file), so the
 * link keeps the old bytes after the save moves on. Anywhere links fail
 * (FAT, some network drives) it falls back to writing `text`.
 */
export async function copyAtomic(from: string, to: string, text: string): Promise<void> {
  const tmp = `${to}.tmp`;
  try {
    await rm(tmp, { force: true });
    await link(from, tmp);
    await rename(tmp, to);
    await syncDir(dirname(to));
  } catch {
    await rm(tmp, { force: true }).catch(() => undefined);
    await writeAtomic(to, text);
  }
}

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function mtimeOrNull(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

/** What `SaveStore` makes of a save's text: it loads, it is from a newer game, or it is broken. */
export type SaveVerdict = { ok: true } | { ok: false; newer: boolean; reason: string };

/** Without the game's own loader (tests), a save is good when it parses as JSON. */
export function jsonVerdict(text: string): SaveVerdict {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch {
    return { ok: false, newer: false, reason: 'not valid JSON' };
  }
}

/** The second backup is refreshed once a session, and at least once a day. */
export const OLD_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const BACKUP_KINDS: readonly BackupKind[] = ['bak', 'old'];

/**
 * Stores save slots as JSON files in one directory. Main process only.
 *
 * - `slot-N.json` is the save. Writes are atomic (see `writeAtomic`).
 * - `slot-N.bak.json` is the save before the last write.
 * - `slot-N.old.json` is an older backup: the save as this session found
 *   it, refreshed once a session (and daily in a long one).
 * - A backup is only ever replaced by a save that loads (`check`), so a
 *   broken save never pushes out a good one.
 * - A save that will not load is never deleted. `recover` sets it aside as
 *   `slot-N.corrupt-K.json` (K counts up; nothing set aside is ever
 *   overwritten) and only when the backup it restores loads. `setAside`
 *   moves a whole slot out of the way, for a locked slot the player bins.
 * - A save from a newer game is never overwritten.
 *
 * Validates everything that crosses IPC: slot numbers, backup kinds,
 * payload type, size, and that the payload loads. `check` is the game's
 * own loader in the app (see `index.ts`).
 */
export class SaveStore {
  /** Tests set this to abort a write between the temp file and the rename. */
  beforeRename: (() => Promise<void> | void) | undefined;
  /** What this store last wrote to each slot, so it need not check it again. */
  private readonly written = new Map<number, string>();
  /** Slots whose older backup was refreshed this session. */
  private readonly refreshed = new Set<number>();
  /** Each slot's last change in progress (see `serial`). */
  private readonly queue = new Map<number, Promise<void>>();

  constructor(
    readonly dir: string,
    private readonly check: (text: string) => SaveVerdict = jsonVerdict,
    private readonly now: () => number = () => Date.now(),
  ) {}

  static assertSlot(slot: unknown): number {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)
      throw new Error(`Invalid save slot: ${String(slot)}`);
    return slot;
  }

  static assertBackup(kind: unknown): BackupKind {
    if (kind === undefined) return 'bak';
    if (!BACKUP_KINDS.includes(kind as BackupKind)) throw new Error(`Invalid backup: ${String(kind)}`);
    return kind as BackupKind;
  }

  pathFor(slot: number, kind: 'save' | BackupKind = 'save'): string {
    const n = SaveStore.assertSlot(slot) + 1;
    return join(this.dir, kind === 'save' ? `slot-${n}.json` : `slot-${n}.${kind}.json`);
  }

  async list(): Promise<SlotInfo[]> {
    const out: SlotInfo[] = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const at = await mtimeOrNull(this.pathFor(slot));
      out.push({ slot, exists: at !== null, modifiedMs: at });
    }
    return out;
  }

  read(slot: number): Promise<string | null> {
    return readOrNull(this.pathFor(slot));
  }

  /** A backup (`bak`, the save before the last write, or `old`, an older one), or null. */
  async readBackup(slot: number, kind: BackupKind = 'bak'): Promise<string | null> {
    return readOrNull(this.pathFor(slot, SaveStore.assertBackup(kind)));
  }

  /** Back up the current save if it loads, then replace it atomically. */
  write(slot: number, data: unknown): Promise<void> {
    const target = this.pathFor(slot);
    if (typeof data !== 'string') return Promise.reject(new Error('Save data must be a string'));
    if (data.length > MAX_SAVE_CHARS)
      return Promise.reject(new Error(`Save data is too large (${data.length} chars)`));
    const incoming = this.check(data);
    if (!incoming.ok) return Promise.reject(new Error(`Save data does not load: ${incoming.reason}`));
    return this.serial(slot, () => this.replace(slot, target, data));
  }

  private async replace(slot: number, target: string, data: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const current = await readOrNull(target);
    if (current !== null) {
      const verdict = current === this.written.get(slot) ? ({ ok: true } as const) : this.check(current);
      if (!verdict.ok && verdict.newer)
        throw new Error(`Slot ${slot + 1} holds a save from a newer game; it is left alone`);
      if (verdict.ok) {
        const old = this.pathFor(slot, 'old');
        const oldAt = await mtimeOrNull(old);
        if (!this.refreshed.has(slot) || oldAt === null || this.now() - oldAt > OLD_BACKUP_MAX_AGE_MS) {
          await copyAtomic(target, old, current);
          this.refreshed.add(slot);
        }
        await copyAtomic(target, this.pathFor(slot, 'bak'), current);
      }
    }
    await writeAtomic(target, data, this.beforeRename);
    this.written.set(slot, data);
  }

  /**
   * The save will not load, but backup `from` does: set the save aside as
   * `slot-N.corrupt-K.json` and put the backup in its place. Returns the
   * backup's text, or null (and changes nothing) if that backup is missing
   * or does not load either.
   */
  recover(slot: number, from: BackupKind = 'bak'): Promise<string | null> {
    SaveStore.assertSlot(slot);
    const kind = SaveStore.assertBackup(from);
    return this.serial(slot, () => this.restore(slot, kind));
  }

  private async restore(slot: number, kind: BackupKind): Promise<string | null> {
    const backup = await this.readBackup(slot, kind);
    if (backup === null || !this.check(backup).ok) return null;
    const target = this.pathFor(slot);
    await mkdir(this.dir, { recursive: true });
    await this.quarantine(slot, 'corrupt', [['save', '']]);
    await writeAtomic(target, backup);
    this.written.set(slot, backup);
    return backup;
  }

  /**
   * Move a whole slot (the save and both backups) aside as
   * `slot-N.aside-K*.json`, leaving it empty. Nothing is deleted: this is
   * for a slot that will not open (broken, or from a newer game).
   */
  setAside(slot: number): Promise<void> {
    SaveStore.assertSlot(slot);
    return this.serial(slot, async () => {
      await this.quarantine(slot, 'aside', [
        ['save', ''],
        ['bak', '.bak'],
        ['old', '.old'],
      ]);
      this.forget(slot);
    });
  }

  /** Delete a slot: the save and its backups. Anything set aside stays. */
  remove(slot: number): Promise<void> {
    SaveStore.assertSlot(slot);
    return this.serial(slot, async () => {
      for (const kind of ['save', 'bak', 'old'] as const) await rm(this.pathFor(slot, kind), { force: true });
      this.forget(slot);
    });
  }

  /** Clean up temp files left by a crash mid-write. */
  async sweep(): Promise<void> {
    try {
      for (const name of await readdir(this.dir))
        if (name.endsWith('.tmp')) await rm(join(this.dir, name), { force: true });
    } catch {
      // Directory does not exist yet.
    }
  }

  /** Run changes to one slot one after another, so a backup is always of the save just checked. */
  private serial<T>(slot: number, fn: () => Promise<T>): Promise<T> {
    const run = (this.queue.get(slot) ?? Promise.resolve()).then(fn, fn);
    this.queue.set(
      slot,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private forget(slot: number): void {
    this.written.delete(slot);
    this.refreshed.delete(slot);
  }

  /**
   * Rename the slot's files (those that exist) to `slot-N.<tag>-K<suffix>.json`,
   * with K one past any already there, so nothing set aside is overwritten.
   */
  private async quarantine(
    slot: number,
    tag: string,
    files: readonly (readonly ['save' | BackupKind, string])[],
  ): Promise<void> {
    const n = slot + 1;
    const pattern = new RegExp(`^slot-${n}\\.${tag}-(\\d+)[.]`);
    let k = 1;
    try {
      for (const name of await readdir(this.dir)) {
        const m = pattern.exec(name);
        if (m) k = Math.max(k, Number(m[1]) + 1);
      }
    } catch {
      // Directory does not exist yet: nothing to move.
      return;
    }
    let moved = false;
    for (const [kind, suffix] of files) {
      try {
        await rename(this.pathFor(slot, kind), join(this.dir, `slot-${n}.${tag}-${k}${suffix}.json`));
        moved = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
    if (moved) await syncDir(this.dir);
  }
}
