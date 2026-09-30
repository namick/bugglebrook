import { Container, Graphics } from 'pixi.js';
import type { EventBus } from '../../../game/core/events';
import type { GameEvents } from '../../../game/events';
import { PIXELS_PER_METER } from '../../../game/constants';

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/** Cosmetic puffs driven by game events. Render-only; uses Math.random. */
export class Particles extends Container {
  private particles: Particle[] = [];
  private offs: Array<() => void> = [];

  detach(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
  }

  attach(bus: EventBus<GameEvents>): void {
    this.detach();
    this.offs = [
      bus.on('bonked', (e) =>
        this.puff(e.x * PIXELS_PER_METER, e.y * PIXELS_PER_METER, Math.min(10, e.speed)),
      ),
    ];
  }

  private puff(x: number, y: number, strength: number): void {
    const count = Math.round(3 + strength * 0.6);
    for (let i = 0; i < count; i++) {
      const g = new Graphics().circle(0, 0, 6 + Math.random() * 8).fill({ color: 0xffffff, alpha: 0.85 });
      g.position.set(x, y + 20);
      this.addChild(g);
      const a = Math.PI + Math.random() * Math.PI;
      const speed = 60 + Math.random() * 40 * strength;
      this.particles.push({
        g,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.6,
        life: 0,
        maxLife: 0.45,
      });
    }
  }

  update(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.g.destroy();
        return false;
      }
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.vy += 200 * dt;
      const k = 1 - p.life / p.maxLife;
      p.g.alpha = k;
      p.g.scale.set(0.6 + (1 - k) * 0.8);
      return true;
    });
  }

  get count(): number {
    return this.particles.length;
  }
}
