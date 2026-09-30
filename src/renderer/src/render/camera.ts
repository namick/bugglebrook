import { PIXELS_PER_METER } from '../../../game/constants';

export interface Point {
  x: number;
  y: number;
}

/**
 * Side-scrolling camera. `x` is the world x (meters) at the left edge of the
 * view. The camera only pans horizontally; the view always shows the full
 * world height. Pure math, no Pixi, so it is unit-tested directly.
 */
export class Camera {
  x = 0;
  /** Pan velocity in m/s, for coasting after a drag-pan. */
  velocity = 0;
  /** How fast coasting dies away (per second). Reduce motion raises it so the camera settles sooner. */
  friction = 5;
  private glide: { from: number; to: number; t: number; seconds: number } | null = null;

  constructor(
    readonly worldWidth: number,
    readonly viewWidth: number,
    readonly ppm: number = PIXELS_PER_METER,
  ) {}

  get maxX(): number {
    return Math.max(0, this.worldWidth - this.viewWidth);
  }

  get centerX(): number {
    return this.x + this.viewWidth / 2;
  }

  set(x: number): void {
    this.x = Math.min(this.maxX, Math.max(0, Number.isFinite(x) ? x : 0));
  }

  panBy(dx: number): void {
    this.set(this.x + dx);
  }

  centerOn(worldX: number): void {
    this.set(worldX - this.viewWidth / 2);
  }

  /** Slide smoothly to `x` over `seconds` (the home button, the first scene). */
  glideTo(x: number, seconds: number): void {
    const to = Math.min(this.maxX, Math.max(0, x));
    this.velocity = 0;
    this.glide = seconds > 0 ? { from: this.x, to, t: 0, seconds } : null;
    if (!this.glide) this.set(to);
  }

  get gliding(): boolean {
    return this.glide !== null;
  }

  /** The player took over: stop any slide. */
  stopGlide(): void {
    this.glide = null;
  }

  /** Coast with friction, or carry on a glide. Call once per frame with seconds elapsed. */
  update(dt: number): void {
    const g = this.glide;
    if (g) {
      g.t = Math.min(g.seconds, g.t + dt);
      const u = g.t / g.seconds;
      const k = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      this.set(g.from + (g.to - g.from) * k);
      if (g.t >= g.seconds) this.glide = null;
      return;
    }
    if (this.velocity === 0) return;
    this.panBy(this.velocity * dt);
    this.velocity *= Math.exp(-this.friction * dt);
    if (Math.abs(this.velocity) < 0.05 || this.x <= 0 || this.x >= this.maxX) this.velocity = 0;
  }

  /**
   * Scroll when the pointer is near a screen edge (while carrying something).
   * `viewX` is in logical pixels. Returns the distance panned.
   */
  edgeScroll(viewX: number, viewWidthPx: number, dt: number, edgePx = 140, speed = 9): number {
    let dir = 0;
    if (viewX < edgePx) dir = -(1 - viewX / edgePx);
    else if (viewX > viewWidthPx - edgePx) dir = 1 - (viewWidthPx - viewX) / edgePx;
    if (dir === 0) return 0;
    const before = this.x;
    this.panBy(dir * speed * dt);
    return this.x - before;
  }

  /** World meters to logical view pixels. */
  worldToView(p: Point): Point {
    return { x: (p.x - this.x) * this.ppm, y: p.y * this.ppm };
  }

  /** Logical view pixels to world meters. */
  viewToWorld(p: Point): Point {
    return { x: p.x / this.ppm + this.x, y: p.y / this.ppm };
  }
}
