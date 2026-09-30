import type { BugBrain, BugMode, Entity, EntityId, SocialKind } from '../core/entities';
import { SOCIAL_KINDS } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Rng } from '../core/rng';
import { DIZZY_SPEED } from '../constants';
import type { AdvertAction, BugDef, NeedId } from '../data/types';
import { NEED_IDS } from '../data/types';
import type { Fidget, Liking } from '../events';
import type { AdvertCandidate, BugContext, BugDecision, BugNotice, OtherBug } from './bugTypes';
import { EMPTY_WORLD, SPOT_CAMERA, SPOT_SLEEP_HERE, SPOT_STAGE, SPOT_TOP, SPOT_WATER } from './bugTypes';
import {
  ARRIVE,
  DECIDE_EVERY,
  SEEK_TIMEOUT,
  STUCK_TICKS,
  clearIntent,
  clearLanding,
  enter,
  enterIdle,
  face,
  grip,
  hopVelocity,
  kindUseId,
  launch,
  memoryModifier,
  react,
  recordUse,
  remember,
  stepToward,
  walk,
  walkVelocity,
} from './bugMove';
import {
  CATCH_FAR,
  CATCH_NEAR,
  CATCH_WINDUP,
  available,
  endSocial,
  engage,
  updateRide,
  updateSocial,
} from './bugSocial';
import { addNeeds, decayNeeds, freshNeeds, moodOf, urgency } from './needs';

export type {
  AdvertCandidate,
  BugContext,
  BugDecision,
  BugNotice,
  BugSky,
  BugWorld,
  LooseItem,
  Obstacle,
  OtherBug,
  TargetInfo,
} from './bugTypes';
export { EMPTY_WORLD, SPOT_CAMERA, SPOT_SLEEP_HERE, SPOT_STAGE, SPOT_TOP, SPOT_WATER } from './bugTypes';
export { hopVelocity, memoryModifier, pickVariant, react, remember } from './bugMove';
export { moodOf, urgency } from './needs';
export { catchTurn, handPoint, leadState } from './bugSocial';

/** Chewing time before swallowing, or before spitting out disliked food. */
const CHEW_TICKS: Readonly<Record<Liking, number>> = { loved: 100, liked: 90, neutral: 90, disliked: 50 };
/** How long the reaction after a meal lasts. */
const FED_REACT_TICKS: Readonly<Record<Liking, number>> = {
  loved: 120,
  liked: 84,
  neutral: 66,
  disliked: 110,
};
/** Glorp spinning in his shell after a hard landing. */
export const SHELL_TICKS = 150;
const GRUMPY_TICKS = 8 * SIM_HZ;
/** Hold-poke: laughs escalate every second, and at 3 s the bug wriggles free. */
export const TICKLE_LEVEL_TICKS = SIM_HZ;
export const TICKLE_FREE_TICKS = 3 * SIM_HZ;
/** A shaken bug is woozy for 1 s. */
export const WOOZY_TICKS = SIM_HZ;
/** A full belly burps a moment after the last bite. */
const BURP_DELAY = 70;
/** Hunger at or above this after a meal means a burp. */
export const FULL_BELLY = 95;
const LANDING_TICKS = 10;
const RECOVER_TICKS = 40;
const REACT_TICKS = 36;
const HOP_TRIES = 3;
const REPEAT_WINDOW = 10 * SIM_HZ;
const RECENT_USE = 60 * SIM_HZ;
const RECENT_KIND = 90 * SIM_HZ;

const WANDER_RANGE = 6;
/** Deeper than this in water, a bug that cannot skate starts swimming. */
export const SWIM_DEPTH = 0.35;
/** Shaking itself dry takes this long. */
export const SHAKE_DRY_TICKS = 72;
/** A bug reacts to a smell at most this often. */
export const SMELL_EVERY = 10 * SIM_HZ;
const STINK_REACT_TICKS = 84;
/** Walks this far away from a stink it dislikes. */
const STINK_FLEE = 4;
/** How far a bug notices adverts: 900 px (game design doc, section 5). */
export const PERCEPTION = 9;
const TUMBLE_SPEED = 3.5;
const SCORE_FLOOR = 8;
/** Food held within this range (m) gets a bug's attention. */
export const OFFER_RANGE = 2.5;
/** Something the player just brought stays new and interesting this long. */
export const FRESH_TICKS = 60 * SIM_HZ;
/** How much extra a fresh thing scores, scaled by curiosity. */
const FRESH_BONUS = 20;
/** Sniffing something new takes 1.3 to 2.2 s. */
const INSPECT_TICKS: readonly [number, number] = [80, 130];
/** Asleep, a bump this hard (m/s) wakes a bug up. */
const WAKE_IMPACT = 6;
/** Woken early, a bug is groggy for 3 s and nods off again 20 s later if still tired. */
const GROGGY_TICKS = 3 * SIM_HZ;
const RENAP_TICKS = 20 * SIM_HZ;
/** Rested enough to wake up on its own. */
const RESTED = 99.5;
/** Dot poses this long at the top before she leaps. */
const POSE_TICKS = 120;
/** Dot comes into view to pose after being ignored this long. */
export const IGNORED_TICKS = 90 * SIM_HZ;
/** Rollo curls up after three pokes this close together, or a fall this far (m). */
const POKE_WINDOW = 90;
const CURL_FALL = 3;
/** Where Rollo lines up pebbles: slots this far apart, starting at his resting spot. */
export const ROW_GAP = 0.55;
const ROW_SLOTS = 6;
/** Crowd-shy bugs drift away from this many bugs this close. */
const CROWD = 4;
const CROWD_RANGE = 2.5;
/** Loud things this close make idle bugs turn and look. */
export const GAWK_RANGE = 7;
/** Spots for pebbles on their way to the row. */
const SPOT_ROW = -5;
/** Beside a friend, where a snack gets carried to be eaten in company. */
const SPOT_PICNIC = -6;
/** A dance on the stage lasts 6 to 10 s. */
const DANCE_TICKS: readonly [number, number] = [6 * SIM_HZ, 10 * SIM_HZ];
/** Barty rolls a ball this far before leaving it be. */
const ROLL_WALK: readonly [number, number] = [3, 6];
/** The hand this near makes a shy bug (Twig) freeze. */
export const SHY_RANGE = 2.5;
/** Prim chops at floating things this close in front of her. */
const CHOP_REACH = 1.4;
/** How often a sociable bug takes its snack over to a friend. */
const PICNIC_CHANCE = 0.3;

const FOOD_DELTA: Readonly<Record<Liking, number>> = { loved: 60, liked: 40, neutral: 20, disliked: 0 };
const LIKE_MULTIPLIER: Readonly<Record<Liking, number>> = {
  loved: 2,
  liked: 1.5,
  neutral: 1,
  disliked: 0.2,
};
/** What each social interaction offers, before affinity (section 5: social +15 to +30). */
const SOCIAL_NEEDS: Readonly<Record<SocialKind, Readonly<Partial<Record<NeedId, number>>>>> = {
  soc_chat: { need_social: 25, need_fun: 4 },
  soc_bump: { need_social: 16, need_fun: 8 },
  soc_tag: { need_social: 18, need_fun: 26 },
  soc_share_food: { need_social: 26 },
  soc_catch: { need_social: 18, need_fun: 30 },
  soc_comfort: { need_social: 22 },
  soc_steal: { need_hunger: 25, need_fun: 18 },
  soc_ride: { need_social: 12, need_fun: 22 },
};
const SOCIAL_SET: ReadonlySet<string> = new Set(SOCIAL_KINDS);

export function isSocial(action: string | null): action is SocialKind {
  return action !== null && SOCIAL_SET.has(action);
}

export function newBugBrain(x: number, rng: Rng): BugBrain {
  return {
    mode: 'st_idle',
    timer: rng.int(30, 120),
    targetX: x,
    targetId: null,
    action: null,
    facing: rng.chance(0.5) ? 1 : -1,
    needs: freshNeeds(rng),
    decideIn: rng.int(10, DECIDE_EVERY),
    airPeak: 0,
    selfLaunched: false,
    lastHardLanding: -1,
    dizzyStreak: 0,
    dizzyTicks: 0,
    used: [],
    stuck: 0,
    tries: 0,
    done: false,
    lastX: x,
    mouthful: null,
    reaction: null,
    variants: {},
    grumpyUntil: -1,
    burpAt: -1,
    tickle: 0,
    woozyUntil: -1,
    smelledAt: -1,
    hopAt: -1,
    carrying: null,
    social: null,
    memory: [],
    inspected: [],
    groggyUntil: -1,
    napAt: -1,
    pokes: [],
    gliding: false,
    fidgetAt: rng.int(120, 480),
    slippedAt: -1,
    restX: x,
    plan: null,
    resume: null,
    hopReady: 0,
    touchedAt: -1,
    airTop: 0,
    audience: 0,
  };
}

/** Airborne for real: thrown, falling, hopping, bouncing, held, or swimming. */
function isAirborne(brain: BugBrain): boolean {
  return (
    brain.mode === 'st_airborne' ||
    brain.mode === 'st_held' ||
    brain.mode === 'st_swim' ||
    (brain.mode === 'st_use' && brain.action === 'bounce')
  );
}

/**
 * Put food in a bug's mouth: it starts chewing. The sim moves the item
 * into the mouth. Used both when the bug picks food up itself and when the
 * player drops food on its mouth.
 */
export function feedBug(brain: BugBrain, def: BugDef, itemId: EntityId, itemDefId: string): Liking {
  const liking = likingOf(def, itemDefId);
  if (brain.carrying === itemId) brain.carrying = null;
  enter(brain, 'st_eat', CHEW_TICKS[liking]);
  brain.mouthful = itemId;
  brain.targetId = itemId;
  brain.action = 'eat';
  brain.tickle = 0;
  brain.gliding = false;
  return liking;
}

/** Can this bug take food in its mouth right now? */
export function canEat(brain: BugBrain): boolean {
  return !isAirborne(brain) && brain.mouthful === null && brain.mode !== 'st_rolled';
}

/** Called by the sim when the player starts or stops tickling a held bug. */
export function tickleBug(brain: BugBrain, on: boolean, rng: Rng, tick: number): BugNotice[] {
  if (!on) {
    brain.tickle = 0;
    return [];
  }
  if (brain.mode !== 'st_held' || brain.tickle > 0) return [];
  brain.tickle = 1;
  return [react(brain, 'tickle', rng, tick), { type: 'tickled', level: 1 }];
}

/** Called by the sim when the player shakes a held bug. */
export function shakeBug(brain: BugBrain, tick: number): void {
  brain.woozyUntil = tick + WOOZY_TICKS;
}

/** Modes in which a bug notices smells. */
const SMELLING: ReadonlySet<string> = new Set([
  'st_idle',
  'st_wander',
  'st_seek',
  'st_landing',
  'st_recover',
]);

/**
 * A smelly thing is near (rule R8). Stink lovers stop for a happy sniff;
 * everyone else pulls a face and walks away from it. Returns the notices,
 * or an empty list if the bug is busy or smelled something recently.
 */
export function smellBug(
  brain: BugBrain,
  def: BugDef,
  x: number,
  sourceX: number,
  rng: Rng,
  tick: number,
  worldWidth: number,
): BugNotice[] {
  if (!SMELLING.has(brain.mode) || brain.social !== null || brain.carrying !== null) return [];
  if (brain.smelledAt >= 0 && tick - brain.smelledAt < SMELL_EVERY) return [];
  brain.smelledAt = tick;
  clearIntent(brain);
  if (def.likesStink) {
    brain.facing = sourceX >= x ? 1 : -1;
    enter(brain, 'st_react', STINK_REACT_TICKS);
    return [react(brain, 'stink', rng, tick)];
  }
  // Hold your nose and walk the other way. A whiff costs a little cleanliness.
  addNeeds(brain.needs, { need_clean: -10 });
  const away = sourceX >= x ? -1 : 1;
  const margin = def.radius + 0.5;
  enter(brain, 'st_wander', SEEK_TIMEOUT);
  brain.targetX = Math.min(worldWidth - margin, Math.max(margin, x + away * STINK_FLEE));
  brain.facing = away;
  return [react(brain, 'stink', rng, tick)];
}

export function likingOf(def: BugDef, itemDefId: string): Liking {
  if (def.loves.includes(itemDefId)) return 'loved';
  if (def.likes.includes(itemDefId)) return 'liked';
  if (def.dislikes.includes(itemDefId)) return 'disliked';
  return 'neutral';
}

/** Dizzy length in seconds for a landing (game design doc, section 5). */
export function dizzySeconds(impact: number, streak = 0): number {
  const base = Math.min(4, Math.max(0, (impact - DIZZY_SPEED) / 2.5)) + 2;
  return Math.min(8, base + streak);
}

/** Expected need change for using an advert, with food scaled by taste. */
export function advertDeltas(def: BugDef, candidate: AdvertCandidate): Partial<Record<NeedId, number>> {
  if (candidate.action !== 'eat') return candidate.needs;
  return { ...candidate.needs, need_hunger: FOOD_DELTA[likingOf(def, candidate.defId)] };
}

/** Restless bugs don't like napping (Boing is the last to fall asleep). */
function sleepiness(def: BugDef): number {
  return 1.3 - def.traits.restless * 0.8;
}

/**
 * Score one advert for one bug, without the random bonus (game design doc,
 * section 5): the sum of urgency times weight times delta, times liking,
 * distance falloff, novelty, the recent-use penalty, and memory. Fresh things
 * the player just brought, and dizzy friends, add a bonus on top.
 */
export function scoreAdvert(
  brain: BugBrain,
  def: BugDef,
  candidate: AdvertCandidate,
  x: number,
  tick: number,
): number {
  const deltas = advertDeltas(def, candidate);
  let sum = 0;
  for (const need of NEED_IDS) {
    const delta = deltas[need];
    if (delta) sum += urgency(brain.needs[need]) * def.needWeights[need] * (delta / 100);
  }
  let like = candidate.like ?? LIKE_MULTIPLIER[likingOf(def, candidate.defId)];
  if (candidate.action === 'sleep') like *= sleepiness(def);
  const falloff = 1 / (1 + Math.abs(candidate.x - x) / 6);
  const uses = brain.used.filter((u) => u.id === candidate.id);
  const novelty = uses.length === 0 && candidate.id > 0 ? 1.6 : 1;
  const recent = uses.some((u) => tick - u.tick < RECENT_USE) ? 0.4 : 1;
  // Played this kind of game lately: try something else for a while.
  const kind = isSocial(candidate.action) ? kindUseId(SOCIAL_KINDS.indexOf(candidate.action)) : null;
  const again =
    kind !== null && brain.used.some((u) => u.id === kind && tick - u.tick < RECENT_KIND) ? 0.45 : 1;
  const memory = memoryModifier(brain, candidate.id, tick);
  let score = sum * like * falloff * novelty * recent * again * memory;
  if (candidate.fresh) score += FRESH_BONUS * (0.5 + def.traits.curious * 0.7) * falloff * 1.5;
  if (candidate.bonus) score += candidate.bonus * falloff;
  return score;
}

/** Called by the sim when the player lets go of a bug. */
export function releaseBug(brain: BugBrain, def: BugDef, flung: boolean, y = 0): void {
  enter(brain, 'st_airborne');
  brain.airPeak = 0;
  brain.airTop = y;
  brain.selfLaunched = false;
  clearIntent(brain);
  brain.tickle = 0;
  brain.gliding = false;
  if (flung && def.likesFlinging) addNeeds(brain.needs, { need_fun: 15 });
}

/** Called by the sim when a bug is poked. Returns true if it reacted. */
export function pokeBug(brain: BugBrain): boolean {
  if (
    brain.mode === 'st_dizzy' ||
    brain.mode === 'st_airborne' ||
    (brain.mode === 'st_use' && brain.action === 'bounce') ||
    brain.mode === 'st_swim' ||
    brain.mode === 'st_rolled' ||
    brain.mode === 'st_ride'
  )
    return false;
  enter(brain, 'st_react', REACT_TICKS);
  clearIntent(brain);
  return true;
}

/**
 * What a poke does (game design doc, section 5): wakes a sleeper up
 * groggy, makes a nervous bug curl into a ball after three quick pokes, and
 * otherwise gets a poke reaction. Returns the notices, or null if the poke
 * did nothing (dizzy, flying, swimming).
 */
export function pokedBug(brain: BugBrain, def: BugDef, rng: Rng, tick: number): BugNotice[] | null {
  brain.touchedAt = tick;
  if (brain.mode === 'st_sleep') return wakeBug(brain, true, rng, tick);
  brain.pokes = [...brain.pokes.filter((t) => tick - t < POKE_WINDOW), tick].slice(-3);
  if (!pokeBug(brain)) return null;
  if (def.curlsWhenFlung && def.traits.nervous >= 0.5 && brain.pokes.length >= 3) {
    brain.pokes = [];
    return curl(brain, rng);
  }
  return [react(brain, 'poke', rng, tick)];
}

/** Curl up into a ball (Rollo): a real rolling ball for 4 to 8 s. */
function curl(brain: BugBrain, rng: Rng): BugNotice[] {
  enter(brain, 'st_rolled', rng.int(4 * SIM_HZ, 8 * SIM_HZ));
  clearIntent(brain);
  return [{ type: 'curled', on: true }];
}

/** Fall asleep right here. */
function enterSleep(brain: BugBrain, def: BugDef, x: number): BugNotice[] {
  enter(brain, 'st_sleep');
  clearIntent(brain);
  brain.napAt = -1;
  // A new resting spot, unless the pebble row is close by.
  if (def.habits.rowsPebbles && Math.abs(x - brain.restX) > 6) brain.restX = x;
  return [{ type: 'slept' }];
}

/** Fall asleep right now, wherever it is (the first scene's napping Dot). */
export function napBug(brain: BugBrain, def: BugDef, x: number): BugNotice[] {
  return enterSleep(brain, def, x);
}

/**
 * Push every tick a brain remembers `ticks` later. Bugs in the pocket are
 * out of time: grumpiness, memories, and naps carry on where they left off.
 */
export function shiftBrain(brain: BugBrain, ticks: number): void {
  if (ticks <= 0) return;
  const later = (t: number): number => (t >= 0 ? t + ticks : t);
  brain.lastHardLanding = later(brain.lastHardLanding);
  brain.grumpyUntil = later(brain.grumpyUntil);
  brain.burpAt = later(brain.burpAt);
  brain.woozyUntil = later(brain.woozyUntil);
  brain.smelledAt = later(brain.smelledAt);
  brain.hopAt = later(brain.hopAt);
  brain.groggyUntil = later(brain.groggyUntil);
  brain.napAt = later(brain.napAt);
  brain.fidgetAt = later(brain.fidgetAt);
  brain.slippedAt = later(brain.slippedAt);
  brain.touchedAt = later(brain.touchedAt);
  brain.used = brain.used.map((u) => ({ ...u, tick: u.tick + ticks }));
  brain.memory = brain.memory.map((m) => ({ ...m, tick: m.tick + ticks }));
  brain.pokes = brain.pokes.map((t) => t + ticks);
  if (brain.reaction) brain.reaction = { ...brain.reaction, tick: brain.reaction.tick + ticks };
}

/** Into the pocket: out of the world, nothing to do, needs frozen. */
export function pocketBug(brain: BugBrain): void {
  enter(brain, 'st_pocketed');
  clearIntent(brain);
  brain.social = null;
  brain.carrying = null;
  brain.mouthful = null;
  brain.tickle = 0;
  brain.gliding = false;
  brain.resume = null;
  brain.plan = null;
}

/** Modes a bug can drop to come and ask to be flung. */
const BECKON_FROM = new Set<BugMode>(['st_idle', 'st_wander', 'st_react', 'st_landing', 'st_recover']);

/**
 * The first scene's nudge (game design doc, section 17): walk over toward
 * the hand at `handX`, stopping a body length short, and ask to be flung.
 * Returns false if the bug is busy (asleep, eating, flying, held).
 */
export function beckonBug(brain: BugBrain, def: BugDef, x: number, handX: number): boolean {
  if (!BECKON_FROM.has(brain.mode)) return false;
  clearIntent(brain);
  const dir = handX >= x ? 1 : -1;
  enter(brain, 'st_wander', 6 * SIM_HZ);
  brain.targetX = Math.abs(handX - x) < 1 ? x : handX - dir * (def.radius + 0.6);
  brain.facing = dir;
  brain.decideIn = 8 * SIM_HZ;
  return true;
}

/**
 * Wake a sleeping bug. Woken early (a poke, a grab, a bump), it is groggy
 * for 3 s and nods off again after 20 s if it is still tired.
 */
export function wakeBug(brain: BugBrain, early: boolean, rng: Rng, tick: number): BugNotice[] {
  if (brain.mode !== 'st_sleep') return [];
  enter(brain, 'st_react', early ? GROGGY_TICKS : 70);
  clearIntent(brain);
  if (early) {
    brain.groggyUntil = tick + GROGGY_TICKS;
    // Still tired, or woken at bedtime: back to sleep in 20 s.
    brain.napAt = tick + RENAP_TICKS;
  }
  return [{ type: 'woke', early }, react(brain, 'wake', rng, tick)];
}

/**
 * Called by the sim when a spring launches a bug. If the bug hopped on on
 * purpose, the bounce pays off. Returns true in that case.
 */
export function springLaunched(
  brain: BugBrain,
  springId: EntityId,
  tick: number,
  likesFlinging = true,
): boolean {
  if (brain.mode !== 'st_use' || brain.targetId !== springId || brain.done) return false;
  brain.done = true;
  addNeeds(brain.needs, { need_fun: 30, need_energy: -5 });
  recordUse(brain, springId, tick);
  remember(brain, springId, likesFlinging, tick);
  return true;
}

/** Start a dizzy spell. Returns the duration in ticks. */
export function makeDizzy(brain: BugBrain, impact: number, tick: number): number {
  brain.dizzyStreak =
    brain.lastHardLanding >= 0 && tick - brain.lastHardLanding <= REPEAT_WINDOW ? brain.dizzyStreak + 1 : 0;
  brain.lastHardLanding = tick;
  const ticks = Math.round(dizzySeconds(impact, brain.dizzyStreak) * SIM_HZ);
  enter(brain, 'st_dizzy', ticks);
  brain.dizzyTicks = ticks;
  brain.audience = 0;
  clearIntent(brain);
  return ticks;
}

/** Modes in which something loud nearby makes a bug turn and look. */
const GAWKING: ReadonlySet<string> = new Set(['st_idle', 'st_wander', 'st_seek', 'st_landing', 'st_recover']);

/**
 * Something loud happened nearby: a crash, a hard landing, a stack falling
 * (game design doc, section 5, `soc_gawk`). Idle bugs turn to look and laugh
 * or cheer. A nervous bug with no friend nearby ducks behind cover or curls
 * up instead. Returns the notices, or none if the bug is busy.
 */
export function gawkBug(
  brain: BugBrain,
  def: BugDef,
  x: number,
  src: { x: number; y: number },
  rng: Rng,
  tick: number,
  near: { friend: boolean; cover: { id: EntityId; x: number } | null },
): BugNotice[] {
  if (!GAWKING.has(brain.mode) || brain.social !== null || brain.carrying !== null) return [];
  if (brain.mode === 'st_seek' && brain.action === 'eat') return [];
  clearIntent(brain);
  brain.facing = src.x >= x ? 1 : -1;
  if (def.traits.nervous >= 0.8 && !near.friend) {
    if (near.cover) {
      enter(brain, 'st_hide', rng.int(3 * SIM_HZ, 8 * SIM_HZ));
      const side = near.cover.x >= src.x ? 1 : -1;
      brain.targetX = near.cover.x + side * (def.radius + 0.35);
      brain.targetId = near.cover.id;
      return [{ type: 'hid', coverId: near.cover.id, on: true }];
    }
    return curl(brain, rng);
  }
  enter(brain, 'st_react', 80);
  return [{ type: 'gawked', x: src.x, y: src.y }, react(brain, 'gawk', rng, tick)];
}

/**
 * Something wonderful in the sky (a shooting star): the bug stops, turns to
 * look up, and wonders. The sim only calls this for idle and wandering bugs.
 */
export function wonderBug(brain: BugBrain, x: number, skyX: number, rng: Rng, tick: number): BugNotice[] {
  clearIntent(brain);
  brain.facing = skyX >= x ? 1 : -1;
  enter(brain, 'st_react', 100);
  return [react(brain, 'wonder', rng, tick)];
}

/** Modes a bug leaves to go to bed at bedtime. Meals, flights, and swims finish first. */
const BEDABLE: ReadonlySet<BugMode> = new Set<BugMode>([
  'st_idle',
  'st_wander',
  'st_seek',
  'st_react',
  'st_landing',
  'st_recover',
  'st_social',
  'st_use',
  'st_hide',
  'st_perform',
]);

/** Modes a shy bug freezes in when the hand comes near. */
const FREEZABLE: ReadonlySet<BugMode> = new Set<BugMode>(['st_idle', 'st_wander', 'st_seek']);

/** Modes a bug keeps its umbrella up in. */
const UMBRELLA_MODES: ReadonlySet<BugMode> = new Set<BugMode>([
  'st_idle',
  'st_wander',
  'st_seek',
  'st_react',
  'st_landing',
  'st_recover',
  'st_use',
  'st_eat',
  'st_hide',
  'st_perform',
]);

/** A bed is within this reach at bedtime; farther than that, a bug sleeps where it stands. */
const BED_REACH = 5;
/** How often (ticks) a bug checks the time and the weather. */
const SKY_EVERY = 30;

/**
 * Time for bed (game design doc, section 5): drop whatever it was doing and
 * go to a bed nearby (something that advertises sleep, or a sleeping
 * friend), or sleep right here if there is none.
 */
function goToBed(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const { def, state, tick } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  letGo(me, brain, ctx, out);
  brain.umbrella = false;
  const beds: AdvertCandidate[] = ctx
    .adverts()
    .filter(
      (c) =>
        c.action === 'sleep' &&
        !c.claimed &&
        Math.abs(c.x - state.x) < BED_REACH &&
        Math.abs(c.y - state.y) < 1.5 &&
        memoryModifier(brain, c.id, tick) >= 1 &&
        !(ctx.overWater?.(c.x) ?? false),
    );
  for (const o of world.bugs())
    if (
      o.id !== me &&
      o.brain.mode === 'st_sleep' &&
      Math.abs(o.x - state.x) < BED_REACH &&
      Math.abs(o.y - state.y) < 1.5 &&
      world.affinity(def.id, o.defId) >= 0.2 &&
      memoryModifier(brain, o.id, tick) >= 1
    )
      beds.push({ id: o.id, defId: o.defId, x: o.x, y: o.y, action: 'sleep', needs: {}, claimed: false });
  beds.sort((a, b) => Math.abs(a.x - state.x) - Math.abs(b.x - state.x) || a.id - b.id);
  const bed = beds[0];
  if (bed && Math.abs(bed.x - state.x) > def.radius + 0.3) {
    start(brain, ctx, bed, out);
    return;
  }
  out.notices.push({ type: 'chose', action: 'sleep', targetId: null }, ...enterSleep(brain, def, state.x));
}

/**
 * Time and weather, checked every half second: bedtime, and rain. Returns
 * true if the bug did something that ends this tick's thinking.
 */
function skyCheck(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const sky = ctx.sky;
  const { def, state, rng, tick } = ctx;
  if (!sky || !ctx.support) return false;
  // The rain has stopped: down comes the umbrella.
  if (brain.umbrella && (!sky.raining || brain.carrying === null)) {
    if ((tick + me * 7) % SKY_EVERY !== 0 && brain.carrying !== null) return false;
    if (brain.carrying !== null) out.notices.push({ type: 'umbrella', itemId: brain.carrying, on: false });
    brain.umbrella = false;
    brain.carrying = null;
  }
  if ((tick + me * 13) % SKY_EVERY !== 0) return false;
  const sleepy = sky.bedtime || (sky.evening && brain.needs.need_energy < 50);
  if (
    sleepy &&
    BEDABLE.has(brain.mode) &&
    !isAirborne(brain) &&
    !(brain.mode === 'st_seek' && brain.action === 'sleep') &&
    (brain.napAt < 0 || tick >= brain.napAt)
  ) {
    goToBed(me, brain, ctx, out);
    return true;
  }
  if (!sky.rain || (brain.mode !== 'st_idle' && brain.mode !== 'st_wander')) return false;
  if (def.rain === 'likes') {
    // Out in the rain and loving it: a splashy little dance now and then.
    if (rng.chance(0.08)) {
      addNeeds(brain.needs, { need_fun: 6 });
      enter(brain, 'st_react', 70);
      clearIntent(brain);
      out.notices.push(react(brain, 'rain_joy', rng, tick));
      out.velocity = { x: 0, y: -3.2 };
      return true;
    }
    return false;
  }
  if (def.rain !== 'dislikes' || brain.umbrella || brain.carrying !== null) return false;
  // Caught in the rain: find a leaf to hold overhead.
  const leaf = ctx
    .adverts()
    .filter((c) => c.action === 'shelter' && !c.claimed && Math.abs(c.x - state.x) < PERCEPTION)
    .filter((c) => Math.abs(c.y - state.y) < 2 && memoryModifier(brain, c.id, tick) >= 1)
    .sort((a, b) => Math.abs(a.x - state.x) - Math.abs(b.x - state.x) || a.id - b.id)[0];
  if (leaf) {
    start(brain, ctx, leaf, out);
    return true;
  }
  if (rng.chance(0.12)) {
    enter(brain, 'st_react', 60);
    clearIntent(brain);
    out.notices.push(react(brain, 'rain_gloom', rng, tick));
    return true;
  }
  return false;
}

/** Is this bug napping right next to a sleeping friend? */
function inPile(me: EntityId, x: number, def: BugDef, ctx: BugContext): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  return world
    .bugs()
    .some(
      (o) =>
        o.id !== me &&
        o.brain.mode === 'st_sleep' &&
        Math.abs(o.x - x) < def.radius + o.def.radius + 0.5 &&
        world.affinity(def.id, o.defId) > 0,
    );
}

/** The pebble row's free slots, from Rollo's resting spot outward. */
export function rowSlots(brain: BugBrain, ctx: BugContext): { free: number[]; filled: number[] } {
  const world = ctx.world ?? EMPTY_WORLD;
  const x0 = brain.restX + ctx.def.radius + 0.4;
  const y0 = world.surfaceY(x0);
  const free: number[] = [];
  const filled: number[] = [];
  const loose = world.loose();
  for (let k = 0; k < ROW_SLOTS; k++) {
    const x = x0 + k * ROW_GAP;
    if (Math.abs(world.surfaceY(x) - y0) > 0.06 || ctx.overWater?.(x)) break;
    // Keep well clear of the player's things, and of anything in the way.
    if (world.setupNear(x, y0 - 0.2, 1.2)) break;
    const here = loose.filter((l) => Math.abs(l.x - x) < 0.45 && Math.abs(l.y - (y0 - 0.2)) < 0.4);
    if (here.some((l) => l.defId === 'item_pebble' && Math.abs(l.x - x) < 0.22)) filled.push(x);
    else if (here.length === 0) free.push(x);
    else break;
  }
  return { free, filled };
}

/** Other bugs' adverts: chat, bump, tag, catch, share, comfort, snatch, ride, and nap piles. */
function socialAdverts(me: EntityId, brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const world = ctx.world ?? EMPTY_WORLD;
  const { def, state } = ctx;
  const out: AdvertCandidate[] = [];
  const bugs = world.bugs();
  const loose = world.loose();
  const energetic = brain.needs.need_energy > 30;
  const sociable = 0.5 + def.traits.sociable;
  for (const o of bugs) {
    if (o.id === me || Math.abs(o.x - state.x) > PERCEPTION || Math.abs(o.y - state.y) > 4) continue;
    const aff = world.affinity(def.id, o.defId);
    const like = Math.max(0.1, (0.6 + aff) * sociable);
    const wanted = bugs.some((q) => q.id !== me && q.brain.social?.partner === o.id);
    const base = { id: o.id, defId: o.defId, x: o.x, y: o.y, claimed: wanted };
    const ob = o.brain;
    if (ob.mode === 'st_dizzy' && aff > 0 && !wanted && brain.needs.need_social < 95)
      out.push({
        ...base,
        action: 'soc_comfort',
        needs: SOCIAL_NEEDS.soc_comfort,
        like,
        bonus: 12 + 20 * aff,
      });
    if (ob.mode === 'st_sleep' && aff >= 0.2 && brain.needs.need_energy < 65)
      // A nap pile: curl up next to a sleeping friend.
      out.push({
        ...base,
        claimed: false,
        action: 'sleep',
        needs: { need_energy: 50, need_social: 20 },
        like: 0.9 + aff,
        bonus: 3,
      });
    if (def.traits.cheeky >= 0.5 && ob.carrying !== null && brain.needs.need_hunger < 75 && !wanted) {
      // A friend carrying a snack: snatch it and run.
      const snack = ctx.target(ob.carrying);
      if (snack && world.edible(snack.defId) && likingOf(def, snack.defId) !== 'disliked')
        out.push({
          ...base,
          action: 'soc_steal',
          needs: SOCIAL_NEEDS.soc_steal,
          like: 0.4 + def.traits.cheeky,
          // Mischief: too tempting to pass up.
          bonus: brain.needs.need_fun < 90 ? 9 * def.traits.cheeky : 0,
        });
    }
    if (
      def.habits.ridesHeads &&
      o.supported &&
      !o.held &&
      o.def.radius >= 0.45 &&
      ob.carrying === null &&
      (ob.mode === 'st_idle' || ob.mode === 'st_eat' || (ob.mode === 'st_use' && ob.action === 'inspect')) &&
      !bugs.some((q) => q.brain.mode === 'st_ride' && q.brain.social?.partner === o.id) &&
      !wanted
    )
      out.push({
        ...base,
        action: 'soc_ride',
        needs: SOCIAL_NEEDS.soc_ride,
        like: 0.7 + aff,
        bonus: brain.needs.need_fun < 90 ? 1 : 0,
      });
    if (!available(o) || wanted || brain.carrying !== null) continue;
    out.push({ ...base, action: 'soc_chat', needs: SOCIAL_NEEDS.soc_chat, like: like * 1.25 });
    out.push({ ...base, action: 'soc_bump', needs: SOCIAL_NEEDS.soc_bump, like: like * 0.9 });
    if (energetic && ob.needs.need_energy > 30)
      out.push({
        ...base,
        action: 'soc_tag',
        needs: SOCIAL_NEEDS.soc_tag,
        like: like * (0.3 + def.traits.cheeky * 0.5) * (0.6 + o.def.traits.restless * 0.4),
      });
    if (energetic) {
      // A ball or a berry nearby to throw back and forth.
      const toy = loose.find(
        (l) =>
          l.catchable &&
          l.speed < 0.3 &&
          Math.abs(l.x - state.x) < 5 &&
          !world.setupBetween(Math.min(l.x, o.x) - 1, Math.max(l.x, o.x) + 1),
      );
      if (toy)
        out.push({
          ...base,
          action: 'soc_catch',
          needs: SOCIAL_NEEDS.soc_catch,
          like: like * (0.6 + def.traits.restless * 0.6),
          item: toy.id,
        });
    }
    if (def.traits.generous >= 0.3 && ob.needs.need_hunger < 45) {
      // A snack the friend would like.
      const snack = loose.find(
        (l) =>
          l.edible &&
          l.speed < 0.3 &&
          Math.abs(l.x - state.x) < 6 &&
          likingOf(o.def, l.defId) !== 'disliked' &&
          likingOf(o.def, l.defId) !== 'neutral',
      );
      if (snack)
        out.push({
          ...base,
          action: 'soc_share_food',
          needs: SOCIAL_NEEDS.soc_share_food,
          like: like * (0.4 + def.traits.generous),
          bonus: urgency(ob.needs.need_hunger) * 0.08 * def.traits.generous,
          item: snack.id,
        });
    }
  }
  return out;
}

/** Places that advertise: a nap right here, the water, the top of the stump, the camera. */
function spotAdverts(brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const world = ctx.world ?? EMPTY_WORLD;
  const { def, state, tick } = ctx;
  const out: AdvertCandidate[] = [];
  const spot = (id: number, x: number, action: AdvertAction, needs: Partial<Record<NeedId, number>>) =>
    out.push({ id, defId: '', x, y: state.y, action, needs, claimed: false, like: 1 });
  if (brain.needs.need_energy < 55) spot(SPOT_SLEEP_HERE, state.x, 'sleep', { need_energy: 35 });
  if (def.swim !== 'skate') {
    const edge = world.waterEdge(state.x);
    if (edge && Math.abs(edge.x - state.x) < PERCEPTION)
      spot(SPOT_WATER, edge.x, 'splash', { need_clean: 80, need_fun: 12 });
  }
  const stage = world.stage?.() ?? null;
  if (stage && brain.needs.need_fun < 85 && brain.needs.need_energy > 30 && !ctx.overWater?.(state.x)) {
    // The flowerpot stage: up there for a little dance.
    const onStage = state.x > stage.x0 && state.x < stage.x1 && state.y < stage.y;
    const x = onStage ? state.x : (stage.x0 + stage.x1) / 2 + ((tick % 7) - 3) * 0.6;
    if (Math.abs(x - state.x) < PERCEPTION) {
      spot(SPOT_STAGE, x, 'dance', { need_fun: 26, need_social: 10 });
      // Somebody dancing up there already: come and join in.
      const dancing = world.bugs().filter((o) => o.brain.mode === 'st_perform' && o.brain.action === 'dance');
      if (dancing.length > 0) out[out.length - 1]!.bonus = 7 * Math.min(3, dancing.length);
    }
  }
  if (def.habits.showsOff) {
    const top = world.summit(state.x);
    const onTop = top && state.x > top.x0 && state.x < top.x1 && state.y < top.y;
    if (top && !onTop && brain.needs.need_energy > 35) {
      // Her signature: up to the top to pose, then a glide down.
      spot(SPOT_TOP, (top.x0 + top.x1) / 2, 'perform', { need_fun: 28, need_social: 6 });
      if (brain.needs.need_fun < 85) out[out.length - 1]!.bonus = 6;
    }
    const view = world.view;
    const since = brain.touchedAt < 0 ? tick : tick - brain.touchedAt;
    if (view && since > IGNORED_TICKS) {
      const x = Math.min(view.x1 - 3, Math.max(view.x0 + 3, state.x));
      if (!ctx.overWater?.(x) && (!ctx.home || (x > ctx.home.x0 && x < ctx.home.x1))) {
        // Nobody has played with her for ages: into view for a pose.
        spot(SPOT_CAMERA, x, 'perform', { need_social: 30, need_fun: 10 });
        out[out.length - 1]!.like = 2.5;
      }
    }
  }
  return out;
}

/** Everything this bug could do next, from items, other bugs, and spots. */
function candidates(me: EntityId, brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const { def } = ctx;
  const items = ctx.adverts().filter((c) => {
    if (c.action === 'carry') return !!def.habits.rowsPebbles;
    if (c.action === 'lift') return !!def.habits.strong && brain.carrying === null;
    if (c.action === 'roll') return !!def.habits.rollsBalls && brain.carrying === null;
    // Day bugs look for a bed when their energy runs under about half.
    if (c.action === 'sleep') return brain.needs.need_energy < 55;
    // Umbrellas are for rain, picked by `skyCheck`.
    if (c.action === 'shelter') return false;
    return true;
  });
  let carry = items.filter((c) => c.action === 'carry');
  if (carry.length > 0) {
    const row = rowSlots(brain, ctx);
    carry =
      row.free.length === 0
        ? []
        : carry
            .filter(
              (c) => Math.abs(c.x - brain.restX) < 7 && !row.filled.some((x) => Math.abs(x - c.x) < 0.3),
            )
            // Lining up pebbles is Rollo's favorite quiet pastime.
            .map((c) => ({ ...c, bonus: brain.needs.need_fun < 90 ? 7 : 0 }));
  }
  return [
    ...items.filter((c) => c.action !== 'carry'),
    ...carry,
    ...socialAdverts(me, brain, ctx),
    ...spotAdverts(brain, ctx),
  ];
}

/**
 * Score everything nearby and maybe pick something to do. Picks among the
 * top three with weights 60/30/10. Returns true if the bug chose an action.
 */
function choose(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const { def, state, rng, tick } = ctx;
  const desperate = NEED_IDS.some((n) => brain.needs[n] < 15);
  const exhausted = brain.needs.need_energy < 10;
  const scored = candidates(me, brain, ctx)
    .filter((c) => !c.claimed && (desperate || c.id === SPOT_CAMERA || Math.abs(c.x - state.x) <= PERCEPTION))
    .filter((c) => !exhausted || c.action === 'sleep')
    .map((c) => ({ c, score: scoreAdvert(brain, def, c, state.x, tick) + rng.range(0, 6) }))
    .filter((s) => s.score > SCORE_FLOOR)
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id || a.c.action.localeCompare(b.c.action))
    .slice(0, 3)
    // Something urgent wins: the runners-up only get a look in when they are close.
    .filter((s, _i, all) => s.score >= all[0]!.score * 0.5);
  if (scored.length === 0) {
    if (exhausted && ctx.support) {
      out.notices.push(...enterSleep(brain, def, state.x));
      return true;
    }
    return false;
  }
  const weights = [60, 30, 10].slice(0, scored.length);
  let roll = rng.range(
    0,
    weights.reduce((a, b) => a + b, 0),
  );
  let pick = scored[0]!;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) {
      pick = scored[i]!;
      break;
    }
  }
  return start(brain, ctx, pick.c, out);
}

/** Set off to do what an advert offers. */
function start(brain: BugBrain, ctx: BugContext, c: AdvertCandidate, out: BugDecision): boolean {
  const { def, state } = ctx;
  out.notices.push({ type: 'chose', action: c.action, targetId: c.id >= 0 ? c.id : null });
  if (c.id === SPOT_SLEEP_HERE) {
    out.notices.push(...enterSleep(brain, def, state.x));
    return true;
  }
  // Ten seconds, plus however long the walk takes a slow snail.
  enter(brain, 'st_seek', SEEK_TIMEOUT + Math.round((Math.abs(c.x - state.x) / def.speed) * SIM_HZ));
  brain.targetId = c.id;
  brain.action = c.action;
  brain.targetX = c.x;
  brain.tries = 0;
  brain.done = false;
  if (isSocial(c.action)) {
    const fetch = c.item !== undefined && c.item !== null;
    brain.social = {
      kind: c.action,
      partner: c.id,
      role: 'lead',
      stage: fetch ? 0 : 1,
      count: 0,
      goal: 0,
      beat: 0,
      left: 0,
      item: c.item ?? null,
      last: null,
    };
    if (fetch) brain.targetId = c.item!;
  }
  return true;
}

/**
 * Walk somewhere nearby, drifting back toward home (game design doc,
 * section 5). Bugs that cannot skate never pick a spot on open water.
 */
function startWander(brain: BugBrain, ctx: BugContext, away?: number): void {
  const { def, state, rng } = ctx;
  const margin = def.radius + 0.5;
  const reach = ctx.reach ?? { x0: 0, x1: ctx.worldWidth };
  let lo = Math.max(reach.x0 + margin, state.x - WANDER_RANGE);
  let hi = Math.min(reach.x1 - margin, state.x + WANDER_RANGE);
  const home = ctx.home;
  if (home) {
    const hlo = home.x0 + margin;
    const hhi = home.x1 - margin;
    if (state.x < hlo) lo = Math.max(lo, state.x);
    else if (state.x > hhi) hi = Math.min(hi, state.x);
    else {
      lo = Math.max(lo, hlo);
      hi = Math.min(hi, hhi);
    }
  }
  enter(brain, 'st_wander', SEEK_TIMEOUT);
  let target = away === undefined ? rng.range(lo, Math.max(lo, hi)) : away;
  if (def.swim !== 'skate' && ctx.overWater) {
    // Stop at the water's edge instead.
    const step = target > state.x ? 0.2 : -0.2;
    let x = state.x;
    while (Math.abs(target - x) > 0.2 && !ctx.overWater(x + step * 3)) x += step;
    target = x;
  }
  brain.targetX = target;
}

/** Drop out of anything shared: interactions end and whatever is in hand is let go. */
function letGo(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  if (brain.social) endSocial(me, brain, ctx, false, out);
  brain.carrying = null;
  brain.gliding = false;
}

/** Small idle animations (section 5, `st_idle`): a hum, a yawn, a look around, a groom. */
function fidget(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const { def, rng, tick } = ctx;
  brain.fidgetAt = tick + Math.round(rng.range(3, 8) * SIM_HZ * (1.3 - def.traits.restless * 0.6));
  const n = brain.needs;
  let kind: Fidget;
  if (def.habits.hops && rng.chance(0.5)) {
    // Boing can't sit still.
    kind = 'stretch';
    if (ctx.support) launch(brain, out, { x: 0, y: -4.2 }, ctx.state.y);
  } else if (def.habits.chops && rng.chance(0.5)) {
    // Prim strikes a slow, dramatic pose.
    kind = 'pose';
  } else if (def.habits.shy && rng.chance(0.6)) {
    // Twig goes very, very still. Just a stick.
    kind = 'freeze';
  } else if (n.need_energy < 40) kind = rng.chance(0.6) ? 'yawn' : 'stretch';
  else if (n.need_clean < 60 && rng.chance(0.6)) {
    // Grooming: +20 cleanliness.
    kind = 'groom';
    addNeeds(n, { need_clean: 20 });
  } else if (n.need_fun < 30) kind = rng.chance(0.5) ? 'kick' : 'look';
  else if (moodOf(brain, tick) === 'mood_happy') kind = rng.chance(0.55) ? 'hum' : 'look';
  else kind = rng.pick(['look', 'scratch', 'look', 'hum'] as const);
  out.notices.push({ type: 'fidgeted', fidget: kind });
}

/**
 * One tick of bug behavior. Mutates the brain and returns what the bug
 * wants physics to do. The sim calls this for every bug in ID order.
 */
export function updateBug(entity: Entity, ctx: BugContext): BugDecision {
  const out: BugDecision = {
    velocity: null,
    eat: null,
    take: null,
    spit: null,
    wriggle: false,
    throw: null,
    notices: [],
  };
  const brain = entity.bug;
  if (!brain) return out;
  const me = ctx.id ?? entity.id;
  const { def, state, rng } = ctx;
  const speed = Math.hypot(state.vx, state.vy);
  if (brain.pending) return pendingBug(brain, ctx, out);
  decayNeeds(
    brain,
    def,
    1,
    brain.mode === 'st_sleep' && inPile(me, state.x, def, ctx),
    ctx.sky?.bedtime ?? false,
  );
  const moved = Math.abs(state.x - brain.lastX);
  brain.lastX = state.x;
  if (brain.burpAt >= 0 && ctx.tick >= brain.burpAt) {
    brain.burpAt = -1;
    out.notices.push({ type: 'burped' });
  }

  if (ctx.held) {
    if (brain.mode !== 'st_held') {
      const asleep = brain.mode === 'st_sleep';
      letGo(me, brain, ctx, out);
      enter(brain, 'st_held');
      clearIntent(brain);
      brain.tickle = 0;
      brain.touchedAt = ctx.tick;
      if (asleep) {
        out.notices.push({ type: 'woke', early: true });
        brain.groggyUntil = ctx.tick + GROGGY_TICKS;
      }
      out.notices.push(react(brain, 'grab', rng, ctx.tick));
    } else if (brain.tickle > 0) {
      brain.tickle++;
      if (brain.tickle >= TICKLE_FREE_TICKS) {
        brain.tickle = 0;
        out.wriggle = true;
      } else if (brain.tickle % TICKLE_LEVEL_TICKS === 0) {
        out.notices.push({ type: 'tickled', level: 1 + brain.tickle / TICKLE_LEVEL_TICKS });
      }
    }
    return out;
  }
  if (brain.mode === 'st_held') releaseBug(brain, def, false, state.y);

  // A cocoon that got moved settles back down to sleep wherever it lands.
  if (brain.form === 'cocoon' && brain.mode !== 'st_sleep' && ctx.support && !isAirborne(brain)) {
    enter(brain, 'st_sleep');
    clearIntent(brain);
  }

  // Frozen solid in a block of ice: nothing moves until it thaws.
  if (ctx.frozen) return out;

  // Anything shared needs the right mode; so does anything carried.
  const socialOk =
    brain.mode === 'st_social' ||
    brain.mode === 'st_ride' ||
    brain.mode === 'st_seek' ||
    (brain.mode === 'st_airborne' && brain.selfLaunched);
  if (brain.social && !socialOk) endSocial(me, brain, ctx, false, out);
  // Umbrellas, things lifted overhead, and balls rolled along stay in hand through everyday modes.
  const heldUp = (!!brain.umbrella || !!brain.overhead || !!brain.rolling) && UMBRELLA_MODES.has(brain.mode);
  if (brain.carrying !== null && !socialOk && !heldUp) brain.carrying = null;
  if (brain.umbrella && brain.carrying === null) brain.umbrella = false;
  if (brain.carrying === null) {
    delete brain.overhead;
    delete brain.rolling;
  }

  // Fell in the water: swim for it (skaters stand on the surface instead).
  if (def.swim !== 'skate' && brain.mode !== 'st_swim' && (ctx.submerged ?? 0) > SWIM_DEPTH) {
    if (brain.mode === 'st_sleep') out.notices.push({ type: 'woke', early: true });
    letGo(me, brain, ctx, out);
    enter(brain, 'st_swim');
    clearIntent(brain);
    brain.selfLaunched = false;
    brain.hopAt = -1;
    out.notices.push({ type: 'swam' }, react(brain, 'splash', rng, ctx.tick));
    return out;
  }

  // An involuntary hop after bouncy food (the jelly bean).
  if (brain.hopAt >= 0 && ctx.tick >= brain.hopAt) {
    brain.hopAt = -1;
    if (
      ctx.support &&
      (brain.mode === 'st_react' || brain.mode === 'st_idle' || brain.mode === 'st_wander')
    ) {
      enter(brain, 'st_airborne');
      brain.selfLaunched = true;
      brain.airPeak = 0;
      brain.airTop = state.y;
      // Straight up if the player's things are close, so it comes down where it was.
      const near = (ctx.world ?? EMPTY_WORLD).setupNear(state.x, state.y, 1.5);
      out.velocity = { x: near ? 0 : brain.facing * 0.6, y: -7.5 };
      out.notices.push({ type: 'hopped' });
      return out;
    }
  }

  // Knocked off its feet by something.
  if (
    !isAirborne(brain) &&
    brain.mode !== 'st_rolled' &&
    brain.mode !== 'st_ride' &&
    !ctx.support &&
    speed > TUMBLE_SPEED
  ) {
    if (brain.mode === 'st_sleep') out.notices.push({ type: 'woke', early: true });
    letGo(me, brain, ctx, out);
    enter(brain, 'st_airborne');
    brain.airPeak = 0;
    brain.airTop = state.y;
    brain.selfLaunched = false;
    clearIntent(brain);
  }

  const n = ctx.support;
  // Twig freezes whenever the hand is near: nobody can see a stick that does not move.
  if (def.habits.shy && n && ctx.hand && FREEZABLE.has(brain.mode)) {
    const d = Math.hypot(ctx.hand.x - state.x, ctx.hand.y - state.y);
    if (d < SHY_RANGE) {
      out.velocity = grip(n);
      if (brain.mode !== 'st_idle') enterIdle(brain, rng, def);
      brain.decideIn = Math.max(brain.decideIn, 30);
      return out;
    }
  }
  if (brain.mode !== 'st_sleep' && skyCheck(me, brain, ctx, out)) {
    out.velocity ??= n ? grip(n) : null;
    return out;
  }
  switch (brain.mode) {
    case 'st_airborne':
    case 'st_use': {
      if (brain.mode === 'st_use' && brain.action !== 'bounce') return use(brain, ctx, out);
      return airborne(me, brain, ctx, speed, out);
    }

    case 'st_landing':
    case 'st_recover':
    case 'st_react':
      if (offeredNear(ctx)) brain.facing = ctx.offered!.x >= state.x ? 1 : -1;
      if (--brain.timer <= 0) enterIdle(brain, rng, def);
      out.velocity = n ? grip(n) : null;
      return out;

    case 'st_dizzy': {
      if (--brain.timer <= 0) {
        enter(brain, 'st_recover', RECOVER_TICKS);
        out.notices.push({ type: 'recovered' });
        // The one who crashed often laughs along with whoever was watching.
        if (brain.audience > 0 && rng.chance(0.7)) out.notices.push(react(brain, 'play', rng, ctx.tick));
        brain.audience = 0;
      }
      if (!n) return out;
      // A slow, wobbly stagger back and forth.
      const wobble = Math.sin((ctx.tick + entity.id * 37) * 0.045) * def.speed * 0.35;
      if (Math.abs(wobble) > 0.05) brain.facing = wobble > 0 ? 1 : -1;
      out.velocity = walkVelocity(n, wobble);
      return out;
    }

    case 'st_sleep':
      out.velocity = n ? grip(n) : null;
      // Munch, asleep at night after five leafy meals, spins a cocoon.
      if (def.habits.metamorphosis && (brain.leafy ?? 0) >= METAMORPHOSIS_MEALS && ctx.sky?.bedtime) {
        brain.form = 'cocoon';
        brain.leafy = 0;
        out.notices.push({ type: 'changed', form: 'cocoon' });
      }
      // A cocoon sleeps right through, whatever bumps it, until morning.
      if (brain.form === 'cocoon') {
        if (!ctx.sky?.bedtime && brain.needs.need_energy >= RESTED) hatch(brain, ctx, out);
        return out;
      }
      if (ctx.impact > WAKE_IMPACT) out.notices.push(...wakeBug(brain, true, rng, ctx.tick));
      // Rested, it wakes on its own; but never in the middle of its night.
      else if (brain.needs.need_energy >= RESTED && !ctx.sky?.bedtime)
        out.notices.push(...wakeBug(brain, false, rng, ctx.tick));
      return out;

    case 'st_rolled':
      // A real rolling ball: physics does the rest.
      if (--brain.timer <= 0 && speed < 0.6) {
        enter(brain, 'st_react', 60);
        out.notices.push({ type: 'curled', on: false }, react(brain, 'peek', rng, ctx.tick));
      }
      return out;

    case 'st_hide': {
      const dx = brain.targetX - state.x;
      if (Math.abs(dx) > 0.15 && brain.timer > 60 && n) {
        if (stepToward(brain, ctx, dx, moved, out, 1.4) === 'blocked') brain.targetX = state.x;
        if (brain.mode !== 'st_hide') return out;
        brain.facing = dx > 0 ? -1 : 1;
        return out;
      }
      out.velocity = n ? grip(n) : null;
      if (--brain.timer <= 0) {
        const cover = brain.targetId;
        enter(brain, 'st_react', 60);
        clearIntent(brain);
        out.notices.push({ type: 'hid', coverId: cover, on: false }, react(brain, 'peek', rng, ctx.tick));
      }
      return out;
    }

    case 'st_perform':
      return perform(brain, ctx, out);

    case 'st_ride':
      return updateRide(me, brain, ctx, out);

    case 'st_social':
      return updateSocial(me, brain, ctx, moved, out);

    case 'st_idle':
      return idle(me, brain, ctx, out);

    case 'st_wander': {
      if (offeredNear(ctx)) {
        enterIdle(brain, rng, def);
        out.velocity = n ? grip(n) : null;
        return out;
      }
      if (--brain.decideIn <= 0) {
        brain.decideIn = DECIDE_EVERY;
        if (n && choose(me, brain, ctx, out)) return out;
      }
      const dx = brain.targetX - state.x;
      if (Math.abs(dx) < ARRIVE || --brain.timer <= 0) {
        if (brain.overhead || brain.rolling) setDown(brain, ctx, out);
        enterIdle(brain, rng, def);
        out.velocity = n ? grip(n) : null;
        if (def.swim === 'skate' && ctx.overWater?.(state.x))
          out.notices.push({ type: 'fidgeted', fidget: 'twirl' });
        return out;
      }
      if (brain.rolling && n) {
        // Barty rolls his ball along behind him, walking backward, pushing with his back legs.
        const dir: 1 | -1 = dx > 0 ? 1 : -1;
        if (stepToward(brain, ctx, dx, moved, out, 0.7, false) === 'blocked') {
          setDown(brain, ctx, out);
          enterIdle(brain, rng, def);
          out.velocity = grip(n);
        }
        brain.facing = dir === 1 ? -1 : 1;
        return out;
      }
      return walk(brain, ctx, dx, moved, out);
    }

    case 'st_seek':
      return seek(me, brain, ctx, moved, out);

    case 'st_swim':
      return swim(brain, ctx, moved, out);

    case 'st_eat': {
      out.velocity = n ? grip(n) : null;
      const itemId = brain.mouthful;
      const food = itemId === null ? null : ctx.target(itemId);
      if (itemId === null || !food) {
        brain.mouthful = null;
        enterIdle(brain, rng, def);
        return out;
      }
      if (--brain.timer > 0) return out;
      const liking = likingOf(def, food.defId);
      brain.mouthful = null;
      recordUse(brain, itemId, ctx.tick);
      if (liking === 'disliked') {
        // Chews once, pulls a face, and spits it out. Grumpy for a bit.
        out.spit = { itemId };
        brain.grumpyUntil = ctx.tick + GRUMPY_TICKS;
      } else {
        addNeeds(brain.needs, { need_hunger: FOOD_DELTA[liking] });
        out.eat = { itemId, liking };
        if (brain.needs.need_hunger >= FULL_BELLY) brain.burpAt = ctx.tick + BURP_DELAY;
      }
      enter(brain, 'st_react', FED_REACT_TICKS[liking]);
      clearIntent(brain);
      out.notices.push(react(brain, `fed_${liking}`, rng, ctx.tick));
      return out;
    }

    case 'st_held':
    case 'st_pocketed':
      return out;
  }
}

/** Five leafy meals, and the next night Munch spins a cocoon. */
export const METAMORPHOSIS_MEALS = 5;

/** Morning: out of the cocoon comes a butterfly (or, the second time round, a caterpillar again). */
function hatch(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const was = brain.form;
  delete brain.form;
  if (was === 'cocoon' && !brain.wasButterfly) {
    brain.form = 'butterfly';
    brain.wasButterfly = true;
  } else delete brain.wasButterfly;
  enter(brain, 'st_react', 90);
  clearIntent(brain);
  out.notices.push(
    { type: 'changed', form: brain.form === 'butterfly' ? 'butterfly' : 'caterpillar' },
    react(brain, 'join', ctx.rng, ctx.tick),
  );
}

/** Set down what is held overhead (Moose) or rolled along (Barty), with a happy grunt. */
function setDown(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const id = brain.carrying;
  brain.carrying = null;
  delete brain.overhead;
  delete brain.rolling;
  if (id === null) return;
  addNeeds(brain.needs, { need_fun: 8 });
  out.notices.push(react(brain, 'play', ctx.rng, ctx.tick));
}

/**
 * Prim karate-chops something floating down past her: a feather, a petal, a
 * leaf in the wind. Never the player's things. Returns true if she chopped.
 */
function chop(brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const { state, rng, tick } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  if (brain.used.some((u) => u.id === kindUseId(99) && tick - u.tick < 4 * SIM_HZ)) return false;
  const floating = world
    .loose()
    .find(
      (l) =>
        !l.edible &&
        l.speed > 0.4 &&
        l.top < state.y &&
        Math.abs(l.x - state.x) < CHOP_REACH &&
        Math.abs(l.y - (state.y - ctx.def.radius)) < CHOP_REACH &&
        world.isLight?.(l.id) !== false,
    );
  if (!floating) return false;
  brain.facing = floating.x >= state.x ? 1 : -1;
  recordUse(brain, kindUseId(99), tick);
  addNeeds(brain.needs, { need_fun: 12 });
  enter(brain, 'st_react', 50);
  out.notices.push({ type: 'chopped', itemId: floating.id }, react(brain, 'chop', rng, tick));
  out.velocity = ctx.support ? grip(ctx.support) : null;
  return true;
}

/**
 * A hidden bug waiting to be found (M7) keeps to itself: Moose waves his
 * legs on his back, Barty rolls his ball to and fro, and Twig stays a twig.
 * Its needs stay where they are until it joins.
 */
function pendingBug(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { state, def } = ctx;
  const n = ctx.support;
  if (ctx.held) {
    if (brain.mode !== 'st_held') enter(brain, 'st_held');
    return out;
  }
  if (brain.mode === 'st_held' || !n) {
    if (brain.mode === 'st_held') enter(brain, 'st_airborne');
    if (!n) return out;
  }
  if (brain.pending !== 'aloof') {
    enter(brain, brain.pending === 'stuck' ? 'st_react' : 'st_idle', 60);
    out.velocity = grip(n);
    return out;
  }
  // Barty: back and forth by his resting spot, nudging his ball along.
  if (brain.mode !== 'st_wander' || Math.abs(brain.targetX - state.x) < 0.2) {
    enter(brain, 'st_wander', 6 * SIM_HZ);
    brain.targetX = brain.restX + (state.x > brain.restX ? -1.6 : 1.6);
  }
  brain.facing = brain.targetX > state.x ? 1 : -1;
  out.velocity = walkVelocity(n, brain.facing * def.speed * 0.45);
  return out;
}

function idle(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { def, state, tick } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  if (offeredNear(ctx)) {
    // Food on offer: turn to it and wait, instead of wandering off.
    brain.facing = ctx.offered!.x >= state.x ? 1 : -1;
    brain.timer = Math.max(brain.timer, 30);
    out.velocity = n ? grip(n) : null;
    return out;
  }
  out.velocity = n ? grip(n) : null;
  if (def.habits.rowsPebbles && Math.abs(state.x - brain.restX) > 12) brain.restX = state.x;
  // Woken early and still tired: back to sleep.
  if (brain.napAt >= 0 && tick >= brain.napAt) {
    brain.napAt = -1;
    if (brain.needs.need_energy < 50 && n) {
      out.notices.push(...enterSleep(brain, def, state.x));
      return out;
    }
  }
  if (def.habits.crowdShy && n) {
    const crowd = world
      .bugs()
      .filter((o) => o.id !== me && Math.hypot(o.x - state.x, o.y - state.y) < CROWD_RANGE);
    if (crowd.length >= CROWD) {
      const cx = crowd.reduce((a, o) => a + o.x, 0) / crowd.length;
      const away = state.x >= cx ? 1 : -1;
      // Too many bugs: hop clear of them, then drift off.
      const landX = state.x + away * 3.2;
      brain.facing = away;
      if (clearLanding(ctx, landX)) {
        startWander(brain, ctx, landX + away * 2);
        launch(
          brain,
          out,
          hopVelocity(state.x, state.y, landX, world.surfaceY(landX) - def.radius, 0.7),
          state.y,
        );
        return out;
      }
      startWander(brain, ctx, state.x + away * 4);
      return out;
    }
  }
  if (brain.overhead || brain.rolling) {
    // Carrying something heavy overhead, or rolling a ball: off somewhere with it.
    if (n && brain.timer-- <= 0) startWander(brain, ctx);
    out.velocity = n ? grip(n) : null;
    return out;
  }
  if (def.habits.chops && n && chop(brain, ctx, out)) return out;
  brain.timer--;
  if (--brain.decideIn <= 0) {
    brain.decideIn = DECIDE_EVERY;
    if (n && choose(me, brain, ctx, out)) return out;
  }
  if (tick >= brain.fidgetAt && n) {
    fidget(brain, ctx, out);
    if (brain.mode !== 'st_idle') return out;
  }
  if (brain.timer <= 0 && n) startWander(brain, ctx);
  return out;
}

/** Flying, falling, hopping, and bouncing, and how each landing ends. */
function airborne(
  me: EntityId,
  brain: BugBrain,
  ctx: BugContext,
  speed: number,
  out: BugDecision,
): BugDecision {
  const { def, state, rng } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  brain.airPeak = Math.max(brain.airPeak, ctx.impact);
  brain.airTop = Math.min(brain.airTop, state.y);
  const settled = def.curlsWhenFlung && !brain.selfLaunched ? speed < 1.2 : ctx.impact > 0 || speed < 1;
  if (!n || !settled) return out;
  const fall = state.y - brain.airTop;
  out.notices.push({ type: 'landed', speed: brain.airPeak });
  const glided = brain.gliding;
  brain.gliding = false;
  out.velocity = grip(n);
  if (!brain.selfLaunched && brain.airPeak >= DIZZY_SPEED && def.dizzyProof) {
    // Glorp never gets dizzy: he pulls into his shell and spins like a top.
    enter(brain, 'st_react', SHELL_TICKS);
    clearIntent(brain);
    out.notices.push(react(brain, 'land_hard', rng, ctx.tick));
  } else if (!brain.selfLaunched && brain.airPeak >= DIZZY_SPEED) {
    const ticks = makeDizzy(brain, brain.airPeak, ctx.tick);
    out.notices.push({ type: 'dizzy', speed: brain.airPeak, durationTicks: ticks });
  } else if (brain.selfLaunched && brain.resume !== null) {
    // A hop on the way somewhere: carry on.
    brain.mode = brain.resume;
    brain.resume = null;
    brain.stuck = 0;
  } else if (
    brain.selfLaunched &&
    brain.mode === 'st_use' &&
    brain.targetId !== null &&
    !brain.done &&
    brain.tries + 1 < HOP_TRIES
  ) {
    // Missed the spring. Try again.
    brain.tries++;
    brain.mode = 'st_seek';
    brain.timer = SEEK_TIMEOUT;
    brain.stuck = 0;
  } else if (brain.selfLaunched && brain.action === 'sleep') {
    out.notices.push(...enterSleep(brain, def, state.x));
  } else if (brain.selfLaunched && brain.action === 'soc_ride' && brain.social) {
    const mount = world.bug(brain.social.partner);
    const onHead =
      !!mount && Math.abs(state.x - mount.x) < mount.def.radius && state.y < mount.y - mount.def.radius * 0.5;
    if (mount && onHead) {
      engage(me, brain, mount, 'soc_ride', ctx, out);
      out.notices.push({ type: 'rode', mountId: mount.id, on: true });
    } else {
      brain.social = null;
      enterIdle(brain, rng, def);
    }
  } else if (brain.selfLaunched && glided) {
    // Dot's glide down from the top: "again!"
    addNeeds(brain.needs, { need_fun: 25, need_social: 5 });
    recordUse(brain, SPOT_TOP, ctx.tick);
    enter(brain, 'st_landing', LANDING_TICKS);
    clearIntent(brain);
    out.notices.push(
      { type: 'used', action: 'perform', targetId: null },
      react(brain, 'land', rng, ctx.tick),
    );
  } else if (!brain.selfLaunched && def.curlsWhenFlung && fall > CURL_FALL) {
    // Dropped from high up: stays curled for a while.
    out.notices.push(...curl(brain, rng));
    out.velocity = null;
  } else if (
    !brain.selfLaunched &&
    def.habits.hops &&
    brain.touchedAt >= 0 &&
    ctx.tick - brain.touchedAt < 5 * SIM_HZ
  ) {
    // Boing loves a fling: he uses the landing to hop again.
    out.notices.push(react(brain, 'land', rng, ctx.tick));
    const toX = state.x + brain.facing * 1.2;
    if (clearLanding(ctx, toX)) {
      enter(brain, 'st_airborne');
      brain.selfLaunched = true;
      brain.airPeak = 0;
      brain.airTop = state.y;
      out.velocity = { x: brain.facing * 1.8, y: -7.5 };
      out.notices.push({ type: 'hopped' });
      clearIntent(brain);
      return out;
    }
    enter(brain, 'st_landing', LANDING_TICKS);
    clearIntent(brain);
  } else {
    enter(brain, 'st_landing', LANDING_TICKS);
    clearIntent(brain);
    if (!brain.selfLaunched) out.notices.push(react(brain, 'land', rng, ctx.tick));
  }
  brain.selfLaunched = false;
  return out;
}

/** Sniffing something new (`st_use` with `inspect`). */
function use(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { rng, tick, def } = ctx;
  const target = brain.targetId === null ? null : ctx.target(brain.targetId);
  if (target) face(brain, ctx, target.x, out);
  else out.velocity = ctx.support ? grip(ctx.support) : null;
  if (--brain.timer > 0 && target && !target.held) return out;
  const id = brain.targetId;
  if (id !== null && target) {
    addNeeds(brain.needs, { need_fun: 8 });
    recordUse(brain, id, tick);
    if (!brain.inspected.includes(id)) brain.inspected.push(id);
    if (brain.inspected.length > 64) brain.inspected.shift();
    out.notices.push(
      { type: 'inspected', itemId: id },
      { type: 'used', action: 'inspect', targetId: id },
      react(brain, 'inspect', rng, tick),
    );
    enter(brain, 'st_react', 60);
    brain.targetId = id;
    brain.action = null;
    return out;
  }
  enterIdle(brain, rng, def);
  return out;
}

/** Dot posing at the top (then leaping off to glide down), or for the camera. */
function perform(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { def, state, rng, tick } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  out.velocity = ctx.support ? grip(ctx.support) : null;
  if (brain.action === 'dance') {
    // Dancing on the stage: a new move every couple of seconds.
    if (brain.timer % 150 === 0 && brain.timer > 0) out.notices.push(react(brain, 'dance', rng, tick));
    if (--brain.timer > 0) return out;
    addNeeds(brain.needs, { need_fun: 26, need_social: 10 });
    recordUse(brain, SPOT_STAGE, tick);
    out.notices.push({ type: 'used', action: 'dance', targetId: null });
    enterIdle(brain, rng, def);
    return out;
  }
  if (--brain.timer > 0) return out;
  if (brain.targetId === SPOT_TOP) {
    const top = world.summit(state.x);
    if (top && ctx.support) {
      const edges = [
        { dir: -1 as const, x: top.x0 },
        { dir: 1 as const, x: top.x1 },
      ].sort((a, b) => Math.abs(a.x - state.x) - Math.abs(b.x - state.x));
      for (const edge of edges) {
        const landX = edge.x + edge.dir * rng.range(3.2, 4.2);
        // Gliding drifts, so keep the whole way down clear of the player's things.
        if (
          !clearLanding(ctx, landX) ||
          world.setupBetween(Math.min(edge.x, landX) - 2, Math.max(edge.x, landX) + 2)
        )
          continue;
        // Leap off the edge and glide down with wings open.
        brain.facing = edge.dir;
        const toY = world.surfaceY(landX) - def.radius;
        const v = hopVelocity(state.x, state.y, landX, toY, 1.1);
        enter(brain, 'st_airborne');
        brain.targetId = SPOT_TOP;
        brain.selfLaunched = true;
        brain.gliding = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        out.velocity = { x: v.x, y: Math.min(v.y, -5.5) };
        out.notices.push({ type: 'hopped' });
        return out;
      }
    }
  }
  // Posed for the camera (or nowhere safe to leap): take a bow.
  addNeeds(brain.needs, { need_fun: 12, need_social: 20 });
  recordUse(brain, brain.targetId ?? SPOT_CAMERA, tick);
  out.notices.push({ type: 'used', action: 'perform', targetId: null });
  enterIdle(brain, rng, def);
  return out;
}

/** Where to stand to use a target, and whether the bug is there yet. */
function seek(me: EntityId, brain: BugBrain, ctx: BugContext, moved: number, out: BugDecision): BugDecision {
  const { def, state, rng, tick } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  const id = brain.targetId;
  const giveUp = (): BugDecision => {
    // Could not get there: go off it for a while instead of trying again at once.
    if (id !== null) remember(brain, id, false, tick);
    brain.social = null;
    brain.carrying = null;
    enterIdle(brain, rng, def);
    out.velocity = n ? grip(n) : null;
    return out;
  };
  if (--brain.timer <= 0 || id === null) return giveUp();

  // Places: the water's edge, the top of the stump, the camera, the pebble row.
  if (id < 0) {
    const dx = brain.targetX - state.x;
    if (Math.abs(dx) < (id === SPOT_TOP || id === SPOT_STAGE ? 0.8 : 0.2) && n) {
      if (id === SPOT_WATER) {
        const edge = world.waterEdge(state.x);
        const dir = edge?.dir ?? brain.facing;
        brain.facing = dir;
        addNeeds(brain.needs, { need_fun: 10 });
        recordUse(brain, SPOT_WATER, tick);
        out.notices.push({ type: 'used', action: 'splash', targetId: null });
        enter(brain, 'st_airborne');
        brain.selfLaunched = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        clearIntent(brain);
        out.velocity = { x: dir * 2.6, y: -5 };
        out.notices.push({ type: 'hopped' });
        return out;
      }
      if (id === SPOT_PICNIC) {
        // Snack time next to a friend.
        const food = brain.carrying === null ? null : ctx.target(brain.carrying);
        if (brain.carrying === null || !food) return giveUp();
        const itemId = brain.carrying;
        addNeeds(brain.needs, { need_social: 8 });
        const liking = feedBug(brain, def, itemId, food.defId);
        out.take = { itemId, liking };
        out.velocity = grip(n);
        return out;
      }
      if (id === SPOT_ROW) {
        // Set the pebble down in its place in the row.
        brain.facing = 1;
        if (brain.carrying !== null) recordUse(brain, brain.carrying, tick);
        brain.carrying = null;
        addNeeds(brain.needs, { need_fun: 12 });
        out.notices.push({ type: 'used', action: 'carry', targetId: null });
        enterIdle(brain, rng, def);
        out.velocity = grip(n);
        return out;
      }
      if (id === SPOT_STAGE) {
        const stage = world.stage?.() ?? null;
        if (!stage || !(state.y < stage.y && state.x > stage.x0 && state.x < stage.x1))
          return walk(brain, ctx, dx || brain.facing, moved, out);
        enter(brain, 'st_perform', rng.int(DANCE_TICKS[0], DANCE_TICKS[1]));
        brain.targetId = SPOT_STAGE;
        brain.action = 'dance';
        out.velocity = grip(n);
        out.notices.push(react(brain, 'dance', rng, tick));
        return out;
      }
      if (id === SPOT_TOP || id === SPOT_CAMERA) {
        const top = world.summit(state.x);
        if (id === SPOT_TOP && !(top && state.y < top.y))
          return walk(brain, ctx, dx || brain.facing, moved, out);
        const targetId = id;
        enter(brain, 'st_perform', POSE_TICKS);
        brain.targetId = targetId;
        brain.action = 'perform';
        out.velocity = grip(n);
        out.notices.push({ type: 'posed' }, react(brain, 'show_off', rng, tick));
        return out;
      }
      return giveUp();
    }
    return walk(brain, ctx, dx, moved, out);
  }

  const target = ctx.target(id);
  if (!target || target.held) return giveUp();
  // Someone else picked it up first (snatching is its own game).
  if (target.kind === 'item' && world.bugs().some((o) => o.id !== me && o.brain.carrying === id))
    return giveUp();
  const s = brain.social;
  const partner = s ? world.bug(s.partner) : null;
  if (s && !partner) return giveUp();

  // A bug to play with.
  if (s && partner && s.stage >= 1 && id === partner.id) {
    const kind = s.kind;
    const side = partner.x >= state.x ? 1 : -1;
    const gap = Math.abs(partner.x - state.x) - def.radius - partner.def.radius;
    if (kind === 'soc_catch') {
      const d = Math.abs(partner.x - state.x);
      if (d >= CATCH_NEAR && d <= CATCH_FAR && n) {
        if (!available(partner)) return giveUp();
        brain.facing = side;
        engage(me, brain, partner, kind, ctx, out);
        brain.timer = CATCH_WINDUP;
        out.velocity = grip(n);
        return out;
      }
      const want = d < CATCH_NEAR ? -side * 2 : side * (d - 2.8);
      if (stepToward(brain, ctx, want, moved, out) === 'blocked') return giveUp();
      return out;
    }
    if (kind === 'soc_ride') {
      if (gap < 1.4 && n) {
        const topY = partner.y - partner.def.radius - def.radius - 0.05;
        // A player setup right there: not worth the risk of falling on it.
        if (!clearLanding(ctx, partner.x)) return giveUp();
        brain.facing = side;
        out.velocity = hopVelocity(state.x, state.y, partner.x, topY, 0.45);
        enter(brain, 'st_airborne');
        brain.selfLaunched = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        brain.targetId = partner.id;
        brain.action = 'soc_ride';
        out.notices.push({ type: 'hopped' });
        return out;
      }
      return walkOrGiveUp(
        brain,
        ctx,
        partner.x - side * (def.radius + partner.def.radius + 0.9) - state.x,
        moved,
        out,
        giveUp,
      );
    }
    if (gap < 0.4 && n) {
      brain.facing = side;
      out.velocity = grip(n);
      if (kind === 'soc_comfort') {
        if (partner.brain.mode !== 'st_dizzy') return giveUp();
        engage(me, brain, partner, kind, ctx, out);
        return out;
      }
      if (kind === 'soc_steal') {
        const item = partner.brain.carrying;
        if (item === null || partner.held) return giveUp();
        // Snatch! Then run for it.
        if (partner.brain.social)
          endSocial(partner.id, partner.brain, { ...ctx, def: partner.def }, false, out);
        partner.brain.carrying = null;
        brain.carrying = item;
        brain.social = { ...s, item };
        out.notices.push({ type: 'snatched', partnerId: partner.id, itemId: item });
        enter(partner.brain, 'st_idle', 60);
        out.notices.push({ ...react(partner.brain, 'robbed', rng, tick), by: partner.id });
        engage(me, brain, partner, kind, ctx, out);
        return out;
      }
      if (!available(partner)) return giveUp();
      engage(me, brain, partner, kind, ctx, out);
      return out;
    }
    const chaseSpeed = kind === 'soc_comfort' || kind === 'soc_steal' ? 1.35 : 1;
    const standX = partner.x - side * (def.radius + partner.def.radius + 0.2);
    if (stepToward(brain, ctx, standX - state.x, moved, out, chaseSpeed) === 'blocked') return giveUp();
    return out;
  }

  // An item: stand beside it (a bit back for the spring).
  const side = target.x >= state.x ? 1 : -1;
  const action = brain.action;
  // Stand back a little from a spring, or from something being sniffed.
  const gap = action === 'bounce' || action === 'inspect' ? 0.3 : 0.04;
  const standX = target.x - side * (def.radius + target.halfWidth + gap);
  brain.targetX = standX;
  const dx = standX - state.x;
  const edgeGap = Math.abs(target.x - state.x) - def.radius - target.halfWidth;
  const arrived = Math.abs(dx) < ARRIVE || (edgeGap < gap + 0.1 && Math.sign(dx) !== side);
  if (!arrived || !n) {
    if (!n || action !== 'inspect' || edgeGap > 3) return walkOrGiveUp(brain, ctx, dx, moved, out, giveUp);
    // Something in the way of a new thing: have a good look from here instead.
    if (stepToward(brain, ctx, dx, moved, out) !== 'blocked') return out;
    brain.facing = side;
    out.velocity = grip(n);
    enter(brain, 'st_use', rng.int(INSPECT_TICKS[0], INSPECT_TICKS[1]));
    return out;
  }
  brain.facing = side;
  out.velocity = grip(n);
  if (s && s.stage === 0 && s.item === id) {
    // Picked up the toy or snack; now go and find the friend.
    if (world.isSetup(id) || world.bugs().some((o) => o.brain.carrying === id)) return giveUp();
    brain.carrying = id;
    s.stage = 1;
    brain.targetId = s.partner;
    brain.timer = SEEK_TIMEOUT;
    return out;
  }
  switch (action) {
    case 'eat': {
      // Sometimes a snack is nicer next to a friend: carry it over first.
      const pal =
        brain.needs.need_hunger > 15 && def.traits.sociable >= 0.5 && !world.isSetup(id)
          ? world
              .bugs()
              .find(
                (o) =>
                  o.id !== me &&
                  o.supported &&
                  o.brain.mode !== 'st_sleep' &&
                  Math.abs(o.x - state.x) < 6 &&
                  Math.abs(o.y - state.y) < 1.5 &&
                  world.affinity(def.id, o.defId) >= 0.3,
              )
          : undefined;
      if (pal && rng.chance(PICNIC_CHANCE)) {
        const toward = pal.x >= state.x ? 1 : -1;
        brain.carrying = id;
        brain.targetId = SPOT_PICNIC;
        brain.targetX = pal.x - toward * (def.radius + pal.def.radius + 0.35);
        brain.timer = SEEK_TIMEOUT;
        return out;
      }
      const liking = feedBug(brain, def, id, target.defId);
      out.take = { itemId: id, liking };
      return out;
    }
    case 'bounce': {
      if (Math.abs(target.angle) > 0.5) return giveUp(); // The spring fell over.
      // Hop onto the spring's top.
      const topY = target.y - target.halfHeight - def.radius - 0.02;
      out.velocity = hopVelocity(state.x, state.y, target.x - side * 0.04, topY);
      enter(brain, 'st_use');
      brain.selfLaunched = true;
      brain.airPeak = 0;
      brain.airTop = state.y;
      out.notices.push({ type: 'hopped' });
      return out;
    }
    case 'inspect':
      enter(brain, 'st_use', rng.int(INSPECT_TICKS[0], INSPECT_TICKS[1]));
      return out;
    case 'sleep': {
      if (target.kind === 'item' && target.halfHeight * 2 <= 0.35 && !world.isSetup(id)) {
        // Hop up onto it and curl up there.
        const topY = target.y - target.halfHeight - def.radius - 0.02;
        out.velocity = hopVelocity(state.x, state.y, target.x, topY, 0.42);
        enter(brain, 'st_airborne');
        brain.targetId = id;
        brain.action = 'sleep';
        brain.selfLaunched = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        out.notices.push({ type: 'hopped' });
        return out;
      }
      out.notices.push(...enterSleep(brain, def, state.x));
      return out;
    }
    case 'shelter': {
      // Up over its head it goes: an umbrella.
      if (world.isSetup(id) || brain.carrying !== null || world.bugs().some((o) => o.brain.carrying === id))
        return giveUp();
      brain.carrying = id;
      brain.umbrella = true;
      recordUse(brain, id, tick);
      addNeeds(brain.needs, { need_fun: 4 });
      out.notices.push({ type: 'umbrella', itemId: id, on: true });
      enterIdle(brain, rng, def);
      return out;
    }
    case 'lift': {
      if (target.kind === 'bug') {
        // Moose pulls a friend free of something sticky.
        const friend = world.bug(id);
        if (!friend) return giveUp();
        addNeeds(brain.needs, { need_social: 20, need_fun: 6 });
        recordUse(brain, id, tick);
        out.notices.push({ type: 'freed', partnerId: id }, react(brain, 'play', rng, tick));
        enter(brain, 'st_react', 50);
        return out;
      }
      // Up over his head it goes.
      if (world.isSetup(id) || brain.carrying !== null || world.bugs().some((o) => o.brain.carrying === id))
        return giveUp();
      brain.carrying = id;
      brain.overhead = true;
      recordUse(brain, id, tick);
      addNeeds(brain.needs, { need_fun: 14 });
      out.notices.push({ type: 'used', action: 'lift', targetId: id });
      enter(brain, 'st_idle', 50);
      brain.targetId = id;
      brain.action = null;
      return out;
    }
    case 'roll': {
      // Barty gets behind a round thing and rolls it along, walking backward.
      if (world.isSetup(id) || brain.carrying !== null || world.bugs().some((o) => o.brain.carrying === id))
        return giveUp();
      brain.carrying = id;
      brain.rolling = true;
      recordUse(brain, id, tick);
      addNeeds(brain.needs, { need_fun: 10 });
      const away = rng.chance(0.5) ? 1 : -1;
      startWander(brain, ctx, state.x + away * rng.range(ROLL_WALK[0], ROLL_WALK[1]));
      out.notices.push({ type: 'used', action: 'roll', targetId: id });
      return out;
    }
    case 'carry': {
      if (world.isSetup(id) || world.bugs().some((o) => o.brain.carrying === id)) return giveUp();
      const row = rowSlots(brain, ctx);
      const slot = row.free[0];
      if (slot === undefined) return giveUp();
      // Pick it up and take it to the next free place in the row, arms out over the spot.
      brain.carrying = id;
      brain.targetId = SPOT_ROW;
      brain.targetX = slot - def.radius * 0.95;
      brain.timer = SEEK_TIMEOUT;
      return out;
    }
    default:
      return giveUp();
  }
}

/** Walk, and give up if the way is blocked. */
function walkOrGiveUp(
  brain: BugBrain,
  ctx: BugContext,
  dx: number,
  moved: number,
  out: BugDecision,
  giveUp: () => BugDecision,
): BugDecision {
  if (!ctx.support) return out;
  if (stepToward(brain, ctx, dx, moved, out) === 'blocked') return giveUp();
  return out;
}

/**
 * Swimming (game design doc, section 5, `st_swim`): paddle, float, or walk
 * the bottom toward the nearest shore, then shake dry on land. Boing kicks
 * furiously and shoots out in one big hop.
 */
function swim(brain: BugBrain, ctx: BugContext, moved: number, out: BugDecision): BugDecision {
  const { def, state } = ctx;
  const n = ctx.support;
  const depth = ctx.submerged ?? 0;
  if (depth < 0.06 && n) {
    // Out of the water and on its feet: shake it all off.
    enter(brain, 'st_react', SHAKE_DRY_TICKS);
    out.notices.push({ type: 'shook_dry' }, react(brain, 'shake_dry', ctx.rng, ctx.tick));
    out.velocity = grip(n);
    return out;
  }
  const shore = ctx.shore ?? state.x;
  const dir: 1 | -1 = shore >= state.x ? 1 : -1;
  brain.facing = dir;
  brain.timer++;
  if (def.habits.hops && brain.timer === 40) {
    const dist = Math.abs(shore - state.x) + 1;
    out.velocity = { x: dir * Math.min(7, dist / 0.9), y: -9.5 };
    out.notices.push({ type: 'hopped' });
    return out;
  }
  brain.stuck = moved < 0.004 ? brain.stuck + 1 : 0;
  if (brain.stuck > STUCK_TICKS && (n || def.swim !== 'sink')) {
    // Bumping a lily pad or a steep bank: kick up and over.
    brain.stuck = 0;
    out.velocity = { x: dir * 2.2, y: -6 };
    out.notices.push({ type: 'hopped' });
    return out;
  }
  if (def.swim === 'sink') {
    // Holding his breath, walking along the bottom.
    out.velocity = n ? walkVelocity(n, dir * def.speed * 0.7) : { x: dir * def.speed * 0.3, y: state.vy };
    return out;
  }
  if (n && depth < 0.5) {
    // Touching the bank: climb out.
    out.velocity = walkVelocity(n, dir * Math.max(1, def.speed));
    return out;
  }
  // Paddle: little surges in rhythm.
  const stroke = 0.6 + 0.4 * Math.max(0, Math.sin(ctx.tick * 0.25));
  out.velocity = { x: dir * Math.max(0.6, def.speed * 0.55) * stroke, y: state.vy };
  return out;
}

function offeredNear(ctx: BugContext): boolean {
  const o = ctx.offered;
  return !!o && !!ctx.support && Math.hypot(o.x - ctx.state.x, o.y - ctx.state.y) < OFFER_RANGE;
}

/** Is a bug among `bugs` a friend within `range` of x (affinity at least 0.3)? */
export function friendNear(
  bugs: readonly OtherBug[],
  me: EntityId,
  def: BugDef,
  x: number,
  range: number,
  affinity: (a: string, b: string) => number,
): boolean {
  return bugs.some(
    (o) =>
      o.id !== me &&
      Math.abs(o.x - x) < range &&
      affinity(def.id, o.defId) >= 0.3 &&
      o.brain.mode !== 'st_sleep',
  );
}
