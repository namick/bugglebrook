import { Container, Graphics } from 'pixi.js';

interface SoapBubble {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  phase: number;
}

/** Most bubbles alive at once. */
export const BUBBLE_BUDGET = 60;

/** Something a bubble can bump into and pop on: a circle in world pixels. */
export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

/**
 * Soap bubbles (rule R7, the bubble wand): clear, shimmering, 20 to 60 px,
 * drifting up and wobbling, popping on anything they touch or after a few
 * seconds. Cosmetic, so it may use Math.random.
 */
export class SoapBubbles extends Container {
  private readonly g = new Graphics();
  private bubbles: SoapBubble[] = [];
  /** Called with a position each time a bubble pops (for the pop sound). */
  onPop: ((x: number, y: number) => void) | null = null;

  constructor(private readonly random: () => number = Math.random) {
    super();
    this.addChild(this.g);
  }

  blow(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: x + (this.random() - 0.5) * 30,
        y: y - this.random() * 10,
        r: 10 + this.random() * 20,
        vx: (this.random() - 0.5) * 70,
        vy: -30 - this.random() * 50,
        age: 0,
        life: 2.5 + this.random() * 3,
        phase: this.random() * 10,
      });
    }
    if (this.bubbles.length > BUBBLE_BUDGET) this.bubbles.splice(0, this.bubbles.length - BUBBLE_BUDGET);
  }

  /** Advance and draw. Returns where bubbles popped, for sparkles and sounds. */
  update(dt: number, obstacles: readonly Obstacle[]): { x: number; y: number }[] {
    const g = this.g.clear();
    const popped: { x: number; y: number }[] = [];
    const keep: SoapBubble[] = [];
    for (const b of this.bubbles) {
      b.age += dt;
      b.vx *= Math.exp(-0.8 * dt);
      b.x += (b.vx + Math.sin(b.age * 2.4 + b.phase) * 22) * dt;
      b.y += b.vy * dt;
      // Grace period so a bubble can leave the thing that blew it.
      const hit = b.age > 0.6 && obstacles.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < o.r + b.r * 0.8);
      if (b.age >= b.life || hit || b.y < -60) {
        popped.push({ x: b.x, y: b.y });
        this.onPop?.(b.x, b.y);
        continue;
      }
      keep.push(b);
      const grow = Math.min(1, b.age / 0.25);
      const r = b.r * grow * (1 + Math.sin(b.age * 7 + b.phase) * 0.04);
      const hue = [0xff9ad5, 0x9af0ff, 0xfff49a][Math.floor(b.phase) % 3]!;
      g.circle(b.x, b.y, r).fill({ color: 0xe8f8ff, alpha: 0.12 });
      g.circle(b.x, b.y, r).stroke({ width: 2.5, color: 0x8fcfe8, alpha: 0.85 });
      const arc = (rad: number, a0: number, a1: number): Graphics =>
        g.moveTo(b.x + Math.cos(a0) * rad, b.y + Math.sin(a0) * rad).arc(b.x, b.y, rad, a0, a1);
      arc(r * 0.86, b.phase, b.phase + 1.4).stroke({ width: 2.5, color: hue, alpha: 0.7 });
      arc(r * 0.7, Math.PI * 1.1, Math.PI * 1.45).stroke({
        width: 3,
        color: 0xffffff,
        alpha: 0.9,
        cap: 'round',
      });
      g.circle(b.x + r * 0.35, b.y + r * 0.35, r * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
    }
    this.bubbles = keep;
    return popped;
  }

  get count(): number {
    return this.bubbles.length;
  }
}
