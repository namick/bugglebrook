/**
 * Squash-and-stretch math (game design doc, section 15). Pure, so it is
 * unit-tested without Pixi.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * A scale that springs back to 1 on both axes (stiffness 300, damping 18).
 * `kick` snaps it to a shape; `update` lets it wobble home.
 */
export class SquashSpring {
  sx = 1;
  sy = 1;
  /** How much of each kick to use: 1 normally, less with reduce motion on. */
  amount = 1;
  private vx = 0;
  private vy = 0;

  constructor(
    readonly stiffness = 300,
    readonly damping = 18,
  ) {}

  kick(sx: number, sy: number): void {
    this.sx = 1 + (sx - 1) * this.amount;
    this.sy = 1 + (sy - 1) * this.amount;
    this.vx = 0;
    this.vy = 0;
  }

  /** Pick up: instant 1.15 wide by 0.87 tall. */
  grab(): void {
    this.kick(1.15, 0.87);
  }

  /** Landing squash, stronger for harder hits (impact in m/s). */
  land(impact: number): void {
    const s = 1 - Math.min(impact / 30, 0.4);
    this.kick(1 / s, s);
  }

  /** A poke: 0.9 wide, 1.1 tall. */
  poke(): void {
    this.kick(0.9, 1.1);
  }

  update(dt: number): void {
    // Sub-step so a long frame cannot blow the spring up.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = Math.min(dt, 0.1) / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += (-this.stiffness * (this.sx - 1) - this.damping * this.vx) * h;
      this.vy += (-this.stiffness * (this.sy - 1) - this.damping * this.vy) * h;
      this.sx += this.vx * h;
      this.sy += this.vy * h;
    }
  }

  get settled(): boolean {
    return Math.abs(this.sx - 1) < 0.002 && Math.abs(this.sy - 1) < 0.002 && Math.abs(this.vx) < 0.01;
  }
}

/**
 * Stretch along the direction of motion: s = 1 + min(speed / 25, max - 1)
 * with speed in m/s (2500 px/s in the doc). Items stretch half as much.
 */
export function stretchFor(speed: number, max = 1.3, factor = 1): number {
  return 1 + clamp((speed / 25) * factor, 0, max - 1);
}

/**
 * Screen shake for this frame, in pixels: random within `power`, fading
 * over the last 0.16 s. Reduce motion turns it off entirely (M5 acceptance:
 * the offset is always 0).
 */
export function shakeOffset(
  power: number,
  left: number,
  reduceMotion: boolean,
  random: () => number = Math.random,
): { x: number; y: number } {
  if (reduceMotion || left <= 0 || power <= 0) return { x: 0, y: 0 };
  const k = left / 0.16;
  return { x: (random() * 2 - 1) * power * k, y: (random() * 2 - 1) * power * k };
}

/** Frame-rate independent approach of `current` toward `target`. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}
