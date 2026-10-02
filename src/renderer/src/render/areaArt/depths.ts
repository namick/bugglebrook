import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_HEIGHT_PX } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import { DEPTHS_CEILING, DEPTHS_LEVELS, SEAL } from '../../../../game/data/hiddenAreas';
import type { AreaDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { soft } from './common';

const PPM = PIXELS_PER_METER;

/** The Ant Hill Depths' palette (game design doc, section 3, area 7). */
export const ANTS = {
  earth: 0x8b5a3c,
  tunnel: 0x4a2e1f,
  amber: 0xffb347,
  ant: 0x7a1f1f,
  antDark: 0x4e1212,
  crumb: 0xe0b070,
  egg: 0xfff6e6,
  thimble: 0xc9ced6,
  root: 0x6b4a33,
} as const;

/** A hollow in the soil, area-local meters: x0, y0 (top), x1, y1 (floor), and how round its corners are. */
export interface Hollow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

const L = DEPTHS_LEVELS;
/** The tunnels and chambers, area-local x and world y (m). The solids in the area's data are what is left. */
export const DEPTHS_HOLLOWS: readonly Hollow[] = [
  // The entrance shaft, from the plaza down to the top tunnel.
  { x0: 3.2, y0: 0.15, x1: 4.8, y1: L.top, r: 0.5 },
  // The top tunnel (the nursery is up here), and its dead-end stub past the throne room.
  { x0: SEAL, y0: DEPTHS_CEILING, x1: 16.6, y1: L.top, r: 0.7 },
  { x0: 21.4, y0: DEPTHS_CEILING, x1: 25.6, y1: L.top, r: 0.7 },
  // The middle tunnel, with the ant line.
  { x0: SEAL, y0: 4.3, x1: 25.6, y1: L.middle, r: 0.6 },
  // The bottom tunnel, out to the root's dead end.
  { x0: SEAL, y0: 7, x1: 25.6, y1: L.bottom + 0.2, r: 0.6 },
  // The pantry, two levels tall.
  { x0: 5.6, y0: 4.3, x1: 9.4, y1: 9.3, r: 0.9 },
  // The throne room, three levels tall.
  { x0: 16.5, y0: DEPTHS_CEILING, x1: 21.5, y1: 9.3, r: 1.4 },
];

/** Where the amber lamps hang (area-local x, world y of the bulb). */
export const DEPTHS_LAMPS: readonly (readonly [number, number])[] = [
  [2.1, 1.55],
  [7.4, 4.85],
  [9.8, 1.55],
  [12.9, 4.85],
  [17.3, 2.4],
  [20.7, 2.4],
  [19, 1.5],
  [23.3, 1.55],
  [2.4, 7.5],
  [11.9, 7.5],
  [15.2, 7.5],
  [24.6, 4.85],
];

/** The larvae's side pockets in the nursery (area-local x, world y of the middle), matching `fix_larva_*`. */
export const LARVA_POCKETS: readonly (readonly [number, number])[] = [
  [11.1, 2.85],
  [13, 1.75],
  [14.9, 2.85],
];

/** The pantry's pile, area-local: its middle and how wide and tall it is (m). */
export const PANTRY_PILE = { x: 7.4, w: 3, h: 1.05 } as const;

/**
 * The depths' static art, in the near layer: an opaque cross-section of the
 * soil that hides the sky, with the tunnels carved into it, their floors,
 * roots, pebbles, the pantry's shelves, the nursery's eggs, the throne
 * room's rug and banners, and the lamps' hooks. What moves is `DepthsLive`.
 */
export function drawDepthsBackdrop(area: AreaDef, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  const w = (area.xEnd - area.xStart) * PPM;
  const px = (m: number): number => x0 + m * PPM;
  // Solid soil, darker as it goes down.
  const soil = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: lighten(ANTS.earth, 0.08) },
      { offset: 0.55, color: ANTS.earth },
      { offset: 1, color: darken(ANTS.earth, 0.22) },
    ],
    textureSpace: 'local',
  });
  g.rect(x0 - 2, -40, w + 4, VIEW_HEIGHT_PX + 80).fill(soil);
  // Strata: wavy bands of lighter and darker earth.
  for (let i = 0; i < 9; i++) {
    const y0 = 60 + i * 115 + rng.range(-20, 20);
    g.moveTo(x0, y0);
    for (let x = 0; x <= w; x += 50) g.lineTo(x0 + x, y0 + Math.sin(x / 210 + i * 1.7) * 14);
    g.stroke({
      width: rng.range(8, 18),
      color: i % 2 ? darken(ANTS.earth, 0.1) : lighten(ANTS.earth, 0.06),
      alpha: 0.35,
    });
  }
  // Pebbles and grit in the soil.
  for (let i = 0; i < 150; i++) {
    const x = px(rng.range(0.6, 25.6));
    const y = rng.range(-10, VIEW_HEIGHT_PX + 10);
    const r = rng.range(3, 12);
    const tint = rng.pick([0xc9b8a6, 0xb5a79c, 0xd6c3a5, 0x9e8a7a, 0xa0705a]);
    g.ellipse(x, y, r * 1.3, r)
      .fill(mix(tint, ANTS.earth, 0.35))
      .stroke(soft(2, 0.35));
  }
  // The grass and the plaza's topsoil at the very top, with roots reaching down.
  g.rect(x0, -40, w, 52).fill(darken(0x4e9a3a, 0.2));
  for (let x = x0; x < x0 + w; x += 26) g.circle(x + rng.range(-6, 6), 12, rng.range(9, 15)).fill(0x4e9a3a);
  for (let i = 0; i < 26; i++) {
    const x = px(rng.range(0.8, 25.4));
    const len = rng.range(40, 120);
    g.moveTo(x, 10)
      .bezierCurveTo(
        x + rng.range(-20, 20),
        10 + len * 0.4,
        x + rng.range(-30, 30),
        10 + len * 0.8,
        x + rng.range(-20, 20),
        10 + len,
      )
      .stroke({ width: rng.range(3, 6), color: ANTS.root, alpha: 0.7, cap: 'round' });
  }

  // The tunnels: dark hollows with a soft, crumbly rim.
  for (const h of DEPTHS_HOLLOWS) {
    const hx = px(h.x0);
    const hy = h.y0 * PPM;
    const hw = (h.x1 - h.x0) * PPM;
    const hh = (h.y1 - h.y0) * PPM;
    g.roundRect(hx - 10, hy - 10, hw + 20, hh + 20, h.r * PPM + 10).fill({
      color: darken(ANTS.earth, 0.3),
      alpha: 0.55,
    });
  }
  const dark = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: darken(ANTS.tunnel, 0.12) },
      { offset: 1, color: lighten(ANTS.tunnel, 0.1) },
    ],
    textureSpace: 'local',
  });
  for (const h of DEPTHS_HOLLOWS)
    g.roundRect(px(h.x0), h.y0 * PPM, (h.x1 - h.x0) * PPM, (h.y1 - h.y0) * PPM, h.r * PPM).fill(dark);
  // Crumbly specks along the tunnel walls.
  for (let i = 0; i < 220; i++) {
    const h = DEPTHS_HOLLOWS[i % DEPTHS_HOLLOWS.length]!;
    const top = rng.chance(0.5);
    const x = px(rng.range(h.x0 + 0.2, h.x1 - 0.2));
    const y = (top ? h.y0 : h.y1) * PPM + (top ? rng.range(2, 14) : -rng.range(2, 6));
    g.circle(x, y, rng.range(2, 5)).fill({ color: lighten(ANTS.tunnel, 0.25), alpha: 0.5 });
  }
  // Packed-earth floors on each level, where feet have worn them smooth.
  const floor = (a: number, b: number, y: number): void => {
    g.roundRect(px(a), y * PPM - 6, (b - a) * PPM, 22, 10)
      .fill(lighten(ANTS.earth, 0.12))
      .stroke(soft(3, 0.5));
    for (let x = a + 0.3; x < b - 0.2; x += rng.range(0.4, 0.9))
      g.circle(px(x), y * PPM + 4, rng.range(2, 4)).fill({ color: darken(ANTS.earth, 0.2), alpha: 0.6 });
  };
  floor(SEAL, 16.5, L.top);
  floor(21.5, 25.6, L.top);
  floor(SEAL, 5.6, L.middle);
  floor(9.4, 16.5, L.middle);
  floor(21.5, 25.6, L.middle);
  // The bottom floor follows the terrain's dips loosely.
  g.rect(px(SEAL), L.bottom * PPM - 4, (25.6 - SEAL) * PPM, VIEW_HEIGHT_PX - L.bottom * PPM + 30).fill(
    lighten(ANTS.earth, 0.05),
  );
  g.moveTo(px(SEAL), L.bottom * PPM)
    .lineTo(px(25.6), L.bottom * PPM)
    .stroke(stroke(5));
  // Root tendrils poking through tunnel ceilings.
  for (const [x, y] of [
    [1.6, 1],
    [6.2, 4.3],
    [10.4, 1],
    [14.1, 4.3],
    [22.8, 1],
    [3.1, 7],
    [10.2, 7],
    [22.3, 4.3],
  ] as const) {
    const sx = px(x);
    const sy = y * PPM;
    g.moveTo(sx, sy - 4)
      .bezierCurveTo(sx + 10, sy + 30, sx - 14, sy + 50, sx + 6, sy + 80)
      .stroke({ width: 7, color: ANTS.root, cap: 'round' });
    g.moveTo(sx + 2, sy + 30)
      .quadraticCurveTo(sx + 26, sy + 40, sx + 30, sy + 64)
      .stroke({ width: 4, color: ANTS.root, cap: 'round' });
  }

  // The entrance shaft: a rope ladder of grass stems, and the light that comes down it.
  {
    const sx = px(4);
    for (const dx of [-30, 30])
      g.moveTo(sx + dx, 20)
        .lineTo(sx + dx, L.top * PPM - 10)
        .stroke({ width: 4, color: 0x8fbf4a, alpha: 0.8 });
    for (let y = 70; y < L.top * PPM - 20; y += 44)
      g.moveTo(sx - 30, y)
        .lineTo(sx + 30, y + 4)
        .stroke({ width: 4, color: 0x7aa83c, alpha: 0.8, cap: 'round' });
  }

  // The pantry: shelves cut in the walls, jars of honey, seeds in rows.
  {
    const a = 5.8;
    for (const [y, n] of [
      [5.3, 5],
      [6.6, 4],
    ] as const) {
      g.roundRect(px(a), y * PPM, 1.1 * PPM, 14, 5)
        .fill(darken(ANTS.earth, 0.05))
        .stroke(soft(2.5, 0.6));
      for (let i = 0; i < n; i++)
        g.ellipse(px(a + 0.15 + i * 0.2), y * PPM - 9, 8, 10)
          .fill(rng.pick([0xe6c27a, 0xc98a3a, 0xf2dfb0, 0x9b6a3a]))
          .stroke(soft(2, 0.6));
    }
    const b = 8.2;
    g.roundRect(px(b), 5.6 * PPM, 1.05 * PPM, 14, 5)
      .fill(darken(ANTS.earth, 0.05))
      .stroke(soft(2.5, 0.6));
    for (const dx of [0.2, 0.55, 0.85]) {
      const jx = px(b + dx);
      g.roundRect(jx - 13, 5.6 * PPM - 34, 26, 34, 8)
        .fill({ color: 0xffb347, alpha: 0.85 })
        .stroke(stroke(3));
      g.roundRect(jx - 14, 5.6 * PPM - 40, 28, 9, 3)
        .fill(0xd9a05a)
        .stroke(stroke(2.5));
    }
  }

  // The nursery: a nest of white bean eggs on the top floor, and the larvae's pockets.
  {
    for (let i = 0; i < 9; i++) {
      const ex = px(11.8 + (i % 5) * 0.55 + (i >= 5 ? 0.27 : 0));
      const ey = L.top * PPM - 18 - (i >= 5 ? 26 : 0);
      g.ellipse(ex, ey, 20, 13).fill(ANTS.egg).stroke(stroke(3));
      g.ellipse(ex - 6, ey - 5, 7, 3).fill({ color: 0xffffff, alpha: 0.9 });
    }
    // A bed of leaf litter under the eggs.
    g.ellipse(px(13.05), L.top * PPM - 4, 1.7 * PPM, 18).fill({ color: 0x6b8f3a, alpha: 0.55 });
    for (const [x, y] of LARVA_POCKETS) {
      g.ellipse(px(x), y * PPM, 50, 34)
        .fill(darken(ANTS.tunnel, 0.25))
        .stroke(soft(3, 0.6));
      g.ellipse(px(x), y * PPM + 16, 40, 12).fill({ color: 0xb08a5a, alpha: 0.7 });
    }
  }

  // The throne room: banners of leaves, a long rug, and a bottle-cap sun on the wall.
  {
    for (const [x, color] of [
      [17.4, 0xd23c3c],
      [20.6, 0xd23c3c],
    ] as const) {
      const bx = px(x);
      g.moveTo(bx - 34, 1.05 * PPM)
        .lineTo(bx + 34, 1.05 * PPM)
        .lineTo(bx + 34, 3.6 * PPM)
        .lineTo(bx, 3.3 * PPM)
        .lineTo(bx - 34, 3.6 * PPM)
        .closePath()
        .fill(color)
        .stroke(stroke(4));
      // A crown pictogram in gold.
      g.moveTo(bx - 18, 2.4 * PPM)
        .lineTo(bx - 18, 2.0 * PPM)
        .lineTo(bx - 8, 2.2 * PPM)
        .lineTo(bx, 1.9 * PPM)
        .lineTo(bx + 8, 2.2 * PPM)
        .lineTo(bx + 18, 2.0 * PPM)
        .lineTo(bx + 18, 2.4 * PPM)
        .closePath()
        .fill(0xf2c14e)
        .stroke(soft(2, 0.7));
    }
    // The rug, up the floor to the throne.
    g.roundRect(px(16.9), 9.04 * PPM, 4.2 * PPM, 18, 6)
      .fill(0xb23a5c)
      .stroke(soft(3, 0.6));
    for (let x = 17.1; x < 21; x += 0.35) g.circle(px(x), 9.04 * PPM + 9, 4).fill(0xf2c14e);
    // A bottle cap hung up high like a sun, with crimped edges.
    const cx = px(19);
    const cy = 3.2 * PPM;
    for (let i = 0; i < 21; i++) {
      const a = (i / 21) * Math.PI * 2;
      g.circle(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62, 10).fill(0xe8453c);
    }
    g.circle(cx, cy, 62).fill(0xe8453c).stroke(stroke(4));
    g.circle(cx, cy, 44).fill(lighten(0xe8453c, 0.2));
    g.circle(cx - 14, cy - 16, 12).fill({ color: 0xffffff, alpha: 0.5 });
  }

  // The thimble throne (matches `solid_ant_throne`).
  {
    const tx0 = px(18.45);
    const tx1 = px(19.55);
    const ty = 8.15 * PPM;
    const metal = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: darken(ANTS.thimble, 0.2) },
        { offset: 0.35, color: lighten(ANTS.thimble, 0.35) },
        { offset: 1, color: darken(ANTS.thimble, 0.25) },
      ],
      textureSpace: 'local',
    });
    g.moveTo(tx0 + 8, ty)
      .lineTo(tx1 - 8, ty)
      .lineTo(tx1, 9.15 * PPM)
      .lineTo(tx0, 9.15 * PPM)
      .closePath()
      .fill(metal)
      .stroke(stroke(5));
    g.ellipse((tx0 + tx1) / 2, ty, (tx1 - tx0) / 2 - 8, 10)
      .fill(lighten(ANTS.thimble, 0.2))
      .stroke(stroke(4));
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 6; i++)
        g.circle(tx0 + 20 + i * 15 + (r % 2) * 7, ty + 26 + r * 20, 3.5).fill(darken(ANTS.thimble, 0.35));
  }

  // The dead end past the root: a little nook.
  g.ellipse(px(24.8), 8.6 * PPM, 60, 30).fill({ color: darken(ANTS.tunnel, 0.3), alpha: 0.8 });

  // The lamps' hooks and cords (the warm glow is live).
  for (const [x, y] of DEPTHS_LAMPS) {
    const lx = px(x);
    const top = ceilingAbove(x, y) * PPM;
    g.moveTo(lx, top)
      .lineTo(lx, y * PPM - 16)
      .stroke({ width: 3, color: OUTLINE, alpha: 0.7 });
  }
  // The sealing wall on the left: packed clay.
  g.rect(x0 - 2, -40, SEAL * PPM + 2, VIEW_HEIGHT_PX + 80).fill(darken(ANTS.earth, 0.12));
  g.moveTo(px(SEAL), 0).lineTo(px(SEAL), VIEW_HEIGHT_PX).stroke(soft(4, 0.5));
  c.addChild(g);
  return c;
}

/** The tunnel ceiling over a lamp at (x, y), world m. */
function ceilingAbove(x: number, y: number): number {
  let top = DEPTHS_CEILING;
  for (const h of DEPTHS_HOLLOWS)
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) top = Math.max(top, h.y0);
  return top;
}
