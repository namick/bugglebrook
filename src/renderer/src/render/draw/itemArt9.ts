import type { Graphics } from 'pixi.js';
import type { ItemArt, ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, stroke } from '../palette';

/**
 * Art for M9's instruments: the seedpod maraca, the acorn castanets, the
 * bottle flute, and the leaf xylophone. Each drawer fills the item's
 * collider, centered on the origin; `w` and `h` are its size in pixels.
 */

/** Every art key this file draws. */
export const M9_ARTS: readonly ItemArt[] = ['maraca', 'castanets', 'bottle_flute', 'leaf_xylophone'];

function maraca(g: Graphics, def: ItemDef, w: number, h: number): void {
  const podH = h * 0.62;
  const podY = -h / 2 + podH / 2;
  // The stick, then the dry seedpod on top with its ridges and a few seeds showing.
  g.roundRect(-w * 0.12, podY + podH * 0.3, w * 0.24, h / 2 - (podY + podH * 0.3), w * 0.1)
    .fill(def.accent)
    .stroke(stroke(3));
  g.ellipse(0, podY, w / 2, podH / 2)
    .fill(def.color)
    .stroke(stroke(3.5));
  for (const k of [-0.25, 0, 0.25])
    g.moveTo(k * w, podY - podH * 0.45)
      .quadraticCurveTo(k * w * 1.6, podY, k * w, podY + podH * 0.45)
      .stroke({ width: 1.6, color: darken(def.color, 0.35) });
  for (const [x, y] of [
    [-0.12, -0.1],
    [0.14, 0.05],
    [0, 0.2],
  ] as const)
    g.circle(x * w, podY + y * podH, w * 0.06).fill(darken(def.color, 0.5));
  g.ellipse(-w * 0.18, podY - podH * 0.22, w * 0.1, podH * 0.12).fill({ color: 0xffffff, alpha: 0.5 });
  // A little curl of dry stem on top.
  g.moveTo(0, -h / 2 + 2)
    .quadraticCurveTo(w * 0.15, -h / 2 - 4, w * 0.22, -h / 2 + 3)
    .stroke({ width: 2.5, color: darken(def.accent, 0.3), cap: 'round' });
}

function castanets(g: Graphics, def: ItemDef, w: number, h: number): void {
  // Two acorn cups face to face, held by a loop of string.
  for (const side of [-1, 1]) {
    const cx = side * w * 0.24;
    g.ellipse(cx, 0, w * 0.26, h * 0.46)
      .fill(def.color)
      .stroke(stroke(3));
    // The cup's scaly texture.
    for (let k = -1; k <= 1; k++)
      g.moveTo(cx - w * 0.16, k * h * 0.18)
        .quadraticCurveTo(cx, k * h * 0.18 + h * 0.08, cx + w * 0.16, k * h * 0.18)
        .stroke({ width: 1.4, color: darken(def.color, 0.35) });
    g.ellipse(cx - side * w * 0.07, -h * 0.2, w * 0.06, h * 0.08).fill({ color: 0xffffff, alpha: 0.45 });
  }
  // The gap where they clack, and the string loop.
  g.moveTo(0, -h * 0.4)
    .lineTo(0, h * 0.4)
    .stroke({ width: 2, color: OUTLINE });
  g.moveTo(-w * 0.05, -h * 0.42)
    .quadraticCurveTo(0, -h * 0.7, w * 0.05, -h * 0.42)
    .stroke({ width: 2.2, color: def.accent, cap: 'round' });
}

function bottleFlute(g: Graphics, def: ItemDef, w: number, h: number): void {
  const neckW = w * 0.38;
  const shoulder = -h * 0.12;
  const body = (gg: Graphics): Graphics =>
    gg
      .moveTo(-neckW / 2, -h / 2 + 3)
      .lineTo(-neckW / 2, shoulder - h * 0.08)
      .quadraticCurveTo(-w / 2, shoulder, -w / 2, shoulder + h * 0.12)
      .lineTo(-w / 2, h / 2 - 4)
      .quadraticCurveTo(-w / 2, h / 2, -w / 2 + 4, h / 2)
      .lineTo(w / 2 - 4, h / 2)
      .quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - 4)
      .lineTo(w / 2, shoulder + h * 0.12)
      .quadraticCurveTo(w / 2, shoulder, neckW / 2, shoulder - h * 0.08)
      .lineTo(neckW / 2, -h / 2 + 3)
      .closePath();
  body(g).fill({ color: def.color, alpha: 0.85 });
  // A little water inside sets its note.
  g.rect(-w / 2 + 3, h * 0.15, w - 6, h * 0.33).fill({ color: 0x4fa8d8, alpha: 0.55 });
  body(g).stroke(stroke(3.5));
  // The lip you blow across, and a shine down the side.
  g.ellipse(0, -h / 2 + 3, neckW / 2 + 1, 3)
    .fill(lighten(def.color, 0.5))
    .stroke(stroke(2.5));
  g.moveTo(-w * 0.28, shoulder + h * 0.1)
    .lineTo(-w * 0.28, h * 0.38)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.6, cap: 'round' });
  // A paper label with three notes on it.
  g.roundRect(-w * 0.36, -h * 0.02, w * 0.72, h * 0.14, 2)
    .fill(def.accent)
    .stroke(stroke(1.6));
  for (const k of [-0.18, 0, 0.18]) g.circle(k * w, h * 0.05, 1.8).fill(OUTLINE);
}

function leafXylophone(g: Graphics, def: ItemDef, w: number, h: number): void {
  // Two twig rails, then five leaf bars, longest on the left.
  for (const y of [-h * 0.18, h * 0.24])
    g.roundRect(-w / 2, y - 3, w, 6, 3)
      .fill(def.accent)
      .stroke(stroke(2.5));
  const bars = 5;
  const gap = w / bars;
  const tints = [0x6fbf4a, 0x8fd14f, 0xb5d84a, 0xe0c84a, 0xf0a84a];
  for (let i = 0; i < bars; i++) {
    const x = -w / 2 + gap * (i + 0.5);
    const bh = h * (0.95 - i * 0.1);
    g.roundRect(x - gap * 0.36, -bh / 2, gap * 0.72, bh, gap * 0.3)
      .fill(tints[i] ?? def.color)
      .stroke(stroke(2.5));
    // The leaf's middle vein.
    g.moveTo(x, -bh / 2 + 3)
      .lineTo(x, bh / 2 - 3)
      .stroke({ width: 1.4, color: darken(tints[i] ?? def.color, 0.35) });
  }
}

/** Draw an M9 item. Returns false when the art is not one of M9's. */
export function drawItemArt9(g: Graphics, def: ItemDef, w: number, h: number): boolean {
  switch (def.art) {
    case 'maraca':
      maraca(g, def, w, h);
      return true;
    case 'castanets':
      castanets(g, def, w, h);
      return true;
    case 'bottle_flute':
      bottleFlute(g, def, w, h);
      return true;
    case 'leaf_xylophone':
      leafXylophone(g, def, w, h);
      return true;
    default:
      return false;
  }
}

/** Trace an M9 item's silhouette (no fill), for its rim. False when it has none of its own. */
export function outlineItemArt9(g: Graphics, def: ItemDef, w: number, h: number): boolean {
  switch (def.art) {
    case 'maraca':
      g.ellipse(0, -h / 2 + h * 0.31, w / 2, h * 0.31);
      g.roundRect(-w * 0.12, -h * 0.0, w * 0.24, h / 2, w * 0.1);
      return true;
    case 'castanets':
      g.ellipse(-w * 0.24, 0, w * 0.26, h * 0.46);
      g.ellipse(w * 0.24, 0, w * 0.26, h * 0.46);
      return true;
    case 'bottle_flute':
      g.roundRect(-w / 2, -h * 0.1, w, h * 0.6, 4);
      g.rect(-w * 0.19, -h / 2, w * 0.38, h * 0.42);
      return true;
    case 'leaf_xylophone':
      g.roundRect(-w / 2, -h / 2, w, h, 6);
      return true;
    default:
      return false;
  }
}
