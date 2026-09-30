import { Container, Graphics } from 'pixi.js';
import type { ItemDef } from '../../../../game/data/types';
import { PIXELS_PER_METER } from '../../../../game/constants';
import { stroke } from '../palette';

/** A physics prop drawn from its item definition. Rotates with its body. */
export class ItemSprite extends Container {
  constructor(readonly def: ItemDef) {
    super();
    const g = new Graphics();
    const ppm = PIXELS_PER_METER;
    const s = def.shape;
    if (s.type === 'circle') {
      const r = s.radius * ppm;
      g.circle(0, 0, r).fill(def.color).stroke(stroke());
      g.ellipse(-r * 0.3, -r * 0.35, r * 0.35, r * 0.2).fill({ color: def.accent, alpha: 0.9 });
      g.circle(r * 0.35, r * 0.3, r * 0.1).fill({ color: 0x000000, alpha: 0.15 });
    } else {
      const w = s.width * ppm;
      const h = s.height * ppm;
      const corner = Math.min(w, h) * 0.2;
      g.roundRect(-w / 2, -h / 2, w, h, corner)
        .fill(def.color)
        .stroke(stroke());
      const band = h * 0.28;
      g.roundRect(-w / 2 + 8, -band / 2, w - 16, band, band / 2).fill(def.accent);
      g.roundRect(-w / 2 + 10, -h / 2 + 7, w * 0.35, h * 0.14, h * 0.07).fill({
        color: 0xffffff,
        alpha: 0.4,
      });
    }
    this.addChild(g);
  }
}
