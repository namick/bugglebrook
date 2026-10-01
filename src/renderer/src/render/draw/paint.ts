import type { Graphics } from 'pixi.js';
import { hash01 } from '../bugPose';
import { darken, lighten } from '../palette';
import type { Box } from './species/common';

/** The paint puddles' colors (game design doc, section 3, `fix_paint_puddles`). */
export const PAINT_COLORS: Readonly<Record<string, number>> = {
  paint_red: 0xe8453c,
  paint_blue: 0x4d7cff,
  paint_yellow: 0xffd23f,
  paint_white: 0xffffff,
  paint_black: 0x2b2438,
};

/** The paint colors on a bug, oldest first, without repeats or unknown IDs (at most five). */
export function paintColors(ids: readonly string[] | undefined): number[] {
  const out: number[] = [];
  for (const id of ids ?? []) {
    const c = PAINT_COLORS[id];
    if (c !== undefined && !out.includes(c)) out.push(c);
  }
  return out.slice(0, 5);
}

/** The edge under a patch: darker for light paint, lighter for black, so every color reads. */
const rimOf = (c: number): number => (c === PAINT_COLORS.paint_black ? lighten(c, 0.3) : darken(c, 0.28));

/** A blobby splotch: overlapping circles around (x, y), drawn edge first, then paint, then a wet shine. */
function splotch(g: Graphics, x: number, y: number, rad: number, color: number, seed: number): void {
  const blobs: [number, number, number][] = [[x, y, rad]];
  for (let i = 0; i < 5; i++) {
    const a = hash01(seed, i) * Math.PI * 2;
    const d = rad * (0.55 + 0.35 * hash01(seed, i + 7));
    blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, rad * (0.38 + 0.3 * hash01(seed, i + 13))]);
  }
  // A couple of flicked droplets.
  for (let i = 0; i < 2; i++) {
    const a = hash01(seed, i + 21) * Math.PI * 2;
    const d = rad * (1.45 + 0.3 * hash01(seed, i + 25));
    blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, rad * 0.16]);
  }
  for (const [bx, by, br] of blobs) g.circle(bx, by, br + 2.5).fill(rimOf(color));
  for (const [bx, by, br] of blobs) g.circle(bx, by, br).fill(color);
  g.ellipse(x - rad * 0.3, y - rad * 0.35, rad * 0.32, rad * 0.14).fill({ color: 0xffffff, alpha: 0.45 });
}

/**
 * Paint patches over the lower half of a body (`box`); the caller clips
 * them to the body's silhouette. One color is a splotch or two; more colors
 * spread out; all five make a patchwork.
 */
export function drawPaintPatches(g: Graphics, colors: readonly number[], box: Box, seed: number): void {
  const n = colors.length;
  if (n === 0) return;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (n >= 5) {
    // Patchwork: slanted, blobby patches side by side, each with a lumpy top edge.
    const top = (j: number): number =>
      j === 0
        ? box.x0 - w * 0.15
        : j === n
          ? box.x1 + w * 0.15
          : box.x0 + (w * j) / n + w * 0.07 * (j % 2 ? 1 : -1);
    const bottom = (j: number): number =>
      j === 0
        ? box.x0 - w * 0.15
        : j === n
          ? box.x1 + w * 0.15
          : box.x0 + (w * j) / n - w * 0.07 * (j % 2 ? 1 : -1);
    for (let k = 0; k < n; k++) {
      const color = colors[k]!;
      const xa = top(k);
      const xb = top(k + 1);
      const pts: number[] = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const x = xa + ((xb - xa) * i) / steps;
        const lump = Math.sin((i / steps) * Math.PI);
        pts.push(x, box.y0 + h * (0.28 - 0.2 * lump + 0.06 * hash01(seed + k, i)));
      }
      pts.push(bottom(k + 1), box.y1 + h * 0.5, bottom(k), box.y1 + h * 0.5);
      g.poly(pts).fill(rimOf(color));
      const inner = pts.map((v, i) => (i % 2 === 1 ? v + 2.5 : v));
      g.poly(inner).fill(color);
      g.ellipse((xa + xb) / 2 - w * 0.03, box.y0 + h * 0.4, w * 0.04, h * 0.07).fill({
        color: 0xffffff,
        alpha: 0.4,
      });
    }
    return;
  }
  const rad = Math.min(h * 0.55, (w / (n + 0.6)) * 0.62);
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.58 : (k + 0.5) / n;
    const x = box.x0 + w * t + w * 0.05 * (hash01(seed, k + 40) - 0.5);
    const y = box.y0 + h * (0.55 + 0.2 * hash01(seed, k + 50));
    splotch(g, x, y, n === 1 ? rad * 0.8 : rad, colors[k]!, seed * 7 + k);
  }
}
