// The twig's outline, for the art check (docs/06-art-guide.md, B10). Twig's
// `stick` layer is drawn as every loose twig in the world too (B7), and a
// twig's hover rim, paint, and physics body follow the twig the game draws
// in code (`ItemSprite.twig`). So a set's `stick` has to keep that shape, and
// the importer compares the two.
//
// The shape is written out here a second time, as plain numbers, because the
// importer runs in Node with no Pixi to draw the real one. A unit test reads
// the item's own drawing and fails if the two ever differ.
//
// No imports, so the Node scripts in scripts/art/ can load this file.

/** The bug and the part that double as the twig item. */
export const TWIG_STICK = { bug: 'bug_stickinsect_twig', part: 'stick' } as const;

/** The twig item's body in game pixels: 1.3 m long, 0.11 m thick. */
export const TWIG_SIZE = { w: 130, h: 11 } as const;

/** The width of the dark line round the stick, in game pixels. Half of it lies outside the body. */
const LINE = 4.5;
/** The two nubs where little branches broke off: where each leaves the stick, as a share of its length, and which way it leans. */
const NUBS = [
  [-0.18, -1],
  [0.26, 1],
] as const;

/** How far a set's `stick` may stray from the twig's outline, either way, in template pixels. */
export const STICK_TOLERANCE = 16;

/** A line with round ends: every point within `r` of the stretch from (x0, y0) to (x1, y1). */
export interface Capsule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

/**
 * The twig as the game draws it, in game pixels from its middle: the stick
 * with its outline, and the two nubs.
 */
export function twigOutline(w: number = TWIG_SIZE.w, h: number = TWIG_SIZE.h): Capsule[] {
  const stick: Capsule = { x0: -w / 2 + h / 2, y0: 0, x1: w / 2 - h / 2, y1: 0, r: h / 2 + LINE / 2 };
  const nubs = NUBS.map(([x, dir]): Capsule => ({
    x0: w * x,
    y0: -h / 2 + 2,
    x1: w * x + dir * h * 0.8,
    y1: -h * 1.3,
    r: (h * 0.55) / 2,
  }));
  return [stick, ...nubs];
}

/** How far a point is from a capsule's center line. */
function fromLine(x: number, y: number, c: Capsule): number {
  const dx = c.x1 - c.x0;
  const dy = c.y1 - c.y0;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - c.x0) * dx + (y - c.y0) * dy) / len)) : 0;
  return Math.hypot(x - c.x0 - t * dx, y - c.y0 - t * dy);
}

/** The box round an outline, in game pixels. */
export function outlineBox(shape: readonly Capsule[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...shape.map((c) => Math.min(c.x0, c.x1) - c.r)),
    y0: Math.min(...shape.map((c) => Math.min(c.y0, c.y1) - c.r)),
    x1: Math.max(...shape.map((c) => Math.max(c.x0, c.x1) + c.r)),
    y1: Math.max(...shape.map((c) => Math.max(c.y0, c.y1) + c.r)),
  };
}

/**
 * An outline as a bitmap, one bit per game pixel: `w` by `h` pixels whose
 * top left corner is at (x, y). Each pixel is sampled `detail` times each
 * way and is on when at least half the samples are inside, which is how a
 * painting on a template `detail` times game size is turned into a shape.
 */
export function outlineMask(
  shape: readonly Capsule[],
  x: number,
  y: number,
  w: number,
  h: number,
  detail = 1,
): Uint8Array {
  const bits = new Uint8Array(w * h);
  const inside = (px: number, py: number): boolean => shape.some((c) => fromLine(px, py, c) <= c.r);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let n = 0;
      for (let v = 0; v < detail; v++)
        for (let u = 0; u < detail; u++)
          if (inside(x + i + (u + 0.5) / detail, y + j + (v + 0.5) / detail)) n++;
      if (n * 2 >= detail * detail) bits[j * w + i] = 1;
    }
  return bits;
}
