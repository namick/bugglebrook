import { PIXELS_PER_METER } from '../../../game/constants';
import type { BugDef, ItemDef, WearSlot } from '../../../game/data/types';

/**
 * Where worn things go on a bug (M11, game design doc, section 7.3). Pure:
 * the bug's drawing says where its head is this frame (`WearSpot`, in rig
 * space: facing right, the collider center at the origin), and this works
 * out where each worn thing sits, how big it is, and whether it goes behind
 * the body. Both the code-drawn bugs and the cutout bugs use it, so a hat
 * follows the same head either way.
 */

export interface Oval {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** What a bug's drawing tells the wardrobe this frame. */
export interface WearSpot {
  /** The head, or null when it is tucked away (curled up, in a shell, in a cocoon, lying as a twig). */
  head: Oval | null;
  /** The top of whatever shows instead of the head: a hat sits here when `head` is null. */
  top: { x: number; y: number };
  /** Curled into a ball: worn things perch on top, upright, and do not roll with it. */
  ball: boolean;
  /** The middle of the back, for capes, bows, and backpacks. */
  back: { x: number; y: number };
  /** The ground under the feet. */
  feet: { x: number; y: number };
  /** The head's turn, radians (Prim's head tilts with her poses). */
  tilt?: number;
}

/** Where on a bug a worn thing sits, within its slot. */
export type WearSeat = 'crown' | 'brow' | 'eyes' | 'eye' | 'lip' | 'back' | 'neck' | 'feet';

/** One worn thing, placed: rig-space position, turn, scale, and which layer it goes in. */
export interface WearPlacement {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  /** Behind the body (a cape, a backpack), or in front of it. */
  behind: boolean;
  /** Hidden this frame (glasses with the face tucked away). */
  hidden: boolean;
}

/**
 * How wide each seat's thing is drawn: on the head, a share of the head's
 * width; on the body, a share of the body's. So one hat fits every head.
 */
export const FIT: Readonly<Record<WearSeat, number>> = {
  crown: 1.15,
  brow: 1.0,
  eyes: 1.0,
  eye: 0.5,
  lip: 0.85,
  neck: 0.4,
  back: 0.5,
  feet: 0.85,
};
/** A bandage is a little patch. */
const PATCH = 0.3;

/** The seat each wearable uses (its slot's default unless listed). */
const SEATS: Readonly<Record<string, WearSeat>> = {
  item_acc_mustache: 'lip',
  item_acc_snorkel: 'lip',
  item_acc_monocle: 'eye',
  item_acc_headlamp: 'brow',
  item_acc_bowtie_ribbon: 'neck',
  item_acc_scarf_yarn: 'neck',
};

const SLOT_SEAT: Readonly<Record<WearSlot, WearSeat>> = {
  head: 'crown',
  face: 'eyes',
  back: 'back',
  feet: 'feet',
};

export function seatOf(item: ItemDef): WearSeat {
  return SEATS[item.id] ?? SLOT_SEAT[item.wear ?? 'head'];
}

/** Things worn behind the body. */
const BEHIND: ReadonlySet<string> = new Set(['item_acc_cape_leaf', 'item_acc_backpack_matchbox']);

/** The head a bug is drawn with at rest, from its def (meters to pixels). */
export function restHead(def: BugDef): Oval {
  const [x, y] = def.wear.head;
  const r = def.wear.headR * PIXELS_PER_METER;
  return { x: x * PIXELS_PER_METER, y: y * PIXELS_PER_METER, rx: r, ry: r };
}

/** How wide an item's drawing is, in pixels. */
function widthOf(item: ItemDef): number {
  const sh = item.shape;
  return (sh.type === 'circle' ? sh.radius * 2 : sh.width) * PIXELS_PER_METER;
}

/**
 * How much a worn thing is scaled: things on the head take a share of the
 * head's width (so they scale with its radius), things on the back and feet
 * a share of the body's.
 */
export function wearScale(def: BugDef, item: ItemDef, head: Oval | null): number {
  const seat = seatOf(item);
  const w = widthOf(item);
  if (seat === 'back' || seat === 'feet' || seat === 'neck') {
    const body = def.radius * 2 * PIXELS_PER_METER;
    const share = item.id === 'item_acc_bandaid' ? PATCH : FIT[seat];
    return clamp((body * share) / w, 0.3, 2);
  }
  const hr = head ? (head.rx + head.ry) / 2 : def.wear.headR * PIXELS_PER_METER;
  // Hats fit by their width; a tall thing on the face (a snorkel) by its longest side.
  const size = seat === 'crown' ? w : Math.max(w, halfHeight(item) * 2);
  return clamp((hr * 2 * FIT[seat]) / size, 0.3, 2.5);
}

/** Half the height of an item's drawing, in pixels. */
function halfHeight(item: ItemDef): number {
  const s = item.shape;
  return (s.type === 'circle' ? s.radius : s.height / 2) * PIXELS_PER_METER;
}

/** Where a worn thing sits this frame. */
export function placeWorn(def: BugDef, item: ItemDef, spot: WearSpot): WearPlacement {
  const seat = seatOf(item);
  const head = spot.head;
  const k = wearScale(def, item, head);
  const tilt = spot.tilt ?? 0;
  const behind = BEHIND.has(item.id);
  const hh = halfHeight(item) * k;
  const out = (x: number, y: number, rotation = tilt, hidden = false): WearPlacement => ({
    x,
    y,
    rotation,
    scale: k,
    behind,
    hidden,
  });
  switch (seat) {
    case 'crown': {
      // On top of the head, a little forward, sunk in a touch so it sits rather than floats.
      if (!head) return out(spot.top.x, spot.top.y - hh * 0.8, 0);
      return out(head.x + head.rx * 0.1, head.y - head.ry * 0.78 - hh * 0.55);
    }
    case 'brow':
      if (!head) return out(spot.top.x, spot.top.y, 0, true);
      return out(head.x + head.rx * 0.25, head.y - head.ry * 0.55);
    case 'eyes':
      if (!head) return out(spot.top.x, spot.top.y, 0, true);
      return out(head.x + head.rx * 0.32, head.y - head.ry * 0.12);
    case 'eye':
      if (!head) return out(spot.top.x, spot.top.y, 0, true);
      return out(head.x + head.rx * 0.48, head.y - head.ry * 0.1);
    case 'lip':
      if (!head) return out(spot.top.x, spot.top.y, 0, true);
      return out(head.x + head.rx * 0.62, head.y + head.ry * 0.36);
    case 'neck':
      if (!head || spot.ball) return out(spot.back.x, spot.back.y, 0, spot.ball);
      return out(head.x - head.rx * 0.7, head.y + head.ry * 0.55);
    case 'back':
      // Curled up, a backpack or a cape rides on top of the ball.
      if (spot.ball) return out(spot.top.x, spot.top.y - hh * 0.4, 0);
      // A bandage sticks on the side of the body; a pack or a cape sinks into the back, behind it.
      if (item.id === 'item_acc_bandaid') return out(spot.back.x, spot.back.y * 0.45, -0.3);
      return out(spot.back.x, spot.back.y + hh * 0.35, 0);
    case 'feet':
      return out(spot.feet.x, spot.feet.y - hh * 0.6, 0, spot.ball);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
