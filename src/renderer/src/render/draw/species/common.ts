import type { Graphics } from 'pixi.js';
import type { BugDef } from '../../../../../game/data/types';
import type { BugFace, EyeShape } from '../../bugFace';
import { OUTLINE, stroke } from '../../palette';
import type { BugFrame } from '../bug';
import type { Look } from '../face';
import { drawEye } from '../face';
import { walkJoints } from '../../rig/bugRig';

export const TINTS = {
  green: { color: 0x8fd14f, alpha: 0.6 },
  red: { color: 0xff3b2f, alpha: 0.45 },
} as const;

/** Wobbly antenna tip: a damped spring kicked by the body's acceleration. */
export class AntennaSpring {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;

  update(ax: number, ay: number, dt: number): void {
    const k = 160;
    const d = 9;
    const h = Math.min(dt, 1 / 30);
    this.vx += (-k * this.x - d * this.vx - ax * 2.2) * h;
    this.vy += (-k * this.y - d * this.vy - ay * 2.2) * h;
    this.x = Math.max(-18, Math.min(18, this.x + this.vx * h));
    this.y = Math.max(-18, Math.min(18, this.y + this.vy * h));
  }
}

/** The sprite's drawing layers, back to front, that a species painter draws into. */
export interface SpeciesLayers {
  rim: Graphics;
  legsBack: Graphics;
  wings: Graphics;
  body: Graphics;
  shell: Graphics;
  legsFront: Graphics;
  antennae: Graphics;
  face: Graphics;
  /** The curled-up ball, shown instead of everything else while curled. */
  ball: Graphics;
}

/** A box in rig space (facing right, feet at `foot`). */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** What a painter asks of the sprite this frame, on top of the pose. */
export interface Adjust {
  /** Extra body rotation, radians; positive dips the nose. */
  tilt: number;
  /** Extra vertical offset in pixels. */
  bob: number;
  /** Ignore the pose's breathing and the reaction's move (a twig lying still). */
  still: boolean;
}

export const NO_ADJUST: Adjust = { tilt: 0, bob: 0, still: false };

/**
 * Draws one species of bug: static art when its key changes, and the moving
 * parts every frame. Coordinates are rig space: facing right, the collider
 * center at the origin, the ground at `foot`.
 */
export interface SpeciesPainter {
  /** Pixels from the sprite's origin down to the ground. */
  readonly foot: number;
  /** Whether it has a curled-up ball form. */
  readonly curls: boolean;
  /** Draws paint patches itself this frame (per segment) instead of through the shared mask. */
  paintsItself(frame: BugFrame): boolean;
  /** A key for the static art: `drawStatic` runs whenever it changes. */
  key(frame: BugFrame): string;
  /** Static body parts and the hover rim, for the current key. */
  drawStatic(frame: BugFrame): void;
  /** Fill the body's silhouette (no head), to clip paint to. */
  mask(g: Graphics, frame: BugFrame): void;
  /** Where paint patches go: the lower half of the body. */
  paintBox(frame: BugFrame): Box | null;
  /** Where dizzy stars and steam circle, in rig space. */
  crown(frame: BugFrame): { x: number; y: number };
  /** Legs, face, antennae, and anything else that moves. */
  update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust;
  /** A bug waiting to be found: how strong its sign of life is right now, 0 to 1 (test hook). */
  readonly life?: number;
}

export interface PainterArgs {
  def: BugDef;
  /** Collider radius in pixels. */
  r: number;
  layers: SpeciesLayers;
}

/** Point on a cubic bezier. */
export function bezierAt(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/**
 * A tapering tube along a cubic bezier, from width `w0` to `w1`: horns,
 * mandibles, thick legs. Returns the outline polygon.
 */
export function tube(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  w0: number,
  w1: number,
  steps = 14,
): number[] {
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = bezierAt(p0, p1, p2, p3, t);
    const [x2, y2] = bezierAt(p0, p1, p2, p3, Math.min(1, t + 0.01));
    const [x1, y1] = bezierAt(p0, p1, p2, p3, Math.max(0, t - 0.01));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push(x + nx * w, y + ny * w);
    right.push(x - nx * w, y - ny * w);
  }
  const pts = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) pts.push(right[i]!, right[i + 1]!);
  return pts;
}

/** Points along the top of an ellipse, from angle PI to 2 PI. */
export function dome(cx: number, cy: number, rx: number, ry: number, steps = 28): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

/** A jointed leg: hip to knee to foot, as one round-capped stroke. */
export function limb(
  g: Graphics,
  hip: readonly [number, number],
  knee: readonly [number, number],
  foot: readonly [number, number],
  width: number,
  color = OUTLINE,
  alpha = 1,
): void {
  g.moveTo(hip[0], hip[1])
    .lineTo(knee[0], knee[1])
    .lineTo(foot[0], foot[1])
    .stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/** Pupils look in screen space; flip x into the rig's space. */
export function rigLook(frame: BugFrame): Look {
  return { x: frame.look.x * frame.facing, y: frame.look.y };
}

/** Two eyes: [x, y, radius] each, the far one first. */
export function eyePair(
  g: Graphics,
  frame: BugFrame,
  far: readonly [number, number, number],
  near: readonly [number, number, number],
  lid: number,
  line: number,
  shape: EyeShape = frame.face.eyes,
  look: Look = rigLook(frame),
  open = frame.pose.eyeOpen,
): void {
  drawEye(g, far[0], far[1], far[2], shape, look, open, lid, frame.time, Math.max(2, line - 0.5));
  drawEye(g, near[0], near[1], near[2], shape, look, open, lid, frame.time, line);
}

/**
 * Apologetic brows (Whiff), inner ends raised: "/ \" over two eyes. Skipped
 * for eyes that bring their own brows or have none.
 */
export function politeBrows(
  g: Graphics,
  eyes: EyeShape,
  far: readonly [number, number, number],
  near: readonly [number, number, number],
  width: number,
): void {
  if (eyes === 'angry' || eyes === 'worried' || eyes === 'x' || eyes === 'heart' || eyes === 'spiral') return;
  const lift = eyes === 'wide' ? 1.25 : 1;
  const [fx, fy, fr] = far;
  const [nx, ny, nr] = near;
  g.moveTo(fx - fr * 0.85, fy - fr * 1.25 * lift)
    .quadraticCurveTo(fx, fy - fr * 1.45 * lift, fx + fr * 0.75, fy - fr * 1.75 * lift)
    .stroke(stroke(width));
  g.moveTo(nx - nr * 0.7, ny - nr * 1.8 * lift)
    .quadraticCurveTo(nx, ny - nr * 1.5 * lift, nx + nr * 0.9, ny - nr * 1.3 * lift)
    .stroke(stroke(width));
}

/** The red or green face wash, as a circle over the head. */
export function tintHead(
  g: Graphics,
  tint: BugFace['tint'],
  x: number,
  y: number,
  rx: number,
  ry = rx,
): void {
  if (!tint) return;
  g.ellipse(x, y, rx, ry).fill(TINTS[tint]);
}

/** A stroke style for the hover rim light. */
export const RIM = { width: 16, color: 0xffffff, join: 'round' as const, cap: 'round' as const };

/** Is the bug in the air or in the hand (legs loose)? */
export const loose = (frame: BugFrame): boolean => frame.pose.flail;

/** Smooth 0..1 step. */
export const smooth = (t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpPt = (
  a: readonly [number, number],
  b: readonly [number, number],
  t: number,
): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

export type Pt = [number, number];

/** One leg as drawn: hip, knee, and foot. */
export interface LegPose {
  hip: Pt;
  knee: Pt;
  foot: Pt;
}

export interface WalkLegsOptions {
  r: number;
  /** Near-side hips, back to front. The far side copies them, shifted by `farShift`. */
  hips: readonly Pt[];
  farShift: Pt;
  /** Where feet rest. */
  ground: number;
  width: number;
  /** Foot dot radius, or 0 for none. */
  footR: number;
  farColor: number;
  /** Stride length and step height, in radii. */
  reach?: number;
  lift?: number;
  /** Walking backward (Barty with his ball): the step cycle runs the other way. */
  reverse?: boolean;
  /** Override a leg (pair index from the back, far or near, its step phase); null keeps the walk. */
  custom?: (i: number, far: boolean, phase: number) => LegPose | null;
}

/**
 * Six walking legs, beetle style: they step in a tripod gait, dangle and
 * paddle when held or flying, and anything `custom` returns replaces a leg.
 */
export function walkLegs(back: Graphics, front: Graphics, frame: BugFrame, o: WalkLegsOptions): void {
  const { r } = o;
  for (const j of walkJoints(frame.pose, o)) {
    const { far } = j;
    const g = far ? back : front;
    const leg = o.custom?.(j.i, far, j.phase) ?? { hip: j.hip, knee: j.knee, foot: j.foot };
    const color = far ? o.farColor : OUTLINE;
    const alpha = far ? 0.85 : 1;
    limb(g, leg.hip, leg.knee, leg.foot, far ? o.width * 0.85 : o.width, color, alpha);
    if (o.footR > 0) g.circle(leg.foot[0] + r * 0.02, leg.foot[1] - 1, o.footR).fill({ color, alpha });
  }
}

/** A springy antenna: a curve from `base` bending through `mid` to a tip nudged by the spring. */
export function springAntenna(
  g: Graphics,
  frame: BugFrame,
  spring: AntennaSpring,
  base: Pt,
  mid: Pt,
  tip: Pt,
  width: number,
  give = 1,
): Pt {
  const sway = Math.sin(frame.time * 2.1 + base[0] * 0.05) * 1.6;
  const tx = tip[0] + spring.x * frame.facing * give + sway;
  const ty = tip[1] + spring.y * give;
  g.moveTo(base[0], base[1])
    .quadraticCurveTo(mid[0], mid[1], tx, ty)
    .stroke({ width, color: OUTLINE, cap: 'round' });
  return [tx, ty];
}
