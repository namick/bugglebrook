import type { BugBrain, EntityKind } from '../core/entities';
import type { RngState } from '../core/rng';
import type { BodyState } from '../physics/physics';
import type { EnvState } from '../systems/environment';
import type { TagState } from '../systems/tags';

/** Bump when the save shape changes, and add a migration in migrations.ts. */
export const SAVE_VERSION = 5;

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
}
