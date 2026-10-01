import type { BugBrain, EntityKind } from '../core/entities';
import type { RngState } from '../core/rng';
import type { BodyState } from '../physics/physics';
import type { EnvState } from '../systems/environment';
import type { PocketState } from '../systems/pocket';
import type { SkyState } from '../systems/sky';
import type { TagState } from '../systems/tags';
import type { BarrierState } from '../systems/barriers';
import type { PlaceState } from '../systems/places';
import type { BenchState } from '../systems/bench';
import type { CauldronState } from '../systems/cauldron';
import type { Brew } from '../systems/brewing';
import type { ActiveEffect, SavedPart, ToyState } from '../core/entities';

/** Bump when the save shape changes, and add a migration in migrations.ts. */
export const SAVE_VERSION = 9;

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
  /** Paint colors on it. */
  paint?: string[];
  /** Snapped onto the pegboard. */
  pinned?: boolean;
  /** Bites taken out of a leaf. */
  bites?: number;
  /** What went into a crafted thing or a junk blob (version 9). */
  parts?: SavedPart[];
  /** A potion bottle's brew (version 9). */
  brew?: Brew;
  /** Potion effects working on it (version 9). */
  effects?: ActiveEffect[];
  /** Toasted by heat (version 9). */
  toasted?: boolean;
  /** A crafted toy's state (version 9). */
  toy?: ToyState;
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
  /**
   * The clock and the weather. Absent in saves before version 7: those
   * worlds start at 09:00 in clear weather.
   */
  sky?: SkyState;
  /** Secrets found, in order. Absent in saves before version 7. */
  secrets?: string[];
  /** Which areas are open, and the bucket lift. Absent in saves before version 8. */
  barriers?: BarrierState;
  /** The M7 areas' fixtures: lights, the lamp, the heap, the claw, and so on. Absent before version 8. */
  places?: PlaceState;
  /**
   * Areas whose starting things are in the world. Areas added to the game
   * later are built when an older save loads. Absent before version 8.
   */
  built?: string[];
  /** The Tinker Bench: its trays, recipes made, and hints. Absent before version 9. */
  bench?: BenchState;
  /** The cauldron: what is in it and how far it is stirred. Absent before version 9. */
  cauldron?: CauldronState;
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
