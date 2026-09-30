import type { BugBrain, EntityId, SocialKind } from '../core/entities';
import type { Rng } from '../core/rng';
import type { AdvertAction, BugDef, NeedId } from '../data/types';
import type { ChatTopic, Fidget, ReactionType, Liking } from '../events';
import type { BodyState, Vec } from '../physics/physics';

/**
 * Places that advertise something without being an entity. They use
 * negative IDs so they can sit in `used` and `memory` next to entity IDs.
 */
export const SPOT_SLEEP_HERE = -1;
export const SPOT_WATER = -2;
export const SPOT_TOP = -3;
export const SPOT_CAMERA = -4;

/** Something a bug could go and do, offered by an object, another bug, or a spot nearby. */
export interface AdvertCandidate {
  /** The entity offering it, or a SPOT_* ID for a place. */
  id: EntityId;
  /** Item or bug def, or '' for a spot. */
  defId: string;
  x: number;
  y: number;
  action: AdvertAction | SocialKind;
  needs: Readonly<Partial<Record<NeedId, number>>>;
  /** Another bug is already on its way to it. */
  claimed: boolean;
  /** Just brought in by the player: bugs want to come and sniff it. */
  fresh?: boolean;
  /** The toy or snack a social advert is about (catch, share). */
  item?: EntityId | null;
  /** Used instead of the like multiplier (affinity for social adverts). */
  like?: number;
  /** Added after the multipliers (a dizzy friend to comfort). */
  bonus?: number;
}

/** Where a target entity is right now. */
export interface TargetInfo {
  defId: string;
  kind?: 'bug' | 'item';
  x: number;
  y: number;
  /** Half its width, so a bug can stand beside it. */
  halfWidth: number;
  /** Half its height. */
  halfHeight: number;
  /** Rotation in radians. */
  angle: number;
  held: boolean;
}

/** Another bug, as a bug's AI sees it. `brain` is live: social play updates both sides. */
export interface OtherBug {
  id: EntityId;
  defId: string;
  def: BugDef;
  brain: BugBrain;
  x: number;
  y: number;
  vx: number;
  vy: number;
  supported: boolean;
  held: boolean;
}

/** A loose thing lying about that bugs may pick up (never a player setup). */
export interface LooseItem {
  id: EntityId;
  defId: string;
  x: number;
  y: number;
  speed: number;
  edible: boolean;
  catchable: boolean;
  /** Half its width, and the y of its top edge. */
  halfWidth: number;
  top: number;
}

/** What a bug's AI can ask about the world beyond its own body. */
export interface BugWorld {
  /** Every awake bug, in ID order. */
  bugs(): readonly OtherBug[];
  bug(id: EntityId): OtherBug | null;
  /** Is part of a player setup (other than `except`) within `reach` of x at about height y? */
  setupNear(x: number, y: number, reach: number, except?: EntityId | null): boolean;
  /** Is any player setup between x0 and x1? */
  setupBetween(x0: number, x1: number): boolean;
  /** Loose things bugs may pick up: never player setups, held things, or mouthfuls. */
  loose(): readonly LooseItem[];
  /** Is this item a player setup right now? */
  isSetup(id: EntityId): boolean;
  /** Is this item def food? */
  edible(defId: string): boolean;
  /** How much two bug defs like each other, -1 to 1. */
  affinity(a: string, b: string): number;
  /** Is there a slime trail under this point? */
  slimeAt(x: number, y: number): boolean;
  surfaceY(x: number): number;
  /** What the camera shows, or null when nobody is watching (tests). */
  view: { x0: number; x1: number } | null;
  /** The flat top of the highest ground in the area around x (the stump top). */
  summit(x: number): { x0: number; x1: number; y: number } | null;
  /** The dry edge nearest x where a bug can hop into water, and which way the water is. */
  waterEdge(x: number): { x: number; dir: 1 | -1 } | null;
  /** Something low to duck behind near x, on the far side from `fromX`. */
  cover(x: number, fromX: number): { id: EntityId; x: number } | null;
}

export interface BugContext {
  tick: number;
  /** The bug's own entity ID. */
  id?: EntityId;
  def: BugDef;
  state: BodyState;
  held: boolean;
  /** Upward normal of what the bug stands on, or null when not supported. */
  support: Vec | null;
  /** Hardest impact on the bug during the last step, m/s, or 0. */
  impact: number;
  worldWidth: number;
  rng: Rng;
  adverts: () => AdvertCandidate[];
  target: (id: EntityId) => TargetInfo | null;
  /** What is pressing against the bug on that side, if anything. */
  obstacle: (dir: 1 | -1) => Obstacle | null;
  /** Food the player is holding, if any: nearby bugs stop and turn to it. */
  offered?: { x: number; y: number } | null;
  /** Fraction of the bug under water, 0 to 1. */
  submerged?: number;
  /** Open water (not ice or a lily pad) under world x. */
  overWater?: (x: number) => boolean;
  /** Where the nearest dry land is from here, for a swimming bug. */
  shore?: number | null;
  /** Frozen in a block of ice: it cannot move. */
  frozen?: boolean;
  /** Its home area's x range: wandering drifts back there. */
  home?: { x0: number; x1: number } | null;
  /** The rest of the world. Tests may leave it out. */
  world?: BugWorld;
}

export interface Obstacle {
  id: EntityId;
  isBug: boolean;
  /** y of its top edge. */
  top: number;
  /** Part of a player setup: never push it or hop onto it. */
  setup?: boolean;
}

/** Things the sim turns into game events. `by` names another bug the notice is about. */
export type BugNotice = (
  | { type: 'landed'; speed: number }
  | { type: 'dizzy'; speed: number; durationTicks: number }
  | { type: 'recovered' }
  | { type: 'chose'; action: AdvertAction | SocialKind; targetId: EntityId | null }
  | { type: 'hopped' }
  | { type: 'reacted'; reaction: ReactionType; variant: number }
  | { type: 'burped' }
  | { type: 'tickled'; level: number }
  | { type: 'swam' }
  | { type: 'shook_dry' }
  | { type: 'used'; action: AdvertAction; targetId: EntityId | null }
  | { type: 'inspected'; itemId: EntityId }
  | { type: 'social'; partnerId: EntityId; kind: SocialKind }
  | { type: 'social_end'; partnerId: EntityId; kind: SocialKind; happy: boolean }
  | { type: 'chatted'; partnerId: EntityId; topic: ChatTopic; about: string | null }
  | { type: 'bumped'; partnerId: EntityId }
  | { type: 'tagged'; partnerId: EntityId }
  | { type: 'shared'; partnerId: EntityId; itemId: EntityId }
  | { type: 'snatched'; partnerId: EntityId; itemId: EntityId }
  | { type: 'comforted'; partnerId: EntityId }
  | { type: 'gawked'; x: number; y: number }
  | { type: 'rode'; mountId: EntityId; on: boolean }
  | { type: 'slept' }
  | { type: 'woke'; early: boolean }
  | { type: 'posed' }
  | { type: 'fidgeted'; fidget: Fidget }
  | { type: 'slipped' }
  | { type: 'curled'; on: boolean }
  | { type: 'hid'; coverId: EntityId | null; on: boolean }
  | { type: 'affinity'; partnerId: EntityId; delta: number }
) & { by?: EntityId };

export interface BugDecision {
  /** Velocity to set on the body, or null to leave physics alone. */
  velocity: Vec | null;
  /** The bug finished eating this item. */
  eat: { itemId: EntityId; liking: Liking } | null;
  /** Put this item in the bug's mouth: it starts chewing. */
  take: { itemId: EntityId; liking: Liking } | null;
  /** Spit this item back out. */
  spit: { itemId: EntityId } | null;
  /** Tickled too long: wriggle out of the player's hand. */
  wriggle: boolean;
  /** Throw what it was carrying to a friend. */
  throw: { itemId: EntityId; vx: number; vy: number; to: EntityId } | null;
  notices: BugNotice[];
}

/** A world with nothing else in it, for tests that only look at one bug. */
export const EMPTY_WORLD: BugWorld = {
  bugs: () => [],
  bug: () => null,
  setupNear: () => false,
  setupBetween: () => false,
  loose: () => [],
  isSetup: () => false,
  edible: () => false,
  affinity: () => 0.1,
  slimeAt: () => false,
  surfaceY: () => 9,
  view: null,
  summit: () => null,
  waterEdge: () => null,
  cover: () => null,
};
