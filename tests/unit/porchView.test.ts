import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/game/data';
import { boardGaps, lampPool } from '../../src/renderer/src/render/areaArt/porchLook';

// R03 and R19: the porch's light, as pure helpers.

describe('the porch light', () => {
  it('lays the boards with a gap at every floor gap things drop through', () => {
    const porch = CONTENT.areas.get('area_under_porch');
    const x0 = (porch.xStart + porch.roof!.x0) * 100;
    const x1 = (porch.xStart + porch.roof!.x1) * 100;
    const fixed = porch
      .fixtures!.filter((f) => f.kind === 'floor_gap')
      .map((f) => (porch.xStart + f.x) * 100);
    const gaps = boardGaps(x0, x1, fixed);
    for (const x of fixed) expect(gaps).toContain(x);
    let last = x0;
    for (const x of gaps) {
      // Boards are a sensible width, left to right, inside the porch.
      expect(x - last).toBeGreaterThan(80);
      expect(x - last).toBeLessThan(320);
      last = x;
    }
    expect(last).toBeLessThan(x1);
  });

  it("makes the lamp the room's main light at night, reaching past the bench", () => {
    const day = lampPool(0);
    const night = lampPool(1);
    expect(night.radius).toBeGreaterThan(day.radius * 2);
    expect(night.alpha).toBeGreaterThan(day.alpha * 2);
    // The lamp hangs 3.4 m right of the bench's middle; at night its pool reaches over it.
    expect(night.radius * 1.25).toBeGreaterThan(340 + 220);
  });
});
