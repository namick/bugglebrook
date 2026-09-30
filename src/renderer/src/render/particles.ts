import { Container, Graphics } from 'pixi.js';
import { OUTLINE, STAR, lighten } from './palette';

type Kind = 'dust' | 'trail' | 'crumb' | 'sparkle' | 'ring' | 'line' | 'star';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
}

/** At most this many live particles; the oldest go first (game design doc, section 15). */
export const PARTICLE_BUDGET = 400;

/**
 * Cosmetic particles, all drawn into one Graphics that is rebuilt each frame.
 * Positions are world pixels. Render-only, so it may use Math.random.
 */
export class Particles extends Container {
  private readonly g = new Graphics();
  private particles: Particle[] = [];

  constructor(private readonly random: () => number = Math.random) {
    super();
    this.addChild(this.g);
  }

  private add(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'max' | 'size' | 'color'>): void {
    this.particles.push({ vx: 0, vy: 0, life: 0, rot: 0, vr: 0, gravity: 0, drag: 0, ...p });
    if (this.particles.length > PARTICLE_BUDGET)
      this.particles.splice(0, this.particles.length - PARTICLE_BUDGET);
  }

  private rnd(lo: number, hi: number): number {
    return lo + (hi - lo) * this.random();
  }

  /** fx_dust_puff: 4 to 8 grey-brown circles that expand and fade over 300 ms. */
  dust(x: number, y: number, strength: number): void {
    const n = Math.round(4 + Math.min(4, strength / 3));
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      this.add({
        kind: 'dust',
        x: x + this.rnd(-10, 10),
        y: y - this.rnd(0, 8),
        vx: dir * this.rnd(40, 90 + strength * 12),
        vy: -this.rnd(10, 60),
        max: this.rnd(0.3, 0.45),
        size: this.rnd(8, 13) + strength,
        color: this.random() < 0.5 ? 0xe9dcc6 : 0xd4c1a4,
        drag: 4,
      });
    }
  }

  /** A fading puff left behind by something flying fast. */
  trail(x: number, y: number, color: number, size: number): void {
    this.add({ kind: 'trail', x, y, max: 0.35, size, color: lighten(color, 0.55) });
  }

  /** fx_crumbs: tiny food-colored bits. */
  crumbs(x: number, y: number, color: number): void {
    for (let i = 0; i < 9; i++) {
      this.add({
        kind: 'crumb',
        x,
        y,
        vx: this.rnd(-140, 140),
        vy: -this.rnd(80, 260),
        max: this.rnd(0.5, 0.8),
        size: this.rnd(3, 6),
        color,
        gravity: 900,
      });
    }
  }

  /** fx_sparkle: twinkling four-point stars. */
  sparkles(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd(0, 0.5);
      this.add({
        kind: 'sparkle',
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        vx: Math.cos(a) * this.rnd(60, 140),
        vy: Math.sin(a) * this.rnd(60, 140) - 40,
        max: this.rnd(0.5, 0.8),
        size: this.rnd(8, 14),
        color: this.random() < 0.3 ? STAR : 0xffffff,
        drag: 3,
        vr: this.rnd(-4, 4),
      });
    }
  }

  /** An expanding ring, for pokes. */
  ring(x: number, y: number, size = 30): void {
    this.add({ kind: 'ring', x, y, max: 0.28, size, color: 0xffffff });
  }

  /** Short action lines bursting outward, for springs and bonks. */
  burst(x: number, y: number, n = 6, color = 0xffffff, spread = Math.PI * 2, start = 0): void {
    for (let i = 0; i < n; i++) {
      const a = start + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      this.add({
        kind: 'line',
        x: x + Math.cos(a) * 18,
        y: y + Math.sin(a) * 18,
        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,
        max: 0.22,
        size: 16,
        color,
        rot: a,
        drag: 6,
      });
    }
  }

  /** Stars popping out on a hard landing. */
  stars(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      this.add({
        kind: 'star',
        x,
        y,
        vx: Math.cos(a) * this.rnd(120, 220),
        vy: Math.sin(a) * this.rnd(160, 260),
        max: 0.7,
        size: this.rnd(10, 15),
        color: STAR,
        gravity: 500,
        vr: this.rnd(-6, 6),
      });
    }
  }

  update(dt: number): void {
    const g = this.g.clear();
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      keep.push(p);
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const t = p.life / p.max;
      const fade = 1 - t;
      switch (p.kind) {
        case 'dust': {
          const r = p.size * (0.6 + t * 0.9);
          g.circle(p.x, p.y, r).fill({ color: p.color, alpha: 0.9 * fade });
          g.circle(p.x, p.y, r).stroke({ width: 2.5, color: OUTLINE, alpha: 0.25 * fade });
          break;
        }
        case 'trail':
          g.circle(p.x, p.y, p.size * (1 - t * 0.7)).fill({ color: p.color, alpha: 0.55 * fade });
          break;
        case 'crumb':
          g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size).fill({ color: p.color, alpha: fade });
          break;
        case 'sparkle': {
          const s = p.size * (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7);
          g.star(p.x, p.y, 4, s, s * 0.35, p.rot).fill({ color: p.color, alpha: 0.95 });
          break;
        }
        case 'ring':
          g.circle(p.x, p.y, p.size * (0.4 + t * 1.2)).stroke({
            width: 5 * fade,
            color: p.color,
            alpha: fade,
          });
          break;
        case 'line': {
          const dx = Math.cos(p.rot) * p.size;
          const dy = Math.sin(p.rot) * p.size;
          g.moveTo(p.x - dx / 2, p.y - dy / 2)
            .lineTo(p.x + dx / 2, p.y + dy / 2)
            .stroke({ width: 5, color: p.color, alpha: fade, cap: 'round' });
          break;
        }
        case 'star':
          g.star(p.x, p.y, 5, p.size, p.size * 0.48, p.rot)
            .fill({ color: p.color, alpha: fade })
            .stroke({ width: 3, color: OUTLINE, alpha: fade });
          break;
      }
    }
    this.particles = keep;
  }

  get count(): number {
    return this.particles.length;
  }
}
