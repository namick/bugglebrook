import { SAVE_VERSION, loadSaveFile } from '../../../game';
import type { SaveFile, Sim, ViewSave } from '../../../game';
import type { BugglebrookApi, SlotInfo } from '../../../shared/ipc';

export interface SlotSummary extends SlotInfo {
  /** Parsed save if the slot holds a readable one. */
  save: SaveFile | null;
}

/** Reads and writes save slots through the preload API. */
export class SaveService {
  constructor(
    private readonly api: BugglebrookApi['saves'],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<SlotSummary[]> {
    const infos = await this.api.list();
    return Promise.all(
      infos.map(async (info) => ({ ...info, save: info.exists ? await this.load(info.slot) : null })),
    );
  }

  /** Load a slot. Returns null if it is empty or unreadable. */
  async load(slot: number): Promise<SaveFile | null> {
    const raw = await this.api.read(slot);
    if (raw === null) return null;
    try {
      return loadSaveFile(raw);
    } catch (err) {
      console.error(`Save slot ${slot} is unreadable`, err);
      return null;
    }
  }

  async save(slot: number, sim: Sim, view: ViewSave): Promise<SaveFile> {
    const file: SaveFile = {
      version: SAVE_VERSION,
      savedAt: this.now().toISOString(),
      world: sim.serialize(),
      view,
    };
    await this.api.write(slot, JSON.stringify(file));
    return file;
  }

  remove(slot: number): Promise<void> {
    return this.api.remove(slot);
  }
}
