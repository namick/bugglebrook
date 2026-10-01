import type { EntityId } from '../core/entities';

/**
 * Photo mode's side of the sim (game design doc, section 14). The renderer
 * owns the viewfinder, frames, stickers, and the file; the sim owns the
 * camera moment and the freeze. For 0.8 s after the camera comes out, bugs
 * in view react to it by personality (the `camera` reaction), then the
 * world holds still: `step` drains commands and does nothing else until the
 * camera goes away. The freeze is not saved; a loaded world always runs.
 */
export interface PhotoState {
  /** The tick the camera came out. */
  at: number;
  /** The camera moment is over and the world holds still. */
  frozen: boolean;
}

/** How long bugs get to react before the world freezes: 0.8 s. */
export const PHOTO_MOMENT_TICKS = 48;

/** Bugs stacked this long (2 s) make a totem (`secret_bug_totem`). */
export const TOTEM_TICKS = 120;
/** How many bugs make a totem. */
export const TOTEM_COUNT = 4;
/** A bug counts as resting under this speed, in m/s. */
const TOTEM_STILL = 0.35;
/** Bugs in one totem are within this of each other in x, in meters. */
const TOTEM_LEAN = 0.55;
/** Vertical gaps between stacked bugs, in meters (a small bug on a big one, or the reverse). */
const TOTEM_GAP = { min: 0.3, max: 1.9 };

export interface TotemBug {
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: boolean;
}

/**
 * Four or more bugs resting in a vertical stack, bottom first, or null.
 * Resting means still and not in the hand. A stack is bugs within a little
 * of the same x, each a body's height above the one below.
 */
export function findTotem(bugs: readonly TotemBug[]): EntityId[] | null {
  const still = bugs.filter((b) => !b.held && Math.hypot(b.vx, b.vy) < TOTEM_STILL);
  if (still.length < TOTEM_COUNT) return null;
  // Try every bug as the base and climb from it.
  for (const base of still) {
    const stack = [base];
    let top = base;
    for (;;) {
      let next: TotemBug | null = null;
      for (const b of still) {
        if (stack.includes(b) || Math.abs(b.x - top.x) > TOTEM_LEAN) continue;
        const gap = top.y - b.y;
        if (gap < TOTEM_GAP.min || gap > TOTEM_GAP.max) continue;
        if (!next || b.y > next.y) next = b;
      }
      if (!next) break;
      stack.push(next);
      top = next;
    }
    if (stack.length >= TOTEM_COUNT) return stack.map((b) => b.id);
  }
  return null;
}

/** Is a bug at x in the camera's frame (with a little slack past the edges)? */
export function inFrame(x: number, view: { x0: number; x1: number }, slack = 1): boolean {
  return x >= view.x0 - slack && x <= view.x1 + slack;
}
