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
const HEART = 0xff4f7b;
const TOOTH = 0xffffff;

/** A heart shape centered at (x, y), about `s` across. */
export function heartPath(g: Graphics, x: number, y: number, s: number): Graphics {
  const h = s / 2;
  return g
    .moveTo(x, y + h * 0.9)
    .bezierCurveTo(x - h * 1.25, y + h * 0.05, x - h * 0.9, y - h * 1.05, x, y - h * 0.4)
    .bezierCurveTo(x + h * 0.9, y - h * 1.05, x + h * 1.25, y + h * 0.05, x, y + h * 0.9)
    .closePath();
}

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
  if (open < 0.35 && shape !== 'spiral' && shape !== 'heart' && shape !== 'x') {
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
    case 'heart': {
      // Love: the eye becomes a beating heart.
      const beat = 1 + 0.12 * Math.max(0, Math.sin(time * 14));
      heartPath(g, x, y, r * 2.3 * beat)
        .fill(HEART)
        .stroke(stroke(w));
      g.circle(x - r * 0.4, y - r * 0.35, r * 0.22).fill({ color: 0xffffff, alpha: 0.85 });
      return;
    }
    case 'x':
      // Squeezed shut in disgust: > <
      g.moveTo(x - r * 0.75, y - r * 0.6)
        .lineTo(x + r * 0.35, y)
        .lineTo(x - r * 0.75, y + r * 0.6)
        .stroke(stroke(w * 1.2));
      g.moveTo(x + r * 0.75, y - r * 0.6)
        .lineTo(x - r * 0.35, y)
        .lineTo(x + r * 0.75, y + r * 0.6)
        .stroke(stroke(w * 1.2));
      return;
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
  if (shape === 'angry') {
    // A heavy brow slanting down toward the middle of the face (drawn for the
    // bug facing right, so the inner end is on the right).
    g.moveTo(x - er * 1.1, y - er * 1.35)
      .lineTo(x + er * 1.05, y - er * 0.55)
      .stroke(stroke(Math.max(4, w * 1.6)));
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
    case 'aah': {
      // Wide open and waiting to be fed, tongue ready.
      const k = 1 + 0.08 * Math.sin(time * 10);
      g.ellipse(x, y + s * 0.2, s * 0.34 * k, s * 0.42 * k)
        .fill(MOUTH_INSIDE)
        .stroke(st);
      g.ellipse(x, y + s * 0.42, s * 0.22, s * 0.14).fill(TONGUE);
      return;
    }
    case 'lick':
      // Yum: a smile with the tongue licking one corner.
      g.moveTo(x - s * 0.5, y - s * 0.05)
        .quadraticCurveTo(x, y + s * 0.5, x + s * 0.5, y - s * 0.05)
        .stroke(st);
      g.ellipse(x + s * 0.34, y + s * 0.12 + Math.sin(time * 9) * s * 0.03, s * 0.15, s * 0.19)
        .fill(TONGUE)
        .stroke(stroke(Math.max(2, line * 0.7), lineColor));
      return;
    case 'tongue':
      // Bleh: a wavy mouth with the tongue hanging out.
      g.ellipse(x + s * 0.05, y + s * 0.32, s * 0.17, s * 0.26)
        .fill(TONGUE)
        .stroke(stroke(Math.max(2, line * 0.8), lineColor));
      g.moveTo(x + s * 0.05, y + s * 0.2)
        .lineTo(x + s * 0.05, y + s * 0.42)
        .stroke(stroke(Math.max(1.5, line * 0.5), 0xd9546e));
      g.moveTo(x - s * 0.45, y + s * 0.05);
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        g.lineTo(x - s * 0.45 + s * 0.9 * t, y + s * 0.05 + (i % 2 === 0 ? 0 : -s * 0.1));
      }
      g.stroke(st);
      return;
    case 'teeth': {
      // Gritted teeth: a wide grimace with a line between the rows.
      const w = s * 0.55;
      const h = s * 0.34;
      const thin = stroke(Math.max(2, line * 0.7), lineColor);
      g.roundRect(x - w, y - h * 0.4, w * 2, h * 1.3, h * 0.45)
        .fill(TOOTH)
        .stroke(thin);
      g.moveTo(x - w, y + h * 0.25)
        .lineTo(x + w, y + h * 0.25)
        .stroke(thin);
      for (const k of [-0.33, 0.33])
        g.moveTo(x + w * k, y - h * 0.4)
          .lineTo(x + w * k, y + h * 0.9)
          .stroke(thin);
      return;
    }
    case 'puff':
      // Cheeks puffed, lips pressed: holding something awful in.
      g.circle(x - s * 0.34, y + s * 0.12, s * 0.2).fill({ color: 0xb8e986, alpha: 0.9 });
      g.circle(x + s * 0.34, y + s * 0.12, s * 0.2).fill({ color: 0xb8e986, alpha: 0.9 });
      g.moveTo(x - s * 0.12, y + s * 0.12)
        .quadraticCurveTo(x, y + s * 0.02, x + s * 0.12, y + s * 0.12)
        .stroke(st);
      return;
  }
}
