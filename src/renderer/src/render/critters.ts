/**
 * Ambient critters: the little scenery animals that make each area feel
 * lived in (ants, butterflies, a bee, moths, fireflies, crickets, worms,
 * water boatmen, pond skaters, a fish, birds at the window). They are not
 * entities and can't be grabbed. Everything here is pure: motion is a
 * function of a seed and the time, so screenshots are steady, and the only
 * state is the small "shy" offset a critter keeps while it dodges the hand
 * or a bug. `areaArt/critterLive.ts` draws them.
 */

export type CritterKind =
  | 'ant'
  | 'butterfly'
  | 'bee'
  | 'moth'
  | 'firefly'
  | 'cricket'
  | 'worm'
  | 'boatman'
  | 'skater'
  | 'fish'
  | 'bird';

export const CRITTER_KINDS: readonly CritterKind[] = [
  'ant',
  'butterfly',
  'bee',
  'moth',
  'firefly',
  'cricket',
  'worm',
  'boatman',
  'skater',
  'fish',
  'bird',
];

/** At most this many critters are drawn in a frame, over all areas (like the weather budgets). */
export const CRITTER_BUDGET = 72;

/** Cheap deterministic hash to [0, 1). */
export function hash(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (u: number): number => u * u * (3 - 2 * u);

/** What the sky is doing, as far as critters care. */
export interface CritterSky {
  /** 1 in full daylight, 0 at night. */
  day: number;
  /** 1 at full night. */
  night: number;
  /** 0 to 1. */
  rain: number;
}

/** The critters' sky at an hour (0 to 24) and rain (0 to 1): day ramps up 5:30 to 7:30 and down 18:00 to 20:00. */
export function critterSky(hour: number, rain: number): CritterSky {
  const h = ((hour % 24) + 24) % 24;
  const day = clamp01(Math.min((h - 5.5) / 2, (20 - h) / 2));
  const night = clamp01(Math.max((h - 19) / 2, (5.5 - h) / 1.5));
  return { day, night, rain: clamp01(rain) };
}

/**
 * How much of a kind is out (0 to 1) under this sky. Day flyers hide from
 * the rain and the dark; night ones come out after dusk; worms like the
 * wet; things in the water don't care.
 */
export function presence(kind: CritterKind, sky: CritterSky): number {
  const dry = 1 - clamp01(sky.rain * 1.4);
  switch (kind) {
    case 'butterfly':
    case 'bee':
      return clamp01((sky.day - 0.35) / 0.4) * dry;
    case 'bird':
      return clamp01((sky.day - 0.2) / 0.4) * (1 - sky.rain * 0.5);
    case 'ant':
      // Ants go home at night and when it rains.
      return clamp01((sky.day - 0.25) / 0.35) * dry;
    case 'moth':
      return clamp01((sky.night - 0.3) / 0.4);
    case 'firefly':
      return clamp01((sky.night - 0.4) / 0.4) * dry;
    case 'cricket':
      return clamp01((sky.night - 0.25) / 0.4) * (1 - sky.rain * 0.7);
    case 'skater':
      return dry;
    case 'worm':
    case 'boatman':
    case 'fish':
      return 1;
  }
}

/** How many of each critter, of `n`, are out for a presence of `p` (0 to 1). */
export function outOf(n: number, p: number): number {
  return Math.round(n * clamp01(p));
}

export interface Pt {
  x: number;
  y: number;
}

/** A flyer between perches (a butterfly or a bee): where it is, how its wings are, and whether it sits. */
export interface Flight {
  x: number;
  y: number;
  /** Wing openness, 0 (closed) to 1. */
  flap: number;
  facing: 1 | -1;
  resting: boolean;
}

export interface FlitOptions {
  /** Seconds in the air between perches. */
  fly: number;
  /** Seconds sitting on a perch. */
  rest: number;
  /** How loopy the flight is, in pixels. */
  loop: number;
  /** Wing beats a second in the air. */
  beat: number;
}

const PICK_SALT = 17.3;

/**
 * Which perch a flyer is on for leg `leg`: never the same twice in a row.
 * Even legs pick freely; odd legs pick among the perches that differ from
 * both neighbors.
 */
export function perchFor(seed: number, leg: number, count: number): number {
  if (count <= 1) return 0;
  if (count === 2) return (leg + Math.floor(hash(seed * PICK_SALT) * 2)) % 2;
  const free = (l: number): number => Math.floor(hash(seed * PICK_SALT, l) * count);
  if (leg % 2 === 0) return free(leg);
  const a = free(leg - 1);
  const b = free(leg + 1);
  const options: number[] = [];
  for (let i = 0; i < count; i++) if (i !== a && i !== b) options.push(i);
  return options[Math.floor(hash(seed * PICK_SALT, leg) * options.length)]!;
}

/**
 * A butterfly or bee flitting from perch to perch: it sits a while (slow
 * wing fans), then flies a loopy arc to the next perch. Pure in the seed
 * and the time.
 */
export function flit(seed: number, t: number, perches: readonly Pt[], o: FlitOptions): Flight {
  const period = o.fly + o.rest;
  const shifted = t + hash(seed, 1) * period;
  const leg = Math.floor(shifted / period);
  const u = shifted / period - leg;
  const from = perches[perchFor(seed, leg, perches.length)]!;
  const to = perches[perchFor(seed, leg + 1, perches.length)]!;
  const restPart = o.rest / period;
  if (u < restPart) {
    // Sitting: fan the wings now and then.
    const fan = 0.5 + 0.5 * Math.sin(t * 2.2 + seed);
    return {
      x: from.x,
      y: from.y,
      flap: 0.25 + 0.6 * fan * fan,
      facing: to.x >= from.x ? 1 : -1,
      resting: true,
    };
  }
  const k = (u - restPart) / (1 - restPart);
  const e = smooth(k);
  const lift = Math.sin(k * Math.PI) * (60 + o.loop);
  const wob = Math.sin(k * TAU * 2 + seed) * o.loop * Math.sin(k * Math.PI);
  const x = from.x + (to.x - from.x) * e + wob * 0.6;
  const y = from.y + (to.y - from.y) * e - lift + Math.cos(k * TAU * 3 + seed) * o.loop * 0.3;
  const flap = 0.5 + 0.5 * Math.sin(t * o.beat * TAU + seed);
  return { x, y, flap, facing: to.x >= from.x ? 1 : -1, resting: false };
}

/** A moth looping round a light: wobbly, with a dash into it now and then. */
export function orbit(seed: number, t: number, cx: number, cy: number, r: number): Pt & { flap: number } {
  const speed = 1.6 + hash(seed, 2) * 1.4;
  const a = t * speed * (hash(seed, 3) < 0.5 ? 1 : -1) + seed * 3 + 0.7 * Math.sin(t * 3.1 + seed);
  // Every few seconds it bumps right into the light.
  const cycle = (t + hash(seed, 4) * 5) % 5;
  const bump = cycle < 0.5 ? Math.sin((cycle / 0.5) * Math.PI) : 0;
  const rr = r * (0.75 + 0.25 * Math.sin(t * 1.7 + seed)) * (1 - bump * 0.8);
  return {
    x: cx + Math.cos(a) * rr,
    y: cy + Math.sin(a) * rr * 0.6 + Math.sin(t * 5 + seed) * 4,
    flap: 0.5 + 0.5 * Math.sin(t * 30 + seed),
  };
}

/** A firefly drifting about its home spot. */
export function drift(seed: number, t: number, home: Pt, range: number): Pt {
  const s1 = 0.17 + hash(seed, 5) * 0.12;
  const s2 = 0.23 + hash(seed, 6) * 0.14;
  return {
    x: home.x + Math.sin(t * s1 * TAU + seed) * range + Math.sin(t * 1.3 + seed * 2) * range * 0.12,
    y: home.y + Math.sin(t * s2 * TAU + seed * 1.7) * range * 0.45,
  };
}

/** A firefly's glow: a soft blink every few seconds, 0 to 1. */
export function blink(seed: number, t: number): number {
  const period = 2.4 + hash(seed, 7) * 2.2;
  const u = ((t + hash(seed, 8) * period) % period) / period;
  const on = 0.28;
  if (u > on) return 0.08;
  return 0.08 + 0.92 * Math.sin((u / on) * Math.PI);
}

/** A cricket's song, 0 (quiet) to 1: bursts of three quick chirps. */
export function chirp(seed: number, t: number): number {
  const period = 2.6 + hash(seed, 9) * 2;
  const local = (t + hash(seed, 10) * period) % period;
  if (local > 0.75) return 0;
  // Three pulses in 0.75 s.
  const pulse = (local / 0.25) % 1;
  return Math.sin(pulse * Math.PI);
}

/** A worm poking out of the ground: how far up (0 to 1) and where it looks (-1 to 1). */
export function wormRise(seed: number, t: number, period: number): { up: number; look: number } {
  const local = (t + hash(seed, 11) * period) % period;
  const show = 5;
  if (local > show) return { up: 0, look: 0 };
  const up = Math.min(1, local / 0.9, (show - local) / 0.9);
  const look = local < 1 ? 0 : Math.sin((local - 1) * 1.9) * clamp01(show - 1 - local);
  return { up: smooth(clamp01(up)), look };
}

/** Back and forth between two ends, eased at the turns (0 to 1 to 0), with its direction. */
function pingPong(p: number): { u: number; dir: 1 | -1 } {
  const m = ((p % 2) + 2) % 2;
  return m < 1 ? { u: smooth(m), dir: 1 } : { u: smooth(2 - m), dir: -1 };
}

/** A water boatman rowing under the surface in little surges. */
export function row(
  seed: number,
  t: number,
  x0: number,
  x1: number,
): { x: number; depth: number; stroke: number; facing: 1 | -1 } {
  const span = Math.max(1, x1 - x0);
  // Surges: progress moves in pulses, one stroke a second or so.
  const rate = 70 / span;
  const beat = t * (0.9 + hash(seed, 12) * 0.5);
  const surge = beat - Math.sin(beat * TAU) / TAU;
  const { u, dir } = pingPong(surge * rate + hash(seed, 13) * 2);
  return {
    x: x0 + u * span,
    depth: 0.35 + 0.3 * Math.sin(t * 0.4 + seed),
    stroke: ((beat % 1) + 1) % 1,
    facing: dir,
  };
}

/** A pond skater: glides, stops, glides again. */
export function skate(
  seed: number,
  t: number,
  x0: number,
  x1: number,
): { x: number; facing: 1 | -1; gliding: boolean } {
  const span = Math.max(1, x1 - x0);
  const period = 1.8 + hash(seed, 14) * 1.2;
  const n = Math.floor(t / period);
  const local = t / period - n;
  const glide = local < 0.35 ? smooth(local / 0.35) : 1;
  const steps = n + glide;
  const { u, dir } = pingPong((steps * 90) / span + hash(seed, 15) * 2);
  return { x: x0 + u * span, facing: dir, gliding: local < 0.35 };
}

/** A fish's shadow cruising slowly near the bottom: where, which way, and its tail's swish. */
export function cruise(
  seed: number,
  t: number,
  x0: number,
  x1: number,
): { x: number; facing: 1 | -1; tail: number; turn: number } {
  const span = Math.max(1, x1 - x0);
  const { u, dir } = pingPong((t * 38) / span + hash(seed, 16) * 2);
  // Slow at the turns: the body narrows as it turns.
  const m = ((((t * 38) / span + hash(seed, 16) * 2) % 1) + 1) % 1;
  const turn = Math.min(1, m / 0.08, (1 - m) / 0.08);
  return { x: x0 + u * span, facing: dir, tail: Math.sin(t * 5 + seed), turn };
}

/** A bird on a branch: what it is up to. `hop` is 0 to 1 through a hop to its other spot. */
export interface BirdBeat {
  tilt: number;
  peck: number;
  hop: number;
  /** Which of two spots on the branch, 0 or 1 (mid-hop: where it is going). */
  spot: 0 | 1;
}

/** A bird's idle routine: a head tilt, a peck, or a hop along the branch, one every 1.5 to 3 s. */
export function birdBeat(seed: number, t: number): BirdBeat {
  const period = 1.6;
  const n = Math.floor(t / period);
  const local = t / period - n;
  // Which spot it sits on: flips with each hop, so count hops so far (cheaply, over the last 24 beats).
  let spot = 0;
  for (let i = Math.max(0, n - 24); i < n; i++) if (hash(seed, i) > 0.82) spot ^= 1;
  const r = hash(seed, n);
  const act = Math.sin(local * Math.PI);
  if (r > 0.82) return { tilt: 0, peck: 0, hop: local, spot: (spot ^ 1) as 0 | 1 };
  if (r > 0.55) return { tilt: 0, peck: act, hop: 0, spot: spot as 0 | 1 };
  if (r > 0.2) return { tilt: (hash(seed, n + 0.5) - 0.5) * 1.1 * act, peck: 0, hop: 0, spot: spot as 0 | 1 };
  return { tilt: 0, peck: 0, hop: 0, spot: spot as 0 | 1 };
}

/** A point along a polyline (flat x, y pairs) at distance `s` from its start, with its heading. */
export function along(path: readonly number[], s: number): Pt & { angle: number } {
  let left = Math.max(0, s);
  for (let i = 0; i + 3 < path.length; i += 2) {
    const ax = path[i]!;
    const ay = path[i + 1]!;
    const bx = path[i + 2]!;
    const by = path[i + 3]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len || i + 4 >= path.length) {
      const k = len > 0 ? Math.min(1, left / len) : 0;
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, angle: Math.atan2(by - ay, bx - ax) };
    }
    left -= len;
  }
  return { x: path[0] ?? 0, y: path[1] ?? 0, angle: 0 };
}

/** The length of a polyline. */
export function pathLength(path: readonly number[]): number {
  let len = 0;
  for (let i = 0; i + 3 < path.length; i += 2)
    len += Math.hypot(path[i + 2]! - path[i]!, path[i + 3]! - path[i + 1]!);
  return len;
}

/**
 * Ant `i` of `n` in a line marching out along a path of length `len` and
 * back: how far along it is, and whether it is on the way home carrying a
 * crumb. Evenly spaced round the loop, so the line never bunches.
 */
export function antAt(
  i: number,
  n: number,
  t: number,
  len: number,
  speed: number,
): { s: number; home: boolean } {
  const loop = len * 2;
  const p = (((t * speed + (i * loop) / n) % loop) + loop) % loop;
  return p < len ? { s: p, home: false } : { s: loop - p, home: true };
}

/**
 * A critter's dodge: it is pushed away from anything within `radius` (the
 * hand, a bug) and springs back to its path once that is gone. Plain data,
 * updated in place each frame.
 */
export interface Shy {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  /** Seconds since it was last startled (large when calm). */
  since: number;
}

export const calm = (): Shy => ({ dx: 0, dy: 0, vx: 0, vy: 0, since: 99 });

/**
 * Step a dodge by `dt`: `at` is the critter's spot on its path, `threats`
 * the hand and nearby bugs. `flee` is how hard it scatters (px/s), and
 * `ground` keeps it on the floor (no vertical dodge). Returns true if
 * something startled it this frame.
 */
export function dodge(
  s: Shy,
  at: Pt,
  threats: readonly Pt[],
  radius: number,
  flee: number,
  dt: number,
  ground = false,
): boolean {
  let startled = false;
  const x = at.x + s.dx;
  const y = at.y + s.dy;
  for (const th of threats) {
    const ddx = x - th.x;
    const ddy = ground ? 0 : y - th.y;
    const d = Math.hypot(x - th.x, y - th.y);
    if (d >= radius) continue;
    startled = true;
    const len = Math.hypot(ddx, ddy) || 1;
    // Scatter: a hash of the position picks a side when the threat is right on top.
    const sx = Math.abs(ddx) < 1 && Math.abs(ddy) < 1 ? (hash(at.x, at.y) < 0.5 ? -1 : 1) : ddx / len;
    const sy = ground ? 0 : ddy / len;
    const k = (1 - d / radius) * flee;
    s.vx += sx * k * dt * 12;
    s.vy += sy * k * dt * 12;
  }
  s.since = startled ? 0 : s.since + dt;
  // Spring home once calm (slowly: ants re-form, a butterfly comes back).
  const back = s.since > 0.6 ? 3 : 0;
  s.vx += -s.dx * back * dt * 3;
  s.vy += -s.dy * back * dt * 3;
  const damp = Math.exp(-4 * dt);
  s.vx *= damp;
  s.vy *= damp;
  const cap = flee * 1.5;
  s.vx = Math.max(-cap, Math.min(cap, s.vx));
  s.vy = Math.max(-cap, Math.min(cap, s.vy));
  s.dx += s.vx * dt;
  s.dy += s.vy * dt;
  const far = radius * 2.5;
  s.dx = Math.max(-far, Math.min(far, s.dx));
  s.dy = Math.max(-far, Math.min(far, s.dy));
  if (s.since > 0.6 && Math.abs(s.dx) < 0.3 && Math.abs(s.dy) < 0.3) {
    s.dx = s.dy = s.vx = s.vy = 0;
  }
  return startled;
}

/** Is a critter at x (world px) worth drawing for a view from `left` to `right`? */
export function onScreen(x: number, left: number, right: number, margin = 120): boolean {
  return x > left - margin && x < right + margin;
}
