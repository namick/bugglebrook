import type { Graphics } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../../game/constants';
import { OUTLINE } from '../palette';

/** The flat ground line in world pixels. */
export const GROUND_PX = 900;

/** Soft outline for background art: thinner and fainter than props (readability rule). */
export const soft = (
  width = 3,
  alpha = 0.55,
): { width: number; color: number; alpha: number; join: 'round'; cap: 'round' } => ({
  width,
  color: OUTLINE,
  alpha,
  join: 'round',
  cap: 'round',
});

/** Draw overlapping circles as one outlined blob: outlines first, fills on top. */
export function blob(
  g: Graphics,
  circles: readonly (readonly [number, number, number])[],
  fill: number,
  line: number,
  alpha = 1,
): void {
  for (const [x, y, r] of circles) g.circle(x, y, r + line / 2).fill({ color: OUTLINE, alpha });
  for (const [x, y, r] of circles) g.circle(x, y, r - line / 2).fill(fill);
}

/** A tapering, curving blade of grass rooted at (x, y). */
export function blade(
  g: Graphics,
  x: number,
  y: number,
  h: number,
  w: number,
  lean: number,
  color: number,
  line: number,
  alpha = 0.6,
): void {
  const tipX = x + lean * h;
  const tipY = y - h;
  g.moveTo(x - w / 2, y)
    .quadraticCurveTo(x - w * 0.4 + lean * h * 0.35, y - h * 0.6, tipX, tipY)
    .quadraticCurveTo(x + w * 0.4 + lean * h * 0.45, y - h * 0.5, x + w / 2, y)
    .closePath()
    .fill(color)
    .stroke(soft(line, alpha));
}

/**
 * Where to draw something in a parallax layer so it sits in the middle of
 * the screen when the camera is centered on world pixel `worldPx`.
 */
export function parallaxX(worldPx: number, factor: number): number {
  return (worldPx - VIEW_WIDTH_PX / 2) * factor + VIEW_WIDTH_PX / 2;
}

/** A flower head: petals round a center. */
export function flower(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  petals: number,
  color: number,
  center: number,
  line = 3,
  alpha = 0.55,
  spin = 0,
): void {
  for (let i = 0; i < petals; i++) {
    const a = spin + (i / petals) * Math.PI * 2;
    g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.46, r * 0.46).fill(color);
  }
  for (let i = 0; i < petals; i++) {
    const a = spin + (i / petals) * Math.PI * 2;
    g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.46, r * 0.46).stroke(
      soft(line, alpha * 0.8),
    );
  }
  g.circle(x, y, r * 0.42)
    .fill(center)
    .stroke(soft(line, alpha));
  g.circle(x - r * 0.12, y - r * 0.14, r * 0.14).fill({ color: 0xffffff, alpha: 0.35 });
}

/** A plank with wood grain and two nails, as a filled rect. */
export function plank(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  grain: number,
  seed: number,
  outline = 0.5,
): void {
  g.rect(x, y, w, h).fill(color).stroke(soft(2.5, outline));
  const n = Math.max(1, Math.floor(w / 140));
  for (let i = 0; i < n; i++) {
    const gx = x + ((i + 0.5) / n) * w + Math.sin(seed + i) * 18;
    g.moveTo(gx - 30, y + h * 0.35)
      .quadraticCurveTo(gx, y + h * (0.25 + 0.2 * Math.sin(seed * 3 + i)), gx + 40, y + h * 0.4)
      .stroke({ width: 2, color: grain, alpha: 0.5, cap: 'round' });
  }
  if (w > 60) {
    g.circle(x + 12, y + h / 2, 2.6).fill({ color: 0x5a4a44, alpha: 0.7 });
    g.circle(x + w - 12, y + h / 2, 2.6).fill({ color: 0x5a4a44, alpha: 0.7 });
  }
}
