import type { Graphics } from 'pixi.js';
import { OUTLINE, darken, lighten, mix } from './palette';
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
    // Red and blue field lines shimmering round it.
    for (let i = 0; i < 4; i++) {
      const a = time * 2 + (i * Math.PI) / 2;
      const color = i % 2 === 0 ? 0xe34f4f : 0x4d7cff;
      g.arc(x, y, r * (1.2 + 0.15 * Math.sin(time * 6 + i)), a, a + 0.9).stroke({
        width: 4,
        color,
        alpha: 0.75,
        cap: 'round',
      });
    }
  }
  if (look.extras.has('shiny')) {
    const a = time * 1.5;
    g.arc(x, y, r * 1.08, a, a + 1.2).stroke({ width: 5, color: 0xffffff, alpha: 0.85, cap: 'round' });
    g.arc(x, y, r * 1.08, a + Math.PI, a + Math.PI + 0.6).stroke({
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

void darken;
