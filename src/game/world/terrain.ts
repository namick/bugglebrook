import type { AreaDef, Point2 } from '../data/types';

export interface Normal {
  x: number;
  y: number;
}

/**
 * The walkable ground surface: a height field built from each area's
 * terrain polyline, in world meters. Physics turns it into a static chain;
 * the AI and the renderer read heights and slopes from here.
 */
export class Terrain {
  readonly points: readonly Point2[];

  constructor(points: readonly Point2[]) {
    if (points.length < 2) throw new Error('Terrain needs at least two points');
    this.points = points;
  }

  static fromAreas(areas: readonly AreaDef[]): Terrain {
    const sorted = [...areas].sort((a, b) => a.xStart - b.xStart);
    const points: Point2[] = [];
    for (const area of sorted) {
      for (const [x, y] of area.terrain) {
        const wx = area.xStart + x;
        const prev = points[points.length - 1];
        // Neighbouring areas share their border point.
        if (prev && wx - prev[0] < 0.01) continue;
        points.push([wx, y]);
      }
    }
    return new Terrain(points);
  }

  get minX(): number {
    return this.points[0]![0];
  }

  get maxX(): number {
    return this.points[this.points.length - 1]![0];
  }

  /** Index of the segment under x, clamped to the ends. */
  private segment(x: number): number {
    const pts = this.points;
    let lo = 0;
    let hi = pts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pts[mid]![0] <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Height of the surface at x (y grows downward). */
  surfaceY(x: number): number {
    const i = this.segment(x);
    const [x0, y0] = this.points[i]!;
    const [x1, y1] = this.points[i + 1]!;
    const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return y0 + (y1 - y0) * t;
  }

  /** Unit normal pointing up out of the ground at x. */
  normal(x: number): Normal {
    const i = this.segment(x);
    const [x0, y0] = this.points[i]!;
    const [x1, y1] = this.points[i + 1]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    return { x: dy / len, y: -dx / len };
  }
}
