import type { EntityId, EntityKind } from './core/entities';

/**
 * Every game event and its payload. Audio, particles, and the journal
 * subscribe to these; the sim never depends on who is listening.
 * Names are snake_case, past tense.
 */
export interface GameEvents {
  entity_spawned: { id: EntityId; kind: EntityKind; defId: string };
  entity_removed: { id: EntityId };
  item_grabbed: { id: EntityId; kind: EntityKind; defId: string; x: number; y: number };
  item_dropped: { id: EntityId; kind: EntityKind; defId: string; speed: number };
  /** Something hit something hard. `id` is the entity that got bonked. */
  bonked: { id: EntityId; kind: EntityKind; defId: string; speed: number; x: number; y: number };
  bug_dizzy: { id: EntityId; defId: string };
}

export type GameEventName = keyof GameEvents;
