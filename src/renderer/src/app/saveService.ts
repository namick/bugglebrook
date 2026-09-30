import { SAVE_VERSION, loadSaveFile } from '../../../game';
import type { SaveFile, Sim, ViewSave } from '../../../game';
import type { BugglebrookApi, SlotInfo } from '../../../shared/ipc';

export interface SlotSummary extends SlotInfo {
  /** Parsed save if the slot holds a readable one. */
  save: SaveFile | null;
}

/** How a slot load went. */
export interface Loaded {
  save: SaveFile | null;
  /** The save would not load, so its backup was put back and loaded instead. */
  recovered: boolean;
}

/**
 * Reads and writes save slots through the preload API. A slot that will
 * not load (corrupt, cut short, from a broken build) is set aside by main
 * and its backup, the save before the last write, takes its place.
 */
export class SaveService {
  /** Why recent loads failed, newest last (the test hook shows these). */
  readonly problems: string[] = [];

  constructor(
    private readonly api: BugglebrookApi['saves'],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<SlotSummary[]> {
    const infos = await this.api.list();
    const out: SlotSummary[] = [];
    for (const info of infos) {
      const save = info.exists ? await this.load(info.slot) : null;
      out.push({ ...info, exists: save !== null, save });
    }
    return out;
  }

  /** Load a slot, recovering from its backup if needed. Null if it is empty or nothing is readable. */
  async load(slot: number): Promise<SaveFile | null> {
    return (await this.loadWithRecovery(slot)).save;
  }

  async loadWithRecovery(slot: number): Promise<Loaded> {
    const raw = await this.api.read(slot);
    if (raw === null) return { save: null, recovered: false };
    const main = this.parse(raw, slot, 'save');
    if (main) return { save: main, recovered: false };
    const backup = await this.api.recover(slot);
    const save = backup === null ? null : this.parse(backup, slot, 'backup');
    return { save, recovered: save !== null };
  }

  private parse(raw: string, slot: number, what: string): SaveFile | null {
    try {
      return loadSaveFile(raw);
    } catch (err) {
      console.warn(`Save slot ${slot} ${what} is unreadable`, err);
      this.problems.push(`slot ${slot} ${what}: ${err instanceof Error ? err.message : String(err)}`);
      if (this.problems.length > 20) this.problems.shift();
      return null;
    }
  }

  /**
   * Save a world. `createdAt` is kept from the slot's first save; `thumb`
   * is a picture of the camera view (see `thumbnail.ts`).
   */
  async save(
    slot: number,
    sim: Sim,
    view: ViewSave,
    meta: { createdAt?: string; thumb?: string | null } = {},
  ): Promise<SaveFile> {
    const savedAt = this.now().toISOString();
    const file: SaveFile = {
      version: SAVE_VERSION,
      savedAt,
      world: sim.serialize(),
      view,
      meta: { createdAt: meta.createdAt ?? savedAt, thumb: meta.thumb ?? null },
    };
    await this.api.write(slot, JSON.stringify(file));
    return file;
  }

  remove(slot: number): Promise<void> {
    return this.api.remove(slot);
  }
}
