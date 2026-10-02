import { PHOTO_KEEP, SAVE_VERSION, SaveTooNewError, loadSaveFile } from '../../../game';
import type { PhotoRecord, SaveFile, Sim, ViewSave } from '../../../game';
import type { BackupKind, BugglebrookApi, SlotInfo } from '../../../shared/ipc';

/**
 * Why a slot that holds a save will not open: it came from a newer build of
 * the game (`newer`), or neither it nor any backup loads (`broken`). Either
 * way the menu shows a padlock and nothing touches the files.
 */
export type SlotLock = 'newer' | 'broken';

export interface SlotSummary extends SlotInfo {
  /** Parsed save if the slot holds a readable one. */
  save: SaveFile | null;
  /** Set when the slot holds a save that will not open. */
  locked: SlotLock | null;
}

/** How a slot load went. */
export interface Loaded {
  save: SaveFile | null;
  /** The save would not load, so a backup that does was put back and loaded instead. */
  recovered: boolean;
  /** The slot holds a save that will not open; it was left exactly as it was. */
  locked: SlotLock | null;
}

/** Backups to try, newest first. */
const BACKUPS: readonly BackupKind[] = ['bak', 'old'];

/**
 * Reads and writes save slots through the preload API.
 *
 * A save that will not load is never thrown away. One from a newer game is
 * left alone (the slot shows a padlock until a newer game opens it). A
 * broken one is set aside by main only when a backup actually loads, and
 * that backup takes its place. When nothing loads, the slot stays locked and
 * its files stay as they are.
 */
export class SaveService {
  /** Why recent loads failed, newest last (the test hook shows these). */
  readonly problems: string[] = [];
  /** Called with each load problem, for the log file. */
  onProblem: ((text: string) => void) | null = null;

  constructor(
    private readonly api: BugglebrookApi['saves'],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<SlotSummary[]> {
    const infos = await this.api.list();
    const out: SlotSummary[] = [];
    for (const info of infos) {
      const loaded = info.exists ? await this.loadWithRecovery(info.slot) : null;
      const save = loaded?.save ?? null;
      const locked = loaded?.locked ?? null;
      out.push({ ...info, exists: save !== null || locked !== null, save, locked });
    }
    return out;
  }

  /** Load a slot, recovering from a backup if needed. Null if it is empty or will not open. */
  async load(slot: number): Promise<SaveFile | null> {
    return (await this.loadWithRecovery(slot)).save;
  }

  async loadWithRecovery(slot: number): Promise<Loaded> {
    const raw = await this.api.read(slot);
    if (raw === null) return { save: null, recovered: false, locked: null };
    const main = this.parse(raw, slot, 'save');
    if (main.save) return { save: main.save, recovered: false, locked: null };
    // From a newer game: nothing is wrong with it, and nothing may touch it.
    if (main.newer) return { save: null, recovered: false, locked: 'newer' };
    for (const from of BACKUPS) {
      const text = await this.api.readBackup(slot, from);
      if (text === null) continue;
      const backup = this.parse(text, slot, from);
      if (!backup.save) continue;
      // Only now, with a backup that loads, does main set the broken save aside.
      if ((await this.api.recover(slot, from)) === null) continue;
      this.report(`slot ${slot} recovered from its ${from} backup`);
      return { save: backup.save, recovered: true, locked: null };
    }
    return { save: null, recovered: false, locked: 'broken' };
  }

  private parse(raw: string, slot: number, what: string): { save: SaveFile | null; newer: boolean } {
    try {
      return { save: loadSaveFile(raw), newer: false };
    } catch (err) {
      console.warn(`Save slot ${slot} ${what} is unreadable`, err);
      this.report(`slot ${slot} ${what}: ${err instanceof Error ? err.message : String(err)}`);
      return { save: null, newer: err instanceof SaveTooNewError };
    }
  }

  private report(text: string): void {
    this.problems.push(text);
    if (this.problems.length > 20) this.problems.shift();
    this.onProblem?.(text);
  }

  /**
   * Save a world. `createdAt` is kept from the slot's first save; `thumb`
   * is a picture of the camera view (see `thumbnail.ts`).
   */
  async save(
    slot: number,
    sim: Sim,
    view: ViewSave,
    meta: { createdAt?: string; thumb?: string | null; photos?: readonly PhotoRecord[] } = {},
  ): Promise<SaveFile> {
    const savedAt = this.now().toISOString();
    const file: SaveFile = {
      version: SAVE_VERSION,
      savedAt,
      world: sim.serialize(),
      view,
      meta: {
        createdAt: meta.createdAt ?? savedAt,
        thumb: meta.thumb ?? null,
        // The last PHOTO_KEEP photos (game design doc, section 13), oldest first.
        ...(meta.photos && meta.photos.length > 0 ? { photos: meta.photos.slice(-PHOTO_KEEP) } : {}),
      },
    };
    await this.api.write(slot, JSON.stringify(file));
    return file;
  }

  /** Delete a slot. A locked one is moved aside instead: a save that will not open is never deleted. */
  remove(slot: number, locked: SlotLock | null = null): Promise<void> {
    return locked ? this.api.setAside(slot) : this.api.remove(slot);
  }
}
