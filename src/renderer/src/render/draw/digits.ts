import type { Graphics } from 'pixi.js';
import { OUTLINE } from '../palette';

/**
 * Chunky drawn numbers for the journal's counts and percentages, so they
 * look the same on every machine and match the art (no fonts). Each
 * character is a few strokes in a box 0.62 wide and 1 tall, drawn twice:
 * a wide dark outline, then the color on top.
 */

type Stroke = readonly (readonly [number, number])[];

const W = 0.62;

/** Each character as strokes; arcs are approximated by points. */
function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n = 10,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

const PI = Math.PI;
const GLYPH: Record<string, readonly Stroke[]> = {
  '0': [arc(0.31, 0.5, 0.29, 0.48, 0, PI * 2, 20)],
  '1': [
    [
      [0.12, 0.2],
      [0.34, 0.02],
      [0.34, 0.98],
    ],
    [
      [0.12, 0.98],
      [0.54, 0.98],
    ],
  ],
  '2': [[...arc(0.31, 0.3, 0.27, 0.27, PI * 1.1, PI * 2.15), [0.04, 0.98], [0.6, 0.98]]],
  '3': [
    [...arc(0.29, 0.27, 0.25, 0.24, PI * 1.15, PI * 2.5)],
    [...arc(0.29, 0.73, 0.29, 0.25, PI * 1.5, PI * 2.85)],
  ],
  '4': [
    [
      [0.44, 0.98],
      [0.44, 0.02],
      [0.02, 0.7],
      [0.62, 0.7],
    ],
  ],
  '5': [[[0.56, 0.03], [0.1, 0.03], [0.06, 0.45], ...arc(0.3, 0.68, 0.29, 0.3, PI * 1.2, PI * 2.85)]],
  '6': [
    [...arc(0.33, 0.5, 0.28, 0.48, PI * 1.6, PI * 1.05, 6), ...arc(0.31, 0.7, 0.28, 0.28, PI, PI * 3, 16)],
  ],
  '7': [
    [
      [0.02, 0.03],
      [0.6, 0.03],
      [0.22, 0.98],
    ],
  ],
  '8': [arc(0.31, 0.27, 0.23, 0.24, 0, PI * 2, 16), arc(0.31, 0.73, 0.29, 0.25, 0, PI * 2, 16)],
  '9': [[...arc(0.31, 0.3, 0.28, 0.28, 0, PI * 2, 16), ...arc(0.29, 0.5, 0.29, 0.48, 0, PI * 0.45, 6)]],
  '/': [
    [
      [0.55, 0.02],
      [0.07, 0.98],
    ],
  ],
  '%': [
    arc(0.13, 0.18, 0.11, 0.15, 0, PI * 2, 12),
    arc(0.49, 0.82, 0.11, 0.15, 0, PI * 2, 12),
    [
      [0.56, 0.05],
      [0.06, 0.95],
    ],
  ],
  '+': [
    [
      [0.31, 0.25],
      [0.31, 0.85],
    ],
    [
      [0.03, 0.55],
      [0.59, 0.55],
    ],
  ],
};

/** How wide `text` draws at height `h`. */
export function numberWidth(text: string, h: number): number {
  const n = [...text].filter((c) => GLYPH[c]).length;
  return n === 0 ? 0 : (n * W + (n - 1) * 0.22) * h;
}

/**
 * Draw `text` (digits, `/`, `%`, `+`) centered on (x, y), `h` tall. Other
 * characters are skipped.
 */
export function drawNumber(
  g: Graphics,
  text: string,
  x: number,
  y: number,
  h: number,
  color: number,
  outline = OUTLINE,
): void {
  const chars = [...text].filter((c) => GLYPH[c]);
  const width = numberWidth(text, h);
  const line = Math.max(2, h * 0.17);
  for (const pass of [0, 1]) {
    let left = x - width / 2;
    for (const c of chars) {
      for (const s of GLYPH[c]!) {
        s.forEach(([px, py], i) => {
          const gx = left + px * h;
          const gy = y - h / 2 + py * h;
          if (i === 0) g.moveTo(gx, gy);
          else g.lineTo(gx, gy);
        });
      }
      left += (W + 0.22) * h;
    }
    g.stroke(
      pass === 0
        ? { width: line + Math.max(3, h * 0.13), color: outline, cap: 'round', join: 'round' }
        : { width: line, color, cap: 'round', join: 'round' },
    );
  }
}
