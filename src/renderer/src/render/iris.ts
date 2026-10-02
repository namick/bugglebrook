/**
 * The doorway iris wipe (game design doc, section 3): 600 ms, shaped like
 * the doorway. The dark closes in on the doorway the player went through,
 * the camera moves at the middle, and it opens again around the doorway on
 * the other side. Pure timing and shapes, so they are unit-tested.
 */

export const IRIS_SECONDS = 0.6;
export const IRIS_HALF = IRIS_SECONDS / 2;
/** Hold the hand over an open doorway this long (s) while carrying something, and through it goes. */
export const DOOR_DWELL = 0.4;

/** The hole's shape: the ant hill's arch, a round door or shaft, the gnome's cone hat. */
export type IrisShape = 'arch' | 'circle' | 'cone';

/** The hole's shape for a doorway fixture kind. */
export function irisShape(kind: string): IrisShape {
  switch (kind) {
    case 'ant_hill':
      return 'arch';
    case 'gnome_door':
      return 'cone';
    default:
      return 'circle';
  }
}

export interface IrisFrame {
  /** 0 (shut) to 1 (wide open: past the screen's corners). */
  open: number;
  /** Second half: the hole is around the far doorway. */
  arrived: boolean;
  /** The wipe is over. */
  done: boolean;
}

/** The wipe at `t` seconds: easing in to shut, holding a beat, easing out to open. */
export function irisAt(t: number): IrisFrame {
  if (t >= IRIS_SECONDS) return { open: 1, arrived: true, done: true };
  if (t < IRIS_HALF) {
    const u = t / IRIS_HALF;
    return { open: 1 - u * u, arrived: false, done: false };
  }
  const u = (t - IRIS_HALF) / IRIS_HALF;
  return { open: 1 - (1 - u) * (1 - u), arrived: true, done: false };
}

/** The hole's radius (px) for `open`, reaching every corner of a w by h screen from (x, y). */
export function irisRadius(open: number, x: number, y: number, w: number, h: number, min = 0): number {
  const far = Math.max(
    Math.hypot(x, y),
    Math.hypot(w - x, y),
    Math.hypot(x, h - y),
    Math.hypot(w - x, h - y),
  );
  return min + (far * 1.15 - min) * Math.max(0, Math.min(1, open));
}

/**
 * The hole as a polygon (flat [x, y] pairs) around (x, y) at radius r:
 * an arch (flat bottom, round top), a circle, or a cone (a hat's point up).
 */
export function irisPolygon(shape: IrisShape, x: number, y: number, r: number, steps = 40): number[] {
  const out: number[] = [];
  if (shape === 'circle') {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    return out;
  }
  if (shape === 'arch') {
    // A doorway: straight sides, a round top, a flat sill.
    const w = r * 0.8;
    out.push(x - w, y + r * 0.7, x + w, y + r * 0.7);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      out.push(x + Math.cos(a) * w, y - r * 0.2 - Math.sin(a) * w);
    }
    return out;
  }
  // A cone: the gnome's hat, its tip up, with a rounded brim.
  out.push(x, y - r * 1.15);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    out.push(x + Math.cos(a) * r * 0.85, y + r * 0.45 + Math.sin(a) * r * 0.35);
  }
  return out;
}
