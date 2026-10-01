import type { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { BoxPart, ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { hash01 } from '../bugPose';

/**
 * Art for the M7 items (the flowerbed, under the porch, the compost lab, and
 * the treehouse). Each drawer fills the item's collider, centered on the
 * origin and unrotated; `w` and `h` are the collider's size in pixels.
 */

type Pt = readonly [number, number];

const WOOD_DARK = 0x6b4a3a;
const LEAF_GREEN = 0x6fa857;
const METAL = 0xc7d3e3;

/** Trace a polyline. */
function path(g: Graphics, pts: readonly Pt[]): Graphics {
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  return g;
}

/** A line with the shared dark outline under a colored core. */
function wire(g: Graphics, pts: readonly Pt[], width: number, color: number, edge = 3): void {
  path(g, pts).stroke({ width: width + edge * 2, color: OUTLINE, cap: 'round', join: 'round' });
  path(g, pts).stroke({ width, color, cap: 'round', join: 'round' });
}

/** The corners of a w x h box centered at (cx, cy), turned by `a` (as physics turns it). */
function rotRect(cx: number, cy: number, w: number, h: number, a: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: number[] = [];
  for (const [x, y] of [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ] as const)
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  return out;
}

/** A lumpy ring of points around the origin. */
function lumps(r: number, n: number, seed: number, jitter: number, squashBottom = 1): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (hash01(seed, i) - 0.5) * jitter;
    pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k * (Math.sin(a) > 0 ? squashBottom : 1));
  }
  return pts;
}

/** A pointed leaf of length `len` and width `wid`, from (x, y) toward angle `a`. */
function leafPoly(x: number, y: number, len: number, wid: number, a: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts: number[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = Math.sin(t * Math.PI) * wid * 0.5;
    pts.push(x + c * len * t - s * off, y + s * len * t + c * off);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    const off = -Math.sin(t * Math.PI) * wid * 0.5;
    pts.push(x + c * len * t - s * off, y + s * len * t + c * off);
  }
  return pts;
}

/** A small four-point twinkle. */
function twinkle(g: Graphics, x: number, y: number, r: number, alpha = 0.95): void {
  g.star(x, y, 4, r, r * 0.28).fill({ color: 0xffffff, alpha });
}

/** Parts of a compound box in pixels. */
function partsPx(def: ItemDef): BoxPart[] {
  const s = def.shape;
  if (s.type !== 'box' || !s.parts) return [];
  const k = PIXELS_PER_METER;
  return s.parts.map((p) => ({
    x: p.x * k,
    y: p.y * k,
    width: p.width * k,
    height: p.height * k,
    angle: p.angle,
  }));
}

// --- Paths shared by the drawings and the silhouettes ----------------------

function seedPath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(w / 2, h * 0.05)
    .bezierCurveTo(w * 0.22, -h * 0.72, -w / 2, -h * 0.66, -w / 2, 0)
    .bezierCurveTo(-w / 2, h * 0.66, w * 0.22, h * 0.72, w / 2, h * 0.05)
    .closePath();
}

function honeyPath(g: Graphics, r: number): Graphics {
  const dy = r * 0.18;
  return g
    .moveTo(0, -r * 1.15 + dy)
    .bezierCurveTo(r * 0.35, -r * 0.7 + dy, r * 1.05, -r * 0.2 + dy, r * 1.04, r * 0.28 + dy)
    .bezierCurveTo(r * 1.02, r * 1.02 + dy, -r * 1.02, r * 1.02 + dy, -r * 1.04, r * 0.28 + dy)
    .bezierCurveTo(-r * 1.05, -r * 0.2 + dy, -r * 0.35, -r * 0.7 + dy, 0, -r * 1.15 + dy)
    .closePath();
}

function bellPath(g: Graphics, w: number, h: number): Graphics {
  const cx = w * 0.1;
  return g
    .moveTo(cx - w * 0.2, h * 0.22)
    .bezierCurveTo(cx - w * 0.24, -h * 0.08, cx - w * 0.17, -h * 0.36, cx, -h * 0.36)
    .bezierCurveTo(cx + w * 0.17, -h * 0.36, cx + w * 0.24, -h * 0.08, cx + w * 0.2, h * 0.22)
    .quadraticCurveTo(cx + w * 0.3, h * 0.3, cx + w * 0.38, h * 0.4)
    .quadraticCurveTo(cx + w * 0.2, h * 0.36, cx + w * 0.13, h * 0.5)
    .quadraticCurveTo(cx + w * 0.06, h * 0.38, cx, h * 0.52)
    .quadraticCurveTo(cx - w * 0.06, h * 0.38, cx - w * 0.13, h * 0.5)
    .quadraticCurveTo(cx - w * 0.2, h * 0.36, cx - w * 0.38, h * 0.4)
    .quadraticCurveTo(cx - w * 0.3, h * 0.3, cx - w * 0.2, h * 0.22)
    .closePath();
}

function petalPath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w / 2, h * 0.3)
    .bezierCurveTo(-w * 0.25, -h * 1.5, w * 0.25, -h * 1.9, w * 0.47, -h * 0.9)
    .lineTo(w * 0.4, -h * 0.25)
    .lineTo(w * 0.5, h * 0.15)
    .bezierCurveTo(w * 0.3, h * 1.1, -w * 0.2, h * 1.05, -w / 2, h * 0.3)
    .closePath();
}

function tissuePath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w / 2 + 4, h / 2)
    .quadraticCurveTo(-w / 2 - 3, h * 0.05, -w * 0.36, -h * 0.35)
    .quadraticCurveTo(-w * 0.28, -h * 0.95, -w * 0.12, -h * 0.5)
    .quadraticCurveTo(w * 0.0, -h * 1.05, w * 0.14, -h * 0.55)
    .quadraticCurveTo(w * 0.3, -h * 1.0, w * 0.4, -h * 0.3)
    .quadraticCurveTo(w / 2 + 4, h * 0.05, w / 2 - 4, h / 2)
    .closePath();
}

function eggPath(g: Graphics, w: number, h: number): Graphics {
  const top = -h * 0.28;
  const teeth = 11;
  g.moveTo(-w / 2 + 1, top);
  for (let i = 1; i <= teeth; i++) {
    const x = -w / 2 + 1 + (i / teeth) * (w - 2);
    g.lineTo(x - (w - 2) / teeth / 2, top + (i % 2 === 0 ? 3 : -3));
    g.lineTo(x, top);
  }
  return g
    .bezierCurveTo(w / 2 + 2, h * 0.25, w * 0.28, h / 2, 0, h / 2)
    .bezierCurveTo(-w * 0.28, h / 2, -w / 2 - 2, h * 0.25, -w / 2 + 1, top)
    .closePath();
}

function coreOutline(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w * 0.45, -h * 0.2)
    .bezierCurveTo(-w * 0.55, -h * 0.5, w * 0.55, -h * 0.5, w * 0.45, -h * 0.2)
    .bezierCurveTo(w * 0.2, -h * 0.1, w * 0.2, h * 0.1, w * 0.45, h * 0.22)
    .bezierCurveTo(w * 0.55, h * 0.52, -w * 0.55, h * 0.52, -w * 0.45, h * 0.22)
    .bezierCurveTo(-w * 0.2, h * 0.1, -w * 0.2, -h * 0.1, -w * 0.45, -h * 0.2)
    .closePath();
}

function jarPath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w * 0.36, -h * 0.32)
    .lineTo(-w * 0.36, -h * 0.24)
    .quadraticCurveTo(-w / 2, -h * 0.22, -w / 2, -h * 0.08)
    .lineTo(-w / 2, h / 2 - 9)
    .quadraticCurveTo(-w / 2, h / 2, -w / 2 + 9, h / 2)
    .lineTo(w / 2 - 9, h / 2)
    .quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - 9)
    .lineTo(w / 2, -h * 0.08)
    .quadraticCurveTo(w / 2, -h * 0.22, w * 0.36, -h * 0.24)
    .lineTo(w * 0.36, -h * 0.32)
    .closePath();
}

function capPath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w / 2, h * 0.18)
    .bezierCurveTo(-w * 0.52, -h * 0.72, w * 0.52, -h * 0.72, w / 2, h * 0.18)
    .quadraticCurveTo(w * 0.3, h * 0.3, 0, h * 0.28)
    .quadraticCurveTo(-w * 0.3, h * 0.3, -w / 2, h * 0.18)
    .closePath();
}

function topPath(g: Graphics, r: number): Graphics {
  return g
    .moveTo(-r * 0.98, -r * 0.18)
    .bezierCurveTo(-r * 0.9, -r * 0.6, r * 0.9, -r * 0.6, r * 0.98, -r * 0.18)
    .quadraticCurveTo(r * 0.85, r * 0.35, 0, r * 0.98)
    .quadraticCurveTo(-r * 0.85, r * 0.35, -r * 0.98, -r * 0.18)
    .closePath();
}

function gooPoints(r: number, seed: number): number[] {
  const pts: number[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (hash01(seed + 5, i) - 0.5) * 0.18;
    const below = Math.sin(a) > 0;
    pts.push(
      Math.cos(a) * r * k * 1.12,
      below ? Math.sin(a) * r * 0.8 + r * 0.12 : Math.sin(a) * r * k * 0.95 + r * 0.12,
    );
  }
  return pts;
}

/** Circles along the cheese puff's wiggly middle: x, y, radius. */
function puffBalls(w: number, h: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = h * (0.44 + 0.08 * Math.sin(i * 2.3));
    out.push([-w / 2 + r + t * (w - 2 * r), Math.sin(t * Math.PI * 1.6) * h * 0.14, r]);
  }
  return out;
}

// --- The flowerbed ---------------------------------------------------------

function pollenPuff(g: Graphics, def: ItemDef, r: number, seed: number): void {
  const pts: number[] = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 2 === 0 ? 1.02 : 0.84 + hash01(seed, i) * 0.06;
    pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  g.poly(pts).fill(def.color).stroke(stroke(4));
  g.circle(-r * 0.12, -r * 0.14, r * 0.6).fill({ color: lighten(def.color, 0.4), alpha: 0.85 });
  // Tufts of fuzz, then pollen specks.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5)
      .lineTo(Math.cos(a + 0.15) * r * 0.76, Math.sin(a + 0.15) * r * 0.76)
      .stroke({ width: 2, color: def.accent, cap: 'round' });
  }
  for (let i = 0; i < 7; i++) {
    const a = hash01(seed, i + 40) * Math.PI * 2;
    const d = hash01(seed, i + 60) * r * 0.6;
    g.circle(Math.cos(a) * d, Math.sin(a) * d, 1.5 + hash01(seed, i + 80) * 1.2).fill(
      darken(def.accent, 0.1),
    );
  }
  g.circle(-r * 0.34, -r * 0.38, r * 0.16).fill({ color: 0xffffff, alpha: 0.9 });
  // A few loose grains floating off it.
  for (const [x, y] of [
    [1.15, -0.7],
    [-1.2, -0.45],
    [0.95, -1.1],
  ] as const)
    g.circle(r * x, r * y, 2).fill(def.accent);
}

function seed(g: Graphics, def: ItemDef, w: number, h: number): void {
  seedPath(g, w, h).fill(def.color).stroke(stroke(4));
  for (const k of [-0.3, 0, 0.3]) {
    g.moveTo(-w * 0.38, k * h * 0.9)
      .quadraticCurveTo(0, k * h * 1.35, w * 0.4, k * h * 0.25)
      .stroke({ width: 2.2, color: def.accent, alpha: 0.9, cap: 'round' });
  }
  g.moveTo(-w * 0.3, -h * 0.34)
    .quadraticCurveTo(-w * 0.1, -h * 0.46, w * 0.08, -h * 0.4)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.45, cap: 'round' });
}

function lavender(g: Graphics, def: ItemDef, w: number, h: number): void {
  const stemEnd = w * 0.46;
  // Two little leaves at the base, then the stem.
  g.poly(leafPoly(-w * 0.36, 0, w * 0.2, 6, -0.45))
    .fill(def.accent)
    .stroke(stroke(2.5));
  g.poly(leafPoly(-w * 0.3, 0, w * 0.17, 5, 0.5))
    .fill(def.accent)
    .stroke(stroke(2.5));
  wire(
    g,
    [
      [-w / 2, h * 0.1],
      [stemEnd, -h * 0.05],
    ],
    3,
    def.accent,
    2,
  );
  // Buds in pairs up the stem, smaller toward the tip.
  const buds: [number, number, number][] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -w * 0.08 + t * (stemEnd - -w * 0.08);
    const s = 1 - t * 0.35;
    buds.push([x, -h * 0.34 * s, s], [x + 2, h * 0.3 * s, s]);
  }
  for (const [i, [x, y, s]] of buds.entries())
    g.ellipse(x, y, 4.2 * s, 3.4 * s)
      .fill(i % 3 === 0 ? lighten(def.color, 0.2) : def.color)
      .stroke(stroke(2.2));
  g.ellipse(stemEnd + 3, -h * 0.05, 3.6, 2.8)
    .fill(lighten(def.color, 0.15))
    .stroke(stroke(2.2));
  for (const [x, y, s] of buds.filter((_, i) => i % 2 === 0))
    g.circle(x - 1.2 * s, y - 1.2 * s, 1.1).fill({ color: 0xffffff, alpha: 0.75 });
}

function honeyDrop(g: Graphics, def: ItemDef, r: number): void {
  honeyPath(g, r).fill(def.color).stroke(stroke(4.5));
  const dy = r * 0.18;
  g.ellipse(r * 0.12, r * 0.5 + dy, r * 0.62, r * 0.32).fill({ color: def.accent, alpha: 0.55 });
  g.ellipse(0, r * 0.82 + dy, r * 0.7, r * 0.12).fill({ color: darken(def.color, 0.15), alpha: 0.5 });
  g.moveTo(-r * 0.62, r * 0.35)
    .quadraticCurveTo(-r * 0.6, -r * 0.25, -r * 0.2, -r * 0.62)
    .stroke({ width: r * 0.22, color: 0xffffff, alpha: 0.85, cap: 'round' });
  g.circle(r * 0.45, r * 0.05 + dy, r * 0.1).fill({ color: 0xffffff, alpha: 0.8 });
  twinkle(g, r * 0.55, -r * 0.5, r * 0.3);
}

function bluebell(g: Graphics, def: ItemDef, w: number, h: number): void {
  const cx = w * 0.1;
  // The arching stem and a leaf, then the bell hanging from it.
  g.poly(leafPoly(-w * 0.42, h * 0.45, w * 0.3, 7, -0.9))
    .fill(def.accent)
    .stroke(stroke(2.5));
  const stem: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = -w * 0.46 + t * (cx - -w * 0.46);
    const y = h * 0.5 - Math.sin(t * Math.PI * 0.85) * h * 1.05 + t * t * h * 0.05;
    stem.push([x, y]);
  }
  stem.push([cx, -h * 0.34]);
  wire(g, stem, 3, def.accent, 2);
  bellPath(g, w, h).fill(def.color).stroke(stroke(3.5));
  // The dark mouth, a pale clapper, and a bright stripe down the side.
  g.ellipse(cx, h * 0.4, w * 0.15, h * 0.06).fill({ color: darken(def.color, 0.45), alpha: 0.9 });
  g.moveTo(cx, h * 0.34)
    .lineTo(cx + 1, h * 0.52)
    .stroke({ width: 2, color: 0xfff3b8, cap: 'round' });
  g.circle(cx + 1, h * 0.55, 2.4)
    .fill(0xfff3b8)
    .stroke(stroke(1.5));
  g.moveTo(cx - w * 0.12, h * 0.12)
    .quadraticCurveTo(cx - w * 0.12, -h * 0.18, cx - w * 0.02, -h * 0.26)
    .stroke({ width: 2.5, color: lighten(def.color, 0.55), cap: 'round' });
  g.ellipse(cx + w * 0.08, -h * 0.05, w * 0.05, h * 0.16).fill({
    color: darken(def.color, 0.15),
    alpha: 0.35,
  });
}

function petal(g: Graphics, def: ItemDef, w: number, h: number): void {
  petalPath(g, w, h).fill(def.color).stroke(stroke(3.5));
  g.moveTo(-w / 2 + 2, h * 0.3)
    .quadraticCurveTo(-w * 0.35, -h * 0.1, -w * 0.25, -h * 0.4)
    .lineTo(-w * 0.3, h * 0.55)
    .closePath()
    .fill({ color: darken(def.color, 0.12), alpha: 0.6 });
  g.moveTo(-w * 0.3, h * 0.05)
    .quadraticCurveTo(0, -h * 0.75, w * 0.3, -h * 0.35)
    .stroke({ width: 3, color: def.accent, cap: 'round' });
  g.circle(w * 0.08, -h * 0.9, 1.8).fill({ color: 0xffffff, alpha: 0.9 });
}

// --- Under the porch -------------------------------------------------------

/** Clip a polygon to the half-plane n.p <= d (Sutherland-Hodgman). */
function clipHalf(poly: Pt[], nx: number, ny: number, d: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = a[0] * nx + a[1] * ny - d;
    const db = b[0] * nx + b[1] * ny - d;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function lattice(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const frame = 26;
  const inset = frame * 0.5;
  const slat = 22;
  const gap = 92;
  const box: Pt[] = [
    [-w / 2 + inset, -h / 2 + inset],
    [w / 2 - inset, -h / 2 + inset],
    [w / 2 - inset, h / 2 - inset],
    [-w / 2 + inset, h / 2 - inset],
  ];
  const wood = (i: number): number =>
    mix(def.color, [0xb8a48f, 0xd8b48a, 0xa99a86, def.color][Math.floor(hash01(seedN, i) * 4)]!, 0.45);
  const reach = (w + h) / Math.SQRT2 / 2;
  // Two layers of diagonal slats: the back layer runs one way, the front the other.
  for (const [layer, nx, ny] of [
    [0, Math.SQRT1_2, Math.SQRT1_2],
    [1, Math.SQRT1_2, -Math.SQRT1_2],
  ] as const) {
    for (let k = -Math.ceil(reach / gap); k <= Math.ceil(reach / gap); k++) {
      const o = k * gap + (layer === 0 ? gap / 2 : 0);
      let poly = clipHalf(box, nx, ny, o + slat / 2);
      poly = clipHalf(poly, -nx, -ny, -(o - slat / 2));
      if (poly.length < 3) continue;
      const color = wood(k * 7 + layer * 31 + 100);
      g.poly(poly.flatMap(([x, y]) => [x, y]))
        .fill(color)
        .stroke(stroke(5));
      // Grain along the slat, and a weathered streak.
      const tx = -ny;
      const ty = nx;
      for (const [off, len, t0] of [
        [-4, 0.6, 0.1],
        [5, 0.4, 0.45],
      ] as const) {
        const cx = nx * (o + off);
        const cy = ny * (o + off);
        const L = reach * 2;
        const a0 = -L / 2 + L * (t0 + hash01(seedN, k + layer * 50) * 0.2);
        g.moveTo(cx + tx * a0, cy + ty * a0)
          .lineTo(cx + tx * (a0 + L * len * 0.25), cy + ty * (a0 + L * len * 0.25))
          .stroke({ width: 2, color: darken(color, 0.22), alpha: 0.6, cap: 'round' });
      }
    }
  }
  // The frame boards: left and right, then top and bottom over them.
  const board = (x: number, y: number, bw: number, bh: number, i: number): void => {
    const color = darken(wood(i + 300), 0.08);
    g.roundRect(x, y, bw, bh, 5).fill(color).stroke(stroke(5.5));
    const along = bw > bh;
    for (let j = 0; j < 3; j++) {
      const f = 0.2 + j * 0.3 + hash01(seedN, i * 3 + j) * 0.1;
      if (along)
        g.moveTo(x + bw * f, y + bh * (0.3 + (j % 2) * 0.35))
          .lineTo(x + bw * (f + 0.12), y + bh * (0.3 + (j % 2) * 0.35))
          .stroke({ width: 2, color: darken(color, 0.25), alpha: 0.7, cap: 'round' });
      else
        g.moveTo(x + bw * (0.3 + (j % 2) * 0.35), y + bh * f)
          .lineTo(x + bw * (0.3 + (j % 2) * 0.35), y + bh * (f + 0.1))
          .stroke({ width: 2, color: darken(color, 0.25), alpha: 0.7, cap: 'round' });
    }
    if (along)
      g.moveTo(x + 8, y + 4)
        .lineTo(x + bw - 8, y + 4)
        .stroke({ width: 2.5, color: lighten(color, 0.35), alpha: 0.7, cap: 'round' });
    else
      g.moveTo(x + 4, y + 8)
        .lineTo(x + 4, y + bh - 8)
        .stroke({ width: 2.5, color: lighten(color, 0.35), alpha: 0.7, cap: 'round' });
  };
  board(-w / 2, -h / 2, frame, h, 1);
  board(w / 2 - frame, -h / 2, frame, h, 2);
  board(-w / 2, -h / 2, w, frame, 3);
  board(-w / 2, h / 2 - frame, w, frame, 4);
  // Nails where the slats cross, and in the frame corners.
  const nail = (x: number, y: number): void => {
    g.circle(x, y, 3.6).fill(0x8e9bb0).stroke(stroke(2));
    g.circle(x - 1, y - 1, 1.1).fill({ color: 0xffffff, alpha: 0.8 });
  };
  for (let a = -6; a <= 6; a++)
    for (let b = -6; b <= 6; b++) {
      // Crossing of slat centerlines: x + y = (a + 1/2) g sqrt2, x - y = b g sqrt2.
      const s1 = (a * gap + gap / 2) * Math.SQRT2;
      const s2 = b * gap * Math.SQRT2;
      const x = (s1 + s2) / 2;
      const y = (s1 - s2) / 2;
      if (Math.abs(x) < w / 2 - frame - 4 && Math.abs(y) < h / 2 - frame - 4) nail(x, y);
    }
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    nail(x * (w / 2 - frame / 2), y * (h / 2 - frame / 2));
  // A cobweb in the top-left gap.
  const cx = -w / 2 + frame;
  const cy = -h / 2 + frame;
  const web = { width: 1.6, color: 0xffffff, alpha: 0.7, cap: 'round' as const };
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    g.moveTo(cx, cy)
      .lineTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62)
      .stroke(web);
  }
  for (const rr of [20, 36, 52]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    path(g, pts).stroke(web);
  }
  // Soft mounds of moss in the bottom corners, and a few knots in the slats.
  for (const [bx, dir, size] of [
    [-w / 2, 1, 1],
    [w / 2, -1, 0.65],
  ] as const) {
    const bumps: [number, number, number][] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      bumps.push([
        bx + dir * (4 + t * 80 * size),
        h / 2 - 6 - Math.sin(t * Math.PI) * 26 * size + hash01(seedN, i + 90) * 4,
        (7 + hash01(seedN, i + 110) * 5) * (0.75 + Math.sin(t * Math.PI) * 0.5),
      ]);
    }
    for (const [x, y, r] of bumps) g.circle(x, y, r + 2).fill(OUTLINE);
    g.rect(Math.min(bx, bx + dir * 84 * size), h / 2 - 12, 84 * size, 10).fill(OUTLINE);
    for (const [x, y, r] of bumps) g.circle(x, y, r).fill(LEAF_GREEN);
    g.rect(Math.min(bx, bx + dir * 82 * size) + 2, h / 2 - 10, 80 * size, 7).fill(LEAF_GREEN);
    for (const [x, y, r] of bumps)
      g.circle(x - r * 0.25, y - r * 0.35, r * 0.3).fill(lighten(LEAF_GREEN, 0.4));
    for (let i = 0; i < 5; i++)
      g.circle(
        bx + dir * (10 + hash01(seedN, i + 130) * 60 * size),
        h / 2 - 8 - hash01(seedN, i + 140) * 14 * size,
        1.4,
      ).fill(darken(LEAF_GREEN, 0.3));
  }
  for (let i = 0; i < 6; i++) {
    const x = (hash01(seedN, i + 150) - 0.5) * (w - frame * 3);
    const y = (hash01(seedN, i + 160) - 0.5) * (h - frame * 3);
    if (!g.containsPoint({ x, y })) continue;
    g.ellipse(x, y, 4.5, 2.6).fill(darken(def.color, 0.35));
    g.ellipse(x, y, 7.5, 4.5).stroke({ width: 1.4, color: darken(def.color, 0.3), alpha: 0.7 });
  }
}

function paperclip(g: Graphics, def: ItemDef, w: number): void {
  const hw = w / 2;
  const R = 7;
  const r = 3.5;
  const pts: Pt[] = [];
  const arc = (cx: number, cy: number, rad: number, a0: number, a1: number): void => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  };
  // Inner leg, small loop on the right, bottom leg, big loop on the left, top leg.
  pts.push([-hw * 0.3, 0]);
  arc(hw - R - r - 2, r, r, -Math.PI / 2, Math.PI / 2);
  arc(-hw + R, 0, R, Math.PI / 2, (Math.PI * 3) / 2);
  pts.push([hw - R, -R]);
  arc(hw - R, -R + R * 0.9, R * 0.9, -Math.PI / 2, 0);
  wire(g, pts, 3.2, def.color, 2);
  path(g, [
    [-hw + R, -R + 0.8],
    [hw - R - 2, -R + 0.8],
  ]).stroke({ width: 1.2, color: 0xffffff, alpha: 0.85, cap: 'round' });
}

function rubberBand(g: Graphics, def: ItemDef, w: number, h: number): void {
  const rx = w / 2 - 4;
  const ry = h / 2 + 1.5;
  g.ellipse(0, 0, rx, ry).stroke({ width: 10, color: OUTLINE });
  g.ellipse(0, 0, rx, ry).stroke({ width: 4.5, color: def.color });
  // A shiny top edge.
  g.moveTo(-rx * 0.6, -ry)
    .lineTo(w * 0.05, -ry)
    .stroke({ width: 1.6, color: 0xffffff, alpha: 0.7, cap: 'round' });
}

function popsicleStick(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.roundRect(-w / 2, -h / 2, w, h, h / 2)
    .fill(def.color)
    .stroke(stroke(4));
  // A grape stain on the end that was in the popsicle.
  g.roundRect(w / 2 - w * 0.3, -h / 2 + 2, w * 0.3 - 2, h - 4, (h - 4) / 2).fill({
    color: 0xb05fd6,
    alpha: 0.45,
  });
  for (const [y, x0, x1] of [
    [-0.12, -0.42, -0.1],
    [0.18, -0.2, 0.15],
    [-0.05, 0.02, 0.3],
  ] as const)
    g.moveTo(w * x0, h * y)
      .lineTo(w * x1, h * y)
      .stroke({ width: 1.5, color: def.accent, alpha: 0.8, cap: 'round' });
  g.moveTo(-w * 0.45, -h * 0.3)
    .lineTo(-w * 0.15, -h * 0.3)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.7, cap: 'round' });
}

function spool(g: Graphics, def: ItemDef, w: number, h: number): void {
  const fh = 9;
  const cw = w * 0.72;
  // The thread wound on the core.
  g.rect(-cw / 2, -h / 2 + fh - 2, cw, h - fh * 2 + 4)
    .fill(def.accent)
    .stroke(stroke(4));
  for (let y = -h / 2 + fh + 2; y < h / 2 - fh - 1; y += 3.5)
    g.moveTo(-cw / 2 + 2, y)
      .lineTo(cw / 2 - 2, y + 1)
      .stroke({ width: 1.3, color: darken(def.accent, 0.3), alpha: 0.55 });
  g.moveTo(-cw / 2 + 5, -h / 2 + fh + 1)
    .lineTo(-cw / 2 + 5, h / 2 - fh - 1)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.4 });
  // A loose end of thread.
  g.moveTo(cw / 2 - 2, h * 0.08)
    .bezierCurveTo(cw / 2 + 8, h * 0.05, w / 2 + 2, h * 0.22, w / 2 - 2, h * 0.34)
    .stroke({ width: 5.5, color: OUTLINE, cap: 'round' });
  g.moveTo(cw / 2 - 2, h * 0.08)
    .bezierCurveTo(cw / 2 + 8, h * 0.05, w / 2 + 2, h * 0.22, w / 2 - 2, h * 0.34)
    .stroke({ width: 2, color: def.accent, cap: 'round' });
  // The two wooden flanges.
  for (const y of [-h / 2, h / 2 - fh]) {
    g.roundRect(-w / 2, y, w, fh, 4)
      .fill(def.color)
      .stroke(stroke(4));
    g.moveTo(-w / 2 + 5, y + 2.8)
      .lineTo(w * 0.1, y + 2.8)
      .stroke({ width: 1.8, color: lighten(def.color, 0.5), alpha: 0.9, cap: 'round' });
    g.circle(w * 0.3, y + fh / 2, 1.5).fill(darken(def.color, 0.3));
  }
}

function button(g: Graphics, def: ItemDef, r: number): void {
  g.circle(0, 0, r).fill(def.color).stroke(stroke(4));
  g.circle(0, 0, r * 0.7).stroke({ width: 2.2, color: darken(def.color, 0.25) });
  const d = r * 0.26;
  for (const [x, y] of [
    [-d, -d],
    [d, -d],
    [-d, d],
    [d, d],
  ] as const)
    g.circle(x, y, r * 0.13).fill(OUTLINE);
  // White thread stitched through in a cross.
  for (const [a, b] of [
    [-1, 1],
    [1, 1],
  ] as const)
    g.moveTo(-d * a, -d * b)
      .lineTo(d * a, d * b)
      .stroke({ width: 2, color: def.accent, cap: 'round' });
  g.moveTo(-r * 0.75, -r * 0.2)
    .arc(0, 0, r * 0.75, Math.PI * 1.08, Math.PI * 1.4)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.8, cap: 'round' });
}

function matchbox(g: Graphics, def: ItemDef, w: number, h: number): void {
  const out = w * 0.2;
  const sleeve = w - out;
  // The tray, pulled out on the right, with match heads peeking over its edge.
  for (let i = 0; i < 3; i++) {
    const x = w / 2 - out * 0.75 + i * 5.5;
    g.moveTo(x, -h / 2 + 8)
      .lineTo(x, -h / 2 + 2)
      .stroke({ width: 5, color: OUTLINE, cap: 'round' });
    g.moveTo(x, -h / 2 + 8)
      .lineTo(x, -h / 2 + 2)
      .stroke({ width: 2, color: 0xf0d4a0, cap: 'round' });
    g.circle(x, -h / 2 + 1, 3.2)
      .fill(i === 1 ? 0x4dc3ff : 0xe8453c)
      .stroke(stroke(2));
  }
  g.roundRect(w / 2 - out - 6, -h / 2 + 4, out + 6, h - 5, 3)
    .fill(0xf2dfb8)
    .stroke(stroke(4));
  g.moveTo(w / 2 - out, -h / 2 + 8)
    .lineTo(w / 2 - 4, -h / 2 + 8)
    .stroke({ width: 2, color: darken(0xf2dfb8, 0.2) });
  // The sleeve: red, with a yellow band, a flame, and a rough striker strip.
  g.roundRect(-w / 2, -h / 2, sleeve, h, 4)
    .fill(def.color)
    .stroke(stroke(4.5));
  g.rect(-w / 2 + 2.5, -h * 0.2, sleeve - 5, h * 0.36).fill(def.accent);
  const fx = -w / 2 + sleeve * 0.5;
  g.moveTo(fx, -h * 0.17)
    .quadraticCurveTo(fx + 5, -h * 0.02, fx + 3, h * 0.1)
    .quadraticCurveTo(fx, h * 0.16, fx - 3, h * 0.1)
    .quadraticCurveTo(fx - 5, -h * 0.02, fx, -h * 0.17)
    .fill(0xff7a2e);
  g.circle(fx, h * 0.07, 2).fill(0xffe08a);
  g.rect(-w / 2 + 2.5, h / 2 - 7, sleeve - 5, 4).fill(WOOD_DARK);
  for (let i = 0; i < 8; i++) g.circle(-w / 2 + 6 + (i * (sleeve - 12)) / 7, h / 2 - 5, 0.9).fill(0xc9a27a);
  g.moveTo(-w / 2 + 5, -h / 2 + 3.5)
    .lineTo(-w / 2 + sleeve * 0.55, -h / 2 + 3.5)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.6, cap: 'round' });
}

function straw(g: Graphics, def: ItemDef, w: number, h: number): void {
  const x1 = w / 2 - 34;
  const bendLen = 26;
  const bend = -0.5;
  const px = x1 + 12;
  // The bent tip: a short tube turned up from the ridges.
  const c = Math.cos(bend);
  const s = Math.sin(bend);
  const tip = rotRect(px + (c * bendLen) / 2, (s * bendLen) / 2, bendLen, h, bend);
  g.poly(tip).fill(def.accent).stroke(stroke(4));
  for (const t of [0.35, 0.8]) {
    const cx = px + c * bendLen * t;
    const cy = s * bendLen * t;
    g.poly(rotRect(cx, cy, 5, h - 4, bend + 0.35)).fill(def.color);
  }
  // The long tube, striped.
  g.roundRect(-w / 2, -h / 2, x1 + w / 2 + 2, h, 3)
    .fill(def.accent)
    .stroke(stroke(4));
  for (let x = -w / 2 + 6; x < x1 - 4; x += 13)
    g.poly([x, -h / 2 + 2, x + 6, -h / 2 + 2, x + 2, h / 2 - 2, x - 4, h / 2 - 2]).fill(def.color);
  g.rect(-w / 2 + 2, h / 2 - 5, x1 + w / 2, 3).fill({ color: OUTLINE, alpha: 0.12 });
  g.moveTo(-w / 2 + 5, -h / 2 + 3)
    .lineTo(x1 - 6, -h / 2 + 3)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.8, cap: 'round' });
  // The bendy ridges.
  g.roundRect(x1 - 1, -h / 2 - 1.5, 14, h + 3, 3)
    .fill(lighten(def.color, 0.55))
    .stroke(stroke(3.5));
  for (const x of [x1 + 3.5, x1 + 8])
    g.moveTo(x, -h / 2)
      .lineTo(x, h / 2)
      .stroke({ width: 1.8, color: def.color });
}

function toothpick(g: Graphics, def: ItemDef, w: number, h: number): void {
  const t = 11;
  g.poly([-w / 2, 0, -w / 2 + t, -h / 2, w / 2 - t, -h / 2, w / 2, 0, w / 2 - t, h / 2, -w / 2 + t, h / 2])
    .fill(def.color)
    .stroke(stroke(3.5));
  g.moveTo(-w * 0.3, h * 0.08)
    .lineTo(w * 0.25, h * 0.08)
    .stroke({ width: 1.2, color: def.accent, cap: 'round' });
}

function foilBall(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  const pts = lumps(r * 1.02, 13, seedN, 0.22);
  g.poly(pts).fill(def.color);
  // Crinkled facets fanning out from an off-center dent.
  const c: Pt = [-r * 0.12, -r * 0.1];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const t = hash01(seedN, i + 20);
    g.poly([c[0], c[1], pts[i * 2]!, pts[i * 2 + 1]!, pts[j * 2]!, pts[j * 2 + 1]!]).fill({
      color: t > 0.5 ? lighten(def.color, 0.6) : darken(def.color, 0.2),
      alpha: 0.25 + (t % 0.5),
    });
  }
  for (let i = 0; i < n; i += 3)
    g.moveTo(c[0], c[1])
      .lineTo(pts[i * 2]! * 0.85, pts[i * 2 + 1]! * 0.85)
      .stroke({ width: 1.4, color: 0xffffff, alpha: 0.8, cap: 'round' });
  g.poly(pts).stroke(stroke(4));
  twinkle(g, r * 0.35, -r * 0.42, r * 0.34);
}

function tissue(g: Graphics, def: ItemDef, w: number, h: number): void {
  tissuePath(g, w, h).fill(def.color).stroke(stroke(4));
  g.ellipse(0, h * 0.34, w * 0.4, h * 0.14).fill({ color: def.accent, alpha: 0.7 });
  for (const [x0, y0, x1, y1] of [
    [-0.12, -0.45, -0.18, 0.2],
    [0.14, -0.5, 0.1, 0.1],
    [-0.36, -0.3, -0.3, 0.3],
    [0.38, -0.28, 0.3, 0.25],
  ] as const)
    g.moveTo(w * x0, h * y0)
      .quadraticCurveTo(w * (x0 + x1) * 0.5 + 3, h * (y0 + y1) * 0.5, w * x1, h * y1)
      .stroke({ width: 2, color: darken(def.accent, 0.1), cap: 'round' });
  // A little embossed flower in the corner.
  g.circle(w * 0.26, -h * 0.1, 2.2).fill({ color: def.accent, alpha: 0.9 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.circle(w * 0.26 + Math.cos(a) * 3.6, -h * 0.1 + Math.sin(a) * 3.6, 1.6).fill({
      color: def.accent,
      alpha: 0.9,
    });
  }
}

function paperScrap(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const hh = h * 0.95;
  const pts: number[] = [-w / 2, -hh, w / 2 - 6, -hh];
  for (let i = 1; i < 6; i++)
    pts.push(w / 2 - 6 + (i % 2 === 0 ? -3 : 4) + hash01(seedN, i) * 2, -hh + (i / 6) * hh * 2);
  pts.push(w / 2 - 4, hh, -w / 2, hh);
  g.poly(pts).fill(def.color).stroke(stroke(3.5));
  // Ruled lines, a margin, and a pencil scribble.
  g.moveTo(-w / 2 + 2, -hh * 0.2)
    .lineTo(w / 2 - 8, -hh * 0.2)
    .stroke({ width: 1.3, color: def.accent });
  g.moveTo(-w / 2 + 2, hh * 0.5)
    .lineTo(w / 2 - 8, hh * 0.5)
    .stroke({ width: 1.3, color: def.accent });
  g.moveTo(-w / 2 + 8, -hh + 1)
    .lineTo(-w / 2 + 8, hh - 1)
    .stroke({ width: 1.3, color: 0xff8fa3 });
  const sc: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    sc.push([-w * 0.28 + t * w * 0.5 + Math.cos(t * 18) * 2.5, Math.sin(t * 18) * hh * 0.45]);
  }
  path(g, sc).stroke({ width: 1.4, color: 0x5a5a6e, cap: 'round', join: 'round' });
}

function eggshell(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  // The inside of the cup shows behind the jagged front rim.
  g.ellipse(0, -h * 0.3, w / 2 - 2, 8)
    .fill(darken(def.accent, 0.1))
    .stroke(stroke(3.5));
  g.ellipse(0, -h * 0.34, w / 2 - 9, 4).fill(darken(def.accent, 0.22));
  eggPath(g, w, h).fill(def.color).stroke(stroke(4));
  for (let i = 0; i < 6; i++) {
    const x = (hash01(seedN, i) - 0.5) * w * 0.7;
    const y = h * 0.02 + hash01(seedN, i + 10) * h * 0.35;
    g.circle(x, y, 1.2 + hash01(seedN, i + 20) * 1.1).fill({ color: 0xc9a27a, alpha: 0.7 });
  }
  g.moveTo(-w * 0.36, -h * 0.05)
    .quadraticCurveTo(-w * 0.34, h * 0.25, -w * 0.15, h * 0.36)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.9, cap: 'round' });
  // A crack running down from the rim.
  path(g, [
    [w * 0.18, -h * 0.25],
    [w * 0.22, -h * 0.08],
    [w * 0.16, h * 0.02],
    [w * 0.2, h * 0.14],
  ]).stroke({ width: 1.5, color: darken(def.accent, 0.3), cap: 'round', join: 'round' });
}

function battery(g: Graphics, def: ItemDef, w: number, h: number): void {
  const nub = 6;
  const bw = w - nub;
  const band = bw * 0.34;
  g.roundRect(w / 2 - nub - 2, -h * 0.22, nub + 2, h * 0.44, 2)
    .fill(METAL)
    .stroke(stroke(3.5));
  g.roundRect(-w / 2, -h / 2, bw, h, 6).fill(def.color);
  g.roundRect(-w / 2 + bw - band, -h / 2, band, h, 6).fill(def.accent);
  g.rect(-w / 2 + bw - band, -h / 2, 6, h).fill(def.accent);
  g.roundRect(-w / 2, -h / 2, bw, h, 6).stroke(stroke(4.5));
  // + on the yellow end, - on the other, and a little bolt in the middle.
  const px = -w / 2 + bw - band / 2;
  g.moveTo(px - 4, 0)
    .lineTo(px + 4, 0)
    .moveTo(px, -4)
    .lineTo(px, 4)
    .stroke({ width: 2.6, color: OUTLINE, cap: 'round' });
  g.moveTo(-w / 2 + 6, 0)
    .lineTo(-w / 2 + 11, 0)
    .stroke({ width: 2.4, color: 0xffffff, cap: 'round' });
  const bx = -w * 0.06;
  g.poly([
    bx + 2,
    -h * 0.34,
    bx - 4,
    h * 0.04,
    bx,
    h * 0.04,
    bx - 2,
    h * 0.34,
    bx + 4,
    -h * 0.06,
    bx,
    -h * 0.06,
  ]).fill(def.accent);
  g.roundRect(-w / 2 + 5, -h / 2 + 3, bw - band - 6, 3, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
  // Sparks jumping off the terminal.
  for (const [a, len] of [
    [-0.6, 7],
    [0.1, 8],
    [0.7, 6],
  ] as const) {
    const x0 = w / 2 + 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.moveTo(x0 + c * 2, s * 2)
      .lineTo(x0 + c * len * 0.6 - s * 2, s * len * 0.6 + c * 2)
      .lineTo(x0 + c * len, s * len)
      .stroke({ width: 1.8, color: 0xffd23f, cap: 'round', join: 'round' });
  }
}

function tinCan(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.roundRect(-w / 2, -h / 2, w, h, 5)
    .fill(def.color)
    .stroke(stroke(4.5));
  // Ribs on the bare metal, then the label.
  for (const y of [-h * 0.34, h * 0.34])
    g.moveTo(-w / 2 + 3, y)
      .lineTo(w / 2 - 3, y)
      .stroke({ width: 1.6, color: darken(def.color, 0.25) });
  g.rect(-w / 2 + 2, -h * 0.26, w - 4, h * 0.52).fill(def.accent);
  for (const y of [-h * 0.2, h * 0.2])
    g.moveTo(-w / 2 + 2, y)
      .lineTo(w / 2 - 2, y)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
  // A cheerful little fish on the label.
  g.ellipse(-2, 0, 8, 5).fill(0xffffff);
  g.poly([5, 0, 11, -5, 11, 5]).fill(0xffffff);
  g.circle(-6, -1, 1.2).fill(OUTLINE);
  // Rims top and bottom.
  for (const y of [-h / 2 - 1, h / 2 - 6])
    g.roundRect(-w / 2 - 1.5, y, w + 3, 7, 3)
      .fill(lighten(def.color, 0.3))
      .stroke(stroke(3.5));
  g.rect(-w * 0.32, -h / 2 + 7, 4, h - 14).fill({ color: 0xffffff, alpha: 0.4 });
  g.rect(w * 0.3, -h / 2 + 7, 2.5, h - 14).fill({ color: OUTLINE, alpha: 0.12 });
}

// --- The compost lab -------------------------------------------------------

function cheesePuff(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const balls = puffBalls(w, h);
  for (const [x, y, r] of balls) g.circle(x, y, r + 2.2).fill(OUTLINE);
  for (const [x, y, r] of balls) g.circle(x, y, r).fill(def.color);
  for (const [x, y, r] of balls)
    g.circle(x - r * 0.2, y - r * 0.3, r * 0.45).fill({ color: def.accent, alpha: 0.55 });
  for (let i = 0; i < 12; i++) {
    const x = (hash01(seedN, i) - 0.5) * w * 0.8;
    const y = (hash01(seedN, i + 30) - 0.5) * h * 0.6;
    g.circle(x, y, 0.9 + hash01(seedN, i + 60) * 1).fill(i % 3 === 0 ? 0xffffff : darken(def.color, 0.2));
  }
  g.circle(balls[1]![0] - 2, balls[1]![1] - h * 0.22, 2).fill({ color: 0xffffff, alpha: 0.85 });
}

function cookieCrumb(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  // A broken chunk: a round baked edge, snapped along the left side.
  const pts: number[] = [];
  const a0 = -Math.PI * 0.72;
  const a1 = Math.PI * 0.62;
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10;
    const k = 1 + (hash01(seedN, i) - 0.5) * 0.06;
    pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  const ex = Math.cos(a1) * r;
  const ey = Math.sin(a1) * r;
  const sx = Math.cos(a0) * r;
  const sy = Math.sin(a0) * r;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const zig = (i % 2 === 0 ? 1 : -1) * r * 0.12 - r * 0.2;
    pts.push(ex + (sx - ex) * t + zig, ey + (sy - ey) * t);
  }
  g.poly(pts).fill(def.color).stroke(stroke(4.5));
  g.circle(r * 0.08, 0, r * 0.62).fill({ color: lighten(def.color, 0.18), alpha: 0.7 });
  for (const [x, y, s] of [
    [0.35, -0.3, 0.22],
    [-0.1, 0.35, 0.2],
    [0.45, 0.35, 0.16],
    [-0.2, -0.35, 0.15],
  ] as const) {
    g.poly(
      lumps(r * s, 6, seedN + Math.round(x * 10), 0.4).map((v, i) => v + (i % 2 === 0 ? r * x : r * y)),
    ).fill(def.accent);
    g.circle(r * x - r * s * 0.3, r * y - r * s * 0.3, r * s * 0.3).fill({ color: 0xffffff, alpha: 0.35 });
  }
  for (let i = 0; i < 5; i++)
    g.circle((hash01(seedN, i + 40) - 0.4) * r, (hash01(seedN, i + 50) - 0.5) * r * 1.2, 1).fill(
      darken(def.color, 0.3),
    );
}

function coin(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  g.circle(0, 0, r).fill(def.color).stroke(stroke(4));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.circle(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84, 0.9).fill(darken(def.color, 0.3));
  }
  g.circle(0, 0, r * 0.7).stroke({ width: 1.8, color: darken(def.color, 0.28) });
  // A worn old face in profile, looking left.
  const face = darken(def.color, 0.2);
  g.moveTo(r * 0.3, r * 0.45)
    .lineTo(r * 0.28, r * 0.12)
    .bezierCurveTo(r * 0.42, -r * 0.2, r * 0.2, -r * 0.5, -r * 0.05, -r * 0.45)
    .bezierCurveTo(-r * 0.25, -r * 0.4, -r * 0.3, -r * 0.2, -r * 0.28, -r * 0.08)
    .lineTo(-r * 0.38, -r * 0.02)
    .lineTo(-r * 0.26, r * 0.06)
    .quadraticCurveTo(-r * 0.25, r * 0.22, -r * 0.05, r * 0.2)
    .lineTo(-r * 0.05, r * 0.45)
    .closePath()
    .fill({ color: face, alpha: 0.75 });
  g.circle((hash01(seedN, 3) - 0.5) * r, r * 0.2, r * 0.22).fill({
    color: lighten(def.color, 0.3),
    alpha: 0.35,
  });
  g.moveTo(-r * 0.62, -r * 0.3)
    .arc(0, 0, r * 0.68, Math.PI * 1.1, Math.PI * 1.35)
    .stroke({ width: 2, color: def.accent, alpha: 0.95, cap: 'round' });
  twinkle(g, r * 0.5, -r * 0.55, r * 0.35);
}

function appleCore(g: Graphics, def: ItemDef, w: number, h: number): void {
  // Stem and leaf behind the top.
  wire(
    g,
    [
      [0, -h * 0.36],
      [w * 0.1, -h * 0.56],
    ],
    3,
    WOOD_DARK,
    2,
  );
  g.poly(leafPoly(w * 0.07, -h * 0.5, w * 0.38, 8, -0.35))
    .fill(LEAF_GREEN)
    .stroke(stroke(2.5));
  coreOutline(g, w, h).fill(def.color);
  // Red skin on the top and bottom caps.
  g.moveTo(-w * 0.45, -h * 0.2)
    .bezierCurveTo(-w * 0.55, -h * 0.5, w * 0.55, -h * 0.5, w * 0.45, -h * 0.2)
    .quadraticCurveTo(w * 0.1, -h * 0.25, 0, -h * 0.18)
    .quadraticCurveTo(-w * 0.1, -h * 0.25, -w * 0.45, -h * 0.2)
    .fill(def.accent);
  g.moveTo(-w * 0.45, h * 0.22)
    .bezierCurveTo(-w * 0.55, h * 0.52, w * 0.55, h * 0.52, w * 0.45, h * 0.22)
    .quadraticCurveTo(0, h * 0.3, -w * 0.45, h * 0.22)
    .fill(def.accent);
  coreOutline(g, w, h).stroke(stroke(4.5));
  // Seeds in the middle.
  for (const [x, y, a] of [
    [-0.08, -0.04, 0.3],
    [0.08, 0.04, -0.3],
  ] as const) {
    const cx = w * x;
    const cy = h * y;
    g.poly(leafPoly(cx - Math.sin(a) * 4, cy - Math.cos(a) * 4, 9, 5, Math.PI / 2 - a)).fill(0x5a3b2b);
  }
  g.ellipse(-w * 0.18, -h * 0.34, w * 0.1, h * 0.04).fill({ color: 0xffffff, alpha: 0.6 });
}

function dungBall(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  const pts = lumps(r, 18, seedN, 0.14);
  g.poly(pts).fill(def.color).stroke(stroke(5));
  for (let i = 0; i < 7; i++) {
    const a = hash01(seedN, i + 10) * Math.PI * 2;
    const d = hash01(seedN, i + 20) * r * 0.6;
    g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.16, r * 0.11).fill({ color: def.accent, alpha: 0.7 });
  }
  g.ellipse(-r * 0.3, -r * 0.42, r * 0.3, r * 0.14).fill({ color: lighten(def.color, 0.35), alpha: 0.85 });
  // Bits of straw rolled into it.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + hash01(seedN, i + 30);
    const d = r * (0.3 + hash01(seedN, i + 40) * 0.55);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const t = a + 1.2 + hash01(seedN, i + 50);
    const len = r * 0.24;
    wire(
      g,
      [
        [x - Math.cos(t) * len, y - Math.sin(t) * len],
        [x + Math.cos(t) * len, y + Math.sin(t) * len],
      ],
      2.2,
      0xf2cf6b,
      1.3,
    );
  }
  // Barty keeps it polished.
  twinkle(g, r * 0.5, -r * 0.55, r * 0.26);
}

function jar(g: Graphics, def: ItemDef, w: number, h: number): void {
  jarPath(g, w, h).fill({ color: def.color, alpha: 0.35 });
  g.roundRect(-w / 2 + 5, h / 2 - 10, w - 10, 6, 3).fill({ color: lighten(def.color, 0.4), alpha: 0.6 });
  jarPath(g, w, h).stroke(stroke(4.5));
  g.moveTo(-w * 0.3, -h * 0.1)
    .lineTo(-w * 0.3, h * 0.32)
    .stroke({ width: 5, color: 0xffffff, alpha: 0.75, cap: 'round' });
  g.moveTo(-w * 0.18, -h * 0.05)
    .lineTo(-w * 0.18, h * 0.08)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.6, cap: 'round' });
  g.moveTo(w * 0.34, h * 0.05)
    .lineTo(w * 0.34, h * 0.36)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.5, cap: 'round' });
  // The screw lid.
  g.roundRect(-w * 0.43, -h / 2, w * 0.86, h * 0.2, 4)
    .fill(def.accent)
    .stroke(stroke(4));
  for (let i = 1; i < 7; i++) {
    const x = -w * 0.43 + (i / 7) * w * 0.86;
    g.moveTo(x, -h / 2 + 3)
      .lineTo(x, -h / 2 + h * 0.2 - 3)
      .stroke({ width: 1.5, color: darken(def.accent, 0.3), alpha: 0.8 });
  }
  g.moveTo(-w * 0.36, -h / 2 + 3.5)
    .lineTo(w * 0.1, -h / 2 + 3.5)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.6, cap: 'round' });
}

function mushroomCap(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const gill = 0xfff1dc;
  g.roundRect(-w * 0.1, h * 0.12, w * 0.2, h * 0.38, 4)
    .fill(gill)
    .stroke(stroke(3.5));
  g.ellipse(0, h * 0.24, w * 0.42, h * 0.16)
    .fill(gill)
    .stroke(stroke(3.5));
  for (let i = -3; i <= 3; i++)
    g.moveTo(i * w * 0.05, h * 0.2)
      .lineTo(i * w * 0.1, h * 0.32)
      .stroke({ width: 1.3, color: darken(gill, 0.25) });
  capPath(g, w, h).fill(def.color).stroke(stroke(4.5));
  for (const [x, y, r] of [
    [-0.25, -0.1, 0.1],
    [0.08, -0.32, 0.09],
    [0.3, -0.05, 0.08],
    [-0.02, 0.02, 0.06],
    [-0.36, 0.08, 0.05],
  ] as const)
    g.ellipse(w * x, h * y, w * r * (0.9 + hash01(seedN, Math.round(x * 100)) * 0.2), w * r * 0.85).fill(
      def.accent,
    );
  g.moveTo(-w * 0.34, -h * 0.2)
    .quadraticCurveTo(-w * 0.2, -h * 0.42, 0, -h * 0.44)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.6, cap: 'round' });
}

function iceCube(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.roundRect(-w / 2, -h / 2, w, h, 6).fill({ color: def.color, alpha: 0.82 });
  g.poly([
    -w / 2 + 3,
    -h / 2 + 3,
    w / 2 - 3,
    -h / 2 + 3,
    w / 2 - 9,
    -h / 2 + 10,
    -w / 2 + 9,
    -h / 2 + 10,
  ]).fill({
    color: 0xffffff,
    alpha: 0.5,
  });
  g.poly([w / 2 - 3, -h / 2 + 3, w / 2 - 3, h / 2 - 3, w / 2 - 9, h / 2 - 9, w / 2 - 9, -h / 2 + 10]).fill({
    color: 0x6fb8e0,
    alpha: 0.35,
  });
  g.roundRect(-w / 2, -h / 2, w, h, 6).stroke(stroke(4));
  g.moveTo(-w / 2 + 7, -h / 2 + 14)
    .lineTo(-w / 2 + 7, h / 2 - 8)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.85, cap: 'round' });
  g.circle(w * 0.1, h * 0.12, 2.8).stroke({ width: 1.2, color: 0xffffff, alpha: 0.8 });
  g.circle(-w * 0.05, h * 0.28, 1.6).stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
  twinkle(g, w * 0.2, -h * 0.18, 5);
}

function coffeeBean(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.ellipse(0, 0, w / 2, h / 2)
    .fill(def.color)
    .stroke(stroke(4));
  g.moveTo(-w * 0.36, h * 0.08)
    .bezierCurveTo(-w * 0.12, -h * 0.32, w * 0.12, h * 0.32, w * 0.36, -h * 0.08)
    .stroke({ width: 2.8, color: def.accent, cap: 'round' });
  g.ellipse(-w * 0.16, -h * 0.26, w * 0.14, h * 0.08).fill({ color: 0xffffff, alpha: 0.4 });
}

function onionRing(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const ry = h / 2 + 2;
  const outer: number[] = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (hash01(seedN, i) - 0.5) * 0.1;
    outer.push(Math.cos(a) * (w / 2) * k, Math.sin(a) * ry * k);
  }
  const hx = w * 0.27;
  const hy = h * 0.16;
  g.poly(outer).fill(def.color).ellipse(0, -1, hx, hy).cut();
  g.poly(outer).stroke(stroke(4));
  g.ellipse(0, -1, hx + 2.5, hy + 2).stroke({ width: 3, color: def.accent });
  g.ellipse(0, -1, hx, hy).stroke(stroke(3));
  for (let i = 0; i < 12; i++) {
    const a = hash01(seedN, i + 40) * Math.PI * 2;
    const d = 0.72 + hash01(seedN, i + 60) * 0.18;
    g.circle(Math.cos(a) * (w / 2) * d, Math.sin(a) * ry * d, 1.1).fill(
      i % 2 ? darken(def.color, 0.25) : lighten(def.color, 0.5),
    );
  }
  g.moveTo(-w * 0.34, -ry * 0.62)
    .quadraticCurveTo(-w * 0.1, -ry * 0.95, w * 0.12, -ry * 0.8)
    .stroke({ width: 2.2, color: 0xffffff, alpha: 0.6, cap: 'round' });
}

function fizzCandy(g: Graphics, def: ItemDef, w: number, h: number): void {
  const bw = w * 0.3;
  // Twisted wrapper ends, then the candy in the middle.
  for (const sx of [-1, 1]) {
    g.poly([sx * bw * 0.8, 0, (sx * w) / 2, -h / 2, sx * (w / 2 - 3), 0, (sx * w) / 2, h / 2])
      .fill(def.accent)
      .stroke(stroke(3));
    g.moveTo(sx * bw * 0.9, 0)
      .lineTo(sx * (w / 2 - 2), -h * 0.2)
      .stroke({ width: 1.2, color: lighten(def.accent, 0.5) });
  }
  g.ellipse(0, 0, bw, h * 0.44)
    .fill(def.color)
    .stroke(stroke(3.5));
  for (const x of [-bw * 0.45, bw * 0.15])
    g.moveTo(x, -h * 0.4)
      .lineTo(x + bw * 0.3, h * 0.4)
      .stroke({ width: 2.5, color: def.accent, alpha: 0.9, cap: 'round' });
  g.ellipse(-bw * 0.4, -h * 0.2, bw * 0.25, h * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
  // Fizz: tiny dots on the candy and sparkles popping off it.
  for (const [x, y] of [
    [0.3, -0.1],
    [-0.1, 0.22],
    [0.55, 0.2],
  ] as const)
    g.circle(bw * x, h * y, 1.1).fill(0xffffff);
  twinkle(g, bw * 0.4, -h * 0.72, 3.5);
  twinkle(g, -bw * 0.5, -h * 0.8, 2.5);
  g.circle(bw * 0.9, -h * 0.62, 1.4).fill({ color: def.color, alpha: 0.9 });
}

function compostGoo(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  const pts = gooPoints(r, seedN);
  g.poly(pts).fill(def.color).stroke(stroke(4.5));
  for (let i = 0; i < 4; i++) {
    const x = (hash01(seedN, i + 5) - 0.5) * r * 1.3;
    const y = r * 0.1 + hash01(seedN, i + 15) * r * 0.5;
    g.ellipse(x, y, r * 0.2, r * 0.1).fill({ color: def.accent, alpha: 0.6 });
  }
  // A leaf scrap stuck in the goo.
  g.poly(leafPoly(r * 0.35, r * 0.3, r * 0.5, 5, -0.5))
    .fill(0xb58a3c)
    .stroke(stroke(2));
  // Bubbles, one still rising off it.
  for (const [x, y, s] of [
    [-0.35, -0.2, 0.2],
    [0.2, -0.45, 0.13],
    [0.45, 0.02, 0.1],
  ] as const) {
    g.circle(r * x, r * y, r * s)
      .fill(lighten(def.color, 0.35))
      .stroke({ width: 2, color: darken(def.color, 0.3) });
    g.circle(r * x - r * s * 0.35, r * y - r * s * 0.35, r * s * 0.3).fill(0xffffff);
  }
  g.circle(r * 0.1, -r * 1.2, r * 0.13).stroke({ width: 1.8, color: lighten(def.color, 0.2), alpha: 0.9 });
  g.ellipse(-r * 0.55, -r * 0.5, r * 0.18, r * 0.08).fill({ color: 0xffffff, alpha: 0.7 });
}

// --- The treehouse ---------------------------------------------------------

/** A marble-run piece drawn from its physics parts, so marbles roll on what you see. */
function track(g: Graphics, def: ItemDef): void {
  const parts = partsPx(def);
  const polys = parts.map((p) => rotRect(p.x, p.y, p.width, p.height, p.angle));
  // Joints where neighbouring parts meet, so a curve reads as one piece.
  const joints: [number, number, number][] = [];
  if (def.art === 'track_curve')
    for (let i = 0; i + 1 < parts.length; i++) {
      const a = parts[i]!;
      const b = parts[i + 1]!;
      const ea: Pt = [a.x + (Math.cos(a.angle) * a.width) / 2, a.y + (Math.sin(a.angle) * a.width) / 2];
      const eb: Pt = [b.x - (Math.cos(b.angle) * b.width) / 2, b.y - (Math.sin(b.angle) * b.width) / 2];
      joints.push([(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2, Math.min(a.height, b.height) / 2]);
    }
  if (def.art === 'funnel' && polys.length === 2) {
    // A see-through back wall between the two slopes.
    const [l, r] = polys as [number[], number[]];
    g.poly([l[0]!, l[1]!, r[2]!, r[3]!, r[4]!, r[5]!, l[6]!, l[7]!]).fill({ color: def.accent, alpha: 0.28 });
  }
  for (const p of polys) g.poly(p).stroke(stroke(6));
  for (const [x, y, r] of joints) g.circle(x, y, r + 3).fill(OUTLINE);
  for (const p of polys) g.poly(p).fill(def.color);
  for (const [x, y, r] of joints) g.circle(x, y, r).fill(def.color);
  // A light rail along each top edge, then a darker underside.
  for (const p of parts) {
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    const hw = p.width / 2 - 2;
    for (const [off, color, width] of [
      [-p.height / 2 + 2.2, def.accent, 2.4],
      [p.height / 2 - 1.8, darken(def.color, 0.25), 1.8],
    ] as const) {
      if (p.height < 7) continue;
      g.moveTo(p.x - c * hw - s * off, p.y - s * hw + c * off)
        .lineTo(p.x + c * hw - s * off, p.y + s * hw + c * off)
        .stroke({ width, color, cap: 'round' });
    }
  }
  // Bolts and peg holes along the pieces.
  const bolt = (x: number, y: number): void => {
    g.circle(x, y, 2.2)
      .fill(lighten(def.color, 0.6))
      .stroke({ width: 1.2, color: darken(def.color, 0.4) });
  };
  const hole = (x: number, y: number): void => {
    g.circle(x, y, 1.8).fill(darken(def.color, 0.55));
  };
  for (const p of parts) {
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    if (p.width < 12) continue;
    const n = Math.max(2, Math.round(p.width / 30));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const d = t * (p.width - 10);
      (i % 2 === 0 ? bolt : hole)(p.x + c * d, p.y + s * d);
    }
  }
  // The straight piece's end posts get a round cap, like a stopper.
  if (def.art === 'track_straight')
    for (const p of parts.filter((q) => q.width < 12))
      g.circle(p.x, p.y - p.height / 2 + 2.5, 2).fill({ color: 0xffffff, alpha: 0.8 });
}

function domino(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.roundRect(-w / 2, -h / 2, w, h, 3.5)
    .fill(def.color)
    .stroke(stroke(3.5));
  g.rect(w * 0.12, -h / 2 + 2, w * 0.3, h - 4).fill({ color: OUTLINE, alpha: 0.1 });
  g.moveTo(-w / 2 + 2.5, 0)
    .lineTo(w / 2 - 2.5, 0)
    .stroke({ width: 1.8, color: def.accent });
  g.circle(0, 0, 1.6).fill(0xe8b84a);
  for (const y of [-0.33, -0.16, 0.14, 0.25, 0.36]) g.circle(0, h * y, 1.9).fill(def.accent);
  g.moveTo(-w * 0.22, -h / 2 + 4)
    .lineTo(-w * 0.22, -h * 0.06)
    .stroke({ width: 1.3, color: 0xffffff, alpha: 0.9, cap: 'round' });
}

function spinningTop(g: Graphics, def: ItemDef, r: number): void {
  g.roundRect(-r * 0.12, -r * 0.98, r * 0.24, r * 0.5, 3)
    .fill(0xffd23f)
    .stroke(stroke(3.5));
  topPath(g, r).fill(def.color).stroke(stroke(4.5));
  g.moveTo(-r * 0.86, r * 0.02)
    .quadraticCurveTo(0, r * 0.3, r * 0.86, r * 0.02)
    .stroke({ width: r * 0.24, color: def.accent, cap: 'round' });
  for (const x of [-0.5, 0, 0.5]) g.circle(r * x, r * (0.12 + (x === 0 ? 0.04 : 0)), r * 0.06).fill(0xffffff);
  g.circle(0, r * 0.92, r * 0.1)
    .fill(METAL)
    .stroke(stroke(2));
  g.moveTo(-r * 0.6, -r * 0.3)
    .quadraticCurveTo(-r * 0.35, -r * 0.46, 0, -r * 0.48)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.7, cap: 'round' });
}

function yoYo(g: Graphics, def: ItemDef, r: number): void {
  g.circle(0, 0, r).fill(def.color).stroke(stroke(4.5));
  g.circle(0, 0, r * 0.66)
    .fill(lighten(def.color, 0.2))
    .stroke({ width: 2.5, color: darken(def.color, 0.3) });
  g.star(0, 0, 5, r * 0.36, r * 0.16)
    .fill(def.accent)
    .stroke(stroke(2));
  g.moveTo(-r * 0.78, -r * 0.2)
    .arc(0, 0, r * 0.8, Math.PI * 1.08, Math.PI * 1.42)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.75, cap: 'round' });
  // A loop of string poking out from the axle.
  g.moveTo(r * 0.1, r * 0.1)
    .bezierCurveTo(r * 0.6, r * 0.5, r * 1.3, r * 0.3, r * 1.05, r * 0.9)
    .stroke({ width: 4.5, color: OUTLINE, cap: 'round' });
  g.moveTo(r * 0.1, r * 0.1)
    .bezierCurveTo(r * 0.6, r * 0.5, r * 1.3, r * 0.3, r * 1.05, r * 0.9)
    .stroke({ width: 1.8, color: 0xfffdf4, cap: 'round' });
}

/** Draw an M7 item. Returns false when `def.art` is not one of them. */
export function drawItemArt7(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): boolean {
  const r = w / 2;
  switch (def.art) {
    case 'pollen_puff':
      pollenPuff(g, def, r, seedN);
      return true;
    case 'seed':
      seed(g, def, w, h);
      return true;
    case 'lavender':
      lavender(g, def, w, h);
      return true;
    case 'honey_drop':
      honeyDrop(g, def, r);
      return true;
    case 'bluebell':
      bluebell(g, def, w, h);
      return true;
    case 'petal':
      petal(g, def, w, h);
      return true;
    case 'lattice':
      lattice(g, def, w, h, seedN);
      return true;
    case 'paperclip':
      paperclip(g, def, w);
      return true;
    case 'rubber_band':
      rubberBand(g, def, w, h);
      return true;
    case 'popsicle_stick':
      popsicleStick(g, def, w, h);
      return true;
    case 'spool':
      spool(g, def, w, h);
      return true;
    case 'button':
      button(g, def, r);
      return true;
    case 'matchbox':
      matchbox(g, def, w, h);
      return true;
    case 'straw':
      straw(g, def, w, h);
      return true;
    case 'toothpick':
      toothpick(g, def, w, h);
      return true;
    case 'foil_ball':
      foilBall(g, def, r, seedN);
      return true;
    case 'tissue':
      tissue(g, def, w, h);
      return true;
    case 'paper_scrap':
      paperScrap(g, def, w, h, seedN);
      return true;
    case 'eggshell':
      eggshell(g, def, w, h, seedN);
      return true;
    case 'battery':
      battery(g, def, w, h);
      return true;
    case 'tin_can':
      tinCan(g, def, w, h);
      return true;
    case 'cheese_puff':
      cheesePuff(g, def, w, h, seedN);
      return true;
    case 'cookie_crumb':
      cookieCrumb(g, def, r, seedN);
      return true;
    case 'coin':
      coin(g, def, r, seedN);
      return true;
    case 'apple_core':
      appleCore(g, def, w, h);
      return true;
    case 'dung_ball':
      dungBall(g, def, r, seedN);
      return true;
    case 'jar':
      jar(g, def, w, h);
      return true;
    case 'mushroom_cap':
      mushroomCap(g, def, w, h, seedN);
      return true;
    case 'ice_cube':
      iceCube(g, def, w, h);
      return true;
    case 'coffee_bean':
      coffeeBean(g, def, w, h);
      return true;
    case 'onion_ring':
      onionRing(g, def, w, h, seedN);
      return true;
    case 'fizz_candy':
      fizzCandy(g, def, w, h);
      return true;
    case 'compost_goo':
      compostGoo(g, def, r, seedN);
      return true;
    case 'track_straight':
    case 'track_curve':
    case 'funnel':
      track(g, def);
      return true;
    case 'domino':
      domino(g, def, w, h);
      return true;
    case 'spinning_top':
      spinningTop(g, def, r);
      return true;
    case 'yo_yo':
      yoYo(g, def, r);
      return true;
    default:
      return false;
  }
}

/** Trace an M7 item's silhouette (no fill). Returns false when it has none of its own. */
export function outlineItemArt7(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): boolean {
  const r = w / 2;
  switch (def.art) {
    case 'pollen_puff':
    case 'foil_ball':
    case 'button':
    case 'coin':
    case 'yo_yo':
    case 'cookie_crumb':
      g.circle(0, 0, r * 1.02);
      return true;
    case 'dung_ball':
      g.poly(lumps(r, 18, seedN, 0.14));
      return true;
    case 'compost_goo':
      g.poly(gooPoints(r, seedN));
      return true;
    case 'seed':
      seedPath(g, w, h);
      return true;
    case 'honey_drop':
      honeyPath(g, r);
      return true;
    case 'lavender':
      g.roundRect(-w / 2, -h * 0.6, w, h * 1.2, h * 0.6);
      return true;
    case 'bluebell':
      bellPath(g, w, h);
      return true;
    case 'petal':
      petalPath(g, w, h);
      return true;
    case 'paperclip':
    case 'rubber_band':
      g.roundRect(-w / 2, -h / 2 - 2, w, h + 4, h / 2 + 2);
      return true;
    case 'popsicle_stick':
      g.roundRect(-w / 2, -h / 2, w, h, h / 2);
      return true;
    case 'toothpick':
      g.poly([
        -w / 2,
        0,
        -w / 2 + 11,
        -h / 2,
        w / 2 - 11,
        -h / 2,
        w / 2,
        0,
        w / 2 - 11,
        h / 2,
        -w / 2 + 11,
        h / 2,
      ]);
      return true;
    case 'tissue':
      tissuePath(g, w, h);
      return true;
    case 'paper_scrap':
      g.rect(-w / 2, -h * 0.95, w - 2, h * 1.9);
      return true;
    case 'eggshell':
      eggPath(g, w, h);
      return true;
    case 'cheese_puff':
      for (const [x, y, rr] of puffBalls(w, h)) g.circle(x, y, rr);
      return true;
    case 'apple_core':
      coreOutline(g, w, h);
      return true;
    case 'jar':
      jarPath(g, w, h);
      g.roundRect(-w * 0.43, -h / 2, w * 0.86, h * 0.2, 4);
      return true;
    case 'mushroom_cap':
      capPath(g, w, h);
      return true;
    case 'coffee_bean':
      g.ellipse(0, 0, w / 2, h / 2);
      return true;
    case 'onion_ring':
      g.ellipse(0, 0, w / 2, h / 2 + 2);
      return true;
    case 'fizz_candy':
      g.poly([
        -w / 2,
        -h / 2,
        -w * 0.25,
        -h * 0.3,
        w * 0.25,
        -h * 0.3,
        w / 2,
        -h / 2,
        w / 2,
        h / 2,
        w * 0.25,
        h * 0.3,
        -w * 0.25,
        h * 0.3,
        -w / 2,
        h / 2,
      ]);
      return true;
    case 'spinning_top':
      topPath(g, r);
      return true;
    case 'track_straight':
    case 'track_curve':
    case 'funnel':
      for (const p of partsPx(def)) g.poly(rotRect(p.x, p.y, p.width, p.height, p.angle));
      return true;
    default:
      return false;
  }
}
