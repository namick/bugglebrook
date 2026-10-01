import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import type { AreaDef } from '../../../../game/data/types';
import type { Terrain } from '../../../../game/world/terrain';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { GROUND_PX, blade, flower, parallaxX, soft } from './common';

const PPM = PIXELS_PER_METER;

/** The flowerbed's palette (game design doc, section 3): petal pinks, violets, yellows, terracotta. */
export const FLOWERBED = {
  pink: 0xf28ab2,
  violet: 0x9b6bd6,
  yellow: 0xffd23f,
  soil: 0x5a3b2b,
  terracotta: 0xd46b3e,
  stem: 0x5ea24a,
  leaf: 0x6fbf4a,
} as const;

/** The terrain between two world-pixel xs, as flat [x, y] pairs in pixels. */
function surface(terrain: Terrain, x0: number, x1: number, step = 12): number[] {
  const out: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += step) out.push(x, terrain.surfaceY(x / PPM) * PPM);
  return out;
}

/**
 * Things standing behind the walk line: a row of tall garden flowers and
 * leaves against the fence, and the stage's twig truss.
 */
export function drawFlowerbedBack(area: AreaDef, terrain: Terrain, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  // A low wooden edging board along the back of the bed.
  g.roundRect(x0 - 10, GROUND_PX - 170, (area.xEnd - area.xStart) * PPM + 20, 60, 10)
    .fill(0xb07a52)
    .stroke(soft(3, 0.45));
  for (let x = x0 + 60; x < area.xEnd * PPM; x += 240)
    g.roundRect(x, GROUND_PX - 190, 26, 110, 6)
      .fill(0x9a6a46)
      .stroke(soft(2.5, 0.45));
  // Big leaves and stalks behind everything.
  for (let x = x0 + 30; x < area.xEnd * PPM - 20; x += rng.range(60, 130)) {
    const h = rng.range(140, 320);
    blade(
      g,
      x,
      GROUND_PX + 10,
      h,
      rng.range(34, 56),
      rng.range(-0.25, 0.25),
      rng.pick([0x5aa845, 0x6fbf4a, 0x4e9a3a]),
      3,
      0.4,
    );
  }
  // Round shrubs dotted with tiny blossoms.
  for (let x = x0 + 120; x < area.xEnd * PPM; x += rng.range(420, 700)) {
    const r = rng.range(80, 130);
    const y = GROUND_PX - r * 0.55;
    g.circle(x, y, r).fill(0x4f9a44).stroke(soft(3, 0.4));
    g.circle(x - r * 0.35, y - r * 0.3, r * 0.5).fill({ color: 0x6fbf4a, alpha: 0.8 });
    for (let k = 0; k < 9; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.2, 0.85) * r;
      g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 6).fill(
        rng.pick([0xffffff, FLOWERBED.pink, FLOWERBED.yellow]),
      );
    }
  }
  // The stage's truss: two twig poles and a crossbar where the lights hang.
  const left = x0 + 1470;
  const right = x0 + 2270;
  for (const px of [left, right]) {
    g.moveTo(px, 760)
      .lineTo(px + (px === left ? 6 : -6), 240)
      .stroke({ width: 16, color: 0x8b6a45, cap: 'round' });
    g.moveTo(px, 760)
      .lineTo(px + (px === left ? 6 : -6), 240)
      .stroke(soft(3, 0.5));
    g.circle(px + (px === left ? 6 : -6), 300, 9).fill(0x6fae4a);
  }
  g.moveTo(left - 30, 250)
    .quadraticCurveTo((left + right) / 2, 236, right + 30, 250)
    .stroke({ width: 14, color: 0x8b6a45, cap: 'round' });
  g.moveTo(left - 30, 250)
    .quadraticCurveTo((left + right) / 2, 236, right + 30, 250)
    .stroke(soft(3, 0.5));
  // A little bunting of petals along the truss.
  for (let k = 0; k < 12; k++) {
    const t = (k + 0.5) / 12;
    const bx = left + (right - left) * t;
    const by = 252 + Math.sin(t * Math.PI) * -6 + 14;
    g.poly([bx - 16, by - 10, bx + 16, by - 10, bx, by + 18])
      .fill([FLOWERBED.pink, FLOWERBED.yellow, FLOWERBED.violet, 0x4fb6ff][k % 4]!)
      .stroke(soft(2, 0.5));
  }
  // The stage backdrop: a painted board with the Bugglebrook theme as dots (a hint for M9).
  const bx0 = x0 + 1600;
  const bw = 540;
  g.roundRect(bx0, 380, bw, 370, 18).fill(0xfbe6f0).stroke(soft(3.5, 0.5));
  g.roundRect(bx0 + 14, 394, bw - 28, 330, 12).fill({ color: 0xf6c9dc, alpha: 0.6 });
  const tune = [2, 4, 3, 5, 4, 2, 1, 3];
  tune.forEach((row, i) => {
    for (let r = 0; r < 6; r++)
      g.circle(bx0 + 70 + i * 57, 440 + r * 42, r === row ? 11 : 6).fill(
        r === row ? [FLOWERBED.violet, FLOWERBED.pink, FLOWERBED.yellow, 0x4fb6ff][i % 4]! : 0xe2a6c2,
      );
  });
  c.addChild(g);
  return c;
}

/**
 * Things shaped by the ground, drawn over it: the garden gnome lying on his
 * back (his belly is a hill), and the upturned flowerpot stage.
 */
export function drawFlowerbedOver(area: AreaDef, terrain: Terrain): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  drawGnome(g, terrain, x0);
  drawStage(g, terrain, x0);
  c.addChild(g);
  return c;
}

function drawGnome(g: Graphics, terrain: Terrain, x0: number): void {
  // His coat is the hill: follow the ground exactly so bugs walk on it.
  const a = x0 + 90;
  const b = x0 + 700;
  const top = surface(terrain, a, b, 10);
  const coat = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0x4d7cff },
      { offset: 1, color: 0x2f55c8 },
    ],
    textureSpace: 'local',
  });
  g.poly([...top, b, GROUND_PX + 14, a, GROUND_PX + 14]).fill(coat);
  // Belt and buckle across the belly.
  const bx = x0 + 430;
  const by = terrain.surfaceY(bx / PPM) * PPM;
  g.poly([bx - 26, by - 2, bx + 26, by - 4, bx + 34, GROUND_PX + 12, bx - 18, GROUND_PX + 12]).fill(0x3b2a26);
  g.roundRect(bx - 20, by + 18, 40, 34, 6)
    .fill(0xffd23f)
    .stroke(soft(3, 0.6));
  g.roundRect(bx - 10, by + 28, 20, 14, 3).fill(0x3b2a26);
  // Coat buttons and a pocket.
  for (const k of [0.36, 0.68]) {
    const px = a + (b - a) * k;
    g.circle(px, terrain.surfaceY(px / PPM) * PPM + 34, 9)
      .fill(0xffd23f)
      .stroke(soft(2, 0.6));
  }
  // Boots pointing at the sky.
  for (const [dx, h] of [
    [640, 120],
    [690, 100],
  ] as const) {
    const px = x0 + dx;
    const py = terrain.surfaceY(px / PPM) * PPM;
    g.roundRect(px - 24, py - h, 48, h + 10, 16)
      .fill(0x3b2a26)
      .stroke(stroke(5));
    g.roundRect(px - 30, py - h - 10, 60, 30, 14)
      .fill(0x2b1d18)
      .stroke(stroke(5));
  }
  // The outline along his coat, like the ground.
  g.moveTo(top[0]!, top[1]!);
  for (let i = 2; i < top.length; i += 2) g.lineTo(top[i]!, top[i + 1]!);
  g.stroke(stroke(6));
  // His head, face up, with a big beard spilling over his chest.
  const hx = x0 + 150;
  const hy = 800;
  g.circle(hx, hy, 72).fill(0xffc9a8).stroke(stroke(5));
  // The red cone hat, pointing left and flopping onto the grass.
  g.moveTo(hx - 40, hy - 56)
    .bezierCurveTo(hx - 120, hy - 70, hx - 160, hy + 10, hx - 150, hy + 90)
    .lineTo(hx - 110, hy + 96)
    .bezierCurveTo(hx - 110, hy + 20, hx - 60, hy + 10, hx - 50, hy + 50)
    .closePath()
    .fill(0xe8453c)
    .stroke(stroke(5));
  g.moveTo(hx - 70, hy - 50)
    .quadraticCurveTo(hx - 110, hy - 20, hx - 118, hy + 40)
    .stroke({
      width: 8,
      color: 0xff8a7a,
      alpha: 0.6,
      cap: 'round',
    });
  // Beard.
  const beard: [number, number, number][] = [
    [hx + 40, hy + 18, 38],
    [hx + 78, hy + 4, 34],
    [hx + 110, hy + 12, 30],
    [hx + 60, hy + 44, 32],
    [hx + 20, hy + 50, 28],
  ];
  for (const [x, y, r] of beard) g.circle(x, y, r + 3).fill(OUTLINE);
  for (const [x, y, r] of beard) g.circle(x, y, r - 2).fill(0xffffff);
  g.circle(hx + 70, hy - 4, 12).fill({ color: 0xe8eef7, alpha: 0.9 });
  // Rosy cheek, a snoozy closed eye, and a hole where his nose should be.
  g.circle(hx + 36, hy - 10, 14).fill({ color: 0xff8fab, alpha: 0.7 });
  g.moveTo(hx - 6, hy - 30)
    .quadraticCurveTo(hx + 8, hy - 22, hx + 22, hy - 30)
    .stroke(stroke(4));
  g.ellipse(hx + 26, hy - 60, 16, 12)
    .fill(0x5a3b2b)
    .stroke(soft(2.5, 0.7));
  g.ellipse(hx + 28, hy - 58, 9, 6).fill(0x2b1d18);
  // Eyebrow.
  g.moveTo(hx - 10, hy - 46)
    .quadraticCurveTo(hx + 8, hy - 54, hx + 24, hy - 46)
    .stroke({
      width: 8,
      color: 0xffffff,
      cap: 'round',
    });
}

function drawStage(g: Graphics, terrain: Terrain, x0: number): void {
  const a = x0 + 1400;
  const b = x0 + 2340;
  const top = surface(terrain, a, b, 10);
  const pot = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: darken(FLOWERBED.terracotta, 0.12) },
      { offset: 0.4, color: lighten(FLOWERBED.terracotta, 0.1) },
      { offset: 1, color: darken(FLOWERBED.terracotta, 0.2) },
    ],
    textureSpace: 'local',
  });
  g.poly([...top, b, GROUND_PX + 16, a, GROUND_PX + 16]).fill(pot);
  // The pot's rim at the bottom (it is upside down), a little wider.
  g.roundRect(a - 22, GROUND_PX - 44, b - a + 44, 58, 14)
    .fill(darken(FLOWERBED.terracotta, 0.06))
    .stroke(stroke(5));
  g.roundRect(a - 10, GROUND_PX - 38, b - a + 20, 12, 6).fill({ color: 0xffffff, alpha: 0.18 });
  // Painted stars and a band, and chips.
  g.rect(a + 150, 800, b - a - 300, 12).fill({ color: 0xffd23f, alpha: 0.7 });
  for (let k = 0; k < 5; k++) {
    const sx = a + 260 + k * 110;
    g.star(sx, 780 + (k % 2) * 16, 5, 16, 7).fill({ color: 0xfff1c9, alpha: 0.8 });
  }
  g.poly([a + 120, 860, a + 150, 842, a + 170, 862]).fill({ color: 0x7a3a26, alpha: 0.45 });
  // The stage floor on top: the pot's base, seen from just above.
  const sx0 = x0 + 1545;
  const sx1 = x0 + 2195;
  g.ellipse((sx0 + sx1) / 2, 742, (sx1 - sx0) / 2 + 6, 22)
    .fill(lighten(FLOWERBED.terracotta, 0.18))
    .stroke(stroke(5));
  g.ellipse((sx0 + sx1) / 2, 742, 34, 9).fill(darken(FLOWERBED.terracotta, 0.35));
  // Outline along the sides.
  g.moveTo(top[0]!, top[1]!);
  for (let i = 2; i < top.length; i += 2) g.lineTo(top[i]!, top[i + 1]!);
  g.stroke(stroke(6));
}

/** Giant garden flowers and a picket fence in the middle distance. */
export function drawFlowerbedMid(area: AreaDef, factor: number, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const cx = parallaxX(((area.xStart + area.xEnd) / 2) * PPM, factor);
  const w = (area.xEnd - area.xStart) * PPM * factor + 1100;
  const ground = 905;
  // A white picket fence.
  for (let x = cx - w / 2; x < cx + w / 2; x += 70) {
    g.poly([x, ground, x, ground - 250, x + 22, ground - 280, x + 44, ground - 250, x + 44, ground])
      .fill(0xfaf3ea)
      .stroke(soft(2.5, 0.35));
  }
  g.rect(cx - w / 2, ground - 210, w, 18).fill(0xf0e6da);
  g.rect(cx - w / 2, ground - 110, w, 18).fill(0xf0e6da);
  // Towering flowers.
  for (let x = cx - w / 2 + 60; x < cx + w / 2; x += rng.range(110, 220)) {
    const top = ground - rng.range(330, 560);
    const lean = rng.range(-30, 30);
    g.moveTo(x, ground)
      .quadraticCurveTo(x + lean, (ground + top) / 2, x + lean * 0.6, top)
      .stroke({
        width: 12,
        color: FLOWERBED.stem,
        cap: 'round',
      });
    g.ellipse(x + lean * 0.4 + 26, (ground + top) / 2, 34, 14)
      .fill(FLOWERBED.leaf)
      .stroke(soft(2, 0.35));
    const color = rng.pick([FLOWERBED.pink, FLOWERBED.violet, FLOWERBED.yellow, 0xff8a5c, 0xffffff]);
    const center = color === FLOWERBED.yellow ? 0x8a5a2b : 0xffd23f;
    flower(g, x + lean * 0.6, top, rng.range(40, 70), rng.int(5, 8), color, center, 3, 0.4, rng.range(0, 1));
  }
  c.addChild(g);
  return c;
}
