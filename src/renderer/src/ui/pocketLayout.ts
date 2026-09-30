import { POCKET_SLOTS } from '../../../game/systems/pocket';

/**
 * Where the pocket tray and its six slots sit on screen (game design doc,
 * section 2), in logical view pixels. Pure, so the hit tests are unit-tested.
 */
export const POCKET = {
  viewWidth: 1920,
  viewHeight: 1080,
  slotW: 116,
  slotH: 104,
  gap: 16,
  padX: 36,
  /** Tray height when open. */
  height: 150,
  /** The slim tab that stays visible once the pocket holds anything. */
  tab: 30,
  /** Hovering this close to the bottom opens the tray. */
  hoverBand: 60,
  /** Drops snap to a slot within this many pixels of it. */
  snap: 20,
  /** Seconds to slide up. */
  slideSeconds: 0.15,
} as const;

export const POCKET_WIDTH = POCKET.padX * 2 + POCKET_SLOTS * POCKET.slotW + (POCKET_SLOTS - 1) * POCKET.gap;
export const POCKET_X = (POCKET.viewWidth - POCKET_WIDTH) / 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tray's top edge for how open it is (0 hidden, 1 open) and whether it holds anything. */
export function trayTop(open: number, hasContents: boolean): number {
  const closed = hasContents ? POCKET.viewHeight - POCKET.tab : POCKET.viewHeight + 12;
  const opened = POCKET.viewHeight - POCKET.height;
  return closed + (opened - closed) * Math.max(0, Math.min(1, open));
}

/** Slot `i`'s rectangle with the tray's top edge at `top`. */
export function slotRect(i: number, top: number): Rect {
  return {
    x: POCKET_X + POCKET.padX + i * (POCKET.slotW + POCKET.gap),
    y: top + 26,
    w: POCKET.slotW,
    h: POCKET.slotH,
  };
}

/**
 * Which slot a point is over, with the snap margin, or null. Only while the
 * tray is at least half open, so a closed tray never catches a drop.
 */
export function slotAt(x: number, y: number, open: number, hasContents: boolean): number | null {
  if (open < 0.5) return null;
  const top = trayTop(open, hasContents);
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < POCKET_SLOTS; i++) {
    const r = slotRect(i, top);
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
    const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
    if (dx > POCKET.snap || dy > POCKET.snap) continue;
    const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** Should the tray be open? While holding something, or hovering the bottom band. */
export function trayWantsOpen(holding: boolean, pointerY: number | null): boolean {
  return holding || (pointerY !== null && pointerY >= POCKET.viewHeight - POCKET.hoverBand);
}

/** Move `open` toward its target at the slide speed. */
export function slideTray(open: number, want: boolean, dt: number): number {
  const step = dt / POCKET.slideSeconds;
  return want ? Math.min(1, open + step) : Math.max(0, open - step);
}

/** Pips for a stack: one per thing, shown only for stacks of two or more (no numbers). */
export function pipCount(stack: number): number {
  return stack >= 2 ? Math.min(9, stack) : 0;
}
