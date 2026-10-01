import type { Graphics } from 'pixi.js';
import { OUTLINE, lighten, mix } from './palette';
import type { PotionLook } from './potionLooks';
import { RAINBOW } from './potionLooks';

/**
 * Draws the extras potions put around a bug (game design doc, section 9):
 * butterfly wings, shaggy fur, the bubble it floats in, the snowball it has
 * become, glossy sticky feet, a magnet's shimmer, a copycat's shine, sludge
 * flies, frost, a ghost's wavy hem, and stars at an upside-down bug's feet.
 * `behind` goes under the bug, `over` on top. Positions are world pixels;
 * `r` is the bug's drawn radius.
 */
export interface PotionDraw {
  x: number;
  y: number;
  r: number;
  facing: 1 | -1;
  time: number;
  /** The bug's own body color, for fur and a ghost's hem. */
  body: number;
  /** Moving fast enough to flap and stream. */
  speed: number;
  /** Its id, so each bug's flies and fur sit a little differently. */
  seed: number;
}

export function drawPotionBehind(g: Graphics, look: PotionLook, d: PotionDraw): void {
  const { x, y, r, time } = d;
  if (look.extras.has('wings')) {
    // Butterfly wings from the back: two lobes each side, flapping.
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(time * (d.speed > 0.5 ? 14 : 6)));
    const c = look.color;
    for (const side of [-1, 1] as const) {
      const wx = x - d.facing * r * 0.2;
      const wy = y - r * 0.55;
      const big = r * 1.25 * flap;
      g.ellipse(wx + side * big * 0.7, wy - r * 0.35, big * 0.75, r * 0.85)
        .fill(c)
        .stroke({ width: 5, color: OUTLINE });
      g.ellipse(wx + side * big * 0.55, wy + r * 0.45, big * 0.5, r * 0.55)
        .fill(lighten(c, 0.25))
        .stroke({ width: 5, color: OUTLINE });
      g.circle(wx + side * big * 0.75, wy - r * 0.4, r * 0.22).fill({ color: 0xffffff, alpha: 0.7 });
    }
  }
  if (look.extras.has('fur')) {
    // Long shaggy fur that bounces as it moves.
    const n = 22;
    const fur = mix(d.body, 0xa0704a, 0.55);
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      const sway = Math.sin(time * 7 + i * 1.7 + d.seed) * (0.15 + Math.min(0.35, d.speed * 0.08));
      const len = r * (0.55 + (0.25 * ((i * 7 + d.seed) % 5)) / 5);
      const bx = x + Math.cos(a) * r * 0.85;
      const by = y + Math.sin(a) * r * 0.85;
      const tx = bx + Math.cos(a + sway) * len;
      const ty = by + Math.sin(a + sway) * len;
      g.moveTo(bx, by).quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.3, tx, ty);
      g.stroke({ width: 9, color: OUTLINE, cap: 'round' });
      g.moveTo(bx, by).quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.3, tx, ty);
      g.stroke({ width: 5, color: fur, cap: 'round' });
    }
  }
  if (look.extras.has('ghost')) {
    // A sheet's wavy hem under the see-through body.
    const hem: number[] = [];
    const w = r * 1.15;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      hem.push(x - w + t * w * 2, y + r * 0.6 + Math.sin(t * Math.PI * 4 + time * 6) * r * 0.12);
    }
    hem.push(x + w, y - r * 0.3, x - w, y - r * 0.3);
    g.poly(hem).fill({ color: 0xffffff, alpha: 0.35 });
  }
  if (look.extras.has('echo')) {
    // Slow-mo: two fading copies of the body lag behind it, further when it moves.
    const lag = r * (0.22 + Math.min(0.35, d.speed * 0.12));
    for (const i of [2, 1])
      g.ellipse(x - d.facing * lag * i, y, r * 0.95, r * 0.8).fill({
        color: 0x8c7ae6,
        alpha: 0.16 + 0.12 * (2 - i),
      });
  }
  if (look.extras.has('jet')) {
    // Rocket: a flickering flame under its feet.
    const fy = y + r * 0.85;
    const flick = 0.75 + 0.25 * Math.sin(time * 37);
    g.moveTo(x - r * 0.35, fy)
      .quadraticCurveTo(x, fy + r * 1.1 * flick, x + r * 0.35, fy)
      .closePath()
      .fill(0xff8c2e)
      .stroke({ width: 4, color: OUTLINE });
    g.moveTo(x - r * 0.17, fy)
      .quadraticCurveTo(x, fy + r * 0.6 * flick, x + r * 0.17, fy)
      .closePath()
      .fill(0xffd23f);
  }
  if (look.extras.has('spring_feet')) {
    // Bouncy: a springy coil under it, squashing in time with its boing.
    const top = y + r * 0.7;
    const len = r * (0.4 + 0.12 * Math.sin(time * 9));
    const pts: number[] = [x, top];
    for (let i = 1; i <= 5; i++) pts.push(x + (i % 2 === 0 ? -1 : 1) * r * 0.28, top + (len * i) / 5.5);
    pts.push(x, top + len);
    g.poly(pts, false).stroke({ width: 8, color: OUTLINE, join: 'round', cap: 'round' });
    g.poly(pts, false).stroke({ width: 4, color: 0xff5fa2, join: 'round', cap: 'round' });
  }
  if (look.glow) g.circle(x, y, r * 1.8).fill({ color: look.glow.color, alpha: 0.18 });
}

export function drawPotionOver(g: Graphics, look: PotionLook, d: PotionDraw): void {
  const { x, y, r, time, facing } = d;
  const feetY = look.flipY ? y - r : y + r;
  if (look.extras.has('snowball')) {
    // A rolling snowball with the bug's face peeking out.
    g.circle(x, y, r * 1.12)
      .fill(0xf4fbff)
      .stroke({ width: 6, color: OUTLINE });
    g.circle(x - r * 0.4, y - r * 0.45, r * 0.25).fill({ color: 0xffffff, alpha: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = time * 2 * (d.speed > 0.2 ? 1 : 0) + i;
      g.circle(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.07).fill({
        color: 0xc8e2f0,
        alpha: 0.8,
      });
    }
    const ex = x + facing * r * 0.25;
    g.circle(ex - r * 0.2, y - r * 0.1, r * 0.12).fill(OUTLINE);
    g.circle(ex + r * 0.2, y - r * 0.1, r * 0.12).fill(OUTLINE);
    g.circle(ex - r * 0.17, y - r * 0.14, r * 0.04).fill(0xffffff);
    g.moveTo(ex - r * 0.15, y + r * 0.2)
      .quadraticCurveTo(ex, y + r * 0.32, ex + r * 0.15, y + r * 0.2)
      .stroke({ width: 4, color: OUTLINE, cap: 'round' });
    g.circle(ex - r * 0.38, y + r * 0.08, r * 0.09).fill({ color: 0xff8fab, alpha: 0.7 });
  }
  if (look.extras.has('bubble')) {
    const wob = Math.sin(time * 5) * r * 0.05;
    g.ellipse(x, y, r * 1.45 + wob, r * 1.45 - wob).fill({ color: 0xbfefff, alpha: 0.18 });
    g.ellipse(x, y, r * 1.45 + wob, r * 1.45 - wob).stroke({
      width: 4,
      color: mix(0xbfefff, RAINBOW[Math.floor(time * 2) % 6]!, 0.4),
      alpha: 0.9,
    });
    g.ellipse(x - r * 0.6, y - r * 0.7, r * 0.3, r * 0.16).fill({ color: 0xffffff, alpha: 0.8 });
  }
  if (look.extras.has('balloon')) {
    // Stretched tight: a shine and a tiny knot.
    g.ellipse(x - r * 0.45, y - r * 0.6, r * 0.32, r * 0.18).fill({ color: 0xffffff, alpha: 0.75 });
    g.circle(x, y + r * 1.2, r * 0.1).fill(OUTLINE);
  }
  if (look.extras.has('sticky_feet')) {
    for (const dx of [-0.5, 0.5]) {
      const fx = x + dx * r;
      g.ellipse(fx, feetY, r * 0.2, r * 0.09).fill({ color: 0xf0a530, alpha: 0.85 });
      g.ellipse(fx - r * 0.06, feetY - r * 0.03, r * 0.07, r * 0.03).fill({ color: 0xffffff, alpha: 0.8 });
    }
  }
  if (look.extras.has('stars_feet')) {
    for (let i = 0; i < 3; i++) {
      const a = time * 3 + (i * Math.PI * 2) / 3;
      star(g, x + Math.cos(a) * r * 0.8, feetY + Math.sin(a) * r * 0.2, r * 0.14, 0xffd23f);
    }
  }
  if (look.extras.has('magnet')) {
    // A short dotted pull field: dots drift in toward it along curved lines,
    // red on one side and blue on the other, fading in and out as they come.
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? 1 : -1;
      const color = side === 1 ? 0xe34f4f : 0x4d7cff;
      const a0 = (side === 1 ? -0.55 : Math.PI + 0.55) + (i % 3) * 0.55 * side;
      for (let j = 0; j < 3; j++) {
        const t = (time * 0.9 + j / 3 + i * 0.13) % 1;
        const dist = r * (1.75 - 0.6 * t);
        const a = a0 - side * 0.35 * t;
        g.circle(x + Math.cos(a) * dist, y + Math.sin(a) * dist, r * 0.11 * (0.6 + 0.4 * t)).fill({
          color,
          alpha: 0.9 * Math.sin(t * Math.PI),
        });
      }
    }
  }
  if (look.extras.has('shiny')) {
    // Each arc starts its own path, or it would join on to whatever was drawn last.
    const a = time * 1.5;
    const k = r * 1.08;
    g.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
      .arc(x, y, k, a, a + 1.2)
      .stroke({ width: 5, color: 0xffffff, alpha: 0.85, cap: 'round' });
    const b = a + Math.PI;
    g.moveTo(x + Math.cos(b) * k, y + Math.sin(b) * k)
      .arc(x, y, k, b, b + 0.6)
      .stroke({
        width: 4,
        color: 0xdfe6f0,
        alpha: 0.8,
        cap: 'round',
      });
  }
  if (look.extras.has('flies')) {
    for (let i = 0; i < 3; i++) {
      const a = time * (4 + i) + i * 2.1 + d.seed;
      const fx = x + Math.cos(a) * r * (1.1 + 0.2 * i);
      const fy = y - r * 0.9 + Math.sin(a * 1.3) * r * 0.4;
      g.circle(fx, fy, 3.5).fill(OUTLINE);
      g.ellipse(fx - 3, fy - 4, 3, 2).fill({ color: 0xffffff, alpha: 0.8 });
      g.ellipse(fx + 3, fy - 4, 3, 2).fill({ color: 0xffffff, alpha: 0.8 });
    }
  }
  if (look.extras.has('frost')) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.15 + i * 0.17);
      const fx = x + Math.cos(a) * r * 0.95;
      const fy = y + Math.sin(a) * r * 0.95;
      flake(g, fx, fy, r * 0.12);
    }
  }
  if (look.extras.has('crossed')) {
    const hx = x + facing * r * 0.55;
    for (const dx of [-0.16, 0.16]) {
      const cx = hx + dx * r;
      const cy = y - r * 0.15;
      g.circle(cx, cy, r * 0.13)
        .fill(0xffffff)
        .stroke({ width: 3, color: OUTLINE });
      g.circle(cx - dx * r * 0.4, cy, r * 0.06).fill(OUTLINE);
    }
  }
  if (look.extras.has('hiccups') && Math.sin(time * 2.4) > 0.92) {
    const hy = y - r * 1.4;
    g.circle(x + facing * r * 0.6, hy, r * 0.18)
      .fill({ color: 0xbfefff, alpha: 0.85 })
      .stroke({ width: 3, color: OUTLINE });
  }
  if (look.extras.has('jelly')) {
    g.ellipse(x - r * 0.35, y - r * 0.5, r * 0.28, r * 0.14).fill({ color: 0xffffff, alpha: 0.6 });
    g.circle(x + r * 0.3, y + r * 0.2, r * 0.07).fill({ color: 0xffffff, alpha: 0.5 });
  }
  if (look.extras.has('speed_lines')) {
    // Speedy: bold streaks behind it, always, longer when it runs.
    const run = Math.min(1, d.speed / 3);
    for (let i = 0; i < 3; i++) {
      const phase = (time * 3 + i * 0.37) % 1;
      const len = r * (0.7 + 0.5 * run) * (0.6 + 0.4 * Math.sin(phase * Math.PI));
      const ly = y + r * (-0.5 + i * 0.45);
      const lx = x - facing * r * (1.1 + 0.2 * phase);
      g.moveTo(lx, ly)
        .lineTo(lx - facing * len, ly)
        .stroke({ width: 11, color: OUTLINE, alpha: 0.55, cap: 'round' });
      g.moveTo(lx, ly)
        .lineTo(lx - facing * len, ly)
        .stroke({ width: 6, color: 0xffffff, cap: 'round' });
    }
  }
  if (look.extras.has('sweat')) {
    // Heavy: a sweat drop sliding down its brow, again and again, and cracks underfoot.
    const t = (time * 0.7) % 1;
    const sx = x - facing * r * 0.45;
    const sy = y - r * 0.75 + t * r * 0.5;
    drop(g, sx, sy, r * 0.18, 0x9fd8ff, 1 - t * 0.6);
    for (const side of [-1, 1]) {
      const cx = x + side * r * 0.55;
      g.moveTo(cx, feetY + 2)
        .lineTo(cx + side * r * 0.12, feetY + r * 0.06)
        .lineTo(cx + side * r * 0.2, feetY + 1)
        .stroke({ width: 3, color: OUTLINE, alpha: 0.7, cap: 'round', join: 'round' });
    }
  }
  if (look.extras.has('clock')) {
    // Slow-mo: a little clock over its head, its hand creeping round.
    const cx = x + facing * r * 0.55;
    const cy = y - r * 1.6;
    const cr = r * 0.38;
    g.rect(cx - cr * 0.25, cy - cr * 1.3, cr * 0.5, cr * 0.35)
      .fill(0x8c7ae6)
      .stroke({ width: 2.5, color: OUTLINE });
    g.circle(cx, cy, cr).fill(0xfff8e8).stroke({ width: 4, color: OUTLINE });
    const a = time * 0.6 - Math.PI / 2;
    g.moveTo(cx, cy)
      .lineTo(cx + Math.cos(a) * cr * 0.7, cy + Math.sin(a) * cr * 0.7)
      .stroke({ width: 3, color: OUTLINE, cap: 'round' });
    g.moveTo(cx, cy)
      .lineTo(cx, cy - cr * 0.45)
      .stroke({ width: 3, color: 0x8c7ae6, cap: 'round' });
    g.circle(cx, cy, cr * 0.12).fill(OUTLINE);
  }
  if (look.extras.has('squeaky')) {
    // Squeaky: shiny like a vinyl toy, with squeak marks popping by its head.
    g.ellipse(x - r * 0.35, y - r * 0.55, r * 0.34, r * 0.15).fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(x + r * 0.05, y - r * 0.68, r * 0.06).fill({ color: 0xffffff, alpha: 0.8 });
    const pop = Math.max(0, Math.sin(time * 5));
    if (pop > 0.2) {
      const hx = x + facing * r * 0.95;
      const hy = y - r * 0.6;
      const base = facing === 1 ? -0.3 : Math.PI + 0.3;
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.5;
        const l0 = r * 0.12;
        const l1 = r * (0.2 + 0.18 * pop);
        g.moveTo(hx + Math.cos(a) * l0, hy + Math.sin(a) * l0)
          .lineTo(hx + Math.cos(a) * l1, hy + Math.sin(a) * l1)
          .stroke({ width: 4, color: 0xff6fb5, cap: 'round' });
      }
    }
  }
  if (look.extras.has('nightcap')) {
    // Sleepy: a floppy striped nightcap with a bobble.
    const hx = x + facing * r * 0.1;
    const hy = y - r * 0.78;
    const droop = Math.sin(time * 1.5) * r * 0.05;
    const tipX = hx - facing * r * 0.85;
    const tipY = hy + r * 0.05 + droop;
    g.moveTo(hx - r * 0.5, hy + r * 0.12)
      .quadraticCurveTo(hx - facing * r * 0.1, hy - r * 0.75, tipX, tipY)
      .quadraticCurveTo(hx + facing * r * 0.05, hy - r * 0.25, hx + r * 0.5, hy + r * 0.12)
      .closePath()
      .fill(0x9d8cff)
      .stroke({ width: 4, color: OUTLINE, join: 'round' });
    g.roundRect(hx - r * 0.55, hy + r * 0.02, r * 1.1, r * 0.2, r * 0.1)
      .fill(0xfff8e8)
      .stroke({ width: 3.5, color: OUTLINE });
    g.circle(tipX, tipY, r * 0.13)
      .fill(0xfff8e8)
      .stroke({ width: 3, color: OUTLINE });
  }
  if (look.extras.has('fizz')) {
    // Burpy: fizz bubbles rising from its mouth.
    const mx = x + facing * r * 0.75;
    for (let i = 0; i < 4; i++) {
      const t = (time * 0.8 + i / 4) % 1;
      const bx = mx + Math.sin(t * 9 + i) * r * 0.08;
      const by = y - t * r * 1.1;
      g.circle(bx, by, r * (0.05 + 0.04 * (i % 2))).stroke({ width: 2.5, color: 0x5cc85a, alpha: 1 - t });
    }
  }
  if (look.extras.has('soap')) {
    // Bubbly: a few soap bubbles drifting round it.
    for (let i = 0; i < 3; i++) {
      const a = time * 0.9 + (i * Math.PI * 2) / 3;
      const bx = x + Math.cos(a) * r * 1.25;
      const by = y - r * 0.2 + Math.sin(a * 1.3) * r * 0.55;
      const br = r * (0.11 + 0.03 * i);
      g.circle(bx, by, br).fill({ color: 0xbfefff, alpha: 0.25 });
      g.circle(bx, by, br).stroke({ width: 2.5, color: mix(0xbfefff, RAINBOW[(i * 2) % 6]!, 0.45) });
      g.circle(bx - br * 0.35, by - br * 0.35, br * 0.25).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
  if (look.extras.has('embers')) {
    // Fire breath: a little flame flickering at its lips, and a wisp of smoke.
    const mx = x + facing * r * 0.95;
    const my = y + r * 0.05;
    const flick = 0.7 + 0.3 * Math.sin(time * 23);
    g.moveTo(mx, my - r * 0.12)
      .quadraticCurveTo(mx + facing * r * 0.45 * flick, my, mx, my + r * 0.12)
      .closePath()
      .fill(0xff7a1f)
      .stroke({ width: 3, color: OUTLINE });
    g.moveTo(mx, my - r * 0.06)
      .quadraticCurveTo(mx + facing * r * 0.25 * flick, my, mx, my + r * 0.06)
      .closePath()
      .fill(0xffd23f);
    const t = (time * 0.6) % 1;
    g.circle(mx + facing * r * 0.2, my - r * (0.3 + t * 0.8), r * (0.08 + 0.06 * t)).fill({
      color: 0x9a98b0,
      alpha: 0.5 * (1 - t),
    });
  }
  if (look.extras.has('drips')) {
    // Paint (or water) dripping off it.
    for (let i = 0; i < 3; i++) {
      const t = (time * 0.7 + i * 0.33) % 1;
      const dx = x + r * (-0.55 + i * 0.55);
      drop(g, dx, y + r * 0.55 + t * r * 0.7, r * 0.09, look.drip, 1 - t * t);
    }
  }
  if (look.extras.has('wobble_lines')) {
    // Wobbly: little shake marks either side.
    for (const side of [-1, 1]) {
      const wx = x + side * r * 1.2;
      const lean = Math.sin(time * 8) * r * 0.06;
      g.moveTo(wx, y - r * 0.35)
        .quadraticCurveTo(wx + side * r * 0.14 + lean, y, wx, y + r * 0.35)
        .stroke({ width: 4, color: OUTLINE, alpha: 0.7, cap: 'round' });
    }
  }
  if (look.notes !== null) {
    // Opera and squeaky: notes floating up off it.
    for (let i = 0; i < 2; i++) {
      const t = (time * 0.45 + i * 0.5) % 1;
      const nx = x + facing * r * (0.6 + 0.4 * t) + Math.sin(t * 8) * r * 0.1;
      const ny = y - r * (1.1 + 0.8 * t);
      note(g, nx, ny, r * 0.16, look.notes, 1 - t * t);
    }
  }
}

/** A drop of water or paint, point up. */
function drop(g: Graphics, x: number, y: number, s: number, color: number, alpha: number): void {
  g.moveTo(x, y - s * 1.6)
    .quadraticCurveTo(x + s * 1.1, y - s * 0.1, x, y + s)
    .quadraticCurveTo(x - s * 1.1, y - s * 0.1, x, y - s * 1.6)
    .fill({ color, alpha })
    .stroke({ width: 2.5, color: OUTLINE, alpha });
  g.circle(x - s * 0.3, y, s * 0.25).fill({ color: 0xffffff, alpha: 0.8 * alpha });
}

/** An eighth note, its head at (x, y). */
function note(g: Graphics, x: number, y: number, s: number, color: number, alpha: number): void {
  g.moveTo(x + s * 0.8, y)
    .lineTo(x + s * 0.8, y - s * 2.2)
    .lineTo(x + s * 1.7, y - s * 1.7)
    .stroke({ width: 3.5, color: OUTLINE, alpha, cap: 'round', join: 'round' });
  g.ellipse(x, y, s, s * 0.75)
    .fill({ color, alpha })
    .stroke({ width: 3, color: OUTLINE, alpha });
}

function star(g: Graphics, x: number, y: number, s: number, color: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? s : s * 0.45;
    pts.push(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.poly(pts).fill(color).stroke({ width: 2, color: OUTLINE });
}

function flake(g: Graphics, x: number, y: number, s: number): void {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    g.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s)
      .lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s)
      .stroke({ width: 2.5, color: 0xffffff, cap: 'round' });
  }
  g.circle(x, y, s * 0.3).fill(0xdff4ff);
}
