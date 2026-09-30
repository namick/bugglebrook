import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_WIDTH_PX } from '../../../game/constants';
import type { Rng } from '../../../game/core/rng';
import type { AreaDef } from '../../../game/data/types';
import type { Terrain } from '../../../game/world/terrain';
import { OUTLINE, darken, lighten, mix, stroke } from './palette';

const PPM = PIXELS_PER_METER;

/** Puddle Pond's palette (game design doc, section 3). */
export const POND_COLORS = {
  surface: 0x5cc3e6,
  deep: 0x2f7fb0,
  reed: 0x8cbf3f,
  reedDark: 0x5f8f2a,
  mud: 0x8a6a4a,
  mudDark: 0x6b5038,
  sand: 0xcdb487,
  lily: 0x3fa34d,
  bloom: 0xf28ab2,
  cattail: 0x7a4e32,
  hose: 0x4cb85c,
  hoseDark: 0x2f8a40,
  tap: 0xe8453c,
  brass: 0xd9a441,
} as const;

/** Soft outline for background art (readability rule: thinner than props). */
const soft = (width = 3, alpha = 0.55) => ({
  width,
  color: OUTLINE,
  alpha,
  join: 'round' as const,
  cap: 'round' as const,
});

/** Where the hose's nozzle and tap sit, relative to the tap fixture (meters). */
export const HOSE_NOZZLE = { dx: -1.05, dy: 0.3 };

/** The pond's rest surface and span in world pixels. */
function span(area: AreaDef): { x0: number; x1: number; level: number } {
  const w = area.water!;
  return { x0: (area.xStart + w.x0) * PPM, x1: (area.xStart + w.x1) * PPM, level: w.level * PPM };
}

/** A reed blade: a long tapering leaf, maybe bent over near the top. */
function reed(g: Graphics, x: number, y: number, h: number, lean: number, color: number, width = 12): void {
  const tipX = x + lean * h;
  g.moveTo(x - width / 2, y)
    .quadraticCurveTo(x + lean * h * 0.3, y - h * 0.55, tipX, y - h)
    .quadraticCurveTo(x + lean * h * 0.42 + width * 0.3, y - h * 0.5, x + width / 2, y)
    .closePath()
    .fill(color)
    .stroke(soft(2.5, 0.5));
}

/** A cattail: a stalk with a fat brown sausage near the top and a thin spike. */
export function cattail(g: Graphics, x: number, y: number, h: number, lean: number, alpha = 0.6): void {
  const top = { x: x + lean * h, y: y - h };
  g.moveTo(x, y)
    .quadraticCurveTo(x + lean * h * 0.3, y - h * 0.6, top.x, top.y)
    .stroke({ width: 6, color: POND_COLORS.reedDark, cap: 'round' });
  const hx = x + lean * h * 0.86;
  const hy = y - h * 0.8;
  const ang = Math.atan2(top.y - (y - h * 0.6), top.x - (x + lean * h * 0.3));
  // The head, rotated to follow the stalk.
  const pts: number[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const ex = Math.cos(a) * 11;
    const ey = Math.sin(a) * 36;
    const r = ang + Math.PI / 2;
    pts.push(hx + ex * Math.cos(r) - ey * Math.sin(r), hy + ex * Math.sin(r) + ey * Math.cos(r));
  }
  g.poly(pts).fill(POND_COLORS.cattail).stroke(soft(3, alpha));
  g.moveTo(hx + Math.cos(ang) * 30, hy + Math.sin(ang) * 30)
    .lineTo(top.x + Math.cos(ang) * 22, top.y + Math.sin(ang) * 22)
    .stroke({ width: 3, color: POND_COLORS.reedDark, cap: 'round' });
}

/**
 * The pond's banks at the ground plane: a sandy basin under the water,
 * muddy lips at the rims, reeds, the flat sitting stone, the mud bank, and
 * the coiled garden hose. Baked with the near layer.
 */
export function drawPondBank(area: AreaDef, terrain: Terrain, rng: Rng): Graphics {
  const g = new Graphics();
  const { x0, x1 } = span(area);
  const ax = area.xStart * PPM;

  // The basin: sand along the bottom, fading to wet mud up the banks.
  const top: number[] = [];
  for (let x = x0 - 20; x <= x1 + 20; x += 14) top.push(x, terrain.surfaceY(x / PPM) * PPM);
  const band: number[] = [...top];
  for (let i = top.length - 2; i >= 0; i -= 2) band.push(top[i]!, top[i + 1]! + 46);
  g.poly(band).fill(POND_COLORS.sand);
  // Darker wet mud where the water laps: a smooth band just above the waterline.
  for (const [a, b] of [
    [x0 - 30, x0 + 140],
    [x1 - 140, x1 + 30],
  ] as const) {
    const pts: number[] = [];
    for (let x = a; x <= b; x += 8) pts.push(x, terrain.surfaceY(x / PPM) * PPM + 4);
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke({ width: 14, color: POND_COLORS.mud, alpha: 0.6, cap: 'round', join: 'round' });
  }
  // Pebbles and shells scattered on the bottom.
  for (let x = x0 + 60; x < x1 - 60; x += rng.range(40, 110)) {
    const y = terrain.surfaceY(x / PPM) * PPM + rng.range(4, 22);
    const r = rng.range(5, 12);
    g.ellipse(x, y, r * 1.3, r)
      .fill(rng.pick([0xb8a88e, 0xa39684, 0xd8c7a3, 0x9aa3a0]))
      .stroke(soft(2, 0.4));
  }
  g.moveTo(top[0]!, top[1]!);
  for (let i = 2; i < top.length; i += 2) g.lineTo(top[i]!, top[i + 1]!);
  g.stroke(stroke(5, darken(POND_COLORS.sand, 0.45)));

  // Mud bank toward the plaza, with a shiny puddle and a flat sitting stone.
  for (let i = 0; i < 9; i++) {
    const x = ax + rng.range(27.4, 31.6) * PPM;
    const y = terrain.surfaceY(x / PPM) * PPM + rng.range(4, 14);
    g.ellipse(x, y, rng.range(26, 60), rng.range(7, 12)).fill({ color: POND_COLORS.mud, alpha: 0.8 });
  }
  {
    const x = ax + 30.2 * PPM;
    const y = terrain.surfaceY(30.2) * PPM + 8;
    g.ellipse(x, y, 58, 9).fill({ color: 0x9fd4e8, alpha: 0.85 }).stroke(soft(2.5, 0.45));
    g.ellipse(x - 18, y - 2, 18, 3).fill({ color: 0xffffff, alpha: 0.8 });
  }
  {
    const x = ax + 28.9 * PPM;
    const y = terrain.surfaceY(28.9) * PPM;
    g.roundRect(x - 70, y - 26, 140, 36, 18)
      .fill(0xb5aec4)
      .stroke(soft(3.5, 0.6));
    g.roundRect(x - 60, y - 24, 110, 12, 6).fill({ color: 0xe3dff0, alpha: 0.8 });
    g.ellipse(x + 34, y - 6, 12, 5).fill({ color: 0x7cb85c, alpha: 0.9 });
  }

  // Reed tufts at the rims, leaning out over the water.
  for (const [cx, dir] of [
    [x0 - 40, 1],
    [x1 + 50, -1],
  ] as const) {
    for (let k = 0; k < 9; k++) {
      const x = cx + rng.range(-60, 60);
      const y = terrain.surfaceY(x / PPM) * PPM + 6;
      reed(
        g,
        x,
        y,
        rng.range(60, 150),
        dir * rng.range(0.05, 0.35),
        rng.pick([POND_COLORS.reed, 0x7bb036, 0x9ccc4a]),
        rng.range(9, 14),
      );
    }
  }

  // The garden hose: a coil on the bank, a hose to the tap, and one to the nozzle.
  const tap = (area.fixtures ?? []).find((f) => f.kind === 'hose_tap');
  if (tap) {
    const tx = ax + tap.x * PPM;
    const ground = terrain.surfaceY(tap.x) * PPM;
    const nx = tx + HOSE_NOZZLE.dx * PPM;
    const ny = (tap.y + HOSE_NOZZLE.dy) * PPM;
    const cx = tx + 115;
    const cy = ground - 12;
    const tube = (path: (gg: Graphics) => void): void => {
      path(g);
      g.stroke({ width: 22, color: OUTLINE, alpha: 0.75, cap: 'round', join: 'round' });
      path(g);
      g.stroke({ width: 14, color: POND_COLORS.hose, cap: 'round', join: 'round' });
      path(g);
      g.stroke({ width: 4, color: lighten(POND_COLORS.hose, 0.45), alpha: 0.8, cap: 'round', join: 'round' });
    };
    // The run from the coil back to the nozzle, over the bank.
    tube((gg) =>
      gg.moveTo(cx - 70, cy + 4).bezierCurveTo(cx - 170, cy + 12, nx + 70, ny + 26, nx + 26, ny + 2),
    );
    // The coil: stacked loops, back to front.
    for (let i = 0; i < 4; i++) {
      const r = 72 - i * 8;
      tube((gg) => gg.ellipse(cx + i * 3, cy - i * 9, r, r * 0.3));
    }
    // From the coil to the tap's pipe.
    tube((gg) =>
      gg.moveTo(cx - 10, cy - 34).bezierCurveTo(cx - 40, cy - 70, tx + 40, ground - 40, tx + 8, ground - 26),
    );
    // The nozzle: a brass cone pointing out over the water.
    g.poly([nx + 30, ny - 11, nx - 8, ny - 7, nx - 8, ny + 7, nx + 30, ny + 11])
      .fill(POND_COLORS.brass)
      .stroke(stroke(4));
    g.roundRect(nx + 26, ny - 13, 14, 26, 4)
      .fill(darken(POND_COLORS.brass, 0.15))
      .stroke(stroke(4));
    // The tap's pipe coming out of the ground (the wheel is drawn live).
    g.roundRect(tx - 9, tap.y * PPM, 18, ground - tap.y * PPM + 6, 4)
      .fill(0x9aa3ad)
      .stroke(stroke(4));
    g.rect(tx - 5, tap.y * PPM + 6, 5, ground - tap.y * PPM - 6).fill({ color: 0xffffff, alpha: 0.35 });
  }
  return g;
}

/** Tall cattails and rocks standing behind the pond (softened with the back props). */
export function drawPondBackProps(area: AreaDef, terrain: Terrain, rng: Rng): Graphics {
  const g = new Graphics();
  const { x0, x1 } = span(area);
  const ax = area.xStart * PPM;
  // A mossy boulder on each side.
  for (const [x, r] of [
    [ax + 1.4 * PPM, 110],
    [ax + 27.2 * PPM, 90],
  ] as const) {
    const y = terrain.surfaceY(x / PPM) * PPM + 8;
    g.moveTo(x - r * 1.3, y)
      .bezierCurveTo(x - r * 1.3, y - r * 1.2, x + r * 1.2, y - r * 1.3, x + r * 1.3, y)
      .closePath()
      .fill(0xa9a3bb)
      .stroke(soft(4, 0.6));
    g.moveTo(x - r * 0.9, y - r * 0.6)
      .bezierCurveTo(x - r * 0.4, y - r * 1.05, x + r * 0.5, y - r * 1.05, x + r * 0.9, y - r * 0.55)
      .bezierCurveTo(x + r * 0.4, y - r * 0.8, x - r * 0.4, y - r * 0.75, x - r * 0.9, y - r * 0.6)
      .fill(0x7cb85c);
    g.ellipse(x - r * 0.45, y - r * 0.45, r * 0.3, r * 0.1).fill({ color: 0xffffff, alpha: 0.3 });
  }
  // Cattail clumps behind each bank.
  for (const [cx, n, dir] of [
    [x0 - 150, 7, 1],
    [x1 + 130, 9, -1],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const x = cx + rng.range(-120, 120);
      const y = terrain.surfaceY(x / PPM) * PPM + 10;
      reed(
        g,
        x + rng.range(-20, 20),
        y,
        rng.range(180, 330),
        dir * rng.range(-0.1, 0.25),
        POND_COLORS.reed,
        14,
      );
      if (k % 2 === 0) cattail(g, x, y, rng.range(260, 420), dir * rng.range(-0.05, 0.12));
    }
  }
  return g;
}

/**
 * The far layer's glimpse of the pond: a pale strip of water with tiny
 * lily pads and cattails, placed so it sits behind the real pond when the
 * camera is on it.
 */
export function drawPondMid(area: AreaDef, parallax: number, rng: Rng): Graphics {
  const g = new Graphics();
  const { x0, x1 } = span(area);
  const c = (x0 + x1) / 2 - VIEW_WIDTH_PX / 2;
  const shift = -(1 - parallax) * c;
  const a = x0 + shift - 140;
  const b = x1 + shift + 140;
  const y = 902;
  const water = mix(POND_COLORS.surface, 0xe4f6ee, 0.35);
  g.moveTo(a, y)
    .bezierCurveTo(a + 80, y - 26, b - 80, y - 26, b, y)
    .bezierCurveTo(b - 80, y + 16, a + 80, y + 16, a, y)
    .fill(water)
    .stroke(soft(3, 0.35));
  for (let x = a + 120; x < b - 100; x += rng.range(160, 320)) {
    g.ellipse(x, y - 8, rng.range(26, 40), 7).fill(mix(POND_COLORS.lily, water, 0.35));
    g.moveTo(x + rng.range(-200, 200), y - 12)
      .lineTo(x + rng.range(-200, 200) + 30, y - 12)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.6, cap: 'round' });
  }
  for (let k = 0; k < 12; k++) {
    const x = rng.pick([a + rng.range(0, 160), b - rng.range(0, 160)]);
    cattail(g, x, y + 4, rng.range(120, 200), rng.range(-0.1, 0.1), 0.35);
  }
  return g;
}

/**
 * A range of the front layer (in its own coordinates) that should stay
 * clear so foreground grass never hides the pond when the camera is on it.
 */
export function pondFrontGap(area: AreaDef, parallax: number): [number, number] {
  const { x0, x1 } = span(area);
  const c = (x0 + x1) / 2 - VIEW_WIDTH_PX / 2;
  const shift = (parallax - 1) * c;
  return [x0 + shift - 260, x1 + shift + 120];
}
