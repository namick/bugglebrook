import type { Point2 } from '../data/types';
import type { ShapeSpec } from '../physics/physics';

/**
 * Water math (game design doc, section 3, `fix_pond_water`). Pure functions:
 * how much of a shape is under a flat surface, where the surface meets the
 * banks, and how hard water pushes back. The sim applies the forces.
 */

/** A water surface right now, in world meters. */
export interface WaterSurface {
  /** Area that owns it. */
  areaId: string;
  /** World y of the surface (y grows downward). */
  level: number;
  /** Left and right edges, where the banks rise above the surface. */
  left: number;
  right: number;
}

/**
 * Fraction (0 to 1) of a shape's area below the surface. Circles use the
 * exact circular segment; boxes use their vertical extent at this angle,
 * which is close enough for floating things.
 */
export function submergedFraction(shape: ShapeSpec, angle: number, cy: number, level: number): number {
  if (shape.type === 'circle') {
    const r = shape.radius;
    const h = Math.min(2 * r, Math.max(0, cy + r - level));
    if (h <= 0) return 0;
    if (h >= 2 * r) return 1;
    const d = r - h;
    const area = r * r * Math.acos(d / r) - d * Math.sqrt(Math.max(0, 2 * r * h - h * h));
    return area / (Math.PI * r * r);
  }
  const half = (shape.width / 2) * Math.abs(Math.sin(angle)) + (shape.height / 2) * Math.abs(Math.cos(angle));
  return Math.min(1, Math.max(0, (cy + half - level) / (2 * half)));
}

/**
 * Where a flat surface at `level` meets a terrain polyline, searching out
 * from `center` inside [x0, x1]. Returns the left and right edges, or null
 * if the ground at `center` is above the surface (no water there).
 */
export function waterEdges(
  points: readonly Point2[],
  level: number,
  center: number,
  x0: number,
  x1: number,
): { left: number; right: number } | null {
  const yAt = (x: number): number => {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i]!;
      const [bx, by] = points[i + 1]!;
      if (x >= ax && x <= bx) return bx === ax ? ay : ay + ((by - ay) * (x - ax)) / (bx - ax);
    }
    return points[points.length - 1]![1];
  };
  if (yAt(center) <= level) return null;
  let left = x0;
  let right = x1;
  // Walk segments outward from the center to the first crossing.
  for (let i = points.length - 2; i >= 0; i--) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    if (bx > center || bx < x0) continue;
    if (ay <= level && by > level) {
      left = ax + ((level - ay) * (bx - ax)) / (by - ay);
      break;
    }
    if (ax <= x0) break;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    if (ax < center || ax > x1) continue;
    if (ay > level && by <= level) {
      right = ax + ((level - ay) * (bx - ax)) / (by - ay);
      break;
    }
    if (bx >= x1) break;
  }
  return { left: Math.max(x0, left), right: Math.min(x1, right) };
}

/**
 * Upward buoyant acceleration (m/s², pointing up) on something with
 * `density` relative to water, `fraction` submerged. At rest a floater sinks
 * until `fraction` equals its density.
 */
export function buoyancyAccel(gravity: number, fraction: number, density: number): number {
  return (gravity * fraction) / Math.max(0.05, density);
}

/** Water drag, per second, scaled by how deep the thing is. */
export const WATER_DRAG = 3.2;
export const WATER_SPIN_DRAG = 4;

/**
 * A low, fast throw skips: under 20 degrees and over 10 m/s, for things
 * that are not bugs. Returns the bounced velocity, or null to go in.
 */
export function skipVelocity(vx: number, vy: number): { vx: number; vy: number } | null {
  const speed = Math.hypot(vx, vy);
  if (speed < 10 || vy <= 0) return null;
  const angle = Math.atan2(vy, Math.abs(vx));
  if (angle > (20 * Math.PI) / 180) return null;
  return { vx: vx * 0.82, vy: -Math.max(1.8, vy * 0.6) };
}

/** Points along the hose's spray arc, every `step` seconds, until it reaches `level`. */
export function sprayArc(
  x: number,
  y: number,
  vx: number,
  vy: number,
  gravity: number,
  level: number,
  step = 0.05,
): Point2[] {
  const out: Point2[] = [];
  for (let t = 0; t < 3; t += step) {
    const px = x + vx * t;
    const py = y + vy * t + 0.5 * gravity * t * t;
    out.push([px, py]);
    if (py >= level && t > 0) break;
  }
  return out;
}
