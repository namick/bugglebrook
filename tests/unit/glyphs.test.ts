import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { GLYPHS } from '../../src/game/data/glyphs';
import { MAP_AREAS } from '../../src/game';
import { drawAreaIcon, drawGlyph } from '../../src/renderer/src/render/draw/glyphs';
import { drawNumber, numberWidth } from '../../src/renderer/src/render/draw/digits';

function drawn(g: Graphics): boolean {
  const b = g.getLocalBounds();
  return g.context.instructions.length > 0 && b.width > 1 && b.height > 1;
}

describe('journal glyphs', () => {
  it('draws every glyph as a non-empty picture', () => {
    for (const name of GLYPHS) {
      const g = new Graphics();
      drawGlyph(g, name, 0, 0, 80);
      expect(drawn(g), name).toBe(true);
      // About the size asked for: nothing huge, nothing stray.
      const b = g.getLocalBounds();
      expect(Math.max(b.width, b.height), name).toBeLessThan(80 * 1.7);
      expect(Math.max(b.width, b.height), name).toBeGreaterThan(80 * 0.4);
    }
  });

  it('draws an icon for every area on the map, and a flag for one it does not know', () => {
    for (const id of [...MAP_AREAS, 'area_nowhere']) {
      const g = new Graphics();
      drawAreaIcon(g, id, 0, 0, 80);
      expect(drawn(g), id).toBe(true);
    }
  });

  it('draws numbers, fractions, and percentages', () => {
    for (const text of ['0', '7/12', '100%', '99+', '1234567890']) {
      const g = new Graphics();
      drawNumber(g, text, 0, 0, 40, 0xffffff);
      expect(drawn(g), text).toBe(true);
      expect(Math.abs(g.getLocalBounds().width - numberWidth(text, 40))).toBeLessThan(40);
    }
    expect(numberWidth('12', 40)).toBeGreaterThan(numberWidth('1', 40));
  });
});
