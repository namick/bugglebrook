import { Container, Graphics } from 'pixi.js';
import { heartPath } from './draw/face';
import { OUTLINE, STAR, lighten } from './palette';

type Kind =
  | 'dust'
  | 'trail'
  | 'crumb'
  | 'sparkle'
  | 'ring'
  | 'line'
  | 'star'
  | 'heart'
  | 'puff'
  | 'flame'
  | 'snow'
  | 'drop'
  | 'bubble'
  | 'shard'
  | 'spark'
  | 'zee';

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

  /** Little hearts floating up (loved food). */
  hearts(x: number, y: number, n = 5): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'heart',
        x: x + this.rnd(-30, 30),
        y: y - this.rnd(0, 10),
        vx: this.rnd(-50, 50),
        vy: -this.rnd(70, 140),
        max: this.rnd(0.9, 1.3),
        size: this.rnd(14, 22),
        color: this.random() < 0.3 ? 0xff8fab : 0xff4f7b,
        drag: 1.2,
        rot: this.rnd(-0.3, 0.3),
      });
    }
  }

  /**
   * Soft cloud puffs, drifting along (dx, dy) px/s. Burps, gags, steam.
   * `outline` draws a faint edge so pale clouds read against the sky.
   */
  puff(x: number, y: number, color: number, n = 5, dx = 0, dy = -60, size = 16): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'puff',
        x: x + this.rnd(-12, 12),
        y: y + this.rnd(-8, 8),
        vx: dx * this.rnd(0.6, 1.2) + this.rnd(-25, 25),
        vy: dy * this.rnd(0.6, 1.2) + this.rnd(-15, 15),
        max: this.rnd(0.7, 1.1),
        size: size * this.rnd(0.7, 1.3),
        color,
        drag: 2,
      });
    }
  }

  /** fx_fire_puff: orange and yellow teardrops blasting out the way `dir` points. */
  flame(x: number, y: number, dir: 1 | -1): void {
    for (let i = 0; i < 16; i++) {
      const speed = this.rnd(260, 520);
      const a = this.rnd(-0.35, 0.3);
      this.add({
        kind: 'flame',
        x,
        y,
        vx: Math.cos(a) * speed * dir,
        vy: Math.sin(a) * speed - 40,
        max: this.rnd(0.35, 0.6),
        size: this.rnd(12, 22),
        color: [0xff5a1f, 0xff9a1f, 0xffd23f][i % 3]!,
        drag: 3,
        rot: dir > 0 ? a : Math.PI - a,
      });
    }
  }

  /** fx_snowflake: a cold breath of little flakes. */
  snow(x: number, y: number, dir: 1 | -1): void {
    for (let i = 0; i < 9; i++) {
      this.add({
        kind: 'snow',
        x,
        y,
        vx: dir * this.rnd(60, 200),
        vy: this.rnd(-70, 20),
        max: this.rnd(0.8, 1.2),
        size: this.rnd(7, 12),
        color: 0xffffff,
        drag: 2,
        vr: this.rnd(-3, 3),
      });
    }
  }

  /** Droplets flung along (vx, vy): spit spray, sweat. */
  drops(x: number, y: number, vx: number, vy: number, color: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'drop',
        x,
        y,
        vx: vx * this.rnd(0.5, 1.1) + this.rnd(-60, 60),
        vy: vy * this.rnd(0.5, 1.1) + this.rnd(-60, 30),
        max: this.rnd(0.4, 0.7),
        size: this.rnd(4, 8),
        color,
        gravity: 1200,
      });
    }
  }

  /** fx_bubbles: clear circles with a highlight, drifting up. */
  bubbles(x: number, y: number, n = 4): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'bubble',
        x: x + this.rnd(-14, 14),
        y,
        vx: this.rnd(-30, 30),
        vy: -this.rnd(60, 130),
        max: this.rnd(0.8, 1.3),
        size: this.rnd(5, 10),
        color: 0xffffff,
        drag: 1,
      });
    }
  }

  /**
   * fx_splash: blue droplets thrown up in a crown, more and higher for a
   * faster entry, plus a few white flecks.
   */
  splash(x: number, y: number, speed: number, size = 0.2): void {
    const n = Math.round(Math.min(20, 8 + speed * 1.1 + size * 10));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.2 + this.rnd(-0.15, 0.15);
      const v = this.rnd(160, 260) + speed * 26;
      this.add({
        kind: 'drop',
        x: x + Math.cos(a) * 12,
        y: y - 4,
        vx: Math.cos(a) * v * 0.7,
        vy: Math.sin(a) * v,
        max: this.rnd(0.45, 0.8),
        size: this.rnd(4, 8) + size * 6,
        color: i % 4 === 0 ? 0xffffff : 0x5cc3e6,
        gravity: 1400,
      });
    }
  }

  /** One drip falling off something wet or slimy. */
  drip(x: number, y: number, color: number): void {
    this.add({
      kind: 'drop',
      x,
      y,
      vx: this.rnd(-10, 10),
      vy: this.rnd(10, 40),
      max: this.rnd(0.35, 0.55),
      size: this.rnd(3, 5),
      color,
      gravity: 1100,
    });
  }

  /** fx_steam: soft white puffs billowing up (hot meets wet). */
  steam(x: number, y: number, n = 9): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'puff',
        x: x + this.rnd(-26, 26),
        y: y + this.rnd(-10, 10),
        vx: this.rnd(-40, 40),
        vy: -this.rnd(90, 190),
        max: this.rnd(0.8, 1.4),
        size: this.rnd(14, 26),
        color: 0xffffff,
        drag: 1.5,
      });
    }
  }

  /** Ice shards and frost bursting out (freezing). */
  shards(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd(0, Math.PI * 2);
      const v = this.rnd(120, 300);
      this.add({
        kind: 'shard',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 120,
        max: this.rnd(0.5, 0.8),
        size: this.rnd(7, 13),
        color: i % 3 === 0 ? 0xffffff : 0xbfe6ff,
        gravity: 900,
        rot: a,
        vr: this.rnd(-8, 8),
      });
    }
  }

  /** Zigzag sparks crackling along a stretch of water (zapped). */
  zap(x0: number, x1: number, y: number): void {
    for (let x = x0; x < x1; x += this.rnd(40, 90)) {
      this.add({
        kind: 'spark',
        x,
        y: y + this.rnd(-10, 30),
        max: this.rnd(0.2, 0.4),
        size: this.rnd(16, 30),
        color: this.random() < 0.5 ? 0xfff27a : 0xffffff,
        rot: this.rnd(0, Math.PI * 2),
      });
    }
  }

  /** A snore: a blue "Z" drifting up and to the side, growing as it goes. */
  zzz(x: number, y: number, dir: 1 | -1): void {
    this.add({
      kind: 'zee',
      x,
      y,
      vx: dir * this.rnd(16, 26),
      vy: -this.rnd(30, 42),
      max: 1.8,
      size: this.rnd(9, 12),
      color: 0x5b6ee1,
      rot: this.rnd(-0.25, 0.25),
    });
  }

  /** A little "boop": a ring and a couple of stars where two heads meet. */
  boop(x: number, y: number): void {
    this.ring(x, y, 26);
    for (let i = 0; i < 3; i++)
      this.add({
        kind: 'star',
        x,
        y,
        vx: this.rnd(-90, 90),
        vy: -this.rnd(80, 160),
        gravity: 260,
        max: this.rnd(0.5, 0.8),
        size: this.rnd(7, 11),
        color: 0xffd23f,
        rot: this.rnd(0, 6),
        vr: this.rnd(-6, 6),
      });
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
        case 'heart': {
          const s = p.size * (t < 0.15 ? t / 0.15 : 1) * (1 + 0.1 * Math.sin(p.life * 16));
          heartPath(g, p.x + Math.sin(p.life * 6 + p.rot * 10) * 6, p.y, s)
            .fill({ color: p.color, alpha: fade })
            .stroke({ width: 2.5, color: OUTLINE, alpha: 0.8 * fade });
          break;
        }
        case 'puff': {
          const r = p.size * (0.6 + t * 1.1);
          g.circle(p.x, p.y, r).fill({ color: p.color, alpha: 0.8 * fade });
          g.circle(p.x, p.y, r).stroke({ width: 2.5, color: OUTLINE, alpha: 0.18 * fade });
          break;
        }
        case 'flame': {
          const r = p.size * (1 - t * 0.5);
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          // A teardrop pointing back where it came from.
          g.moveTo(p.x - c * r * 1.8, p.y - s * r * 1.8)
            .quadraticCurveTo(p.x - s * r, p.y + c * r, p.x + c * r * 0.6, p.y + s * r * 0.6)
            .quadraticCurveTo(p.x + s * r, p.y - c * r, p.x - c * r * 1.8, p.y - s * r * 1.8)
            .fill({ color: p.color, alpha: 0.95 * fade });
          break;
        }
        case 'snow': {
          for (let k = 0; k < 3; k++) {
            const a = p.rot + (k * Math.PI) / 3;
            g.moveTo(p.x - Math.cos(a) * p.size, p.y - Math.sin(a) * p.size)
              .lineTo(p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size)
              .stroke({ width: 2.5, color: p.color, alpha: fade, cap: 'round' });
          }
          g.circle(p.x, p.y, 2).fill({ color: 0x9fd8ff, alpha: fade });
          break;
        }
        case 'drop':
          g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: fade });
          g.circle(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.35).fill({
            color: 0xffffff,
            alpha: 0.7 * fade,
          });
          break;
        case 'shard': {
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          const r = p.size;
          g.poly([
            p.x + c * r,
            p.y + s * r,
            p.x - s * r * 0.35,
            p.y + c * r * 0.35,
            p.x + s * r * 0.35,
            p.y - c * r * 0.35,
          ])
            .fill({ color: p.color, alpha: fade })
            .stroke({ width: 1.5, color: 0x7fb8d8, alpha: fade });
          break;
        }
        case 'spark': {
          let x = p.x;
          let y = p.y;
          g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += Math.cos(p.rot) * p.size * 0.3 + (k % 2 ? 6 : -6);
            y += Math.sin(p.rot) * p.size * 0.3 + (k % 2 ? -6 : 6);
            g.lineTo(x, y);
          }
          g.stroke({ width: 3.5, color: p.color, alpha: fade, cap: 'round', join: 'round' });
          break;
        }
        case 'zee': {
          const z = p.size * (0.6 + t * 0.8);
          const a = t < 0.15 ? t / 0.15 : fade;
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          const pt = (u: number, v: number): [number, number] => [p.x + u * c - v * s, p.y + u * s + v * c];
          const pts = [pt(-z, -z), pt(z, -z), pt(-z, z), pt(z, z)];
          for (const [w, color] of [
            [6, 0xffffff],
            [3.5, p.color],
          ] as const) {
            pts.forEach(([px, py], k) => (k === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
            g.stroke({ width: w, color, alpha: a, cap: 'round', join: 'round' });
          }
          break;
        }
        case 'bubble':
          g.circle(p.x, p.y, p.size).stroke({ width: 2, color: 0x7fb8d8, alpha: fade });
          g.circle(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.3).fill({
            color: 0xffffff,
            alpha: fade,
          });
          break;
      }
    }
    this.particles = keep;
  }

  get count(): number {
    return this.particles.length;
  }
}
