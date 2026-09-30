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

/** Pond rim and bottom heights, and the width of each eased bank. */
const RIM = 8.5;
const POND_BOTTOM = 10.4;
const BANK = 2.6;

/**
 * The pond basin between two rims: cosine-eased banks (never steeper than
 * about 50 degrees, so bugs can walk out) and a bottom with gentle lumps.
 */
function basin(left: number, right: number): Point2[] {
  const out: Point2[] = [];
  const depth = POND_BOTTOM - RIM;
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push([left + u * BANK, RIM + (depth * (1 - Math.cos(Math.PI * u))) / 2]);
  }
  const floorEnd = right - BANK;
  for (let x = left + BANK + 1.2; x < floorEnd - 0.6; x += 1.2)
    out.push([x, POND_BOTTOM + 0.07 * Math.sin(x * 1.3) - 0.05 * Math.cos(x * 0.7)]);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push([floorEnd + u * BANK, RIM + (depth * (1 + Math.cos(Math.PI * u))) / 2]);
  }
  return out;
}

/** Where the pond sits in its area (area-local x), and its resting surface. */
const POND = { left: 4.8, right: 23.2, level: 8.72 };

// Puddle Pond and Mossy Stump Plaza (game design doc, section 3). They tile
// the world left to right: the pond runs 0 to 32 m and the plaza 32 to
// 70.4 m. Saves from before the pond existed are shifted right by the
// pond's width (save version 4). The plaza layout is simplified from the
// doc so the first screen shows its three bugs, a berry, and the spring.
export const AREAS = createRegistry<AreaDef>('area', [
  {
    id: 'area_puddle_pond',
    name: 'Puddle Pond',
    xStart: 0,
    xEnd: 32,
    terrain: [
      [0, GROUND],
      [1.5, GROUND],
      [2.5, 8.86],
      [3.4, 8.64],
      [4.2, 8.53],
      ...basin(POND.left, POND.right),
      [24, 8.46],
      [26.5, 8.46],
      [27.5, 8.5],
      [28.6, 8.52],
      [29.6, 8.62],
      [30.6, 8.84],
      [31.4, 8.97],
      [32, GROUND],
    ],
    start: [
      { kind: 'item', defId: 'item_magnet', x: 1 },
      { kind: 'item', defId: 'item_sponge', x: 2.3 },
      { kind: 'item', defId: 'item_feather', x: 3.4 },
      { kind: 'item', defId: 'item_cork', x: 6.4, onWater: true },
      { kind: 'item', defId: 'item_leaf_raft', x: 10.6, onWater: true },
      { kind: 'bug', defId: 'bug_waterstrider_skeet', x: 15, onWater: true },
      { kind: 'item', defId: 'item_cork', x: 19, onWater: true },
      { kind: 'item', defId: 'item_paper_boat', x: 20.3, onWater: true },
      { kind: 'item', defId: 'item_gum_blob', x: 24.3 },
      { kind: 'item', defId: 'item_blueberry', x: 26.9 },
      { kind: 'item', defId: 'item_blueberry', x: 27.4 },
      { kind: 'item', defId: 'item_soap_sliver', x: 28.2 },
      { kind: 'item', defId: 'item_bubble_wand', x: 29.1 },
    ],
    respawn: [{ item: 'item_blueberry', count: 2 }],
    skyTop: 0x8fd6f2,
    skyBottom: 0xe4f6ee,
    ground: 0x7cc452,
    groundDark: 0x4e9a3a,
    dirt: 0x8a6a4a,
    dirtDark: 0x5e4630,
    unlockedByDefault: true,
    water: { x0: POND.left, x1: POND.right, level: POND.level, maxRise: 0.18, current: 0.08 },
    fixtures: [
      { id: 'fix_hose_tap', kind: 'hose_tap', x: 25.1, y: 7.95, radius: 0.5 },
      { id: 'fix_lily_pad_west', kind: 'lily_pad', x: 8.6, y: POND.level, radius: 0.65 },
      { id: 'fix_lily_pad_middle', kind: 'lily_pad', x: 12.8, y: POND.level, radius: 0.65 },
      { id: 'fix_lily_pad_east', kind: 'lily_pad', x: 17, y: POND.level, radius: 0.65 },
      { id: 'fix_rubber_boot', kind: 'rubber_boot', x: 19.4, y: 9.95, radius: 0.55 },
    ],
  },
  {
    id: 'area_stump_plaza',
    name: 'Mossy Stump Plaza',
    xStart: 32,
    xEnd: 70.4,
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
