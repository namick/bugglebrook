import type { Graphics } from 'pixi.js';
import type { EyeShape, MouthShape } from '../bugFace';
import { EYE_WHITE, OUTLINE, stroke } from '../palette';

export interface Look {
  /** Where the pupil points, each -1 to 1. */
  x: number;
  y: number;
}

const MOUTH_INSIDE = 0x7a2336;
const TONGUE = 0xff7a93;

/** A spiral from the center outward, for dizzy eyes and snail shells. */
export function spiral(
  g: Graphics,
  cx: number,
  cy: number,
  radius: number,
  turns: number,
  start = 0,
): Graphics {
  const steps = Math.max(12, Math.round(turns * 18));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + t * turns * Math.PI * 2;
    const r = radius * t;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  return g;
}

/**
 * One cartoon eye. `open` below 1 lowers the lid (blinks). `lid` is the
 * color of the skin around the eye, used for sleepy lids.
 */
export function drawEye(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  shape: EyeShape,
  look: Look,
  open: number,
  lid: number,
  time: number,
  line = 4,
): void {
  const w = Math.max(2, line);
  if (open < 0.35 && shape !== 'spiral') {
    // Closed: a lash curve.
    g.moveTo(x - r * 0.85, y)
      .quadraticCurveTo(x, y + r * 0.55, x + r * 0.85, y)
      .stroke(stroke(w));
    return;
  }
  switch (shape) {
    case 'happy':
      g.moveTo(x - r * 0.8, y + r * 0.25)
        .quadraticCurveTo(x, y - r * 0.85, x + r * 0.8, y + r * 0.25)
        .stroke(stroke(w * 1.2));
      return;
    case 'squint':
      g.moveTo(x - r * 0.7, y - r * 0.5)
        .lineTo(x + r * 0.5, y)
        .lineTo(x - r * 0.7, y + r * 0.5)
        .stroke(stroke(w * 1.2));
      return;
    case 'spiral': {
      g.circle(x, y, r).fill(EYE_WHITE).stroke(stroke(w));
      spiral(g, x, y, r * 0.78, 2.2, time * 9).stroke(stroke(Math.max(2, w * 0.75)));
      return;
    }
    default:
      break;
  }
  const er = shape === 'wide' ? r * 1.12 : r;
  const ry = er * Math.min(1, open);
  g.ellipse(x, y, er, ry).fill(EYE_WHITE).stroke(stroke(w));
  const pr = shape === 'wide' ? er * 0.36 : er * 0.52;
  const reach = er - pr - er * 0.08;
  const px = x + look.x * reach;
  const py = y + look.y * reach * Math.min(1, open);
  g.circle(px, py, pr).fill(OUTLINE);
  g.circle(px - pr * 0.35, py - pr * 0.4, pr * 0.38).fill(EYE_WHITE);
  if (shape === 'sleepy') {
    // Heavy upper lid.
    g.moveTo(x - er - 1, y)
      .arc(x, y, er + 1, Math.PI, 0)
      .lineTo(x - er - 1, y)
      .fill(lid);
    g.moveTo(x - er, y)
      .lineTo(x + er, y)
      .stroke(stroke(w));
    g.ellipse(x, y, er, ry).stroke(stroke(w));
  }
  if (shape === 'worried') {
    // Brow slanting up toward the middle of the face.
    g.moveTo(x - er * 0.9, y - er * 1.15)
      .lineTo(x + er * 0.7, y - er * 1.55)
      .stroke(stroke(w * 0.9));
  }
}

/** A mouth centered at (x, y), about `s` wide. `line` colors strokes on dark heads. */
export function drawMouth(
  g: Graphics,
  x: number,
  y: number,
  s: number,
  shape: MouthShape,
  time: number,
  lineColor = OUTLINE,
  line = 4,
): void {
  const st = stroke(line, lineColor);
  switch (shape) {
    case 'smile':
      g.moveTo(x - s * 0.5, y - s * 0.1)
        .quadraticCurveTo(x, y + s * 0.45, x + s * 0.5, y - s * 0.1)
        .stroke(st);
      return;
    case 'grin':
      g.moveTo(x - s * 0.55, y - s * 0.15)
        .quadraticCurveTo(x, y + s * 0.85, x + s * 0.55, y - s * 0.15)
        .closePath()
        .fill(MOUTH_INSIDE)
        .stroke(st);
      g.ellipse(x + s * 0.05, y + s * 0.3, s * 0.22, s * 0.1).fill(TONGUE);
      return;
    case 'o':
      g.ellipse(x, y + s * 0.1, s * 0.2, s * 0.26)
        .fill(MOUTH_INSIDE)
        .stroke(st);
      return;
    case 'whee':
      g.ellipse(x, y + s * 0.2, s * 0.36, s * 0.46)
        .fill(MOUTH_INSIDE)
        .stroke(st);
      g.ellipse(x, y + s * 0.44, s * 0.2, s * 0.14).fill(TONGUE);
      return;
    case 'chew': {
      const k = Math.sin(time * 24) * s * 0.08;
      g.moveTo(x - s * 0.4, y + k)
        .quadraticCurveTo(x - s * 0.15, y + s * 0.2 - k, x, y + k)
        .quadraticCurveTo(x + s * 0.15, y + s * 0.2 - k, x + s * 0.4, y + k)
        .stroke(st);
      return;
    }
    case 'wobble': {
      g.moveTo(x - s * 0.5, y);
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        g.lineTo(x - s * 0.5 + s * t, y + Math.sin(t * Math.PI * 3 + time * 10) * s * 0.12);
      }
      g.stroke(st);
      return;
    }
    case 'flat':
      g.moveTo(x - s * 0.35, y + s * 0.05)
        .lineTo(x + s * 0.35, y + s * 0.05)
        .stroke(st);
      return;
    case 'frown':
      g.moveTo(x - s * 0.4, y + s * 0.25)
        .quadraticCurveTo(x, y - s * 0.15, x + s * 0.4, y + s * 0.25)
        .stroke(st);
      return;
  }
}
