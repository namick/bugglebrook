export type EntityId = number;
export type EntityKind = 'bug' | 'item';

export type BugMode = 'idle' | 'walk' | 'held' | 'tumble' | 'dizzy';

/** Bug AI state. Plain data so it serializes as-is. */
export interface BugBrain {
  mode: BugMode;
  /** Ticks left in the current mode (idle and dizzy count down). */
  timer: number;
  /** World x the bug is walking toward. */
  targetX: number;
  facing: 1 | -1;
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
