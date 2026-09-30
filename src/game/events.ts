import type { BugAction, EntityId, EntityKind, SocialKind } from './core/entities';
import type { AdvertAction } from './data/types';

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
  /** A bug picked something to go and do. `targetId` is null for a spot (the water, the stump top). */
  bug_chose_action: { id: EntityId; defId: string; action: BugAction; targetId: EntityId | null };
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
  /** A bug finished using something: bounced on the spring, sniffed a new thing, splashed. */
  bug_used: { id: EntityId; defId: string; targetId: EntityId | null; action: AdvertAction };
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

  // --- Properties and water (M3) ---------------------------------------
  /** A tag came on. `cause` names the rule or effect, for sounds and particles. */
  tag_gained: { id: EntityId; tag: string; cause: TagCause; x: number; y: number };
  /** A tag went off: washed, dried, melted, or worn off. */
  tag_lost: { id: EntityId; tag: string; cause: TagCause; x: number; y: number };
  /** Something hit the water. `speed` is how fast it went in; `size` its half height. */
  splashed: {
    id: EntityId;
    kind: EntityKind;
    defId: string;
    x: number;
    y: number;
    speed: number;
    size: number;
  };
  /** Climbed or floated out of the water. */
  left_water: { id: EntityId; kind: EntityKind; x: number; y: number };
  /** A low, fast throw bounced off the water. `count` is the skip number in this throw. */
  skipped: { id: EntityId; x: number; y: number; count: number };
  /** Hot met wet: "tsss" and a big steam puff (R2), or hot went into water (R1). */
  steamed: { id: EntityId; otherId: EntityId | null; x: number; y: number };
  /** Wet met cold and froze (R3). */
  froze: { id: EntityId; x: number; y: number };
  /** Frozen met hot, or the ice wore off: back to wet (R4). */
  thawed: { id: EntityId; x: number; y: number };
  /** A cold thing touched the water and froze a patch of it (R5). */
  ice_formed: { x0: number; x1: number; y: number };
  ice_melted: { x0: number; x1: number; y: number };
  /** Sticky contact welded two things together (R6). */
  stuck: { a: EntityId; b: EntityId; x: number; y: number };
  /** A weld pulled apart, or soap loosened it. */
  unstuck: { a: EntityId; b: EntityId; x: number; y: number };
  /** Soap and water blew bubbles (R7), or a wet wand was waved. */
  bubbles_blown: { id: EntityId; x: number; y: number; count: number };
  /** A bug caught a whiff of something smelly (R8). `liked` if it enjoys stink. */
  bug_smelled: { id: EntityId; defId: string; sourceId: EntityId; liked: boolean };
  /** Sparky met water: the pond fizzes for a moment (R9). */
  water_zapped: { x: number; y: number };
  /** A magnet pulled something onto itself with a clink (R10). */
  magnet_snapped: { id: EntityId; magnetId: EntityId; x: number; y: number };
  /** A bug fell in the water and started swimming. */
  bug_swam: { id: EntityId; defId: string; x: number; y: number };
  /** Back on land, a bug shook itself dry. */
  bug_shook_dry: { id: EntityId; defId: string; x: number; y: number };
  /** A shaken sponge squeezed its water (or soap) out onto what is below (R18). */
  wrung_out: { id: EntityId; tag: string; x: number; y: number };
  /** The hose tap was clicked on or off. */
  hose_toggled: { on: boolean; x: number; y: number };
  /** The sunken boot was clicked: a burst of bubbles. */
  boot_bubbled: { x: number; y: number };
  /** An area went to sleep (no physics) or woke up, as the camera moved. */
  area_slept: { areaId: string };
  area_woke: { areaId: string };

  // --- Needs, social play, and the setup rule (M4) ------------------------
  /** Sniffing a thing it has not met before. */
  bug_inspected: { id: EntityId; defId: string; itemId: EntityId; itemDefId: string };
  /** Picked something up in its front legs. */
  bug_picked_up: { id: EntityId; defId: string; itemId: EntityId; itemDefId: string };
  /** Set down what it was carrying. */
  bug_put_down: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number };
  /** Two bugs started doing something together. */
  bug_socialized: { id: EntityId; defId: string; partnerId: EntityId; kind: SocialKind };
  /** An interaction ended. `happy` is false if it fizzled (a partner was grabbed away). */
  bug_social_ended: { id: EntityId; defId: string; partnerId: EntityId; kind: SocialKind; happy: boolean };
  /** One line of a chat: a pictogram topic, and the food or bug it is about. */
  bug_chatted: {
    id: EntityId;
    defId: string;
    partnerId: EntityId;
    topic: ChatTopic;
    about: string | null;
  };
  /** A head-bump greeting: boop. */
  bug_bumped: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** Tag! `id` tapped `partnerId`, who is now it. */
  bug_tagged: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** Threw something to a friend. */
  bug_threw: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number; vx: number; vy: number };
  /** Caught something a friend threw. */
  bug_caught: { id: EntityId; defId: string; itemId: EntityId; x: number; y: number };
  /** Gave a friend a snack. */
  bug_shared: { id: EntityId; defId: string; partnerId: EntityId; itemId: EntityId; itemDefId: string };
  /** Snatched a snack out of another bug's hands. */
  bug_snatched: { id: EntityId; defId: string; partnerId: EntityId; itemId: EntityId; itemDefId: string };
  /** Patted a dizzy friend, who gets better faster. */
  bug_comforted: { id: EntityId; defId: string; partnerId: EntityId; x: number; y: number };
  /** Turned to look at something loud nearby (a crash, a hard landing). The `gawk` reaction says how. */
  bug_gawked: { id: EntityId; defId: string; x: number; y: number };
  /** Hopped onto another bug's head for a ride, or off it. */
  bug_rode: { id: EntityId; defId: string; mountId: EntityId; on: boolean };
  bug_slept: { id: EntityId; defId: string; x: number; y: number };
  /** Woke up. `early` if something woke it before it was rested. */
  bug_woke: { id: EntityId; defId: string; early: boolean };
  /** Striking a pose at the top of the world (Dot), or for the camera. */
  bug_posed: { id: EntityId; defId: string; x: number; y: number };
  /** A small idle animation: a hum, a yawn, a look around. */
  bug_fidgeted: { id: EntityId; defId: string; fidget: Fidget };
  /** Slid on a slime trail. */
  bug_slipped: { id: EntityId; defId: string; x: number; y: number };
  /** Curled into a ball, or uncurled and peeked out. */
  bug_curled: { id: EntityId; defId: string; on: boolean };
  /** Ducked behind something, or came out. */
  bug_hid: { id: EntityId; defId: string; coverId: EntityId | null; on: boolean };
  /** A stack the player built came crashing down. */
  stack_fell: { x: number; y: number; count: number };
  /** The player tucked something into pocket slot `slot`. `x`, `y` is where it left the world. */
  pocketed: { id: EntityId; kind: EntityKind; defId: string; slot: number; x: number; y: number };
  /** The player pulled something out of pocket slot `slot`, into the hand at `x`, `y`. */
  unpocketed: { id: EntityId; kind: EntityKind; defId: string; slot: number; x: number; y: number };
  /** Dropped on a slot that could not take it, this came back out at the hand. */
  pocket_swapped: { id: EntityId; defId: string; slot: number; x: number; y: number };
  /** In the first scene, a bug came over to ask to be flung ("again!"). */
  bug_beckoned: { id: EntityId; defId: string; x: number; y: number };
}

/** What a chat line is about. The renderer draws it as a pictogram. */
export type ChatTopic =
  'food' | 'friend' | 'star' | 'question' | 'heart' | 'note' | 'spring' | 'drop' | 'zzz' | 'laugh' | 'sun';

export const CHAT_TOPICS: readonly ChatTopic[] = [
  'food',
  'friend',
  'star',
  'question',
  'heart',
  'note',
  'spring',
  'drop',
  'zzz',
  'laugh',
  'sun',
];

/** Idle fidgets (game design doc, section 5, `st_idle`). */
export type Fidget = 'look' | 'hum' | 'yawn' | 'scratch' | 'groom' | 'stretch' | 'kick' | 'twirl';

/** What changed a tag, so listeners can pick the right effect. */
export type TagCause =
  | 'water'
  | 'rain'
  | 'hose'
  | 'steam'
  | 'freeze'
  | 'thaw'
  | 'contact'
  | 'soap'
  | 'stink'
  | 'zap'
  | 'food'
  | 'shake'
  | 'wring'
  | 'wore_off'
  | 'returned'
  | 'debug'
  | 'player'
  | 'stack'
  | 'slime';

export type Liking = 'loved' | 'liked' | 'neutral' | 'disliked';

/**
 * Reactions (game design doc, section 5). Each has at least three variants.
 * `land_hard` is for bugs that never get dizzy (Glorp). `splash` plays on
 * falling in water, `shake_dry` on climbing out, and `stink` on smelling
 * something (a happy sniff for stink lovers). M4 adds `inspect` (sniffing
 * something new), `wake`, `gawk` (looking at a crash), `robbed` (a snack
 * snatched away), `slip` (on slime), `show_off` (a pose), `play` (the happy
 * end of a game together), and `peek` (uncurling, or peeking out of cover).
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
  | 'fed_disliked'
  | 'splash'
  | 'shake_dry'
  | 'stink'
  | 'inspect'
  | 'wake'
  | 'gawk'
  | 'robbed'
  | 'slip'
  | 'show_off'
  | 'play'
  | 'peek';

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
  'splash',
  'shake_dry',
  'stink',
  'inspect',
  'wake',
  'gawk',
  'robbed',
  'slip',
  'show_off',
  'play',
  'peek',
];

/** Variants per reaction type. */
export const REACTION_VARIANTS = 3;

/** Mood, derived from needs and recent events (game design doc, section 5). */
export type Mood =
  'mood_happy' | 'mood_content' | 'mood_bored' | 'mood_hungry' | 'mood_sleepy' | 'mood_grumpy';

export type GameEventName = keyof GameEvents;
