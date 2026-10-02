import { PIXELS_PER_METER } from '../../../game/constants';

export interface Point {
  x: number;
  y: number;
}

/** How far past a locked barrier the camera may look: 400 px (game design doc, section 3). */
export const PEEK = 4;
/** How fast it springs back once let go (per second). */
const SPRING_BACK = 6;

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
  /**
   * The open stretch of the world the view may show, in world meters (locked
   * areas lie beyond it). The camera can look `peek` meters past either end,
   * then springs back once nobody holds it there.
   */
  private open = { x0: 0, x1: Infinity };
  /**
   * The furthest the view may ever go (M10): the surface strip, or a hidden
   * area's sealed stretch. No peeking past it. The whole world by default.
   */
  private outer = { x0: 0, x1: Infinity };
  readonly peek = PEEK;
  /** The player is dragging the view or carrying something: no springing back yet. */
  holding = false;

  constructor(
    readonly worldWidth: number,
    readonly viewWidth: number,
    readonly ppm: number = PIXELS_PER_METER,
  ) {}

  get maxX(): number {
    return Math.max(this.minX, Math.min(this.worldWidth, this.outer.x1) - this.viewWidth);
  }

  /** The furthest left the view may go. */
  get minX(): number {
    return Math.max(0, this.outer.x0);
  }

  /** The furthest left and right the view rests at: the open stretch, inside the world. */
  get restMin(): number {
    return Math.min(this.maxX, Math.max(this.minX, this.open.x0));
  }

  get restMax(): number {
    return Math.max(this.restMin, Math.min(this.maxX, this.open.x1 - this.viewWidth));
  }

  /**
   * Set the open stretch (from the sim's barriers), and optionally the outer
   * region the view may never leave (`Barriers.region`).
   */
  setLimits(x0: number, x1: number, outer?: { x0: number; x1: number }): void {
    this.open = { x0, x1 };
    if (outer) this.outer = { x0: outer.x0, x1: outer.x1 };
  }

  /** How far the view is past the open stretch right now (0 inside it). */
  get past(): number {
    return Math.max(this.restMin - this.x, this.x - this.restMax, 0);
  }

  get centerX(): number {
    return this.x + this.viewWidth / 2;
  }

  set(x: number): void {
    const lo = Math.max(this.minX, this.restMin - this.peek);
    const hi = Math.min(this.maxX, this.restMax + this.peek);
    this.x = Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : 0));
  }

  panBy(dx: number): void {
    this.set(this.x + dx);
  }

  centerOn(worldX: number): void {
    this.set(worldX - this.viewWidth / 2);
  }

  /** Slide smoothly to `x` over `seconds` (the home button, the first scene). */
  glideTo(x: number, seconds: number): void {
    const to = Math.min(this.restMax, Math.max(this.restMin, x));
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
    if (this.velocity !== 0) {
      this.panBy(this.velocity * dt);
      this.velocity *= Math.exp(-this.friction * dt);
      const lo = Math.max(this.minX, this.restMin - this.peek);
      const hi = Math.min(this.maxX, this.restMax + this.peek);
      if (Math.abs(this.velocity) < 0.05 || this.x <= lo || this.x >= hi) this.velocity = 0;
    }
    // Looked past a barrier: spring back once let go.
    if (!this.holding && this.past > 0) {
      const target = Math.min(this.restMax, Math.max(this.restMin, this.x));
      this.x += (target - this.x) * (1 - Math.exp(-SPRING_BACK * dt));
      if (Math.abs(target - this.x) < 0.005) this.x = target;
      this.velocity = 0;
    }
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
