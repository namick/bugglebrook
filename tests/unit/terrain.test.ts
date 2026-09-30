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
    const a: AreaDef = { ...AREAS.get('area_stump_plaza'), xStart: 0, xEnd: 38.4 };
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
    const area = AREAS.get('area_stump_plaza');
    const plaza = Terrain.fromAreas([area]);
    for (let x = area.xStart; x < area.xEnd; x += 0.05)
      expect(-plaza.normal(x).y).toBeGreaterThan(Math.cos((62 * Math.PI) / 180));
    expect(plaza.surfaceY(area.xStart + 19.5)).toBe(4);
  });

  it('keeps the pond banks walkable, so swimmers can climb out (under 55 degrees)', () => {
    const world = Terrain.fromAreas(AREAS.all);
    const pond = AREAS.get('area_puddle_pond');
    for (let x = pond.xStart; x < pond.xEnd; x += 0.05)
      expect(-world.normal(x).y).toBeGreaterThan(Math.cos((55 * Math.PI) / 180));
    // The pond is a dip well below the banks, and the plaza meets it at ground level.
    const w = pond.water!;
    expect(world.surfaceY(pond.xStart + (w.x0 + w.x1) / 2)).toBeGreaterThan(w.level + 1.4);
    expect(world.surfaceY(pond.xEnd)).toBe(9);
  });
});
