import type { Graphics } from 'pixi.js';
import type { BugDef } from '../../../game/data/types';
import type { Picto } from '../render/reactions';
import { drawFriend, drawPicto } from '../render/draw/pictogram';
import { heartPath } from '../render/draw/face';
import { OUTLINE, STAR, darken, lighten, stroke } from '../render/palette';
import { STICKER_SIZE } from './photoMath';

/**
 * Photo mode's stickers (game design doc, section 14), every one drawn in
 * code in the game's flat style. Each draws centered on (0, 0), about
 * `STICKER_SIZE` pixels across, at scale 1. A sticker with `unlock` shows
 * in the tray only once that secret is found; the faces come from the bugs
 * the player has met.
 */
export interface StickerDef {
  id: string;
  draw(g: Graphics): void;
  /** The secret that unlocks it, if any. */
  unlock?: string;
}

const S = STICKER_SIZE;
const H = S / 2;
const LINE = 5;
const RED = 0xff4f5e;
const BLUE = 0x4d9bff;
const PINK = 0xff8fab;
const CREAM = 0xfffbef;
const PURPLE = 0x9b6bff;
const ORANGE = 0xff9a3c;
const GREEN = 0x7bd84a;

/** A white speech bubble with a pictogram in it. */
function bubble(g: Graphics, picto: Picto | 'food'): void {
  g.ellipse(0, -8, H * 0.92, H * 0.68)
    .fill(CREAM)
    .stroke(stroke(LINE));
  g.moveTo(-H * 0.5, H * 0.3)
    .lineTo(-H * 0.72, H * 0.9)
    .lineTo(-H * 0.12, H * 0.5)
    .fill(CREAM)
    .stroke(stroke(LINE));
  // Hide the seam where the tail meets the bubble.
  g.moveTo(-H * 0.5, H * 0.26)
    .lineTo(-H * 0.12, H * 0.46)
    .stroke({ width: LINE + 2, color: CREAM });
  if (picto === 'food') {
    // A red berry with a leaf.
    g.circle(0, -2, H * 0.36)
      .fill(RED)
      .stroke(stroke(4));
    g.circle(-H * 0.12, -H * 0.16, H * 0.08).fill({ color: 0xffffff, alpha: 0.8 });
    g.ellipse(H * 0.12, -H * 0.42, H * 0.2, H * 0.09)
      .fill(GREEN)
      .stroke(stroke(3));
  } else drawPicto(g, picto, 0, -8, H * 0.95);
}

/** Two stacked googly eyes with pupils looking different ways. */
function googlyEyes(g: Graphics): void {
  for (const [x, px] of [
    [-H * 0.48, -6],
    [H * 0.48, 10],
  ] as const) {
    g.circle(x, 0, H * 0.46)
      .fill(0xffffff)
      .stroke(stroke(LINE));
    g.circle(x + px, 6, H * 0.2).fill(OUTLINE);
    g.circle(x + px - 5, 0, H * 0.06).fill(0xffffff);
  }
}

function mustache(g: Graphics): void {
  g.moveTo(0, 0)
    .bezierCurveTo(-H * 0.2, -H * 0.5, -H * 0.8, -H * 0.5, -H * 0.95, -H * 0.1)
    .bezierCurveTo(-H * 0.7, H * 0.05, -H * 0.4, H * 0.1, 0, H * 0.25)
    .bezierCurveTo(H * 0.4, H * 0.1, H * 0.7, H * 0.05, H * 0.95, -H * 0.1)
    .bezierCurveTo(H * 0.8, -H * 0.5, H * 0.2, -H * 0.5, 0, 0)
    .fill(0x3b2a2e)
    .stroke(stroke(LINE));
}

function stinkLines(g: Graphics): void {
  for (const x of [-H * 0.5, 0, H * 0.5]) {
    g.moveTo(x, H * 0.8)
      .bezierCurveTo(x - 18, H * 0.4, x + 18, H * 0.1, x, -H * 0.3)
      .bezierCurveTo(x - 14, -H * 0.55, x + 10, -H * 0.7, x + 4, -H * 0.9)
      .stroke({ width: 7, color: 0x8fd14f, cap: 'round' });
  }
  for (const [x, y] of [
    [-H * 0.6, -H * 0.5],
    [H * 0.55, -H * 0.3],
    [0, -H * 0.95],
  ] as const)
    g.circle(x, y, 7).fill({ color: 0x8fd14f, alpha: 0.9 });
}

function motionLines(g: Graphics): void {
  for (const [y, len] of [
    [-H * 0.5, H * 1.5],
    [0, H * 1.9],
    [H * 0.5, H * 1.3],
  ] as const) {
    g.moveTo(H * 0.9 - len, y)
      .lineTo(H * 0.9, y)
      .stroke({ width: 10, color: OUTLINE, cap: 'round' });
  }
}

/** A four-point sparkle with two small friends. */
function sparkle(g: Graphics): void {
  const spark = (x: number, y: number, r: number): void => {
    g.moveTo(x, y - r)
      .quadraticCurveTo(x, y, x + r, y)
      .quadraticCurveTo(x, y, x, y + r)
      .quadraticCurveTo(x, y, x - r, y)
      .quadraticCurveTo(x, y, x, y - r)
      .fill(0xffffff)
      .stroke(stroke(4));
  };
  spark(-6, 4, H * 0.86);
  spark(H * 0.6, -H * 0.55, H * 0.32);
  spark(-H * 0.68, -H * 0.5, H * 0.22);
}

function starBurst(g: Graphics): void {
  g.star(0, 0, 12, H * 0.98, H * 0.66)
    .fill(STAR)
    .stroke(stroke(LINE));
  g.star(0, 0, 5, H * 0.45, H * 0.22)
    .fill(0xffffff)
    .stroke(stroke(3.5));
}

function crown(g: Graphics): void {
  const b = H * 0.55;
  g.moveTo(-H * 0.85, b)
    .lineTo(-H * 0.85, -H * 0.4)
    .lineTo(-H * 0.42, -H * 0.05)
    .lineTo(0, -H * 0.85)
    .lineTo(H * 0.42, -H * 0.05)
    .lineTo(H * 0.85, -H * 0.4)
    .lineTo(H * 0.85, b)
    .closePath()
    .fill(STAR)
    .stroke(stroke(LINE));
  g.rect(-H * 0.85, b - 16, H * 1.7, 16).fill(ORANGE);
  g.moveTo(-H * 0.85, b)
    .lineTo(H * 0.85, b)
    .stroke(stroke(LINE));
  for (const [x, c] of [
    [-H * 0.5, RED],
    [0, BLUE],
    [H * 0.5, GREEN],
  ] as const)
    g.circle(x, b - 34, 9)
      .fill(c)
      .stroke(stroke(3));
}

function sunglasses(g: Graphics): void {
  for (const x of [-H * 0.5, H * 0.5]) {
    g.roundRect(x - H * 0.44, -H * 0.3, H * 0.88, H * 0.6, 20)
      .fill(0x2b1d2e)
      .stroke(stroke(LINE));
    g.roundRect(x - H * 0.3, -H * 0.2, H * 0.3, H * 0.12, 6).fill({ color: 0xffffff, alpha: 0.45 });
  }
  g.moveTo(-H * 0.08, -H * 0.12)
    .lineTo(H * 0.08, -H * 0.12)
    .stroke(stroke(LINE));
  g.moveTo(-H * 0.94, -H * 0.2)
    .lineTo(-H * 1, -H * 0.3)
    .stroke(stroke(LINE));
  g.moveTo(H * 0.94, -H * 0.2)
    .lineTo(H * 1, -H * 0.3)
    .stroke(stroke(LINE));
}

function partyHat(g: Graphics): void {
  g.moveTo(0, -H * 0.95)
    .lineTo(-H * 0.6, H * 0.6)
    .lineTo(H * 0.6, H * 0.6)
    .closePath()
    .fill(PURPLE)
    .stroke(stroke(LINE));
  for (const [y, w] of [
    [H * 0.1, H * 0.4],
    [H * 0.42, H * 0.56],
  ] as const)
    g.moveTo(-w, y).lineTo(w, y).stroke({ width: 9, color: STAR });
  g.circle(0, -H * 0.95, 13)
    .fill(PINK)
    .stroke(stroke(4));
}

function arrow(g: Graphics): void {
  g.moveTo(-H * 0.9, 0)
    .lineTo(H * 0.2, 0)
    .stroke({ width: 22, color: RED, cap: 'round' });
  g.moveTo(H * 0.05, -H * 0.5)
    .lineTo(H * 0.9, 0)
    .lineTo(H * 0.05, H * 0.5)
    .closePath()
    .fill(RED);
  // One outline around the whole arrow.
  g.moveTo(-H * 0.9, -11)
    .lineTo(H * 0.05, -11)
    .lineTo(H * 0.05, -H * 0.5)
    .lineTo(H * 0.9, 0)
    .lineTo(H * 0.05, H * 0.5)
    .lineTo(H * 0.05, 11)
    .lineTo(-H * 0.9, 11)
    .closePath()
    .stroke(stroke(LINE));
}

/** A spiky burst with a big "!" in it. */
function bangBurst(g: Graphics): void {
  g.star(0, 0, 9, H * 0.98, H * 0.62, 0.2)
    .fill(ORANGE)
    .stroke(stroke(LINE));
  drawPicto(g, 'exclaim', 0, 0, H * 1.1);
}

function sweatDrop(g: Graphics): void {
  g.moveTo(0, -H * 0.9)
    .bezierCurveTo(H * 0.75, 0, H * 0.6, H * 0.85, 0, H * 0.85)
    .bezierCurveTo(-H * 0.6, H * 0.85, -H * 0.75, 0, 0, -H * 0.9)
    .fill(BLUE)
    .stroke(stroke(LINE));
  g.ellipse(-H * 0.2, H * 0.2, H * 0.1, H * 0.22).fill({ color: 0xffffff, alpha: 0.7 });
}

function steamPuff(g: Graphics): void {
  for (const [x, y, r] of [
    [-H * 0.4, H * 0.2, H * 0.4],
    [H * 0.35, H * 0.25, H * 0.42],
    [0, -H * 0.3, H * 0.5],
    [-H * 0.55, -H * 0.35, H * 0.3],
    [H * 0.55, -H * 0.3, H * 0.28],
  ] as const)
    g.circle(x, y, r).fill(0xf4f0ff);
  g.circle(-H * 0.4, H * 0.2, H * 0.4)
    .circle(H * 0.35, H * 0.25, H * 0.42)
    .circle(0, -H * 0.3, H * 0.5)
    .circle(-H * 0.55, -H * 0.35, H * 0.3)
    .circle(H * 0.55, -H * 0.3, H * 0.28)
    .stroke(stroke(LINE));
  for (const [x, y, r] of [
    [-H * 0.4, H * 0.2, H * 0.4],
    [H * 0.35, H * 0.25, H * 0.42],
    [0, -H * 0.3, H * 0.5],
    [-H * 0.55, -H * 0.35, H * 0.3],
    [H * 0.55, -H * 0.3, H * 0.28],
  ] as const)
    g.circle(x, y, r - LINE / 2).fill(0xf4f0ff);
}

function chompTeeth(g: Graphics): void {
  g.roundRect(-H * 0.9, -H * 0.55, H * 1.8, H * 1.1, H * 0.5)
    .fill(0x7a2336)
    .stroke(stroke(LINE));
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = -H * 0.6 + i * H * 0.4;
      const y0 = dir * H * 0.52;
      g.moveTo(x - H * 0.17, y0)
        .lineTo(x + H * 0.17, y0)
        .lineTo(x, y0 - dir * H * 0.38)
        .closePath()
        .fill(0xffffff)
        .stroke(stroke(3.5));
    }
  }
}

function rainbow(g: Graphics): void {
  const colors = [RED, ORANGE, STAR, GREEN, BLUE, PURPLE];
  const w = 11;
  colors.forEach((c, i) => {
    const r = H * 0.95 - i * w;
    g.arc(0, H * 0.45, r, Math.PI, 0).stroke({ width: w, color: c });
  });
  g.arc(0, H * 0.45, H * 0.95 + 1, Math.PI, 0).stroke(stroke(4));
  g.arc(0, H * 0.45, H * 0.95 - colors.length * w + 4, Math.PI, 0).stroke(stroke(4));
  for (const x of [-H * 0.75, H * 0.75]) {
    g.circle(x, H * 0.5, H * 0.26).fill(0xffffff);
    g.circle(x + H * 0.15, H * 0.42, H * 0.2).fill(0xffffff);
    g.circle(x - H * 0.15, H * 0.42, H * 0.17).fill(0xffffff);
  }
}

function lightning(g: Graphics): void {
  g.moveTo(H * 0.25, -H * 0.95)
    .lineTo(-H * 0.5, H * 0.1)
    .lineTo(-H * 0.02, H * 0.1)
    .lineTo(-H * 0.3, H * 0.95)
    .lineTo(H * 0.5, -H * 0.15)
    .lineTo(H * 0.02, -H * 0.15)
    .closePath()
    .fill(STAR)
    .stroke(stroke(LINE));
}

/** The patchwork bug: a round bug in five paint colors (secret_paint_all_five). */
function patchworkBug(g: Graphics): void {
  const colors = [RED, BLUE, STAR, GREEN, PURPLE];
  const r = H * 0.78;
  colors.forEach((c, i) => {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / colors.length;
    const a1 = a0 + (2 * Math.PI) / colors.length;
    g.moveTo(0, 8).arc(0, 8, r, a0, a1).closePath().fill(c);
  });
  g.circle(0, 8, r).stroke(stroke(LINE));
  g.moveTo(0, 8 - r)
    .lineTo(0, 8 + r)
    .stroke(stroke(3.5));
  // Stitches between patches.
  for (let i = 0; i < colors.length; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / colors.length;
    for (let k = 0.3; k < 1; k += 0.25) {
      const px = Math.cos(a) * r * k;
      const py = 8 + Math.sin(a) * r * k;
      g.moveTo(px - 5, py - 5)
        .lineTo(px + 5, py + 5)
        .stroke(stroke(3));
    }
  }
  for (const x of [-H * 0.28, H * 0.28]) {
    g.circle(x, -H * 0.1, H * 0.2)
      .fill(0xffffff)
      .stroke(stroke(4));
    g.circle(x + 3, -H * 0.06, H * 0.09).fill(OUTLINE);
  }
  g.moveTo(-H * 0.2, H * 0.3)
    .quadraticCurveTo(0, H * 0.5, H * 0.2, H * 0.3)
    .stroke(stroke(4));
  heartPath(g, H * 0.7, -H * 0.72, H * 0.3)
    .fill(PINK)
    .stroke(stroke(3.5));
}

const BUBBLES: readonly (readonly [string, Picto | 'food'])[] = [
  ['sticker_bubble_food', 'food'],
  ['sticker_bubble_star', 'star'],
  ['sticker_bubble_question', 'question'],
  ['sticker_bubble_exclaim', 'exclaim'],
  ['sticker_bubble_note', 'note'],
  ['sticker_bubble_dizzy', 'swirl'],
  ['sticker_bubble_stink', 'stink'],
  ['sticker_bubble_zzz', 'zzz'],
];

/** Every sticker but the bug faces, in tray order. */
export const STICKERS: readonly StickerDef[] = [
  { id: 'sticker_googly_eyes', draw: googlyEyes },
  { id: 'sticker_mustache', draw: mustache },
  { id: 'sticker_sunglasses', draw: sunglasses },
  { id: 'sticker_crown', draw: crown },
  { id: 'sticker_party_hat', draw: partyHat },
  ...BUBBLES.map(([id, picto]) => ({ id, draw: (g: Graphics) => bubble(g, picto) })),
  { id: 'sticker_sparkle', draw: sparkle },
  { id: 'sticker_star_burst', draw: starBurst },
  { id: 'sticker_bang_burst', draw: bangBurst },
  { id: 'sticker_stink_lines', draw: stinkLines },
  { id: 'sticker_motion_lines', draw: motionLines },
  { id: 'sticker_sweat_drop', draw: sweatDrop },
  { id: 'sticker_steam_puff', draw: steamPuff },
  { id: 'sticker_chomp_teeth', draw: chompTeeth },
  { id: 'sticker_arrow', draw: arrow },
  { id: 'sticker_rainbow', draw: rainbow },
  { id: 'sticker_lightning', draw: lightning },
  { id: 'sticker_patchwork_bug', draw: patchworkBug, unlock: 'secret_paint_all_five' },
];

/** A found bug's face, on a round cream token. */
export function faceSticker(def: BugDef): StickerDef {
  return {
    id: `sticker_face_${def.id}`,
    draw: (g) => {
      g.circle(0, 0, H * 0.92)
        .fill(lighten(def.body, 0.75))
        .stroke(stroke(LINE));
      g.circle(0, 0, H * 0.8).stroke({ width: 3, color: darken(def.body, 0.2), alpha: 0.5 });
      drawFriend(g, def, 0, 4, H * 1.15);
    },
  };
}

/** The tray's stickers for this world: the catalog, then a face for each bug met. */
export function trayStickers(found: readonly BugDef[], secrets: readonly string[]): StickerDef[] {
  const base = STICKERS.filter((s) => !s.unlock || secrets.includes(s.unlock));
  return [...base, ...found.map(faceSticker)];
}

/** Tray stickers still to be earned: shown as grey shadows with a question mark. */
export function lockedStickers(secrets: readonly string[]): StickerDef[] {
  return STICKERS.filter((s) => s.unlock && !secrets.includes(s.unlock));
}
