import type { Graphics } from 'pixi.js';
import { OUTLINE, lighten, stroke } from '../render/palette';
import { SUNNY } from './icons';

/**
 * Wordless signs for save trouble, in the icons' style (centered on (0, 0),
 * about `s` pixels across).
 */

/**
 * A slot that will not open: a round brass padlock. `newer` adds a little
 * sparkle (the save came from a newer game and will open again in one).
 */
export function padlockIcon(g: Graphics, s: number, newer = false): Graphics {
  const k = s / 100;
  const brass = 0xf2b84b;
  g.roundRect(-24 * k, -46 * k, 48 * k, 56 * k, 24 * k).stroke({ width: 18 * k, color: OUTLINE });
  g.roundRect(-24 * k, -46 * k, 48 * k, 56 * k, 24 * k).stroke({ width: 9 * k, color: 0xc9ccd6 });
  g.roundRect(-38 * k, -12 * k, 76 * k, 60 * k, 14 * k)
    .fill(brass)
    .stroke(stroke(5 * k));
  g.roundRect(-30 * k, -6 * k, 60 * k, 8 * k, 4 * k).fill(lighten(brass, 0.35));
  g.circle(0, 12 * k, 8 * k).fill(OUTLINE);
  g.moveTo(0, 14 * k)
    .lineTo(0, 30 * k)
    .stroke({ width: 7 * k, color: OUTLINE, cap: 'round' });
  if (newer) {
    const x = 44 * k;
    const y = -44 * k;
    const r = 16 * k;
    g.moveTo(x, y - r)
      .quadraticCurveTo(x + 3 * k, y - 3 * k, x + r, y)
      .quadraticCurveTo(x + 3 * k, y + 3 * k, x, y + r)
      .quadraticCurveTo(x - 3 * k, y + 3 * k, x - r, y)
      .quadraticCurveTo(x - 3 * k, y - 3 * k, x, y - r)
      .fill(SUNNY)
      .stroke(stroke(3.5 * k));
  }
  return g;
}

/**
 * The game could not save: a small grey cloud with one drop. Soft rather
 * than alarming; it floats by the pause button until a save works again.
 */
export function saveCloudIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  const grey = 0xb8c2cf;
  g.moveTo(10 * k, 22 * k)
    .quadraticCurveTo(14 * k, 34 * k, 10 * k, 40 * k)
    .quadraticCurveTo(6 * k, 46 * k, 2 * k, 40 * k)
    .quadraticCurveTo(-2 * k, 34 * k, 10 * k, 22 * k)
    .fill(0x7cc4ff)
    .stroke(stroke(3.5 * k));
  const puffs: [number, number, number][] = [
    [-24, 2, 20],
    [2, -12, 27],
    [28, 2, 19],
  ];
  for (const [x, y, r] of puffs) g.circle(x * k, y * k, r * k).stroke(stroke(9 * k));
  g.roundRect(-40 * k, 0, 84 * k, 22 * k, 11 * k).stroke(stroke(9 * k));
  // Fill over the inner outlines so only the cloud's edge shows.
  for (const [x, y, r] of puffs) g.circle(x * k, y * k, r * k).fill(grey);
  g.roundRect(-40 * k, 0, 84 * k, 22 * k, 11 * k).fill(grey);
  g.ellipse(-4 * k, -20 * k, 12 * k, 6 * k).fill({ color: 0xffffff, alpha: 0.5 });
  return g;
}
