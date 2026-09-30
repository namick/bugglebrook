import type { AreaDef, Point2 } from './types';
import { createRegistry } from './registry';

const GROUND = 9;
const STUMP_TOP = 4;

/** A shallow dip in the ground, where rain puddles form (`fix_puddle_*`). */
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

/** A smooth bump (or a dip, with a negative height) centered on x, eased with a cosine. */
function mound(center: number, half: number, height: number, steps = 10): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([center - half + t * half * 2, GROUND - (height * (1 - Math.cos(Math.PI * 2 * t))) / 2]);
  }
  return out;
}

/**
 * A cosine ramp from (x0, y0) to (x1, y1), steepest in the middle at
 * PI / 2 times the average slope. Keep that under about 1.7 (60 degrees)
 * where bugs should be able to walk it.
 */
function ramp(x0: number, y0: number, x1: number, y1: number, steps = 8): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([x0 + (x1 - x0) * t, y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * t))) / 2]);
  }
  return out;
}

/** Where the pond sits in its area (area-local x), and its resting surface. */
const POND = { left: 4.8, right: 23.2, level: 8.72 };

// Bugglebrook's garden (game design doc, section 3): six areas tiled left to
// right. The flowerbed runs 0 to 32 m, the pond 32 to 64 m, the plaza 64 to
// 102.4 m, the porch 102.4 to 134.4 m, the compost lab 134.4 to 163.2 m, and
// the treehouse 163.2 to 195.2 m. Saves from before M7 move right by the
// flowerbed's width (save version 8). Area data keeps area-local x. The four
// new areas start locked behind a barrier fixture that `opens` them.
export const AREAS = createRegistry<AreaDef>('area', [
  {
    id: 'area_flowerbed_stage',
    name: 'Flowerbed Stage',
    xStart: 0,
    xEnd: 32,
    terrain: [
      [0, GROUND],
      // The garden gnome lies on his back: his round belly is a hill to climb.
      ...mound(3.9, 2.9, 1.25, 14),
      [8, GROUND],
      // The upturned flowerpot stage: terracotta sides, a flat stage on top.
      ...ramp(14, GROUND, 15.5, 7.4),
      ...ramp(21.9, 7.4, 23.4, GROUND),
      // Five berry-juice paint puddles in a row.
      ...dip(25.4, 0.34, 0.13),
      ...dip(26.4, 0.34, 0.13),
      ...dip(27.4, 0.34, 0.13),
      ...dip(28.4, 0.34, 0.13),
      ...dip(29.4, 0.34, 0.13),
      [32, GROUND],
    ],
    start: [
      { kind: 'item', defId: 'item_lavender_sprig', x: 7.4 },
      { kind: 'item', defId: 'item_seed_sunflower', x: 8.4 },
      { kind: 'item', defId: 'item_seed_sunflower', x: 8.9 },
      { kind: 'item', defId: 'item_leaf', x: 10.4 },
      { kind: 'item', defId: 'item_seed_sunflower', x: 11.2 },
      { kind: 'item', defId: 'item_pollen_puff', x: 12.3 },
      { kind: 'item', defId: 'item_bluebell_bloom', x: 12.9 },
      { kind: 'item', defId: 'item_pollen_puff', x: 17.2, lift: 0 },
      { kind: 'item', defId: 'item_seed_sunflower', x: 20.4 },
      { kind: 'item', defId: 'item_honey_drop', x: 30.3 },
      { kind: 'item', defId: 'item_bluebell_bloom', x: 30.9 },
      { kind: 'item', defId: 'item_leaf', x: 31.4 },
    ],
    respawn: [
      { item: 'item_pollen_puff', count: 1 },
      { item: 'item_seed_sunflower', count: 2 },
    ],
    skyTop: 0x9fd8f5,
    skyBottom: 0xfbe6f0,
    ground: 0x7a5238,
    groundDark: 0x4a2f22,
    dirt: 0x5a3b2b,
    dirtDark: 0x3b251b,
    unlockedByDefault: false,
    mood: 'garden',
    fixtures: [
      // The gnome, lying on his back with a hole where his nose should be. Knock, knock.
      { id: 'fix_gnome', kind: 'gnome', x: 3.9, y: 7.6, radius: 1.5 },
      // A curled-up leaf full of fresh bite holes that rustles now and then.
      { id: 'fix_munch_leaf', kind: 'munch_leaf', x: 9.7, y: 8.7, radius: 0.45 },
      // A closed tulip that hums to itself (someone is inside).
      { id: 'fix_tulip', kind: 'tulip', x: 11.8, y: 7.3, radius: 0.4 },
      { id: 'fix_bluebell_west', kind: 'bluebell', x: 13.2, y: 6.9, radius: 0.55 },
      { id: 'fix_flowerpot_stage', kind: 'stage', x: 18.7, y: 7.4, radius: 3.2, w: 6.4 },
      { id: 'fix_stage_lights', kind: 'stage_lights', x: 18.7, y: 2.5, radius: 0.7 },
      { id: 'fix_bluebell_east', kind: 'bluebell', x: 24.2, y: 6.9, radius: 0.55 },
      { id: 'fix_paint_red', kind: 'paint_puddle', x: 25.4, y: 9.1, radius: 0.34, paint: 'paint_red' },
      { id: 'fix_paint_blue', kind: 'paint_puddle', x: 26.4, y: 9.1, radius: 0.34, paint: 'paint_blue' },
      { id: 'fix_paint_yellow', kind: 'paint_puddle', x: 27.4, y: 9.1, radius: 0.34, paint: 'paint_yellow' },
      { id: 'fix_paint_white', kind: 'paint_puddle', x: 28.4, y: 9.1, radius: 0.34, paint: 'paint_white' },
      { id: 'fix_paint_black', kind: 'paint_puddle', x: 29.4, y: 9.1, radius: 0.34, paint: 'paint_black' },
    ],
  },
  {
    id: 'area_puddle_pond',
    name: 'Puddle Pond',
    xStart: 32,
    xEnd: 64,
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
      // The sponge sits a short carry from the sunflower's thirsty soil.
      { kind: 'item', defId: 'item_sponge', x: 3.7 },
      { kind: 'item', defId: 'item_feather', x: 4.35 },
      { kind: 'item', defId: 'item_cork', x: 6.4, onWater: true },
      { kind: 'item', defId: 'item_leaf_raft', x: 10.6, onWater: true },
      { kind: 'bug', defId: 'bug_waterstrider_skeet', x: 15, onWater: true },
      { kind: 'item', defId: 'item_cork', x: 19, onWater: true },
      { kind: 'item', defId: 'item_paper_boat', x: 20.3, onWater: true },
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
    mood: 'pond',
    water: { x0: POND.left, x1: POND.right, level: POND.level, maxRise: 0.18, current: 0.08 },
    fixtures: [
      // The droopy sunflower on the bank, its head bent across the path to the
      // flowerbed. Anything wet on its cracked soil makes it stand up.
      {
        id: 'fix_sunflower_gate',
        kind: 'sunflower',
        x: 1.1,
        y: 8.95,
        radius: 0.85,
        opens: 'area_flowerbed_stage',
        wall: 0.02,
      },
      { id: 'fix_hose_tap', kind: 'hose_tap', x: 25.1, y: 7.95, radius: 0.5 },
      { id: 'fix_lily_pad_west', kind: 'lily_pad', x: 8.6, y: POND.level, radius: 0.65 },
      { id: 'fix_lily_pad_middle', kind: 'lily_pad', x: 12.8, y: POND.level, radius: 0.65 },
      { id: 'fix_lily_pad_east', kind: 'lily_pad', x: 17, y: POND.level, radius: 0.65 },
      { id: 'fix_rubber_boot', kind: 'rubber_boot', x: 19.4, y: 9.95, radius: 0.55 },
      // A half-sunk teacup on the bottom: things that sink above it land inside.
      { id: 'fix_sunken_teacup', kind: 'teacup', x: 12, y: 10.4, radius: 0.62 },
      // The reeds and cattails on the right bank, where fireflies blink at night.
      { id: 'fix_reeds', kind: 'reeds', x: 24.8, y: 7.4, radius: 2 },
    ],
  },
  {
    id: 'area_stump_plaza',
    name: 'Mossy Stump Plaza',
    xStart: 64,
    xEnd: 102.4,
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
      { kind: 'item', defId: 'item_marble_red', x: 34.4 },
      { kind: 'item', defId: 'item_berry_red', x: 37.6 },
      { kind: 'bug', defId: 'bug_ladybug_dot', x: 7, lift: 0.17 },
      { kind: 'bug', defId: 'bug_pillbug_rollo', x: 5.4 },
      { kind: 'bug', defId: 'bug_snail_glorp', x: 18.6 },
      { kind: 'bug', defId: 'bug_grasshopper_boing', x: 25.6 },
      // New in M6, listed last so the older things keep their IDs. It lies on
      // the path from the pond, a short carry from the reeds.
      { kind: 'item', defId: 'item_flashlight_pen', x: 0.45 },
      // New in M7: Twig, pretending to be the toy pile's second twig.
      { kind: 'bug', defId: 'bug_stickinsect_twig', x: 35.35, pending: 'disguised' },
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
    mood: 'plaza',
    fixtures: [
      // A bent-spoon rooster on a twig pole: click to spin it, three quick clicks for a gust.
      { id: 'fix_weather_vane', kind: 'weather_vane', x: 0.9, y: 5.55, radius: 0.55 },
      // The stone sundial beside the ant hill: drag its rim clockwise to turn time forward.
      { id: 'fix_sundial', kind: 'sundial', x: 9.2, y: 7.9, radius: 0.95 },
      // The dark hole in the stump: click to peek.
      { id: 'fix_stump_knothole', kind: 'knothole', x: 19.9, y: 6.9, radius: 0.6 },
      // The two dips in the ground fill with rain.
      { id: 'fix_puddle_west', kind: 'puddle', x: 2.2, y: 9.1, radius: 0.8 },
      { id: 'fix_puddle_east', kind: 'puddle', x: 36.4, y: 9.1, radius: 0.8 },
    ],
  },
  {
    id: 'area_under_porch',
    name: 'Under the Porch',
    xStart: 102.4,
    xEnd: 134.4,
    terrain: [
      [0, GROUND],
      [6, GROUND],
      [8, 8.95],
      [10, GROUND],
      [12, 8.96],
      [14, GROUND],
      [32, GROUND],
    ],
    start: [
      // The loose lattice panel leaning across the way in. Heavy, but it moves.
      { kind: 'item', defId: 'item_lattice_panel', x: 2.55 },
      { kind: 'item', defId: 'item_popsicle_stick', x: 5.9 },
      { kind: 'item', defId: 'item_button', x: 6.5 },
      { kind: 'item', defId: 'item_paperclip', x: 6.9 },
      { kind: 'item', defId: 'item_rubber_band', x: 7.4 },
      { kind: 'item', defId: 'item_tin_can', x: 7.9 },
      { kind: 'item', defId: 'item_toothpick', x: 8.6 },
      { kind: 'item', defId: 'item_foil_ball', x: 9.0 },
      { kind: 'item', defId: 'item_button', x: 9.4 },
      { kind: 'item', defId: 'item_straw', x: 9.8 },
      { kind: 'item', defId: 'item_matchbox', x: 10.4 },
      { kind: 'item', defId: 'item_paper_scrap', x: 10.9 },
      { kind: 'item', defId: 'item_paperclip', x: 11.3 },
      { kind: 'item', defId: 'item_eggshell', x: 11.7 },
      { kind: 'item', defId: 'item_bottle_cap', x: 12.2 },
      { kind: 'item', defId: 'item_rubber_band', x: 12.8 },
      { kind: 'item', defId: 'item_thread_spool', x: 13.3 },
      { kind: 'item', defId: 'item_popsicle_stick', x: 13.9 },
      { kind: 'item', defId: 'item_toothpick', x: 14.4 },
      { kind: 'item', defId: 'item_magnet', x: 14.9 },
      { kind: 'item', defId: 'item_gum_blob', x: 15.6 },
      { kind: 'item', defId: 'item_tissue', x: 16.2 },
      { kind: 'item', defId: 'item_crumb_cookie', x: 16.8 },
      { kind: 'item', defId: 'item_cheese_puff', x: 17.3 },
      { kind: 'item', defId: 'item_button', x: 17.9 },
      { kind: 'item', defId: 'item_battery_toy', x: 18.4 },
      { kind: 'item', defId: 'item_paper_scrap', x: 19.0 },
      { kind: 'item', defId: 'item_crumb_cookie', x: 19.6 },
      { kind: 'item', defId: 'item_straw', x: 20.3 },
      { kind: 'item', defId: 'item_rubber_band', x: 20.9 },
      { kind: 'item', defId: 'item_paperclip', x: 21.5 },
      { kind: 'item', defId: 'item_tin_can', x: 22.2 },
      { kind: 'item', defId: 'item_bottle_cap', x: 23.0 },
      { kind: 'item', defId: 'item_popsicle_stick', x: 23.8 },
      { kind: 'item', defId: 'item_toothpick', x: 24.6 },
      { kind: 'item', defId: 'item_button', x: 25.3 },
    ],
    respawn: [{ item: 'item_crumb_cookie', count: 1 }],
    skyTop: 0x8fd6f2,
    skyBottom: 0xe4f6ee,
    ground: 0x7a6a62,
    groundDark: 0x4a3d3a,
    dirt: 0x3d3140,
    dirtDark: 0x2a2438,
    unlockedByDefault: false,
    mood: 'porch',
    roof: { x0: 0.2, x1: 32, y: 2.5 },
    solids: [
      // The porch floorboards overhead: a roof that keeps the rain off.
      { id: 'solid_porch_boards', box: [0.2, 1.9, 32, 2.5] },
      // The cobweb hammock: it sags where things land in it.
      {
        id: 'solid_cobweb',
        chain: [
          [22.4, 6.72],
          [23.05, 6.95],
          [23.7, 7.04],
          [24.35, 6.95],
          [25, 6.72],
        ],
        friction: 0.95,
      },
      // The old tin can wall toward the compost lab. It swings open when the latch is bumped.
      { id: 'solid_can_wall', box: [30.5, 2.5, 31.3, 9.05], until: 'area_compost_lab' },
    ],
    fixtures: [
      {
        id: 'fix_lattice',
        kind: 'lattice',
        x: 2.55,
        y: 6,
        radius: 0.3,
        opens: 'area_under_porch',
        wall: 5.3,
      },
      // The flowerpot someone hides behind once the lattice moves.
      { id: 'fix_whiff_pot', kind: 'whiff_pot', x: 7.3, y: 8.45, radius: 0.6 },
      { id: 'fix_floor_gap_1', kind: 'floor_gap', x: 8.4, y: 2.5, radius: 0.25 },
      { id: 'fix_floor_gap_2', kind: 'floor_gap', x: 12.8, y: 2.5, radius: 0.25 },
      { id: 'fix_floor_gap_3', kind: 'floor_gap', x: 17.4, y: 2.5, radius: 0.25 },
      { id: 'fix_floor_gap_4', kind: 'floor_gap', x: 25.8, y: 2.5, radius: 0.25 },
      // A string of five bulbs under the boards: click to switch them on.
      { id: 'fix_porch_lamp', kind: 'porch_lamp', x: 20.6, y: 3.3, radius: 0.5, w: 4.2, h: 1.1 },
      // A cobweb strung between two old flowerpots: a sticky, saggy hammock.
      { id: 'fix_cobweb_hammock', kind: 'cobweb', x: 23.7, y: 6.9, radius: 0.5, w: 2.6 },
      { id: 'fix_spider', kind: 'spider', x: 27.6, y: 4.3, radius: 0.5 },
      // The tunnel at the bottom of the tin can wall, just a pill bug wide.
      {
        id: 'fix_can_tunnel',
        kind: 'can_tunnel',
        x: 30.3,
        y: 8.5,
        radius: 0.5,
        opens: 'area_compost_lab',
        wall: 30.5,
      },
    ],
  },
  {
    id: 'area_compost_lab',
    name: 'Compost Lab',
    xStart: 134.4,
    xEnd: 163.2,
    terrain: [
      [0, GROUND],
      [1.6, GROUND],
      // The warm compost heap.
      ...mound(5.2, 3.3, 1.05, 14),
      [9.2, GROUND],
      [26.2, GROUND],
      // The roots of the treehouse tree, up to the treehouse floor.
      ...ramp(26.2, GROUND, 28.8, 6.5, 10).slice(1),
    ],
    start: [
      { kind: 'item', defId: 'item_jar_glass', x: 1.3 },
      { kind: 'item', defId: 'item_dung_ball', x: 6.6 },
      { kind: 'bug', defId: 'bug_dungbeetle_barty', x: 4.6, pending: 'aloof' },
      { kind: 'item', defId: 'item_apple_core', x: 9.0 },
      // Jars on the popsicle-stick shelves, each with its ingredient in front.
      { kind: 'item', defId: 'item_moss_tuft', x: 10.4, y: 7.3 },
      { kind: 'item', defId: 'item_pepper_hot', x: 12.1, y: 7.3 },
      { kind: 'item', defId: 'item_mushroom_cap', x: 13.8, y: 7.3 },
      { kind: 'item', defId: 'item_honey_drop', x: 10.4, y: 5.9 },
      { kind: 'item', defId: 'item_coffee_bean', x: 12.1, y: 5.9 },
      { kind: 'item', defId: 'item_ice_cube', x: 13.8, y: 5.9 },
      { kind: 'item', defId: 'item_onion_ring', x: 10.4, y: 4.5 },
      { kind: 'item', defId: 'item_fizz_candy', x: 12.1, y: 4.5 },
      { kind: 'item', defId: 'item_feather', x: 13.8, y: 4.5 },
      // Behind the shelves: somebody big, stuck on his back.
      { kind: 'bug', defId: 'bug_stagbeetle_moose', x: 15.9, pending: 'stuck' },
      { kind: 'item', defId: 'item_jar_glass', x: 17.6 },
      { kind: 'item', defId: 'item_rotten_banana_bit', x: 18.6 },
      { kind: 'item', defId: 'item_moss_tuft', x: 19.8 },
      { kind: 'item', defId: 'item_apple_core', x: 21.2 },
    ],
    respawn: [{ item: 'item_apple_core', count: 1 }],
    skyTop: 0xa8d8c8,
    skyBottom: 0xeef2d0,
    ground: 0x7fa33a,
    groundDark: 0x556b2f,
    dirt: 0x6b4a2b,
    dirtDark: 0x4a321c,
    unlockedByDefault: false,
    mood: 'compost',
    solids: [
      // Three shelves of popsicle sticks.
      { id: 'solid_shelf_low', box: [9.6, 7.3, 14.6, 7.45] },
      { id: 'solid_shelf_middle', box: [9.6, 5.9, 14.6, 6.05] },
      { id: 'solid_shelf_high', box: [9.6, 4.5, 14.6, 4.65] },
    ],
    fixtures: [
      { id: 'fix_compost_heap', kind: 'compost_heap', x: 5.2, y: 8.2, radius: 1, w: 6 },
      { id: 'fix_jar_moss', kind: 'shelf_jar', x: 10.4, y: 7.3, radius: 0.35, item: 'item_moss_tuft' },
      { id: 'fix_jar_pepper', kind: 'shelf_jar', x: 12.1, y: 7.3, radius: 0.35, item: 'item_pepper_hot' },
      { id: 'fix_jar_mushroom', kind: 'shelf_jar', x: 13.8, y: 7.3, radius: 0.35, item: 'item_mushroom_cap' },
      { id: 'fix_jar_honey', kind: 'shelf_jar', x: 10.4, y: 5.9, radius: 0.35, item: 'item_honey_drop' },
      { id: 'fix_jar_coffee', kind: 'shelf_jar', x: 12.1, y: 5.9, radius: 0.35, item: 'item_coffee_bean' },
      { id: 'fix_jar_ice', kind: 'shelf_jar', x: 13.8, y: 5.9, radius: 0.35, item: 'item_ice_cube' },
      { id: 'fix_jar_onion', kind: 'shelf_jar', x: 10.4, y: 4.5, radius: 0.35, item: 'item_onion_ring' },
      { id: 'fix_jar_fizz', kind: 'shelf_jar', x: 12.1, y: 4.5, radius: 0.35, item: 'item_fizz_candy' },
      { id: 'fix_jar_feather', kind: 'shelf_jar', x: 13.8, y: 4.5, radius: 0.35, item: 'item_feather' },
      // A rope over a branch with a bucket at each end. The top one holds a heavy acorn.
      {
        id: 'fix_bucket_lift',
        kind: 'bucket_lift',
        x: 23.6,
        y: 8.4,
        radius: 0.75,
        opens: 'area_treehouse_arcade',
        wall: 26.5,
      },
    ],
  },
  {
    id: 'area_treehouse_arcade',
    name: 'Treehouse Arcade',
    xStart: 163.2,
    xEnd: 195.2,
    terrain: [
      [0, 6.5],
      [14.4, 6.5],
      // The bead pit, sunk into the floor.
      ...ramp(14.4, 6.5, 15.2, 7.9, 4).slice(1),
      ...ramp(20.2, 7.9, 21, 6.5, 4),
      [32, 6.5],
    ],
    start: [
      { kind: 'item', defId: 'item_domino', x: 1.7 },
      { kind: 'item', defId: 'item_domino', x: 2.06 },
      { kind: 'item', defId: 'item_domino', x: 2.42 },
      { kind: 'item', defId: 'item_domino', x: 2.78 },
      { kind: 'item', defId: 'item_domino', x: 3.14 },
      { kind: 'item', defId: 'item_domino', x: 3.5 },
      { kind: 'item', defId: 'item_domino', x: 3.86 },
      { kind: 'item', defId: 'item_domino', x: 4.22 },
      { kind: 'item', defId: 'item_domino', x: 4.58 },
      { kind: 'item', defId: 'item_domino', x: 4.94 },
      { kind: 'item', defId: 'item_domino', x: 5.3 },
      { kind: 'item', defId: 'item_domino', x: 5.66 },
      { kind: 'item', defId: 'item_marble_track_curve', x: 6.5 },
      { kind: 'item', defId: 'item_marble_green', x: 7.35 },
      { kind: 'item', defId: 'item_marble_track_straight', x: 8.4 },
      { kind: 'item', defId: 'item_marble_track_curve', x: 9.9 },
      { kind: 'item', defId: 'item_marble_track_straight', x: 11.5 },
      { kind: 'item', defId: 'item_marble_track_curve', x: 12.9 },
      { kind: 'item', defId: 'item_marble_funnel', x: 13.95 },
      // Prizes in the jam jar claw machine.
      { kind: 'item', defId: 'item_foil_ball', x: 22.1 },
      { kind: 'item', defId: 'item_jelly_bean', x: 22.7 },
      { kind: 'item', defId: 'item_button', x: 23.3 },
      { kind: 'item', defId: 'item_yo_yo', x: 23.9 },
      { kind: 'item', defId: 'item_spinning_top', x: 26.8 },
      { kind: 'item', defId: 'item_jelly_bean', x: 28.9 },
      { kind: 'item', defId: 'item_marble_track_straight', x: 30.2 },
      // Two pieces already pinned to the pegboard, to show how it works.
      { kind: 'item', defId: 'item_marble_track_straight', x: 6.4, y: 2.9, pin: 0.785 },
      { kind: 'item', defId: 'item_marble_track_curve', x: 8, y: 4.4, pin: 0 },
      { kind: 'item', defId: 'item_jelly_bean', x: 29.8 },
    ],
    respawn: [{ item: 'item_jelly_bean', count: 2 }],
    skyTop: 0x8fd6f2,
    skyBottom: 0xe4f6ee,
    ground: 0xd98e4a,
    groundDark: 0xb56a2e,
    dirt: 0xb56a2e,
    dirtDark: 0x8a4f22,
    unlockedByDefault: false,
    mood: 'arcade',
    roof: { x0: 1, x1: 32, y: 1.3 },
    solids: [
      // The treehouse roof.
      { id: 'solid_treehouse_roof', box: [1, 0.9, 32, 1.3] },
      // The jam jar claw machine: glass walls and a lid.
      { id: 'solid_claw_jar_left', box: [21.45, 3.5, 21.6, 6.5] },
      { id: 'solid_claw_jar_right', box: [24.8, 3.5, 24.95, 6.5] },
      { id: 'solid_claw_jar_lid', box: [21.45, 3.35, 24.95, 3.5] },
      // The curling leaf slide, from a high perch down to the floor.
      {
        id: 'solid_leaf_slide',
        chain: [
          [32, 3.2],
          [31.2, 3.25],
          [30.4, 3.5],
          [29.7, 4.0],
          [29.1, 4.7],
          [28.6, 5.4],
          [28.1, 5.95],
          [27.5, 6.3],
          [26.8, 6.45],
        ],
        friction: 0.05,
      },
    ],
    fixtures: [
      { id: 'fix_treehouse_window', kind: 'window', x: 3.4, y: 3.3, radius: 0.9 },
      { id: 'fix_pegboard', kind: 'pegboard', x: 9.4, y: 3.9, radius: 0.4, w: 8, h: 4.2 },
      { id: 'fix_bead_pit', kind: 'bead_pit', x: 17.7, y: 7.9, radius: 0.5, w: 5.6 },
      { id: 'fix_jar_claw', kind: 'jar_claw', x: 23.2, y: 3.8, radius: 0.4, w: 2.8 },
      { id: 'fix_claw_button', kind: 'claw_button', x: 26.2, y: 4.5, radius: 0.35 },
      { id: 'fix_leaf_slide', kind: 'leaf_slide', x: 31.4, y: 3.1, radius: 0.5 },
    ],
  },
]);
