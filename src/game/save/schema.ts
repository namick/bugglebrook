import type { BugBrain, EntityKind } from '../core/entities';
import type { RngState } from '../core/rng';
import type { BodyState } from '../physics/physics';
import type { EnvState } from '../systems/environment';
import type { PocketState } from '../systems/pocket';
import type { TagState } from '../systems/tags';

/** Bump when the save shape changes, and add a migration in migrations.ts. */
export const SAVE_VERSION = 6;

export interface SavedEntity {
  id: number;
  kind: EntityKind;
  defId: string;
  body: BodyState;
  bug?: BugBrain;
  /** Tag changes from the defaults. */
  tags?: TagState;
  /** Ticks soaking, for paper that goes soggy. */
  soak?: number;
}

/** Everything needed to rebuild the sim exactly where it was left. */
export interface WorldSave {
  seed: string;
  tick: number;
  rng: RngState;
  nextId: number;
  entities: SavedEntity[];
  /** Water, the hose, ice, welds, lily pads, weather. Absent in saves before version 4. */
  env?: EnvState;
  /** How play has changed bug-pair affinity. Absent in saves before version 5. */
  social?: { affinity: Record<string, number> };
  /** The pocket tray's six slots. Absent in saves before version 6. */
  pocket?: PocketState;
  /** Counts kept for the menu's slot badge. Absent in saves before version 6. */
  counters?: WorldCounters;
}

/** Running counts about how the world has been played. */
export interface WorldCounters {
  /** Times the player fed each bug, by bug def ID. The most-fed bug is the slot's badge. */
  fed: Record<string, number>;
}

/** What the menu shows for a slot. The sim never reads this. */
export interface SaveMeta {
  /** When the slot was first saved (ISO time, from the caller). */
  createdAt: string;
  /** A 320x180 picture of the camera view at the last save, as an image data URL, or null. */
  thumb: string | null;
}

/** Render-side state that should persist (camera position, etc.). */
export interface ViewSave {
  cameraX: number;
}

export interface SaveFile {
  version: typeof SAVE_VERSION;
  /** ISO timestamp supplied by the caller; the sim never reads the clock. */
  savedAt: string;
  world: WorldSave;
  view: ViewSave;
  meta: SaveMeta;
}
