import type { BugBrain, BugMode, Entity, EntityId, SocialKind } from '../core/entities';
import { SOCIAL_KINDS } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Rng } from '../core/rng';
import { DIZZY_SPEED } from '../constants';
import type { BugDef, NeedId } from '../data/types';
import { NEED_IDS } from '../data/types';
import type { Liking, ReactionType } from '../events';
import type { AdvertCandidate, BugContext, BugDecision, BugNotice, OtherBug } from './bugTypes';
import { EMPTY_WORLD } from './bugTypes';
import {
  ARRIVE,
  DECIDE_EVERY,
  SEEK_TIMEOUT,
  clearIntent,
  enter,
  enterIdle,
  grip,
  kindUseId,
  memoryModifier,
  react,
  recordUse,
  remember,
  stepToward,
  walk,
  walkVelocity,
} from './bugMove';
import { endSocial, updateRide, updateSocial } from './bugSocial';
import { sliding } from './bugMachines';
import { addNeeds, decayNeeds, freshNeeds, urgency } from './needs';

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
import { choose, inPile, letGo, start } from './bugChoose';
import {
  BURP_DELAY,
  CHEW_TICKS,
  FED_REACT_TICKS,
  FOOD_DELTA,
  FRESH_BONUS,
  FULL_BELLY,
  GROGGY_TICKS,
  GRUMPY_TICKS,
  LIKE_MULTIPLIER,
  PERCEPTION,
  OFFER_RANGE,
  POKE_WINDOW,
  REACT_TICKS,
  RECENT_KIND,
  RECENT_USE,
  RECOVER_TICKS,
  RENAP_TICKS,
  REPEAT_WINDOW,
  RESTED,
  SHY_RANGE,
  SMELL_EVERY,
  SOCIAL_SET,
  STINK_FLEE,
  STINK_REACT_TICKS,
  SWIM_DEPTH,
  TICKLE_FREE_TICKS,
  TICKLE_LEVEL_TICKS,
  TUMBLE_SPEED,
  WAKE_IMPACT,
  WOOZY_TICKS,
} from './bugTuning';
import {
  airborne,
  hatch,
  idle,
  offeredNear,
  pendingBug,
  perform,
  seek,
  setDown,
  swim,
  use,
} from './bugStates';
export { EMPTY_WORLD, SPOT_CAMERA, SPOT_SLEEP_HERE, SPOT_STAGE, SPOT_TOP, SPOT_WATER } from './bugTypes';
export { hopVelocity, memoryModifier, pickVariant, react, remember } from './bugMove';
export { moodOf, urgency } from './needs';
export { catchTurn, handPoint, leadState } from './bugSocial';
export {
  FRESH_TICKS,
  FULL_BELLY,
  GAWK_RANGE,
  IGNORED_TICKS,
  OFFER_RANGE,
  PERCEPTION,
  ROW_GAP,
  SHAKE_DRY_TICKS,
  SHELL_TICKS,
  SHY_RANGE,
  SMELL_EVERY,
  SWIM_DEPTH,
  TICKLE_FREE_TICKS,
  TICKLE_LEVEL_TICKS,
  WOOZY_TICKS,
} from './bugTuning';

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
    (brain.mode === 'st_use' && brain.action === 'bounce') ||
    sliding(brain)
  );
}

/**
 * Put food in a bug's mouth: it starts chewing. The sim moves the item
 * into the mouth. Used both when the bug picks food up itself and when the
 * player drops food on its mouth.
 */
export function feedBug(
  brain: BugBrain,
  def: BugDef,
  itemId: EntityId,
  itemDefId: string,
  drink = false,
  toasted = false,
): Liking {
  // A potion goes down in a couple of gulps, and everyone is game to try one.
  const plain = likingOf(def, itemDefId);
  const liking = drink ? 'liked' : toasted ? toastedLiking(plain) : plain;
  if (brain.carrying === itemId) brain.carrying = null;
  enter(brain, 'st_eat', drink ? DRINK_TICKS : CHEW_TICKS[liking]);
  brain.mouthful = itemId;
  brain.targetId = itemId;
  brain.action = 'eat';
  brain.tickle = 0;
  brain.gliding = false;
  return liking;
}

/** Stopping to cheer or stare lasts about a second and a half. */
const NOTICE_TICKS = 84;
/** Gulping a potion takes this long. */
export const DRINK_TICKS = 45;

/** Modes a bug drops to stop and react to something (a cheer, a "huh?"). */
const STOPPABLE: ReadonlySet<BugMode> = new Set<BugMode>([
  'st_idle',
  'st_wander',
  'st_seek',
  'st_landing',
  'st_recover',
  'st_react',
  'st_use',
]);

/**
 * Something happened that this bug reacts to (M8: a cheer at the bubbling
 * cauldron, a suspicious look at the bench). It stops for a moment if it was
 * only pottering about; busy, held, or sleeping bugs do not.
 */
export function reactBug(brain: BugBrain, type: ReactionType, rng: Rng, tick: number): BugNotice[] {
  if (!STOPPABLE.has(brain.mode) || brain.pending || brain.social) return [];
  enter(brain, 'st_react', NOTICE_TICKS);
  clearIntent(brain);
  return [react(brain, type, rng, tick)];
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

/**
 * Toasted food (rule R12) is a food of its own: toasting makes a meh snack
 * tasty and a yucky one bearable. Loved food stays loved.
 */
export function toastedLiking(liking: Liking): Liking {
  return liking === 'disliked' ? 'neutral' : liking === 'neutral' ? 'liked' : liking;
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
export function curl(brain: BugBrain, rng: Rng): BugNotice[] {
  enter(brain, 'st_rolled', rng.int(4 * SIM_HZ, 8 * SIM_HZ));
  clearIntent(brain);
  return [{ type: 'curled', on: true }];
}

/** Fall asleep right here. */
export function enterSleep(brain: BugBrain, def: BugDef, x: number): BugNotice[] {
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
  if (brain.machines)
    brain.machines = Object.fromEntries(Object.entries(brain.machines).map(([k, t]) => [k, t + ticks]));
  if (brain.wish) brain.wish = { ...brain.wish, until: brain.wish.until + ticks };
  if (brain.later !== undefined) brain.later += ticks;
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
  // Winding up to toss something into a bench tray or the cauldron.
  const tossing =
    brain.mode === 'st_use' && (brain.action === 'tinker' || brain.action === 'brew') && !brain.done;
  // Umbrellas, things lifted overhead, and balls rolled along stay in hand through everyday modes.
  const heldUp = (!!brain.umbrella || !!brain.overhead || !!brain.rolling) && UMBRELLA_MODES.has(brain.mode);
  if (brain.carrying !== null && !socialOk && !heldUp && !tossing) brain.carrying = null;
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
  sayLater(brain, ctx, out);
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
      // A sleepy potion keeps it asleep until it wears off.
      else if (brain.needs.need_energy >= RESTED && !ctx.sky?.bedtime && !ctx.drowsy)
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
      if (food.drink) {
        // Glug, glug, ahh: the sim pours the potion in.
        brain.mouthful = null;
        out.eat = { itemId, liking: 'liked' };
        enter(brain, 'st_react', FED_REACT_TICKS.liked);
        clearIntent(brain);
        out.notices.push(react(brain, 'drink', rng, ctx.tick));
        return out;
      }
      const liking = food.toasted ? toastedLiking(likingOf(def, food.defId)) : likingOf(def, food.defId);
      brain.mouthful = null;
      delete brain.later;
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

/** Busy with something: food held out gets a glance and a "later" instead of a stop (R21). */
const BUSY: ReadonlySet<BugMode> = new Set<BugMode>([
  'st_use',
  'st_perform',
  'st_social',
  'st_ride',
  'st_seek',
  'st_hide',
  'st_airborne',
]);
/** A "later" lasts this long: once free, the bug goes for food nearby. */
export const LATER_TICKS = 25 * SIM_HZ;
/** At most one "later" this often. */
const LATER_EVERY = 6 * SIM_HZ;

/**
 * Food held out to a busy bug (R21: Dot on the spring, a cheese puff at her
 * mouth). It can't stop, but it glances at it and says "later" with the
 * food in its bubble, and goes for food nearby once it is free. Disliked
 * food gets nothing; a bug already going to eat just carries on.
 */
function sayLater(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const o = ctx.offered;
  if (!o || !BUSY.has(brain.mode) || brain.pending || ctx.held) return;
  if (brain.mode === 'st_airborne' && !brain.selfLaunched) return;
  if (brain.mode === 'st_seek' && brain.action === 'eat') return;
  if (Math.hypot(o.x - ctx.state.x, o.y - ctx.state.y) > OFFER_RANGE) return;
  if (o.defId && likingOf(ctx.def, o.defId) === 'disliked') return;
  if (brain.later !== undefined && ctx.tick < brain.later - LATER_TICKS + LATER_EVERY) return;
  brain.later = ctx.tick + LATER_TICKS;
  out.notices.push(react(brain, 'later', ctx.rng, ctx.tick));
}

/** Five leafy meals, and the next night Munch spins a cocoon. */
export const METAMORPHOSIS_MEALS = 5;

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
