import type { EntityId, EntityKind } from './core/entities';

/**
 * Every game event and its payload. Audio, particles, and the journal
 * subscribe to these; the sim never depends on who is listening.
 * Names are snake_case, past tense. Positions are world meters.
 */
export interface GameEvents {
  entity_spawned: { id: EntityId; kind: EntityKind; defId: string };
  entity_removed: { id: EntityId };
  item_grabbed: { id: EntityId; kind: EntityKind; defId: string; x: number; y: number };
  /** Let go. `flung` is true at or above FLING_SPEED. Velocity is the release velocity. */
  item_dropped: {
    id: EntityId;
    kind: EntityKind;
    defId: string;
    speed: number;
    vx: number;
    vy: number;
    flung: boolean;
  };
  /** A quick click on an item made it hop. */
  item_poked: { id: EntityId; defId: string; x: number; y: number };
  /** A consumable dropped back into the area. */
  item_respawned: { id: EntityId; defId: string; x: number; y: number };
  /** Something hit something hard. `id` is the entity that got bonked. */
  bonked: { id: EntityId; kind: EntityKind; defId: string; speed: number; x: number; y: number };
  /** A spring launched something off its top. */
  spring_bounced: { id: EntityId; targetId: EntityId; x: number; y: number };
  bug_poked: { id: EntityId; defId: string; x: number; y: number };
  /** Back on its feet after being airborne. `speed` is the hardest impact. */
  bug_landed: { id: EntityId; defId: string; speed: number; x: number; y: number };
  bug_dizzy: { id: EntityId; defId: string; speed: number; durationTicks: number };
  bug_recovered: { id: EntityId; defId: string };
  /** A bug picked something to go and do. */
  bug_chose_action: { id: EntityId; defId: string; action: 'eat' | 'bounce'; targetId: EntityId };
  bug_hopped: { id: EntityId; defId: string; x: number; y: number };
  bug_ate: {
    id: EntityId;
    defId: string;
    itemId: EntityId;
    itemDefId: string;
    liking: Liking;
    x: number;
    y: number;
  };
  /** A bug finished using a toy (the spring). */
  bug_used: { id: EntityId; defId: string; targetId: EntityId; action: 'bounce' };
}

export type Liking = 'loved' | 'liked' | 'neutral' | 'disliked';

export type GameEventName = keyof GameEvents;
