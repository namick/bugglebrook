import type { Container } from 'pixi.js';
import { Sprite } from 'pixi.js';
import type { LightSpot } from './draw/bug';
import { glowTexture } from './lightTextures';

/**
 * Soft additive glows in one layer, kept from frame to frame: a sprite for
 * each light showing. They share one texture, so they draw as one batch.
 */
export class LightPool {
  private readonly sprites: Sprite[] = [];

  constructor(private readonly layer: Container) {}

  /** Show these lights, at most `max` of them, and hide the rest. Returns how many show. */
  show(spots: readonly LightSpot[], max = spots.length): number {
    const n = Math.min(spots.length, max);
    for (let i = 0; i < n; i++) {
      const spot = spots[i]!;
      let s = this.sprites[i];
      if (!s) {
        s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.blendMode = 'add';
        this.sprites.push(s);
        this.layer.addChild(s);
      }
      s.visible = true;
      s.position.set(spot.x, spot.y);
      s.scale.set((spot.r * 2) / 256);
      s.tint = spot.color;
      s.alpha = spot.alpha;
    }
    for (let i = n; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
    return n;
  }
}
