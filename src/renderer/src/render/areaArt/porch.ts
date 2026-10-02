import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import { PORCH_LID } from '../../../../game/data/areas';
import type { AreaDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { GROUND_PX, plank, soft } from './common';
import { boardGaps } from './porchLook';

const PPM = PIXELS_PER_METER;

/**
 * Under the porch (game design doc, section 3): a crawlspace, but a cozy
 * one. Warm plum shadows, dusty honey planks, and light leaking in through
 * the gaps between the boards (R03).
 */
export const PORCH = {
  shadow: 0x2a2438,
  shadowWarm: 0x3a2a3a,
  shadowLow: 0x5a4048,
  plank: 0x9c8068,
  plankDark: 0x846a58,
  light: 0xffe3a3,
  siding: 0x9fb4c8,
  web: 0xffffff,
  wood: 0x8a6a52,
  brick: 0xc0674a,
  lid: 0xe0b44a,
} as const;

/** Where the porch boards sit: their underside is the crawlspace's ceiling. */
export const BOARDS = { top: 190, bottom: 250 } as const;

/** Support posts, far back (area-local px). The cork board hangs on the one behind the bench. */
const POSTS = [560, 1720, 2330, 2990] as const;

/** Muted for the far back: pulled toward the warm shadow so props stay brighter. */
const far = (c: number, t = 0.3): number => mix(c, PORCH.shadowWarm, t);

/**
 * The crawlspace itself, behind everything: the warm dark space under the
 * boards with the far skirt's lattice letting in the garden's daylight,
 * support posts, colorful old clutter, the boards overhead, and the deck and
 * house above them.
 */
export function drawPorchBackdrop(area: AreaDef, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const roof = area.roof!;
  const x0 = (area.xStart + roof.x0) * PPM;
  const x1 = (area.xStart + roof.x1) * PPM;
  const ax = area.xStart * PPM;
  const dark = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: PORCH.shadow },
      { offset: 0.35, color: PORCH.shadowWarm },
      { offset: 0.8, color: PORCH.shadowLow },
      { offset: 1, color: 0x6e4e4c },
    ],
    textureSpace: 'local',
  });
  g.rect(x0, BOARDS.bottom, x1 - x0, GROUND_PX + 20 - BOARDS.bottom).fill(dark);
  drawSkirt(g, x0, x1, rng);
  for (const px of POSTS) drawPost(g, ax + px);
  drawClutter(g, ax);
  c.addChild(g, drawBoards(x0, x1, porchGaps(area)), drawHouse(x0, x1));
  return c;
}

/** The gaps between the porch boards (world px), the floor gaps among them. */
export function porchGaps(area: AreaDef): number[] {
  const roof = area.roof!;
  const fixed = (area.fixtures ?? [])
    .filter((f) => f.kind === 'floor_gap')
    .map((f) => (area.xStart + f.x) * PPM);
  return boardGaps((area.xStart + roof.x0) * PPM, (area.xStart + roof.x1) * PPM, fixed);
}

/**
 * The far skirt: a lattice with the garden showing through, sunny grass
 * and a few flowers in the diamonds.
 */
function drawSkirt(g: Graphics, x0: number, x1: number, rng: Rng): void {
  const top = 640;
  const garden = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: far(0xa8cf98, 0.62) },
      { offset: 1, color: far(0x7fae62, 0.58) },
    ],
    textureSpace: 'local',
  });
  g.rect(x0, top, x1 - x0, GROUND_PX - top).fill(garden);
  // Grass and flowers out in the garden, seen through the lattice.
  for (let x = x0 + 10; x < x1; x += rng.range(14, 30)) {
    const h = rng.range(30, 80);
    g.moveTo(x, GROUND_PX)
      .quadraticCurveTo(x + rng.range(-10, 10), GROUND_PX - h * 0.6, x + rng.range(-14, 14), GROUND_PX - h)
      .stroke({ width: 5, color: far(0x6aa84f, 0.55), cap: 'round' });
  }
  for (let x = x0 + 60; x < x1; x += rng.range(90, 200)) {
    const y = GROUND_PX - rng.range(40, 100);
    const petal = far(rng.pick([0xff8fab, 0xffd23f, 0xffffff, 0xb48cff]), 0.5);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.circle(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6).fill(petal);
    }
    g.circle(x, y, 4).fill(far(0xffb347, 0.5));
  }
  const span = GROUND_PX - top;
  // Diagonal slats, clipped to the porch: (x, top) down to (x + span, bottom), and the mirror.
  const slat = (ax: number, ay: number, bx: number, by: number): void => {
    const ta = (x0 - ax) / (bx - ax);
    const tb = (x1 - ax) / (bx - ax);
    const lo = Math.max(0, Math.min(ta, tb));
    const hi = Math.min(1, Math.max(ta, tb));
    if (hi <= lo) return;
    const p = [ax + (bx - ax) * lo, ay + (by - ay) * lo, ax + (bx - ax) * hi, ay + (by - ay) * hi] as const;
    g.moveTo(p[0], p[1])
      .lineTo(p[2], p[3])
      .stroke({ width: 16, color: far(0x6b4a3a, 0.45), cap: 'butt' });
    g.moveTo(p[0], p[1] - 6)
      .lineTo(p[2], p[3] - 6)
      .stroke({ width: 3, color: far(0xb08a68, 0.5), alpha: 0.6, cap: 'butt' });
  };
  for (let x = x0 - span; x < x1 + span; x += 110) {
    slat(x, top, x + span, GROUND_PX);
    slat(x + span, top, x, GROUND_PX);
  }
  // The skirt's top rail.
  g.rect(x0, top - 18, x1 - x0, 22)
    .fill(far(0x7a5644, 0.45))
    .stroke(soft(3, 0.4));
  g.rect(x0, top - 18, x1 - x0, 5).fill({ color: 0xffd9a0, alpha: 0.2 });
}

/** A wooden support post on a concrete footing, lit from the left. */
function drawPost(g: Graphics, x: number): void {
  const w = 64;
  const top = BOARDS.bottom;
  const bottom = GROUND_PX - 50;
  g.rect(x - w / 2, top, w, bottom - top)
    .fill(far(PORCH.wood, 0.3))
    .stroke(soft(3, 0.5));
  g.rect(x - w / 2 + 6, top, 12, bottom - top).fill({ color: 0xffd9a0, alpha: 0.22 });
  g.rect(x + w / 2 - 16, top, 16, bottom - top).fill({ color: OUTLINE, alpha: 0.22 });
  for (let k = 0; k < 3; k++) {
    const y = top + 120 + k * 170;
    g.moveTo(x - 14, y)
      .quadraticCurveTo(x + 2, y + 30, x - 6, y + 70)
      .stroke({ width: 2, color: darken(PORCH.wood, 0.35), alpha: 0.5 });
  }
  // The footing.
  g.roundRect(x - 52, bottom, 104, GROUND_PX - bottom + 8, 6)
    .fill(far(0x9a8f88, 0.3))
    .stroke(soft(3, 0.5));
  g.rect(x - 46, bottom + 4, 92, 7).fill({ color: 0xffffff, alpha: 0.2 });
}

/**
 * Old things kept under the porch, far back and muted but colorful: paint
 * cans behind the lattice, a coiled garden hose on a post, a crayon box
 * under the shelf, a watering can, a squashed beach ball, a sand bucket and
 * spade, and keys hanging on a string from the boards.
 */
function drawClutter(g: Graphics, ax: number): void {
  const floor = GROUND_PX + 4;
  const line = soft(3, 0.5);
  // Paint cans, stacked, with drips.
  const can = (x: number, bottom: number, w: number, h: number, color: number): void => {
    g.rect(x - w / 2, bottom - h, w, h)
      .fill(far(color))
      .stroke(line);
    g.ellipse(x, bottom - h, w / 2, 9)
      .fill(far(lighten(color, 0.25)))
      .stroke(line);
    g.rect(x - w / 2 + 8, bottom - h + 10, 10, h - 16).fill({ color: 0xffffff, alpha: 0.2 });
    g.rect(x - w / 2, bottom - h * 0.62, w, h * 0.3).fill(far(0xf4efe6, 0.4));
    g.moveTo(x - w * 0.2, bottom - h)
      .quadraticCurveTo(x - w * 0.22, bottom - h + 24, x - w * 0.18, bottom - h + 30)
      .stroke({ width: 7, color: far(lighten(color, 0.1)), cap: 'round' });
  };
  can(ax + 340, floor, 110, 120, 0x3f8fd9);
  can(ax + 470, floor, 96, 100, 0xe8453c);
  can(ax + 400, floor - 120, 90, 90, 0xf2c14e);
  // A garden hose coiled on a nail on the first post.
  const hx = ax + POSTS[0];
  for (let k = 0; k < 4; k++)
    g.ellipse(hx + k * 3, 470 + k * 6, 70 - k * 4, 54 - k * 3).stroke({
      width: 13,
      color: far(0x4caf50, 0.3),
    });
  g.ellipse(hx + 6, 482, 58, 44).stroke({ width: 3, color: OUTLINE, alpha: 0.35 });
  g.circle(hx, 418, 6).fill(far(0xb0b0b8, 0.3));
  g.roundRect(hx + 44, 520, 18, 46, 6)
    .fill(far(0xf2c14e, 0.3))
    .stroke(line);
  // A crayon box under the plank shelf.
  const bx = ax + 1300;
  g.roundRect(bx - 70, floor - 96, 140, 96, 6)
    .fill(far(0xf2c14e, 0.3))
    .stroke(line);
  g.rect(bx - 70, floor - 60, 140, 26).fill(far(0x3fa34d, 0.3));
  [0xe8453c, 0x3f8fd9, 0x9b59d0, 0xff8f3f, 0x2ec4b6].forEach((color, k) => {
    const cx = bx - 50 + k * 24;
    const h = 30 + ((k * 13) % 22);
    g.rect(cx - 7, floor - 96 - h, 14, h)
      .fill(far(color, 0.25))
      .stroke(soft(2, 0.45));
    g.poly([cx - 7, floor - 96 - h, cx + 7, floor - 96 - h, cx, floor - 110 - h]).fill(far(color, 0.25));
  });
  // A watering can on its side behind the cobweb.
  const wx = ax + 2400;
  g.ellipse(wx, floor - 46, 78, 48)
    .fill(far(0x2ec4b6, 0.35))
    .stroke(line);
  g.ellipse(wx - 20, floor - 66, 30, 12).fill({ color: 0xffffff, alpha: 0.2 });
  g.moveTo(wx + 60, floor - 60)
    .lineTo(wx + 140, floor - 100)
    .stroke({ width: 14, color: far(0x2ec4b6, 0.35), cap: 'round' });
  g.ellipse(wx + 146, floor - 104, 14, 18)
    .fill(far(0x26a69a, 0.35))
    .stroke(soft(2, 0.45));
  g.moveTo(wx - 60, floor - 70)
    .quadraticCurveTo(wx - 110, floor - 120, wx - 40, floor - 92)
    .stroke({ width: 9, color: far(0x26a69a, 0.35), cap: 'round' });
  // A squashed beach ball.
  const bb = ax + 2665;
  const ball = [0xe8453c, 0xffffff, 0x3f8fd9, 0xffd23f];
  ball.forEach((color, k) => {
    const a0 = Math.PI + (k / 4) * Math.PI;
    const a1 = Math.PI + ((k + 1) / 4) * Math.PI;
    g.moveTo(bb, floor - 4)
      .arc(bb, floor - 4, 46, a0, a1)
      .closePath()
      .fill(far(color, 0.3));
  });
  g.ellipse(bb, floor - 4, 46, 46).stroke(line);
  g.ellipse(bb - 16, floor - 30, 10, 6).fill({ color: 0xffffff, alpha: 0.35 });
  // A sand bucket upside down, with its spade.
  const sb = ax + 2930;
  g.poly([sb - 46, floor, sb + 46, floor, sb + 34, floor - 80, sb - 34, floor - 80])
    .fill(far(0xffd23f, 0.3))
    .stroke(line);
  g.rect(sb - 30, floor - 74, 12, 64).fill({ color: 0xffffff, alpha: 0.22 });
  g.moveTo(sb + 50, floor - 2)
    .lineTo(sb + 90, floor - 110)
    .stroke({ width: 8, color: far(0xe8453c, 0.3), cap: 'round' });
  g.poly([sb + 80, floor - 104, sb + 110, floor - 116, sb + 104, floor - 150, sb + 82, floor - 140])
    .fill(far(0xe8453c, 0.3))
    .stroke(soft(2, 0.45));
  // Keys on a string, hanging from the boards.
  const kx = ax + 2620;
  g.moveTo(kx, BOARDS.bottom)
    .lineTo(kx, 400)
    .stroke({ width: 2, color: far(0xe8dcc8, 0.3) });
  g.circle(kx, 412, 13).stroke({ width: 4, color: far(0xd9b45a, 0.25) });
  for (const [dx, a] of [
    [-6, 0.3],
    [8, -0.2],
  ] as const) {
    const sx = kx + dx;
    const ex = sx + Math.sin(a) * 50;
    g.moveTo(sx, 420)
      .lineTo(ex, 470)
      .stroke({ width: 8, color: far(0xd9b45a, 0.25), cap: 'round' });
    g.circle(sx + Math.sin(a) * 6, 426, 10).fill(far(0xd9b45a, 0.25));
  }
}

/**
 * The porch boards overhead, seen from below: honey planks with a lit front
 * edge and a shaded underside, dark gaps between them (light comes through
 * them by day, drawn live), and joists.
 */
function drawBoards(x0: number, x1: number, gaps: readonly number[]): Graphics {
  const b = new Graphics();
  const h = BOARDS.bottom - BOARDS.top;
  let from = x0;
  [...gaps, x1].forEach((gap, i) => {
    const w = gap - from - (gap < x1 ? 5 : 0);
    if (w > 4) {
      plank(b, from, BOARDS.top, w, h, i % 2 ? PORCH.plank : PORCH.plankDark, darken(PORCH.plank, 0.3), i);
      // Light catches the board's front edge; the underside falls into shadow.
      b.rect(from + 2, BOARDS.top + 3, w - 4, 6).fill({ color: 0xffe9c0, alpha: 0.35 });
      b.rect(from + 2, BOARDS.bottom - 16, w - 4, 14).fill({ color: OUTLINE, alpha: 0.25 });
    }
    if (gap < x1) b.rect(gap - 5, BOARDS.top, 5, h).fill(0x241a22);
    from = gap;
  });
  // Joists running along the underside.
  for (let x = x0 + 200; x < x1; x += 600) {
    b.rect(x, BOARDS.bottom - 18, 46, 18)
      .fill(darken(PORCH.wood, 0.25))
      .stroke(soft(2, 0.5));
    b.rect(x + 4, BOARDS.bottom - 16, 10, 14).fill({ color: 0xffd9a0, alpha: 0.2 });
  }
  b.moveTo(x0, BOARDS.bottom).lineTo(x1, BOARDS.bottom).stroke(stroke(5));
  return b;
}

/** The deck above: the house's siding, the back door, its mat, and a potted geranium. */
function drawHouse(x0: number, x1: number): Graphics {
  const house = new Graphics();
  const base = BOARDS.top - 30;
  house.rect(x0, 0, x1 - x0, base).fill(PORCH.siding);
  for (let y = 20; y < base; y += 26) {
    house.rect(x0, y - 10, x1 - x0, 6).fill({ color: 0xffffff, alpha: 0.14 });
    house
      .moveTo(x0, y)
      .lineTo(x1, y)
      .stroke({ width: 3, color: darken(PORCH.siding, 0.18), alpha: 0.7 });
  }
  // The deck's shadow along the wall.
  house.rect(x0, base - 18, x1 - x0, 18).fill({ color: OUTLINE, alpha: 0.12 });
  drawDoor(house, x0 + 1300, base);
  // A potted geranium.
  const pot = x0 + 2300;
  house
    .poly([pot - 50, base, pot + 50, base, pot + 38, base - 80, pot - 38, base - 80])
    .fill(0xd46b3e)
    .stroke(stroke(4));
  house.rect(pot - 30, base - 74, 12, 66).fill({ color: 0xffffff, alpha: 0.25 });
  house
    .roundRect(pot - 46, base - 94, 92, 20, 6)
    .fill(0xe07b4e)
    .stroke(stroke(4));
  for (const [dx, dy] of [
    [-34, -118],
    [-8, -132],
    [22, -116],
  ] as const)
    house
      .ellipse(pot + dx, base + dy + 18, 14, 9)
      .fill(0x4caf50)
      .stroke(soft(2, 0.6));
  for (const [dx, dy] of [
    [-30, -150],
    [0, -170],
    [28, -148],
  ] as const) {
    house
      .circle(pot + dx, BOARDS.top + dy, 24)
      .fill(0xe8453c)
      .stroke(stroke(3));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      house.circle(pot + dx + Math.cos(a) * 11, BOARDS.top + dy + Math.sin(a) * 11, 7).fill(0xff6b5e);
    }
    house.circle(pot + dx, BOARDS.top + dy, 6).fill(0xffd23f);
    house.circle(pot + dx - 8, BOARDS.top + dy - 9, 5).fill({ color: 0xffffff, alpha: 0.45 });
  }
  // The deck's front board.
  plank(house, x0 - 20, base, x1 - x0 + 20, 30, lighten(PORCH.plank, 0.12), PORCH.plank, 7);
  house.rect(x0 - 20, base + 2, x1 - x0 + 20, 5).fill({ color: 0xffffff, alpha: 0.3 });
  // The porch's corner post at the front, where the lattice leans.
  house
    .rect(x0 - 10, base, 60, GROUND_PX - BOARDS.top + 40)
    .fill(PORCH.plank)
    .stroke(soft(3, 0.55));
  house.rect(x0 + 2, BOARDS.top, 12, GROUND_PX - BOARDS.top).fill({ color: 0xffffff, alpha: 0.22 });
  house.rect(x0 + 34, BOARDS.top, 12, GROUND_PX - BOARDS.top).fill({ color: OUTLINE, alpha: 0.2 });
  return house;
}

/**
 * The back door (R30): a painted panel door in a white frame, two sunken
 * panels with lit and shaded bevels, a brass knob and kick plate, and a
 * striped mat on the step. Its top runs off the screen.
 */
function drawDoor(g: Graphics, x: number, base: number): void {
  const w = 300;
  const frame = 22;
  const red = 0xd9534a;
  // The frame and the step.
  g.rect(x - frame, -10, w + frame * 2, base + 10)
    .fill(0xf4efe6)
    .stroke(stroke(4));
  g.rect(x - frame + 4, -10, 6, base + 6).fill({ color: 0xffffff, alpha: 0.7 });
  const door = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: lighten(red, 0.12) },
      { offset: 0.7, color: red },
      { offset: 1, color: darken(red, 0.15) },
    ],
    textureSpace: 'local',
  });
  g.rect(x, -10, w, base + 10)
    .fill(door)
    .stroke(stroke(4));
  // Two sunken panels: light on the bottom and right bevels, shade on the top and left.
  for (const px of [x + 30, x + w / 2 + 12]) {
    const pw = w / 2 - 42;
    const py = 8;
    const ph = base - 60;
    g.rect(px, py, pw, ph).fill(darken(red, 0.1));
    g.poly([px, py, px + pw, py, px + pw - 10, py + 10, px + 10, py + 10]).fill(darken(red, 0.28));
    g.poly([px, py, px + 10, py + 10, px + 10, py + ph - 10, px, py + ph]).fill(darken(red, 0.2));
    g.poly([px, py + ph, px + 10, py + ph - 10, px + pw - 10, py + ph - 10, px + pw, py + ph]).fill(
      lighten(red, 0.22),
    );
    g.poly([px + pw, py, px + pw, py + ph, px + pw - 10, py + ph - 10, px + pw - 10, py + 10]).fill(
      lighten(red, 0.12),
    );
    g.rect(px, py, pw, ph).stroke({ width: 2.5, color: OUTLINE, alpha: 0.5 });
  }
  // A highlight down the door's left edge.
  g.rect(x + 8, -10, 8, base).fill({ color: 0xffffff, alpha: 0.18 });
  // Brass knob on its plate, and a kick plate at the bottom.
  const kx = x + w - 34;
  const ky = base - 70;
  g.roundRect(kx - 10, ky - 24, 20, 50, 8)
    .fill(0xc9963a)
    .stroke(stroke(3));
  g.circle(kx, ky, 14).fill(0xf2c14e).stroke(stroke(3));
  g.circle(kx - 4, ky - 5, 5).fill({ color: 0xffffff, alpha: 0.8 });
  g.rect(x + 6, base - 26, w - 12, 20)
    .fill(0xd9a84a)
    .stroke(stroke(3));
  g.rect(x + 12, base - 23, w - 24, 5).fill({ color: 0xffffff, alpha: 0.45 });
  // A striped mat on the deck in front of it.
  g.roundRect(x - 40, base - 10, w + 80, 14, 5)
    .fill(0x8a6a4a)
    .stroke(stroke(3));
  for (let k = 0; k < 7; k++)
    g.rect(x - 30 + k * ((w + 60) / 7), base - 8, (w + 60) / 14, 10).fill({ color: 0xf2c14e, alpha: 0.7 });
}

/**
 * Props behind the walk line: the flowerpots the cobweb hangs between, the
 * plank shelf on its bricks, the shelf hung from the boards, the jar lid of
 * buttons, Whiff's pot, and cobwebs. The Tinker Bench has its own live view.
 */
export function drawPorchBack(area: AreaDef, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  // Old flowerpots stacked into steps toward the boards.
  // [x, bottom, height]: two short stacks hold the cobweb hammock; a tall one reaches the boards.
  const pots: [number, number, number][] = [
    [2190, 904, 110],
    [2190, 790, 110],
    [2560, 904, 120],
    [2560, 780, 108],
    [2780, 904, 130],
    [2780, 770, 120],
    [2780, 646, 108],
    [2780, 534, 100],
    [2780, 430, 92],
    [2780, 334, 84],
  ];
  for (const [px, bottom, h] of pots) drawPot(g, x0 + px, bottom, h, 0.2);
  // Whiff's flowerpot, upright by the way in.
  drawPot(g, x0 + 730, GROUND_PX + 4, 84, 0, true);
  for (const solid of area.solids ?? []) {
    if (!solid.box) continue;
    const [sx0, sy0, sx1, sy1] = solid.box;
    const box = { x0: x0 + sx0 * PPM, y0: sy0 * PPM, x1: x0 + sx1 * PPM, y1: sy1 * PPM };
    if (solid.id === 'solid_porch_shelf') drawBrickShelf(g, box);
    if (solid.id === 'solid_hanging_shelf') drawHangingShelf(g, box);
  }
  drawLidBack(g, x0 + PORCH_LID.x0 * PPM, x0 + PORCH_LID.x1 * PPM);
  // Cobwebs in the corners by the boards.
  for (let x = x0 + 300; x < x0 + 3000; x += rng.range(500, 900)) {
    const size = rng.range(70, 130);
    const w = new Graphics();
    for (let k = 0; k < 6; k++) {
      const a = (k / 5) * (Math.PI / 2);
      w.moveTo(x, BOARDS.bottom).lineTo(x + Math.cos(a) * size, BOARDS.bottom + Math.sin(a) * size);
    }
    for (let r = 0.3; r <= 1; r += 0.23) {
      w.moveTo(x + size * r, BOARDS.bottom);
      for (let k = 1; k <= 5; k++) {
        const a = (k / 5) * (Math.PI / 2);
        w.quadraticCurveTo(
          x + Math.cos(a - 0.15) * size * r * 0.8,
          BOARDS.bottom + Math.sin(a - 0.15) * size * r * 0.8,
          x + Math.cos(a) * size * r,
          BOARDS.bottom + Math.sin(a) * size * r,
        );
      }
    }
    w.stroke({ width: 1.6, color: PORCH.web, alpha: 0.4 });
    c.addChild(w);
  }
  c.addChildAt(g, 0);
  return c;
}

/** A terracotta flowerpot with its rim, lit from the left. */
function drawPot(g: Graphics, x: number, bottom: number, h: number, dim: number, bold = false): void {
  const w = h * 1.1;
  const body = mix(0xd46b3e, PORCH.shadowWarm, dim);
  const rim = mix(0xe07b4e, PORCH.shadowWarm, dim);
  const line = bold ? stroke(5) : soft(3, 0.6);
  g.poly([x - w / 2, bottom, x + w / 2, bottom, x + w * 0.38, bottom - h, x - w * 0.38, bottom - h])
    .fill(body)
    .stroke(line);
  g.poly([x + w * 0.2, bottom, x + w / 2, bottom, x + w * 0.38, bottom - h, x + w * 0.22, bottom - h]).fill({
    color: OUTLINE,
    alpha: 0.18,
  });
  g.rect(x - w * 0.3, bottom - h + 8, w * 0.1, h - 16).fill({ color: 0xffffff, alpha: 0.22 });
  g.roundRect(x - w * 0.46, bottom - h - 18, w * 0.92, 24, 6)
    .fill(rim)
    .stroke(line);
  g.rect(x - w * 0.4, bottom - h - 14, w * 0.8, 5).fill({ color: 0xffffff, alpha: 0.3 });
}

/** The plank shelf: a board laid across two stacks of bricks. */
function drawBrickShelf(g: Graphics, b: { x0: number; y0: number; x1: number; y1: number }): void {
  const brickW = 64;
  const brickH = 30;
  for (const cx of [b.x0 + 46, b.x1 - 46]) {
    for (let y = GROUND_PX, k = 0; y > b.y1 + 2; y -= brickH, k++) {
      const off = k % 2 ? 6 : -6;
      const color = mix(PORCH.brick, k % 3 === 0 ? 0xa04a38 : 0xd27a5a, 0.4);
      g.roundRect(cx - brickW / 2 + off, y - brickH, brickW, brickH, 3)
        .fill(color)
        .stroke(soft(2.5, 0.65));
      g.rect(cx - brickW / 2 + off + 4, y - brickH + 3, brickW - 8, 4).fill({ color: 0xffffff, alpha: 0.25 });
      g.circle(cx + off - 14, y - brickH / 2 + 2, 3).fill({ color: OUTLINE, alpha: 0.2 });
      g.circle(cx + off + 12, y - brickH / 2 + 4, 2.5).fill({ color: OUTLINE, alpha: 0.2 });
    }
  }
  drawShelfBoard(g, b);
}

/** A board seen edge-on with a lit top, grain, and a shadow under it. */
function drawShelfBoard(g: Graphics, b: { x0: number; y0: number; x1: number; y1: number }): void {
  const h = b.y1 - b.y0;
  g.rect(b.x0 + 8, b.y1, b.x1 - b.x0 - 16, 10).fill({ color: OUTLINE, alpha: 0.25 });
  plank(g, b.x0, b.y0, b.x1 - b.x0, h, 0xc9955f, darken(0xc9955f, 0.3), b.x0, 0.9);
  g.rect(b.x0, b.y0, b.x1 - b.x0, h).stroke(stroke(4));
  g.rect(b.x0 + 4, b.y0 + 2, b.x1 - b.x0 - 8, 4).fill({ color: 0xfff1d0, alpha: 0.6 });
}

/** The hanging shelf: a board on two strings from nails in the boards. */
function drawHangingShelf(g: Graphics, b: { x0: number; y0: number; x1: number; y1: number }): void {
  for (const sx of [b.x0 + 26, b.x1 - 26]) {
    for (const dx of [-12, 12]) {
      g.moveTo(sx, BOARDS.bottom + 4)
        .lineTo(sx + dx, b.y0 + 2)
        .stroke({ width: 3, color: 0x2b2030 });
      g.moveTo(sx, BOARDS.bottom + 4)
        .lineTo(sx + dx, b.y0 + 2)
        .stroke({ width: 1.5, color: 0xe8dcc8 });
    }
    g.circle(sx, BOARDS.bottom + 4, 5)
      .fill(0xb0b0b8)
      .stroke(soft(2, 0.7));
  }
  drawShelfBoard(g, b);
}

/** The back half of the jar lid lying on the floor: its rim and the inside's shadow. */
function drawLidBack(g: Graphics, x0: number, x1: number): void {
  const y = GROUND_PX - 4;
  g.ellipse((x0 + x1) / 2, y, (x1 - x0) / 2, 12)
    .fill(darken(PORCH.lid, 0.3))
    .stroke(stroke(3));
  g.ellipse((x0 + x1) / 2, y + 2, (x1 - x0) / 2 - 10, 8).fill(darken(PORCH.lid, 0.45));
}

/** The jar lid's front rim, drawn over what sits in it so the buttons look inside. */
export function drawLidFront(g: Graphics, x0: number, x1: number): void {
  const top = GROUND_PX - 12;
  const h = 14;
  g.roundRect(x0, top, x1 - x0, h, 5)
    .fill(PORCH.lid)
    .stroke(stroke(3));
  for (let x = x0 + 8; x < x1 - 4; x += 9)
    g.moveTo(x, top + 3)
      .lineTo(x, top + h - 3)
      .stroke({ width: 2, color: darken(PORCH.lid, 0.25), alpha: 0.8 });
  g.rect(x0 + 6, top + 2, x1 - x0 - 12, 3).fill({ color: 0xffffff, alpha: 0.6 });
}
