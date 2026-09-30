import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_SAVE_CHARS, SLOT_COUNT } from '../shared/ipc';
import type { SlotInfo } from '../shared/ipc';

/**
 * Stores save slots as JSON files in one directory. Main process only.
 * Validates everything that crosses IPC: slot numbers, payload type, size,
 * and that the payload parses as JSON. It does not understand the save
 * format; the renderer's sim code owns that.
 */
export class SaveStore {
  constructor(readonly dir: string) {}

  static assertSlot(slot: unknown): number {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT)
      throw new Error(`Invalid save slot: ${String(slot)}`);
    return slot;
  }

  pathFor(slot: number): string {
    return join(this.dir, `slot-${SaveStore.assertSlot(slot) + 1}.json`);
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

  async read(slot: number): Promise<string | null> {
    try {
      return await readFile(this.pathFor(slot), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /** Write atomically: temp file, then rename over the old save. */
  async write(slot: number, data: unknown): Promise<void> {
    const target = this.pathFor(slot);
    if (typeof data !== 'string') throw new Error('Save data must be a string');
    if (data.length > MAX_SAVE_CHARS) throw new Error('Save data is too large');
    JSON.parse(data); // throws on malformed JSON
    await mkdir(this.dir, { recursive: true });
    const tmp = `${target}.tmp`;
    await writeFile(tmp, data, 'utf8');
    await rename(tmp, target);
  }

  async remove(slot: number): Promise<void> {
    await rm(this.pathFor(slot), { force: true });
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
