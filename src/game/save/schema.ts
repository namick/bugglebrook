import type { BugBrain, EntityKind } from '../core/entities';
import type { RngState } from '../core/rng';
import type { BodyState } from '../physics/physics';

/** Bump when the save shape changes, and add a migration in migrations.ts. */
export const SAVE_VERSION = 2;

export interface SavedEntity {
  id: number;
  kind: EntityKind;
  defId: string;
  body: BodyState;
  bug?: BugBrain;
}

/** Everything needed to rebuild the sim exactly where it was left. */
export interface WorldSave {
  seed: string;
  tick: number;
  rng: RngState;
  nextId: number;
  entities: SavedEntity[];
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
