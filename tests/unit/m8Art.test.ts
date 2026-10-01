import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../src/game/constants';
import { M8_ITEMS } from '../../src/game/data/items8';
import type { ItemDef } from '../../src/game/data/types';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';
import { drawItemArt7 } from '../../src/renderer/src/render/draw/itemArt7';
import { M8_ARTS, drawItemArt8, outlineItemArt8 } from '../../src/renderer/src/render/draw/itemArt8';

function size(def: ItemDef): [number, number] {
  const s = def.shape;
  return s.type === 'circle'
    ? [s.radius * 2 * PIXELS_PER_METER, s.radius * 2 * PIXELS_PER_METER]
    : [s.width * PIXELS_PER_METER, s.height * PIXELS_PER_METER];
}

describe('M8 item art', () => {
  it('draws every M8 art key, and only M8 draws them', () => {
    const arts = new Set(M8_ITEMS.map((d) => d.art));
    expect([...arts].sort()).toEqual([...M8_ARTS].sort());
    for (const art of M8_ARTS) {
      const def = M8_ITEMS.find((d) => d.art === art)!;
      const [w, h] = size(def);
      expect(drawItemArt8(new Graphics(), def, w, h, 1), art).toBe(true);
      expect(drawItemArt7(new Graphics(), def, w, h, 1), art).toBe(false);
    }
  });

  it('draws every M8 item def into its collider without throwing', () => {
    for (const def of M8_ITEMS) {
      const [w, h] = size(def);
      for (const seed of [0, 7, 123]) {
        const g = new Graphics();
        expect(drawItemArt8(g, def, w, h, seed), def.id).toBe(true);
        const b = g.getLocalBounds();
        expect(b.width, def.id).toBeGreaterThan(w * 0.5);
        // Nothing strays far outside the collider (a balloon's string may hang a little).
        expect(Math.abs(b.x + b.width / 2), def.id).toBeLessThan(w * 0.5);
        expect(b.height, def.id).toBeLessThan(h * 1.6 + 12);
        outlineItemArt8(new Graphics(), def, w, h, seed);
      }
      expect(() => new ItemSprite(def, 3), def.id).not.toThrow();
    }
  });

  it('refills a potion bottle with a new brew color', () => {
    const def = M8_ITEMS.find((d) => d.art === 'potion')!;
    const sprite = new ItemSprite(def, 1);
    const g = sprite.art.children.find((c) => c instanceof Graphics && c.visible)! as Graphics;
    const before = g.context.instructions.length;
    expect(() => sprite.setLiquid(0x4fe3a0)).not.toThrow();
    expect(g.context.instructions.length).toBe(before);
  });

  it('spins the pinwheel', () => {
    const def = M8_ITEMS.find((d) => d.art === 'pinwheel')!;
    const sprite = new ItemSprite(def, 1);
    const wheel = sprite.art.children[sprite.art.children.length - 1]!;
    const r0 = wheel.rotation;
    sprite.update(0.5);
    expect(wheel.rotation).not.toBe(r0);
  });
});
