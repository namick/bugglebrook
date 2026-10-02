/**
 * Bug-shaped star patterns (game design doc, section 3, `fix_gnome_telescope`):
 * Gnome Hollow's telescope shows one constellation per bug in the cast, lit
 * for bugs found and dark for the rest, plus a chubby eight-legged one until
 * Wubbo is found. The finale's fireworks burst in the same shapes. Pure:
 * stars in a unit box (x and y from -1 to 1, y down) and the lines between them.
 */

export interface Constellation {
  /** Stars: x, y, and size (1 is a big star). */
  stars: [number, number, number][];
  /** Lines between stars, by index. */
  lines: [number, number][];
}

/** The hidden water bear that the dark constellation hints at (`mystery_tiny_squeak`). */
export const WUBBO = 'bug_tardigrade_wubbo';

type Shape = (c: Builder) => void;

class Builder {
  readonly stars: [number, number, number][] = [];
  readonly lines: [number, number][] = [];
  star(x: number, y: number, s = 0.6): number {
    this.stars.push([x, y, s]);
    return this.stars.length - 1;
  }
  line(a: number, b: number): void {
    this.lines.push([a, b]);
  }
  /** A closed ring of n stars on an ellipse; returns their indices. */
  ring(cx: number, cy: number, rx: number, ry: number, n: number, s = 0.6, from = 0): number[] {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = from + (i / n) * Math.PI * 2;
      ids.push(this.star(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, s));
    }
    ids.forEach((id, i) => this.line(id, ids[(i + 1) % ids.length]!));
    return ids;
  }
  /** A chain of stars, joined in order. */
  path(points: readonly (readonly [number, number])[], s = 0.45): number[] {
    const ids = points.map(([x, y]) => this.star(x, y, s));
    for (let i = 1; i < ids.length; i++) this.line(ids[i - 1]!, ids[i]!);
    return ids;
  }
  /** A leg or feeler from star `from` out through the points. */
  limb(from: number, points: readonly (readonly [number, number])[], s = 0.35): void {
    const ids = this.path(points, s);
    if (ids.length > 0) this.line(from, ids[0]!);
  }
}

/** Six legs under a body, from three stars along its belly. */
function legs(c: Builder, xs: readonly number[], y: number, reach = 0.35, s = 0.3): void {
  for (const x of xs) {
    const root = c.star(x, y, 0.3);
    c.limb(root, [[x - 0.08, y + reach]], s);
  }
}

const SHAPES: Record<string, Shape> = {
  ladybug: (c) => {
    const body = c.ring(0, 0, 0.62, 0.5, 8, 0.6, Math.PI);
    const head = c.star(0.82, -0.05, 0.75);
    c.line(body[4]!, head);
    c.star(-0.15, -0.15, 0.95);
    c.star(0.2, 0.12, 0.8);
    c.limb(head, [[1, -0.45]]);
    legs(c, [-0.35, 0, 0.35], 0.5);
  },
  pillbug: (c) => {
    const arc = c.path(
      [-0.8, -0.6, -0.3, 0, 0.3, 0.6, 0.8].map((x) => [x, 0.2 - Math.sqrt(Math.max(0, 1 - x * x)) * 0.55]),
      0.65,
    );
    c.line(arc[0]!, arc[arc.length - 1]!);
    c.limb(arc[arc.length - 1]!, [[1, -0.2]]);
    legs(c, [-0.5, -0.1, 0.3], 0.2, 0.3);
  },
  snail: (c) => {
    // The shell's spiral, then the foot and two eye stalks.
    const spiral: [number, number][] = [];
    for (let i = 0; i <= 9; i++) {
      const a = i * 0.75;
      const r = 0.55 - i * 0.05;
      spiral.push([-0.1 + Math.cos(a) * r, -0.1 + Math.sin(a) * r]);
    }
    c.path(spiral, 0.55);
    const foot = c.path(
      [
        [-0.8, 0.5],
        [0, 0.55],
        [0.7, 0.45],
      ],
      0.5,
    );
    c.limb(foot[2]!, [[0.9, -0.3]], 0.7);
    c.limb(foot[2]!, [[0.6, -0.4]], 0.5);
  },
  strider: (c) => {
    const body = c.path(
      [
        [-0.35, 0],
        [0, -0.05],
        [0.35, 0],
      ],
      0.6,
    );
    c.limb(body[0]!, [
      [-0.7, -0.25],
      [-1, 0.4],
    ]);
    c.limb(body[1]!, [
      [0, -0.45],
      [-0.2, 0.55],
    ]);
    c.limb(body[2]!, [
      [0.7, -0.25],
      [1, 0.4],
    ]);
    c.limb(body[2]!, [[0.6, -0.5]], 0.4);
  },
  grasshopper: (c) => {
    const body = c.path(
      [
        [-0.75, 0.05],
        [-0.3, -0.05],
        [0.2, -0.05],
        [0.6, 0],
      ],
      0.55,
    );
    const head = c.star(0.85, -0.12, 0.7);
    c.line(body[3]!, head);
    // The big folded hind leg, a spring.
    c.limb(body[1]!, [
      [-0.1, -0.6],
      [-0.75, 0.5],
    ]);
    c.limb(head, [
      [1, -0.5],
      [0.7, -0.9],
    ]);
    legs(c, [0.2, 0.5], 0.05, 0.4);
  },
  firefly: (c) => {
    const body = c.path(
      [
        [0.6, -0.1],
        [0.2, 0],
        [-0.25, 0.05],
      ],
      0.55,
    );
    const tail = c.star(-0.65, 0.1, 1.2);
    c.line(body[2]!, tail);
    c.ring(0.1, -0.45, 0.35, 0.22, 5, 0.4);
    c.limb(body[0]!, [[0.95, -0.45]]);
  },
  stinkbug: (c) => {
    // A shield.
    const ids = c.path(
      [
        [0.75, -0.1],
        [0.35, -0.5],
        [-0.45, -0.45],
        [-0.8, 0.1],
        [-0.45, 0.45],
        [0.35, 0.45],
      ],
      0.6,
    );
    c.line(ids[5]!, ids[0]!);
    c.limb(ids[0]!, [[1, -0.45]]);
    c.limb(ids[0]!, [[1, 0.2]]);
    legs(c, [-0.3, 0.1], 0.45);
  },
  stagbeetle: (c) => {
    const body = c.ring(-0.15, 0.05, 0.55, 0.42, 7, 0.65);
    const head = c.star(0.55, -0.05, 0.75);
    c.line(body[0]!, head);
    // The great antlers.
    c.limb(head, [
      [0.85, -0.45],
      [1, -0.15],
    ]);
    c.limb(head, [
      [0.95, 0.15],
      [0.75, 0.35],
    ]);
    legs(c, [-0.5, -0.15, 0.2], 0.47);
  },
  dungbeetle: (c) => {
    c.ring(-0.45, 0.05, 0.42, 0.42, 7, 0.5);
    const body = c.ring(0.35, 0.05, 0.32, 0.26, 5, 0.6);
    c.limb(body[0]!, [[0.85, -0.25]]);
    legs(c, [0.2, 0.45], 0.32, 0.3);
  },
  caterpillar: (c) => {
    const ids = c.path(
      [-0.85, -0.55, -0.25, 0.05, 0.35, 0.65].map((x, i) => [
        x,
        (i % 2 === 0 ? 0.1 : -0.05) - (x > 0.5 ? 0.2 : 0),
      ]),
      0.7,
    );
    c.limb(ids[ids.length - 1]!, [[0.9, -0.55]]);
    for (const i of [0, 1, 2, 3]) c.limb(ids[i]!, [[-0.85 + i * 0.3, 0.42]], 0.25);
  },
  mantis: (c) => {
    const body = c.path(
      [
        [-0.85, 0.25],
        [-0.3, 0.1],
        [0.2, -0.2],
        [0.45, -0.6],
      ],
      0.55,
    );
    const head = c.star(0.7, -0.75, 0.75);
    c.line(body[3]!, head);
    // Folded arms, ready for a chop.
    c.limb(body[2]!, [
      [0.75, -0.2],
      [0.6, -0.45],
    ]);
    legs(c, [-0.45, -0.1], 0.18, 0.45);
  },
  stickinsect: (c) => {
    const body = c.path(
      [
        [-1, 0],
        [-0.45, -0.02],
        [0.1, -0.03],
        [0.65, -0.02],
      ],
      0.45,
    );
    c.limb(body[3]!, [[1, -0.35]]);
    for (const i of [1, 2, 3]) c.limb(body[i]!, [[-0.3 + i * 0.25, 0.5]], 0.3);
  },
  // Wubbo: chubby, round, eight stubby legs.
  tardigrade: (c) => {
    c.ring(0, -0.05, 0.75, 0.42, 9, 0.6);
    c.star(0.82, -0.12, 0.55);
    for (const x of [-0.55, -0.2, 0.15, 0.5]) {
      const root = c.star(x, 0.37, 0.3);
      c.limb(root, [[x, 0.62]], 0.35);
    }
    for (const x of [-0.4, 0.3]) {
      const root = c.star(x, 0.3, 0.25);
      c.limb(root, [[x + 0.15, 0.6]], 0.3);
    }
  },
};

/** The constellation for a bug's art (`BugDef.art`), or Wubbo's for `tardigrade`. */
export function constellation(art: string): Constellation {
  const c = new Builder();
  (SHAPES[art] ?? SHAPES.ladybug!)(c);
  return { stars: c.stars, lines: c.lines };
}

/** Where each constellation sits in the telescope's view: rows across the sky, unit box (0 to 1). */
export function skyLayout(n: number): { x: number; y: number; scale: number }[] {
  const cols = n <= 8 ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const out: { x: number; y: number; scale: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const c = i % cols;
    const x = (c + 0.5) / inRow;
    // A gentle wave, so it reads as a sky and not a grid.
    const y = (r + 0.5) / rows + Math.sin(i * 2.1) * 0.035;
    out.push({ x: 0.1 + x * 0.8, y: 0.12 + y * 0.76, scale: 1 / Math.max(cols, rows * 1.4) });
  }
  return out;
}

export interface SkyEntry {
  /** The bug's def ID (Wubbo's even before his def exists). */
  id: string;
  art: string;
  /** Found: lit gold. Not found: a dark outline. */
  lit: boolean;
  x: number;
  y: number;
  scale: number;
}

/**
 * What the telescope shows: one constellation per bug in the cast, lit for
 * the ones found, and Wubbo's chubby eight-legged one, dark until he is
 * found (whether or not his def exists yet).
 */
export function telescopeSky(
  cast: readonly { id: string; art: string; found: boolean }[],
  wubboFound: boolean,
): SkyEntry[] {
  const list = cast.filter((b) => b.id !== WUBBO).map((b) => ({ id: b.id, art: b.art, lit: b.found }));
  list.push({ id: WUBBO, art: 'tardigrade', lit: wubboFound });
  const spots = skyLayout(list.length);
  return list.map((b, i) => ({ ...b, ...spots[i]! }));
}
