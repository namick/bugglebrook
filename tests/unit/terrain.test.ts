import { describe, expect, it } from 'vitest';
import { AREAS } from '../../src/game/data/areas';
import type { AreaDef } from '../../src/game/data/types';
import { Terrain } from '../../src/game/world/terrain';

describe('Terrain', () => {
  const t = new Terrain([
    [0, 9],
    [2, 9],
    [4, 7],
    [6, 7],
  ]);

  it('interpolates the surface height and clamps past the ends', () => {
    expect(t.surfaceY(1)).toBe(9);
    expect(t.surfaceY(3)).toBe(8);
    expect(t.surfaceY(5)).toBe(7);
    expect(t.surfaceY(-10)).toBe(9);
    expect(t.surfaceY(100)).toBe(7);
  });

  it('gives upward unit normals', () => {
    expect(t.normal(1).y).toBeCloseTo(-1);
    const slope = t.normal(3);
    expect(slope.x).toBeCloseTo(-Math.SQRT1_2);
    expect(slope.y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(slope.x, slope.y)).toBeCloseTo(1);
  });

  it('joins areas left to right in world coordinates', () => {
    const a = AREAS.get('area_stump_plaza');
    const b: AreaDef = {
      ...a,
      id: 'area_b',
      xStart: a.xEnd,
      xEnd: a.xEnd + 10,
      terrain: [
        [0, 9],
        [10, 8],
      ],
    };
    const joined = Terrain.fromAreas([b, a]);
    expect(joined.minX).toBe(0);
    expect(joined.maxX).toBeCloseTo(a.xEnd + 10);
    expect(joined.surfaceY(a.xEnd + 5)).toBeCloseTo(8.5);
  });

  it('keeps the plaza roots climbable (no slope steeper than 62 degrees)', () => {
    const plaza = Terrain.fromAreas([AREAS.get('area_stump_plaza')]);
    for (let x = 0; x < 38.4; x += 0.05)
      expect(-plaza.normal(x).y).toBeGreaterThan(Math.cos((62 * Math.PI) / 180));
    expect(plaza.surfaceY(19.5)).toBe(4);
  });
});
