/**
 * A wobbly water surface: a row of springy columns that pull back to rest
 * and pass their motion to their neighbours, so a splash spreads out as
 * ripples. Heights are in pixels (down is positive, like the screen). Pure
 * and cosmetic: the sim's surface stays flat.
 */
export class WaveSurface {
  readonly count: number;
  readonly h: Float64Array;
  readonly v: Float64Array;
  private readonly spread: Float64Array;

  constructor(
    /** Left edge in world pixels. */
    readonly x0: number,
    /** Right edge in world pixels. */
    readonly x1: number,
    /** Column spacing in pixels. */
    readonly spacing = 10,
    /** Spring back to rest (1/s²), damping (1/s), and how much neighbours share. */
    readonly stiffness = 42,
    readonly damping = 1.8,
    readonly share = 0.22,
    /** Largest heap or dip, in pixels. */
    readonly limit = 22,
  ) {
    this.count = Math.max(2, Math.ceil((x1 - x0) / spacing) + 1);
    this.h = new Float64Array(this.count);
    this.v = new Float64Array(this.count);
    this.spread = new Float64Array(this.count);
  }

  private index(x: number): number {
    return (x - this.x0) / this.spacing;
  }

  /**
   * Kick the surface at x: `speed` in px/s (positive pushes down), spread
   * over `radius` pixels with a smooth falloff.
   */
  disturb(x: number, speed: number, radius = 30): void {
    const c = this.index(x);
    const r = Math.max(1, radius / this.spacing);
    const lo = Math.max(0, Math.floor(c - r));
    const hi = Math.min(this.count - 1, Math.ceil(c + r));
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs(i - c) / r;
      if (d <= 1) this.v[i]! += speed * 0.5 * (1 + Math.cos(Math.PI * d));
    }
  }

  /** Advance by `dt` seconds, in small substeps so it never blows up. */
  step(dt: number): void {
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.count; i++) {
        this.v[i]! += (-this.stiffness * this.h[i]! - this.damping * this.v[i]!) * h;
        // Soft cap: water heaps and dips, but the surface never tears open.
        this.h[i] = Math.max(-this.limit, Math.min(this.limit, this.h[i]! + this.v[i]! * h));
      }
      // Neighbours pull on each other: that is what makes ripples travel.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < this.count; i++) {
          const left = i > 0 ? this.h[i - 1]! : this.h[i]!;
          const right = i < this.count - 1 ? this.h[i + 1]! : this.h[i]!;
          this.spread[i] = this.share * (left + right - 2 * this.h[i]!);
        }
        for (let i = 0; i < this.count; i++) this.v[i]! += this.spread[i]! * 60 * h * 8;
      }
    }
  }

  /** Surface offset at world pixel x, interpolated. 0 outside the water. */
  heightAt(x: number): number {
    const c = this.index(x);
    if (c <= 0) return this.h[0]!;
    if (c >= this.count - 1) return this.h[this.count - 1]!;
    const i = Math.floor(c);
    const t = c - i;
    return this.h[i]! * (1 - t) + this.h[i + 1]! * t;
  }

  /** Slope of the surface at x (px per px), for rocking floaters. */
  slopeAt(x: number): number {
    return (this.heightAt(x + this.spacing) - this.heightAt(x - this.spacing)) / (2 * this.spacing);
  }

  /** Total motion left, for tests: settles toward 0. */
  energy(): number {
    let e = 0;
    for (let i = 0; i < this.count; i++)
      e += this.h[i]! * this.h[i]! * this.stiffness + this.v[i]! * this.v[i]!;
    return e;
  }
}

/**
 * Gentle always-on swell, so still water still breathes. Pure function of
 * time and x (pixels).
 */
export function swell(x: number, time: number): number {
  return Math.sin(x / 140 + time * 1.3) * 2.2 + Math.sin(x / 57 - time * 2.1) * 1.1;
}
