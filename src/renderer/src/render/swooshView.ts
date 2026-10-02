import { Container } from 'pixi.js';
import type { ItemDef } from '../../../game/data/types';
import { ItemSprite } from './draw/item';
import type { Particles } from './particles';
import { SWOOSH_SECONDS, swoosh } from './trashLook';
import type { Pt } from './trashLook';

interface Flight {
  sprite: ItemSprite;
  from: Pt;
  to: Pt;
  t: number;
  color: number;
}

/**
 * Things the tidy whistle sends home (playtest F2), shown as they go: a copy
 * of each hops up, spins, and zips off along an arc toward where it lands
 * (out the top of the screen, or into the trash can), leaving a trail of
 * sparkles. The real thing has already moved; this is only the show.
 */
export class SwooshView extends Container {
  private flights: Flight[] = [];

  constructor(private readonly particles: Particles) {
    super();
  }

  /** How many are in the air (test hook). */
  get count(): number {
    return this.flights.length;
  }

  /** Send a copy of `def` from `from` to `to`, in world pixels. */
  add(def: ItemDef, from: Pt, to: Pt): void {
    const sprite = new ItemSprite(def, 7);
    sprite.position.set(from.x, from.y);
    this.addChild(sprite);
    this.flights.push({ sprite, from, to, t: 0, color: def.color });
    this.particles.ring(from.x, from.y, 28);
    this.particles.dust(from.x, from.y + 14, 4);
  }

  update(dt: number): void {
    for (const f of this.flights) {
      f.t += dt / SWOOSH_SECONDS;
      const p = swoosh(f.from, f.to, f.t);
      f.sprite.position.set(p.x, p.y);
      f.sprite.scale.set(p.scale);
      f.sprite.rotation = p.spin;
      f.sprite.alpha = p.alpha;
      if (Math.random() < 0.7) this.particles.trail(p.x, p.y, f.color, 10 * p.scale);
      if (Math.random() < 0.25) this.particles.sparkles(p.x, p.y, 1);
    }
    const done = this.flights.filter((f) => f.t >= 1);
    for (const f of done) f.sprite.destroy({ children: true });
    this.flights = this.flights.filter((f) => f.t < 1);
  }
}
