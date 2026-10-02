import type { Graphics } from 'pixi.js';
import type { ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, stroke } from '../palette';

/**
 * Art for the playtest's tidy-up things (F2): the tidy whistle, a chunky
 * plastic sports whistle with a red cord looped through its ring. `w` and
 * `h` are the body's box in pixels, centered on the origin.
 */
export function drawWhistle(g: Graphics, def: ItemDef, w: number, h: number): void {
  const body = def.color;
  const cord = def.accent;
  const r = h * 0.62;
  const cx = w / 2 - r;
  // The cord, looped through the ring and trailing off behind.
  g.moveTo(cx + r * 0.7, -r * 0.7)
    .bezierCurveTo(cx + r * 2.1, -r * 2.2, cx + r * 2.6, r * 0.2, cx + r * 1.5, r * 0.9)
    .stroke({ width: 7, color: OUTLINE, cap: 'round' });
  g.moveTo(cx + r * 0.7, -r * 0.7)
    .bezierCurveTo(cx + r * 2.1, -r * 2.2, cx + r * 2.6, r * 0.2, cx + r * 1.5, r * 0.9)
    .stroke({ width: 3.5, color: cord, cap: 'round' });
  // The mouthpiece, a flat tube out to the left.
  g.roundRect(-w / 2, -h * 0.42, w - r, h * 0.5, 5)
    .fill(body)
    .stroke(stroke(4));
  // The round chamber.
  g.circle(cx, h * 0.04, r)
    .fill(body)
    .stroke(stroke(4));
  g.circle(cx - r * 0.25, -r * 0.2, r * 0.32).fill({ color: lighten(body, 0.6), alpha: 0.8 });
  // The slot the air comes out of, on top.
  g.roundRect(cx - r * 1.05, -h * 0.46, r * 0.62, h * 0.2, 2).fill(darken(body, 0.55));
  // The ring for the cord.
  g.circle(cx + r * 0.7, -r * 0.7, r * 0.3).stroke({ width: 5, color: OUTLINE });
  g.circle(cx + r * 0.7, -r * 0.7, r * 0.3).stroke({ width: 2.5, color: lighten(body, 0.2) });
  // A shine along the mouthpiece.
  g.moveTo(-w / 2 + 6, -h * 0.28)
    .lineTo(cx - r * 1.2, -h * 0.28)
    .stroke({ width: 3, color: lighten(body, 0.6), cap: 'round' });
}

/** The whistle's silhouette, for the hover rim. */
export function outlineWhistle(g: Graphics, w: number, h: number): void {
  const r = h * 0.62;
  const cx = w / 2 - r;
  g.roundRect(-w / 2, -h * 0.42, w - r, h * 0.5, 5).circle(cx, h * 0.04, r);
}
