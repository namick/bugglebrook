import type { BugDef } from '../../../../game/data/types';
import type { BodyForm } from '../bugFace';
import type { BugFrame } from '../draw/bug';
import type { Look } from '../draw/face';
import type { BugRig, FacePlacement, Feeler, Pt, Tip } from './bugRig';
import { BEETLES, antennaPaths, facePlacement, legJoints, paintBox, sampleFeeler, wingState } from './bugRig';

/**
 * Where every cutout piece of a bug goes this frame: the pose the cutout
 * renderer (`art/spriteBug.ts`) draws the artist's parts in. Built from the
 * same joint math the code-drawn bug uses, so the two bend in the same
 * places: `codeSkeleton` for the bugs `BugSprite` draws itself, and each
 * species painter's `skeleton` for the rest. Pure, no Pixi.
 */

/** Which drawing layer a piece goes in, back to front (the code-drawn bug's layers). */
export type Slot = 'back' | 'wings' | 'body' | 'shell' | 'front' | 'top';

export const SLOTS: readonly Slot[] = ['back', 'wings', 'body', 'shell', 'front', 'top'];

interface ItemBase {
  /** The art layer's name. */
  part: string;
  slot: Slot;
  /** A far-side piece: darker and a little see-through. */
  far?: boolean;
  /** Color it (tint layers), instead of the far darkening. */
  tint?: number;
  alpha?: number;
}

/** A rigid part: its rig pivot goes to `at`, turned and scaled about it. */
export interface PieceItem extends ItemBase {
  kind: 'piece';
  at: Pt;
  rotation?: number;
  sx?: number;
  sy?: number;
}

/**
 * A jointed limb: `part` from `hip` to `knee`, then `lower` from there to
 * `foot`. With no `lower`, `part` alone reaches from `hip` to `foot`.
 */
export interface LimbItem extends ItemBase {
  kind: 'limb';
  lower: string | null;
  hip: Pt;
  knee: Pt;
  foot: Pt;
}

/** A bendy feeler or stalk along a curve (9 points, base to tip). */
export interface RopeItem extends ItemBase {
  kind: 'rope';
  pts: Pt[];
}

export type SkeletonItem = PieceItem | LimbItem | RopeItem;

/** Things the game draws on top of the art itself. */
export type Extra =
  /** Glorp's foot ripples. */
  | { kind: 'ripple' }
  /** The thread Munch's cocoon hangs from. */
  | { kind: 'thread' }
  /** Prim's chop swoosh. */
  | { kind: 'swoosh'; alpha: number };

/** The face, with what only some bugs have. */
export interface SkeletonFace extends FacePlacement {
  /** Pupils look here instead of at the hand (Barty, aloof). */
  look?: Look;
  /** Whiff's apologetic brows over open eyes. */
  polite?: boolean;
  /** More blush spots (Munch has two). */
  cheeks?: NonNullable<FacePlacement['cheek']>[];
}

export interface SkeletonPaint {
  /** The item (an index into `items`) whose drawing the paint is clipped to. */
  mask: number;
  box: { x0: number; x1: number; y0: number; y1: number };
  /** Paint colors, or null for the bug's paint. */
  colors: number[] | null;
}

export interface Skeleton {
  /** Back to front within each slot. */
  items: SkeletonItem[];
  face: SkeletonFace | null;
  /** The piece the face's green or red wash colors. */
  headPart: string | null;
  /** Curled into a ball: this part is shown instead of everything else, rolling. */
  ball: { part: string; tint?: number } | null;
  paint: SkeletonPaint[];
  extras: Extra[];
  /** Extra body turn and lift, and whether to ignore breathing and reaction moves. */
  adjust: { tilt: number; bob: number; still: boolean };
  /** Where dizzy stars and steam circle, or null for the default. */
  crown: Pt | null;
}

export const p = (x: number, y: number): Pt => ({ x, y });
export const pt = (q: readonly [number, number]): Pt => ({ x: q[0], y: q[1] });

/** A quadratic feeler (base, bend, tip) as the 9 points a rope follows. */
export function quadRope(base: Pt, mid: Pt, tip: Pt): Pt[] {
  return sampleFeeler({ kind: 'quad', pts: [base, mid, tip] }, 8);
}

/** The pivot of a rig part (in rig pixels), or the origin if the rig has no such part. */
export function pivotOf(rig: BugRig, part: string): Pt {
  return rig.parts.find((q) => q.name === part)?.pivot ?? p(0, 0);
}

/** A part sitting where the template put it. */
export function rest(rig: BugRig, part: string, slot: Slot, extra: Partial<PieceItem> = {}): PieceItem {
  return { kind: 'piece', part, slot, at: pivotOf(rig, part), ...extra };
}

/** A knob that sits on the end of a feeler, turned along it. */
export function tipOn(pts: Pt[], part: string, slot: Slot = 'top'): PieceItem {
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  return { kind: 'piece', part, slot, at: b, rotation: Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2 };
}

export const NO_ADJUST = { tilt: 0, bob: 0, still: false };

/** The upper and lower piece names for each kind of leg in `legJoints`. */
const LEG_PARTS = {
  leg: ['leg_upper', 'leg_lower'],
  leg_long: ['leg_long_upper', 'leg_long_lower'],
  hindleg: ['hindleg_thigh', 'hindleg_shin'],
} as const;

/** A feeler from `antennaPaths` as cutout items: a rope (and its knob), or two rigid pieces for an elbowed one. */
function feelerItems(f: Feeler, rope: string, tip: string | null): SkeletonItem[] {
  if (f.kind === 'jointed') {
    const [hip, knee, foot] = f.pts as [Pt, Pt, Pt];
    return [{ kind: 'limb', part: 'antenna_base', lower: 'antenna_end', slot: 'top', hip, knee, foot }];
  }
  const pts = sampleFeeler(f, 8);
  const out: SkeletonItem[] = [{ kind: 'rope', part: rope, slot: 'top', pts }];
  if (tip) out.push(tipOn(pts, tip));
  return out;
}

/**
 * The pose of a bug `BugSprite` draws itself (Dot, Rollo, Glorp, Skeet,
 * Boing, Flick): its legs, feelers, shell, wings, and forms.
 */
export function codeSkeleton(
  rig: BugRig,
  def: BugDef,
  frame: BugFrame,
  springs: readonly Tip[],
  form: BodyForm,
): Skeleton {
  const { r, art } = rig;
  const has = (name: string): boolean => rig.parts.some((q) => q.name === name);
  const sk: Skeleton = {
    items: [],
    face: null,
    headPart: has('head') ? 'head' : null,
    ball: null,
    paint: [],
    extras: [],
    adjust: NO_ADJUST,
    crown: null,
  };
  if (form === 'curled' && has('ball')) {
    sk.ball = { part: 'ball' };
    return sk;
  }
  const items = sk.items;
  const box = paintBox(rig, form);
  if (art === 'snail' && form === 'in_shell') {
    items.push(rest(rig, 'shell_closed', 'shell'));
    sk.face = facePlacement(rig, def, frame, springs, form);
    sk.headPart = null;
    if (box) sk.paint.push({ mask: 0, box, colors: null });
    return sk;
  }
  // Wing covers on their hinge, and the flapping wings behind them.
  const wings = wingState(rig, frame, form);
  for (const part of rig.parts) {
    if (part.form) continue;
    if (part.kind === 'static') items.push(rest(rig, part.name, 'body'));
    if (part.kind === 'hinged') items.push(rest(rig, part.name, 'shell', { rotation: wings.shellAngle }));
  }
  const wing = rig.parts.find((q) => q.kind === 'wing');
  if (wing)
    for (const w of wings.wings)
      items.push({
        kind: 'piece',
        part: wing.name,
        slot: 'wings',
        at: p(w.x, wing.pivot.y),
        sy: w.ry / (r * 0.55),
      });
  // Legs: far ones behind the body, near ones in front.
  if (art !== 'snail')
    for (const j of legJoints(rig, frame.pose, frame)) {
      const [upper, lower] = LEG_PARTS[j.part];
      items.push({
        kind: 'limb',
        part: upper,
        lower,
        slot: j.far ? 'back' : 'front',
        far: j.far,
        hip: j.hip,
        knee: j.knee,
        foot: j.foot,
      });
    }
  const rope = art === 'snail' ? 'stalk' : 'antenna';
  const tip = BEETLES.has(art) ? 'antenna_tip' : null;
  for (const f of antennaPaths(rig, frame, springs, form)) items.push(...feelerItems(f, rope, tip));
  sk.face = facePlacement(rig, def, frame, springs, form);
  if (art === 'snail') {
    sk.extras.push({ kind: 'ripple' });
    sk.headPart = 'body';
  }
  const mask = ['shell', 'body'].map((n) => items.findIndex((i) => i.part === n)).find((i) => i >= 0);
  if (box && mask !== undefined) sk.paint.push({ mask, box, colors: null });
  return sk;
}
