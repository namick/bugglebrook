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
  /**
   * Food went into a bug's mouth and it started chewing. `byPlayer` is true
   * when the player dropped or threw it there.
   */
  bug_fed: {
    id: EntityId;
    defId: string;
    itemId: EntityId;
    itemDefId: string;
    liking: Liking;
    byPlayer: boolean;
  };
  /** A bug spat out food it dislikes. The item stays in the world. */
  bug_spat: {
    id: EntityId;
    defId: string;
    itemId: EntityId;
    itemDefId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  /** A big meal came back up as a burp. */
  bug_burped: { id: EntityId; defId: string; x: number; y: number };
  /**
   * A bug played a reaction. `variant` picks one of the reaction's animation
   * and voice variants; the same type never repeats a variant back to back.
   */
  bug_reacted: { id: EntityId; defId: string; reaction: ReactionType; variant: number };
  /** Held still and tickled. `level` rises 1, 2, 3 as the laughs escalate. */
  bug_tickled: { id: EntityId; defId: string; level: number };
  /** Tickled too long: the bug wriggled out of the player's hand. */
  bug_wriggled_free: { id: EntityId; defId: string; x: number; y: number };
  /** The player shook whatever they are holding. */
  item_shaken: { id: EntityId; kind: EntityKind; defId: string; x: number; y: number };
}

export type Liking = 'loved' | 'liked' | 'neutral' | 'disliked';

/**
 * Reactions to the player (game design doc, section 5). Each has at least
 * three variants. `land_hard` is for bugs that never get dizzy (Glorp).
 */
export type ReactionType =
  | 'grab'
  | 'poke'
  | 'fling'
  | 'land'
  | 'land_hard'
  | 'tickle'
  | 'fed_loved'
  | 'fed_liked'
  | 'fed_neutral'
  | 'fed_disliked';

export const REACTION_TYPES: readonly ReactionType[] = [
  'grab',
  'poke',
  'fling',
  'land',
  'land_hard',
  'tickle',
  'fed_loved',
  'fed_liked',
  'fed_neutral',
  'fed_disliked',
];

/** Variants per reaction type. */
export const REACTION_VARIANTS = 3;

/** Mood, derived from needs and recent events (game design doc, section 5). */
export type Mood =
  'mood_happy' | 'mood_content' | 'mood_bored' | 'mood_hungry' | 'mood_sleepy' | 'mood_grumpy';

export type GameEventName = keyof GameEvents;
