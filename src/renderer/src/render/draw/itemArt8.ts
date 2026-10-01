import type { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { BoxPart, ItemArt, ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { hash01 } from '../bugPose';

/**
 * Art for the M8 items: crafting materials, paint drops, potion bottles, and
 * everything the bench makes. Each drawer fills the item's collider, centered
 * on the origin and unrotated; `w` and `h` are the collider's size in pixels.
 * Items built from physics parts draw each part where the physics has it.
 */

type Pt = readonly [number, number];

const WOOD = 0xd9a066;
const WOOD_DARK = 0x8a5a3a;
const METAL = 0xc7d3e3;
const METAL_DARK = 0x8e9bb0;
const PAPER = 0xfff8e6;
const GLASS = 0xeaf6ff;

/** Every art key this file draws. */
export const M8_ARTS: readonly ItemArt[] = [
  'string',
  'balloon',
  'balloon_scrap',
  'maple_seed',
  'thimble',
  'comb',
  'glass_bead',
  'paint_drop',
  'ant_crumb',
  'popcorn_kernel',
  'popcorn',
  'hat_mushroom',
  'eggshell_bit',
  'junk_blob',
  'blueprint',
  'potion',
  'sprout',
  'slingshot',
  'spring_launcher',
  'matchbox_racer',
  'parachute',
  'balloon_basket',
  'can_phone',
  'magnet_crane',
  'pinwheel',
  'disco_ball',
  'straw_rocket',
  'seesaw',
  'spoon_catapult',
  'trampoline',
  'hat_propeller',
  'hat_viking',
  'hat_beanie',
  'hat_pirate',
  'googly_glasses',
  'snorkel',
  'headlamp',
  'roller_skates',
  'leaf_cape',
  'foil_crown',
  'backpack',
  'kazoo',
  'band_harp',
  'can_bass',
  'thimble_drum',
];

// --- Helpers ----------------------------------------------------------------

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

/** A soft white highlight line. */
function shine(g: Graphics, pts: readonly Pt[], width = 2.5, alpha = 0.7): void {
  path(g, pts).stroke({ width, color: 0xffffff, alpha, cap: 'round', join: 'round' });
}

/** A small four-point twinkle. */
function twinkle(g: Graphics, x: number, y: number, r: number, alpha = 0.95): void {
  g.star(x, y, 4, r, r * 0.28).fill({ color: 0xffffff, alpha });
}

/** The corners of a w x h box centered at (cx, cy), turned by `a`. */
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

/** The item's physics parts in pixels. */
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

/** Part `i` as a top-left box (the M8 toys' parts are all unrotated). */
function partBox(def: ItemDef, i: number): { x: number; y: number; w: number; h: number } {
  const p = partsPx(def)[i]!;
  return { x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height };
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

/** A coil spring between two points (vertical), `turns` zigzags wide `hw`. */
function coil(
  g: Graphics,
  x: number,
  y0: number,
  y1: number,
  hw: number,
  turns: number,
  color: number,
): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= turns * 2; i++)
    pts.push([x + (i % 2 === 0 ? -hw : hw), y0 + ((y1 - y0) * i) / (turns * 2)]);
  wire(g, pts, 3.5, color, 2.5);
  shine(
    g,
    pts.map(([px, py]) => [px + 0.8, py - 0.8] as const),
    1.2,
    0.8,
  );
}

/** A googly eye: white, outlined, pupil sitting toward (dx, dy). */
function googly(g: Graphics, x: number, y: number, r: number, dx: number, dy: number): void {
  g.circle(x, y, r)
    .fill(0xffffff)
    .stroke(stroke(Math.max(2.5, r * 0.28)));
  g.circle(x + dx * r * 0.38, y + dy * r * 0.38, r * 0.5).fill(OUTLINE);
  g.circle(x + dx * r * 0.38 - r * 0.18, y + dy * r * 0.38 - r * 0.18, r * 0.15).fill(0xffffff);
}

/** A dimpled thimble dome, open side down, `w` wide from `top` to `bottom`. */
function thimblePath(g: Graphics, w: number, top: number, bottom: number): Graphics {
  const hw = w / 2;
  const tw = hw * 0.8;
  return g
    .moveTo(-hw, bottom)
    .lineTo(-tw, top + (bottom - top) * 0.32)
    .bezierCurveTo(-tw, top - 1, tw, top - 1, tw, top + (bottom - top) * 0.32)
    .lineTo(hw, bottom)
    .closePath();
}

function thimbleBody(g: Graphics, color: number, band: number, w: number, top: number, bottom: number): void {
  thimblePath(g, w, top, bottom).fill(color).stroke(stroke(4));
  const hh = bottom - top;
  // Dimples in staggered rows.
  for (let row = 0; row < 4; row++) {
    const y = top + hh * (0.22 + row * 0.15);
    const half = (w / 2) * (0.62 + row * 0.07);
    const n = 3 + row;
    for (let i = 0; i < n; i++) {
      const x = -half + ((i + (row % 2 ? 0.5 : 0.25)) * 2 * half) / n;
      if (Math.abs(x) > half - 1) continue;
      g.circle(x, y, Math.max(1, w * 0.035)).fill(darken(color, 0.32));
    }
  }
  // The rolled rim.
  g.roundRect(-w / 2 - 1.5, bottom - hh * 0.2, w + 3, hh * 0.2, 3)
    .fill(band)
    .stroke(stroke(3.5));
  shine(g, [
    [-w * 0.28, bottom - hh * 0.3],
    [-w * 0.3, top + hh * 0.35],
    [-w * 0.16, top + hh * 0.12],
  ]);
}

/** A tin can standing up, `w` by `h` with its top at `top`. */
function canBody(
  g: Graphics,
  color: number,
  label: number,
  x: number,
  top: number,
  w: number,
  h: number,
): void {
  g.roundRect(x - w / 2, top, w, h, 4)
    .fill(color)
    .stroke(stroke(4));
  g.rect(x - w / 2 + 2, top + h * 0.3, w - 4, h * 0.4).fill(label);
  g.moveTo(x - w / 2 + 2, top + h * 0.36)
    .lineTo(x + w / 2 - 2, top + h * 0.36)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
  for (const y of [top + 3, top + h - 3])
    g.roundRect(x - w / 2 - 1.5, y - 3, w + 3, 6, 3)
      .fill(lighten(color, 0.3))
      .stroke(stroke(3));
  g.rect(x - w * 0.3, top + 7, 3, h - 14).fill({ color: 0xffffff, alpha: 0.45 });
}

// --- Materials --------------------------------------------------------------

function string(g: Graphics, def: ItemDef, w: number, h: number): void {
  const pts: Pt[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([-w / 2 + 4 + (w - 8) * t, Math.sin(t * Math.PI * 3) * h * 0.28]);
  }
  wire(g, pts, 3.2, def.color, 2);
  // Twist marks along the thread, and frayed ends.
  for (let i = 1; i < n; i += 2) {
    const [x, y] = pts[i]!;
    g.moveTo(x - 1.2, y - 1.2)
      .lineTo(x + 1.2, y + 1.2)
      .stroke({ width: 1, color: darken(def.accent, 0.2) });
  }
  for (const s of [-1, 1]) {
    const [x, y] = pts[s < 0 ? 0 : n]!;
    for (const a of [-0.5, 0.5])
      g.moveTo(x, y)
        .lineTo(x + s * 4, y + a * 6)
        .stroke({ width: 1.4, color: darken(def.accent, 0.1), cap: 'round' });
  }
}

/** The balloon's body, drawn a touch taller than wide. */
function balloonPath(g: Graphics, r: number): Graphics {
  return g.ellipse(0, -r * 0.06, r * 0.9, r * 0.96);
}

function balloon(g: Graphics, def: ItemDef, r: number): void {
  // A wavy string tail below the knot.
  const tail: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    tail.push([Math.sin(t * Math.PI * 2.2) * r * 0.12, r * 0.98 + t * r * 0.55]);
  }
  wire(g, tail, 1.6, 0xf4ead2, 1.5);
  // The knot, a little pinched triangle.
  g.poly([-r * 0.13, r * 1.0, r * 0.13, r * 1.0, 0, r * 0.84])
    .fill(darken(def.color, 0.15))
    .stroke(stroke(3));
  balloonPath(g, r).fill(def.color).stroke(stroke(4.5));
  g.ellipse(r * 0.25, r * 0.3, r * 0.45, r * 0.5).fill({ color: darken(def.color, 0.2), alpha: 0.35 });
  g.ellipse(-r * 0.36, -r * 0.4, r * 0.18, r * 0.3).fill({ color: def.accent, alpha: 0.9 });
  g.circle(-r * 0.2, -r * 0.7, r * 0.08).fill(0xffffff);
}

function balloonScrap(g: Graphics, def: ItemDef, w: number, h: number): void {
  const pts = [
    -w / 2 + 6,
    -h / 2 + 1,
    -w * 0.1,
    -h / 2 - 1,
    w * 0.05,
    -h * 0.15,
    w * 0.22,
    -h / 2,
    w / 2,
    -h * 0.1,
    w * 0.3,
    h / 2,
    w * 0.05,
    h * 0.2,
    -w * 0.18,
    h / 2,
    -w / 2 + 6,
    h / 2,
  ];
  g.poly(pts).fill(def.color).stroke(stroke(3));
  // The tied neck: a little ring at the left end.
  g.circle(-w / 2 + 4, 0, h * 0.42)
    .fill(darken(def.color, 0.15))
    .stroke(stroke(2.5));
  shine(
    g,
    [
      [-w * 0.15, -h * 0.15],
      [w * 0.12, -h * 0.25],
    ],
    1.8,
    0.75,
  );
}

function mapleSeed(g: Graphics, def: ItemDef, w: number, h: number): void {
  // The wing, thin and veined, fanning to the right.
  const sx = -w / 2 + h * 0.55;
  g.moveTo(sx, -h * 0.35)
    .bezierCurveTo(w * 0.05, -h * 0.7, w * 0.4, -h * 0.6, w / 2, -h * 0.15)
    .bezierCurveTo(w * 0.45, h * 0.35, w * 0.1, h * 0.3, sx, h * 0.25)
    .closePath()
    .fill(def.accent)
    .stroke(stroke(3));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    g.moveTo(sx + 2, -h * 0.2)
      .quadraticCurveTo(w * 0.1, -h * 0.4 + t * h * 0.5, w * 0.42, -h * 0.2 + t * h * 0.35)
      .stroke({ width: 1, color: darken(def.accent, 0.3), alpha: 0.7 });
  }
  g.moveTo(sx, -h * 0.35)
    .bezierCurveTo(w * 0.05, -h * 0.7, w * 0.4, -h * 0.6, w / 2, -h * 0.15)
    .stroke({ width: 2.2, color: darken(def.color, 0.15), cap: 'round' });
  // The seed.
  g.ellipse(-w / 2 + h * 0.55, 0, h * 0.55, h * 0.48)
    .fill(def.color)
    .stroke(stroke(3));
  g.circle(-w / 2 + h * 0.4, -h * 0.15, h * 0.13).fill({ color: 0xffffff, alpha: 0.6 });
}

function thimble(g: Graphics, def: ItemDef, w: number, h: number): void {
  thimbleBody(g, def.color, def.accent, w * 0.92, -h / 2 + 1, h / 2 - 1);
}

function comb(g: Graphics, def: ItemDef, w: number, h: number): void {
  const spine = h * 0.42;
  const top = -h / 2;
  // Teeth first, then the spine over their roots.
  const n = 8;
  const tw = (w - 8) / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 4 + i * tw;
    g.roundRect(x + tw * 0.15, top + spine - 2, tw * 0.7, h - spine + 1, 1.5)
      .fill(lighten(def.color, 0.15))
      .stroke(stroke(1.5));
  }
  g.roundRect(-w / 2, top, w, spine, spine / 2)
    .fill(def.color)
    .stroke(stroke(3.5));
  shine(
    g,
    [
      [-w / 2 + 4, top + 2.5],
      [w * 0.2, top + 2.5],
    ],
    1.8,
    0.8,
  );
}

function glassBead(g: Graphics, def: ItemDef, r: number): void {
  g.circle(0, 0, r).fill(def.color).stroke(stroke(3));
  g.circle(r * 0.15, r * 0.15, r * 0.65).fill({ color: darken(def.color, 0.2), alpha: 0.35 });
  g.circle(0, 0, r * 0.28)
    .fill(darken(def.color, 0.45))
    .stroke({ width: 1.5, color: OUTLINE });
  g.ellipse(-r * 0.4, -r * 0.42, r * 0.22, r * 0.14).fill({ color: def.accent, alpha: 0.95 });
}

/** A paint drop's blob: flat at the base, swelling to a soft peak. */
function dropPath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w / 2, h / 2 - 2)
    .bezierCurveTo(-w / 2, -h * 0.3, -w * 0.25, -h * 0.38, -w * 0.04, -h * 0.36)
    .quadraticCurveTo(w * 0.02, -h * 0.42, w * 0.1, -h / 2 - 1)
    .quadraticCurveTo(w * 0.12, -h * 0.38, w * 0.16, -h * 0.34)
    .bezierCurveTo(w * 0.4, -h * 0.28, w / 2, -h * 0.1, w / 2, h / 2 - 2)
    .quadraticCurveTo(0, h / 2 + 1.5, -w / 2, h / 2 - 2)
    .closePath();
}

function paintDrop(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  dropPath(g, w, h).fill(def.color).stroke(stroke(3.5));
  g.ellipse(w * 0.1, h * 0.26, w * 0.3, h * 0.14).fill({ color: darken(def.color, 0.25), alpha: 0.35 });
  if (def.tags?.includes('tag_glowing'))
    for (let i = 0; i < 6; i++)
      g.circle(
        (hash01(seedN, i) - 0.5) * w * 0.7,
        (hash01(seedN, i + 9) - 0.3) * h * 0.55,
        0.9 + hash01(seedN, i + 20) * 1.1,
      ).fill(0xffffff);
  g.ellipse(-w * 0.18, -h * 0.02, w * 0.12, h * 0.15).fill(def.accent);
  g.circle(-w * 0.1, -h * 0.2, 1.4).fill(0xffffff);
}

function antCrumb(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  g.poly(lumps(r * 0.95, 7, seedN, 0.45))
    .fill(def.color)
    .stroke(stroke(2.5));
  for (let i = 0; i < 3; i++)
    g.circle((hash01(seedN, i) - 0.5) * r, (hash01(seedN, i + 5) - 0.5) * r, 0.9).fill(def.accent);
}

function kernelPath(g: Graphics, r: number): Graphics {
  return g
    .moveTo(0, -r)
    .bezierCurveTo(r * 0.75, -r * 0.6, r * 0.95, r * 0.55, 0, r * 0.95)
    .bezierCurveTo(-r * 0.95, r * 0.55, -r * 0.75, -r * 0.6, 0, -r)
    .closePath();
}

function popcornKernel(g: Graphics, def: ItemDef, r: number): void {
  kernelPath(g, r).fill(def.color).stroke(stroke(2.5));
  g.moveTo(0, -r * 0.9)
    .bezierCurveTo(r * 0.35, -r * 0.6, r * 0.25, -r * 0.3, 0, -r * 0.25)
    .bezierCurveTo(-r * 0.25, -r * 0.3, -r * 0.35, -r * 0.6, 0, -r * 0.9)
    .fill(def.accent);
  g.circle(-r * 0.3, r * 0.15, r * 0.14).fill({ color: 0xffffff, alpha: 0.7 });
}

/** The popcorn's puffs: x, y, radius. */
function puffs(r: number): [number, number, number][] {
  return [
    [-r * 0.42, r * 0.1, r * 0.5],
    [r * 0.4, r * 0.15, r * 0.5],
    [0, -r * 0.38, r * 0.55],
    [0, r * 0.42, r * 0.48],
    [-r * 0.1, 0, r * 0.45],
  ];
}

function popcorn(g: Graphics, def: ItemDef, r: number): void {
  const p = puffs(r);
  for (const [x, y, rr] of p) g.circle(x, y, rr).stroke(stroke(5));
  for (const [x, y, rr] of p) g.circle(x, y, rr).fill(def.color);
  for (const [x, y, rr] of p.slice(0, 4))
    g.moveTo(x - rr * 0.5, y - rr * 0.1)
      .arc(x, y, rr * 0.55, Math.PI * 1.05, Math.PI * 1.45)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.9, cap: 'round' });
  for (const [x, y, rr] of p.slice(0, 4))
    g.moveTo(x + rr * 0.1, y + rr * 0.5)
      .arc(x, y, rr * 0.7, Math.PI * 0.3, Math.PI * 0.7)
      .stroke({ width: 1.2, color: darken(def.color, 0.18), cap: 'round' });
  // A scrap of golden hull in the middle.
  g.poly([-r * 0.18, r * 0.05, r * 0.12, -r * 0.08, r * 0.15, r * 0.18])
    .fill(def.accent)
    .stroke(stroke(1.5));
}

function hatMushroomPath(g: Graphics, w: number, h: number): Graphics {
  return g
    .moveTo(-w / 2, h * 0.32)
    .bezierCurveTo(-w * 0.52, -h * 0.75, w * 0.52, -h * 0.75, w / 2, h * 0.32)
    .quadraticCurveTo(0, h * 0.5, -w / 2, h * 0.32)
    .closePath();
}

function hatMushroom(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  // The cream underside peeking out below the rim.
  g.ellipse(0, h * 0.34, w * 0.44, h * 0.15)
    .fill(0xfff1dc)
    .stroke(stroke(3));
  for (let i = -3; i <= 3; i++)
    g.moveTo(i * w * 0.05, h * 0.28)
      .lineTo(i * w * 0.09, h * 0.42)
      .stroke({ width: 1.1, color: darken(0xfff1dc, 0.25) });
  hatMushroomPath(g, w, h).fill(def.color).stroke(stroke(4));
  for (const [x, y, r] of [
    [-0.24, -0.02, 0.1],
    [0.06, -0.28, 0.09],
    [0.28, 0.06, 0.08],
    [-0.04, 0.12, 0.05],
    [-0.38, 0.2, 0.04],
  ] as const)
    g.ellipse(w * x, h * y, w * r * (0.9 + hash01(seedN, Math.round(x * 100)) * 0.2), w * r * 0.75).fill(
      def.accent,
    );
  shine(g, [
    [-w * 0.32, -h * 0.1],
    [-w * 0.18, -h * 0.34],
    [0, -h * 0.38],
  ]);
}

function eggshellBitPoly(w: number, h: number): number[] {
  return [
    -w / 2,
    h * 0.3,
    -w * 0.3,
    -h / 2,
    -w * 0.05,
    -h * 0.1,
    w * 0.15,
    -h / 2,
    w / 2,
    -h * 0.1,
    w * 0.35,
    h / 2,
    -w * 0.2,
    h / 2,
  ];
}

function eggshellBit(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.poly(eggshellBitPoly(w, h)).fill(def.color).stroke(stroke(2.5));
  g.poly([-w * 0.25, h * 0.25, w * 0.25, h * 0.1, w * 0.2, h * 0.38, -w * 0.15, h * 0.4]).fill(def.accent);
}

/** The junk blob's lumpy outline. */
function blobPoints(r: number, seedN: number): number[] {
  return lumps(r * 0.94, 14, seedN + 7, 0.3, 0.9);
}

function junkBlob(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  const pts = blobPoints(r, seedN);
  // A few bits of junk stuck in the goo, peeking past the edge.
  const bits: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * (0.85 + i * 0.45 + hash01(seedN, i + 40) * 0.25);
    bits.push([Math.cos(a), Math.sin(a)]);
  }
  const [b0, b1, b2] = bits as [[number, number], [number, number], [number, number]];
  // A twig end.
  wire(
    g,
    [
      [b0[0] * r * 0.6, b0[1] * r * 0.6],
      [b0[0] * r * 1.12, b0[1] * r * 1.12],
    ],
    4,
    WOOD,
    2.5,
  );
  // A button.
  g.circle(b1[0] * r * 0.95, b1[1] * r * 0.95, r * 0.2)
    .fill(0xff7eb6)
    .stroke(stroke(2.5));
  g.poly(pts).fill(def.color).stroke(stroke(4));
  // Lighter goo on top, darker underneath.
  g.ellipse(r * 0.1, r * 0.45, r * 0.6, r * 0.25).fill({ color: darken(def.color, 0.2), alpha: 0.4 });
  g.ellipse(-r * 0.35, -r * 0.5, r * 0.22, r * 0.12).fill({ color: def.accent, alpha: 0.9 });
  // A bottle cap edge stuck in the side.
  g.circle(b2[0] * r * 0.72, b2[1] * r * 0.72, r * 0.16)
    .fill(METAL)
    .stroke(stroke(2));
  // Two googly eyes, looking a little different on every blob.
  const look = hash01(seedN, 3) * Math.PI * 2;
  const dx = Math.cos(look);
  const dy = Math.sin(look) * 0.6 + 0.3;
  const big = 0.24 + hash01(seedN, 4) * 0.06;
  googly(g, -r * 0.28, -r * 0.08, r * big, dx, dy);
  googly(g, r * 0.26, -r * 0.12, r * (0.43 - big), -dx * 0.5, dy);
  // A little smile.
  g.moveTo(-r * 0.15, r * 0.3)
    .quadraticCurveTo(0, r * 0.45, r * 0.18, r * 0.27)
    .stroke({ width: 2.6, color: OUTLINE, cap: 'round' });
}

function blueprint(g: Graphics, def: ItemDef, w: number, h: number): void {
  const blue = 0x2f6fd0;
  const ew = h * 0.28;
  // The roll's body, with a faint grid.
  g.roundRect(-w / 2 + ew, -h / 2, w - ew * 2, h, 3)
    .fill(blue)
    .stroke(stroke(3.5));
  for (let x = -w / 2 + ew + 6; x < w / 2 - ew - 2; x += 6)
    g.moveTo(x, -h / 2 + 2)
      .lineTo(x, h / 2 - 2)
      .stroke({ width: 0.8, color: 0xffffff, alpha: 0.35 });
  g.moveTo(-w / 2 + ew, -h * 0.05)
    .lineTo(w / 2 - ew, -h * 0.05)
    .stroke({ width: 0.8, color: 0xffffff, alpha: 0.35 });
  // A little white sketch on the front: a star, as if of the toy.
  g.star(-w * 0.25, 0, 5, h * 0.22, h * 0.1).stroke({ width: 1.2, color: 0xffffff, alpha: 0.9 });
  g.moveTo(w * 0.12, -h * 0.2)
    .lineTo(w * 0.3, -h * 0.2)
    .moveTo(w * 0.12, h * 0.05)
    .lineTo(w * 0.26, h * 0.05)
    .stroke({ width: 1.2, color: 0xffffff, alpha: 0.9, cap: 'round' });
  // The spiral ends of the roll, showing the paper's pale back.
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - ew);
    g.ellipse(x, 0, ew, h / 2)
      .fill(lighten(blue, 0.15))
      .stroke(stroke(3));
    g.ellipse(x, 0, ew * 0.55, h * 0.3).stroke({ width: 1.2, color: def.color });
    g.circle(x, 0, 1.4).fill(OUTLINE);
  }
  shine(
    g,
    [
      [-w / 2 + ew + 3, -h / 2 + 3],
      [w / 2 - ew - 3, -h / 2 + 3],
    ],
    1.6,
    0.55,
  );
  // The ribbon round the middle, with a bow.
  const rx = w * 0.04;
  g.rect(rx - 3, -h / 2, 6, h)
    .fill(def.accent)
    .stroke(stroke(2.5));
  for (const s of [-1, 1])
    g.ellipse(rx + s * 5, -h / 2 - 1, 5, 3.2)
      .fill(def.accent)
      .stroke(stroke(2.5));
  g.circle(rx, -h / 2, 2.6)
    .fill(def.accent)
    .stroke(stroke(2.5));
}

// --- Potions ----------------------------------------------------------------

type Glyph =
  | 'up'
  | 'down'
  | 'cloud'
  | 'balloon'
  | 'star'
  | 'drop'
  | 'arc'
  | 'bubbles'
  | 'flame'
  | 'snow'
  | 'weight'
  | 'zig'
  | 'bolt'
  | 'spiral'
  | 'wave'
  | 'z'
  | 'note'
  | 'flip'
  | 'pair'
  | 'hair'
  | 'magnet'
  | 'ghost'
  | 'wings';

/** The label pictogram for each potion; mixes get a swirl. */
const GLYPHS: Readonly<Record<string, Glyph>> = {
  potion_giant: 'up',
  potion_tiny: 'down',
  potion_floaty: 'cloud',
  potion_balloon: 'balloon',
  potion_glow: 'star',
  potion_paint: 'drop',
  potion_rainbow: 'arc',
  potion_sticky_feet: 'drop',
  potion_burp: 'bubbles',
  potion_bubble: 'bubbles',
  potion_bubble_burp: 'bubbles',
  potion_fire_breath: 'flame',
  potion_frosty: 'snow',
  potion_heavy: 'weight',
  potion_bouncy: 'zig',
  potion_speedy: 'bolt',
  potion_slowmo: 'spiral',
  potion_stinky: 'wave',
  potion_sleepy: 'z',
  potion_opera: 'note',
  potion_squeaky: 'note',
  potion_upside_down: 'flip',
  potion_copycat: 'pair',
  potion_hairy: 'hair',
  potion_magnet: 'magnet',
  potion_ghost: 'ghost',
  potion_rocket: 'up',
  potion_snowball: 'snow',
  potion_wings: 'wings',
  potion_jelly: 'zig',
  potion_wobble: 'wave',
  potion_sludge: 'wave',
  potion_water: 'drop',
};

/** A tiny pictogram about `s` px across, for a bottle's label. */
function glyph(g: Graphics, kind: Glyph, x: number, y: number, s: number, tint: number): void {
  const h = s / 2;
  const line = { width: 1.5, color: OUTLINE, cap: 'round', join: 'round' } as const;
  switch (kind) {
    case 'up':
    case 'down': {
      const d = kind === 'up' ? -1 : 1;
      g.moveTo(x, y - d * h)
        .lineTo(x, y + d * h)
        .moveTo(x - h * 0.7, y + d * h * 0.2)
        .lineTo(x, y + d * h)
        .lineTo(x + h * 0.7, y + d * h * 0.2)
        .stroke(line);
      return;
    }
    case 'flip':
      g.moveTo(x - h * 0.4, y + h)
        .lineTo(x - h * 0.4, y - h)
        .lineTo(x - h * 0.9, y - h * 0.4)
        .moveTo(x + h * 0.4, y - h)
        .lineTo(x + h * 0.4, y + h)
        .lineTo(x + h * 0.9, y + h * 0.4)
        .stroke(line);
      return;
    case 'cloud':
      g.circle(x - h * 0.45, y + h * 0.2, h * 0.45)
        .circle(x + h * 0.45, y + h * 0.2, h * 0.45)
        .circle(x, y - h * 0.15, h * 0.55)
        .fill(tint);
      return;
    case 'balloon':
      g.ellipse(x, y - h * 0.25, h * 0.6, h * 0.7).fill(tint);
      g.moveTo(x, y + h * 0.45)
        .lineTo(x + h * 0.2, y + h)
        .stroke(line);
      return;
    case 'star':
      g.star(x, y, 5, h, h * 0.45).fill(tint);
      return;
    case 'drop':
      g.moveTo(x, y - h)
        .bezierCurveTo(x + h * 0.9, y, x + h * 0.7, y + h, x, y + h)
        .bezierCurveTo(x - h * 0.7, y + h, x - h * 0.9, y, x, y - h)
        .fill(tint);
      return;
    case 'arc':
      for (const [r, c] of [
        [h, 0xe8453c],
        [h * 0.6, 0x4d7cff],
      ] as const)
        g.moveTo(x - r, y + h * 0.5)
          .arc(x, y + h * 0.5, r, Math.PI, 0)
          .stroke({ width: 1.6, color: c, cap: 'round' });
      return;
    case 'bubbles':
      g.circle(x - h * 0.3, y + h * 0.3, h * 0.5)
        .circle(x + h * 0.5, y - h * 0.4, h * 0.35)
        .stroke({ width: 1.2, color: OUTLINE });
      return;
    case 'flame':
      g.moveTo(x, y - h)
        .bezierCurveTo(x + h, y, x + h * 0.8, y + h, x, y + h)
        .bezierCurveTo(x - h * 0.8, y + h, x - h, y, x, y - h)
        .fill(0xff7a1f);
      g.circle(x, y + h * 0.4, h * 0.35).fill(0xffd23f);
      return;
    case 'snow':
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3 + Math.PI / 2;
        g.moveTo(x - Math.cos(a) * h, y - Math.sin(a) * h).lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h);
      }
      g.stroke({ width: 1.3, color: 0x4d9bd6, cap: 'round' });
      return;
    case 'weight':
      g.poly([x - h * 0.6, y - h * 0.5, x + h * 0.6, y - h * 0.5, x + h, y + h, x - h, y + h]).fill(OUTLINE);
      g.circle(x, y - h * 0.75, h * 0.3).stroke({ width: 1, color: OUTLINE });
      return;
    case 'zig':
      path(g, [
        [x - h, y + h * 0.8],
        [x - h * 0.5, y - h * 0.8],
        [x, y + h * 0.8],
        [x + h * 0.5, y - h * 0.8],
        [x + h, y + h * 0.8],
      ]).stroke(line);
      return;
    case 'bolt':
      g.poly([
        x + h * 0.2,
        y - h,
        x - h * 0.6,
        y + h * 0.15,
        x - h * 0.05,
        y + h * 0.15,
        x - h * 0.25,
        y + h,
        x + h * 0.6,
        y - h * 0.2,
        x + h * 0.05,
        y - h * 0.2,
      ]).fill(0xffb21f);
      return;
    case 'spiral': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = i * 0.75;
        const r = (h * i) / 16;
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      path(g, pts).stroke({ ...line, width: 1.3 });
      return;
    }
    case 'wave':
      for (const dx of [-h * 0.6, 0, h * 0.6])
        g.moveTo(x + dx, y + h)
          .quadraticCurveTo(x + dx + h * 0.4, y + h * 0.3, x + dx, y)
          .quadraticCurveTo(x + dx - h * 0.4, y - h * 0.4, x + dx, y - h);
      g.stroke({ width: 1.2, color: 0x6b8a2b, cap: 'round' });
      return;
    case 'z':
      path(g, [
        [x - h * 0.6, y - h * 0.7],
        [x + h * 0.6, y - h * 0.7],
        [x - h * 0.6, y + h * 0.7],
        [x + h * 0.6, y + h * 0.7],
      ]).stroke(line);
      return;
    case 'note':
      g.ellipse(x - h * 0.35, y + h * 0.6, h * 0.42, h * 0.32).fill(OUTLINE);
      g.moveTo(x + h * 0.05, y + h * 0.55)
        .lineTo(x + h * 0.05, y - h)
        .quadraticCurveTo(x + h * 0.6, y - h * 0.6, x + h * 0.7, y - h * 0.2)
        .stroke(line);
      return;
    case 'pair':
      g.circle(x - h * 0.5, y, h * 0.42).fill(tint);
      g.circle(x + h * 0.5, y, h * 0.42).stroke({ width: 1.2, color: OUTLINE });
      return;
    case 'hair':
      for (const dx of [-h * 0.55, 0, h * 0.55])
        g.moveTo(x + dx, y + h).quadraticCurveTo(x + dx + h * 0.5, y, x + dx, y - h);
      g.stroke({ width: 1.3, color: 0x7a4a2a, cap: 'round' });
      return;
    case 'magnet':
      g.moveTo(x - h * 0.7, y - h)
        .lineTo(x - h * 0.7, y + h * 0.1)
        .arc(x, y + h * 0.1, h * 0.7, Math.PI, 0, true)
        .lineTo(x + h * 0.7, y - h)
        .stroke({ width: 2, color: 0xe34f4f, cap: 'butt' });
      return;
    case 'ghost':
      g.moveTo(x - h * 0.7, y + h)
        .lineTo(x - h * 0.7, y - h * 0.1)
        .arc(x, y - h * 0.1, h * 0.7, Math.PI, 0)
        .lineTo(x + h * 0.7, y + h)
        .lineTo(x + h * 0.35, y + h * 0.65)
        .lineTo(x, y + h)
        .lineTo(x - h * 0.35, y + h * 0.65)
        .closePath()
        .fill(0xffffff)
        .stroke({ width: 1, color: OUTLINE });
      g.circle(x - h * 0.25, y - h * 0.15, h * 0.13)
        .circle(x + h * 0.25, y - h * 0.15, h * 0.13)
        .fill(OUTLINE);
      return;
    case 'wings':
      for (const s of [-1, 1]) g.ellipse(x + s * h * 0.5, y - h * 0.15, h * 0.5, h * 0.75).fill(tint);
      g.ellipse(x, y + h * 0.1, h * 0.18, h * 0.6).fill(OUTLINE);
      return;
  }
}

/** The bottle's outline: a round body under a short neck. */
function bottlePath(g: Graphics, w: number, h: number): Graphics {
  const R = w / 2 - 0.5;
  const cy = h / 2 - R;
  const nw = w * 0.2;
  const top = -h / 2 + 7;
  const a = Math.asin(nw / R);
  return g
    .moveTo(-nw, top)
    .lineTo(-nw, cy - Math.cos(a) * R)
    .arc(0, cy, R, -Math.PI / 2 - a, -Math.PI / 2 + a, true)
    .lineTo(nw, top)
    .closePath();
}

/** Draw a potion bottle with `liquid` inside. Called again when the brew color changes. */
export function drawPotion(g: Graphics, def: ItemDef, w: number, h: number, liquid: number): void {
  const R = w / 2 - 0.5;
  const cy = h / 2 - R;
  const nw = w * 0.2;
  const top = -h / 2 + 7;
  // Clear glass, then the brew in the bottom of the round body.
  bottlePath(g, w, h).fill({ color: GLASS, alpha: 0.75 });
  const ri = R - 2.5;
  const level = cy - ri * 0.5;
  const a = Math.asin((level - cy) / ri);
  g.moveTo(Math.cos(a) * ri, level)
    .arc(0, cy, ri, a, Math.PI - a)
    .closePath()
    .fill(liquid);
  g.moveTo(Math.cos(a) * ri * 0.9, level + ri * 0.55)
    .arc(0, cy, ri * 0.85, 0.5, Math.PI - 0.5)
    .stroke({ width: 2.5, color: darken(liquid, 0.25), alpha: 0.5, cap: 'round' });
  g.ellipse(0, level, Math.cos(a) * ri, 1.6).fill(lighten(liquid, 0.45));
  g.circle(R * 0.45, cy + ri * 0.15, 1.6).fill({ color: lighten(liquid, 0.6), alpha: 0.9 });
  g.circle(R * 0.3, cy - ri * 0.05, 1).fill({ color: lighten(liquid, 0.6), alpha: 0.9 });
  bottlePath(g, w, h).stroke(stroke(3.5));
  // The label with a little pictogram of what it does.
  // A round sticker, small enough to let the brew show all round it.
  const lr = R * 0.4;
  const ly = cy + R * 0.18;
  g.circle(0, ly, lr).fill(PAPER).stroke({ width: 1.5, color: OUTLINE });
  glyph(g, (def.potion && GLYPHS[def.potion]) || 'spiral', 0, ly, lr * 1.25, darken(liquid, 0.45));
  // Glints on the glass.
  g.moveTo(-R * 0.72, cy + R * 0.05)
    .arc(0, cy, R * 0.72, Math.PI * 1.02, Math.PI * 1.32)
    .stroke({ width: 2.2, color: 0xffffff, alpha: 0.85, cap: 'round' });
  g.moveTo(-nw + 2, top + 3)
    .lineTo(-nw + 2, cy - R + 2)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.75, cap: 'round' });
  // The lip and the cork.
  g.roundRect(-nw - 2, top - 1, nw * 2 + 4, 3.5, 1.5)
    .fill(GLASS)
    .stroke({ width: 2, color: OUTLINE });
  g.roundRect(-nw + 0.5, -h / 2, nw * 2 - 1, 7, 2)
    .fill(def.accent)
    .stroke({ width: 2.5, color: OUTLINE });
  g.circle(-1.5, -h / 2 + 2.5, 0.7).fill(darken(def.accent, 0.35));
  g.circle(1.8, -h / 2 + 4.2, 0.7).fill(darken(def.accent, 0.35));
}

// --- Plants -------------------------------------------------------------------

function sprout(g: Graphics, def: ItemDef, w: number, h: number): void {
  const bottom = h / 2;
  // Roots and a clod of soil.
  g.ellipse(0, bottom - 5, w * 0.3, 5)
    .fill(0x8a5a3a)
    .stroke(stroke(2.5));
  for (const s of [-1, 0, 1])
    g.moveTo(s * 3, bottom - 3)
      .lineTo(s * 7, bottom)
      .stroke({ width: 1.3, color: 0xf4e3c4, cap: 'round' });
  // The stem.
  const headY = -h / 2 + w * 0.32;
  wire(
    g,
    [
      [0, bottom - 6],
      [-1.5, h * 0.1],
      [1, headY + 4],
    ],
    4,
    def.color,
    2.5,
  );
  // Two leaves.
  for (const [s, y] of [
    [-1, h * 0.12],
    [1, -h * 0.02],
  ] as const) {
    const leaf = leafPoly(0, y, w * 0.48, w * 0.28, s < 0 ? Math.PI + 0.45 : -0.45);
    g.poly(leaf).fill(def.color).stroke(stroke(2.5));
    g.moveTo(0, y)
      .lineTo(s * w * 0.32, y - w * 0.12)
      .stroke({ width: 1.1, color: darken(def.color, 0.3) });
  }
  // A small sunflower bud opening on top.
  const r = w * 0.3;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.ellipse(Math.cos(a) * r * 0.75, headY + Math.sin(a) * r * 0.75, r * 0.45, r * 0.45).fill(def.accent);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.circle(Math.cos(a) * r * 0.75, headY + Math.sin(a) * r * 0.75, r * 0.42).stroke({
      width: 1.4,
      color: OUTLINE,
    });
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.circle(Math.cos(a) * r * 0.75, headY + Math.sin(a) * r * 0.75, r * 0.36).fill(def.accent);
  }
  g.circle(0, headY, r * 0.55)
    .fill(0x7a4a2a)
    .stroke(stroke(2));
  g.circle(-r * 0.15, headY - r * 0.15, r * 0.12).fill({ color: 0xffffff, alpha: 0.5 });
}

// --- Crafted toys -------------------------------------------------------------

function slingshot(g: Graphics, def: ItemDef, w: number, h: number): void {
  const fork: Pt = [0, h * 0.02];
  const tipL: Pt = [-w / 2 + 7, -h / 2 + 7];
  const tipR: Pt = [w / 2 - 7, -h / 2 + 7];
  // The band behind the frame, sagging into a pouch.
  const pouch: Pt = [0, -h * 0.18];
  wire(g, [tipL, pouch, tipR], 3.5, def.accent, 2.5);
  g.roundRect(pouch[0] - 7, pouch[1] - 3, 14, 7, 3)
    .fill(darken(def.accent, 0.2))
    .stroke(stroke(2.5));
  // The forked twig.
  const arm = (tip: Pt): Pt[] => [fork, [tip[0] * 0.75, -h * 0.12], tip];
  for (const tip of [tipL, tipR]) wire(g, arm(tip), 9, def.color, 3);
  wire(g, [[1, h / 2 - 5], [-1, h * 0.25], fork], 11, def.color, 3);
  // Bark marks, a knot, and a shine.
  g.circle(0, h * 0.28, 2).fill(darken(def.color, 0.35));
  for (const y of [h * 0.12, h * 0.38])
    g.moveTo(-3, y)
      .lineTo(2, y + 2)
      .stroke({ width: 1.2, color: darken(def.color, 0.3) });
  shine(
    g,
    [
      [-2.5, h / 2 - 8],
      [-3.5, h * 0.1],
    ],
    1.8,
    0.5,
  );
  // Band wraps at the tips.
  for (const [x, y] of [tipL, tipR])
    g.roundRect(x - 5.5, y + 2, 11, 5, 2)
      .fill(def.accent)
      .stroke(stroke(2));
}

function springLauncher(g: Graphics, def: ItemDef, w: number, h: number): void {
  const capH = h * 0.38;
  const capTop = h / 2 - capH;
  const plateH = 6;
  coil(g, 0, capTop + 2, -h / 2 + plateH, w * 0.24, 4, def.accent);
  // The launch plate.
  g.roundRect(-w * 0.36, -h / 2, w * 0.72, plateH, 3)
    .fill(lighten(def.accent, 0.3))
    .stroke(stroke(3));
  // The bottle cap base with its crimped skirt.
  g.roundRect(-w / 2, capTop, w, capH, 5)
    .fill(def.color)
    .stroke(stroke(4));
  for (let x = -w / 2 + 5; x < w / 2 - 2; x += 6)
    g.moveTo(x, capTop + capH * 0.35)
      .lineTo(x, h / 2 - 3)
      .stroke({ width: 1.6, color: darken(def.color, 0.25) });
  g.roundRect(-w / 2 + 3, capTop + 2, w - 6, capH * 0.25, 2).fill(lighten(def.color, 0.35));
  // A fire button on the front.
  g.circle(0, capTop + capH * 0.6, capH * 0.18)
    .fill(0xff4f5e)
    .stroke(stroke(2));
  g.circle(-1, capTop + capH * 0.55, capH * 0.06).fill(0xffffff);
}

function matchboxRacer(g: Graphics, def: ItemDef, w: number, h: number): void {
  const wr = h * 0.27;
  const bodyTop = -h / 2 + 4;
  const bodyBot = h / 2 - wr * 1.1;
  // The open tray: two little seats peek over the rim.
  for (const x of [-w * 0.18, w * 0.12])
    g.roundRect(x - 9, bodyTop - 5, 18, 10, 3)
      .fill(0xf2dfb8)
      .stroke(stroke(2.5));
  g.roundRect(-w / 2, bodyTop, w, bodyBot - bodyTop, 6)
    .fill(def.color)
    .stroke(stroke(4));
  g.rect(-w / 2 + 3, bodyTop + (bodyBot - bodyTop) * 0.4, w - 6, (bodyBot - bodyTop) * 0.25).fill(def.accent);
  // A racing number and a headlight.
  g.circle(-w * 0.05, bodyTop + (bodyBot - bodyTop) * 0.52, 6.5)
    .fill(0xffffff)
    .stroke(stroke(2));
  g.moveTo(-w * 0.05 - 1.5, bodyTop + (bodyBot - bodyTop) * 0.52 - 3)
    .lineTo(-w * 0.05 + 0.5, bodyTop + (bodyBot - bodyTop) * 0.52 - 4)
    .lineTo(-w * 0.05 + 0.5, bodyTop + (bodyBot - bodyTop) * 0.52 + 4)
    .stroke({ width: 1.8, color: OUTLINE, cap: 'round', join: 'round' });
  g.roundRect(w / 2 - 7, bodyTop + 4, 5, 6, 2)
    .fill(0xfff27a)
    .stroke(stroke(1.8));
  shine(g, [
    [-w / 2 + 6, bodyTop + 3.5],
    [w * 0.2, bodyTop + 3.5],
  ]);
  // Button wheels.
  for (const x of [-w * 0.3, w * 0.3]) {
    g.circle(x, h / 2 - wr, wr)
      .fill(0x2b2438)
      .stroke(stroke(3));
    g.circle(x, h / 2 - wr, wr * 0.5).fill(0xe8e2f0);
    for (const [dx, dy] of [
      [-1, -1],
      [1, 1],
    ] as const)
      g.circle(x + dx * wr * 0.18, h / 2 - wr + dy * wr * 0.18, 1.1).fill(OUTLINE);
  }
}

function parachute(g: Graphics, def: ItemDef, w: number, h: number): void {
  const rimY = -h * 0.05;
  const knot: Pt = [0, h / 2 - 4];
  // The strings, behind the canopy.
  for (const x of [-w * 0.47, -w * 0.16, w * 0.16, w * 0.47])
    g.moveTo(x, rimY).lineTo(knot[0], knot[1]).stroke({ width: 1.3, color: OUTLINE });
  // The canopy: a dome with a scalloped hem, in stripes.
  const n = 4;
  const seg = w / n;
  const dome = (gg: Graphics): Graphics => {
    gg.moveTo(-w / 2, rimY).bezierCurveTo(-w / 2, -h * 0.7, w / 2, -h * 0.7, w / 2, rimY);
    for (let i = n - 1; i >= 0; i--) {
      const x0 = -w / 2 + (i + 1) * seg;
      gg.quadraticCurveTo(x0 - seg / 2, rimY - h * 0.14, x0 - seg, rimY);
    }
    return gg.closePath();
  };
  dome(g).fill(def.color);
  for (let i = 0; i < n; i += 2) {
    const x0 = -w / 2 + i * seg;
    g.moveTo(x0, rimY)
      .quadraticCurveTo(x0 + seg * 0.1, -h * 0.35, x0 + seg * 0.62 - (i === 0 ? seg * 0.1 : 0), -h / 2 + 3)
      .lineTo(x0 + seg + (i === 0 ? seg * 0.15 : seg * 0.05), -h / 2 + 3.5)
      .quadraticCurveTo(x0 + seg * 1.05, -h * 0.3, x0 + seg, rimY)
      .quadraticCurveTo(x0 + seg / 2, rimY - h * 0.14, x0, rimY)
      .fill(def.accent);
  }
  dome(g).stroke(stroke(3.5));
  shine(g, [
    [-w * 0.32, -h * 0.25],
    [-w * 0.12, -h * 0.41],
  ]);
  // The harness ring.
  g.circle(knot[0], knot[1], 3.5).fill(0xffd23f).stroke(stroke(2));
}

function balloonBasket(g: Graphics, def: ItemDef): void {
  const floor = partBox(def, 0);
  const wallL = partBox(def, 1);
  const wallR = partBox(def, 2);
  const ball = partBox(def, 3);
  const R = ball.w / 2;
  const bx = ball.x + R;
  const by = ball.y + R;
  // Ropes from the balloon's bottom to the basket's rim.
  const rimY = wallL.y + 4;
  for (const [x0, x1] of [
    [-R * 0.55, wallL.x + wallL.w / 2],
    [-R * 0.18, -floor.w * 0.18],
    [R * 0.18, floor.w * 0.18],
    [R * 0.55, wallR.x + wallR.w / 2],
  ] as const)
    g.moveTo(bx + x0, by + R * 0.82)
      .lineTo(x1, rimY)
      .stroke({ width: 4, color: OUTLINE, cap: 'round' })
      .moveTo(bx + x0, by + R * 0.82)
      .lineTo(x1, rimY)
      .stroke({ width: 1.8, color: 0xf4ead2, cap: 'round' });
  // The balloon, striped like a hot-air balloon.
  g.circle(bx, by, R).fill(def.accent);
  for (const k of [-0.5, 0.5])
    g.ellipse(bx + k * R * 0.9, by, R * 0.22, R * 0.97).fill(lighten(def.accent, 0.45));
  g.ellipse(bx, by, R * 0.24, R).fill(0xffd23f);
  g.circle(bx, by, R).stroke(stroke(5));
  g.ellipse(bx - R * 0.42, by - R * 0.45, R * 0.12, R * 0.22).fill({ color: 0xffffff, alpha: 0.8 });
  g.roundRect(bx - R * 0.35, by + R * 0.8, R * 0.7, R * 0.16, 4)
    .fill(darken(def.accent, 0.25))
    .stroke(stroke(3));
  // The basket: a matchbox tray, walls and floor where the physics has them.
  const top = wallL.y;
  const bottom = floor.y + floor.h;
  const left = wallL.x;
  const right = wallR.x + wallR.w;
  g.roundRect(left + wallL.w, top + 3, right - left - wallL.w * 2, bottom - top - floor.h, 2).fill({
    color: darken(0xf2dfb8, 0.12),
    alpha: 1,
  });
  g.roundRect(left, floor.y, right - left, floor.h, 3)
    .fill(def.color)
    .stroke(stroke(3.5));
  for (const p of [wallL, wallR])
    g.roundRect(p.x, p.y, p.w, p.h + floor.h * 0.5, 3)
      .fill(def.color)
      .stroke(stroke(3.5));
  // The matchbox's yellow band and flame, on the floor's face.
  g.rect(left + 6, floor.y + floor.h * 0.3, right - left - 12, floor.h * 0.4).fill(0xffd23f);
  g.moveTo(0, floor.y + 1)
    .quadraticCurveTo(4, floor.y + floor.h * 0.5, 0, floor.y + floor.h - 1)
    .quadraticCurveTo(-4, floor.y + floor.h * 0.5, 0, floor.y + 1)
    .fill(0xff7a2e);
}

function canPhone(g: Graphics, def: ItemDef): void {
  const a = partBox(def, 0);
  const b = partBox(def, 1);
  const line = partBox(def, 2);
  const y = line.y + line.h / 2;
  // The string, a little slack.
  g.moveTo(a.x + a.w - 4, y)
    .quadraticCurveTo(0, y + line.h * 2, b.x + 4, y)
    .stroke({ width: 4.5, color: OUTLINE, cap: 'round' })
    .moveTo(a.x + a.w - 4, y)
    .quadraticCurveTo(0, y + line.h * 2, b.x + 4, y)
    .stroke({ width: 2, color: 0xf4ead2, cap: 'round' });
  for (const p of [a, b]) canBody(g, def.color, def.accent, p.x + p.w / 2, p.y, p.w, p.h);
  // Little sound waves off the left can's label: it's a phone.
  for (const r of [5, 9])
    g.moveTo(a.x - 2, a.y + a.h * 0.5 - r)
      .arc(a.x - 2, a.y + a.h * 0.5, r, -Math.PI * 0.75, -Math.PI * 1.25, true)
      .stroke({ width: 1.6, color: OUTLINE, alpha: 0.5, cap: 'round' });
}

function magnetCrane(g: Graphics, def: ItemDef): void {
  const rod = partBox(def, 0);
  const mag = partBox(def, 1);
  const tipX = rod.x + rod.w - 4;
  const ry = rod.y + rod.h / 2;
  // The line from the rod's tip down to the magnet.
  g.moveTo(tipX, ry)
    .lineTo(mag.x + mag.w / 2, mag.y + 2)
    .stroke({ width: 3.5, color: OUTLINE, cap: 'round' })
    .moveTo(tipX, ry)
    .lineTo(mag.x + mag.w / 2, mag.y + 2)
    .stroke({ width: 1.5, color: 0xf4ead2, cap: 'round' });
  // The rod: a long stick, a grip, line guides, and a cotton-reel reel.
  g.roundRect(rod.x, rod.y, rod.w, rod.h, rod.h / 2)
    .fill(def.color)
    .stroke(stroke(3.5));
  g.roundRect(rod.x, rod.y - 1, rod.w * 0.2, rod.h + 2, rod.h / 2)
    .fill(0x4d7cff)
    .stroke(stroke(3));
  for (const t of [0.5, 0.75, 0.93])
    g.circle(rod.x + rod.w * t, rod.y - 1, 2.5).stroke({ width: 1.6, color: OUTLINE });
  shine(
    g,
    [
      [rod.x + rod.w * 0.22, rod.y + 3],
      [rod.x + rod.w * 0.9, rod.y + 3],
    ],
    1.6,
    0.65,
  );
  const reelX = rod.x + rod.w * 0.28;
  g.circle(reelX, ry + 9, 8)
    .fill(lighten(def.color, 0.2))
    .stroke(stroke(3));
  g.circle(reelX, ry + 9, 3.5)
    .fill(0xf4ead2)
    .stroke({ width: 1.5, color: OUTLINE });
  g.moveTo(reelX, ry + 9)
    .lineTo(reelX + 9, ry + 14)
    .stroke({ width: 2.5, color: OUTLINE, cap: 'round' });
  // The horseshoe magnet, poles down.
  const mw = mag.w;
  const mh = mag.h;
  const cx = mag.x + mw / 2;
  const arm = mw * 0.3;
  const archY = mag.y + mw / 2;
  const u = (gg: Graphics): Graphics =>
    gg
      .moveTo(mag.x, mag.y + mh)
      .lineTo(mag.x, archY)
      .arc(cx, archY, mw / 2, Math.PI, 0)
      .lineTo(mag.x + mw, mag.y + mh)
      .lineTo(mag.x + mw - arm, mag.y + mh)
      .lineTo(mag.x + mw - arm, archY)
      .arc(cx, archY, mw / 2 - arm, 0, Math.PI, true)
      .lineTo(mag.x + arm, mag.y + mh)
      .closePath();
  u(g).fill(def.accent).stroke(stroke(3.5));
  for (const x of [mag.x, mag.x + mw - arm])
    g.rect(x, mag.y + mh - 7, arm, 7)
      .fill(METAL)
      .stroke(stroke(2.5));
  g.moveTo(mag.x + 3, archY + 2)
    .arc(cx, archY, mw / 2 - 3, Math.PI * 1.05, Math.PI * 1.4)
    .stroke({ width: 1.8, color: 0xffffff, alpha: 0.7, cap: 'round' });
}

/** The pinwheel's hub, from the top of the box. */
export function pinwheelHub(w: number, h: number): { x: number; y: number; r: number } {
  const r = w / 2;
  return { x: 0, y: -h / 2 + r, r };
}

/** The pinwheel's stick, from the hub down. */
export function drawPinwheelStick(g: Graphics, w: number, h: number): void {
  const hub = pinwheelHub(w, h);
  g.roundRect(-3.5, hub.y, 7, h / 2 - hub.y, 3)
    .fill(0x6fbf4a)
    .stroke(stroke(3));
  shine(
    g,
    [
      [-1, hub.y + 6],
      [-1, h / 2 - 4],
    ],
    1.4,
    0.6,
  );
}

/** The pinwheel's four blades and pin around (cx, cy); `ItemSprite` draws them at 0, 0 to spin them. */
export function drawPinwheelWheel(g: Graphics, def: ItemDef, r: number, cx = 0, cy = 0): void {
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 - Math.PI / 4;
    const c = k % 2 === 0 ? def.color : def.accent;
    const at = (ang: number, d: number): [number, number] => [cx + Math.cos(ang) * d, cy + Math.sin(ang) * d];
    const tip = at(a, r);
    const back = at(a + Math.PI / 4, r * 0.72);
    const fold = at(a - 0.35, r * 0.4);
    g.poly([cx, cy, ...back, ...tip])
      .fill(c)
      .stroke(stroke(3));
    g.poly([cx, cy, ...tip, ...fold])
      .fill(lighten(c, 0.35))
      .stroke(stroke(3));
  }
  g.circle(cx, cy, r * 0.16)
    .fill(0xffd23f)
    .stroke(stroke(2.5));
  g.circle(cx - r * 0.05, cy - r * 0.05, r * 0.05).fill(0xffffff);
}

function discoBall(g: Graphics, def: ItemDef, r: number, seedN: number): void {
  // The hanging loop.
  g.circle(0, -r - 2, 3.5).stroke({ width: 4.5, color: OUTLINE });
  g.circle(0, -r - 2, 3.5).stroke({ width: 1.8, color: METAL_DARK });
  const R = r - 1;
  g.circle(0, 0, R).fill(darken(def.color, 0.45));
  // Rows of tiny square facets, squeezed toward the edges like on a sphere.
  const rows = 8;
  const cols = 9;
  for (let i = 0; i < rows; i++) {
    const la0 = -Math.PI / 2 + (i * Math.PI) / rows;
    const la1 = la0 + Math.PI / rows;
    const y0 = Math.sin(la0) * R;
    const y1 = Math.sin(la1) * R;
    const half = Math.cos((la0 + la1) / 2) * R;
    for (let j = 0; j < cols; j++) {
      const lo0 = -Math.PI / 2 + (j * Math.PI) / cols;
      const lo1 = lo0 + Math.PI / cols;
      const x0 = Math.sin(lo0) * half;
      const x1 = Math.sin(lo1) * half;
      if (x1 - x0 < 1.2 || y1 - y0 < 1.2) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const light = (-cx - cy) / (R * 1.6) + 0.45 + (hash01(seedN, i * 16 + j) - 0.5) * 0.5;
      const t = hash01(seedN, i * 16 + j + 200);
      const base = t > 0.85 ? def.accent : t > 0.75 ? 0x7fd4ff : def.color;
      const c =
        light > 0.5 ? lighten(base, Math.min(0.9, light - 0.4)) : darken(base, Math.min(0.5, 0.5 - light));
      g.rect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1).fill(c);
    }
  }
  g.circle(0, 0, R).stroke(stroke(3.5));
  twinkle(g, -R * 0.38, -R * 0.42, R * 0.38);
  twinkle(g, R * 0.42, R * 0.18, R * 0.2, 0.85);
  twinkle(g, -R * 0.1, R * 0.55, R * 0.14, 0.7);
}

function strawRocket(g: Graphics, def: ItemDef, w: number, h: number): void {
  const bw = w * 0.5;
  const noseH = h * 0.2;
  const top = -h / 2 + noseH;
  const bottom = h / 2 - 6;
  // Fins, behind the body.
  for (const s of [-1, 1])
    g.poly([s * bw * 0.4, bottom - h * 0.22, s * (w / 2), bottom + 2, s * bw * 0.4, bottom])
      .fill(def.accent)
      .stroke(stroke(3));
  // The striped straw body.
  g.roundRect(-bw / 2, top - 2, bw, bottom - top + 2, 3).fill(0xffffff);
  for (let y = top + 2; y < bottom; y += 14)
    g.poly([-bw / 2, y, bw / 2, y - 6, bw / 2, y, -bw / 2, y + 6]).fill(def.color);
  g.roundRect(-bw / 2, top - 2, bw, bottom - top + 2, 3).stroke(stroke(3.5));
  // A porthole.
  g.circle(0, top + h * 0.14, bw * 0.28)
    .fill(0x7fd4ff)
    .stroke(stroke(2.5));
  g.circle(-bw * 0.08, top + h * 0.14 - bw * 0.08, bw * 0.08).fill(0xffffff);
  // The paper nose cone.
  g.moveTo(-bw / 2 - 2, top)
    .quadraticCurveTo(-bw * 0.3, -h / 2 + noseH * 0.3, 0, -h / 2)
    .quadraticCurveTo(bw * 0.3, -h / 2 + noseH * 0.3, bw / 2 + 2, top)
    .closePath()
    .fill(def.accent)
    .stroke(stroke(3.5));
  // The open straw end at the bottom, where you blow.
  g.ellipse(0, bottom, bw / 2, 3)
    .fill(darken(def.color, 0.3))
    .stroke(stroke(2));
  shine(
    g,
    [
      [-bw * 0.25, top + 4],
      [-bw * 0.25, bottom - 6],
    ],
    1.8,
    0.6,
  );
}

function seesaw(g: Graphics, def: ItemDef): void {
  const plank = partBox(def, 0);
  const cork = partBox(def, 1);
  // The cork pivot, a little wider at the bottom.
  g.moveTo(cork.x + 3, cork.y)
    .lineTo(cork.x + cork.w - 3, cork.y)
    .lineTo(cork.x + cork.w, cork.y + cork.h)
    .lineTo(cork.x, cork.y + cork.h)
    .closePath()
    .fill(def.accent)
    .stroke(stroke(3.5));
  for (const [x, y] of [
    [0.3, 0.35],
    [0.65, 0.6],
    [0.4, 0.8],
    [0.75, 0.25],
  ] as const)
    g.circle(cork.x + cork.w * x, cork.y + cork.h * y, 1.3).fill(darken(def.accent, 0.35));
  g.ellipse(cork.x + cork.w / 2, cork.y + 2, cork.w / 2 - 3, 2.5).fill(lighten(def.accent, 0.25));
  // The popsicle-stick plank.
  g.roundRect(plank.x, plank.y, plank.w, plank.h, plank.h / 2)
    .fill(def.color)
    .stroke(stroke(3.5));
  for (const x of [-plank.w * 0.3, plank.w * 0.18])
    g.moveTo(x, plank.y + plank.h * 0.55)
      .lineTo(x + plank.w * 0.12, plank.y + plank.h * 0.45)
      .stroke({ width: 1.2, color: darken(def.color, 0.25) });
  shine(
    g,
    [
      [plank.x + 8, plank.y + 3],
      [plank.x + plank.w * 0.4, plank.y + 3],
    ],
    1.8,
    0.75,
  );
  // A seat bump at each end.
  for (const x of [plank.x + 12, plank.x + plank.w - 22])
    g.roundRect(x, plank.y - 5, 10, 6, 2)
      .fill(0xff7eb6)
      .stroke(stroke(2.5));
}

function spoonCatapult(g: Graphics, def: ItemDef): void {
  const handle = partBox(def, 0);
  const bowl = partBox(def, 1);
  const lipL = partBox(def, 2);
  const lipR = partBox(def, 3);
  const eraser = partBox(def, 4);
  // The pencil-eraser pivot.
  g.roundRect(eraser.x, eraser.y, eraser.w, eraser.h, 5).fill(def.accent).stroke(stroke(3.5));
  g.rect(eraser.x + 2, eraser.y + eraser.h * 0.55, eraser.w - 4, 3).fill(darken(def.accent, 0.2));
  shine(
    g,
    [
      [eraser.x + 4, eraser.y + 4],
      [eraser.x + 4, eraser.y + eraser.h * 0.45],
    ],
    1.8,
    0.6,
  );
  // The spoon: handle, then the bowl's cup between its two lips.
  g.roundRect(handle.x, handle.y, handle.w, handle.h, handle.h / 2)
    .fill(def.color)
    .stroke(stroke(3.5));
  const left = lipL.x;
  const right = lipR.x + lipR.w;
  const bottom = bowl.y + bowl.h;
  g.moveTo(left, lipL.y)
    .bezierCurveTo(left, bottom + 2, right, bottom + 2, right, lipR.y)
    .quadraticCurveTo((left + right) / 2, (lipL.y + lipR.y) / 2 + 6, left, lipL.y)
    .closePath()
    .fill(def.color)
    .stroke(stroke(3.5));
  // The hollow of the bowl, tilted toward us.
  g.moveTo(left + 4, lipL.y + 3)
    .quadraticCurveTo((left + right) / 2, (lipL.y + lipR.y) / 2 + 9, right - 4, lipR.y + 2)
    .quadraticCurveTo((left + right) / 2, bottom - 1, left + 4, lipL.y + 3)
    .fill(darken(def.color, 0.18));
  g.moveTo(left + 4, lipL.y + 6)
    .quadraticCurveTo(left + 6, bottom - 2, left + bowl.w * 0.35, bottom - 1)
    .stroke({ width: 1.8, color: 0xffffff, alpha: 0.85, cap: 'round' });
  shine(
    g,
    [
      [handle.x + 6, handle.y + 2.5],
      [handle.x + handle.w - 8, handle.y + 2.5],
    ],
    1.4,
    0.8,
  );
}

function trampoline(g: Graphics, def: ItemDef): void {
  const bed = partBox(def, 0);
  const legs = [partBox(def, 1), partBox(def, 2)];
  // Spring legs on little feet.
  for (const leg of legs) {
    const cx = leg.x + leg.w / 2;
    coil(g, cx, bed.y + bed.h, leg.y + leg.h - 4, leg.w * 0.45, 3, METAL);
    g.roundRect(leg.x - 2, leg.y + leg.h - 5, leg.w + 4, 5, 2)
      .fill(WOOD_DARK)
      .stroke(stroke(2.5));
  }
  // The tissue bed, puffy, on a popsicle-stick frame.
  g.roundRect(bed.x, bed.y, bed.w, bed.h, 3).fill(WOOD).stroke(stroke(3.5));
  g.moveTo(bed.x + 10, bed.y + 1)
    .quadraticCurveTo(0, bed.y - 6, bed.x + bed.w - 10, bed.y + 1)
    .lineTo(bed.x + bed.w - 10, bed.y + bed.h - 2)
    .lineTo(bed.x + 10, bed.y + bed.h - 2)
    .closePath()
    .fill(def.color)
    .stroke(stroke(3));
  // Pink stitching along the tissue.
  for (let x = bed.x + 16; x < bed.x + bed.w - 14; x += 9)
    g.moveTo(x, bed.y + bed.h * 0.5)
      .lineTo(x + 4, bed.y + bed.h * 0.5)
      .stroke({ width: 1.6, color: def.accent, cap: 'round' });
  for (const x of [bed.x + 5, bed.x + bed.w - 5]) g.circle(x, bed.y + bed.h / 2, 1.6).fill(darken(WOOD, 0.4));
}

// --- Wearables -----------------------------------------------------------------

function hatPropeller(g: Graphics, def: ItemDef, w: number, h: number): void {
  const bottom = h / 2 - 2;
  const top = -h / 2 + 9;
  // The propeller on its stem.
  g.rect(-1.5, -h / 2 + 3, 3, top - (-h / 2 + 3) + 2).fill(OUTLINE);
  for (const s of [-1, 1])
    g.ellipse(s * w * 0.2, -h / 2 + 3, w * 0.2, 3)
      .fill(s < 0 ? 0xe8453c : 0x6fbf4a)
      .stroke(stroke(2.5));
  g.circle(0, -h / 2 + 3, 2.5)
    .fill(def.accent)
    .stroke(stroke(2));
  // The visor, then the cap's dome in alternating panels.
  g.ellipse(w * 0.18, bottom - 1, w * 0.32, 3.5)
    .fill(darken(def.color, 0.2))
    .stroke(stroke(3));
  const dome = (gg: Graphics): Graphics =>
    gg
      .moveTo(-w * 0.4, bottom)
      .bezierCurveTo(-w * 0.42, top - 4, w * 0.42, top - 4, w * 0.4, bottom)
      .closePath();
  dome(g).fill(def.color);
  g.moveTo(-w * 0.13, bottom)
    .quadraticCurveTo(-w * 0.12, top + 2, 0, top + 1)
    .quadraticCurveTo(w * 0.12, top + 2, w * 0.13, bottom)
    .closePath()
    .fill(def.accent);
  dome(g).stroke(stroke(3.5));
  shine(g, [
    [-w * 0.3, bottom - 4],
    [-w * 0.22, top + 5],
  ]);
}

function hatViking(g: Graphics, def: ItemDef, w: number, h: number): void {
  // Two seed horns curving up and out.
  for (const s of [-1, 1]) {
    const bx = s * w * 0.2;
    const by = h * 0.1;
    g.moveTo(bx, by + 6)
      .quadraticCurveTo(s * w * 0.52, by + 6, s * w * 0.46, -h / 2 + 2)
      .quadraticCurveTo(s * w * 0.3, by - 4, bx, by - 6)
      .closePath()
      .fill(def.accent)
      .stroke(stroke(3));
    g.moveTo(s * w * 0.33, by - 1)
      .lineTo(s * w * 0.37, by - 6)
      .stroke({ width: 1.2, color: darken(def.accent, 0.3) });
  }
  thimbleBody(g, def.color, lighten(def.color, 0.15), w * 0.5, -h / 2 + 4, h / 2 - 1);
}

function hatBeanie(g: Graphics, def: ItemDef, w: number, h: number): void {
  const pom = h * 0.2;
  const top = -h / 2 + pom * 1.4;
  const cuff = h * 0.28;
  const bottom = h / 2;
  // The knit dome.
  g.moveTo(-w * 0.44, bottom - cuff + 2)
    .bezierCurveTo(-w * 0.46, top - 4, w * 0.46, top - 4, w * 0.44, bottom - cuff + 2)
    .closePath()
    .fill(def.color)
    .stroke(stroke(3.5));
  for (let i = -2; i <= 2; i++) {
    const x = i * w * 0.14;
    for (let y = bottom - cuff - 4; y > top + 3 + Math.abs(i) * 2; y -= 5)
      g.moveTo(x - 2, y - 2)
        .lineTo(x, y)
        .lineTo(x + 2, y - 2)
        .stroke({ width: 1.1, color: darken(def.color, 0.25), cap: 'round', join: 'round' });
  }
  // The ribbed cuff.
  g.roundRect(-w / 2, bottom - cuff, w, cuff, 4)
    .fill(def.accent)
    .stroke(stroke(3.5));
  for (let x = -w / 2 + 5; x < w / 2 - 2; x += 4)
    g.moveTo(x, bottom - cuff + 3)
      .lineTo(x, bottom - 3)
      .stroke({ width: 1, color: darken(def.accent, 0.2) });
  // The pom-pom.
  g.circle(0, -h / 2 + pom, pom)
    .fill(def.accent)
    .stroke(stroke(3));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(Math.cos(a) * pom * 0.3, -h / 2 + pom + Math.sin(a) * pom * 0.3)
      .lineTo(Math.cos(a) * pom * 0.75, -h / 2 + pom + Math.sin(a) * pom * 0.75)
      .stroke({ width: 1, color: darken(def.accent, 0.2) });
  }
  shine(g, [
    [-w * 0.32, bottom - cuff - 3],
    [-w * 0.2, top + 3],
  ]);
}

function hatPirate(g: Graphics, def: ItemDef, w: number, h: number): void {
  const bottom = h / 2 - 1;
  const shape = (gg: Graphics): Graphics =>
    gg
      .moveTo(-w / 2, bottom - 4)
      .quadraticCurveTo(-w * 0.3, -h * 0.05, 0, -h / 2)
      .quadraticCurveTo(w * 0.3, -h * 0.05, w / 2, bottom - 4)
      .quadraticCurveTo(0, bottom + 2, -w / 2, bottom - 4)
      .closePath();
  shape(g).fill(def.color).stroke(stroke(3.5));
  // The folded brim along the bottom.
  g.moveTo(-w * 0.4, bottom - 6)
    .quadraticCurveTo(0, bottom - 11, w * 0.4, bottom - 6)
    .stroke({ width: 1.6, color: lighten(def.color, 0.3) });
  shine(
    g,
    [
      [-w * 0.3, bottom - 9],
      [-w * 0.1, -h * 0.25],
    ],
    1.6,
    0.4,
  );
  // The skull-ish button face.
  const fy = -h * 0.02;
  const fr = h * 0.24;
  g.circle(0, fy, fr).fill(def.accent).stroke(stroke(2));
  g.circle(-fr * 0.35, fy - fr * 0.1, fr * 0.22).fill(OUTLINE);
  g.circle(fr * 0.35, fy - fr * 0.1, fr * 0.22).fill(OUTLINE);
  g.moveTo(-fr * 0.35, fy + fr * 0.45)
    .lineTo(fr * 0.35, fy + fr * 0.45)
    .stroke({ width: 1.3, color: OUTLINE, cap: 'round' });
  for (const s of [-1, 1])
    g.moveTo(s * fr * 1.3, fy + fr * 1.1)
      .lineTo(-s * fr * 0.0 + s * fr * 0.9, fy + fr * 0.7)
      .stroke({ width: 1.6, color: def.accent, cap: 'round' });
}

function googlyGlasses(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const r = h / 2 - 1;
  const lx = -w / 2 + r + 2;
  const rx = w / 2 - r - 2;
  // The bridge and the folded arms.
  g.moveTo(lx + r * 0.6, -h * 0.15)
    .quadraticCurveTo(0, -h * 0.4, rx - r * 0.6, -h * 0.15)
    .stroke({ width: 5, color: OUTLINE, cap: 'round' })
    .moveTo(lx + r * 0.6, -h * 0.15)
    .quadraticCurveTo(0, -h * 0.4, rx - r * 0.6, -h * 0.15)
    .stroke({ width: 2, color: def.accent === OUTLINE ? 0x6b6280 : lighten(def.accent, 0.3), cap: 'round' });
  const look = hash01(seedN, 1) * Math.PI * 2;
  googly(g, lx, 0, r, Math.cos(look), Math.sin(look));
  googly(g, rx, 0, r, Math.cos(look + 2), Math.sin(look + 2));
  for (const x of [lx, rx]) g.circle(x, 0, r).stroke({ width: 2.5, color: def.accent });
}

function snorkel(g: Graphics, def: ItemDef, w: number, h: number): void {
  const pts: Pt[] = [
    [-w * 0.15, -h / 2 + 4],
    [-w * 0.15, h * 0.22],
    [-w * 0.08, h / 2 - 9],
    [w * 0.15, h / 2 - 9],
  ];
  wire(g, pts, 8, def.color, 3);
  // Stripes on the straw.
  for (let y = -h / 2 + 10; y < h * 0.2; y += 10)
    g.moveTo(-w * 0.15 - 4, y + 2)
      .lineTo(-w * 0.15 + 4, y - 2)
      .stroke({ width: 2.2, color: 0xffffff, alpha: 0.85 });
  // The mouthpiece and the open top.
  g.roundRect(w * 0.05, h / 2 - 16, w * 0.45 - 1, 14, 5)
    .fill(def.accent)
    .stroke(stroke(3));
  g.ellipse(-w * 0.15, -h / 2 + 4, 5, 2.5)
    .fill(darken(def.color, 0.45))
    .stroke(stroke(2));
}

function headlamp(g: Graphics, def: ItemDef, w: number, h: number): void {
  // The elastic band, lying in a loop.
  g.ellipse(0, h * 0.1, w / 2 - 3, h * 0.32).stroke({ width: 8, color: OUTLINE });
  g.ellipse(0, h * 0.1, w / 2 - 3, h * 0.32).stroke({ width: 4, color: def.color });
  g.moveTo(-w * 0.35, h * 0.0)
    .quadraticCurveTo(-w * 0.2, -h * 0.17, 0, -h * 0.2)
    .stroke({ width: 1.3, color: lighten(def.color, 0.4), alpha: 0.9 });
  // The lamp: a glow bead in a little housing.
  const r = h * 0.38;
  g.roundRect(-r - 3, -r + 2, r * 2 + 6, r * 2, 4)
    .fill(0x6b6280)
    .stroke(stroke(3));
  g.circle(0, 2, r).fill(def.accent).stroke(stroke(2.5));
  g.circle(-r * 0.3, 2 - r * 0.3, r * 0.3).fill(0xffffff);
}

function rollerSkates(g: Graphics, def: ItemDef, w: number, h: number): void {
  const sw = w * 0.46;
  for (const cx of [-w / 2 + sw / 2, w / 2 - sw / 2]) {
    const top = -h / 2 + 2;
    const capH = h * 0.58;
    // Two wheels under each cap.
    for (const dx of [-sw * 0.28, sw * 0.28])
      g.circle(cx + dx, h / 2 - 4, 4)
        .fill(0xfff27a)
        .stroke(stroke(2.5));
    g.roundRect(cx - sw / 2, top, sw, capH, 4)
      .fill(def.color)
      .stroke(stroke(3));
    for (let x = cx - sw / 2 + 4; x < cx + sw / 2 - 2; x += 4)
      g.moveTo(x, top + capH * 0.45)
        .lineTo(x, top + capH - 2)
        .stroke({ width: 1.2, color: darken(def.color, 0.3) });
    // The strap.
    g.roundRect(cx - sw / 2 + 2, top + 1, sw - 4, capH * 0.32, 2)
      .fill(def.accent)
      .stroke({ width: 1.8, color: OUTLINE });
    g.circle(cx + sw * 0.2, top + 1 + capH * 0.16, 1.5).fill(METAL);
  }
}

function leafCape(g: Graphics, def: ItemDef, w: number, h: number): void {
  const x0 = -w / 2 + 8;
  const leaf = leafPoly(x0, 0, w - 9, h * 1.6, 0);
  g.poly(leaf).fill(def.color).stroke(stroke(3));
  g.moveTo(x0, 0)
    .lineTo(w / 2 - 4, 0)
    .stroke({ width: 1.4, color: darken(def.color, 0.3) });
  for (let i = 1; i < 6; i++) {
    const x = x0 + ((w - 12) * i) / 6;
    for (const s of [-1, 1])
      g.moveTo(x, 0)
        .lineTo(x + 7, s * h * 0.45)
        .stroke({ width: 1, color: darken(def.color, 0.25) });
  }
  shine(
    g,
    [
      [x0 + 10, -h * 0.35],
      [x0 + w * 0.35, -h * 0.45],
    ],
    1.5,
    0.5,
  );
  // The string tie, in a bow at the stem.
  for (const s of [-1, 1])
    g.ellipse(-w / 2 + 5, s * 3.5, 4, 2.6)
      .fill(def.accent)
      .stroke(stroke(2));
  g.circle(-w / 2 + 7, 0, 2.2)
    .fill(def.accent)
    .stroke(stroke(2));
}

function crownPoints(w: number, h: number): number[] {
  const bottom = h / 2;
  return [
    -w / 2 + 2,
    bottom,
    -w / 2,
    -h * 0.25,
    -w * 0.28,
    h * 0.02,
    -w * 0.18,
    -h / 2,
    0,
    -h * 0.02,
    w * 0.18,
    -h / 2 + 1,
    w * 0.28,
    h * 0.02,
    w / 2,
    -h * 0.3,
    w / 2 - 2,
    bottom,
  ];
}

function foilCrown(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const pts = crownPoints(w, h);
  g.poly(pts).fill(def.color);
  // Crinkles: facets of light and shade.
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / 7;
    const t = hash01(seedN, i);
    g.poly([x - 4, h / 2 - 2, x + 3, -h * 0.05 + t * 6, x + 6, h / 2 - 2]).fill({
      color: t > 0.5 ? 0xffffff : darken(def.color, 0.25),
      alpha: 0.6,
    });
  }
  g.poly(pts).stroke(stroke(3.5));
  // The band and its gem.
  g.moveTo(-w / 2 + 2, h * 0.25)
    .lineTo(w / 2 - 2, h * 0.25)
    .stroke({ width: 1.5, color: darken(def.color, 0.3) });
  g.circle(0, h * 0.2, h * 0.15)
    .fill(def.accent)
    .stroke(stroke(2));
  g.circle(-1.2, h * 0.2 - 1.2, 1.2).fill(0xffffff);
  twinkle(g, -w * 0.18, -h * 0.32, 4);
  twinkle(g, w * 0.18, -h * 0.32, 3, 0.8);
}

function backpack(g: Graphics, def: ItemDef, w: number, h: number): void {
  // Straps looping out of the sides.
  for (const s of [-1, 1])
    g.moveTo(s * w * 0.3, -h * 0.3)
      .quadraticCurveTo(s * w * 0.62, -h * 0.05, s * w * 0.3, h * 0.35)
      .stroke({ width: 7, color: OUTLINE, cap: 'round' })
      .moveTo(s * w * 0.3, -h * 0.3)
      .quadraticCurveTo(s * w * 0.62, -h * 0.05, s * w * 0.3, h * 0.35)
      .stroke({ width: 3, color: def.accent, cap: 'round' });
  // The matchbox body and its flap.
  const bw = w * 0.76;
  g.roundRect(-bw / 2, -h / 2 + 2, bw, h - 3, 5)
    .fill(def.color)
    .stroke(stroke(3.5));
  g.rect(-bw / 2 + 2.5, h * 0.12, bw - 5, h * 0.14).fill(0xffd23f);
  g.moveTo(-bw / 2, -h / 2 + 4)
    .lineTo(-bw / 2, -h * 0.05)
    .quadraticCurveTo(0, h * 0.08, bw / 2, -h * 0.05)
    .lineTo(bw / 2, -h / 2 + 4)
    .stroke(stroke(3));
  g.roundRect(-3.5, -h * 0.06, 7, 6, 2)
    .fill(def.accent)
    .stroke(stroke(2));
  // A carry loop on top.
  g.moveTo(-5, -h / 2 + 2)
    .quadraticCurveTo(0, -h / 2 - 5, 5, -h / 2 + 2)
    .stroke({ width: 2.5, color: OUTLINE, cap: 'round' });
  shine(g, [
    [-bw / 2 + 4, -h / 2 + 6],
    [-bw / 2 + 4, -h * 0.12],
  ]);
}

// --- Instruments ---------------------------------------------------------------

function kazoo(g: Graphics, def: ItemDef, w: number, h: number): void {
  const body = (gg: Graphics): Graphics =>
    gg
      .moveTo(-w / 2 + 3, -h * 0.22)
      .lineTo(w * 0.25, -h / 2 + 1)
      .quadraticCurveTo(w / 2, -h / 2, w / 2, 0)
      .quadraticCurveTo(w / 2, h / 2, w * 0.25, h / 2 - 1)
      .lineTo(-w / 2 + 3, h * 0.22)
      .closePath();
  body(g).fill(def.color);
  // Comb teeth showing along the bottom, and a paper wrap round the middle.
  for (let x = -w * 0.35; x < w * 0.3; x += 4)
    g.moveTo(x, h * 0.12)
      .lineTo(x, h * 0.3)
      .stroke({ width: 1.1, color: darken(def.color, 0.35) });
  g.rect(-w * 0.12, -h / 2 + 2, w * 0.24, h - 4).fill(def.accent);
  body(g).stroke(stroke(3.5));
  g.moveTo(-w * 0.12, -h * 0.32)
    .lineTo(-w * 0.12, h * 0.32)
    .moveTo(w * 0.12, -h * 0.4)
    .lineTo(w * 0.12, h * 0.4)
    .stroke({ width: 1.4, color: OUTLINE });
  // The buzz hole and the mouthpiece end.
  g.circle(w * 0.3, -h * 0.05, h * 0.18)
    .fill(0xfff8e6)
    .stroke(stroke(2));
  g.ellipse(-w / 2 + 3, 0, 2.5, h * 0.22).fill(darken(def.color, 0.45));
  shine(
    g,
    [
      [-w * 0.4, -h * 0.12],
      [-w * 0.18, -h * 0.25],
    ],
    1.6,
    0.7,
  );
}

function bandHarp(g: Graphics, def: ItemDef, w: number, h: number): void {
  g.roundRect(-w / 2, -h / 2, w, h, 5)
    .fill(def.color)
    .stroke(stroke(3.5));
  g.rect(-w / 2 + 3, h * 0.22, w - 6, h * 0.14).fill(0xffd23f);
  // The sound hole, then the bridges and five bands across it.
  g.circle(0, -h * 0.02, h * 0.26)
    .fill(darken(def.color, 0.55))
    .stroke(stroke(2));
  for (const x of [-w * 0.38, w * 0.38])
    g.roundRect(x - 2.5, -h * 0.4, 5, h * 0.62, 2)
      .fill(WOOD)
      .stroke(stroke(2));
  for (let i = 0; i < 5; i++) {
    const y = -h * 0.32 + (i * h * 0.46) / 4;
    g.moveTo(-w / 2 + 2, y)
      .lineTo(w / 2 - 2, y)
      .stroke({ width: 3.6, color: OUTLINE, cap: 'round' })
      .moveTo(-w / 2 + 2, y)
      .lineTo(w / 2 - 2, y)
      .stroke({ width: 1.8, color: def.accent, cap: 'round' });
  }
  shine(
    g,
    [
      [-w / 2 + 4, h * 0.42],
      [-w * 0.1, h * 0.42],
    ],
    1.6,
    0.5,
  );
}

function canBass(g: Graphics, def: ItemDef, w: number, h: number): void {
  const canH = h * 0.58;
  const canTop = h / 2 - canH;
  const cw = w * 0.8;
  const cx = w / 2 - cw / 2;
  // The neck: a popsicle stick standing on the can.
  const sx = -w / 2 + 5;
  g.roundRect(sx - 3.5, -h / 2, 7, canTop - -h / 2 + 8, 3)
    .fill(0xf2c98a)
    .stroke(stroke(3));
  canBody(g, def.color, 0x4d7cff, cx, canTop, cw, canH);
  // The rubber band from the neck's tip to the can's lid.
  wire(
    g,
    [
      [sx + 1, -h / 2 + 4],
      [cx + 2, canTop + 3],
    ],
    2,
    def.accent,
    2,
  );
  g.circle(cx + 2, canTop + 3, 2.5)
    .fill(def.accent)
    .stroke(stroke(1.8));
  g.circle(sx, -h / 2 + 4, 2.5)
    .fill(def.accent)
    .stroke(stroke(1.8));
}

function thimbleDrum(g: Graphics, def: ItemDef, w: number, h: number): void {
  const top = -h / 2 + 5;
  const bottom = h / 2;
  // The thimble turned open side up, with a balloon skin over the mouth.
  const tw = w / 2;
  const bw = w * 0.36;
  g.moveTo(-tw, top)
    .lineTo(-bw, bottom - 6)
    .quadraticCurveTo(0, bottom + 1, bw, bottom - 6)
    .lineTo(tw, top)
    .closePath()
    .fill(def.color)
    .stroke(stroke(3.5));
  for (let row = 0; row < 3; row++) {
    const y = top + 8 + row * 6;
    const half = tw - 4 - row * 2;
    for (let x = -half + (row % 2 ? 3 : 0); x <= half; x += 6)
      g.circle(x, y, 1.1).fill(darken(def.color, 0.3));
  }
  shine(g, [
    [-tw + 5, top + 6],
    [-bw + 2, bottom - 9],
  ]);
  g.ellipse(0, top, tw + 1, 5)
    .fill(def.accent)
    .stroke(stroke(3));
  g.ellipse(-tw * 0.3, top - 1, tw * 0.3, 1.5).fill({ color: 0xffffff, alpha: 0.6 });
  // The tied band under the skin.
  g.moveTo(-tw + 1, top + 4)
    .quadraticCurveTo(0, top + 8, tw - 1, top + 4)
    .stroke({ width: 2, color: darken(def.accent, 0.3) });
}

// --- Dispatch ---------------------------------------------------------------------

/** Draw an M8 item. Returns false when the art is not one of M8's. */
export function drawItemArt8(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): boolean {
  const r = w / 2;
  switch (def.art) {
    case 'string':
      string(g, def, w, h);
      return true;
    case 'balloon':
      balloon(g, def, r);
      return true;
    case 'balloon_scrap':
      balloonScrap(g, def, w, h);
      return true;
    case 'maple_seed':
      mapleSeed(g, def, w, h);
      return true;
    case 'thimble':
      thimble(g, def, w, h);
      return true;
    case 'comb':
      comb(g, def, w, h);
      return true;
    case 'glass_bead':
      glassBead(g, def, r);
      return true;
    case 'paint_drop':
      paintDrop(g, def, w, h, seedN);
      return true;
    case 'ant_crumb':
      antCrumb(g, def, r, seedN);
      return true;
    case 'popcorn_kernel':
      popcornKernel(g, def, r);
      return true;
    case 'popcorn':
      popcorn(g, def, r);
      return true;
    case 'hat_mushroom':
      hatMushroom(g, def, w, h, seedN);
      return true;
    case 'eggshell_bit':
      eggshellBit(g, def, w, h);
      return true;
    case 'junk_blob':
      junkBlob(g, def, r, seedN);
      return true;
    case 'blueprint':
      blueprint(g, def, w, h);
      return true;
    case 'potion':
      drawPotion(g, def, w, h, def.color);
      return true;
    case 'sprout':
      sprout(g, def, w, h);
      return true;
    case 'slingshot':
      slingshot(g, def, w, h);
      return true;
    case 'spring_launcher':
      springLauncher(g, def, w, h);
      return true;
    case 'matchbox_racer':
      matchboxRacer(g, def, w, h);
      return true;
    case 'parachute':
      parachute(g, def, w, h);
      return true;
    case 'balloon_basket':
      balloonBasket(g, def);
      return true;
    case 'can_phone':
      canPhone(g, def);
      return true;
    case 'magnet_crane':
      magnetCrane(g, def);
      return true;
    case 'pinwheel': {
      // Standalone, the wheel is drawn in place; `ItemSprite` spins its own.
      drawPinwheelStick(g, w, h);
      const hub = pinwheelHub(w, h);
      drawPinwheelWheel(g, def, hub.r, hub.x, hub.y);
      return true;
    }
    case 'disco_ball':
      discoBall(g, def, r, seedN);
      return true;
    case 'straw_rocket':
      strawRocket(g, def, w, h);
      return true;
    case 'seesaw':
      seesaw(g, def);
      return true;
    case 'spoon_catapult':
      spoonCatapult(g, def);
      return true;
    case 'trampoline':
      trampoline(g, def);
      return true;
    case 'hat_propeller':
      hatPropeller(g, def, w, h);
      return true;
    case 'hat_viking':
      hatViking(g, def, w, h);
      return true;
    case 'hat_beanie':
      hatBeanie(g, def, w, h);
      return true;
    case 'hat_pirate':
      hatPirate(g, def, w, h);
      return true;
    case 'googly_glasses':
      googlyGlasses(g, def, w, h, seedN);
      return true;
    case 'snorkel':
      snorkel(g, def, w, h);
      return true;
    case 'headlamp':
      headlamp(g, def, w, h);
      return true;
    case 'roller_skates':
      rollerSkates(g, def, w, h);
      return true;
    case 'leaf_cape':
      leafCape(g, def, w, h);
      return true;
    case 'foil_crown':
      foilCrown(g, def, w, h, seedN);
      return true;
    case 'backpack':
      backpack(g, def, w, h);
      return true;
    case 'kazoo':
      kazoo(g, def, w, h);
      return true;
    case 'band_harp':
      bandHarp(g, def, w, h);
      return true;
    case 'can_bass':
      canBass(g, def, w, h);
      return true;
    case 'thimble_drum':
      thimbleDrum(g, def, w, h);
      return true;
    default:
      return false;
  }
}

/** Trace an M8 item's silhouette (no fill). Returns false when it has none of its own. */
export function outlineItemArt8(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): boolean {
  const r = w / 2;
  switch (def.art) {
    case 'glass_bead':
    case 'ant_crumb':
    case 'disco_ball':
      g.circle(0, 0, r * 1.02);
      return true;
    case 'balloon':
      balloonPath(g, r);
      g.poly([-r * 0.13, r * 1.0, r * 0.13, r * 1.0, 0, r * 0.84]);
      return true;
    case 'popcorn_kernel':
      kernelPath(g, r);
      return true;
    case 'popcorn':
      for (const [x, y, rr] of puffs(r)) g.circle(x, y, rr);
      return true;
    case 'junk_blob':
      g.poly(blobPoints(r, seedN));
      return true;
    case 'paint_drop':
      dropPath(g, w, h);
      return true;
    case 'hat_mushroom':
      hatMushroomPath(g, w, h);
      return true;
    case 'eggshell_bit':
      g.poly(eggshellBitPoly(w, h));
      return true;
    case 'string':
    case 'comb':
    case 'leaf_cape':
      g.roundRect(-w / 2, -h / 2, w, h, h / 2);
      return true;
    case 'thimble':
      thimblePath(g, w * 0.92, -h / 2 + 1, h / 2 - 1);
      return true;
    case 'potion':
      bottlePath(g, w, h);
      g.roundRect(-w * 0.2, -h / 2, w * 0.4, 8, 2);
      return true;
    case 'pinwheel': {
      const hub = pinwheelHub(w, h);
      g.circle(hub.x, hub.y, hub.r).rect(-3.5, hub.y, 7, h / 2 - hub.y);
      return true;
    }
    case 'foil_crown':
      g.poly(crownPoints(w, h));
      return true;
    case 'balloon_basket': {
      const ball = partBox(def, 3);
      g.circle(ball.x + ball.w / 2, ball.y + ball.w / 2, ball.w / 2);
      for (const p of partsPx(def).slice(0, 3)) g.poly(rotRect(p.x, p.y, p.width, p.height, p.angle));
      return true;
    }
    case 'can_phone':
    case 'magnet_crane':
    case 'seesaw':
    case 'spoon_catapult':
    case 'trampoline':
      for (const p of partsPx(def)) g.poly(rotRect(p.x, p.y, p.width, p.height, p.angle));
      return true;
    default:
      return false;
  }
}
