import type { ReactionType } from '../events';

export type EntityId = number;
export type EntityKind = 'bug' | 'item';

/**
 * Bug states, named as in the game design doc (section 5). Only the M1
 * subset exists so far.
 */
export type BugMode =
  | 'st_idle'
  | 'st_wander'
  | 'st_seek'
  | 'st_use'
  | 'st_eat'
  | 'st_react'
  | 'st_held'
  | 'st_airborne'
  | 'st_landing'
  | 'st_dizzy'
  | 'st_recover';

export const BUG_MODES: readonly BugMode[] = [
  'st_idle',
  'st_wander',
  'st_seek',
  'st_use',
  'st_eat',
  'st_react',
  'st_held',
  'st_airborne',
  'st_landing',
  'st_dizzy',
  'st_recover',
];

export interface Needs {
  need_hunger: number;
  need_fun: number;
  need_energy: number;
}

/** Bug AI state. Plain data so it serializes as-is. */
export interface BugBrain {
  mode: BugMode;
  /** Ticks left in the current mode, for modes that time out. */
  timer: number;
  /** World x the bug is walking toward. */
  targetX: number;
  /** Entity the bug is seeking or using, if any. */
  targetId: EntityId | null;
  /** What it will do with the target. */
  action: 'eat' | 'bounce' | null;
  facing: 1 | -1;
  /** 0 to 100; 100 is fully satisfied. */
  needs: Needs;
  /** Ticks until the bug next scores what to do. */
  decideIn: number;
  /** Hardest impact since it left the ground, m/s. */
  airPeak: number;
  /** Airborne by its own hop or bounce, so the landing never makes it dizzy. */
  selfLaunched: boolean;
  /** Tick of the last hard landing, or -1. Repeats within 10 s stack dizziness. */
  lastHardLanding: number;
  dizzyStreak: number;
  /** Length of the current dizzy spell in ticks, for the renderer. */
  dizzyTicks: number;
  /** Recent uses, newest last: novelty and repeat penalties read this. */
  used: { id: EntityId; tick: number }[];
  /** Ticks spent walking without getting anywhere. */
  stuck: number;
  /** Hop attempts at the current target. */
  tries: number;
  /** The current use has paid off (the spring launched it). */
  done: boolean;
  /** x at the previous tick, for stuck detection. */
  lastX: number;
  /** Food in the bug's mouth while it chews (st_eat), or null. */
  mouthful: EntityId | null;
  /** The latest reaction and the tick it started, for the renderer. */
  reaction: { type: ReactionType; variant: number; tick: number } | null;
  /** Last variant played per reaction type, so none repeats back to back. */
  variants: Partial<Record<ReactionType, number>>;
  /** Grumpy until this tick (after disliked food). */
  grumpyUntil: number;
  /** Tick of a burp that is on its way, or -1. */
  burpAt: number;
  /** Ticks spent being tickled while held, or 0. */
  tickle: number;
  /** Woozy from a shake until this tick. */
  woozyUntil: number;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  /** Content ID in the registry for this kind (bug or item). */
  defId: string;
  bug?: BugBrain;
}

/**
 * Owns every entity's non-physics state. Iteration order is ascending ID,
 * which is also creation order, so systems visit entities deterministically.
 */
export class EntityStore {
  private map = new Map<EntityId, Entity>();
  private nextIdValue = 1;

  get nextId(): EntityId {
    return this.nextIdValue;
  }

  set nextId(value: EntityId) {
    this.nextIdValue = value;
  }

  create(kind: EntityKind, defId: string, extra: Partial<Omit<Entity, 'id'>> = {}): Entity {
    const entity: Entity = { ...extra, id: this.nextIdValue++, kind, defId };
    this.map.set(entity.id, entity);
    return entity;
  }

  /** Insert an entity with a known ID (used when loading saves). */
  restore(entity: Entity): void {
    if (this.map.has(entity.id)) throw new Error(`Duplicate entity id ${entity.id}`);
    this.map.set(entity.id, entity);
    if (entity.id >= this.nextIdValue) this.nextIdValue = entity.id + 1;
  }

  remove(id: EntityId): boolean {
    return this.map.delete(id);
  }

  get(id: EntityId): Entity | undefined {
    return this.map.get(id);
  }

  has(id: EntityId): boolean {
    return this.map.has(id);
  }

  get size(): number {
    return this.map.size;
  }

  /** All entities, ascending by ID. */
  all(): Entity[] {
    return [...this.map.values()].sort((a, b) => a.id - b.id);
  }

  ofKind(kind: EntityKind): Entity[] {
    return this.all().filter((e) => e.kind === kind);
  }
}
