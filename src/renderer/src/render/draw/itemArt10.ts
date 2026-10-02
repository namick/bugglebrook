import type { Graphics } from 'pixi.js';
import type { ItemArt, ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, stroke } from '../palette';

/**
 * Art for M10's treasures: the tiny key on its cork, the map scraps and the
 * whole map, the golden marble, the gnome's nose, the bubble and candle
 * hats, the cloud jar, rainbow paint, and the monocle. Each drawer fills the
 * item's collider, centered on the origin; `w` and `h` are in pixels.
 */

export const M10_ARTS: readonly ItemArt[] = [
  'key_tiny',
  'map_scrap',
  'treasure_map',
  'marble_gold',
  'gnome_nose',
  'hat_bubble',
  'hat_candle',
  'cloud_jar',
  'paint_rainbow',
  'monocle',
];

export const RAINBOW = [0xff4f5e, 0xff9f43, 0xffd23f, 0x6bd66b, 0x4d9bff, 0x9b6bd6] as const;

function keyTiny(g: Graphics, def: ItemDef, w: number, h: number): void {
  // The cork float on the left, a ring, then the brass key pointing right.
  const corkW = w * 0.34;
  const cx = -w / 2 + corkW / 2;
  g.roundRect(-w / 2, -h / 2, corkW, h, h * 0.3)
    .fill(0xd9a066)
    .stroke(stroke(3));
  for (const [x, y] of [
    [-0.25, -0.2],
    [0.15, 0.15],
    [-0.05, 0.25],
  ] as const)
    g.circle(cx + x * corkW, y * h, 1.6).fill(darken(0xd9a066, 0.35));
  const ringX = -w / 2 + corkW + w * 0.06;
  g.circle(ringX, 0, h * 0.18).stroke({ width: 2.4, color: 0xb0b8c4 });
  const bowX = ringX + w * 0.14;
  g.circle(bowX, 0, h * 0.28)
    .fill(def.color)
    .stroke(stroke(3));
  g.circle(bowX, 0, h * 0.1).fill(darken(def.color, 0.55));
  g.rect(bowX + h * 0.24, -h * 0.08, w / 2 - (bowX + h * 0.24) - 2, h * 0.16)
    .fill(def.color)
    .stroke(stroke(2.5));
  for (const k of [0.55, 0.8]) {
    const x = bowX + h * 0.24 + (w / 2 - bowX - h * 0.24) * k;
    g.rect(x - 2, h * 0.08, 4, h * 0.16)
      .fill(def.color)
      .stroke(stroke(2));
  }
  g.circle(bowX - h * 0.1, -h * 0.12, h * 0.05).fill({ color: 0xffffff, alpha: 0.7 });
}

/** A torn paper edge: points along a rectangle with jagged bites, seeded by `seed`. */
function tornRect(g: Graphics, w: number, h: number, seed: number): Graphics {
  const pts: [number, number][] = [];
  const jag = (i: number): number => ((Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1) * 0.5;
  const n = 5;
  for (let i = 0; i <= n; i++) pts.push([-w / 2 + (w * i) / n, -h / 2 + Math.abs(jag(i)) * h * 0.18]);
  for (let i = 1; i <= n; i++) pts.push([w / 2 - Math.abs(jag(i + 10)) * w * 0.12, -h / 2 + (h * i) / n]);
  for (let i = n - 1; i >= 0; i--) pts.push([-w / 2 + (w * i) / n, h / 2 - Math.abs(jag(i + 20)) * h * 0.18]);
  for (let i = n - 1; i >= 1; i--)
    pts.push([-w / 2 + Math.abs(jag(i + 30)) * w * 0.12, -h / 2 + (h * i) / n]);
  return g.poly(pts.flat(), true);
}

function mapScrap(g: Graphics, def: ItemDef, w: number, h: number): void {
  const n = Number(def.id.slice(-1)) || 1;
  tornRect(g, w, h, n).fill(def.color).stroke(stroke(3));
  // A quarter of the map: a dotted path, and the corner's own landmark.
  g.moveTo(-w * 0.35, h * 0.2)
    .quadraticCurveTo(-w * 0.05, -h * 0.25, w * 0.3, h * 0.05)
    .stroke({ width: 2.4, color: 0xd23c3c, cap: 'round' });
  for (let i = 0; i < 4; i++)
    g.circle(-w * 0.3 + i * w * 0.18, h * 0.3 - (i % 2) * h * 0.08, 1.4).fill(darken(def.color, 0.5));
  const lx = w * 0.22;
  const ly = -h * 0.15;
  switch (n) {
    case 1: // The stump.
      g.roundRect(lx - 6, ly - 4, 12, 9, 3)
        .fill(def.accent)
        .stroke(stroke(1.6));
      break;
    case 2: // The ant hill.
      g.moveTo(lx - 8, ly + 5)
        .lineTo(lx, ly - 6)
        .lineTo(lx + 8, ly + 5)
        .closePath()
        .fill(def.accent)
        .stroke(stroke(1.6));
      break;
    case 3: // A drop of pond.
      g.ellipse(lx, ly, 8, 5).fill(def.accent).stroke(stroke(1.6));
      break;
    default: // A star from the gnome's ceiling.
      g.star(lx, ly, 5, 7, 3).fill(0xf2c14e).stroke(stroke(1.6));
  }
  // Which corner: a little fold.
  g.moveTo(w / 2 - 10, -h / 2 + 2)
    .lineTo(w / 2 - 10, -h / 2 + 10)
    .lineTo(w / 2 - 2, -h / 2 + 10)
    .stroke({ width: 1.6, color: darken(def.color, 0.3) });
}

function treasureMap(g: Graphics, def: ItemDef, w: number, h: number): void {
  tornRect(g, w, h, 7).fill(def.color).stroke(stroke(3.5));
  // The four scraps' seams.
  g.moveTo(0, -h / 2 + 4)
    .lineTo(2, h / 2 - 4)
    .stroke({ width: 1.4, color: darken(def.color, 0.3), alpha: 0.7 });
  g.moveTo(-w / 2 + 4, 0)
    .lineTo(w / 2 - 4, -2)
    .stroke({ width: 1.4, color: darken(def.color, 0.3), alpha: 0.7 });
  // The sundial, a moon, and the dotted path to an X in the clover.
  g.circle(-w * 0.28, -h * 0.18, h * 0.13)
    .fill(0xf2e6c8)
    .stroke(stroke(1.8));
  g.moveTo(-w * 0.28, -h * 0.18)
    .lineTo(-w * 0.2, -h * 0.28)
    .stroke({ width: 1.8, color: OUTLINE });
  g.circle(w * 0.3, -h * 0.26, h * 0.1).fill(0xfff3c4);
  g.circle(w * 0.34, -h * 0.29, h * 0.09).fill(def.color);
  for (let i = 0; i < 6; i++)
    g.circle(-w * 0.2 + i * w * 0.08, h * 0.05 + Math.sin(i) * h * 0.08, 1.6).fill(OUTLINE);
  for (const [x, y] of [
    [0.24, 0.22],
    [0.32, 0.3],
    [0.18, 0.32],
  ] as const)
    g.circle(x * w, y * h, h * 0.06).fill(0x6bd66b);
  const xx = w * 0.26;
  const xy = h * 0.2;
  g.moveTo(xx - 6, xy - 6)
    .lineTo(xx + 6, xy + 6)
    .moveTo(xx + 6, xy - 6)
    .lineTo(xx - 6, xy + 6)
    .stroke({ width: 3.2, color: def.accent, cap: 'round' });
}

function marbleGold(g: Graphics, def: ItemDef, w: number): void {
  const r = w / 2;
  g.circle(0, 0, r).fill(def.color).stroke(stroke(3));
  // A swirl of brighter gold inside, and a star of light.
  g.moveTo(-r * 0.5, r * 0.2)
    .bezierCurveTo(-r * 0.2, -r * 0.6, r * 0.5, -r * 0.2, r * 0.2, r * 0.45)
    .stroke({ width: r * 0.22, color: lighten(def.color, 0.45), cap: 'round' });
  g.circle(-r * 0.35, -r * 0.38, r * 0.2).fill({ color: 0xffffff, alpha: 0.85 });
  g.star(r * 0.45, -r * 0.5, 4, r * 0.28, r * 0.08).fill({ color: 0xffffff, alpha: 0.9 });
}

function gnomeNose(g: Graphics, def: ItemDef, w: number, h: number): void {
  // A round ceramic button nose, with the broken-off peg at the back.
  g.roundRect(-w * 0.5, -h * 0.12, w * 0.22, h * 0.24, 3)
    .fill(0xf4efe6)
    .stroke(stroke(2.5));
  g.ellipse(w * 0.08, 0, w * 0.42, h * 0.44)
    .fill(def.color)
    .stroke(stroke(3.5));
  g.ellipse(w * 0.2, h * 0.14, w * 0.1, h * 0.07).fill(def.accent);
  g.ellipse(-w * 0.04, -h * 0.18, w * 0.13, h * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
}

function hatBubble(g: Graphics, def: ItemDef, w: number, h: number): void {
  // A soap-bubble dome with a pink collar ring.
  g.ellipse(0, h * 0.04, w * 0.48, h * 0.46).fill({ color: def.color, alpha: 0.45 });
  g.ellipse(0, h * 0.04, w * 0.48, h * 0.46).stroke(stroke(3));
  g.moveTo(-w * 0.32, -h * 0.12)
    .quadraticCurveTo(-w * 0.2, -h * 0.36, w * 0.02, -h * 0.38)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.85, cap: 'round' });
  g.roundRect(-w * 0.46, h * 0.28, w * 0.92, h * 0.18, h * 0.08)
    .fill(def.accent)
    .stroke(stroke(2.5));
  for (const [x, c] of [
    [-0.2, 0xff4f5e],
    [0.15, 0x4d9bff],
  ] as const)
    g.circle(x * w, -h * 0.02, 2.2).fill({ color: c, alpha: 0.5 });
}

function hatCandle(g: Graphics, def: ItemDef, w: number, h: number): void {
  // A dish with a stubby candle and its flame.
  g.ellipse(0, h * 0.4, w * 0.5, h * 0.1)
    .fill(0xc7d3e3)
    .stroke(stroke(2.5));
  g.roundRect(-w * 0.24, -h * 0.1, w * 0.48, h * 0.48, 4)
    .fill(def.color)
    .stroke(stroke(3));
  g.moveTo(-w * 0.12, -h * 0.08)
    .quadraticCurveTo(-w * 0.16, h * 0.05, -w * 0.1, h * 0.12)
    .stroke({ width: 3, color: lighten(def.color, 0.5), cap: 'round' });
  g.moveTo(0, -h * 0.1)
    .lineTo(0, -h * 0.2)
    .stroke({ width: 2, color: OUTLINE });
  g.moveTo(0, -h * 0.5)
    .quadraticCurveTo(w * 0.2, -h * 0.28, 0, -h * 0.18)
    .quadraticCurveTo(-w * 0.2, -h * 0.28, 0, -h * 0.5)
    .fill(def.accent)
    .stroke(stroke(2));
  g.ellipse(0, -h * 0.27, w * 0.05, h * 0.06).fill(0xfff3c4);
}

function cloudJar(g: Graphics, def: ItemDef, w: number, h: number): void {
  // A glass jar with a lid, holding a little grey rain cloud.
  const top = -h / 2 + h * 0.16;
  g.roundRect(-w / 2, top, w, h - (top + h / 2), w * 0.18).fill({ color: def.color, alpha: 0.55 });
  for (const [x, y, r] of [
    [-0.16, 0.05, 0.18],
    [0.06, -0.04, 0.22],
    [0.2, 0.08, 0.16],
  ] as const)
    g.circle(x * w, y * h, r * w).fill(0xe8eef7);
  g.ellipse(0.02 * w, 0.12 * h, w * 0.32, h * 0.08).fill(def.accent);
  for (const x of [-0.12, 0.04, 0.18])
    g.moveTo(x * w, h * 0.22)
      .lineTo(x * w - 2, h * 0.32)
      .stroke({ width: 2, color: 0x4d9bff, cap: 'round' });
  g.roundRect(-w / 2, top, w, h - (top + h / 2), w * 0.18).stroke(stroke(3));
  g.roundRect(-w * 0.46, -h / 2, w * 0.92, h * 0.18, 3)
    .fill(0xc7d3e3)
    .stroke(stroke(3));
  g.moveTo(-w * 0.32, top + 6)
    .lineTo(-w * 0.32, h * 0.3)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.6, cap: 'round' });
}

function paintRainbow(g: Graphics, _def: ItemDef, w: number, h: number): void {
  // A paint drop in rainbow bands, like the other paint drops' shape.
  const blob = (gg: Graphics): Graphics =>
    gg
      .moveTo(-w / 2, h / 2)
      .quadraticCurveTo(-w / 2, -h / 2, 0, -h / 2)
      .quadraticCurveTo(w / 2, -h / 2, w / 2, h / 2)
      .closePath();
  blob(g).fill(RAINBOW[0]);
  const band = w / RAINBOW.length;
  for (let i = 1; i < RAINBOW.length; i++)
    g.rect(-w / 2 + i * band, -h / 2 + Math.abs(i - 2.5) * 1.5, band + 0.5, h - Math.abs(i - 2.5) * 1.5).fill(
      RAINBOW[i]!,
    );
  blob(g).stroke(stroke(3));
  g.ellipse(-w * 0.15, -h * 0.1, w * 0.1, h * 0.12).fill({ color: 0xffffff, alpha: 0.7 });
}

function monocle(g: Graphics, def: ItemDef, w: number, h: number): void {
  const r = Math.min(w, h * 0.7) * 0.46;
  const cy = -h / 2 + r + 2;
  g.moveTo(r * 0.6, cy + r * 0.8)
    .quadraticCurveTo(w * 0.4, h * 0.2, 0, h / 2 - 2)
    .stroke({ width: 2, color: def.accent, cap: 'round' });
  g.circle(0, cy, r).fill({ color: def.color, alpha: 0.5 });
  g.circle(0, cy, r).stroke({ width: 4, color: def.accent });
  g.circle(0, cy, r + 2).stroke(stroke(1.5));
  g.moveTo(-r * 0.5, cy - r * 0.2)
    .lineTo(-r * 0.15, cy - r * 0.55)
    .stroke({ width: 2.4, color: 0xffffff, alpha: 0.85, cap: 'round' });
}

/** Draw an M10 item. False if `def.art` is not one of these. */
export function drawItemArt10(g: Graphics, def: ItemDef, w: number, h: number): boolean {
  switch (def.art) {
    case 'key_tiny':
      keyTiny(g, def, w, h);
      return true;
    case 'map_scrap':
      mapScrap(g, def, w, h);
      return true;
    case 'treasure_map':
      treasureMap(g, def, w, h);
      return true;
    case 'marble_gold':
      marbleGold(g, def, w);
      return true;
    case 'gnome_nose':
      gnomeNose(g, def, w, h);
      return true;
    case 'hat_bubble':
      hatBubble(g, def, w, h);
      return true;
    case 'hat_candle':
      hatCandle(g, def, w, h);
      return true;
    case 'cloud_jar':
      cloudJar(g, def, w, h);
      return true;
    case 'paint_rainbow':
      paintRainbow(g, def, w, h);
      return true;
    case 'monocle':
      monocle(g, def, w, h);
      return true;
    default:
      return false;
  }
}
