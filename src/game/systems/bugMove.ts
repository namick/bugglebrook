import type { BugBrain, BugMode, EntityId } from '../core/entities';
import { SIM_DT, SIM_HZ } from '../core/loop';
import type { Rng } from '../core/rng';
import { GRAVITY } from '../constants';
import type { BugDef } from '../data/types';
import type { ReactionType } from '../events';
import { REACTION_VARIANTS } from '../events';
import type { Vec } from '../physics/physics';
import type { BugContext, BugDecision, BugNotice } from './bugTypes';
import { EMPTY_WORLD } from './bugTypes';

// Timings in ticks (60 per second).
export const DECIDE_EVERY = Math.round(1.5 * SIM_HZ);
export const SEEK_TIMEOUT = 10 * SIM_HZ;
export const STUCK_TICKS = 45;
export const HOP_TIME = 0.5;
/** Tallest thing a bug will hop over while walking, in meters. */
export const STEP_HEIGHT = 0.7;
export const ARRIVE = 0.12;
/** A hopper's hops, in meters (the doc's 250 to 700 px, trimmed to stay on screen). */
export const HOP_MIN = 2.2;
export const HOP_MAX = 4.6;
/** Slime makes other bugs slide this much faster, and they slip at most this often. */
const SLIDE = 1.6;
const SLIP_EVERY = 15 * SIM_HZ;

export function enter(brain: BugBrain, mode: BugMode, timer = 0): void {
  brain.mode = mode;
  brain.timer = timer;
  brain.stuck = 0;
  brain.resume = null;
}

/** Stop whatever it meant to do. */
export function clearIntent(brain: BugBrain): void {
  brain.targetId = null;
  brain.action = null;
}

export function enterIdle(brain: BugBrain, rng: Rng, def: BugDef): void {
  // Restless bugs rest less: 2 to 5 seconds, scaled.
  const scale = 1.4 - def.traits.restless * 0.8;
  enter(brain, 'st_idle', Math.round(rng.int(120, 300) * scale));
  clearIntent(brain);
}

/** Tangent along the ground, pointing right. */
function tangent(n: Vec): Vec {
  return { x: -n.y, y: n.x };
}

/**
 * A velocity that walks along the surface at `speed` (signed) and cancels
 * the slope's pull, so bugs neither slide down roots nor slow on the way up.
 */
export function walkVelocity(n: Vec, speed: number): Vec {
  const t = tangent(n);
  const slide = GRAVITY * t.y * SIM_DT;
  return { x: t.x * (speed - slide) - n.x * 0.1, y: t.y * (speed - slide) - n.y * 0.1 };
}

/** Hold still on the surface, even on a slope. */
export function grip(n: Vec): Vec {
  return walkVelocity(n, 0);
}

/** Launch velocity for a hop that lands on (x, y) after `time` seconds. */
export function hopVelocity(fromX: number, fromY: number, toX: number, toY: number, time = HOP_TIME): Vec {
  return { x: (toX - fromX) / time, y: (toY - fromY - 0.5 * GRAVITY * time * time) / time };
}

/**
 * Take off on a hop that is part of getting somewhere: the bug goes back to
 * what it was doing when it lands.
 */
export function launch(brain: BugBrain, out: BugDecision, v: Vec, y: number): void {
  brain.resume = brain.mode === 'st_airborne' ? brain.resume : brain.mode;
  brain.mode = 'st_airborne';
  brain.selfLaunched = true;
  brain.airPeak = 0;
  brain.airTop = y;
  out.velocity = v;
  out.notices.push({ type: 'hopped' });
}

/**
 * Could a bug land at x without touching a player setup or open water?
 * Hops, glides, and throws check this, so bugs never undo the player's work.
 */
export function clearLanding(ctx: BugContext, x: number): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  const reach = ctx.reach ?? { x0: 0, x1: ctx.worldWidth };
  if (x < reach.x0 + ctx.def.radius + 0.3 || x > reach.x1 - ctx.def.radius - 0.3) return false;
  if (ctx.def.swim !== 'skate' && ctx.overWater?.(x)) return false;
  // Nothing of the player's under the landing, or under the arc on the way.
  const from = ctx.state.x;
  const pad = ctx.def.radius + 0.5;
  if (world.setupBetween(Math.min(from, x) - pad, Math.max(from, x) + pad)) return false;
  return !world.setupNear(x, world.surfaceY(x) - ctx.def.radius, ctx.def.radius + 0.7);
}

export type StepResult = 'walking' | 'blocked' | 'hopped';

/**
 * One step toward dx: walk (or, for hoppers, hop), sliding on slime, hopping
 * over pebbles, and stopping at water, walls, other bugs, tall things, and
 * player setups. `k` scales the speed. Never changes the mode except to hop.
 */
export function stepToward(
  brain: BugBrain,
  ctx: BugContext,
  dx: number,
  moved: number,
  out: BugDecision,
  k = 1,
  hop = true,
): StepResult {
  const { def, rng, state } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  brain.facing = dx > 0 ? 1 : -1;
  if (!n) return 'blocked';
  const ahead = state.x + brain.facing * (def.radius + 0.25);
  if (def.swim !== 'skate' && ctx.overWater?.(ahead)) return 'blocked';
  const reach = ctx.reach ?? { x0: 0, x1: ctx.worldWidth };
  if (ahead < reach.x0 + 0.2 || ahead > reach.x1 - 0.2) return 'blocked';
  // Never walk into the player's work: stop short of it.
  // Walking up to a setup to use it in place (sniff it, bounce on it) is fine.
  const target = brain.targetId !== null && brain.targetId >= 0 ? brain.targetId : null;
  // Keep a little space around them too.
  if (world.setupNear(state.x + brain.facing * (def.radius + 0.2), state.y, 0.25, target)) return 'blocked';
  let ob = ctx.obstacle(brain.facing);
  const bottom = state.y + def.radius;
  if (!ob) {
    // Something small just ahead on the ground: hop it before bumping it along.
    const near = world
      .loose()
      .find(
        (l) =>
          l.id !== target &&
          l.id !== brain.social?.item &&
          l.speed < 0.5 &&
          (l.x - state.x) * brain.facing > 0 &&
          Math.abs(l.x - state.x) - l.halfWidth < def.radius + 0.12 &&
          l.top < bottom &&
          l.top > state.y - def.radius,
      );
    if (near) ob = { id: near.id, isBug: false, top: near.top };
  }
  if (ob && ob.id === target && ob.setup) return 'blocked';
  if (ob && (ob.isBug || ob.setup || bottom - ob.top > STEP_HEIGHT)) return 'blocked';
  if (ob) {
    // A little hop over pebbles and twigs instead of bulldozing them. If
    // the hop would carry it past where it is going, it is there already:
    // hopping back and forth over the same pebble helps nobody. (Only when
    // wandering: a bug going to a thing may need to hop right up to it.)
    if (brain.mode === 'st_wander' && Math.abs(dx) < def.radius * 2 + 0.3) return 'blocked';
    const landX = state.x + brain.facing * (def.radius * 2 + 0.3);
    if (!clearLanding(ctx, landX)) return 'blocked';
    // Never hop a pebble only to come down on someone (Dot asleep on her bottle cap).
    if (
      world
        .bugs()
        .some((o) => Math.abs(o.x - landX) < o.def.radius + def.radius && Math.abs(o.y - state.y) < 1.2)
    )
      return 'blocked';
    const rise = Math.max(0.1, bottom - ob.top + 0.12);
    const up = Math.sqrt(2 * GRAVITY * rise);
    // Far enough forward to clear it, not land on it.
    const across = (def.radius * 2 + 0.45) / ((2 * up) / GRAVITY);
    launch(brain, out, { x: brain.facing * Math.max(def.speed, 1.4, across), y: -up }, state.y);
    return 'hopped';
  }
  // Hoppers get about in big arcs.
  // A butterfly flutters about the same way, in floaty hops.
  const hopper = !!def.habits.hops || brain.form === 'butterfly';
  if (hop && hopper && Math.abs(dx) > 1.2 && ctx.tick >= brain.hopReady) {
    let d = Math.min(Math.abs(dx), rng.range(HOP_MIN, HOP_MAX));
    for (let tries = 0; tries < 3; tries++, d *= 0.55) {
      const toX = state.x + brain.facing * d;
      if (!clearLanding(ctx, toX)) continue;
      const toY = world.surfaceY(toX) - def.radius - 0.02;
      if (state.y - toY > 3) continue; // Too high to reach in one go.
      if (toY - state.y > 1.2) continue; // A long drop: walk down instead.
      const time = 0.42 + d * 0.06;
      launch(brain, out, hopVelocity(state.x, state.y, toX, toY, time), state.y);
      brain.hopReady = ctx.tick + rng.int(14, 40);
      return 'hopped';
    }
  }
  if (hop && hopper && ctx.tick < brain.hopReady && Math.abs(dx) > 1.2) {
    // Crouched between hops.
    out.velocity = grip(n);
    return 'walking';
  }
  brain.stuck = moved < def.speed * k * SIM_DT * 0.25 ? brain.stuck + 1 : 0;
  if (brain.stuck > STUCK_TICKS) {
    brain.stuck = 0;
    // Bouncy bugs hop over whatever is in the way; others give up.
    const landX = state.x + brain.facing * 1.2;
    if (rng.chance(def.traits.bouncy) && clearLanding(ctx, landX)) {
      launch(brain, out, { x: brain.facing * def.speed * 1.2, y: -6.5 }, state.y);
      return 'hopped';
    }
    return 'blocked';
  }
  let speed = def.speed * k;
  if (!def.habits.slimeTrail && world.slimeAt(state.x, state.y)) {
    // Whee: a slime trail. Slide along faster than you meant to.
    speed *= SLIDE;
    if (brain.slippedAt < 0 || ctx.tick - brain.slippedAt > SLIP_EVERY) {
      brain.slippedAt = ctx.tick;
      out.notices.push({ type: 'slipped' });
    }
  }
  out.velocity = walkVelocity(n, brain.facing * speed);
  return 'walking';
}

/**
 * Walk toward dx for wandering and seeking. Gives up (goes idle) when
 * blocked. A bug stranded on a lily pad or ice with water all round jumps in
 * now and then.
 */
export function walk(
  brain: BugBrain,
  ctx: BugContext,
  dx: number,
  moved: number,
  out: BugDecision,
): BugDecision {
  const { def, rng } = ctx;
  const n = ctx.support;
  brain.facing = dx > 0 ? 1 : -1;
  if (!n) return out;
  if (def.swim !== 'skate' && ctx.overWater?.(ctx.state.x + brain.facing * (def.radius + 0.25))) {
    const behind = ctx.overWater(ctx.state.x - brain.facing * (def.radius + 0.25));
    if (behind && rng.chance(0.02)) {
      launch(brain, out, { x: brain.facing * 2, y: -4 }, ctx.state.y);
      brain.resume = null;
      return out;
    }
  }
  const result = stepToward(brain, ctx, dx, moved, out);
  if (result === 'blocked') {
    enterIdle(brain, rng, def);
    out.velocity = grip(n);
  }
  return out;
}

/** Stand still facing a point. */
export function face(brain: BugBrain, ctx: BugContext, x: number, out: BugDecision): void {
  if (Math.abs(x - ctx.state.x) > 0.05) brain.facing = x > ctx.state.x ? 1 : -1;
  out.velocity = ctx.support ? grip(ctx.support) : null;
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

/** Note that a bug used something (or played something), for novelty and repeat penalties. */
export function recordUse(brain: BugBrain, id: EntityId, tick: number): void {
  brain.used.push({ id, tick });
  if (brain.used.length > 8) brain.used.shift();
}

/** A pseudo-ID per kind of play, so bugs mix up what they do together. */
export function kindUseId(kindIndex: number): number {
  return -(100 + kindIndex);
}

/** Remember a notable moment with a thing or a bug (the last 8, fading over 120 s). */
export function remember(brain: BugBrain, id: EntityId, good: boolean, tick: number): void {
  brain.memory.push({ id, good, tick });
  if (brain.memory.length > 8) brain.memory.shift();
}

export const MEMORY_TICKS = 120 * SIM_HZ;

/**
 * How memory scales an advert: up to 1.5 for something that was fun lately,
 * down to 0.3 for something that went badly, fading back to 1 over 120 s.
 */
export function memoryModifier(brain: BugBrain, id: EntityId, tick: number): number {
  let m = 1;
  for (const e of brain.memory) {
    if (e.id !== id) continue;
    const fresh = 1 - (tick - e.tick) / MEMORY_TICKS;
    if (fresh <= 0) continue;
    m = e.good ? 1 + 0.5 * fresh : 1 - 0.7 * fresh;
  }
  return m;
}
