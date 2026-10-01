import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import type { AreaDef } from '../../../../game/data/types';
import { darken, lighten, mix, stroke } from '../palette';
import { GROUND_PX, plank, soft } from './common';

const PPM = PIXELS_PER_METER;

/** Under the porch (game design doc, section 3): deep shadows, dusty planks, one warm light shaft. */
export const PORCH = {
  shadow: 0x2a2438,
  shadowLow: 0x3b3350,
  plank: 0x8c7a6b,
  plankDark: 0x6e5f54,
  light: 0xffe3a3,
  siding: 0x9fb4c8,
  web: 0xffffff,
} as const;

/** Where the porch boards sit: their underside is the crawlspace's ceiling. */
export const BOARDS = { top: 190, bottom: 250 } as const;

/**
 * The crawlspace itself, behind everything: the dark space under the
 * boards with the far skirt's lattice leaking stripes of light, support
 * posts, the boards overhead, and the deck and house above them.
 */
export function drawPorchBackdrop(area: AreaDef, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const roof = area.roof!;
  const x0 = (area.xStart + roof.x0) * PPM;
  const x1 = (area.xStart + roof.x1) * PPM;
  const dark = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: PORCH.shadow },
      { offset: 0.7, color: PORCH.shadowLow },
      { offset: 1, color: 0x4a3f55 },
    ],
    textureSpace: 'local',
  });
  g.rect(x0, BOARDS.bottom, x1 - x0, GROUND_PX + 20 - BOARDS.bottom).fill(dark);
  // The far skirt: a lattice with daylight showing through the diamonds.
  const skirtTop = 520;
  g.rect(x0, skirtTop, x1 - x0, GROUND_PX - skirtTop).fill({ color: 0x5a4a60, alpha: 0.5 });
  const span = GROUND_PX - skirtTop;
  // Diagonal slats, clipped to the porch: (x, top) down to (x + span, bottom), and the mirror.
  const slat = (ax: number, ay: number, bx: number, by: number): void => {
    // Keep the part of the line between x0 and x1.
    const ta = (x0 - ax) / (bx - ax);
    const tb = (x1 - ax) / (bx - ax);
    const lo = Math.max(0, Math.min(ta, tb));
    const hi = Math.min(1, Math.max(ta, tb));
    if (hi <= lo) return;
    g.moveTo(ax + (bx - ax) * lo, ay + (by - ay) * lo)
      .lineTo(ax + (bx - ax) * hi, ay + (by - ay) * hi)
      .stroke({ width: 14, color: 0x3a2f45, alpha: 0.55 });
  };
  for (let x = x0 - span; x < x1 + span; x += 90) {
    slat(x, skirtTop, x + span, GROUND_PX);
    slat(x + span, skirtTop, x, GROUND_PX);
  }
  for (let x = x0 + 45; x < x1; x += 90)
    for (let y = skirtTop + 45; y < GROUND_PX; y += 90)
      g.poly([x, y - 26, x + 26, y, x, y + 26, x - 26, y]).fill({ color: 0xd9f0c8, alpha: 0.13 });
  // Support posts and blocks, far back.
  for (let x = x0 + 520; x < x1 - 100; x += rng.range(820, 1100)) {
    g.rect(x - 34, BOARDS.bottom, 68, GROUND_PX - BOARDS.bottom)
      .fill(0x4d4150)
      .stroke(soft(3, 0.4));
    g.rect(x - 48, GROUND_PX - 60, 96, 60)
      .fill(0x5d5360)
      .stroke(soft(3, 0.4));
    g.rect(x - 22, BOARDS.bottom + 20, 10, GROUND_PX - BOARDS.bottom - 100).fill({
      color: 0xffffff,
      alpha: 0.05,
    });
  }
  // Old boxes and a coiled hose in the gloom.
  for (let x = x0 + 300; x < x1 - 300; x += rng.range(700, 1200)) {
    const w = rng.range(140, 240);
    const h = rng.range(90, 160);
    g.rect(x, GROUND_PX - h, w, h)
      .fill(0x4f4452)
      .stroke(soft(3, 0.35));
    g.moveTo(x, GROUND_PX - h)
      .lineTo(x + w * 0.5, GROUND_PX - h - 26)
      .lineTo(x + w, GROUND_PX - h)
      .stroke(soft(3, 0.3));
  }
  // The boards overhead, with gaps of light between some of them.
  const boards = new Graphics();
  for (let x = x0, i = 0; x < x1; i++) {
    const w = rng.range(150, 230);
    plank(
      boards,
      x,
      BOARDS.top,
      Math.min(w, x1 - x),
      BOARDS.bottom - BOARDS.top,
      i % 2 ? PORCH.plank : PORCH.plankDark,
      darken(PORCH.plank, 0.3),
      i,
    );
    x += w + 3;
  }
  // Joists running along the underside.
  for (let x = x0 + 200; x < x1; x += 600)
    boards.rect(x, BOARDS.bottom - 16, 40, 16).fill({ color: 0x3b3040, alpha: 0.8 });
  boards.moveTo(x0, BOARDS.bottom).lineTo(x1, BOARDS.bottom).stroke(stroke(5));
  // The deck and the house above.
  const house = new Graphics();
  house.rect(x0, 0, x1 - x0, BOARDS.top - 30).fill(PORCH.siding);
  for (let y = 20; y < BOARDS.top - 30; y += 26)
    house
      .moveTo(x0, y)
      .lineTo(x1, y)
      .stroke({ width: 3, color: darken(PORCH.siding, 0.15), alpha: 0.7 });
  // A doorstep, a mat, and a potted geranium on the deck.
  const door = x0 + 1300;
  house
    .rect(door, 0, 360, BOARDS.top - 30)
    .fill(0xe8453c)
    .stroke(soft(3, 0.5));
  house.rect(door + 30, 20, 130, BOARDS.top - 60).fill({ color: 0xffffff, alpha: 0.15 });
  house.circle(door + 320, 70, 10).fill(0xffd23f);
  house
    .roundRect(door - 20, BOARDS.top - 44, 400, 16, 6)
    .fill(0x9a7a4a)
    .stroke(soft(2, 0.5));
  const pot = x0 + 2300;
  house
    .poly([
      pot - 50,
      BOARDS.top - 30,
      pot + 50,
      BOARDS.top - 30,
      pot + 38,
      BOARDS.top - 110,
      pot - 38,
      BOARDS.top - 110,
    ])
    .fill(0xd46b3e)
    .stroke(soft(3, 0.5));
  for (const [dx, dy] of [
    [-30, -150],
    [0, -170],
    [28, -148],
  ] as const) {
    house
      .circle(pot + dx, BOARDS.top + dy, 26)
      .fill(0xe8453c)
      .stroke(soft(2, 0.5));
    house.circle(pot + dx, BOARDS.top + dy, 9).fill(0xffd23f);
  }
  plank(house, x0 - 20, BOARDS.top - 30, x1 - x0 + 20, 30, lighten(PORCH.plank, 0.12), PORCH.plank, 7);
  // The porch's corner post at the front, where the lattice leans.
  house
    .rect(x0 - 10, BOARDS.top - 30, 60, GROUND_PX - BOARDS.top + 40)
    .fill(PORCH.plank)
    .stroke(soft(3, 0.55));
  house.rect(x0 + 6, BOARDS.top, 12, GROUND_PX - BOARDS.top).fill({ color: 0xffffff, alpha: 0.15 });
  c.addChild(g, boards, house);
  return c;
}

/**
 * Props behind the walk line: the stack of old flowerpots the cobweb hangs
 * between, and cobwebs. The Tinker Bench has its own live view.
 */
export function drawPorchBack(area: AreaDef, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  // The Tinker Bench is drawn live (benchLive.ts): it shakes when it works.
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
  for (const [px, bottom, h] of pots) {
    const x = x0 + px;
    const w = h * 1.1;
    g.poly([x - w / 2, bottom, x + w / 2, bottom, x + w * 0.38, bottom - h, x - w * 0.38, bottom - h])
      .fill(mix(0xd46b3e, 0x5a4a60, 0.35))
      .stroke(soft(3, 0.5));
    g.rect(x - w * 0.44, bottom - h - 16, w * 0.88, 22)
      .fill(mix(0xe07b4e, 0x5a4a60, 0.3))
      .stroke(soft(3, 0.5));
  }
  // Whiff's flowerpot, upright by the junk drift.
  const wx = x0 + 730;
  g.poly([wx - 55, GROUND_PX + 4, wx + 55, GROUND_PX + 4, wx + 44, GROUND_PX - 80, wx - 44, GROUND_PX - 80])
    .fill(0xd46b3e)
    .stroke(stroke(5));
  g.roundRect(wx - 56, GROUND_PX - 98, 112, 26, 8)
    .fill(0xe07b4e)
    .stroke(stroke(5));
  g.rect(wx - 30, GROUND_PX - 60, 10, 50).fill({ color: 0xffffff, alpha: 0.2 });
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
