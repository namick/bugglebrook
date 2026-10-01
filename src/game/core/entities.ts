import type { AdvertAction, PendingState, PotionEffect } from '../data/types';
import type { Brew } from '../systems/brewing';
import type { ReactionType } from '../events';
import type { TagState } from '../systems/tags';

export type EntityId = number;
export type EntityKind = 'bug' | 'item';

/**
 * Bug states, named as in the game design doc (section 5). `st_pocketed`
 * is a bug in the pocket tray: out of the world, needs frozen.
 */
export type BugMode =
  | 'st_idle'
  | 'st_wander'
  | 'st_seek'
  | 'st_use'
  | 'st_social'
  | 'st_eat'
  | 'st_sleep'
  | 'st_react'
  | 'st_held'
  | 'st_airborne'
  | 'st_landing'
  | 'st_dizzy'
  | 'st_recover'
  | 'st_swim'
  | 'st_rolled'
  | 'st_hide'
  | 'st_ride'
  | 'st_perform'
  | 'st_pocketed';

export const BUG_MODES: readonly BugMode[] = [
  'st_idle',
  'st_wander',
  'st_seek',
  'st_use',
  'st_social',
  'st_eat',
  'st_sleep',
  'st_react',
  'st_held',
  'st_airborne',
  'st_landing',
  'st_dizzy',
  'st_recover',
  'st_swim',
  'st_rolled',
  'st_hide',
  'st_ride',
  'st_perform',
  'st_pocketed',
];

export interface Needs {
  need_hunger: number;
  need_fun: number;
  need_energy: number;
  need_social: number;
  need_clean: number;
}

/**
 * Things bugs do together (game design doc, section 5, "Bug to bug
 * interactions"). `soc_catch` and `soc_steal` are how "playing together" and
 * snack snatching show up with the toys and food the world has so far;
 * `soc_ride` is Boing sitting on another bug's head.
 */
export type SocialKind =
  | 'soc_chat'
  | 'soc_bump'
  | 'soc_tag'
  | 'soc_share_food'
  | 'soc_catch'
  | 'soc_comfort'
  | 'soc_steal'
  | 'soc_ride';

export const SOCIAL_KINDS: readonly SocialKind[] = [
  'soc_chat',
  'soc_bump',
  'soc_tag',
  'soc_share_food',
  'soc_catch',
  'soc_comfort',
  'soc_steal',
  'soc_ride',
];

/** What a bug is going to do or doing: an advert's action or a social interaction. */
export type BugAction = AdvertAction | SocialKind;

/**
 * One side of an interaction between two bugs. Both bugs hold a copy with
 * their own role. Before it starts, the initiator may be fetching a toy or
 * a snack (`stage` 0) or walking over (`stage` 1).
 */
export interface SocialState {
  kind: SocialKind;
  partner: EntityId;
  /** `lead` started it. In tag and snatching, `lead` is the one running. */
  role: 'lead' | 'follow';
  /** 0 fetching, 1 walking over, 2 playing. */
  stage: number;
  /** Exchanges, throws, or tags so far. */
  count: number;
  /** How many exchanges or throws to play. */
  goal: number;
  /** Ticks left in the current beat. */
  beat: number;
  /** Ticks left before the whole thing ends. */
  left: number;
  /** The toy or snack involved, if any. */
  item: EntityId | null;
  /** The last chat topic, so the reply can answer it. */
  last: string | null;
}

/** A notable moment with a thing or a bug. Memory fades over 120 s. */
export interface Memory {
  id: EntityId;
  good: boolean;
  tick: number;
}

/**
 * What a bug in a sleeping area is up to (game design doc, section 5,
 * "Off-screen simulation"). Where it will be and what it will be doing when
 * its area wakes.
 */
export interface CoarsePlan {
  kind: 'rest' | 'sleep' | 'wander' | 'eat' | 'play' | 'visit' | 'home';
  /** Where it is now, in world x (the body stays put until the area wakes). */
  at: number;
  /** Where it is heading. */
  x: number;
  /** A thing or bug it is heading for, or null. */
  targetId: EntityId | null;
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
  action: BugAction | null;
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
  /** Tick of the last stink reaction, or -1. Bugs react to a smell at most every few seconds. */
  smelledAt: number;
  /** Tick of an involuntary hop on its way (after bouncy food), or -1. */
  hopAt: number;
  /** Something held in the front legs (a pebble, a toy, a snack), or null. */
  carrying: EntityId | null;
  /** What it carries is held up overhead as an umbrella against the rain. Absent before M6. */
  umbrella?: boolean;
  /** The interaction with another bug under way, if any. */
  social: SocialState | null;
  /** The last few notable moments, newest last. */
  memory: Memory[];
  /** Things it has sniffed already (inspect is once per thing). */
  inspected: EntityId[];
  /** Woken up and groggy until this tick. */
  groggyUntil: number;
  /** Woken early: nods off again at this tick if still tired, or -1. */
  napAt: number;
  /** Recent pokes (ticks), for curling up after three quick ones. */
  pokes: number[];
  /** Gliding down on open wings (Dot leaping off the stump). */
  gliding: boolean;
  /** Tick of the next idle fidget (a hum, a yawn, a look around). */
  fidgetAt: number;
  /** Tick of the last slip on a slime trail. */
  slippedAt: number;
  /** Where it drifts back to when resting, for pebble rows (world x). */
  restX: number;
  /** Off-screen plan while its area sleeps, or null. */
  plan: CoarsePlan | null;
  /** The mode to go back to after a hop on the way somewhere, or null. */
  resume: BugMode | null;
  /** A hopper (Boing) may take its next hop at this tick. */
  hopReady: number;
  /** Tick the player last grabbed or poked it, or -1. */
  touchedAt: number;
  /** Highest point (smallest y) since it last left the ground. */
  airTop: number;
  /** Bugs that turned to look at its last crash; it may laugh along. */
  audience: number;
  /**
   * A hidden bug waiting to be found (M7): stuck on its back, ignoring
   * everyone, or disguised as a twig. Absent once it has joined.
   */
  pending?: PendingState;
  /** Twig's next peek (tick), and until when his eyes are open. */
  blinkAt?: number;
  eyesUntil?: number;
  /** Munch's form: a caterpillar (absent), a cocoon, or a butterfly. */
  form?: 'cocoon' | 'butterfly';
  /** Leafy meals toward the next change of form (Munch). */
  leafy?: number;
  /** In the cocoon for the second time: back to a caterpillar at dawn. */
  wasButterfly?: boolean;
  /** A startled stink bug's last cloud (tick). */
  puffedAt?: number;
  /** Holding what it carries up over its head (Moose lifting something heavy). */
  overhead?: boolean;
  /** Rolling what it carries along behind it (Barty). */
  rolling?: boolean;
}

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  /** Content ID in the registry for this kind (bug or item). */
  defId: string;
  bug?: BugBrain;
  /** Tag changes from the defaults (see systems/tags.ts). */
  tags?: TagState;
  /** Ticks spent soaking in water without drying, for things that go soggy. */
  soak?: number;
  /** Paint on it (M7): an item's color, or up to five patches on a bug. */
  paint?: string[];
  /** Snapped onto the pegboard: held in place until grabbed. */
  pinned?: boolean;
  /** Bites taken out of a leaf by a nibbling caterpillar. */
  bites?: number;
  /** What went into a crafted thing or a junk blob (M8), so it can come apart again. */
  parts?: SavedPart[];
  /** A potion bottle's brew (M8). Bottles without one hold their def's potion. */
  brew?: Brew;
  /** Potion effects on a bug or a thing (M8), oldest first. */
  effects?: ActiveEffect[];
  /** Food toasted by heat (rule R12): a food of its own, darker and steaming. */
  toasted?: boolean;
  /** A crafted toy's state (M8): where it pivots, hangs, or whether it is switched off. */
  toy?: ToyState;
}

/**
 * Something tucked inside another thing (M8): a crafted toy's parts, a junk
 * blob's ingredients, what is in the cauldron. Enough to make it again
 * exactly as it went in.
 */
export interface SavedPart {
  defId: string;
  tags?: TagState;
  paint?: string[];
  bites?: number;
  toasted?: boolean;
  brew?: Brew;
  parts?: SavedPart[];
}

/**
 * A potion working on a bug or a thing (game design doc, section 9). Times
 * are ticks. Periodic effects (burps, bubbles, stomps) keep their next beat.
 */
export interface ActiveEffect {
  /** The potion that gave it, or null for a mix of two base potions. */
  potion: string | null;
  effect: PotionEffect;
  /** 1 is normal; doubles and triples are stronger, mixes weaker (0.7). */
  strength: number;
  since: number;
  until: number;
  /** A color: the paint of wings. */
  paint?: string;
  /** A wobble flips between these two effects every 2 s. */
  flip?: [PotionEffect, PotionEffect];
  /** The next burp, bubble, stomp, or sneeze. */
  next?: number;
  /** A snowball's size, growing as it rolls (1 to 1.5). */
  grown?: number;
  /** A balloon bug poked flat: zipping about until this tick. */
  zipUntil?: number;
  /** A rocket bug has gone up (it goes once, then floats down). */
  fired?: boolean;
}

/** A crafted toy's state. */
export interface ToyState {
  /** A seesaw or catapult resting on its pivot: the pivot's world point. */
  pivot?: [number, number];
  /** A balloon basket letting its air out, or a launcher spent. */
  off?: boolean;
  /** A straw rocket in flight. */
  flying?: boolean;
  /** A disco ball hung from an overhang at this world point. */
  hung?: [number, number];
}

/**
 * Owns every entity's non-physics state. Iteration order is ascending ID,
 * which is also creation order, so systems visit entities deterministically.
 */
export class EntityStore {
  private map = new Map<EntityId, Entity>();
  private nextIdValue = 1;
  /** Sorted list, rebuilt only when entities come or go. */
  private sorted: Entity[] | null = null;
  private byKind = new Map<EntityKind, Entity[]>();

  get nextId(): EntityId {
    return this.nextIdValue;
  }

  set nextId(value: EntityId) {
    this.nextIdValue = value;
  }

  create(kind: EntityKind, defId: string, extra: Partial<Omit<Entity, 'id'>> = {}): Entity {
    const entity: Entity = { ...extra, id: this.nextIdValue++, kind, defId };
    this.map.set(entity.id, entity);
    this.changed();
    return entity;
  }

  /** Insert an entity with a known ID (used when loading saves). */
  restore(entity: Entity): void {
    if (this.map.has(entity.id)) throw new Error(`Duplicate entity id ${entity.id}`);
    this.map.set(entity.id, entity);
    if (entity.id >= this.nextIdValue) this.nextIdValue = entity.id + 1;
    this.changed();
  }

  remove(id: EntityId): boolean {
    this.changed();
    return this.map.delete(id);
  }

  private changed(): void {
    this.sorted = null;
    this.byKind.clear();
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
    this.sorted ??= [...this.map.values()].sort((a, b) => a.id - b.id);
    return [...this.sorted];
  }

  ofKind(kind: EntityKind): Entity[] {
    let list = this.byKind.get(kind);
    if (!list) {
      list = this.all().filter((e) => e.kind === kind);
      this.byKind.set(kind, list);
    }
    return [...list];
  }
}
