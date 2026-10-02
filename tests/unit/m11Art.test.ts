import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../src/game/constants';
import { M11_ITEMS } from '../../src/game/data/items11';
import { growItem } from '../../src/game/data/itemSize';
import type { ItemDef } from '../../src/game/data/types';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';
import { drawItemArt7 } from '../../src/renderer/src/render/draw/itemArt7';
import { drawItemArt8 } from '../../src/renderer/src/render/draw/itemArt8';
import { drawItemArt9 } from '../../src/renderer/src/render/draw/itemArt9';
import { M11_ARTS, drawItemArt11, outlineItemArt11 } from '../../src/renderer/src/render/draw/itemArt11';

function size(def: ItemDef): [number, number] {
  const s = def.shape;
  return s.type === 'circle'
    ? [s.radius * 2 * PIXELS_PER_METER, s.radius * 2 * PIXELS_PER_METER]
    : [s.width * PIXELS_PER_METER, s.height * PIXELS_PER_METER];
}

const M11 = M11_ITEMS;

describe('M11 item art', () => {
  it('draws every M11 art key, and only M11 draws them', () => {
    const arts = new Set(M11.map((d) => d.art));
    expect([...arts].sort()).toEqual([...M11_ARTS].sort());
    for (const art of M11_ARTS) {
      const def = M11.find((d) => d.art === art)!;
      const [w, h] = size(def);
      expect(drawItemArt11(new Graphics(), def, w, h, 1), art).toBe(true);
      expect(drawItemArt7(new Graphics(), def, w, h, 1), art).toBe(false);
      expect(drawItemArt8(new Graphics(), def, w, h, 1), art).toBe(false);
      expect(drawItemArt9(new Graphics(), def, w, h), art).toBe(false);
    }
  });

  it('draws every M11 item into its collider, raw and grown, with a silhouette', () => {
    for (const raw of M11)
      for (const def of [raw, growItem(raw)]) {
        const [w, h] = size(def);
        for (const seed of [0, 7, 123]) {
          const g = new Graphics();
          expect(drawItemArt11(g, def, w, h, seed), def.id).toBe(true);
          const b = g.getLocalBounds();
          expect(b.width, def.id).toBeGreaterThan(w * 0.5);
          expect(Math.abs(b.x + b.width / 2), def.id).toBeLessThan(w * 0.25);
          expect(b.height, def.id).toBeLessThan(h * 1.3 + 8);
          const o = new Graphics();
          expect(outlineItemArt11(o, def, w, h, seed), def.id).toBe(true);
          o.stroke({ width: 2, color: 0xffffff });
          expect(o.getLocalBounds().width, def.id).toBeGreaterThan(w * 0.3);
        }
        expect(() => new ItemSprite(def, 3), def.id).not.toThrow();
      }
  });
});
