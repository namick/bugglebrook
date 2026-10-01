import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import type { AreaDef } from '../../../../game/data/types';
import type { Terrain } from '../../../../game/world/terrain';
import { darken, lighten, stroke } from '../palette';
import { GROUND_PX, blade, parallaxX, soft } from './common';

const PPM = PIXELS_PER_METER;

/** The Compost Lab (game design doc, section 3): sludge greens, rot browns, potion glows. */
export const COMPOST = {
  sludge: 0x7fa33a,
  sludgeDark: 0x556b2f,
  rot: 0x6b4a2b,
  cyan: 0x4fe3e3,
  magenta: 0xe34fc6,
  lime: 0xb6ff3b,
  bark: 0x7a5238,
} as const;

/** The jars' potion colors, by jar, for their glass and their glow at night. */
export const JAR_COLORS: readonly number[] = [
  COMPOST.lime,
  COMPOST.magenta,
  COMPOST.cyan,
  COMPOST.cyan,
  COMPOST.lime,
  COMPOST.magenta,
  COMPOST.magenta,
  COMPOST.cyan,
  COMPOST.lime,
];

/**
 * Behind the walk line: the great tree whose house is the arcade, the
 * popsicle-stick shelves and their jars, and the bug scope over its dish.
 */
export function drawCompostBack(area: AreaDef, terrain: Terrain, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  // The treehouse tree: a huge trunk rising off the top of the screen.
  const tx = x0 + 2700;
  const bark = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: darken(COMPOST.bark, 0.2) },
      { offset: 0.45, color: lighten(COMPOST.bark, 0.1) },
      { offset: 1, color: darken(COMPOST.bark, 0.25) },
    ],
    textureSpace: 'local',
  });
  g.poly([
    tx - 170,
    GROUND_PX + 10,
    tx - 120,
    300,
    tx - 110,
    -20,
    tx + 330,
    -20,
    tx + 320,
    300,
    tx + 380,
    GROUND_PX + 10,
  ])
    .fill(bark)
    .stroke(soft(4, 0.55));
  for (let k = 0; k < 7; k++) {
    const gx = tx - 80 + k * 60;
    g.moveTo(gx, 0)
      .bezierCurveTo(gx - 10, 300, gx + 12, 600, gx - 4, GROUND_PX)
      .stroke({
        width: 5,
        color: darken(COMPOST.bark, 0.35),
        alpha: 0.5,
        cap: 'round',
      });
  }
  // The branch the lift's rope runs over.
  g.moveTo(tx - 120, 300)
    .bezierCurveTo(tx - 400, 250, tx - 700, 230, x0 + 2230, 250)
    .stroke({ width: 46, color: COMPOST.bark, cap: 'round' });
  g.moveTo(tx - 120, 300)
    .bezierCurveTo(tx - 400, 250, tx - 700, 230, x0 + 2230, 250)
    .stroke({ width: 3, color: 0x2b1d18, alpha: 0.4 });
  for (const [lx, ly] of [
    [x0 + 2300, 220],
    [x0 + 2520, 215],
  ] as const) {
    g.ellipse(lx, ly - 20, 30, 14)
      .fill(0x5faf3f)
      .stroke(soft(2, 0.5));
    g.ellipse(lx + 30, ly - 34, 24, 11)
      .fill(0x6fbf4a)
      .stroke(soft(2, 0.5));
  }
  // Shelves: popsicle sticks lashed to twig legs, exactly where things rest.
  for (const s of area.solids ?? []) {
    if (!s.id.startsWith('solid_shelf') || !s.box) continue;
    const [a, y0, b, y1] = s.box;
    g.roundRect(x0 + a * PPM - 6, y0 * PPM, (b - a) * PPM + 12, (y1 - y0) * PPM + 8, 5)
      .fill(0xf0d4a0)
      .stroke(soft(3, 0.6));
    for (let k = 0; k < 4; k++)
      g.moveTo(x0 + (a + 0.4 + k * 1.3) * PPM, y0 * PPM + 4)
        .lineTo(x0 + (a + 1.0 + k * 1.3) * PPM, y0 * PPM + 4)
        .stroke({ width: 2, color: 0xd1a86a, cap: 'round' });
  }
  for (const lx of [9.75, 14.45]) {
    g.moveTo(x0 + lx * PPM, GROUND_PX + 4)
      .lineTo(x0 + lx * PPM, 430)
      .stroke({ width: 12, color: 0x8b6a45, cap: 'round' });
    g.moveTo(x0 + lx * PPM, GROUND_PX + 4)
      .lineTo(x0 + lx * PPM, 430)
      .stroke(soft(2.5, 0.5));
  }
  // The jars, each behind its ingredient: glass with a little label and a cork.
  let i = 0;
  for (const f of area.fixtures ?? []) {
    if (f.kind !== 'shelf_jar') continue;
    const jx = x0 + f.x * PPM;
    const jy = f.y * PPM;
    const color = JAR_COLORS[i++ % JAR_COLORS.length]!;
    g.roundRect(jx - 36, jy - 96, 72, 94, 14)
      .fill({ color: 0xe8f7ff, alpha: 0.45 })
      .stroke(soft(3, 0.55));
    g.roundRect(jx - 30, jy - 50, 60, 46, 10).fill({ color, alpha: 0.55 });
    g.roundRect(jx - 26, jy - 112, 52, 20, 6)
      .fill(0xc9955f)
      .stroke(soft(2.5, 0.55));
    g.roundRect(jx - 22, jy - 82, 44, 22, 4)
      .fill(0xfff4dc)
      .stroke(soft(2, 0.4));
    g.roundRect(jx - 26, jy - 90, 8, 70, 4).fill({ color: 0xffffff, alpha: 0.35 });
  }
  // The bug scope: a magnifying glass on a tin can, over a mossy dish (it wakes up with the cauldron).
  const bx = x0 + 1880;
  g.roundRect(bx - 50, GROUND_PX - 170, 100, 170, 10)
    .fill(0xb8c4d6)
    .stroke(soft(3, 0.55));
  for (let y = GROUND_PX - 150; y < GROUND_PX; y += 30)
    g.moveTo(bx - 50, y)
      .lineTo(bx + 50, y)
      .stroke({ width: 3, color: 0x8e9bb0, alpha: 0.7 });
  g.moveTo(bx + 10, GROUND_PX - 170)
    .lineTo(bx + 90, GROUND_PX - 330)
    .stroke({ width: 14, color: 0x9a6a46, cap: 'round' });
  g.circle(bx + 120, GROUND_PX - 380, 70)
    .fill({ color: 0xdff4ff, alpha: 0.5 })
    .stroke({ width: 12, color: 0x3b3a4a });
  g.circle(bx + 96, GROUND_PX - 404, 22).fill({ color: 0xffffff, alpha: 0.5 });
  g.ellipse(bx + 230, GROUND_PX - 8, 110, 22)
    .fill(0xe8e2d0)
    .stroke(soft(3, 0.55));
  g.ellipse(bx + 230, GROUND_PX - 14, 86, 12).fill(0x6fbf4a);
  // Weeds and clover along the back.
  for (let x = x0 + 40; x < x0 + 2500; x += rng.range(70, 150)) {
    if (x > x0 + 150 && x < x0 + 900) continue;
    blade(
      g,
      x,
      GROUND_PX + 8,
      rng.range(80, 190),
      rng.range(26, 40),
      rng.range(-0.3, 0.3),
      rng.pick([0x6e9a3a, 0x7fa33a, 0x5f8a35]),
      3,
      0.4,
    );
  }
  void terrain;
  c.addChild(g);
  return c;
}

/** The warm compost heap, drawn over its hill: peels, leaves, eggshells, and steam holes. */
export function drawCompostOver(area: AreaDef, terrain: Terrain, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  const a = x0 + 160;
  const b = x0 + 880;
  const top: number[] = [];
  for (let x = a; x <= b; x += 12) top.push(x, terrain.surfaceY(x / PPM) * PPM);
  const heap = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0x8a6a3a },
      { offset: 1, color: COMPOST.rot },
    ],
    textureSpace: 'local',
  });
  g.poly([...top, b, GROUND_PX + 20, a, GROUND_PX + 20]).fill(heap);
  // Layers of rot, and bits poking out.
  for (let k = 0; k < 4; k++) {
    g.moveTo(a + 30, 880 - k * 22);
    for (let x = a + 30; x < b - 30; x += 40) g.lineTo(x, 880 - k * 22 + Math.sin(x / 50 + k) * 6);
    g.stroke({ width: 3, color: 0x4a321c, alpha: 0.3 });
  }
  for (let n = 0; n < 26; n++) {
    const x = rng.range(a + 60, b - 60);
    const surf = terrain.surfaceY(x / PPM) * PPM;
    const y = rng.range(surf + 14, GROUND_PX + 4);
    const kind = rng.int(0, 4);
    if (kind === 0) g.ellipse(x, y, 20, 8).fill(0xffe066).stroke(soft(2, 0.45));
    else if (kind === 1)
      g.poly([x - 14, y, x, y - 12, x + 14, y, x, y + 6])
        .fill(0xfff4e0)
        .stroke(soft(2, 0.45));
    else if (kind === 2) g.ellipse(x, y, 18, 7).fill(0x9ccc4a).stroke(soft(2, 0.45));
    else if (kind === 3) g.circle(x, y, 8).fill(0xe8453c).stroke(soft(2, 0.45));
    else g.ellipse(x, y, 12, 5).fill(0x3b2a26);
  }
  // A green, sludgy crust.
  const lower: number[] = [];
  for (let i = top.length - 2; i >= 0; i -= 2) lower.push(top[i]!, top[i + 1]! + 16);
  g.poly([...top, ...lower]).fill({ color: COMPOST.sludge, alpha: 0.85 });
  g.moveTo(top[0]!, top[1]!);
  for (let i = 2; i < top.length; i += 2) g.lineTo(top[i]!, top[i + 1]!);
  g.stroke(stroke(6));
  // Steam vents.
  for (const dx of [0.28, 0.52, 0.74]) {
    const x = a + (b - a) * dx;
    const y = terrain.surfaceY(x / PPM) * PPM + 10;
    g.ellipse(x, y, 16, 6).fill(0x3b2a1a);
  }
  c.addChild(g);
  return c;
}

/** A garden fence, compost bins, and tall weeds in the middle distance. */
export function drawCompostMid(area: AreaDef, factor: number, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const cx = parallaxX(((area.xStart + area.xEnd) / 2) * PPM, factor);
  const w = (area.xEnd - area.xStart) * PPM * factor + 1100;
  const ground = 905;
  // A weathered board fence.
  for (let x = cx - w / 2; x < cx + w / 2; x += 90)
    g.rect(x, ground - 330 + Math.sin(x) * 8, 84, 330)
      .fill(0xa08a6a)
      .stroke(soft(2.5, 0.3));
  // Slatted compost bins.
  for (const bx of [cx - 420, cx + 300]) {
    g.rect(bx, ground - 260, 360, 260)
      .fill(0x8a6a4a)
      .stroke(soft(3, 0.35));
    for (let y = ground - 250; y < ground; y += 40) g.rect(bx, y, 360, 24).fill(0x9a7a56);
    g.ellipse(bx + 180, ground - 262, 190, 30).fill(0x6b8a3a);
  }
  for (let x = cx - w / 2; x < cx + w / 2; x += rng.range(80, 170))
    blade(
      g,
      x,
      ground + 10,
      rng.range(160, 360),
      rng.range(30, 46),
      rng.range(-0.2, 0.2),
      rng.pick([0x7fa33a, 0x6e9a3a, 0x8fb04a]),
      3,
      0.35,
    );
  c.addChild(g);
  return c;
}
