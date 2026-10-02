import type { Graphics } from 'pixi.js';
import type { Glyph } from '../../../../game/data/glyphs';
import { OUTLINE, STAR, darken, lighten, stroke } from '../palette';
import { drawPicto } from './pictogram';

/**
 * The journal's hint pictograms (game design doc, sections 12 and 13), one
 * drawing per name in `GLYPHS`. Each draws centered on (x, y), about `s`
 * pixels across, in the game's flat style with the shared outline. Content
 * IDs (`item_*`, `bug_*`) are drawn by the journal as the thing itself;
 * `area_*` IDs have their own little icons here (`drawAreaIcon`).
 */

const RED = 0xe8453c;
const ORANGE = 0xff9f1c;
const YELLOW = STAR;
const GREEN = 0x7bd84a;
const GREEN_DARK = 0x3f9a34;
const BLUE = 0x4d9bff;
const SKY = 0x7ec8ff;
const PURPLE = 0x9b6bd6;
const PINK = 0xff8fab;
const BROWN = 0xa8744f;
const BROWN_DARK = 0x7a4e32;
const GREY = 0x9aa3b5;
const CREAM = 0xfffbef;
const WHITE = 0xffffff;
const GLOW = 0xd8ff4f;

/** Outline width for a glyph `s` across. */
const lw = (s: number, k = 1): number => Math.max(1.5, s * 0.055 * k);

function star(g: Graphics, x: number, y: number, r: number, color: number, w: number, points = 5): void {
  g.star(x, y, points, r, r * 0.48)
    .fill(color)
    .stroke(stroke(w));
}

function eye(g: Graphics, x: number, y: number, r: number, w: number, look = 0.25): void {
  g.circle(x, y, r).fill(WHITE).stroke(stroke(w));
  g.circle(x + r * look, y + r * 0.1, r * 0.48).fill(OUTLINE);
  g.circle(x + r * look - r * 0.15, y - r * 0.12, r * 0.15).fill(WHITE);
}

function drop(g: Graphics, x: number, y: number, r: number, color: number, w: number): void {
  g.moveTo(x, y - r * 1.6)
    .bezierCurveTo(x + r * 0.4, y - r * 0.9, x + r, y - r * 0.4, x + r, y + r * 0.15)
    .arc(x, y + r * 0.15, r, 0, Math.PI)
    .bezierCurveTo(x - r, y - r * 0.4, x - r * 0.4, y - r * 0.9, x, y - r * 1.6)
    .closePath()
    .fill(color)
    .stroke(stroke(w));
  g.ellipse(x - r * 0.38, y - r * 0.05, r * 0.2, r * 0.32).fill({ color: WHITE, alpha: 0.75 });
}

function note(g: Graphics, x: number, y: number, h: number, color: number, w: number): void {
  g.moveTo(x + h * 0.3, y + h * 0.55)
    .lineTo(x + h * 0.3, y - h * 0.8)
    .quadraticCurveTo(x + h * 0.75, y - h * 0.55, x + h * 0.75, y - h * 0.15)
    .stroke({ width: w * 1.6, color: OUTLINE, cap: 'round', join: 'round' });
  g.ellipse(x, y + h * 0.6, h * 0.38, h * 0.3)
    .fill(color)
    .stroke(stroke(w));
}

function bulb(g: Graphics, x: number, y: number, r: number, on: boolean, w: number): void {
  if (on) g.circle(x, y, r * 1.55).fill({ color: GLOW, alpha: 0.35 });
  g.circle(x, y, r)
    .fill(on ? 0xfff6a0 : 0xe8eef5)
    .stroke(stroke(w));
  g.roundRect(x - r * 0.5, y + r * 0.75, r, r * 0.6, r * 0.15)
    .fill(GREY)
    .stroke(stroke(w * 0.8));
  g.moveTo(x - r * 0.3, y + r * 0.1)
    .lineTo(x, y + r * 0.4)
    .lineTo(x + r * 0.3, y + r * 0.1)
    .stroke({ width: w * 0.7, color: ORANGE, cap: 'round' });
}

function hat(g: Graphics, x: number, y: number, s: number, color: number, w: number): void {
  g.ellipse(x, y + s * 0.28, s * 0.5, s * 0.12)
    .fill(darken(color, 0.15))
    .stroke(stroke(w));
  g.moveTo(x - s * 0.3, y + s * 0.26)
    .lineTo(x - s * 0.26, y - s * 0.3)
    .quadraticCurveTo(x, y - s * 0.42, x + s * 0.26, y - s * 0.3)
    .lineTo(x + s * 0.3, y + s * 0.26)
    .closePath()
    .fill(color)
    .stroke(stroke(w));
  g.rect(x - s * 0.28, y + s * 0.05, s * 0.56, s * 0.1).fill(YELLOW);
}

function mushroom(g: Graphics, x: number, y: number, s: number, w: number): void {
  g.roundRect(x - s * 0.13, y - s * 0.05, s * 0.26, s * 0.45, s * 0.08)
    .fill(CREAM)
    .stroke(stroke(w));
  g.moveTo(x - s * 0.45, y)
    .quadraticCurveTo(x - s * 0.42, y - s * 0.5, x, y - s * 0.5)
    .quadraticCurveTo(x + s * 0.42, y - s * 0.5, x + s * 0.45, y)
    .closePath()
    .fill(RED)
    .stroke(stroke(w));
  g.circle(x - s * 0.18, y - s * 0.24, s * 0.07).fill(WHITE);
  g.circle(x + s * 0.14, y - s * 0.32, s * 0.06).fill(WHITE);
  g.circle(x + s * 0.24, y - s * 0.1, s * 0.05).fill(WHITE);
}

function coin(g: Graphics, x: number, y: number, r: number, w: number): void {
  g.circle(x, y, r).fill(0xf2c14e).stroke(stroke(w));
  g.circle(x, y, r * 0.62).stroke({ width: w * 0.6, color: darken(0xf2c14e, 0.3) });
  g.circle(x - r * 0.35, y - r * 0.35, r * 0.15).fill({ color: WHITE, alpha: 0.8 });
}

function firefly(g: Graphics, x: number, y: number, r: number, w: number): void {
  g.circle(x - r * 0.4, y + r * 0.3, r * 0.9).fill({ color: GLOW, alpha: 0.45 });
  g.ellipse(x - r * 0.4, y + r * 0.3, r * 0.5, r * 0.45)
    .fill(GLOW)
    .stroke(stroke(w));
  g.ellipse(x + r * 0.2, y - r * 0.1, r * 0.45, r * 0.35)
    .fill(0x2b2438)
    .stroke(stroke(w));
  g.circle(x + r * 0.6, y - r * 0.3, r * 0.25)
    .fill(0xe85a2e)
    .stroke(stroke(w * 0.8));
  g.ellipse(x + r * 0.1, y - r * 0.55, r * 0.35, r * 0.2)
    .fill({ color: WHITE, alpha: 0.8 })
    .stroke(stroke(w * 0.6));
}

/** Draw one glyph. */
export function drawGlyph(g: Graphics, name: Glyph, x: number, y: number, s: number): void {
  const h = s / 2;
  const w = lw(s);
  switch (name) {
    case 'moon':
      drawPicto(g, 'moon', x, y, s);
      return;
    case 'sun':
      drawPicto(g, 'sun', x, y, s);
      return;
    case 'snow':
      drawPicto(g, 'snow', x, y, s);
      return;
    case 'cloud': {
      g.moveTo(x - h * 0.8, y + h * 0.4)
        .arc(x - h * 0.45, y + h * 0.05, h * 0.38, Math.PI * 0.65, Math.PI * 1.55)
        .arc(x + h * 0.05, y - h * 0.15, h * 0.5, Math.PI * 1.1, Math.PI * 1.9)
        .arc(x + h * 0.55, y + h * 0.1, h * 0.35, Math.PI * 1.4, Math.PI * 0.4)
        .closePath()
        .fill(WHITE)
        .stroke(stroke(w));
      return;
    }
    case 'rainbow': {
      const bands = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE];
      const r0 = h * 0.95;
      const bw = h * 0.12;
      g.arc(x, y + h * 0.45, r0 + w / 2, Math.PI, 0).stroke(stroke(w));
      bands.forEach((c, i) => {
        g.arc(x, y + h * 0.45, r0 - bw * (i + 0.5), Math.PI, 0).stroke({ width: bw, color: c });
      });
      g.arc(x, y + h * 0.45, r0 - bw * 6 - w / 2, Math.PI, 0).stroke(stroke(w));
      for (const dx of [-0.72, 0.72])
        g.ellipse(x + h * dx, y + h * 0.5, h * 0.28, h * 0.16)
          .fill(WHITE)
          .stroke(stroke(w * 0.8));
      return;
    }
    case 'eye': {
      g.moveTo(x - h, y)
        .quadraticCurveTo(x, y - h * 0.95, x + h, y)
        .quadraticCurveTo(x, y + h * 0.95, x - h, y)
        .closePath()
        .fill(WHITE)
        .stroke(stroke(w));
      g.circle(x, y, h * 0.4)
        .fill(0x4d9bff)
        .stroke(stroke(w * 0.7));
      g.circle(x, y, h * 0.2).fill(OUTLINE);
      g.circle(x - h * 0.12, y - h * 0.12, h * 0.08).fill(WHITE);
      return;
    }
    case 'knock': {
      // A fist knocking, with impact lines.
      g.roundRect(x - h * 0.55, y - h * 0.35, h * 0.85, h * 0.75, h * 0.25)
        .fill(0xffd9b8)
        .stroke(stroke(w));
      for (const dy of [-0.15, 0.1])
        g.moveTo(x - h * 0.2, y + h * dy)
          .lineTo(x + h * 0.25, y + h * dy)
          .stroke(stroke(w * 0.6));
      for (const [a, b] of [
        [-0.5, -0.3],
        [0, 0],
        [0.5, 0.3],
      ] as const)
        g.moveTo(x + h * 0.55, y + h * a * 0.8)
          .lineTo(x + h * 0.95, y + h * b * 1.6)
          .stroke({ width: w, color: ORANGE, cap: 'round' });
      return;
    }
    case 'blinks': {
      eye(g, x - h * 0.4, y, h * 0.32, w);
      // The other eye mid-blink.
      g.moveTo(x + h * 0.1, y)
        .quadraticCurveTo(x + h * 0.4, y + h * 0.28, x + h * 0.7, y)
        .stroke(stroke(w));
      for (const dx of [-0.5, 0, 0.5])
        g.moveTo(x + h * 0.4 + dx * h * 0.5, y - h * 0.45)
          .lineTo(x + h * 0.4 + dx * h * 0.8, y - h * 0.8)
          .stroke({ width: w * 0.8, color: YELLOW, cap: 'round' });
      return;
    }
    case 'feet': {
      for (const [dx, dy, rot] of [
        [-0.35, 0.3, -0.2],
        [0.35, -0.25, 0.2],
      ] as const) {
        const fx = x + h * dx;
        const fy = y + h * dy;
        g.ellipse(fx, fy, h * 0.22, h * 0.36)
          .fill(BROWN)
          .stroke(stroke(w * 0.8));
        for (const t of [-1, 0, 1])
          g.circle(fx + t * h * 0.14 + rot * h, fy - h * 0.45, h * 0.08)
            .fill(BROWN)
            .stroke(stroke(w * 0.6));
      }
      return;
    }
    case 'arcs': {
      // A thing thrown in an arc, with a dotted path.
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const px = x - h * 0.85 + t * h * 1.4;
        const py = y + h * 0.6 - Math.sin(t * Math.PI) * h * 1.1;
        g.circle(px, py, h * 0.06).fill(OUTLINE);
      }
      g.circle(x + h * 0.7, y + h * 0.45, h * 0.24)
        .fill(RED)
        .stroke(stroke(w));
      return;
    }
    case 'flip': {
      // A round arrow turning over.
      g.arc(x, y, h * 0.65, Math.PI * 0.15, Math.PI * 1.65).stroke({
        width: w * 2.4,
        color: OUTLINE,
        cap: 'round',
      });
      g.arc(x, y, h * 0.65, Math.PI * 0.15, Math.PI * 1.65).stroke({
        width: w * 1.2,
        color: BLUE,
        cap: 'round',
      });
      const ax = x + Math.cos(Math.PI * 1.65) * h * 0.65;
      const ay = y + Math.sin(Math.PI * 1.65) * h * 0.65;
      g.poly([ax - h * 0.25, ay - h * 0.2, ax + h * 0.3, ay - h * 0.05, ax - h * 0.05, ay + h * 0.35])
        .fill(BLUE)
        .stroke(stroke(w * 0.8));
      return;
    }
    case 'stack': {
      const colors = [RED, YELLOW, BLUE];
      colors.forEach((c, i) => {
        g.roundRect(
          x - h * (0.6 - i * 0.1),
          y + h * (0.45 - i * 0.48),
          h * (1.2 - i * 0.2),
          h * 0.42,
          h * 0.08,
        )
          .fill(c)
          .stroke(stroke(w));
      });
      return;
    }
    case 'note':
      note(g, x - h * 0.15, y, h, BLUE, w);
      return;
    case 'notes3':
      note(g, x - h * 0.6, y + h * 0.2, h * 0.55, BLUE, w * 0.8);
      note(g, x - h * 0.05, y - h * 0.25, h * 0.55, PINK, w * 0.8);
      note(g, x + h * 0.5, y + h * 0.15, h * 0.55, GREEN, w * 0.8);
      return;
    case 'grid': {
      // The mushroom sequencer's grid: 4 by 3 caps, some lit.
      g.roundRect(x - h, y - h * 0.75, h * 2, h * 1.5, h * 0.15)
        .fill(BROWN_DARK)
        .stroke(stroke(w));
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 4; c++) {
          const on = (r * 4 + c) % 3 === 0;
          g.circle(x - h * 0.66 + c * h * 0.44, y - h * 0.42 + r * h * 0.42, h * 0.15)
            .fill(on ? RED : 0xd9c3a5)
            .stroke(stroke(w * 0.5));
        }
      return;
    }
    case 'dial': {
      g.circle(x, y, h * 0.9)
        .fill(0xe8e0d0)
        .stroke(stroke(w));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(x + Math.cos(a) * h * 0.62, y + Math.sin(a) * h * 0.62)
          .lineTo(x + Math.cos(a) * h * 0.78, y + Math.sin(a) * h * 0.78)
          .stroke({ width: w * 0.7, color: OUTLINE, cap: 'round' });
      }
      g.poly([x, y - h * 0.08, x + h * 0.62, y - h * 0.45, x + h * 0.08, y + h * 0.08]).fill(OUTLINE);
      g.circle(x, y, h * 0.1)
        .fill(YELLOW)
        .stroke(stroke(w * 0.6));
      return;
    }
    case 'worm': {
      g.moveTo(x - h * 0.85, y + h * 0.35)
        .bezierCurveTo(x - h * 0.5, y - h * 0.4, x - h * 0.1, y + h * 0.7, x + h * 0.3, y)
        .quadraticCurveTo(x + h * 0.5, y - h * 0.35, x + h * 0.75, y - h * 0.2)
        .stroke({ width: h * 0.44, color: OUTLINE, cap: 'round', join: 'round' });
      g.moveTo(x - h * 0.85, y + h * 0.35)
        .bezierCurveTo(x - h * 0.5, y - h * 0.4, x - h * 0.1, y + h * 0.7, x + h * 0.3, y)
        .quadraticCurveTo(x + h * 0.5, y - h * 0.35, x + h * 0.75, y - h * 0.2)
        .stroke({ width: h * 0.3, color: PINK, cap: 'round', join: 'round' });
      g.circle(x + h * 0.72, y - h * 0.26, h * 0.06).fill(OUTLINE);
      return;
    }
    case 'boot': {
      g.moveTo(x - h * 0.45, y - h * 0.85)
        .lineTo(x + h * 0.1, y - h * 0.85)
        .lineTo(x + h * 0.15, y + h * 0.1)
        .quadraticCurveTo(x + h * 0.85, y + h * 0.15, x + h * 0.85, y + h * 0.55)
        .lineTo(x + h * 0.85, y + h * 0.75)
        .lineTo(x - h * 0.5, y + h * 0.75)
        .closePath()
        .fill(0x6b4a8a)
        .stroke(stroke(w));
      g.rect(x - h * 0.5, y + h * 0.55, h * 1.35, h * 0.2).fill(OUTLINE);
      g.moveTo(x - h * 0.42, y - h * 0.6)
        .lineTo(x + h * 0.08, y - h * 0.6)
        .stroke({ width: w * 0.8, color: YELLOW });
      return;
    }
    case 'coins':
      coin(g, x - h * 0.35, y + h * 0.3, h * 0.38, w);
      coin(g, x + h * 0.35, y + h * 0.3, h * 0.38, w);
      coin(g, x, y - h * 0.3, h * 0.38, w);
      return;
    case 'frog': {
      g.ellipse(x, y + h * 0.2, h * 0.85, h * 0.6)
        .fill(GREEN)
        .stroke(stroke(w));
      eye(g, x - h * 0.4, y - h * 0.4, h * 0.28, w);
      eye(g, x + h * 0.4, y - h * 0.4, h * 0.28, w);
      g.moveTo(x - h * 0.45, y + h * 0.25)
        .quadraticCurveTo(x, y + h * 0.55, x + h * 0.45, y + h * 0.25)
        .stroke(stroke(w));
      return;
    }
    case 'firefly':
      firefly(g, x, y, h, w);
      return;
    case 'drop':
      drop(g, x, y + h * 0.25, h * 0.55, BLUE, w);
      return;
    case 'drops3':
      drop(g, x - h * 0.5, y + h * 0.4, h * 0.3, BLUE, w * 0.8);
      drop(g, x + h * 0.5, y + h * 0.4, h * 0.3, BLUE, w * 0.8);
      drop(g, x, y - h * 0.15, h * 0.3, BLUE, w * 0.8);
      return;
    case 'drops5':
      for (const [dx, dy] of [
        [-0.65, 0.5],
        [0, 0.5],
        [0.65, 0.5],
        [-0.32, -0.15],
        [0.32, -0.15],
      ] as const)
        drop(g, x + h * dx, y + h * dy, h * 0.22, BLUE, w * 0.7);
      return;
    case 'stage': {
      g.rect(x - h, y + h * 0.15, h * 2, h * 0.5)
        .fill(BROWN)
        .stroke(stroke(w));
      // Curtains.
      g.moveTo(x - h, y - h * 0.85)
        .lineTo(x - h * 0.35, y - h * 0.85)
        .quadraticCurveTo(x - h * 0.55, y - h * 0.2, x - h, y + h * 0.15)
        .closePath()
        .fill(RED)
        .stroke(stroke(w));
      g.moveTo(x + h, y - h * 0.85)
        .lineTo(x + h * 0.35, y - h * 0.85)
        .quadraticCurveTo(x + h * 0.55, y - h * 0.2, x + h, y + h * 0.15)
        .closePath()
        .fill(RED)
        .stroke(stroke(w));
      star(g, x, y - h * 0.25, h * 0.28, YELLOW, w * 0.7);
      return;
    }
    case 'moth': {
      for (const sx of [-1, 1]) {
        g.ellipse(x + sx * h * 0.45, y - h * 0.15, h * 0.48, h * 0.38)
          .fill(0xd8c9b0)
          .stroke(stroke(w));
        g.ellipse(x + sx * h * 0.35, y + h * 0.35, h * 0.3, h * 0.25)
          .fill(0xc2b092)
          .stroke(stroke(w));
        g.circle(x + sx * h * 0.45, y - h * 0.15, h * 0.12).fill(BROWN_DARK);
      }
      g.ellipse(x, y + h * 0.05, h * 0.14, h * 0.5)
        .fill(0x8a7a66)
        .stroke(stroke(w));
      for (const sx of [-1, 1])
        g.moveTo(x, y - h * 0.4)
          .quadraticCurveTo(x + sx * h * 0.2, y - h * 0.8, x + sx * h * 0.4, y - h * 0.85)
          .stroke(stroke(w * 0.7));
      return;
    }
    case 'light':
      bulb(g, x, y - h * 0.15, h * 0.55, true, w);
      return;
    case 'lights3':
      g.moveTo(x - h, y - h * 0.6)
        .quadraticCurveTo(x, y - h * 0.1, x + h, y - h * 0.6)
        .stroke(stroke(w * 0.7));
      for (const [dx, dy, c] of [
        [-0.6, -0.25, RED],
        [0, -0.05, YELLOW],
        [0.6, -0.25, BLUE],
      ] as const) {
        g.circle(x + h * dx, y + h * dy + h * 0.35, h * 0.38).fill({ color: c, alpha: 0.3 });
        g.ellipse(x + h * dx, y + h * dy + h * 0.32, h * 0.2, h * 0.28)
          .fill(c)
          .stroke(stroke(w * 0.8));
      }
      return;
    case 'bulb':
      bulb(g, x, y - h * 0.15, h * 0.55, false, w);
      return;
    case 'bee': {
      g.ellipse(x - h * 0.1, y - h * 0.55, h * 0.3, h * 0.2)
        .fill({ color: WHITE, alpha: 0.9 })
        .stroke(stroke(w * 0.7));
      g.ellipse(x + h * 0.25, y - h * 0.5, h * 0.3, h * 0.2)
        .fill({ color: WHITE, alpha: 0.9 })
        .stroke(stroke(w * 0.7));
      g.ellipse(x, y, h * 0.7, h * 0.48)
        .fill(YELLOW)
        .stroke(stroke(w));
      for (const dx of [-0.25, 0.15]) g.rect(x + h * dx, y - h * 0.44, h * 0.16, h * 0.88).fill(OUTLINE);
      g.ellipse(x, y, h * 0.7, h * 0.48).stroke(stroke(w));
      g.circle(x + h * 0.5, y - h * 0.08, h * 0.08).fill(OUTLINE);
      g.poly([x - h * 0.7, y - h * 0.08, x - h * 0.95, y, x - h * 0.7, y + h * 0.08]).fill(OUTLINE);
      return;
    }
    case 'cricket': {
      g.moveTo(x - h * 0.3, y + h * 0.1)
        .lineTo(x - h * 0.75, y - h * 0.45)
        .lineTo(x - h * 0.9, y + h * 0.5)
        .stroke({ width: w * 1.2, color: darken(GREEN_DARK, 0.2), cap: 'round', join: 'round' });
      g.ellipse(x, y + h * 0.1, h * 0.65, h * 0.32)
        .fill(GREEN_DARK)
        .stroke(stroke(w));
      g.circle(x + h * 0.6, y - h * 0.05, h * 0.25)
        .fill(GREEN_DARK)
        .stroke(stroke(w));
      g.circle(x + h * 0.68, y - h * 0.12, h * 0.08).fill(OUTLINE);
      g.moveTo(x + h * 0.7, y - h * 0.25)
        .quadraticCurveTo(x + h * 0.9, y - h * 0.9, x + h * 0.4, y - h * 0.95)
        .stroke(stroke(w * 0.6));
      // Chirp marks.
      for (const r of [0.25, 0.45])
        g.arc(x - h * 0.1, y - h * 0.3, h * r, -Math.PI * 0.8, -Math.PI * 0.2).stroke({
          width: w * 0.7,
          color: ORANGE,
          cap: 'round',
        });
      return;
    }
    case 'leaf_bitten': {
      g.moveTo(x - h * 0.85, y + h * 0.6)
        .quadraticCurveTo(x - h * 0.8, y - h * 0.7, x + h * 0.75, y - h * 0.75)
        .quadraticCurveTo(x + h * 0.95, y - h * 0.3, x + h * 0.65, y - h * 0.15)
        .arc(x + h * 0.5, y + h * 0.05, h * 0.22, -Math.PI * 0.3, Math.PI * 0.9, true)
        .arc(x + h * 0.15, y + h * 0.35, h * 0.2, -Math.PI * 0.2, Math.PI * 1.0, true)
        .quadraticCurveTo(x - h * 0.3, y + h * 0.75, x - h * 0.85, y + h * 0.6)
        .closePath()
        .fill(GREEN)
        .stroke(stroke(w));
      g.moveTo(x - h * 0.8, y + h * 0.55)
        .lineTo(x + h * 0.4, y - h * 0.45)
        .stroke({ width: w * 0.7, color: GREEN_DARK, cap: 'round' });
      return;
    }
    case 'cocoon': {
      g.moveTo(x, y - h)
        .lineTo(x, y - h * 0.6)
        .stroke(stroke(w));
      g.ellipse(x, y + h * 0.05, h * 0.42, h * 0.68)
        .fill(0xd9c8a0)
        .stroke(stroke(w));
      for (const dy of [-0.3, 0, 0.3])
        g.moveTo(x - h * 0.35, y + h * dy)
          .quadraticCurveTo(x, y + h * (dy + 0.15), x + h * 0.35, y + h * dy)
          .stroke({ width: w * 0.6, color: darken(0xd9c8a0, 0.3) });
      return;
    }
    case 'pot_eyes': {
      g.moveTo(x - h * 0.75, y - h * 0.2)
        .lineTo(x + h * 0.75, y - h * 0.2)
        .lineTo(x + h * 0.55, y + h * 0.8)
        .lineTo(x - h * 0.55, y + h * 0.8)
        .closePath()
        .fill(0xd9774a)
        .stroke(stroke(w));
      g.roundRect(x - h * 0.85, y - h * 0.4, h * 1.7, h * 0.28, h * 0.08)
        .fill(0xe8875a)
        .stroke(stroke(w));
      g.rect(x - h * 0.6, y - h * 0.12, h * 1.2, h * 0.04).fill(OUTLINE);
      eye(g, x - h * 0.22, y + h * 0.2, h * 0.17, w * 0.7);
      eye(g, x + h * 0.22, y + h * 0.2, h * 0.17, w * 0.7);
      return;
    }
    case 'gap': {
      // Two planks with a dark gap between.
      g.rect(x - h, y - h * 0.4, h * 0.8, h * 0.8)
        .fill(BROWN)
        .stroke(stroke(w));
      g.rect(x + h * 0.2, y - h * 0.4, h * 0.8, h * 0.8)
        .fill(BROWN)
        .stroke(stroke(w));
      g.rect(x - h * 0.2, y - h * 0.4, h * 0.4, h * 0.8).fill(OUTLINE);
      eye(g, x - h * 0.07, y + h * 0.05, h * 0.09, w * 0.4);
      eye(g, x + h * 0.08, y + h * 0.05, h * 0.09, w * 0.4);
      return;
    }
    case 'spider': {
      g.moveTo(x, y - h)
        .lineTo(x, y - h * 0.3)
        .stroke({ width: w * 0.6, color: OUTLINE });
      for (const sx of [-1, 1])
        for (const k of [0, 1, 2, 3]) {
          const a = -0.5 + k * 0.38;
          g.moveTo(x, y + h * 0.05)
            .lineTo(x + sx * h * 0.55, y + h * (a - 0.15))
            .lineTo(x + sx * h * 0.85, y + h * (a + 0.3))
            .stroke({ width: w * 0.8, color: OUTLINE, cap: 'round', join: 'round' });
        }
      g.circle(x, y + h * 0.05, h * 0.38)
        .fill(0x3a2a40)
        .stroke(stroke(w));
      eye(g, x - h * 0.13, y, h * 0.1, w * 0.4, 0);
      eye(g, x + h * 0.13, y, h * 0.1, w * 0.4, 0);
      return;
    }
    case 'tunnel': {
      g.moveTo(x - h, y + h * 0.7)
        .lineTo(x - h, y - h * 0.1)
        .arc(x, y - h * 0.1, h, Math.PI, 0)
        .lineTo(x + h, y + h * 0.7)
        .closePath()
        .fill(GREY)
        .stroke(stroke(w));
      g.moveTo(x - h * 0.6, y + h * 0.7)
        .lineTo(x - h * 0.6, y)
        .arc(x, y, h * 0.6, Math.PI, 0)
        .lineTo(x + h * 0.6, y + h * 0.7)
        .closePath()
        .fill(OUTLINE);
      return;
    }
    case 'bottle': {
      g.roundRect(x - h * 0.18, y - h * 0.95, h * 0.36, h * 0.25, h * 0.06)
        .fill(0xc9a07a)
        .stroke(stroke(w * 0.8));
      g.moveTo(x - h * 0.15, y - h * 0.7)
        .lineTo(x - h * 0.15, y - h * 0.4)
        .quadraticCurveTo(x - h * 0.65, y - h * 0.25, x - h * 0.65, y + h * 0.25)
        .quadraticCurveTo(x - h * 0.6, y + h * 0.85, x, y + h * 0.85)
        .quadraticCurveTo(x + h * 0.6, y + h * 0.85, x + h * 0.65, y + h * 0.25)
        .quadraticCurveTo(x + h * 0.65, y - h * 0.25, x + h * 0.15, y - h * 0.4)
        .lineTo(x + h * 0.15, y - h * 0.7)
        .closePath()
        .fill(0xcfeeff)
        .stroke(stroke(w));
      g.ellipse(x, y + h * 0.35, h * 0.5, h * 0.4).fill(PURPLE);
      g.ellipse(x - h * 0.3, y + h * 0.05, h * 0.08, h * 0.2).fill({ color: WHITE, alpha: 0.8 });
      return;
    }
    case 'fly': {
      g.ellipse(x - h * 0.3, y - h * 0.45, h * 0.35, h * 0.22)
        .fill({ color: SKY, alpha: 0.7 })
        .stroke(stroke(w * 0.6));
      g.ellipse(x + h * 0.25, y - h * 0.5, h * 0.35, h * 0.22)
        .fill({ color: SKY, alpha: 0.7 })
        .stroke(stroke(w * 0.6));
      g.ellipse(x, y, h * 0.48, h * 0.34)
        .fill(0x3d3d52)
        .stroke(stroke(w));
      g.circle(x + h * 0.42, y - h * 0.05, h * 0.2)
        .fill(RED)
        .stroke(stroke(w * 0.7));
      for (const dx of [-0.25, 0.05, 0.3])
        g.moveTo(x + h * dx, y + h * 0.3)
          .lineTo(x + h * dx * 1.3, y + h * 0.6)
          .stroke(stroke(w * 0.6));
      return;
    }
    case 'beetle_back': {
      // A beetle on its back, legs in the air.
      for (const dx of [-0.45, 0, 0.45])
        g.moveTo(x + h * dx, y - h * 0.1)
          .lineTo(x + h * dx * 1.2, y - h * 0.6)
          .lineTo(x + h * dx * 1.5 + h * 0.1, y - h * 0.75)
          .stroke({ width: w * 0.8, color: OUTLINE, cap: 'round', join: 'round' });
      g.moveTo(x - h * 0.85, y + h * 0.1)
        .quadraticCurveTo(x, y + h * 0.95, x + h * 0.85, y + h * 0.1)
        .closePath()
        .fill(0x3b6fd6)
        .stroke(stroke(w));
      g.ellipse(x, y + h * 0.08, h * 0.7, h * 0.18)
        .fill(0xa3b8e6)
        .stroke(stroke(w * 0.8));
      return;
    }
    case 'hat':
      hat(g, x, y, s, PURPLE, w);
      return;
    case 'hats':
      hat(g, x - h * 0.4, y + h * 0.25, s * 0.55, RED, w * 0.7);
      hat(g, x + h * 0.4, y + h * 0.25, s * 0.55, BLUE, w * 0.7);
      hat(g, x, y - h * 0.3, s * 0.55, YELLOW, w * 0.7);
      return;
    case 'chubby': {
      g.circle(x, y + h * 0.1, h * 0.85)
        .fill(PINK)
        .stroke(stroke(w));
      eye(g, x - h * 0.3, y - h * 0.1, h * 0.16, w * 0.6, 0);
      eye(g, x + h * 0.3, y - h * 0.1, h * 0.16, w * 0.6, 0);
      g.circle(x - h * 0.55, y + h * 0.2, h * 0.14).fill({ color: RED, alpha: 0.4 });
      g.circle(x + h * 0.55, y + h * 0.2, h * 0.14).fill({ color: RED, alpha: 0.4 });
      g.moveTo(x - h * 0.15, y + h * 0.3)
        .quadraticCurveTo(x, y + h * 0.45, x + h * 0.15, y + h * 0.3)
        .stroke(stroke(w * 0.7));
      return;
    }
    case 'spring_big':
      drawPicto(g, 'spring', x, y, s * 1.1);
      return;
    case 'claw': {
      g.rect(x - h * 0.08, y - h, h * 0.16, h * 0.7)
        .fill(GREY)
        .stroke(stroke(w * 0.7));
      g.roundRect(x - h * 0.35, y - h * 0.38, h * 0.7, h * 0.28, h * 0.08)
        .fill(RED)
        .stroke(stroke(w));
      for (const sx of [-1, 1])
        g.moveTo(x + sx * h * 0.25, y - h * 0.12)
          .quadraticCurveTo(x + sx * h * 0.75, y + h * 0.3, x + sx * h * 0.25, y + h * 0.75)
          .stroke({ width: w * 1.3, color: OUTLINE, cap: 'round' });
      g.circle(x, y + h * 0.45, h * 0.22)
        .fill(PINK)
        .stroke(stroke(w * 0.7));
      return;
    }
    case 'prize3':
      for (const [dx, c] of [
        [-0.6, RED],
        [0, YELLOW],
        [0.6, BLUE],
      ] as const) {
        g.roundRect(x + h * dx - h * 0.25, y - h * 0.1, h * 0.5, h * 0.5, h * 0.06)
          .fill(c)
          .stroke(stroke(w * 0.8));
        g.rect(x + h * dx - h * 0.05, y - h * 0.1, h * 0.1, h * 0.5).fill(lighten(c, 0.5));
        g.circle(x + h * dx - h * 0.1, y - h * 0.18, h * 0.1).stroke(stroke(w * 0.6));
        g.circle(x + h * dx + h * 0.1, y - h * 0.18, h * 0.1).stroke(stroke(w * 0.6));
      }
      return;
    case 'slide': {
      g.moveTo(x - h * 0.8, y - h * 0.7)
        .quadraticCurveTo(x - h * 0.2, y + h * 0.7, x + h * 0.9, y + h * 0.65)
        .stroke({ width: h * 0.3, color: OUTLINE, cap: 'round' });
      g.moveTo(x - h * 0.8, y - h * 0.7)
        .quadraticCurveTo(x - h * 0.2, y + h * 0.7, x + h * 0.9, y + h * 0.65)
        .stroke({ width: h * 0.18, color: YELLOW, cap: 'round' });
      g.moveTo(x - h * 0.85, y - h * 0.7)
        .lineTo(x - h * 0.85, y + h * 0.8)
        .stroke(stroke(w));
      return;
    }
    case 'window': {
      g.roundRect(x - h * 0.8, y - h * 0.8, h * 1.6, h * 1.6, h * 0.12)
        .fill(SKY)
        .stroke(stroke(w));
      g.moveTo(x, y - h * 0.8)
        .lineTo(x, y + h * 0.8)
        .moveTo(x - h * 0.8, y)
        .lineTo(x + h * 0.8, y)
        .stroke({ width: w * 1.2, color: BROWN });
      g.roundRect(x - h * 0.8, y - h * 0.8, h * 1.6, h * 1.6, h * 0.12).stroke(stroke(w));
      g.moveTo(x - h * 0.6, y - h * 0.3)
        .lineTo(x - h * 0.3, y - h * 0.6)
        .stroke({ width: w * 0.8, color: WHITE, cap: 'round' });
      return;
    }
    case 'crown': {
      g.poly([
        x - h * 0.8,
        y + h * 0.5,
        x - h * 0.8,
        y - h * 0.4,
        x - h * 0.4,
        y,
        x,
        y - h * 0.65,
        x + h * 0.4,
        y,
        x + h * 0.8,
        y - h * 0.4,
        x + h * 0.8,
        y + h * 0.5,
      ])
        .fill(YELLOW)
        .stroke(stroke(w));
      g.circle(x, y + h * 0.15, h * 0.13)
        .fill(RED)
        .stroke(stroke(w * 0.5));
      for (const dx of [-0.8, 0, 0.8])
        g.circle(x + h * dx, y + h * (dx === 0 ? -0.7 : -0.45), h * 0.1)
          .fill(WHITE)
          .stroke(stroke(w * 0.5));
      return;
    }
    case 'root': {
      g.rect(x - h, y - h * 0.9, h * 2, h * 0.35)
        .fill(GREEN)
        .stroke(stroke(w));
      g.moveTo(x, y - h * 0.55)
        .bezierCurveTo(x - h * 0.1, y, x + h * 0.3, y + h * 0.2, x + h * 0.1, y + h * 0.85)
        .moveTo(x + h * 0.02, y - h * 0.1)
        .quadraticCurveTo(x - h * 0.5, y + h * 0.1, x - h * 0.6, y + h * 0.6)
        .moveTo(x + h * 0.15, y + h * 0.2)
        .quadraticCurveTo(x + h * 0.6, y + h * 0.3, x + h * 0.7, y + h * 0.6)
        .stroke({ width: w * 2.2, color: OUTLINE, cap: 'round' });
      g.moveTo(x, y - h * 0.55)
        .bezierCurveTo(x - h * 0.1, y, x + h * 0.3, y + h * 0.2, x + h * 0.1, y + h * 0.85)
        .moveTo(x + h * 0.02, y - h * 0.1)
        .quadraticCurveTo(x - h * 0.5, y + h * 0.1, x - h * 0.6, y + h * 0.6)
        .moveTo(x + h * 0.15, y + h * 0.2)
        .quadraticCurveTo(x + h * 0.6, y + h * 0.3, x + h * 0.7, y + h * 0.6)
        .stroke({ width: w * 1.1, color: 0xd9b78a, cap: 'round' });
      return;
    }
    case 'ants':
      for (const [dx, dy] of [
        [-0.55, 0.35],
        [0.05, 0.05],
        [0.6, -0.3],
      ] as const) {
        const ax = x + h * dx;
        const ay = y + h * dy;
        for (const k of [-1, 0, 1])
          g.moveTo(ax + k * h * 0.12, ay)
            .lineTo(ax + k * h * 0.2, ay + h * 0.2)
            .stroke({ width: w * 0.5, color: OUTLINE, cap: 'round' });
        g.circle(ax - h * 0.17, ay, h * 0.12)
          .fill(0x8a2e1f)
          .stroke(stroke(w * 0.5));
        g.circle(ax, ay - h * 0.02, h * 0.09)
          .fill(0x8a2e1f)
          .stroke(stroke(w * 0.5));
        g.circle(ax + h * 0.16, ay - h * 0.05, h * 0.1)
          .fill(0x8a2e1f)
          .stroke(stroke(w * 0.5));
      }
      return;
    case 'map': {
      const pts = [-0.85, -0.3, 0.3, 0.85];
      for (let i = 0; i < 3; i++) {
        const x0 = x + h * pts[i]!;
        const x1 = x + h * pts[i + 1]!;
        const up = i % 2 === 0 ? -0.08 : 0.08;
        g.poly([
          x0,
          y - h * (0.6 + up),
          x1,
          y - h * (0.6 - up),
          x1,
          y + h * (0.6 + up),
          x0,
          y + h * (0.6 - up),
        ])
          .fill(i % 2 === 0 ? 0xf3e2b8 : 0xe6cf98)
          .stroke(stroke(w * 0.8));
      }
      g.moveTo(x - h * 0.6, y + h * 0.3)
        .lineTo(x - h * 0.2, y)
        .lineTo(x + h * 0.15, y + h * 0.2)
        .stroke({ width: w * 0.6, color: RED, cap: 'round' });
      g.moveTo(x + h * 0.35, y - h * 0.25)
        .lineTo(x + h * 0.6, y)
        .moveTo(x + h * 0.6, y - h * 0.25)
        .lineTo(x + h * 0.35, y)
        .stroke({ width: w * 0.9, color: RED, cap: 'round' });
      return;
    }
    case 'gnome': {
      g.moveTo(x - h * 0.5, y - h * 0.15)
        .lineTo(x, y - h)
        .lineTo(x + h * 0.5, y - h * 0.15)
        .closePath()
        .fill(RED)
        .stroke(stroke(w));
      g.circle(x, y + h * 0.05, h * 0.32)
        .fill(0xffd9b8)
        .stroke(stroke(w));
      g.moveTo(x - h * 0.4, y + h * 0.1)
        .quadraticCurveTo(x, y + h * 1.05, x + h * 0.4, y + h * 0.1)
        .quadraticCurveTo(x, y + h * 0.35, x - h * 0.4, y + h * 0.1)
        .fill(WHITE)
        .stroke(stroke(w * 0.8));
      g.circle(x, y + h * 0.12, h * 0.12)
        .fill(0xff9f8a)
        .stroke(stroke(w * 0.6));
      g.circle(x - h * 0.13, y - h * 0.05, h * 0.05).fill(OUTLINE);
      g.circle(x + h * 0.13, y - h * 0.05, h * 0.05).fill(OUTLINE);
      return;
    }
    case 'stars':
      star(g, x - h * 0.45, y + h * 0.3, h * 0.38, YELLOW, w * 0.8);
      star(g, x + h * 0.4, y - h * 0.3, h * 0.32, YELLOW, w * 0.8);
      star(g, x + h * 0.55, y + h * 0.55, h * 0.2, YELLOW, w * 0.6);
      return;
    case 'x_mark':
      g.moveTo(x - h * 0.65, y - h * 0.65)
        .lineTo(x + h * 0.65, y + h * 0.65)
        .moveTo(x + h * 0.65, y - h * 0.65)
        .lineTo(x - h * 0.65, y + h * 0.65)
        .stroke({ width: h * 0.45, color: OUTLINE, cap: 'round' });
      g.moveTo(x - h * 0.65, y - h * 0.65)
        .lineTo(x + h * 0.65, y + h * 0.65)
        .moveTo(x + h * 0.65, y - h * 0.65)
        .lineTo(x - h * 0.65, y + h * 0.65)
        .stroke({ width: h * 0.27, color: RED, cap: 'round' });
      return;
    case 'pedestal': {
      g.rect(x - h * 0.45, y - h * 0.1, h * 0.9, h * 0.75)
        .fill(0xe8e0d0)
        .stroke(stroke(w));
      g.rect(x - h * 0.65, y + h * 0.6, h * 1.3, h * 0.25)
        .fill(0xd2c8b4)
        .stroke(stroke(w));
      g.rect(x - h * 0.6, y - h * 0.3, h * 1.2, h * 0.22)
        .fill(0xd2c8b4)
        .stroke(stroke(w));
      star(g, x, y - h * 0.62, h * 0.3, YELLOW, w * 0.7);
      return;
    }
    case 'rocket_bug': {
      g.moveTo(x - h * 0.2, y + h * 0.45)
        .lineTo(x - h * 0.6, y + h * 0.95)
        .lineTo(x + h * 0.2, y + h * 0.65)
        .closePath()
        .fill(ORANGE)
        .stroke(stroke(w * 0.7));
      g.ellipse(x, y, h * 0.32, h * 0.7)
        .fill(RED)
        .stroke(stroke(w));
      g.circle(x, y - h * 0.15, h * 0.16)
        .fill(SKY)
        .stroke(stroke(w * 0.6));
      g.poly([x - h * 0.32, y + h * 0.2, x - h * 0.6, y + h * 0.6, x - h * 0.25, y + h * 0.5])
        .fill(BLUE)
        .stroke(stroke(w * 0.6));
      g.poly([x + h * 0.32, y + h * 0.2, x + h * 0.6, y + h * 0.6, x + h * 0.25, y + h * 0.5])
        .fill(BLUE)
        .stroke(stroke(w * 0.6));
      return;
    }
    case 'bridge': {
      g.moveTo(x - h, y + h * 0.15)
        .quadraticCurveTo(x, y - h * 0.5, x + h, y + h * 0.15)
        .stroke({ width: h * 0.3, color: OUTLINE, cap: 'round' });
      g.moveTo(x - h, y + h * 0.15)
        .quadraticCurveTo(x, y - h * 0.5, x + h, y + h * 0.15)
        .stroke({ width: h * 0.17, color: BROWN, cap: 'round' });
      for (const dx of [-0.7, -0.25, 0.25, 0.7])
        g.moveTo(x + h * dx, y - h * 0.05 - (0.8 - Math.abs(dx)) * h * 0.35)
          .lineTo(x + h * dx, y + h * 0.65)
          .stroke(stroke(w * 0.8));
      g.moveTo(x - h, y + h * 0.7)
        .quadraticCurveTo(x, y + h * 0.5, x + h, y + h * 0.7)
        .stroke({ width: w, color: BLUE, cap: 'round' });
      return;
    }
    case 'ghost': {
      g.moveTo(x - h * 0.65, y + h * 0.8)
        .lineTo(x - h * 0.65, y - h * 0.1)
        .arc(x, y - h * 0.1, h * 0.65, Math.PI, 0)
        .lineTo(x + h * 0.65, y + h * 0.8)
        .lineTo(x + h * 0.35, y + h * 0.6)
        .lineTo(x, y + h * 0.8)
        .lineTo(x - h * 0.35, y + h * 0.6)
        .closePath()
        .fill({ color: WHITE, alpha: 0.95 })
        .stroke(stroke(w));
      g.ellipse(x - h * 0.22, y - h * 0.1, h * 0.1, h * 0.16).fill(OUTLINE);
      g.ellipse(x + h * 0.22, y - h * 0.1, h * 0.1, h * 0.16).fill(OUTLINE);
      g.ellipse(x, y + h * 0.25, h * 0.12, h * 0.15).fill(OUTLINE);
      return;
    }
    case 'mushrooms3':
      mushroom(g, x - h * 0.55, y + h * 0.35, s * 0.42, w * 0.7);
      mushroom(g, x + h * 0.55, y + h * 0.35, s * 0.42, w * 0.7);
      mushroom(g, x, y - h * 0.1, s * 0.5, w * 0.8);
      return;
    case 'squeak': {
      // A tiny mouth with squeak marks.
      g.circle(x - h * 0.2, y + h * 0.15, h * 0.42)
        .fill(0xc8c0b8)
        .stroke(stroke(w));
      g.ellipse(x - h * 0.2, y + h * 0.25, h * 0.14, h * 0.1).fill(MOUTH_DARK);
      g.circle(x - h * 0.35, y, h * 0.06).fill(OUTLINE);
      g.circle(x - h * 0.05, y, h * 0.06).fill(OUTLINE);
      for (const [a, len] of [
        [-0.6, 0.55],
        [-0.1, 0.6],
        [0.4, 0.5],
      ] as const)
        g.moveTo(x + h * 0.35 + Math.cos(a) * h * 0.1, y + Math.sin(a) * h * 0.6)
          .lineTo(x + h * 0.35 + Math.cos(a) * h * len, y + Math.sin(a) * h * 0.6 + Math.sin(a) * h * 0.4)
          .stroke({ width: w, color: ORANGE, cap: 'round' });
      return;
    }
    case 'blueprint': {
      g.roundRect(x - h * 0.85, y - h * 0.65, h * 1.7, h * 1.3, h * 0.08)
        .fill(0x3c6fd6)
        .stroke(stroke(w));
      for (let i = -2; i <= 2; i++)
        g.moveTo(x + h * i * 0.32, y - h * 0.6)
          .lineTo(x + h * i * 0.32, y + h * 0.6)
          .stroke({ width: 1, color: WHITE, alpha: 0.35 });
      g.rect(x - h * 0.45, y - h * 0.15, h * 0.55, h * 0.35).stroke({ width: w * 0.6, color: WHITE });
      g.circle(x - h * 0.3, y + h * 0.32, h * 0.1).stroke({ width: w * 0.6, color: WHITE });
      g.circle(x, y + h * 0.32, h * 0.1).stroke({ width: w * 0.6, color: WHITE });
      g.circle(x + h * 0.5, y - h * 0.35, h * 0.08).fill(WHITE);
      return;
    }
  }
}

const MOUTH_DARK = 0x7a2336;

/** The areas' little icons, for `area_*` hints, the map, and the secrets page. */
export function drawAreaIcon(g: Graphics, areaId: string, x: number, y: number, s: number): void {
  const h = s / 2;
  const w = lw(s);
  switch (areaId) {
    case 'area_flowerbed_stage': {
      g.moveTo(x, y + h * 0.9)
        .lineTo(x, y)
        .stroke({ width: w * 1.2, color: GREEN_DARK, cap: 'round' });
      g.ellipse(x + h * 0.25, y + h * 0.45, h * 0.25, h * 0.12)
        .fill(GREEN)
        .stroke(stroke(w * 0.7));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.circle(x + Math.cos(a) * h * 0.38, y - h * 0.3 + Math.sin(a) * h * 0.38, h * 0.26)
          .fill(PINK)
          .stroke(stroke(w * 0.8));
      }
      g.circle(x, y - h * 0.3, h * 0.24)
        .fill(YELLOW)
        .stroke(stroke(w * 0.8));
      return;
    }
    case 'area_puddle_pond': {
      g.ellipse(x, y + h * 0.3, h * 0.95, h * 0.5)
        .fill(0x5bb8e8)
        .stroke(stroke(w));
      g.ellipse(x - h * 0.3, y + h * 0.3, h * 0.35, h * 0.16)
        .fill(GREEN)
        .stroke(stroke(w * 0.7));
      g.moveTo(x - h * 0.3, y + h * 0.3)
        .lineTo(x - h * 0.05, y + h * 0.22)
        .stroke(stroke(w * 0.6));
      g.moveTo(x + h * 0.2, y + h * 0.15)
        .quadraticCurveTo(x + h * 0.45, y + h * 0.05, x + h * 0.7, y + h * 0.15)
        .stroke({ width: w * 0.7, color: WHITE, cap: 'round' });
      drop(g, x + h * 0.35, y - h * 0.45, h * 0.22, 0x5bb8e8, w * 0.7);
      return;
    }
    case 'area_stump_plaza': {
      g.moveTo(x - h * 0.75, y + h * 0.8)
        .lineTo(x - h * 0.6, y - h * 0.2)
        .lineTo(x + h * 0.6, y - h * 0.2)
        .lineTo(x + h * 0.75, y + h * 0.8)
        .closePath()
        .fill(0xa8744f)
        .stroke(stroke(w));
      g.ellipse(x, y - h * 0.2, h * 0.6, h * 0.24)
        .fill(0xe0b98a)
        .stroke(stroke(w));
      g.ellipse(x, y - h * 0.2, h * 0.3, h * 0.11).stroke({ width: w * 0.6, color: 0xa8744f });
      g.ellipse(x - h * 0.2, y - h * 0.45, h * 0.35, h * 0.15)
        .fill(GREEN)
        .stroke(stroke(w * 0.6));
      return;
    }
    case 'area_under_porch': {
      g.rect(x - h, y - h * 0.85, h * 2, h * 0.35)
        .fill(0x8a6a50)
        .stroke(stroke(w));
      for (const dx of [-0.75, 0.75])
        g.rect(x + h * dx - h * 0.12, y - h * 0.5, h * 0.24, h * 1.3)
          .fill(0x8a6a50)
          .stroke(stroke(w));
      // The lattice.
      g.rect(x - h * 0.6, y - h * 0.45, h * 1.2, h * 1.2).fill(0x3a2a40);
      for (let i = -2; i <= 2; i++)
        g.moveTo(x + h * i * 0.3 - h * 0.3, y - h * 0.45)
          .lineTo(x + h * i * 0.3 + h * 0.3, y + h * 0.75)
          .moveTo(x + h * i * 0.3 + h * 0.3, y - h * 0.45)
          .lineTo(x + h * i * 0.3 - h * 0.3, y + h * 0.75)
          .stroke({ width: w * 0.8, color: 0xf0e6d6 });
      g.rect(x - h * 0.6, y - h * 0.45, h * 1.2, h * 1.2).stroke(stroke(w));
      eye(g, x - h * 0.15, y + h * 0.15, h * 0.1, w * 0.4, 0);
      eye(g, x + h * 0.15, y + h * 0.15, h * 0.1, w * 0.4, 0);
      return;
    }
    case 'area_compost_lab': {
      g.moveTo(x - h * 0.85, y + h * 0.85)
        .quadraticCurveTo(x, y - h * 0.4, x + h * 0.85, y + h * 0.85)
        .closePath()
        .fill(0x6b4a2f)
        .stroke(stroke(w));
      g.circle(x - h * 0.3, y + h * 0.45, h * 0.1).fill(0xe8875a);
      g.circle(x + h * 0.25, y + h * 0.6, h * 0.08).fill(GREEN);
      // A flask on top, bubbling.
      g.moveTo(x - h * 0.1, y - h * 0.75)
        .lineTo(x - h * 0.1, y - h * 0.45)
        .lineTo(x - h * 0.35, y + h * 0.05)
        .lineTo(x + h * 0.35, y + h * 0.05)
        .lineTo(x + h * 0.1, y - h * 0.45)
        .lineTo(x + h * 0.1, y - h * 0.75)
        .closePath()
        .fill(0xb6ff7a)
        .stroke(stroke(w * 0.8));
      g.circle(x + h * 0.25, y - h * 0.9, h * 0.08).stroke(stroke(w * 0.5));
      g.circle(x + h * 0.4, y - h * 0.75, h * 0.06).stroke(stroke(w * 0.5));
      return;
    }
    case 'area_treehouse_arcade': {
      g.rect(x - h * 0.12, y, h * 0.24, h * 0.9)
        .fill(BROWN)
        .stroke(stroke(w));
      g.circle(x, y - h * 0.15, h * 0.75)
        .fill(GREEN)
        .stroke(stroke(w));
      g.rect(x - h * 0.4, y - h * 0.35, h * 0.8, h * 0.5)
        .fill(0xd98e4a)
        .stroke(stroke(w * 0.8));
      g.poly([x - h * 0.5, y - h * 0.35, x, y - h * 0.75, x + h * 0.5, y - h * 0.35])
        .fill(RED)
        .stroke(stroke(w * 0.8));
      g.rect(x - h * 0.12, y - h * 0.2, h * 0.24, h * 0.24)
        .fill(YELLOW)
        .stroke(stroke(w * 0.5));
      return;
    }
    case 'area_ant_hill_depths': {
      g.moveTo(x - h * 0.95, y + h * 0.8)
        .quadraticCurveTo(x, y - h * 1.0, x + h * 0.95, y + h * 0.8)
        .closePath()
        .fill(0xc98d52)
        .stroke(stroke(w));
      g.ellipse(x, y - h * 0.05, h * 0.16, h * 0.12).fill(OUTLINE);
      g.ellipse(x - h * 0.35, y + h * 0.5, h * 0.12, h * 0.09).fill(OUTLINE);
      g.ellipse(x + h * 0.35, y + h * 0.45, h * 0.12, h * 0.09).fill(OUTLINE);
      for (const [dx, dy] of [
        [-0.55, 0.15],
        [0.5, 0.05],
      ] as const) {
        g.circle(x + h * dx, y + h * dy, h * 0.07).fill(0x8a2e1f);
        g.circle(x + h * dx + h * 0.1, y + h * dy, h * 0.06).fill(0x8a2e1f);
      }
      return;
    }
    case 'area_gnome_hollow':
      g.moveTo(x - h * 0.9, y + h * 0.85)
        .lineTo(x - h * 0.9, y)
        .arc(x, y, h * 0.9, Math.PI, 0)
        .lineTo(x + h * 0.9, y + h * 0.85)
        .closePath()
        .fill(0x5a4636)
        .stroke(stroke(w));
      drawGlyph(g, 'gnome', x, y + h * 0.15, s * 0.6);
      return;
    default:
      // An area the journal does not know yet: a question flag.
      g.moveTo(x - h * 0.3, y + h * 0.8)
        .lineTo(x - h * 0.3, y - h * 0.8)
        .stroke(stroke(w));
      g.poly([x - h * 0.3, y - h * 0.8, x + h * 0.6, y - h * 0.5, x - h * 0.3, y - h * 0.2])
        .fill(YELLOW)
        .stroke(stroke(w * 0.8));
  }
}
