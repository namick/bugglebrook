import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_HEIGHT_PX } from '../../../../game/constants';
import type { Rng } from '../../../../game/core/rng';
import { HOLLOW_CEILING, SEAL } from '../../../../game/data/hiddenAreas';
import type { AreaDef } from '../../../../game/data/types';
import { darken, lighten, mix, stroke } from '../palette';
import { soft } from './common';

const PPM = PIXELS_PER_METER;

/** Gnome Hollow's palette (game design doc, section 3, area 8). */
export const HOLLOW_COLORS = {
  night: 0x1b2350,
  gold: 0xf2c14e,
  ceramic: 0xf4efe6,
  wood: 0xb5773e,
  woodDark: 0x7e4f2a,
  rug: 0xc94f6d,
  brass: 0xd9a441,
} as const;

/** The stair's steps (area-local x0, x1, and the top's world y), matching the `solid_stair_*` boxes. */
export const STAIR_STEPS: readonly (readonly [number, number, number])[] = [
  [15.4, 17.6, 7.7],
  [12.9, 15.1, 6.4],
  [15.4, 17.6, 5.1],
  [12.9, 15.1, 3.8],
  [15.2, 18.4, 2.7],
];

/** The two lost-toy shelves (area-local x0, x1, and the top's world y). */
export const LOST_SHELVES: readonly (readonly [number, number, number])[] = [
  [2.2, 6.6, 4.4],
  [2.2, 6.6, 6.1],
];

/** A five-pointed star, flat. */
export function starPath(g: Graphics, x: number, y: number, r: number, turn = 0): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = turn - Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  return g.poly(pts);
}

/**
 * Gnome Hollow's static art: the inside of the ceramic gnome, his head a
 * dome painted night blue with gold stars, a floor of planks and a round
 * rug, the spiral stair up into the hat, the lost-toy shelves, the moon
 * pedestal, a little round door, and the cosy things of whoever lives here
 * (an armchair, a teacup, slippers). The telescope, the stars' twinkle, the
 * shelf's pictures, and the door's glow are live (`HollowLive`).
 */
export function drawHollowBackdrop(area: AreaDef, rng: Rng): Container {
  const c = new Container();
  const g = new Graphics();
  const x0 = area.xStart * PPM;
  const w = (area.xEnd - area.xStart) * PPM;
  const px = (m: number): number => x0 + m * PPM;
  const floorY = 9 * PPM;
  // The ceramic shell: cream walls, glazed, with the blue of his coat showing at the bottom.
  const wall = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: HOLLOW_COLORS.ceramic },
      { offset: 1, color: mix(HOLLOW_COLORS.ceramic, 0xe8c9a0, 0.5) },
    ],
    textureSpace: 'local',
  });
  g.rect(x0 - 2, -40, w + 4, VIEW_HEIGHT_PX + 80).fill(wall);
  // The painted night: a dome that curves down to the walls.
  const domeY = 4.6 * PPM;
  g.moveTo(px(SEAL), domeY)
    .bezierCurveTo(px(3), HOLLOW_CEILING * PPM - 40, px(16), HOLLOW_CEILING * PPM - 40, px(19.2), domeY)
    .lineTo(px(19.2), -40)
    .lineTo(px(SEAL), -40)
    .closePath()
    .fill(HOLLOW_COLORS.night);
  // A wavy gold line where the paint meets the glaze.
  g.moveTo(px(SEAL), domeY);
  for (let x = SEAL; x <= 19.2; x += 0.2) {
    const t = (x - SEAL) / (19.2 - SEAL);
    const y = domeY - Math.sin(t * Math.PI) * (domeY - HOLLOW_CEILING * PPM + 30) + Math.sin(x * 5) * 5;
    g.lineTo(px(x), y);
  }
  g.stroke({ width: 7, color: HOLLOW_COLORS.gold, cap: 'round' });
  // Painted stars, big and small, and a painted crescent moon.
  for (let i = 0; i < 70; i++) {
    const sx = rng.range(SEAL + 0.4, 19);
    const t = (sx - SEAL) / (19.2 - SEAL);
    const bottom = domeY - Math.sin(t * Math.PI) * (domeY - HOLLOW_CEILING * PPM + 30) - 30;
    const sy = rng.range(HOLLOW_CEILING * PPM + 20, Math.max(HOLLOW_CEILING * PPM + 30, bottom));
    const r = rng.chance(0.18) ? rng.range(12, 18) : rng.range(4, 9);
    starPath(g, px(sx), sy, r, rng.range(-0.3, 0.3)).fill({
      color: HOLLOW_COLORS.gold,
      alpha: rng.range(0.6, 1),
    });
  }
  {
    const mx = px(4.2);
    const my = 2.1 * PPM;
    g.circle(mx, my, 54).fill(HOLLOW_COLORS.gold);
    g.circle(mx + 22, my - 12, 46).fill(HOLLOW_COLORS.night);
  }
  // Glaze highlights on the cream walls.
  for (const [x, y, h] of [
    [1.4, 5.4, 2.2],
    [8, 5.6, 1.4],
    [18.3, 5.2, 2.6],
  ] as const)
    g.roundRect(px(x), y * PPM, 16, h * PPM, 8).fill({ color: 0xffffff, alpha: 0.4 });
  // The plank floor.
  const plank = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: HOLLOW_COLORS.wood },
      { offset: 1, color: HOLLOW_COLORS.woodDark },
    ],
    textureSpace: 'local',
  });
  g.rect(px(SEAL), floorY, (19.2 - SEAL) * PPM, VIEW_HEIGHT_PX - floorY + 40).fill(plank);
  for (let x = SEAL + 0.9; x < 19.2; x += rng.range(0.9, 1.4))
    g.moveTo(px(x), floorY + 4)
      .lineTo(px(x) - 14, VIEW_HEIGHT_PX)
      .stroke({ width: 3, color: HOLLOW_COLORS.woodDark, alpha: 0.6 });
  g.moveTo(px(SEAL), floorY).lineTo(px(19.2), floorY).stroke(stroke(5));
  // A round rug under the pedestal, with a star in the middle.
  g.ellipse(px(9.6), floorY + 14, 2.6 * PPM, 26)
    .fill(HOLLOW_COLORS.rug)
    .stroke(stroke(4));
  g.ellipse(px(9.6), floorY + 14, 2.1 * PPM, 18).stroke({ width: 4, color: HOLLOW_COLORS.gold, alpha: 0.9 });

  // The spiral stair: a pole, the steps, and a rope rail.
  {
    const pole = px(15.25);
    g.roundRect(pole - 12, 2.5 * PPM, 24, floorY - 2.5 * PPM, 8)
      .fill(HOLLOW_COLORS.woodDark)
      .stroke(stroke(4));
    for (const [a, b, y] of STAIR_STEPS) {
      g.roundRect(px(a), y * PPM, (b - a) * PPM, 16, 6)
        .fill(HOLLOW_COLORS.wood)
        .stroke(stroke(4));
      g.moveTo(px(a) + 12, y * PPM + 16)
        .lineTo(px(a) + 12, y * PPM + 36)
        .stroke({ width: 5, color: HOLLOW_COLORS.woodDark });
    }
    g.moveTo(px(17.4), 7.2 * PPM)
      .bezierCurveTo(px(15.5), 6.8 * PPM, px(13.2), 6.4 * PPM, px(13.1), 5.9 * PPM)
      .bezierCurveTo(px(13.6), 5.2 * PPM, px(17.4), 5.2 * PPM, px(17.4), 4.6 * PPM)
      .bezierCurveTo(px(16.4), 4.0 * PPM, px(13.4), 3.8 * PPM, px(13.1), 3.3 * PPM)
      .stroke({ width: 5, color: 0xe8d3a8, alpha: 0.9, cap: 'round' });
  }

  // The lost-toy museum: two shelves on brackets, with a little gold label plate.
  for (const [a, b, y] of LOST_SHELVES) {
    g.roundRect(px(a), y * PPM, (b - a) * PPM, 16, 4)
      .fill(HOLLOW_COLORS.wood)
      .stroke(stroke(4));
    for (const bx of [a + 0.3, b - 0.3]) {
      g.moveTo(px(bx), y * PPM + 16)
        .lineTo(px(bx), y * PPM + 56)
        .lineTo(px(bx) + 30, y * PPM + 16)
        .stroke({ width: 5, color: HOLLOW_COLORS.woodDark, join: 'round' });
    }
    g.roundRect(px((a + b) / 2) - 40, y * PPM + 20, 80, 18, 5)
      .fill(HOLLOW_COLORS.brass)
      .stroke(soft(2, 0.6));
    starPath(g, px((a + b) / 2), y * PPM + 29, 7).fill(lighten(HOLLOW_COLORS.brass, 0.4));
  }

  // The moon pedestal: a fluted stone column with a crescent cup on top.
  {
    const cx = px(9.6);
    const top = 7.45 * PPM;
    g.roundRect(cx - 50, floorY - 26, 100, 30, 8)
      .fill(0xd9d2c4)
      .stroke(stroke(4));
    g.rect(cx - 36, top, 72, floorY - 26 - top)
      .fill(0xe9e3d6)
      .stroke(stroke(4));
    for (const dx of [-18, 0, 18])
      g.moveTo(cx + dx, top + 10)
        .lineTo(cx + dx, floorY - 34)
        .stroke({ width: 3, color: 0xc9c0ae });
    g.roundRect(cx - 46, top - 8, 92, 16, 6)
      .fill(0xd9d2c4)
      .stroke(stroke(4));
    // The crescent cup.
    g.moveTo(cx - 44, top - 8)
      .bezierCurveTo(cx - 48, top - 60, cx - 10, top - 64, cx - 18, top - 40)
      .bezierCurveTo(cx - 26, top - 20, cx + 26, top - 20, cx + 18, top - 40)
      .bezierCurveTo(cx + 10, top - 64, cx + 48, top - 60, cx + 44, top - 8)
      .closePath()
      .fill(HOLLOW_COLORS.gold)
      .stroke(stroke(4));
  }

  // The round door (it leads out through the hat).
  {
    const dx = px(1.5);
    const dy = floorY;
    g.moveTo(dx - 62, dy)
      .lineTo(dx - 62, dy - 90)
      .arc(dx, dy - 90, 62, Math.PI, 0)
      .lineTo(dx + 62, dy)
      .closePath();
    g.fill(HOLLOW_COLORS.woodDark).stroke(stroke(5));
    for (const ox of [-30, 0, 30])
      g.moveTo(dx + ox, dy - 4)
        .lineTo(dx + ox, dy - 140 + Math.abs(ox) * 0.6)
        .stroke({ width: 3, color: darken(HOLLOW_COLORS.woodDark, 0.3) });
    g.circle(dx + 38, dy - 70, 8)
      .fill(HOLLOW_COLORS.brass)
      .stroke(soft(2, 0.7));
  }

  // Someone lives here: a tiny armchair, a lamp, a teacup on a spool, and slippers.
  {
    const ax = px(11.9);
    const ay = floorY;
    g.roundRect(ax - 70, ay - 70, 140, 50, 16)
      .fill(0x6f8fd8)
      .stroke(stroke(4));
    g.roundRect(ax - 60, ay - 140, 120, 80, 22)
      .fill(0x5a78c4)
      .stroke(stroke(4));
    for (const sx of [-76, 52])
      g.roundRect(ax + sx, ay - 96, 24, 70, 10)
        .fill(0x6f8fd8)
        .stroke(stroke(4));
    for (const sx of [-60, 50]) g.rect(ax + sx, ay - 22, 10, 22).fill(HOLLOW_COLORS.woodDark);
    // Spool table with a teacup.
    const tx = px(7.3);
    g.roundRect(tx - 34, ay - 60, 68, 60, 8)
      .fill(0xe8d3a8)
      .stroke(stroke(4));
    g.roundRect(tx - 42, ay - 66, 84, 12, 5)
      .fill(HOLLOW_COLORS.wood)
      .stroke(stroke(3));
    g.roundRect(tx - 14, ay - 88, 28, 22, 6)
      .fill(0xffffff)
      .stroke(stroke(3));
    g.circle(tx + 18, ay - 78, 7).stroke({ width: 4, color: 0x2b1d2e });
    g.moveTo(tx - 4, ay - 96)
      .quadraticCurveTo(tx + 4, ay - 108, tx - 2, ay - 120)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
    // Slippers by the chair.
    for (const sx of [-28, 8])
      g.ellipse(px(13.2) + sx, ay - 8, 20, 9)
        .fill(0xff8fab)
        .stroke(stroke(3));
    // A standing lamp by the stair (its glow is live).
    const lx = px(18.75);
    g.moveTo(lx, ay)
      .lineTo(lx, 6.5 * PPM)
      .stroke({ width: 6, color: HOLLOW_COLORS.brass });
    g.moveTo(lx - 40, 6.5 * PPM)
      .lineTo(lx + 40, 6.5 * PPM)
      .lineTo(lx + 24, 6.1 * PPM)
      .lineTo(lx - 24, 6.1 * PPM)
      .closePath();
    g.fill(0xffe3a3).stroke(stroke(3));
  }

  // The sealing wall on the left: the gnome's thick ceramic.
  g.rect(x0 - 2, -40, SEAL * PPM + 2, VIEW_HEIGHT_PX + 80).fill(darken(HOLLOW_COLORS.ceramic, 0.18));
  g.moveTo(px(SEAL), 0).lineTo(px(SEAL), VIEW_HEIGHT_PX).stroke(soft(4, 0.5));
  c.addChild(g);
  return c;
}
