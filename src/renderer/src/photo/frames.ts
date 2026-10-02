import type { Graphics } from 'pixi.js';
import { OUTLINE, STAR, darken, lighten, stroke } from '../render/palette';
import { H, W } from './photoMath';

/**
 * Photo frames (game design doc, section 14), drawn in code over the whole
 * 1920x1080 photo. A frame with `unlock` is greyed in the strip until that
 * secret is found. The strip's thumbnails are the same drawing, scaled.
 */
export interface FrameDef {
  id: string;
  draw(g: Graphics): void;
  unlock?: string;
}

const CREAM = 0xfffbef;
const PAPER = 0xe9d5a8;
const WOOD = 0xb77a44;
const GOO = 0x8fd14f;

/** A plain border: the photo shows through the middle. */
function border(g: Graphics, left: number, top: number, right: number, bottom: number, color: number): void {
  g.rect(0, 0, W, top)
    .rect(0, H - bottom, W, bottom)
    .rect(0, 0, left, H)
    .rect(W - right, 0, right, H)
    .fill(color);
}

function polaroid(g: Graphics): void {
  border(g, 48, 48, 48, 190, CREAM);
  g.rect(48, 48, W - 96, H - 238).stroke({ width: 4, color: OUTLINE, alpha: 0.35, alignment: 0 });
  g.rect(0, 0, W, H).stroke({ width: 10, color: 0xe5dcc8, alignment: 1 });
}

/** Leaves all round the edge, in a few greens, overlapping like a hedge. */
function leaf(g: Graphics): void {
  const greens = [0x5fbf3a, 0x7bd84a, 0x3f9a34, 0x9be35f];
  const leafAt = (x: number, y: number, angle: number, size: number, color: number): void => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const p = (lx: number, ly: number): [number, number] => [x + lx * c - ly * s, y + lx * s + ly * c];
    const [tx, ty] = p(size, 0);
    const [ax, ay] = p(size * 0.5, -size * 0.55);
    const [bx, by] = p(size * 0.5, size * 0.55);
    g.moveTo(x, y)
      .quadraticCurveTo(ax, ay, tx, ty)
      .quadraticCurveTo(bx, by, x, y)
      .fill(color)
      .stroke(stroke(4));
    const [mx, my] = p(size * 0.85, 0);
    g.moveTo(x, y)
      .lineTo(mx, my)
      .stroke({ width: 2.5, color: darken(color, 0.35) });
  };
  let k = 0;
  const along = (x0: number, y0: number, x1: number, y1: number, inward: number): void => {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 92);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const wobble = ((k * 37) % 11) / 11 - 0.5;
      leafAt(x, y, inward + wobble * 0.9, 120 + ((k * 13) % 5) * 10, greens[k % greens.length]!);
      k++;
    }
  };
  along(-30, 20, W + 30, 20, Math.PI / 2);
  along(-30, H - 20, W + 30, H - 20, -Math.PI / 2);
  along(20, -30, 20, H + 30, 0);
  along(W - 20, -30, W - 20, H + 30, Math.PI);
}

/** A postage stamp: a cream border whose outer edge is a row of round notches. */
function stamp(g: Graphics): void {
  const pitch = 60;
  const r = 20;
  const inset = 22;
  // Trace the stamp edge with a notch every `pitch` along each side.
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    // Inward normal (the rectangle is traced clockwise on screen).
    const nx = -uy;
    const ny = ux;
    const n = Math.floor(len / pitch);
    for (let i = 0; i <= n; i++) {
      const d = i * pitch;
      pts.push([x0 + ux * d, y0 + uy * d]);
      if (i === n) break;
      // A half circle notch between this tooth and the next.
      const cx = x0 + ux * (d + pitch / 2);
      const cy = y0 + uy * (d + pitch / 2);
      for (let s = 1; s < 8; s++) {
        const a = Math.PI - (Math.PI * s) / 8;
        pts.push([
          cx - Math.cos(a) * r * ux + Math.sin(a) * r * nx,
          cy - Math.cos(a) * r * uy + Math.sin(a) * r * ny,
        ]);
      }
    }
  };
  edge(inset, inset, W - inset, inset);
  edge(W - inset, inset, W - inset, H - inset);
  edge(W - inset, H - inset, inset, H - inset);
  edge(inset, H - inset, inset, inset);
  const b = 96;
  g.poly(pts.flat()).fill(CREAM);
  g.rect(b, b, W - 2 * b, H - 2 * b).cut();
  g.poly(pts.flat()).stroke(stroke(4));
  g.rect(b, b, W - 2 * b, H - 2 * b).stroke({ width: 5, color: OUTLINE, alignment: 0 });
  // A postmark: wavy lines and a ring, top right.
  g.circle(W - 190, 150, 64).stroke({ width: 6, color: 0x7a4a6a, alpha: 0.7 });
  g.circle(W - 190, 150, 50).stroke({ width: 4, color: 0x7a4a6a, alpha: 0.7 });
  for (let i = 0; i < 4; i++) {
    const y = 120 + i * 20;
    g.moveTo(W - 120, y)
      .bezierCurveTo(W - 90, y - 12, W - 60, y + 12, W - 30, y)
      .stroke({ width: 5, color: 0x7a4a6a, alpha: 0.6 });
  }
}

/** A black comic panel with a jagged action burst in the top right corner. */
function comic(g: Graphics): void {
  border(g, 34, 34, 34, 34, 0xffffff);
  g.rect(34, 34, W - 68, H - 68).stroke({ width: 14, color: OUTLINE, alignment: 0 });
  g.star(W - 150, 150, 14, 190, 120, 0.3)
    .fill(STAR)
    .stroke(stroke(10));
  g.star(W - 150, 150, 14, 120, 80, 0.5)
    .fill(0xffffff)
    .stroke(stroke(6));
  // Halftone dots along the bottom left.
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 4; j++) g.circle(70 + i * 30, H - 80 + j * 24 - (i % 2) * 12, 6 - j).fill(OUTLINE);
}

/** An old poster: torn tan paper with a blank space above and below, no words. */
function wanted(g: Graphics): void {
  const hole = { x0: 110, y0: 230, x1: W - 110, y1: H - 260 };
  // The paper: a torn band above the hole, one below, and the two sides.
  const tear = (y: number, dir: 1 | -1): void => {
    const pts: number[] = [];
    for (let x = -10; x <= W + 10; x += 38) pts.push(x, y + dir * (((x * 7) % 23) - 8));
    const far = dir > 0 ? -20 : H + 20;
    g.poly([...pts, W + 10, far, -10, far]).fill(PAPER);
  };
  tear(230, 1);
  tear(H - 260, -1);
  g.rect(0, hole.y0 - 1, hole.x0, hole.y1 - hole.y0 + 2).fill(PAPER);
  g.rect(hole.x1, hole.y0 - 1, W - hole.x1, hole.y1 - hole.y0 + 2).fill(PAPER);
  g.rect(hole.x0, hole.y0, hole.x1 - hole.x0, hole.y1 - hole.y0).stroke({
    width: 8,
    color: darken(PAPER, 0.6),
    alignment: 0,
  });
  // Stains, folds, and the two nails that hold it up.
  for (const [x, y, r] of [
    [170, 110, 44],
    [W - 300, H - 120, 60],
    [W - 120, 420, 36],
    [80, H - 420, 30],
  ] as const)
    g.circle(x, y, r).fill({ color: darken(PAPER, 0.35), alpha: 0.35 });
  g.moveTo(0, 120)
    .lineTo(W, 150)
    .stroke({ width: 3, color: darken(PAPER, 0.5), alpha: 0.4 });
  for (const x of [W / 2 - 400, W / 2 + 400]) {
    g.circle(x, 70, 16).fill(0x8a8a90).stroke(stroke(4));
    g.circle(x - 4, 66, 5).fill({ color: 0xffffff, alpha: 0.6 });
  }
  // Two blank sign bands, where the words would be if the bugs could read.
  g.roundRect(W / 2 - 420, 70, 840, 110, 20).fill({ color: darken(PAPER, 0.25), alpha: 0.5 });
  g.roundRect(W / 2 - 520, H - 200, 1040, 130, 20).fill({ color: darken(PAPER, 0.25), alpha: 0.5 });
}

/** A round photo inside a big bottle cap. */
function bottleCap(g: Graphics): void {
  const cx = W / 2;
  const cy = H / 2;
  const hole = 500;
  g.rect(0, 0, W, H).fill(0xd93a4a);
  g.circle(cx, cy, hole).cut();
  const teeth = 42;
  const pts: number[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const r = i % 2 === 0 ? 640 : 600;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.poly(pts).fill(0xc9c9d2);
  g.circle(cx, cy, hole).cut();
  g.poly(pts).stroke(stroke(8));
  g.circle(cx, cy, 585).fill(0xd93a4a);
  g.circle(cx, cy, hole).cut();
  g.circle(cx, cy, 585).stroke(stroke(6));
  g.circle(cx, cy, 540).stroke({ width: 10, color: 0xffffff, alpha: 0.6 });
  g.circle(cx, cy, hole).stroke(stroke(6));
  // Shine on the metal rim.
  g.arc(cx, cy, 615, Math.PI * 1.1, Math.PI * 1.45).stroke({ width: 14, color: 0xffffff, alpha: 0.55 });
}

/** Dripping green goo from the top edge and pooling in the bottom corners. */
function slime(g: Graphics): void {
  const drips: [number, number, number][] = [];
  for (let x = 20; x < W; x += 110) drips.push([x, 90 + ((x * 13) % 7) * 36, 34 + ((x * 7) % 5) * 5]);
  g.rect(0, 0, W, 70).fill(GOO);
  for (const [x, len, r] of drips) {
    g.roundRect(x - r, 40, r * 2, len, r).fill(GOO);
    g.circle(x, 40 + len, r * 1.08).fill(GOO);
  }
  // One outline around the whole top goo.
  g.rect(-10, -10, W + 20, 80).stroke(stroke(6));
  for (const [x, len, r] of drips) {
    g.moveTo(x - r, 70)
      .lineTo(x - r, 40 + len)
      .arc(x, 40 + len, r * 1.08, Math.PI, 0, true)
      .lineTo(x + r, 70)
      .stroke(stroke(6));
    g.ellipse(x - r * 0.35, 40 + len - 10, r * 0.22, r * 0.4).fill({ color: 0xffffff, alpha: 0.6 });
  }
  g.rect(0, 0, W, 70).fill(GOO);
  for (const [x, len, r] of drips) g.roundRect(x - r + 3, 44, r * 2 - 6, len - 4, r).fill(GOO);
  // Puddles in the bottom corners and up the sides a little.
  for (const side of [0, W]) {
    const d = side === 0 ? 1 : -1;
    g.moveTo(side, H - 260)
      .bezierCurveTo(side + d * 40, H - 200, side + d * 110, H - 150, side + d * 150, H - 60)
      .bezierCurveTo(side + d * 230, H - 30, side + d * 360, H - 50, side + d * 420, H + 10)
      .lineTo(side, H + 10)
      .closePath()
      .fill(GOO)
      .stroke(stroke(6));
    g.ellipse(side + d * 90, H - 110, 24, 12).fill({ color: 0xffffff, alpha: 0.55 });
  }
}

/** A carved wooden border (secret_bug_totem): planks with zigzags and little carved eyes. */
function totem(g: Graphics): void {
  border(g, 74, 74, 74, 74, WOOD);
  g.rect(74, 74, W - 148, H - 148).stroke({ width: 8, color: darken(WOOD, 0.5), alignment: 0 });
  g.rect(0, 0, W, H).stroke({ width: 10, color: darken(WOOD, 0.5), alignment: 1 });
  // Grain lines along each side, then a carved zigzag.
  const grain = { width: 3, color: darken(WOOD, 0.3), alpha: 0.6 };
  for (const y of [20, 50])
    g.moveTo(90, y)
      .lineTo(W - 90, y)
      .stroke(grain);
  for (const y of [H - 20, H - 50])
    g.moveTo(90, y)
      .lineTo(W - 90, y)
      .stroke(grain);
  const zig = (pts: number[]): void => {
    g.poly(pts, false).stroke({ width: 7, color: darken(WOOD, 0.55), join: 'round' });
    g.poly(
      pts.map((v, i) => (i % 2 === 0 ? v + 3 : v + 3)),
      false,
    ).stroke({ width: 3, color: lighten(WOOD, 0.4), join: 'round' });
  };
  const top: number[] = [];
  const bottom: number[] = [];
  for (let x = 110; x <= W - 110; x += 36) {
    const up = ((x / 36) | 0) % 2 === 0;
    top.push(x, up ? 24 : 54);
    bottom.push(x, up ? H - 54 : H - 24);
  }
  zig(top);
  zig(bottom);
  const left: number[] = [];
  const right: number[] = [];
  for (let y = 110; y <= H - 110; y += 36) {
    const out = ((y / 36) | 0) % 2 === 0;
    left.push(out ? 24 : 54, y);
    right.push(out ? W - 54 : W - 24, y);
  }
  zig(left);
  zig(right);
  // Carved eyes in each corner, like the stump's knothole.
  for (const [x, y] of [
    [40, 40],
    [W - 40, 40],
    [40, H - 40],
    [W - 40, H - 40],
  ] as const) {
    g.ellipse(x, y, 26, 18).fill(darken(WOOD, 0.6)).stroke(stroke(4));
    g.circle(x, y, 9).fill(STAR);
    g.circle(x, y, 4).fill(OUTLINE);
  }
}

/** A night sky with bug constellations (the finale's frame). */
function starry(g: Graphics): void {
  border(g, 80, 80, 80, 80, 0x1a1540);
  g.rect(80, 80, W - 160, H - 160).stroke({ width: 6, color: 0x5a4fa8, alignment: 0 });
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 160; i++) {
    const onSide = rnd() < 0.5;
    const x = onSide ? (rnd() < 0.5 ? rnd() * 80 : W - rnd() * 80) : rnd() * W;
    const y = onSide ? rnd() * H : rnd() < 0.5 ? rnd() * 80 : H - rnd() * 80;
    g.circle(x, y, 1 + rnd() * 2.5).fill({ color: 0xffffff, alpha: 0.5 + rnd() * 0.5 });
  }
  // Constellations: a ladybug (a dome and spots) and a snail (a spiral) joined by thin lines.
  const join = (pts: number[]): void => {
    g.poly(pts, false).stroke({ width: 2, color: 0xbfb8ff, alpha: 0.8 });
    for (let i = 0; i < pts.length; i += 2) {
      g.star(pts[i]!, pts[i + 1]!, 4, 9, 3).fill(0xffffff);
    }
  };
  join([W / 2 - 300, 40, W / 2 - 220, 14, W / 2 - 120, 12, W / 2 - 40, 40, W / 2 - 100, 62, W / 2 - 230, 60]);
  join([
    W / 2 + 160,
    H - 40,
    W / 2 + 240,
    H - 64,
    W / 2 + 300,
    H - 40,
    W / 2 + 280,
    H - 18,
    W / 2 + 230,
    H - 24,
  ]);
  join([30, H / 2 - 120, 60, H / 2 - 60, 30, H / 2, 58, H / 2 + 60, 28, H / 2 + 120]);
}

export const FRAMES: readonly FrameDef[] = [
  { id: 'frame_none', draw: () => undefined },
  { id: 'frame_polaroid', draw: polaroid },
  { id: 'frame_leaf', draw: leaf },
  { id: 'frame_stamp', draw: stamp },
  { id: 'frame_comic', draw: comic },
  { id: 'frame_wanted', draw: wanted },
  { id: 'frame_bottle_cap', draw: bottleCap },
  { id: 'frame_slime', draw: slime },
  { id: 'frame_totem', draw: totem, unlock: 'secret_bug_totem' },
  // The finale (M10's mysteries) is not built yet: this one waits.
  // Unlocked by the finale (M10).
  { id: 'frame_starry', draw: starry, unlock: 'secret_golden_marble_home' },
];

export const frameById = (id: string): FrameDef => FRAMES.find((f) => f.id === id) ?? FRAMES[0]!;
