import type { AreaDef, Point2 } from './types';
import { createRegistry } from './registry';

const GROUND = 9;
const STUMP_TOP = 4;

/** A shallow dip in the ground, where rain puddles will form later. */
function dip(center: number, halfWidth: number, depth: number): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = center - halfWidth + t * halfWidth * 2;
    out.push([x, GROUND + depth * Math.sin(Math.PI * t)]);
  }
  return out;
}

/**
 * One root flare, rising `rise` meters from the ground. The slope eases in
 * from flat, holds at most MAX_SLOPE (about 60 degrees, which bugs can still
 * climb), and eases out into the stump's rim. Returns [dx, dy] offsets.
 */
function flare(rise: number): Point2[] {
  const MAX_SLOPE = 1.7;
  const easeIn = 1.6;
  const easeOut = 0.6;
  const hold = (rise - MAX_SLOPE * (easeIn / 2 + easeOut / 2)) / MAX_SLOPE;
  const width = easeIn + hold + easeOut;
  const slopeAt = (x: number): number =>
    x < easeIn
      ? (MAX_SLOPE * x) / easeIn
      : x < easeIn + hold
        ? MAX_SLOPE
        : (MAX_SLOPE * (width - x)) / easeOut;
  const out: Point2[] = [[0, 0]];
  const steps = 16;
  let y = 0;
  for (let i = 1; i <= steps; i++) {
    const x0 = ((i - 1) / steps) * width;
    const x1 = (i / steps) * width;
    y += ((slopeAt(x0) + slopeAt(x1)) / 2) * (x1 - x0);
    out.push([x1, -y]);
  }
  return out;
}

/** The stump: root flares on both sides of a flat top at STUMP_TOP. */
function stump(topLeft: number, topRight: number): Point2[] {
  const f = flare(GROUND - STUMP_TOP);
  const width = f[f.length - 1]![0];
  const up: Point2[] = f.map(([dx, dy]) => [topLeft - width + dx, GROUND + dy]);
  const down: Point2[] = [...f].reverse().map(([dx, dy]) => [topRight + width - dx, GROUND + dy]);
  up[up.length - 1] = [topLeft, STUMP_TOP];
  down[0] = [topRight, STUMP_TOP];
  return [...up, ...down];
}

// Mossy Stump Plaza, the hub (game design doc, section 3). One area for M1;
// its x runs 0 to 38.4 m here. The layout is simplified from the doc so the
// first screen shows all three bugs, a berry, and the spring. When the pond is added to the left, the save
// migration must shift saved x positions by the pond's width.
export const AREAS = createRegistry<AreaDef>('area', [
  {
    id: 'area_stump_plaza',
    name: 'Mossy Stump Plaza',
    xStart: 0,
    xEnd: 38.4,
    terrain: [
      [0, GROUND],
      ...dip(2.2, 0.8, 0.14),
      ...stump(16.1, 22.9),
      ...dip(36.4, 0.8, 0.12),
      [38.4, GROUND],
    ],
    start: [
      { kind: 'item', defId: 'item_pebble', x: 1 },
      { kind: 'item', defId: 'item_mint_leaf', x: 2.6 },
      { kind: 'item', defId: 'item_leaf', x: 3.7 },
      { kind: 'item', defId: 'item_pebble', x: 4.4 },
      { kind: 'item', defId: 'item_bottle_cap', x: 7 },
      { kind: 'item', defId: 'item_berry_red', x: 8.1 },
      { kind: 'item', defId: 'item_twig', x: 9.4 },
      { kind: 'item', defId: 'item_rotten_banana_bit', x: 10.3 },
      { kind: 'item', defId: 'item_spring_coil', x: 11.2 },
      { kind: 'item', defId: 'item_sugar_cube', x: 12.6 },
      { kind: 'item', defId: 'item_pebble', x: 16.9 },
      { kind: 'item', defId: 'item_moss_tuft', x: 17.5 },
      { kind: 'item', defId: 'item_pepper_hot', x: 20.3 },
      { kind: 'item', defId: 'item_berry_red', x: 21.4 },
      { kind: 'item', defId: 'item_jelly_bean', x: 22.2 },
      { kind: 'item', defId: 'item_marble_blue', x: 27.4 },
      { kind: 'item', defId: 'item_ruler_ramp', x: 30.6 },
      { kind: 'item', defId: 'item_pebble', x: 31.3, lift: 0.16 },
      { kind: 'item', defId: 'item_rubber_ball', x: 33.8 },
      { kind: 'item', defId: 'item_marble_red', x: 34.9 },
      { kind: 'item', defId: 'item_berry_red', x: 37.6 },
      { kind: 'bug', defId: 'bug_ladybug_dot', x: 7, lift: 0.17 },
      { kind: 'bug', defId: 'bug_pillbug_rollo', x: 5.4 },
      { kind: 'bug', defId: 'bug_snail_glorp', x: 18.6 },
    ],
    respawn: [
      { item: 'item_berry_red', count: 3 },
      { item: 'item_leaf', count: 1 },
      { item: 'item_sugar_cube', count: 1 },
      { item: 'item_mint_leaf', count: 1 },
      { item: 'item_pepper_hot', count: 1 },
      { item: 'item_rotten_banana_bit', count: 1 },
      { item: 'item_moss_tuft', count: 1 },
      { item: 'item_jelly_bean', count: 1 },
    ],
    skyTop: 0x8fd6f2,
    skyBottom: 0xe4f6ee,
    ground: 0x6fbf4a,
    groundDark: 0x4e9a3a,
    dirt: 0xa8744f,
    dirtDark: 0x7a4e32,
    unlockedByDefault: true,
  },
]);
