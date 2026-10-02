/**
 * Redraw keys for bug sprites (R36). Breathing, bobbing, squash, tilt, and
 * facing are container transforms, so a bug standing still only needs its
 * Graphics redrawn when what they show changes: a blink, a glance, a feeler
 * settling. Each key is a short string of the inputs a part reads, rounded
 * to steps too small to see; a part is redrawn only when its key changes.
 * Pure, so the rules are unit-tested.
 */
import type { EyeShape, MouthShape } from './bugFace';
import type { BugFrame } from './draw/bug';

/** Round `v` to multiples of `step`, as an integer for the key. */
export const q = (v: number, step: number): number => Math.round(v / step);

/** Eyes that move on their own (they need the clock). */
export const ANIMATED_EYES: ReadonlySet<EyeShape> = new Set(['spiral', 'heart']);
/** Mouths that move on their own. */
export const ANIMATED_MOUTHS: ReadonlySet<MouthShape> = new Set(['chew', 'wobble', 'aah', 'lick']);

/** A spring-driven antenna tip, as the key sees it. */
export interface Tip {
  x: number;
  y: number;
}

const tips = (springs: readonly Tip[]): string =>
  springs.map((s) => `${q(s.x, 0.25)},${q(s.y, 0.25)}`).join(',');

/** A key that always differs: for parts in motion every frame. */
const moving = (frame: BugFrame): string => `t${frame.time}`;

/** The legs (and feet, dimples, snail sole): still legs keep their drawing however the body breathes. */
export function legsKey(frame: BugFrame, form: string): string {
  const p = frame.pose;
  const base = `${form}|${frame.skate ? 1 : 0}${frame.chute ? 1 : 0}${frame.carrying ? 1 : 0}${frame.hopping ? 1 : 0}${p.sy < 0.97 ? 1 : 0}`;
  // A parachuting strider's legs flutter on the clock.
  if (frame.chute) return `${base}|${moving(frame)}`;
  if (p.flail || p.stride > 0.005)
    return `${base}|${q(p.legPhase, 0.04)}|${q(p.stride, 0.02)}|${p.flail ? 1 : 0}`;
  return `${base}|still`;
}

/** The feelers: their springs, the idle sway (rounded to a quarter pixel), and, for a snail, its mood. */
export function antennaeKey(
  frame: BugFrame,
  form: string,
  art: string,
  r: number,
  springs: readonly Tip[],
): string {
  const sway = Math.sin(frame.time * 2.1 + r) * r * 0.04;
  let key = `${form}|${frame.facing}|${tips(springs)}|${q(sway, 0.25)}`;
  if (art === 'snail')
    key += `|${frame.face.eyes}|${frame.face.mouth}|${q(Math.sin(frame.time * 1.6), 0.02)}|${q(Math.sin(frame.time * 1.6 + 1), 0.02)}`;
  return key;
}

/** The face: shapes, tint, blush, where the pupils look, how open the eyes are, and the clock if they animate. */
export function faceKey(
  frame: BugFrame,
  form: string,
  art: string,
  r: number,
  springs: readonly Tip[],
): string {
  const f = frame.face;
  let key = `${form}|${f.eyes}|${f.mouth}|${f.tint}|${f.blush ? 1 : 0}|${frame.facing}|${q(frame.look.x, 0.02)},${q(frame.look.y, 0.02)}|${q(frame.pose.eyeOpen, 0.05)}`;
  if (ANIMATED_EYES.has(f.eyes) || ANIMATED_MOUTHS.has(f.mouth)) key += `|${moving(frame)}`;
  // A snail's eyes ride on its stalks.
  if (art === 'snail') key += `|${antennaeKey(frame, form, art, r, springs)}`;
  return key;
}

/** Wings beat on the clock while flying, and are hidden otherwise. */
export function wingsKey(frame: BugFrame, form: string): string {
  return form === 'flying' ? moving(frame) : 'folded';
}

/** Steam puffs and dizzy stars move on the clock; with neither, nothing to draw. */
export function fxKey(frame: BugFrame): string {
  return frame.face.steam || frame.stars > 0 ? moving(frame) : 'none';
}

/** Redraws per second for a painted species (M7 bugs) standing calm: their idle sways are slow and small. */
export const CALM_HZ = 15;

/**
 * One key for a painted species, whose painter draws legs, feelers, and
 * face together. Null (redraw every frame) while anything moves fast:
 * walking, flailing, flying, a reaction, an animated face, or waiting to be
 * found (those signs of life should be smooth). Calm, it redraws
 * at `CALM_HZ` (the painters' idle sways run on the clock) or when the face,
 * the look, or the springs change.
 */
export function paintedKey(frame: BugFrame, springs: readonly Tip[]): string | null {
  const p = frame.pose;
  const f = frame.face;
  if (p.flail || p.stride > 0.005 || frame.stars > 0 || f.steam || frame.karate || frame.chute) return null;
  if (frame.fiddling) return null;
  if (
    frame.move &&
    (frame.move.bob !== 0 || frame.move.tilt !== 0 || frame.move.sx !== 1 || frame.move.sy !== 1)
  )
    return null;
  if (Math.hypot(frame.vx, frame.vy) > 0.05) return null;
  if (ANIMATED_EYES.has(f.eyes) || ANIMATED_MOUTHS.has(f.mouth)) return null;
  if (frame.mode === 'st_airborne' || frame.mode === 'st_held' || frame.mode === 'st_eat') return null;
  // Bugs waiting to be found show their signs of life smoothly (Moose's flailing, Twig's tells).
  if (frame.pending) return null;
  return [
    q(frame.time, 1 / CALM_HZ),
    f.form,
    f.eyes,
    f.mouth,
    f.tint,
    f.blush ? 1 : 0,
    frame.facing,
    q(frame.look.x, 0.02),
    q(frame.look.y, 0.02),
    q(p.eyeOpen, 0.05),
    tips(springs),
    frame.mode ?? '',
    frame.pending ?? '',
    frame.peeking ? 1 : 0,
    frame.morph ?? '',
    frame.overhead ? 1 : 0,
    frame.rolling ? 1 : 0,
    frame.carrying ? 1 : 0,
    frame.skate ? 1 : 0,
    frame.hopping ? 1 : 0,
  ].join('|');
}

/** Counts redraws and skips per part, for the perf check and the test hook. */
export interface RedrawStats {
  drawn: number;
  skipped: number;
}

/**
 * A part's cached key: `stale(key)` says whether to redraw, and remembers
 * the key. A null key always redraws.
 */
export class PartCache {
  private last: string | null = null;

  constructor(private readonly stats?: RedrawStats) {}

  stale(key: string | null): boolean {
    if (key !== null && key === this.last) {
      if (this.stats) this.stats.skipped++;
      return false;
    }
    this.last = key;
    if (this.stats) this.stats.drawn++;
    return true;
  }

  /** Forget the key, so the next frame redraws (the body form changed, say). */
  reset(): void {
    this.last = null;
  }
}
