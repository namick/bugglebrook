import type { Graphics } from 'pixi.js';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';

/**
 * Wordless UI icons (game design doc, section 17), drawn in the game's
 * flat style with the thick outline. Each draws centered on (0, 0), about
 * `s` pixels across.
 */

export const WOOD = 0xc98d52;
export const WOOD_DARK = 0x9a6436;
export const LEAF = 0x7bd84a;
export const LEAF_DARK = 0x3f9a34;
export const CREAM = 0xfffbef;
export const SUNNY = 0xffd23f;

/** A round cream token behind an icon. */
export function token(g: Graphics, r: number, fill = CREAM): Graphics {
  g.circle(0, 6, r).fill({ color: OUTLINE, alpha: 0.18 });
  return g.circle(0, 0, r).fill(fill).stroke(stroke(6));
}

/** Pause: a leaf with two vertical lines. */
export function pauseIcon(g: Graphics, s: number): Graphics {
  const w = s * 0.46;
  const h = s * 0.36;
  g.moveTo(-w, 0)
    .bezierCurveTo(-w * 0.5, -h * 1.5, w * 0.6, -h * 1.3, w, 0)
    .bezierCurveTo(w * 0.6, h * 1.3, -w * 0.5, h * 1.5, -w, 0)
    .fill(LEAF)
    .stroke(stroke(5));
  g.moveTo(-w * 0.9, 0)
    .lineTo(w * 0.7, 0)
    .stroke({ width: 3, color: LEAF_DARK, cap: 'round' });
  for (const x of [-0.13, 0.13])
    g.roundRect(x * s - 5, -h * 0.72, 10, h * 1.44, 5)
      .fill(CREAM)
      .stroke(stroke(3.5));
  return g;
}

/** Home: a little mossy stump. */
export function stumpIcon(g: Graphics, s: number): Graphics {
  const w = s * 0.34;
  const top = -s * 0.18;
  const base = s * 0.3;
  g.moveTo(-w, top)
    .lineTo(-w, base - 8)
    .quadraticCurveTo(-w - 14, base, -w - 18, base)
    .lineTo(w + 18, base)
    .quadraticCurveTo(w + 14, base, w, base - 8)
    .lineTo(w, top)
    .fill(0xa8744f)
    .stroke(stroke(5));
  g.ellipse(0, top, w, s * 0.1)
    .fill(0xe8c38e)
    .stroke(stroke(5));
  g.ellipse(0, top, w * 0.55, s * 0.05).stroke({ width: 2.5, color: 0xb88a5a });
  g.ellipse(-w * 0.55, top - 4, w * 0.45, s * 0.07)
    .fill(LEAF)
    .stroke(stroke(3.5));
  g.moveTo(-w * 0.4, top + 20)
    .lineTo(-w * 0.4, base - 6)
    .stroke({ width: 3, color: darken(0xa8744f, 0.25) });
  g.moveTo(w * 0.3, top + 16)
    .lineTo(w * 0.3, base - 10)
    .stroke({ width: 3, color: darken(0xa8744f, 0.25) });
  return g;
}

/** Settings: a cog. */
export function gearIcon(g: Graphics, s: number, turn = 0): Graphics {
  const r = s * 0.34;
  const teeth = 8;
  const pts: number[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = turn + (i / (teeth * 4)) * Math.PI * 2;
    const k = i % 4 < 2 ? 1 : 0.76;
    pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  g.poly(pts).fill(0xb9c3d6).stroke(stroke(5));
  g.circle(0, 0, r * 0.36)
    .fill(CREAM)
    .stroke(stroke(4));
  return g;
}

/** Quit: a little wooden door with an arched top, `open` 0 to 1. */
export function doorIcon(g: Graphics, s: number, open = 0): Graphics {
  const w = s * 0.3;
  const h = s * 0.42;
  g.moveTo(-w, h)
    .lineTo(-w, -h * 0.35)
    .arc(0, -h * 0.35, w, Math.PI, 0)
    .lineTo(w, h)
    .closePath()
    .fill(0x3a2a3d)
    .stroke(stroke(5));
  const k = 1 - open * 0.55;
  g.moveTo(-w, h)
    .lineTo(-w, -h * 0.35)
    .arc(-w + w * k, -h * 0.35, w * k, Math.PI, 0)
    .lineTo(-w + 2 * w * k, h)
    .closePath()
    .fill(0x9a6436)
    .stroke(stroke(5));
  for (const t of [0.35, 0.65, 0.95])
    g.moveTo(-w + 6, -h * 0.35 + t * h * 1.2)
      .lineTo(-w + 2 * w * k - 6, -h * 0.35 + t * h * 1.2)
      .stroke({ width: 2.5, color: darken(0x9a6436, 0.3) });
  g.circle(-w + 2 * w * k - 12, h * 0.25, 5)
    .fill(SUNNY)
    .stroke(stroke(3));
  return g;
}

/** Music: a note. */
export function noteIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.moveTo(-8 * k, 22 * k)
    .lineTo(-8 * k, -30 * k)
    .lineTo(26 * k, -38 * k)
    .lineTo(26 * k, 14 * k)
    .stroke(stroke(7 * k));
  g.moveTo(-8 * k, -30 * k)
    .lineTo(26 * k, -38 * k)
    .stroke({ width: 12 * k, color: OUTLINE, cap: 'round' });
  g.ellipse(-20 * k, 24 * k, 14 * k, 11 * k)
    .fill(0xff6f91)
    .stroke(stroke(5 * k));
  g.ellipse(14 * k, 16 * k, 14 * k, 11 * k)
    .fill(0xff6f91)
    .stroke(stroke(5 * k));
  return g;
}

/** Sound: a snail shell shaped like a speaker, with sound arcs. */
export function shellSpeakerIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.moveTo(-34 * k, -12 * k)
    .lineTo(-18 * k, -12 * k)
    .lineTo(0, -30 * k)
    .lineTo(0, 30 * k)
    .lineTo(-18 * k, 12 * k)
    .lineTo(-34 * k, 12 * k)
    .closePath()
    .fill(0xffb36b)
    .stroke(stroke(5 * k));
  g.moveTo(-26 * k, 0)
    .arc(-20 * k, 0, 6 * k, Math.PI, Math.PI * 2.6)
    .stroke({ width: 3 * k, color: darken(0xffb36b, 0.45), cap: 'round' });
  for (const r of [16, 30]) g.arc(4 * k, 0, r * k, -0.8, 0.8).stroke(stroke(5 * k));
  return g;
}

/** Voices: a bug mouth, open mid-babble. */
export function mouthIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.circle(0, 0, 34 * k)
    .fill(0xff5a5f)
    .stroke(stroke(5 * k));
  g.circle(-12 * k, -12 * k, 8 * k)
    .fill(0xffffff)
    .stroke(stroke(3 * k));
  g.circle(12 * k, -12 * k, 8 * k)
    .fill(0xffffff)
    .stroke(stroke(3 * k));
  g.circle(-11 * k, -11 * k, 3.5 * k).fill(OUTLINE);
  g.circle(13 * k, -11 * k, 3.5 * k).fill(OUTLINE);
  g.ellipse(0, 12 * k, 14 * k, 10 * k)
    .fill(0x7a2336)
    .stroke(stroke(3.5 * k));
  g.ellipse(0, 17 * k, 8 * k, 4 * k).fill(0xff7a93);
  return g;
}

/** Fullscreen: a square with arrows out of its four corners. */
export function fullscreenIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.roundRect(-18 * k, -14 * k, 36 * k, 28 * k, 5 * k)
    .fill(0xbfe6ff)
    .stroke(stroke(4.5 * k));
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const x = dx * 36 * k;
    const y = dy * 30 * k;
    g.moveTo(dx * 22 * k, dy * 18 * k)
      .lineTo(x, y)
      .stroke(stroke(5 * k));
    g.moveTo(x - dx * 14 * k, y)
      .lineTo(x, y)
      .lineTo(x, y - dy * 14 * k)
      .stroke(stroke(5 * k));
  }
  return g;
}

/** Reduce motion: a spiral with a slash through it. */
export function calmIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.circle(0, 0, 34 * k)
    .fill(0xd9f2c9)
    .stroke(stroke(4.5 * k));
  let first = true;
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 4.2;
    const r = (4 + (i / 60) * 22) * k;
    if (first) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    first = false;
  }
  g.stroke({ width: 5 * k, color: 0x6b8f5a, cap: 'round' });
  g.moveTo(-26 * k, -26 * k)
    .lineTo(26 * k, 26 * k)
    .stroke({ width: 12 * k, color: OUTLINE, cap: 'round' });
  g.moveTo(-26 * k, -26 * k)
    .lineTo(26 * k, 26 * k)
    .stroke({ width: 6 * k, color: 0xff5a5f, cap: 'round' });
  return g;
}

/** Edge scroll: the hand's pointer between two side arrows. */
export function edgeIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  for (const d of [-1, 1]) {
    g.poly([d * 40 * k, 0, d * 24 * k, -14 * k, d * 24 * k, 14 * k])
      .fill(SUNNY)
      .stroke(stroke(4 * k));
  }
  g.moveTo(-8 * k, -26 * k)
    .lineTo(-8 * k, 18 * k)
    .lineTo(2 * k, 8 * k)
    .lineTo(10 * k, 26 * k)
    .lineTo(16 * k, 23 * k)
    .lineTo(8 * k, 6 * k)
    .lineTo(20 * k, 5 * k)
    .closePath()
    .fill(0xffd9b8)
    .stroke(stroke(4 * k));
  return g;
}

/** Resume: a big play triangle. */
export function playIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.moveTo(-16 * k, -28 * k)
    .lineTo(30 * k, 0)
    .lineTo(-16 * k, 28 * k)
    .closePath()
    .fill(LEAF)
    .stroke(stroke(6 * k));
  return g;
}

/** Back to the menu: a small wooden sign on a stump. */
export function signIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.rect(-5 * k, -6 * k, 10 * k, 36 * k)
    .fill(WOOD_DARK)
    .stroke(stroke(4 * k));
  g.ellipse(0, 30 * k, 26 * k, 8 * k)
    .fill(0xa8744f)
    .stroke(stroke(4 * k));
  g.roundRect(-34 * k, -34 * k, 68 * k, 30 * k, 7 * k)
    .fill(WOOD)
    .stroke(stroke(5 * k));
  // Three tiny slot boards: the menu.
  for (const x of [-19, 0, 19]) g.roundRect((x - 7) * k, -26 * k, 14 * k, 14 * k, 3 * k).fill(CREAM);
  return g;
}

/** A terracotta pot with a sprout, one leaf shaped like a plus: a new world. */
export function sproutIcon(g: Graphics, s: number, sway = 0): Graphics {
  const k = s / 100;
  const pot = 0xd9774a;
  g.moveTo(-26 * k, 6 * k)
    .lineTo(26 * k, 6 * k)
    .lineTo(20 * k, 44 * k)
    .lineTo(-20 * k, 44 * k)
    .closePath()
    .fill(pot)
    .stroke(stroke(5 * k));
  g.roundRect(-31 * k, -2 * k, 62 * k, 14 * k, 5 * k)
    .fill(lighten(pot, 0.15))
    .stroke(stroke(5 * k));
  g.ellipse(0, 0, 24 * k, 4 * k).fill(0x6b4a33);
  const tipX = sway * 6 * k;
  g.moveTo(0, 0)
    .quadraticCurveTo(-4 * k, -24 * k, tipX, -40 * k)
    .stroke({ width: 7 * k, color: LEAF_DARK, cap: 'round' });
  g.ellipse(-18 * k + tipX * 0.5, -28 * k, 16 * k, 8 * k)
    .fill(LEAF)
    .stroke(stroke(4 * k));
  // The plus leaf.
  const px = 18 * k + tipX;
  const py = -46 * k;
  g.roundRect(px - 16 * k, py - 5.5 * k, 32 * k, 11 * k, 5.5 * k)
    .fill(LEAF)
    .stroke(stroke(4 * k));
  g.roundRect(px - 5.5 * k, py - 16 * k, 11 * k, 32 * k, 5.5 * k)
    .fill(LEAF)
    .stroke(stroke(4 * k));
  g.roundRect(px - 16 * k + 4, py - 5.5 * k + 4, 32 * k - 8, 11 * k - 8, 3).fill(LEAF);
  return g;
}

/** A glass jar with a fill level (0 to 1) of glowing goo: how far the world has come. */
export function jarIcon(g: Graphics, s: number, fill: number): Graphics {
  const k = s / 100;
  const w = 26 * k;
  const h = 34 * k;
  const level = Math.max(0, Math.min(1, fill));
  g.roundRect(-w, -h, w * 2, h * 2, 12 * k).fill(0xe8f6ff);
  if (level > 0) {
    const top = h - level * h * 2 + 4 * k;
    g.roundRect(-w + 4 * k, top, w * 2 - 8 * k, h - top - 2 * k, 9 * k).fill(0xffc94d);
    g.ellipse(0, top + 2 * k, w - 6 * k, 3.5 * k).fill(lighten(0xffc94d, 0.4));
  }
  g.roundRect(-w, -h, w * 2, h * 2, 12 * k).stroke(stroke(4.5 * k));
  g.roundRect(-w - 3 * k, -h - 10 * k, w * 2 + 6 * k, 12 * k, 4 * k)
    .fill(0xff9f1c)
    .stroke(stroke(4 * k));
  g.moveTo(-w + 8 * k, -h + 10 * k)
    .lineTo(-w + 8 * k, h - 16 * k)
    .stroke({ width: 4 * k, color: 0xffffff, alpha: 0.7, cap: 'round' });
  return g;
}
