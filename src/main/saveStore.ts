import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_SAVE_CHARS, SLOT_COUNT } from '../shared/ipc';
import type { SlotInfo } from '../shared/ipc';

/**
 * Write text to `path` atomically: into `path.tmp`, flushed to disk, then
 * renamed over `path`. A crash at any point leaves either the old file or
 * the new one, never half of either. `beforeRename` lets tests abort at the
 * worst moment.
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
}

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

function parses(text: string | null): boolean {
  if (text === null) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stores save slots as JSON files in one directory. Main process only.
 *
 * - `slot-N.json` is the save. Writes are atomic (see `writeAtomic`).
 * - `slot-N.bak.json` is the save before the last write. It is only ever
 *   replaced by a save that parsed, so a corrupt file never pushes out a
 *   good backup.
 * - `recover` sets a save that will not load aside as `slot-N.corrupt.json`
 *   and puts the backup back in its place.
 *
 * Validates everything that crosses IPC: slot numbers, payload type, size,
 * and that the payload parses as JSON. It does not understand the save
 * format; the renderer's sim code owns that.
 */
export class SaveStore {
  /** Tests set this to abort a write between the temp file and the rename. */
  beforeRename: (() => Promise<void> | void) | undefined;

  constructor(readonly dir: string) {}

  static assertSlot(slot: unknown): number {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)
      throw new Error(`Invalid save slot: ${String(slot)}`);
    return slot;
  }

  pathFor(slot: number, kind: 'save' | 'bak' | 'corrupt' = 'save'): string {
    const n = SaveStore.assertSlot(slot) + 1;
    return join(this.dir, kind === 'save' ? `slot-${n}.json` : `slot-${n}.${kind}.json`);
  }

  async list(): Promise<SlotInfo[]> {
    const out: SlotInfo[] = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      try {
        const s = await stat(this.pathFor(slot));
        out.push({ slot, exists: true, modifiedMs: s.mtimeMs });
      } catch {
        out.push({ slot, exists: false, modifiedMs: null });
      }
    }
    return out;
  }

  read(slot: number): Promise<string | null> {
    return readOrNull(this.pathFor(slot));
  }

  /** The save as it was before the last write, or null. */
  readBackup(slot: number): Promise<string | null> {
    return readOrNull(this.pathFor(slot, 'bak'));
  }

  /** Back up the current save, then replace it atomically. */
  async write(slot: number, data: unknown): Promise<void> {
    const target = this.pathFor(slot);
    if (typeof data !== 'string') throw new Error('Save data must be a string');
    if (data.length > MAX_SAVE_CHARS) throw new Error('Save data is too large');
    JSON.parse(data); // throws on malformed JSON
    await mkdir(this.dir, { recursive: true });
    const current = await readOrNull(target);
    if (parses(current)) await writeAtomic(this.pathFor(slot, 'bak'), current!);
    await writeAtomic(target, data, this.beforeRename);
  }

  /**
   * The save will not load: move it aside as `slot-N.corrupt.json` and
   * restore the backup in its place. Returns the backup's text, or null if
   * there is none (the slot is then empty).
   */
  async recover(slot: number): Promise<string | null> {
    const target = this.pathFor(slot);
    await mkdir(this.dir, { recursive: true });
    try {
      await rename(target, this.pathFor(slot, 'corrupt'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const backup = await this.readBackup(slot);
    if (backup === null) return null;
    await copyFile(this.pathFor(slot, 'bak'), `${target}.tmp`);
    await rename(`${target}.tmp`, target);
    return backup;
  }

  /** Delete a slot: the save, its backup, and anything set aside. */
  async remove(slot: number): Promise<void> {
    for (const kind of ['save', 'bak', 'corrupt'] as const)
      await rm(this.pathFor(slot, kind), { force: true });
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
}
