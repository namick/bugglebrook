import type { BugBrain, BugMode, Entity, EntityId, Needs } from '../core/entities';
import { SIM_DT, SIM_HZ } from '../core/loop';
import type { Rng } from '../core/rng';
import { DIZZY_SPEED, GRAVITY } from '../constants';
import type { AdvertAction, BugDef, NeedId } from '../data/types';
import { NEED_IDS } from '../data/types';
import type { Liking, Mood, ReactionType } from '../events';
import { REACTION_VARIANTS } from '../events';
import type { BodyState, Vec } from '../physics/physics';

/** Something a bug could go and do, offered by an object nearby. */
export interface AdvertCandidate {
  id: EntityId;
  defId: string;
  x: number;
  y: number;
  action: AdvertAction;
  needs: Readonly<Partial<Record<NeedId, number>>>;
  /** Another bug is already on its way to it. */
  claimed: boolean;
}

/** Where a target entity is right now. */
export interface TargetInfo {
  defId: string;
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

export interface BugContext {
  tick: number;
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
}

export interface Obstacle {
  id: EntityId;
  isBug: boolean;
  /** y of its top edge. */
  top: number;
}

/** Things the sim turns into game events. */
export type BugNotice =
  | { type: 'landed'; speed: number }
  | { type: 'dizzy'; speed: number; durationTicks: number }
  | { type: 'recovered' }
  | { type: 'chose'; action: AdvertAction; targetId: EntityId }
  | { type: 'hopped' }
  | { type: 'reacted'; reaction: ReactionType; variant: number }
  | { type: 'burped' }
  | { type: 'tickled'; level: number };

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
  notices: BugNotice[];
}

// Timings in ticks (60 per second).
const DECIDE_EVERY = Math.round(1.5 * SIM_HZ);
const SEEK_TIMEOUT = 10 * SIM_HZ;
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
const STUCK_TICKS = 45;
const HOP_TRIES = 3;
const HOP_TIME = 0.5;
/** Tallest thing a bug will hop over while walking, in meters. */
const STEP_HEIGHT = 0.7;
const REPEAT_WINDOW = 10 * SIM_HZ;
const RECENT_USE = 60 * SIM_HZ;

const WANDER_RANGE = 6;
const PERCEPTION = 9;
const ARRIVE = 0.12;
const TUMBLE_SPEED = 3.5;
const SCORE_FLOOR = 8;

/** Base need decay per second (game design doc, section 5). */
const DECAY: Readonly<Record<NeedId, number>> = { need_hunger: 0.25, need_fun: 0.3, need_energy: 0.1 };
/** Energy regained per second while resting. */
const REST_ENERGY = 0.3;

const FOOD_DELTA: Readonly<Record<Liking, number>> = { loved: 60, liked: 40, neutral: 20, disliked: 0 };
const LIKE_MULTIPLIER: Readonly<Record<Liking, number>> = {
  loved: 2,
  liked: 1.5,
  neutral: 1,
  disliked: 0.2,
};

const AIRBORNE: ReadonlySet<BugMode> = new Set(['st_airborne', 'st_use', 'st_held']);
const RESTING: ReadonlySet<BugMode> = new Set(['st_idle', 'st_eat', 'st_recover', 'st_landing']);

export function newBugBrain(x: number, rng: Rng): BugBrain {
  return {
    mode: 'st_idle',
    timer: rng.int(30, 120),
    targetX: x,
    targetId: null,
    action: null,
    facing: rng.chance(0.5) ? 1 : -1,
    needs: {
      need_hunger: Math.round(rng.range(55, 90)),
      need_fun: Math.round(rng.range(55, 90)),
      need_energy: Math.round(rng.range(70, 95)),
    },
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
  };
}

/**
 * Pick a variant for a reaction, never the one this bug played last time
 * for the same reaction type.
 */
export function pickVariant(brain: BugBrain, type: ReactionType, rng: Rng): number {
  const last = brain.variants[type];
  const options: number[] = [];
  for (let v = 0; v < REACTION_VARIANTS; v++) if (v !== last) options.push(v);
  const variant = rng.pick(options);
  brain.variants[type] = variant;
  return variant;
}

/** Start a reaction: pick its variant and remember it for the renderer. */
export function react(brain: BugBrain, type: ReactionType, rng: Rng, tick: number): BugNotice {
  const variant = pickVariant(brain, type, rng);
  brain.reaction = { type, variant, tick };
  return { type: 'reacted', reaction: type, variant };
}

/** Mood from needs and recent events (game design doc, section 5). */
export function moodOf(brain: BugBrain, tick: number): Mood {
  const n = brain.needs;
  if (tick < brain.grumpyUntil) return 'mood_grumpy';
  if (n.need_energy < 20) return 'mood_sleepy';
  if (n.need_hunger < 25) return 'mood_hungry';
  if (n.need_fun < 25) return 'mood_bored';
  const avg = (n.need_hunger + n.need_fun + n.need_energy) / 3;
  return avg >= 65 ? 'mood_happy' : 'mood_content';
}

/**
 * Put food in a bug's mouth: it starts chewing. The sim moves the item
 * into the mouth. Used both when the bug picks food up itself and when the
 * player drops food on its mouth.
 */
export function feedBug(brain: BugBrain, def: BugDef, itemId: EntityId, itemDefId: string): Liking {
  const liking = likingOf(def, itemDefId);
  enter(brain, 'st_eat', CHEW_TICKS[liking]);
  brain.mouthful = itemId;
  brain.targetId = itemId;
  brain.action = 'eat';
  brain.tickle = 0;
  return liking;
}

/** Can this bug take food in its mouth right now? */
export function canEat(brain: BugBrain): boolean {
  return !AIRBORNE.has(brain.mode) && brain.mouthful === null;
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

export function likingOf(def: BugDef, itemDefId: string): Liking {
  if (def.loves.includes(itemDefId)) return 'loved';
  if (def.likes.includes(itemDefId)) return 'liked';
  if (def.dislikes.includes(itemDefId)) return 'disliked';
  return 'neutral';
}

/** How badly a need wants filling: 0 when full, 100 when empty. */
export function urgency(value: number): number {
  const lack = Math.min(100, Math.max(0, 100 - value)) / 100;
  return lack * lack * 100;
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

/** Score one advert for one bug, without the random bonus. */
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
  const like = LIKE_MULTIPLIER[likingOf(def, candidate.defId)];
  const falloff = 1 / (1 + Math.abs(candidate.x - x) / 6);
  const uses = brain.used.filter((u) => u.id === candidate.id);
  const novelty = uses.length === 0 ? 1.6 : 1;
  const recent = uses.some((u) => tick - u.tick < RECENT_USE) ? 0.4 : 1;
  return sum * like * falloff * novelty * recent;
}

function addNeeds(needs: Needs, deltas: Partial<Record<NeedId, number>>): void {
  for (const need of NEED_IDS) {
    const d = deltas[need];
    if (d) needs[need] = Math.min(100, Math.max(0, needs[need] + d));
  }
}

function recordUse(brain: BugBrain, id: EntityId, tick: number): void {
  brain.used.push({ id, tick });
  if (brain.used.length > 8) brain.used.shift();
}

function enter(brain: BugBrain, mode: BugMode, timer = 0): void {
  brain.mode = mode;
  brain.timer = timer;
  brain.stuck = 0;
}

function enterIdle(brain: BugBrain, rng: Rng, def: BugDef): void {
  // Restless bugs rest less: 2 to 5 seconds, scaled.
  const scale = 1.4 - def.traits.restless * 0.8;
  enter(brain, 'st_idle', Math.round(rng.int(120, 300) * scale));
  brain.targetId = null;
  brain.action = null;
}

/** Tangent along the ground, pointing right. */
function tangent(n: Vec): Vec {
  return { x: -n.y, y: n.x };
}

/**
 * A velocity that walks along the surface at `speed` (signed) and cancels
 * the slope's pull, so bugs neither slide down roots nor slow on the way up.
 */
function walkVelocity(n: Vec, speed: number): Vec {
  const t = tangent(n);
  const slide = GRAVITY * t.y * SIM_DT;
  return { x: t.x * (speed - slide) - n.x * 0.1, y: t.y * (speed - slide) - n.y * 0.1 };
}

/** Hold still on the surface, even on a slope. */
function grip(n: Vec): Vec {
  return walkVelocity(n, 0);
}

/** Launch velocity for a hop that lands on (x, y) after `time` seconds. */
export function hopVelocity(fromX: number, fromY: number, toX: number, toY: number, time = HOP_TIME): Vec {
  return { x: (toX - fromX) / time, y: (toY - fromY - 0.5 * GRAVITY * time * time) / time };
}

/** Called by the sim when the player lets go of a bug. */
export function releaseBug(brain: BugBrain, def: BugDef, flung: boolean): void {
  enter(brain, 'st_airborne');
  brain.airPeak = 0;
  brain.selfLaunched = false;
  brain.targetId = null;
  brain.action = null;
  brain.tickle = 0;
  if (flung && def.likesFlinging) addNeeds(brain.needs, { need_fun: 15 });
}

/** Called by the sim when a bug is poked. Returns true if it reacted. */
export function pokeBug(brain: BugBrain): boolean {
  if (brain.mode === 'st_dizzy' || brain.mode === 'st_airborne' || brain.mode === 'st_use') return false;
  enter(brain, 'st_react', REACT_TICKS);
  brain.targetId = null;
  brain.action = null;
  return true;
}

/**
 * Called by the sim when a spring launches a bug. If the bug hopped on on
 * purpose, the bounce pays off. Returns true in that case.
 */
export function springLaunched(brain: BugBrain, springId: EntityId, tick: number): boolean {
  if (brain.mode !== 'st_use' || brain.targetId !== springId || brain.done) return false;
  brain.done = true;
  addNeeds(brain.needs, { need_fun: 30, need_energy: -5 });
  recordUse(brain, springId, tick);
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
  brain.targetId = null;
  brain.action = null;
  return ticks;
}

function decayNeeds(brain: BugBrain, def: BugDef): void {
  for (const need of NEED_IDS) {
    brain.needs[need] = Math.max(0, brain.needs[need] - (DECAY[need] * def.needWeights[need]) / SIM_HZ);
  }
  if (RESTING.has(brain.mode)) {
    brain.needs.need_energy = Math.min(100, brain.needs.need_energy + REST_ENERGY / SIM_HZ);
  }
}

/**
 * Score everything nearby and maybe pick something to do. Picks among the
 * top three with weights 60/30/10. Returns true if the bug chose an action.
 */
function choose(brain: BugBrain, ctx: BugContext, notices: BugNotice[]): boolean {
  const { def, state, rng, tick } = ctx;
  const desperate = NEED_IDS.some((n) => brain.needs[n] < 15);
  const scored = ctx
    .adverts()
    .filter((c) => !c.claimed && (desperate || Math.abs(c.x - state.x) <= PERCEPTION))
    .map((c) => ({ c, score: scoreAdvert(brain, def, c, state.x, tick) + rng.range(0, 6) }))
    .filter((s) => s.score > SCORE_FLOOR)
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id)
    .slice(0, 3);
  if (scored.length === 0) return false;
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
  // Ten seconds, plus however long the walk takes a slow snail.
  enter(brain, 'st_seek', SEEK_TIMEOUT + Math.round((Math.abs(pick.c.x - state.x) / def.speed) * SIM_HZ));
  brain.targetId = pick.c.id;
  brain.action = pick.c.action;
  brain.targetX = pick.c.x;
  brain.tries = 0;
  brain.done = false;
  notices.push({ type: 'chose', action: pick.c.action, targetId: pick.c.id });
  return true;
}

function startWander(brain: BugBrain, ctx: BugContext): void {
  const { def, state, rng } = ctx;
  const margin = def.radius + 0.5;
  const lo = Math.max(margin, state.x - WANDER_RANGE);
  const hi = Math.min(ctx.worldWidth - margin, state.x + WANDER_RANGE);
  enter(brain, 'st_wander', SEEK_TIMEOUT);
  brain.targetX = rng.range(lo, hi);
}

/**
 * One tick of bug behavior. Mutates the brain and returns what the bug
 * wants physics to do. The sim calls this for every bug in ID order.
 */
export function updateBug(entity: Entity, ctx: BugContext): BugDecision {
  const out: BugDecision = { velocity: null, eat: null, take: null, spit: null, wriggle: false, notices: [] };
  const brain = entity.bug;
  if (!brain) return out;
  const { def, state, rng } = ctx;
  const speed = Math.hypot(state.vx, state.vy);
  decayNeeds(brain, def);
  const moved = Math.abs(state.x - brain.lastX);
  brain.lastX = state.x;
  if (brain.burpAt >= 0 && ctx.tick >= brain.burpAt) {
    brain.burpAt = -1;
    out.notices.push({ type: 'burped' });
  }

  if (ctx.held) {
    if (brain.mode !== 'st_held') {
      enter(brain, 'st_held');
      brain.targetId = null;
      brain.action = null;
      brain.tickle = 0;
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
  if (brain.mode === 'st_held') releaseBug(brain, def, false);

  // Knocked off its feet by something.
  if (!AIRBORNE.has(brain.mode) && !ctx.support && speed > TUMBLE_SPEED) {
    enter(brain, 'st_airborne');
    brain.airPeak = 0;
    brain.selfLaunched = false;
    brain.targetId = null;
    brain.action = null;
  }

  const n = ctx.support;
  switch (brain.mode) {
    case 'st_airborne':
    case 'st_use': {
      brain.airPeak = Math.max(brain.airPeak, ctx.impact);
      const settled = def.curlsWhenFlung && !brain.selfLaunched ? speed < 1.2 : ctx.impact > 0 || speed < 1;
      if (!n || !settled) return out;
      out.notices.push({ type: 'landed', speed: brain.airPeak });
      if (!brain.selfLaunched && brain.airPeak >= DIZZY_SPEED && def.dizzyProof) {
        // Glorp never gets dizzy: he pulls into his shell and spins like a top.
        enter(brain, 'st_react', SHELL_TICKS);
        brain.targetId = null;
        brain.action = null;
        out.notices.push(react(brain, 'land_hard', rng, ctx.tick));
      } else if (!brain.selfLaunched && brain.airPeak >= DIZZY_SPEED) {
        const ticks = makeDizzy(brain, brain.airPeak, ctx.tick);
        out.notices.push({ type: 'dizzy', speed: brain.airPeak, durationTicks: ticks });
      } else if (
        brain.selfLaunched &&
        brain.targetId !== null &&
        !(brain.mode === 'st_use' && brain.done) &&
        brain.tries + 1 < HOP_TRIES
      ) {
        // Missed the spring, or hopped over something on the way. Carry on.
        brain.tries++;
        brain.mode = 'st_seek';
        brain.timer = SEEK_TIMEOUT;
        brain.stuck = 0;
      } else {
        enter(brain, 'st_landing', LANDING_TICKS);
        brain.targetId = null;
        brain.action = null;
        if (!brain.selfLaunched) out.notices.push(react(brain, 'land', rng, ctx.tick));
      }
      brain.selfLaunched = false;
      out.velocity = n ? grip(n) : null;
      return out;
    }

    case 'st_landing':
    case 'st_recover':
    case 'st_react':
      if (--brain.timer <= 0) enterIdle(brain, rng, def);
      out.velocity = n ? grip(n) : null;
      return out;

    case 'st_dizzy': {
      if (--brain.timer <= 0) {
        enter(brain, 'st_recover', RECOVER_TICKS);
        out.notices.push({ type: 'recovered' });
      }
      if (!n) return out;
      // A slow, wobbly stagger back and forth.
      const wobble = Math.sin((ctx.tick + entity.id * 37) * 0.045) * def.speed * 0.35;
      if (Math.abs(wobble) > 0.05) brain.facing = wobble > 0 ? 1 : -1;
      out.velocity = walkVelocity(n, wobble);
      return out;
    }

    case 'st_idle':
      brain.timer--;
      if (--brain.decideIn <= 0) {
        brain.decideIn = DECIDE_EVERY;
        if (n && choose(brain, ctx, out.notices)) return out;
      }
      if (brain.timer <= 0 && n) startWander(brain, ctx);
      out.velocity = n ? grip(n) : null;
      return out;

    case 'st_wander': {
      if (--brain.decideIn <= 0) {
        brain.decideIn = DECIDE_EVERY;
        if (n && choose(brain, ctx, out.notices)) return out;
      }
      const dx = brain.targetX - state.x;
      if (Math.abs(dx) < ARRIVE || --brain.timer <= 0) {
        enterIdle(brain, rng, def);
        out.velocity = n ? grip(n) : null;
        return out;
      }
      return walk(brain, ctx, dx, moved, out);
    }

    case 'st_seek': {
      const target = brain.targetId === null ? null : ctx.target(brain.targetId);
      if (!target || target.held || --brain.timer <= 0) {
        enterIdle(brain, rng, def);
        return out;
      }
      const side = target.x >= state.x ? 1 : -1;
      const gap = brain.action === 'bounce' ? 0.3 : 0.04;
      const standX = target.x - side * (def.radius + target.halfWidth + gap);
      brain.targetX = standX;
      const dx = standX - state.x;
      const edgeGap = Math.abs(target.x - state.x) - def.radius - target.halfWidth;
      const arrived = Math.abs(dx) < ARRIVE || (edgeGap < gap + 0.1 && Math.sign(dx) !== side);
      if (arrived && n) {
        brain.facing = side;
        if (brain.action === 'eat') {
          const itemId = brain.targetId!;
          const liking = feedBug(brain, def, itemId, target.defId);
          out.take = { itemId, liking };
          out.velocity = grip(n);
          return out;
        }
        if (Math.abs(target.angle) > 0.5) {
          enterIdle(brain, rng, def); // The spring fell over; nothing to bounce on.
          return out;
        }
        // Hop onto the spring's top.
        const topY = target.y - target.halfHeight - def.radius - 0.02;
        out.velocity = hopVelocity(state.x, state.y, target.x - side * 0.04, topY);
        enter(brain, 'st_use');
        brain.selfLaunched = true;
        brain.airPeak = 0;
        out.notices.push({ type: 'hopped' });
        return out;
      }
      return walk(brain, ctx, dx, moved, out);
    }

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
      brain.targetId = null;
      brain.action = null;
      out.notices.push(react(brain, `fed_${liking}`, rng, ctx.tick));
      return out;
    }
  }
  return out;
}

function walk(brain: BugBrain, ctx: BugContext, dx: number, moved: number, out: BugDecision): BugDecision {
  const { def, rng } = ctx;
  const n = ctx.support;
  brain.facing = dx > 0 ? 1 : -1;
  if (!n) return out;
  const ob = ctx.obstacle(brain.facing);
  const bottom = ctx.state.y + def.radius;
  if (ob && (ob.isBug || bottom - ob.top > STEP_HEIGHT)) {
    // Another bug, or something too tall to step over: go do something else.
    enterIdle(brain, rng, def);
    out.velocity = grip(n);
    return out;
  }
  if (ob) {
    // A little hop over pebbles and twigs instead of bulldozing them.
    const rise = bottom - ob.top + 0.12;
    out.velocity = { x: brain.facing * Math.max(def.speed, 1.4), y: -Math.sqrt(2 * GRAVITY * rise) };
    enter(brain, 'st_airborne');
    brain.selfLaunched = true;
    brain.airPeak = 0;
    out.notices.push({ type: 'hopped' });
    return out;
  }
  brain.stuck = moved < def.speed * SIM_DT * 0.25 ? brain.stuck + 1 : 0;
  if (brain.stuck > STUCK_TICKS) {
    brain.stuck = 0;
    // Bouncy bugs hop over whatever is in the way; others give up.
    if (rng.chance(def.traits.bouncy)) {
      out.velocity = { x: brain.facing * def.speed * 1.2, y: -6.5 };
      enter(brain, 'st_airborne');
      brain.selfLaunched = true;
      brain.airPeak = 0;
      out.notices.push({ type: 'hopped' });
      return out;
    }
    enterIdle(brain, rng, def);
    out.velocity = grip(n);
    return out;
  }
  out.velocity = walkVelocity(n, brain.facing * def.speed);
  return out;
}
