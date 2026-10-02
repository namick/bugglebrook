import type { Graphics } from 'pixi.js';
import type { ItemArt, ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { hash01 } from '../bugPose';

/**
 * Art for M11's hats and accessories. Each drawer fills the item's collider,
 * centered on the origin; `w` and `h` are its size in pixels. Hats stand
 * crown up with their opening along the bottom edge, which is what rests
 * on a bug's head. Face and back things are drawn from the front.
 */

type Pt = readonly [number, number];
type Circle = readonly [number, number, number];

/** Every art key this file draws. */
export const M11_ARTS: readonly ItemArt[] = [
  'hat_acorn',
  'hat_party',
  'hat_petal',
  'hat_top',
  'hat_chef',
  'hat_wizard',
  'hat_candle',
  'hat_eggshell',
  'hat_goo',
  'hat_bubble',
  'sunglasses',
  'mustache',
  'monocle',
  'bowtie',
  'scarf',
  'bandaid',
];

const METAL = 0xc7d3e3;

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

/**
 * Circles merged into one outlined lump: every circle's outline goes down
 * first, then every fill over them, so only the outer edge shows.
 */
function blobs(g: Graphics, circles: readonly Circle[], color: number, edge = 3.5): void {
  for (const [x, y, r] of circles) g.circle(x, y, r).stroke(stroke(edge * 2));
  for (const [x, y, r] of circles) g.circle(x, y, r).fill(color);
}

/** Points along a polyline at even steps of `t`, with radii eased between the given ones. */
function strand(pts: readonly Pt[], radii: readonly number[], per = 4): Circle[] {
  const out: Circle[] = [];
  for (let i = 0; i < pts.length - 1; i++)
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, radii[i]! + (radii[i + 1]! - radii[i]!) * t]);
    }
  const last = pts[pts.length - 1]!;
  out.push([last[0], last[1], radii[radii.length - 1]!]);
  return out;
}

/** A petal (or any long oval) from a base point, `len` long and `wid` wide, turned by `a`. */
function petalPoly(x: number, y: number, len: number, wid: number, a: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // A rounder tip than base: an egg, base at the origin.
    const u = (1 - Math.cos(t)) / 2;
    const off = Math.sin(t) * wid * 0.5 * (0.55 + 0.45 * u);
    const along = u * len;
    pts.push(x + c * along - s * off, y + s * along + c * off);
  }
  return pts;
}

/** The upper part of an ellipse from angle `from` round over the top to `to` (y down), as points. */
function arcPts(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 24): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

// --- Hats -------------------------------------------------------------------

/** The acorn cap's cup: a low dome, its bottom bowed up a little. */
function acornCupPath(g: Graphics, w: number, top: number, bottom: number): Graphics {
  const c = bottom + (top - bottom) / 0.75;
  return g
    .moveTo(-w / 2, bottom)
    .bezierCurveTo(-w / 2, c, w / 2, c, w / 2, bottom)
    .quadraticCurveTo(0, bottom - (bottom - top) * 0.18, -w / 2, bottom)
    .closePath();
}

function hatAcorn(g: Graphics, def: ItemDef, w: number, h: number): void {
  const top = -h / 2 + h * 0.24;
  const bottom = h / 2 - 1;
  // The stubby stem, leaning a little.
  g.moveTo(-w * 0.05, top + 3)
    .lineTo(-w * 0.02, -h / 2 + 2)
    .quadraticCurveTo(w * 0.06, -h / 2 - 1, w * 0.09, -h / 2 + 3)
    .lineTo(w * 0.06, top + 3)
    .closePath()
    .fill(def.accent)
    .stroke(stroke(3));
  acornCupPath(g, w, top, bottom).fill(def.color).stroke(stroke(3.5));
  // The scaly weave: rows of little arcs, staggered, inside the dome.
  const dark = darken(def.color, 0.35);
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const t = (row + 0.6) / (rows + 0.4);
    const y = top + (bottom - top) * t;
    const half = (w / 2) * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) - 4;
    const step = Math.max(5, w * 0.11);
    const n = Math.floor((half * 2) / step);
    const x0 = -((n - 1) * step) / 2 + (row % 2 ? step / 2 : 0);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      if (Math.abs(x) > half) continue;
      g.moveTo(x - step * 0.4, y - 1)
        .quadraticCurveTo(x, y + step * 0.45, x + step * 0.4, y - 1)
        .stroke({ width: 1.4, color: dark, cap: 'round' });
    }
  }
  // The rim, a shade lighter, along the bottom.
  g.moveTo(-w / 2 + 2, bottom - 2)
    .quadraticCurveTo(0, bottom - (bottom - top) * 0.3, w / 2 - 2, bottom - 2)
    .stroke({ width: 2, color: lighten(def.color, 0.3), cap: 'round' });
  shine(g, [
    [-w * 0.34, bottom - (bottom - top) * 0.45],
    [-w * 0.2, top + (bottom - top) * 0.12],
  ]);
}

function partyCone(w: number, h: number): { apex: number; base: number; half: number } {
  const pom = Math.min(w, h) * 0.17;
  return { apex: -h / 2 + pom * 1.7, base: h / 2 - 2, half: w * 0.46 };
}

function partyConePath(g: Graphics, w: number, h: number): Graphics {
  const { apex, base, half } = partyCone(w, h);
  return g
    .moveTo(-half, base)
    .lineTo(0, apex)
    .lineTo(half, base)
    .quadraticCurveTo(0, base + h * 0.06, -half, base)
    .closePath();
}

function hatParty(g: Graphics, def: ItemDef, w: number, h: number): void {
  const { apex, base, half } = partyCone(w, h);
  partyConePath(g, w, h).fill(def.color);
  // Slanted stripes, each running edge to edge.
  const hw = (y: number): number => (half * (y - apex)) / (base - apex);
  const slant = h * 0.1;
  const band = h * 0.075;
  for (let y = apex + h * 0.2; y + band <= base; y += h * 0.2) {
    const y2 = y + band;
    g.poly([-hw(y), y, hw(y - slant), y - slant, hw(y2 - slant), y2 - slant, -hw(y2), y2]).fill(def.accent);
  }
  // Polka dots between the stripes.
  for (const [x, y] of [
    [-0.12, 0.08],
    [0.14, 0.3],
    [-0.2, 0.4],
    [0.04, -0.12],
  ] as const)
    if (Math.abs(x * w) < hw(y * h) - 3) g.circle(x * w, y * h, Math.max(1.5, w * 0.04)).fill(0xffffff);
  partyConePath(g, w, h).stroke(stroke(3.5));
  shine(g, [
    [-half * 0.62, base - h * 0.08],
    [-half * 0.18, apex + h * 0.16],
  ]);
  // The pom-pom: a fluffy ball of little puffs.
  const r = Math.min(w, h) * 0.17;
  const cy = -h / 2 + r + 1;
  const puffs: Circle[] = [[0, cy, r * 0.75]];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    puffs.push([Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.45]);
  }
  blobs(g, puffs, lighten(def.accent, 0.25), 2.5);
  g.circle(-r * 0.3, cy - r * 0.3, r * 0.22).fill({ color: 0xffffff, alpha: 0.8 });
}

/** The petal bonnet's petals: base point, then each petal's angle and length. */
function bonnetPetals(w: number, h: number): { x: number; y: number; petals: [number, number][] } {
  const y = h / 2 - h * 0.22;
  const petals: [number, number][] = [];
  for (const deg of [-172, -140, -112, -90, -68, -40, -8]) {
    const a = (deg * Math.PI) / 180;
    // Long enough to reach the box's side or its top, whichever comes first.
    const reach = Math.min(Math.abs((w / 2 - 2) / Math.cos(a)), Math.abs((y + h / 2 - 2) / Math.sin(a)));
    petals.push([a, reach]);
  }
  return { x: 0, y, petals };
}

function hatPetal(g: Graphics, def: ItemDef, w: number, h: number): void {
  const { x, y, petals } = bonnetPetals(w, h);
  const wid = Math.min(w * 0.24, h * 0.55);
  // Back petals first (the outer ones), then the middle ones over them.
  const order = [0, 6, 1, 5, 2, 4, 3];
  for (const i of order) {
    const [a, len] = petals[i]!;
    const tint = i % 2 ? def.color : lighten(def.color, 0.25);
    g.poly(petalPoly(x, y, len, wid, a))
      .fill(tint)
      .stroke(stroke(3));
    // A crease down the middle.
    g.moveTo(x + Math.cos(a) * len * 0.3, y + Math.sin(a) * len * 0.3)
      .lineTo(x + Math.cos(a) * len * 0.78, y + Math.sin(a) * len * 0.78)
      .stroke({ width: 1.3, color: darken(def.color, 0.25), cap: 'round' });
  }
  // The yellow middle the petals grow from, sitting on the head.
  const cw = w * 0.24;
  const ch = h / 2 - y + h * 0.1;
  g.poly(arcPts(0, h / 2 - 1, cw, ch, Math.PI, Math.PI * 2, 16))
    .fill(def.accent)
    .stroke(stroke(3));
  for (const [dx, dy] of [
    [-0.4, -0.3],
    [0, -0.55],
    [0.4, -0.3],
    [-0.15, -0.15],
    [0.2, -0.12],
  ] as const)
    g.circle(dx * cw, h / 2 - 1 + dy * ch, Math.max(1, w * 0.018)).fill(darken(def.accent, 0.4));
}

function topHatShape(
  w: number,
  h: number,
): { top: number; base: number; bot: number; tw: number; brim: number } {
  const brim = h * 0.14;
  return { top: -h / 2 + h * 0.07, base: h / 2 - brim * 0.6, bot: w * 0.3, tw: w * 0.34, brim };
}

function hatTop(g: Graphics, def: ItemDef, w: number, h: number): void {
  const { top, base, bot, tw, brim } = topHatShape(w, h);
  // A black hat drawn against a near-black outline: lift its fills a little.
  const body = lighten(def.color, 0.16);
  g.poly([-tw, top, tw, top, bot, base, -bot, base]).fill(body).stroke(stroke(3.5));
  // The red band.
  const bandH = h * 0.17;
  const at = (y: number): number => tw + ((bot - tw) * (y - top)) / (base - top);
  const by = base - bandH - 1;
  g.poly([-at(by), by, at(by), by, at(base - 1), base - 1, -at(base - 1), base - 1])
    .fill(def.accent)
    .stroke(stroke(2.5));
  g.moveTo(-at(by) + 2, by + bandH * 0.35)
    .lineTo(at(by) - 2, by + bandH * 0.35)
    .stroke({ width: 1.4, color: lighten(def.accent, 0.35), alpha: 0.8 });
  // The lid, and a shine down the crown.
  g.ellipse(0, top, tw, Math.max(2, h * 0.05))
    .fill(lighten(def.color, 0.32))
    .stroke(stroke(3));
  shine(
    g,
    [
      [-tw * 0.62, top + h * 0.08],
      [-bot * 0.6, by - 3],
    ],
    3,
    0.35,
  );
  // The brim, curling up at the ends.
  g.moveTo(-w / 2 + 1, h / 2 - brim)
    .quadraticCurveTo(-w * 0.42, h / 2, 0, h / 2 - 1)
    .quadraticCurveTo(w * 0.42, h / 2, w / 2 - 1, h / 2 - brim)
    .quadraticCurveTo(0, h / 2 - brim * 0.5, -w / 2 + 1, h / 2 - brim)
    .closePath()
    .fill(lighten(def.color, 0.24))
    .stroke(stroke(3));
}

function chefPuffs(w: number, h: number): Circle[] {
  return [
    [-w * 0.22, h * 0.02, w * 0.2],
    [w * 0.22, h * 0.02, w * 0.2],
    [-w * 0.27, -h * 0.13, w * 0.22],
    [w * 0.27, -h * 0.13, w * 0.22],
    [0, -h / 2 + w * 0.26 + 2, w * 0.26],
  ];
}

function chefBand(w: number, h: number): [number, number, number, number] {
  const top = h * 0.12;
  return [-w * 0.32, top, w * 0.64, h / 2 - 1 - top];
}

function hatChef(g: Graphics, def: ItemDef, w: number, h: number): void {
  const puffs = chefPuffs(w, h);
  blobs(g, puffs, def.color, 3.5);
  // Soft folds where the puffs meet.
  const fold = darken(def.accent, 0.1);
  for (const s of [-1, 1]) {
    g.moveTo(s * w * 0.1, -h * 0.28)
      .quadraticCurveTo(s * w * 0.06, -h * 0.12, s * w * 0.12, h * 0.02)
      .stroke({ width: 1.6, color: fold, cap: 'round' });
    g.moveTo(s * w * 0.42, -h * 0.05)
      .quadraticCurveTo(s * w * 0.32, -h * 0.03, s * w * 0.3, h * 0.06)
      .stroke({ width: 1.3, color: fold, cap: 'round' });
  }
  shine(
    g,
    [
      [-w * 0.15, -h * 0.34],
      [-w * 0.04, -h * 0.4],
    ],
    2.5,
    0.9,
  );
  // The pleated band.
  const [bx, by, bw, bh] = chefBand(w, h);
  g.roundRect(bx, by, bw, bh, 3).fill(def.color).stroke(stroke(3.5));
  for (let i = 1; i < 5; i++) {
    const x = bx + (bw * i) / 5;
    g.moveTo(x, by + 3)
      .lineTo(x, by + bh - 3)
      .stroke({ width: 1.4, color: def.accent, cap: 'round' });
  }
}

function wizardPath(g: Graphics, w: number, h: number): Graphics {
  const by = h / 2 - h * 0.09;
  return g
    .moveTo(-w * 0.3, by)
    .quadraticCurveTo(-w * 0.16, -h * 0.05, -w * 0.04, -h / 2 + h * 0.08)
    .quadraticCurveTo(w * 0.12, -h / 2 - 2, w * 0.36, -h * 0.33)
    .quadraticCurveTo(w * 0.2, -h * 0.34, w * 0.1, -h * 0.28)
    .quadraticCurveTo(w * 0.14, h * 0.05, w * 0.3, by)
    .closePath();
}

function hatWizard(g: Graphics, def: ItemDef, w: number, h: number): void {
  wizardPath(g, w, h).fill(def.color).stroke(stroke(3.5));
  shine(
    g,
    [
      [-w * 0.2, h * 0.28],
      [-w * 0.08, -h * 0.12],
      [-w * 0.01, -h * 0.34],
    ],
    2.2,
    0.35,
  );
  // Gold stars and a little moon.
  for (const [x, y, r] of [
    [-0.05, 0.1, 0.11],
    [0.14, -0.13, 0.07],
    [-0.12, -0.2, 0.05],
    [0.17, 0.25, 0.06],
  ] as const)
    g.star(x * w, y * h, 5, r * w, r * w * 0.45)
      .fill(def.accent)
      .stroke(stroke(1.4));
  const mx = -w * 0.17;
  const my = h * 0.27;
  const mr = w * 0.07;
  g.circle(mx, my, mr).fill(def.accent);
  g.circle(mx + mr * 0.5, my - mr * 0.3, mr * 0.85).fill(def.color);
  // A star on the drooping tip.
  g.star(w * 0.37, -h * 0.33, 5, w * 0.08, w * 0.035)
    .fill(lighten(def.accent, 0.3))
    .stroke(stroke(1.6));
  // The brim, in front.
  g.ellipse(0, h / 2 - h * 0.08, w / 2 - 1, h * 0.075)
    .fill(lighten(def.color, 0.12))
    .stroke(stroke(3.5));
}

function candleParts(w: number, h: number): { band: number; cw: number; ct: number; cb: number } {
  const band = h * 0.15;
  return { band, cw: w * 0.42, ct: -h / 2 + h * 0.36, cb: h / 2 - band + 1 };
}

function hatCandle(g: Graphics, def: ItemDef, w: number, h: number): void {
  const { band, cw, ct, cb } = candleParts(w, h);
  // The candle: cream wax with pink stripes winding round it.
  g.rect(-cw / 2, ct, cw, cb - ct).fill(0xfff6ea);
  const slant = cw * 0.5;
  for (let y = ct + slant + 3; y + 3 < cb; y += h * 0.13)
    g.poly([-cw / 2, y, cw / 2, y - slant, cw / 2, y - slant + 3.5, -cw / 2, y + 3.5]).fill(def.color);
  g.rect(-cw / 2, ct, cw, cb - ct).stroke(stroke(3));
  // A drip of wax over the lip.
  g.moveTo(-cw / 2, ct)
    .lineTo(cw / 2, ct)
    .lineTo(cw / 2, ct + 3)
    .quadraticCurveTo(cw * 0.1, ct + 3, cw * 0.05, ct + h * 0.08)
    .quadraticCurveTo(-cw * 0.05, ct + h * 0.1, -cw * 0.1, ct + 3)
    .lineTo(-cw / 2, ct + 3)
    .closePath()
    .fill(0xfff6ea)
    .stroke(stroke(2));
  // The wick and its flame.
  const fy = ct - h * 0.04;
  g.moveTo(0, ct).lineTo(0, fy).stroke({ width: 2, color: OUTLINE, cap: 'round' });
  const fh = ct - (-h / 2 + 1) - 3;
  const fw = Math.min(w * 0.3, fh * 0.6);
  const flame = (gg: Graphics, k: number): Graphics =>
    gg
      .moveTo(0, fy - fh * k)
      .quadraticCurveTo(fw * 0.55 * k, fy - fh * 0.45 * k, fw * 0.5 * k, fy - fh * 0.2 * k)
      .quadraticCurveTo(fw * 0.4 * k, fy + 2, 0, fy + 2)
      .quadraticCurveTo(-fw * 0.4 * k, fy + 2, -fw * 0.5 * k, fy - fh * 0.2 * k)
      .quadraticCurveTo(-fw * 0.55 * k, fy - fh * 0.45 * k, 0, fy - fh * k)
      .closePath();
  flame(g, 1).fill(0xff9a3c).stroke(stroke(2.5));
  flame(g, 0.62).fill(def.accent);
  // The little party band it stands on.
  g.roundRect(-w / 2, h / 2 - band, w, band - 1, band / 2)
    .fill(darken(def.color, 0.12))
    .stroke(stroke(3));
  for (let i = 0; i < 4; i++)
    g.circle(-w / 2 + (w * (i + 0.5)) / 4, h / 2 - band / 2 - 0.5, Math.max(1.2, band * 0.16)).fill(
      def.accent,
    );
}

function eggshellPoly(w: number, h: number): number[] {
  const zig = h / 2 - h * 0.24;
  const pts = arcPts(0, zig, w / 2 - 1, zig + h / 2 - 1, Math.PI, Math.PI * 2, 22);
  // The egg is pointier at the top: pull the upper points in a little.
  for (let i = 0; i < pts.length; i += 2) {
    const t = (zig - pts[i + 1]!) / (zig + h / 2);
    pts[i]! *= 1 - 0.12 * t * t;
  }
  // The broken edge, back from right to left.
  const teeth = 7;
  for (let i = 1; i < teeth * 2; i++) {
    const x = w / 2 - 1 - ((w - 2) * i) / (teeth * 2);
    pts.push(x, i % 2 ? h / 2 - 1 : zig);
  }
  return pts;
}

function hatEggshell(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const pts = eggshellPoly(w, h);
  g.poly(pts).fill(def.color).stroke(stroke(3.5));
  // Freckles, and a hairline crack running up from the edge.
  for (let i = 0; i < 6; i++) {
    const x = (hash01(seedN, i) - 0.5) * w * 0.6;
    const y = -h * 0.25 + hash01(seedN, i + 10) * h * 0.4;
    g.circle(x, y, Math.max(1, w * 0.02)).fill(def.accent);
  }
  g.moveTo(w * 0.12, h / 2 - h * 0.22)
    .lineTo(w * 0.18, h * 0.05)
    .lineTo(w * 0.13, -h * 0.05)
    .lineTo(w * 0.2, -h * 0.17)
    .stroke({ width: 1.5, color: darken(def.accent, 0.3), cap: 'round', join: 'round' });
  shine(g, [
    [-w * 0.34, h * 0.1],
    [-w * 0.28, -h * 0.15],
    [-w * 0.14, -h * 0.33],
  ]);
}

function gooParts(w: number, h: number, seedN: number): { body: number[]; drips: Circle[][] } {
  const y0 = h * 0.08;
  const rx = w / 2 - 3;
  const ry = y0 + h / 2 - 3;
  const body: number[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (Math.PI * i) / n;
    const k = i === 0 || i === n ? 1 : 1 + (hash01(seedN, i) - 0.5) * 0.12;
    body.push(Math.cos(a) * rx * k, y0 + Math.sin(a) * ry * k);
  }
  const drips: Circle[][] = [];
  const room = h / 2 - y0 - 3;
  for (const [i, x] of [-0.3, -0.06, 0.16, 0.34].entries()) {
    const len = room * (0.45 + hash01(seedN, i + 20) * 0.55);
    const r = w * (0.055 + hash01(seedN, i + 30) * 0.02);
    const bulb = r * 1.25;
    drips.push(
      strand(
        [
          [x * w, y0 - 2],
          [x * w, y0 + len - bulb],
        ],
        [r, r * 0.9],
        3,
      ).concat([[x * w, y0 + len - bulb, bulb]]),
    );
  }
  return { body, drips };
}

function hatGoo(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): void {
  const { body, drips } = gooParts(w, h, seedN);
  const all = drips.flat();
  // One outlined lump: every outline under every fill.
  g.poly(body).stroke(stroke(7));
  for (const [x, y, r] of all) g.circle(x, y, r).stroke(stroke(7));
  g.poly(body).fill(def.color);
  for (const [x, y, r] of all) g.circle(x, y, r).fill(def.color);
  // Darker sludge and pale bubbles in it.
  for (let i = 0; i < 4; i++) {
    const x = (hash01(seedN, i + 40) - 0.5) * w * 0.6;
    const y = -h * 0.2 + hash01(seedN, i + 50) * h * 0.3;
    g.ellipse(x, y, w * 0.07, h * 0.06).fill({ color: def.accent, alpha: 0.7 });
  }
  for (const [x, y, r] of [
    [0.2, -0.22, 0.05],
    [-0.08, 0.0, 0.035],
    [0.3, 0.02, 0.03],
  ] as const)
    g.circle(x * w, y * h, r * w).stroke({ width: 1.5, color: lighten(def.color, 0.45), alpha: 0.9 });
  shine(g, [
    [-w * 0.36, -h * 0.02],
    [-w * 0.26, -h * 0.26],
    [-w * 0.1, -h * 0.36],
  ]);
  for (const d of drips) {
    const [x, y, r] = d[d.length - 1]!;
    g.circle(x - r * 0.35, y - r * 0.3, r * 0.3).fill({ color: 0xffffff, alpha: 0.6 });
  }
}

function bubbleParts(w: number, h: number): { dome: number[]; collar: [number, number, number, number] } {
  const ch = h * 0.17;
  const collarTop = h / 2 - ch;
  const dip = 0.5;
  const ry = (collarTop + 2 + h / 2 - 2) / (1 + Math.sin(dip));
  const cy = -h / 2 + 2 + ry;
  return {
    dome: arcPts(0, cy, w / 2 - 2, ry, Math.PI - dip, Math.PI * 2 + dip, 28),
    collar: [-w * 0.38, collarTop, w * 0.76, ch - 1],
  };
}

function hatBubble(g: Graphics, def: ItemDef, w: number, h: number): void {
  const { dome, collar } = bubbleParts(w, h);
  // Mostly clear, so whatever is inside shows through.
  g.poly(dome).fill({ color: def.color, alpha: 0.22 }).stroke(stroke(3));
  g.poly(dome).stroke({ width: 3, color: lighten(def.color, 0.3), alpha: 0.5, alignment: 1 });
  // The highlight: a long curved gleam and a dot.
  const top = -h / 2 + 2;
  const mid = (top + collar[1]) / 2;
  g.moveTo(-w * 0.34, mid + h * 0.08)
    .quadraticCurveTo(-w * 0.32, top + h * 0.12, -w * 0.1, top + h * 0.07)
    .stroke({ width: Math.max(3, w * 0.07), color: def.accent, alpha: 0.85, cap: 'round' });
  g.circle(w * 0.04, top + h * 0.1, Math.max(1.5, w * 0.035)).fill({ color: def.accent, alpha: 0.85 });
  g.moveTo(w * 0.36, mid + h * 0.04)
    .quadraticCurveTo(w * 0.37, mid + h * 0.18, w * 0.3, mid + h * 0.26)
    .stroke({ width: 2, color: def.accent, alpha: 0.5, cap: 'round' });
  // The collar it sits on, with two rivets.
  const [x, y, cw, chh] = collar;
  g.roundRect(x, y, cw, chh, chh / 2)
    .fill(METAL)
    .stroke(stroke(3));
  g.moveTo(x + chh / 2, y + chh * 0.35)
    .lineTo(x + cw - chh / 2, y + chh * 0.35)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.7, cap: 'round' });
  for (const s of [-1, 1]) g.circle(s * cw * 0.32, y + chh * 0.55, Math.max(1.2, chh * 0.15)).fill(0x8e9bb0);
}

// --- Face and back things ---------------------------------------------------

function lensPath(g: Graphics, x0: number, x1: number, top: number, bottom: number): Graphics {
  const mid = (x0 + x1) / 2;
  const side = top + (bottom - top) * 0.35;
  return g
    .moveTo(x0, top)
    .lineTo(x1, top)
    .lineTo(x1, side)
    .quadraticCurveTo(x1, bottom, mid, bottom)
    .quadraticCurveTo(x0, bottom, x0, side)
    .closePath();
}

function glassesLenses(w: number): [number, number][] {
  const lw = w * 0.38;
  return [
    [-w * 0.05 - lw, -w * 0.05],
    [w * 0.05, w * 0.05 + lw],
  ];
}

function sunglasses(g: Graphics, def: ItemDef, w: number, h: number): void {
  const top = -h / 2 + 1.5;
  const bottom = h / 2 - 1.5;
  // The arms, folded back behind each lens, and the bridge.
  for (const s of [-1, 1])
    wire(
      g,
      [
        [s * w * 0.4, top + 2],
        [s * (w / 2 - 1.5), top + 1.5],
      ],
      2,
      def.accent,
      2,
    );
  wire(
    g,
    [
      [-w * 0.07, top + 3],
      [0, top + 1],
      [w * 0.07, top + 3],
    ],
    2.5,
    def.accent,
    2,
  );
  for (const [x0, x1] of glassesLenses(w)) {
    lensPath(g, x0, x1, top, bottom).fill(def.color).stroke(stroke(3));
    // A purple sheen low on the glass, and two bright streaks.
    lensPath(g, x0 + 2, x1 - 2, top + (bottom - top) * 0.55, bottom - 1.5).fill({
      color: def.accent,
      alpha: 0.55,
    });
    const lw = x1 - x0;
    shine(
      g,
      [
        [x0 + lw * 0.22, top + (bottom - top) * 0.6],
        [x0 + lw * 0.42, top + 2.5],
      ],
      2.5,
      0.85,
    );
    shine(
      g,
      [
        [x0 + lw * 0.42, top + (bottom - top) * 0.65],
        [x0 + lw * 0.55, top + (bottom - top) * 0.35],
      ],
      1.5,
      0.6,
    );
    // The frame's top bar.
    g.moveTo(x0 + 1.5, top + 1)
      .lineTo(x1 - 1.5, top + 1)
      .stroke({ width: 1.5, color: def.accent, cap: 'round' });
  }
}

/** One half of the mustache (the right one; the left is its mirror), as a strand of circles. */
function mustacheHalf(w: number, h: number, s: number): Circle[] {
  const pts: Pt[] = [
    [0.02, -0.06],
    [0.1, 0.05],
    [0.2, 0.12],
    [0.3, 0.1],
    [0.38, 0.0],
    [0.43, -0.15],
    [0.42, -0.3],
    [0.37, -0.38],
    [0.32, -0.3],
  ];
  const radii = [0.3, 0.36, 0.33, 0.26, 0.19, 0.14, 0.12, 0.11, 0.11];
  return strand(
    pts.map(([x, y]) => [s * x * w, y * h] as const),
    radii.map((r) => r * h),
    4,
  );
}

function mustache(g: Graphics, def: ItemDef, w: number, h: number): void {
  const circles = [...mustacheHalf(w, h, -1), ...mustacheHalf(w, h, 1)];
  // Black on a near-black outline: lift it a touch so the curls read.
  blobs(g, circles, lighten(def.color, 0.18), 2.5);
  // Combed hairs, sweeping out from the middle.
  for (const s of [-1, 1])
    for (const [a, b, c] of [
      [0.06, 0.18, -0.05],
      [0.1, 0.26, 0.12],
    ] as const)
      g.moveTo(s * a * w, c * h - h * 0.04)
        .quadraticCurveTo(s * (a + b) * 0.55 * w, c * h + h * 0.12, s * b * w, c * h + h * 0.06)
        .stroke({ width: 1.4, color: def.accent, cap: 'round' });
  shine(
    g,
    [
      [-w * 0.18, -h * 0.12],
      [-w * 0.08, -h * 0.22],
    ],
    2,
    0.4,
  );
  shine(
    g,
    [
      [w * 0.08, -h * 0.22],
      [w * 0.18, -h * 0.12],
    ],
    2,
    0.4,
  );
}

function monocleLens(w: number, h: number): Circle {
  const r = Math.min(w / 2 - 2.5, h * 0.36);
  return [0, -h / 2 + r + 2.5, r];
}

function monocle(g: Graphics, def: ItemDef, w: number, h: number): void {
  const [cx, cy, r] = monocleLens(w, h);
  // The string, hanging from the rim to a little bead.
  const end: Pt = [-w * 0.18, h / 2 - 4];
  g.moveTo(cx + r * 0.6, cy + r * 0.8)
    .bezierCurveTo(cx + r * 0.9, h * 0.35, -w * 0.05, h * 0.05, end[0], end[1])
    .stroke({ width: 1.8, color: OUTLINE, cap: 'round' });
  g.circle(end[0], end[1], 2.6).fill(def.color).stroke(stroke(1.6));
  // The glass, then the gold rim round it.
  g.circle(cx, cy, r).fill({ color: def.accent, alpha: 0.55 });
  g.circle(cx, cy, r).stroke({ width: Math.max(6, r * 0.42) + 3, color: OUTLINE });
  g.circle(cx, cy, r).stroke({ width: Math.max(3, r * 0.42) - 1, color: def.color });
  g.circle(cx, cy, r)
    .stroke({ width: 1.2, color: lighten(def.color, 0.5), alpha: 0.8 })
    .moveTo(cx - r * 0.5, cy + r * 0.05)
    .quadraticCurveTo(cx - r * 0.5, cy - r * 0.45, cx - r * 0.05, cy - r * 0.5)
    .stroke({ width: 2.5, color: 0xffffff, alpha: 0.85, cap: 'round' });
  g.circle(cx + r * 0.3, cy + r * 0.25, Math.max(1, r * 0.1)).fill({ color: 0xffffff, alpha: 0.8 });
  // The little loop the string ties to.
  g.circle(cx + r * 0.72, cy + r * 0.72, 2)
    .fill(def.color)
    .stroke(stroke(1.4));
}

function bowWing(g: Graphics, w: number, h: number, s: number): Graphics {
  const k = w * 0.08;
  return g
    .moveTo(s * k, -h * 0.18)
    .bezierCurveTo(s * w * 0.22, -h * 0.62, s * w * 0.5, -h * 0.62, s * (w / 2 - 1.5), -h * 0.12)
    .bezierCurveTo(s * w * 0.52, h * 0.55, s * w * 0.26, h * 0.6, s * k, h * 0.18)
    .closePath();
}

function bowtie(g: Graphics, def: ItemDef, w: number, h: number): void {
  for (const s of [-1, 1]) {
    bowWing(g, w, h, s).fill(def.color).stroke(stroke(3.5));
    // The pinched folds running into the knot.
    for (const t of [-0.2, 0.15])
      g.moveTo(s * w * 0.1, t * h * 0.4)
        .quadraticCurveTo(s * w * 0.25, t * h, s * w * 0.38, t * h * 1.6)
        .stroke({ width: 1.5, color: darken(def.color, 0.3), cap: 'round' });
    // Polka dots.
    for (const [x, y] of [
      [0.3, -0.22],
      [0.4, 0.15],
      [0.2, 0.26],
    ] as const)
      g.circle(s * x * w, y * h, Math.max(1.4, h * 0.07)).fill(def.accent);
  }
  shine(
    g,
    [
      [-w * 0.42, -h * 0.05],
      [-w * 0.36, -h * 0.28],
    ],
    2,
    0.6,
  );
  // The knot.
  g.roundRect(-w * 0.1, -h * 0.28, w * 0.2, h * 0.56, Math.min(w * 0.06, h * 0.18))
    .fill(darken(def.color, 0.1))
    .stroke(stroke(3));
  g.moveTo(-w * 0.04, -h * 0.12)
    .lineTo(-w * 0.04, h * 0.12)
    .stroke({ width: 1.5, color: lighten(def.color, 0.4), alpha: 0.8, cap: 'round' });
}

/** The scarf's wavy strip, between the fringes. */
function scarfPoly(w: number, h: number): number[] {
  const fringe = Math.min(w * 0.08, 6);
  const x0 = -w / 2 + fringe;
  const x1 = w / 2 - fringe;
  const half = h / 2 - 1.5;
  const wave = h * 0.12;
  const n = 12;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push(x, -half + Math.sin(i * 0.9) * wave);
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push(x, half + Math.sin(i * 0.9) * wave);
  }
  return pts;
}

function scarf(g: Graphics, def: ItemDef, w: number, h: number): void {
  const fringe = Math.min(w * 0.08, 6);
  const x0 = -w / 2 + fringe;
  const x1 = w / 2 - fringe;
  const half = h / 2 - 1.5;
  const wave = h * 0.12;
  // The tassels at each end.
  for (const [end, dir] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    const i = dir < 0 ? 0 : 12;
    const yOff = Math.sin(i * 0.9) * wave;
    for (const t of [-0.6, -0.2, 0.2, 0.6])
      wire(
        g,
        [
          [end, yOff + t * half],
          [end + dir * (fringe - 1), yOff + t * half * 1.15],
        ],
        1.6,
        def.accent,
        1.4,
      );
  }
  const pts = scarfPoly(w, h);
  g.poly(pts).fill(def.color);
  // Stripes across, following the wave.
  const n = 12;
  const yAt = (x: number): number => Math.sin(((x - x0) / (x1 - x0)) * n * 0.9) * wave;
  const stripe = Math.max(3, w * 0.05);
  for (const t of [0.12, 0.24, 0.76, 0.88]) {
    const x = x0 + (x1 - x0) * t;
    const ya = yAt(x);
    const yb = yAt(x + stripe);
    g.poly([
      x,
      ya - half + 0.5,
      x + stripe,
      yb - half + 0.5,
      x + stripe,
      yb + half - 0.5,
      x,
      ya + half - 0.5,
    ]).fill(def.accent);
  }
  // Knit stitches in rows of little v's.
  const knit = darken(def.color, 0.25);
  for (let x = x0 + 4; x < x1 - 3; x += 4) {
    const yc = yAt(x);
    for (const dy of [-half * 0.4, half * 0.35])
      g.moveTo(x - 1.4, yc + dy - 1.2)
        .lineTo(x, yc + dy + 0.6)
        .lineTo(x + 1.4, yc + dy - 1.2)
        .stroke({ width: 0.9, color: knit, alpha: 0.6, cap: 'round', join: 'round' });
  }
  g.poly(pts).stroke(stroke(3));
}

function bandaid(g: Graphics, def: ItemDef, w: number, h: number): void {
  const r = (h - 2) / 2;
  g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r)
    .fill(def.color)
    .stroke(stroke(3));
  // The soft pad in the middle, with its little dots.
  const pw = w * 0.34;
  const ph = h * 0.62;
  g.roundRect(-pw / 2, -ph / 2, pw, ph, 2)
    .fill(def.accent)
    .stroke({ width: 1.5, color: darken(def.color, 0.25) });
  for (const dx of [-0.25, 0, 0.25])
    for (const dy of [-0.2, 0.2])
      g.circle(dx * pw, dy * ph, Math.max(0.8, h * 0.05)).fill(darken(def.color, 0.15));
  // Air holes on the sticky wings.
  for (const s of [-1, 1])
    for (const [dx, dy] of [
      [0.28, -0.2],
      [0.36, 0.15],
      [0.42, -0.1],
    ] as const)
      g.circle(s * dx * w, dy * h, Math.max(0.8, h * 0.055)).fill(darken(def.color, 0.25));
  shine(
    g,
    [
      [-w / 2 + r, -h / 2 + 3.5],
      [-w * 0.22, -h / 2 + 3.5],
    ],
    1.6,
    0.7,
  );
}

/** Draw an M11 item. Returns false when the art is not one of M11's. */
export function drawItemArt11(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): boolean {
  switch (def.art) {
    case 'hat_acorn':
      hatAcorn(g, def, w, h);
      return true;
    case 'hat_party':
      hatParty(g, def, w, h);
      return true;
    case 'hat_petal':
      hatPetal(g, def, w, h);
      return true;
    case 'hat_top':
      hatTop(g, def, w, h);
      return true;
    case 'hat_chef':
      hatChef(g, def, w, h);
      return true;
    case 'hat_wizard':
      hatWizard(g, def, w, h);
      return true;
    case 'hat_candle':
      hatCandle(g, def, w, h);
      return true;
    case 'hat_eggshell':
      hatEggshell(g, def, w, h, seedN);
      return true;
    case 'hat_goo':
      hatGoo(g, def, w, h, seedN);
      return true;
    case 'hat_bubble':
      hatBubble(g, def, w, h);
      return true;
    case 'sunglasses':
      sunglasses(g, def, w, h);
      return true;
    case 'mustache':
      mustache(g, def, w, h);
      return true;
    case 'monocle':
      monocle(g, def, w, h);
      return true;
    case 'bowtie':
      bowtie(g, def, w, h);
      return true;
    case 'scarf':
      scarf(g, def, w, h);
      return true;
    case 'bandaid':
      bandaid(g, def, w, h);
      return true;
    default:
      return false;
  }
}

/** Trace an M11 item's silhouette (no fill), for its rim. False when it has none of its own. */
export function outlineItemArt11(g: Graphics, def: ItemDef, w: number, h: number, seedN: number): boolean {
  switch (def.art) {
    case 'hat_acorn':
      acornCupPath(g, w, -h / 2 + h * 0.24, h / 2 - 1);
      g.rect(-w * 0.05, -h / 2 + 1, w * 0.13, h * 0.3);
      return true;
    case 'hat_party': {
      partyConePath(g, w, h);
      const r = Math.min(w, h) * 0.17;
      g.circle(0, -h / 2 + r + 1, r);
      return true;
    }
    case 'hat_petal': {
      const { x, y, petals } = bonnetPetals(w, h);
      const wid = Math.min(w * 0.24, h * 0.55);
      for (const [a, len] of petals) g.poly(petalPoly(x, y, len, wid, a));
      return true;
    }
    case 'hat_top': {
      const { top, base, bot, tw, brim } = topHatShape(w, h);
      g.poly([-tw, top, tw, top, bot, base, -bot, base]);
      g.roundRect(-w / 2 + 1, h / 2 - brim, w - 2, brim - 1, brim / 2);
      return true;
    }
    case 'hat_chef': {
      for (const [x, y, r] of chefPuffs(w, h)) g.circle(x, y, r);
      const [bx, by, bw, bh] = chefBand(w, h);
      g.roundRect(bx, by, bw, bh, 3);
      return true;
    }
    case 'hat_wizard':
      wizardPath(g, w, h);
      g.ellipse(0, h / 2 - h * 0.08, w / 2 - 1, h * 0.075);
      return true;
    case 'hat_candle': {
      const { band, cw, ct } = candleParts(w, h);
      g.roundRect(-w / 2, h / 2 - band, w, band - 1, band / 2);
      g.rect(-cw / 2, ct, cw, h / 2 - band - ct);
      g.ellipse(0, (ct + -h / 2) / 2, Math.min(w * 0.15, cw * 0.4), (ct + h / 2) / 2);
      return true;
    }
    case 'hat_eggshell':
      g.poly(eggshellPoly(w, h));
      return true;
    case 'hat_goo': {
      const { body, drips } = gooParts(w, h, seedN);
      g.poly(body);
      for (const [x, y, r] of drips.flat()) g.circle(x, y, r);
      return true;
    }
    case 'hat_bubble': {
      const { dome, collar } = bubbleParts(w, h);
      g.poly(dome);
      g.roundRect(collar[0], collar[1], collar[2], collar[3], collar[3] / 2);
      return true;
    }
    case 'sunglasses':
      for (const [x0, x1] of glassesLenses(w)) lensPath(g, x0, x1, -h / 2 + 1.5, h / 2 - 1.5);
      return true;
    case 'mustache':
      for (const [x, y, r] of [...mustacheHalf(w, h, -1), ...mustacheHalf(w, h, 1)]) g.circle(x, y, r);
      return true;
    case 'monocle': {
      const [cx, cy, r] = monocleLens(w, h);
      g.circle(cx, cy, r + 2);
      return true;
    }
    case 'bowtie':
      bowWing(g, w, h, -1);
      bowWing(g, w, h, 1);
      return true;
    case 'scarf':
      g.poly(scarfPoly(w, h));
      return true;
    case 'bandaid':
      g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, (h - 2) / 2);
      return true;
    default:
      return false;
  }
}
