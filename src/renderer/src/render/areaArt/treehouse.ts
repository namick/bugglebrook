import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import type { AreaDef } from '../../../../game/data/types';
import type { Terrain } from '../../../../game/world/terrain';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { blob, plank, soft } from './common';

const PPM = PIXELS_PER_METER;

/** The Treehouse Arcade (game design doc, section 3): plank oranges, leafy canopy, neon on dark panels. */
export const ARCADE = {
  plank: 0xd98e4a,
  plankDark: 0xb56a2e,
  canopy: 0x5faf3f,
  pink: 0xff5fa2,
  blue: 0x4fb6ff,
  panel: 0x2d2b4a,
} as const;

/** The treehouse floor, in world pixels. */
export const FLOOR_PX = 650;

/** Neon signs on the arcade's wall: where, how big, which color, and the pictogram. */
export const NEON: readonly { x: number; y: number; w: number; h: number; color: number; icon: string }[] = [
  { x: 17.7, y: 2.3, w: 3.4, h: 1.2, color: ARCADE.blue, icon: 'board' },
  { x: 23.2, y: 1.8, w: 2.6, h: 0.55, color: ARCADE.pink, icon: 'claw' },
  { x: 29.6, y: 1.9, w: 1.8, h: 0.5, color: 0xb6ff3b, icon: 'slide' },
];

/** A pictogram in neon strokes, centered on (x, y), about `s` px big. */
export function neonIcon(
  g: Graphics,
  icon: string,
  x: number,
  y: number,
  s: number,
  color: number,
  width = 5,
): void {
  const line = { width, color, cap: 'round' as const, join: 'round' as const };
  switch (icon) {
    case 'marble':
      g.circle(x - s * 0.6, y, s * 0.32).stroke(line);
      g.moveTo(x - s * 0.2, y + s * 0.2)
        .lineTo(x + s * 0.9, y - s * 0.1)
        .stroke(line);
      g.circle(x + s * 0.3, y - s * 0.3, s * 0.12).stroke(line);
      break;
    case 'claw':
      g.moveTo(x, y - s * 0.5)
        .lineTo(x, y)
        .stroke(line);
      g.moveTo(x - s * 0.35, y + s * 0.4)
        .lineTo(x, y)
        .lineTo(x + s * 0.35, y + s * 0.4)
        .stroke(line);
      g.star(x + s * 0.8, y + s * 0.1, 5, s * 0.22, s * 0.1).stroke(line);
      break;
    case 'slide':
      g.moveTo(x - s * 0.6, y - s * 0.4)
        .quadraticCurveTo(x - s * 0.3, y + s * 0.4, x + s * 0.6, y + s * 0.35)
        .stroke(line);
      break;
    case 'board':
      g.star(x - s * 0.9, y, 5, s * 0.28, s * 0.12).stroke(line);
      g.circle(x, y, s * 0.24).stroke(line);
      g.star(x + s * 0.9, y, 5, s * 0.28, s * 0.12).stroke(line);
      break;
    default:
      g.circle(x, y, s * 0.3).stroke(line);
  }
}

/**
 * The treehouse room, behind everything: the plank back wall, the window
 * onto the garden, neon panels, the pegboard, the jam-jar claw machine's
 * back, the bead pit's box, the curling leaf slide, and the roof beams.
 */
export function drawTreehouseBackdrop(area: AreaDef, terrain: Terrain, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  const roof = area.roof!;
  const wallX = x0 + roof.x0 * PPM;
  const x1 = x0 + roof.x1 * PPM;
  const ceiling = roof.y * PPM;
  // The back wall: vertical boards in two oranges.
  for (let x = wallX, i = 0; x < x1; i++) {
    const w = rng.range(90, 130);
    const color = i % 2 ? ARCADE.plank : mix(ARCADE.plank, ARCADE.plankDark, 0.35);
    g.rect(x, ceiling, Math.min(w, x1 - x), FLOOR_PX - ceiling)
      .fill(color)
      .stroke(soft(2, 0.35));
    g.moveTo(x + w * 0.5, ceiling + 40)
      .bezierCurveTo(x + w * 0.4, 300, x + w * 0.6, 420, x + w * 0.5, FLOOR_PX - 30)
      .stroke({
        width: 2,
        color: darken(ARCADE.plank, 0.2),
        alpha: 0.35,
      });
    if (rng.chance(0.2))
      g.ellipse(x + w * 0.5, rng.range(260, 560), 8, 12).fill({
        color: darken(ARCADE.plank, 0.35),
        alpha: 0.6,
      });
    x += w;
  }
  // A band of shadow under the roof, and a skirting board.
  g.rect(wallX, ceiling, x1 - wallX, 40).fill({ color: 0x3a2418, alpha: 0.25 });
  g.rect(wallX, FLOOR_PX - 26, x1 - wallX, 26)
    .fill(ARCADE.plankDark)
    .stroke(soft(2.5, 0.45));
  // The doorway on the left, where the lift and the ladder arrive: open below a lintel.
  g.rect(wallX - 20, ceiling, 50, 200)
    .fill(ARCADE.plankDark)
    .stroke(soft(3, 0.5));
  g.rect(x0 - 10, ceiling + 170, wallX - x0 + 40, 34)
    .fill(ARCADE.plankDark)
    .stroke(soft(3, 0.5));
  // The window onto the garden.
  drawWindow(g, x0 + 3.4 * PPM, 3.3 * PPM);
  // Dark arcade panels with neon signs (they glow at night; the glow is drawn by the arcade view).
  for (const n of NEON) {
    const nx = x0 + n.x * PPM;
    const ny = n.y * PPM;
    g.roundRect(nx - (n.w * PPM) / 2, ny - (n.h * PPM) / 2, n.w * PPM, n.h * PPM, 16)
      .fill(ARCADE.panel)
      .stroke(stroke(4));
    neonIcon(g, n.icon, nx, ny, Math.min(n.h * PPM * 0.7, 46), mix(n.color, 0xffffff, 0.2), 5);
  }
  // The pegboard: a big board full of holes; track pieces snap to its grid.
  for (const f of area.fixtures ?? []) {
    if (f.kind !== 'pegboard') continue;
    const w = (f.w ?? 6) * PPM;
    const h = (f.h ?? 4) * PPM;
    const px = x0 + f.x * PPM - w / 2;
    const py = f.y * PPM - h / 2;
    g.roundRect(px - 18, py - 18, w + 36, h + 36, 14)
      .fill(0xa87444)
      .stroke(stroke(5));
    g.rect(px, py, w, h).fill(0xc9955f);
    for (let x = px + 20; x < px + w; x += 40)
      for (let y = py + 20; y < py + h; y += 40) g.circle(x, y, 5).fill(0x7a4e32);
    // A hopper at the top left to drop marbles in.
    g.poly([px + 10, py - 90, px + 150, py - 90, px + 100, py - 10, px + 60, py - 10])
      .fill(ARCADE.blue)
      .stroke(stroke(4));
    g.rect(px + 28, py - 80, 20, 60).fill({ color: 0xffffff, alpha: 0.35 });
  }
  // The claw machine's back: a jam jar with a gingham lid, a gantry for the claw, a chute.
  for (const f of area.fixtures ?? []) {
    if (f.kind !== 'jar_claw') continue;
    const cx = x0 + f.x * PPM;
    const half = ((f.w ?? 2.8) / 2) * PPM + 25;
    g.roundRect(cx - half, 340, half * 2, FLOOR_PX - 340, 40)
      .fill({ color: 0xdff4ff, alpha: 0.35 })
      .stroke(soft(4, 0.6));
    // The gantry rail above the lid.
    g.rect(cx - half - 20, 250, half * 2 + 40, 20)
      .fill(0x9aa3b5)
      .stroke(stroke(4));
    g.rect(cx - half - 10, 270, 16, 70)
      .fill(0x9aa3b5)
      .stroke(soft(3, 0.6));
    g.rect(cx + half - 6, 270, 16, 70)
      .fill(0x9aa3b5)
      .stroke(soft(3, 0.6));
    // The lid: red and white gingham.
    g.roundRect(cx - half - 10, 318, half * 2 + 20, 34, 10)
      .fill(0xffffff)
      .stroke(stroke(4));
    for (let x = cx - half; x < cx + half; x += 34)
      g.rect(x, 320, 17, 30).fill({ color: 0xe8453c, alpha: 0.75 });
    // The prize chute: a pipe down the right side to a tray.
    const chute = cx + half + 60;
    g.roundRect(chute - 36, 360, 72, FLOOR_PX - 400, 20)
      .fill(0x4fb6ff)
      .stroke(stroke(4));
    g.roundRect(chute - 60, FLOOR_PX - 44, 120, 44, 12)
      .fill(0x2d8ad0)
      .stroke(stroke(4));
    // The button panel.
    const bx = x0 + 26.2 * PPM;
    g.rect(bx - 12, 470, 24, FLOOR_PX - 470)
      .fill(0x9aa3b5)
      .stroke(soft(3, 0.55));
    g.roundRect(bx - 60, 400, 120, 90, 16)
      .fill(ARCADE.panel)
      .stroke(stroke(4));
  }
  // The leaf slide: a big curling leaf along the slide's path, with a little ladder up to its perch.
  for (const s of area.solids ?? []) {
    if (s.id !== 'solid_leaf_slide' || !s.chain) continue;
    const pts = s.chain.map(([x, y]) => [x0 + x * PPM, y * PPM] as const);
    const upper: number[] = [];
    const lower: number[] = [];
    for (const [x, y] of pts) {
      upper.push(x, y - 26);
      lower.unshift(x, y + 18);
    }
    g.poly([...upper, ...lower])
      .fill(0x7ccf4f)
      .stroke(stroke(5));
    g.moveTo(pts[0]![0], pts[0]![1] - 4);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y - 4);
    g.stroke({ width: 4, color: 0x4e9a3a, cap: 'round' });
    for (let k = 1; k < pts.length - 1; k++) {
      const [x, y] = pts[k]!;
      g.moveTo(x, y - 4)
        .lineTo(x + 18, y - 24)
        .stroke({ width: 2.5, color: 0x4e9a3a, cap: 'round' });
    }
    const lx = x0 + 31.3 * PPM;
    for (const rx of [lx - 30, lx + 30])
      g.moveTo(rx, FLOOR_PX).lineTo(rx, 320).stroke({ width: 10, color: 0x8b6a45, cap: 'round' });
    for (let y = FLOOR_PX - 40; y > 330; y -= 50)
      g.moveTo(lx - 30, y)
        .lineTo(lx + 30, y)
        .stroke({ width: 8, color: 0x8b6a45, cap: 'round' });
  }
  // Roof beams, and leaves hanging over the edges.
  const beams = new Graphics();
  beams
    .rect(wallX - 40, ceiling - 44, x1 - wallX + 60, 44)
    .fill(ARCADE.plankDark)
    .stroke(stroke(5));
  for (let x = wallX + 60; x < x1; x += 420)
    beams.rect(x, ceiling, 30, 30).fill(darken(ARCADE.plankDark, 0.15));
  for (let x = x0 - 60; x < x1 + 100; x += rng.range(70, 140)) {
    const y = rng.range(-10, 60);
    blob(
      beams,
      [
        [x, y, rng.range(40, 70)],
        [x + 50, y + 20, rng.range(30, 55)],
      ],
      rng.pick([ARCADE.canopy, 0x6fbf4a, 0x4e9a3a]),
      4,
      0.4,
    );
  }
  void terrain;
  c.addChild(g, beams);
  return c;
}

/** The window's frame and the view of the garden in it (the view gets weather drawn over it live). */
function drawWindow(g: Graphics, x: number, y: number): void {
  const w = 200;
  const h = 160;
  const sky = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0x8fd6f2 },
      { offset: 1, color: 0xe4f6ee },
    ],
    textureSpace: 'local',
  });
  g.roundRect(x - w / 2, y - h / 2, w, h, 20).fill(sky);
  // The whole garden, tiny: hills, the pond, the stump, the flowers.
  g.ellipse(x - 40, y + 50, 90, 40).fill(0x98d59a);
  g.ellipse(x + 60, y + 60, 80, 34).fill(0x86ca6a);
  g.ellipse(x - 20, y + 60, 40, 8).fill(0x5cc3e6);
  g.rect(x + 20, y + 30, 26, 22).fill(0xa8744f);
  g.ellipse(x + 33, y + 30, 13, 5).fill(0xe8c08e);
  for (const [dx, col] of [
    [-70, 0xf28ab2],
    [-56, 0xffd23f],
    [-84, 0x9b6bd6],
  ] as const)
    g.circle(x + dx, y + 36, 5).fill(col);
  g.circle(x + 70, y - 40, 14).fill(0xffd84d);
  g.roundRect(x - w / 2, y - h / 2, w, h, 20).stroke({ width: 18, color: 0xb56a2e });
  g.roundRect(x - w / 2, y - h / 2, w, h, 20).stroke(stroke(4));
  g.moveTo(x, y - h / 2)
    .lineTo(x, y + h / 2)
    .stroke({ width: 10, color: 0xb56a2e });
  g.moveTo(x - w / 2, y)
    .lineTo(x + w / 2, y)
    .stroke({ width: 10, color: 0xb56a2e });
  g.roundRect(x - w / 2 - 20, y + h / 2 + 4, w + 40, 18, 6)
    .fill(0xd98e4a)
    .stroke(soft(3, 0.6));
}

/**
 * Under the treehouse floor, in place of soil: the floor's planks, the
 * joists under it, branches, and the leafy canopy below.
 */
export function drawTreehouseUnder(area: AreaDef, terrain: Terrain, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  const x1 = area.xEnd * PPM;
  // Branches the house sits on, drawn first so the leaves cover them and they
  // only show through the gaps (drawn over the leaves, they read as a stray stroke).
  g.moveTo(x0 - 30, 900)
    .bezierCurveTo(x0 + 400, 820, x0 + 900, 860, x0 + 1400, 760)
    .stroke({ width: 60, color: 0x7a5238, cap: 'round' });
  g.moveTo(x0 + 2400, 1100)
    .bezierCurveTo(x0 + 2300, 900, x0 + 2600, 800, x0 + 3000, 740)
    .stroke({ width: 50, color: 0x7a5238, cap: 'round' });
  // The canopy below: leaves all the way down.
  for (let x = x0 - 40; x < x1 + 40; x += rng.range(60, 120))
    for (let y = 760; y < 1140; y += rng.range(80, 140))
      blob(
        g,
        [
          [x, y, rng.range(50, 80)],
          [x + 40, y + 30, rng.range(40, 60)],
        ],
        rng.pick([0x4e9a3a, 0x5faf3f, 0x3f8a35]),
        4,
        0.35,
      );
  // Joists under the floor.
  for (let x = x0 + 80; x < x1; x += 360)
    g.rect(x, FLOOR_PX + 40, 44, 70)
      .fill(ARCADE.plankDark)
      .stroke(soft(3, 0.5));
  // The floor itself: planks following the ground line, the bead pit dipping into it.
  const pts: number[] = [];
  for (let x = x0; x <= x1; x += 10) pts.push(x, terrain.surfaceY(x / PPM) * PPM);
  const lower: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) lower.push(pts[i]!, Math.max(pts[i + 1]! + 50, FLOOR_PX + 50));
  g.poly([...pts, ...lower]).fill(ARCADE.plankDark);
  for (let x = x0, i = 0; x < x1; i++) {
    const w = rng.range(160, 260);
    const y = terrain.surfaceY((x + w / 2) / PPM) * PPM;
    if (y > FLOOR_PX + 5) {
      x += w;
      continue;
    }
    plank(
      g,
      x,
      FLOOR_PX,
      Math.min(w, x1 - x),
      22,
      i % 2 ? lighten(ARCADE.plank, 0.1) : ARCADE.plank,
      ARCADE.plankDark,
      i + 3,
    );
    x += w + 2;
  }
  // The bead pit: a box sunk into the floor, painted in stripes inside.
  for (const f of area.fixtures ?? []) {
    if (f.kind !== 'bead_pit') continue;
    const w = (f.w ?? 4) * PPM;
    const px = x0 + f.x * PPM - w / 2;
    const inner: number[] = [];
    for (let x = px; x <= px + w; x += 10) inner.push(x, terrain.surfaceY(x / PPM) * PPM);
    g.poly([...inner, px + w, FLOOR_PX - 2, px, FLOOR_PX - 2]).fill(0x2d2b4a);
    for (let k = 0; k < 10; k++) {
      const sx = px + (k * w) / 10;
      g.poly([sx, FLOOR_PX, sx + w / 10, FLOOR_PX, sx + w / 10, FLOOR_PX + 26, sx, FLOOR_PX + 26]).fill(
        [ARCADE.pink, 0xffd23f, ARCADE.blue, 0x9b6bd6][k % 4]!,
      );
    }
  }
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.stroke(stroke(6));
  void OUTLINE;
  c.addChild(g);
  return c;
}
