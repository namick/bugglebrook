import { ColorMatrixFilter, Container, Graphics } from 'pixi.js';
import type { Content } from '../../../game/data';
import type { BugDef, EssenceId, ItemDef, PotionEffect, RecipeInput } from '../../../game/data/types';
import type { DateStamp, EntryState, PageId } from '../../../game';
import { isGlyph } from '../../../game/data/glyphs';
import { makeBugView } from '../art/bugViews';
import { OUTLINE, STAR, darken, lighten, mix, stroke } from '../render/palette';
import type { BugSprite } from '../render/draw/bug';
import { standaloneFrame } from '../render/draw/bug';
import { drawNumber } from '../render/draw/digits';
import { drawAreaIcon, drawGlyph } from '../render/draw/glyphs';
import { ItemSprite } from '../render/draw/item';
import { drawFriend, drawPicto } from '../render/draw/pictogram';
import { bugSpan } from '../render/draw/species';
import { drawTagIcon } from '../render/draw/tagIcon';
import { cameraIcon } from '../ui/photoButtons';
import { jarDots } from './layout';

/**
 * Pictures for the journal: things as silhouettes or in color, hint
 * pictograms, date stamps, the tab icons, and the potions' essences and
 * effects. Everything is drawn in code with the shared outline.
 */

/** The ink of an unknown thing's silhouette (multiplied over its art). */
export const SILHOUETTE = 0x2e2540;
export const PAPER = 0xfff6df;
export const PAPER_LINE = 0xe9dcc0;
export const INK = 0x5a4a6e;

/** Each essence's drop color on the potions page. */
export const ESSENCE_COLORS: Record<EssenceId, number> = {
  ess_grow: 0x5cc85a,
  ess_shrink: 0xff9fd0,
  ess_float: 0xbfe7ff,
  ess_inflate: 0xff6b6b,
  ess_glow: 0xfff04f,
  ess_color: 0xff8c2e,
  ess_sticky: 0xf2b134,
  ess_fizz: 0x9be8ff,
  ess_soap: 0xe6f7ff,
  ess_hot: 0xe8453c,
  ess_cold: 0x6fd3ff,
  ess_heavy: 0x6b6f80,
  ess_bounce: 0xb3f04a,
  ess_speed: 0xffd23f,
  ess_slow: 0x8f7a5a,
  ess_stink: 0x9aa64a,
  ess_sleep: 0x7b6bd6,
  ess_sound: 0xff7ad9,
  ess_moon: 0x3c4a9a,
  ess_mirror: 0xd9dde8,
  ess_hair: 0xa8744f,
  ess_magnet: 0xd94a6a,
};

/** Scale and center `node` inside a `w` by `h` box around (0, 0). */
export function fitInto(node: Container, w: number, h: number, most = 1.6): void {
  const b = node.getLocalBounds();
  if (b.width <= 0 || b.height <= 0) return;
  const k = Math.min(w / b.width, h / b.height, most);
  node.scale.set(k);
  node.pivot.set(b.x + b.width / 2, b.y + b.height / 2);
}

/**
 * A color matrix from a solid `color` (k = 0) to the art's own colors
 * (k = 1), keeping its alpha: a true silhouette, then color pouring in.
 */
export function solidMatrix(color: number, k: number): number[] {
  const t = Math.max(0, Math.min(1, k));
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const s = 1 - t;
  // prettier-ignore
  return [
    t, 0, 0, 0, r * s,
    0, t, 0, 0, g * s,
    0, 0, t, 0, b * s,
    0, 0, 0, 1, 0,
  ];
}

/** Lerp a tint from the silhouette's ink to full color (white). */
export function revealTint(k: number): number {
  return mix(SILHOUETTE, 0xffffff, Math.max(0, Math.min(1, k)));
}

const OFFSETS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];

/**
 * A thing in the journal: its own art, shown as a silhouette, an outlined
 * silhouette (hinted), or in color. `reveal(k)` blends from dark to color.
 * Bugs breathe and blink on the page.
 */
export class Picture extends Container {
  private readonly main: Container;
  private readonly outline = new Container();
  private readonly bugs: BugSprite[] = [];
  private time = 0;

  constructor(
    build: () => Container,
    w: number,
    h: number,
    state: EntryState,
    outlineColor = 0xffd23f,
    private readonly bug: BugDef | null = null,
    private readonly morph?: 'cocoon' | 'butterfly',
  ) {
    super();
    this.main = this.make(build);
    if (state === 'hinted') {
      const px = Math.max(4, Math.min(w, h) * 0.04);
      for (const [dx, dy] of OFFSETS) {
        const copy = this.make(build);
        copy.position.set(dx * px, dy * px);
        this.outline.addChild(copy);
      }
      const solid = new ColorMatrixFilter();
      solid.matrix = solidMatrix(outlineColor, 0) as typeof solid.matrix;
      this.outline.filters = [solid];
      this.addChild(this.outline);
    }
    this.addChild(this.main);
    this.update(0);
    // Fit by the main art; the outline copies share its scale and pivot.
    fitInto(this.main, w, h);
    for (const c of this.outline.children) {
      c.scale.copyFrom(this.main.scale);
      c.pivot.copyFrom(this.main.pivot);
    }
    this.reveal(state === 'discovered' ? 1 : 0);
  }

  private make(build: () => Container): Container {
    const node = build();
    if (this.bug) this.bugs.push(node as BugSprite);
    return node;
  }

  private dark: ColorMatrixFilter | null = null;

  /** 0 is the dark silhouette, 1 full color. */
  reveal(k: number): void {
    if (k >= 1) {
      this.main.filters = null;
      return;
    }
    this.dark ??= new ColorMatrixFilter();
    this.dark.matrix = solidMatrix(SILHOUETTE, k) as typeof this.dark.matrix;
    this.main.filters = [this.dark];
  }

  update(dt: number): void {
    if (!this.bug) return;
    this.time += dt;
    const art = this.bug.art;
    for (const b of this.bugs) b.update(standaloneFrame('st_idle', this.time, dt, 0.7, art, this.morph));
  }
}

/** Build an item's art. */
export function itemBuilder(def: ItemDef, seed = 3): () => Container {
  return () => new ItemSprite(def, seed);
}

/** Build a bug's art (or Munch's butterfly). */
export function bugBuilder(def: BugDef): () => Container {
  return () => makeBugView(def);
}

/** About how big an item is drawn, for keeping big and small things in proportion. */
export function itemSize(def: ItemDef): number {
  const s = def.shape;
  return (s.type === 'circle' ? s.radius * 2 : Math.max(s.width, s.height)) * 100;
}

export function bugSize(def: BugDef): number {
  return bugSpan(def);
}

/** A "?" drawn chunky, light on dark or dark on light. */
export function questionMark(g: Graphics, x: number, y: number, s: number, color = 0xffffff): void {
  const h = s / 2;
  const path = (gg: Graphics): Graphics =>
    gg
      .moveTo(x - h * 0.5, y - h * 0.35)
      .bezierCurveTo(x - h * 0.5, y - h * 1.05, x + h * 0.6, y - h * 1.05, x + h * 0.55, y - h * 0.4)
      .bezierCurveTo(x + h * 0.5, y - h * 0.05, x, y, x, y + h * 0.3);
  path(g).stroke({ width: h * 0.46, color: OUTLINE, cap: 'round', join: 'round' });
  path(g).stroke({ width: h * 0.24, color, cap: 'round', join: 'round' });
  g.circle(x, y + h * 0.78, h * 0.21)
    .fill(color)
    .stroke(stroke(Math.max(2, h * 0.11)));
}

/** A four-pointed twinkle. */
export function twinkle(g: Graphics, x: number, y: number, r: number, color = 0xffffff, alpha = 1): void {
  g.poly([
    x,
    y - r,
    x + r * 0.22,
    y - r * 0.22,
    x + r,
    y,
    x + r * 0.22,
    y + r * 0.22,
    x,
    y + r,
    x - r * 0.22,
    y + r * 0.22,
    x - r,
    y,
    x - r * 0.22,
    y - r * 0.22,
  ]).fill({
    color,
    alpha,
  });
}

/**
 * A hint pictogram: a glyph, an area's icon, or a thing's own picture (an
 * item, a bug's face). Centered on (0, 0), about `s` across.
 */
export function hintNode(hint: string, s: number, content: Content): Container {
  if (isGlyph(hint)) {
    const g = new Graphics();
    drawGlyph(g, hint, 0, 0, s);
    return g;
  }
  if (hint.startsWith('area_')) {
    const g = new Graphics();
    drawAreaIcon(g, hint, 0, 0, s);
    return g;
  }
  if (hint.startsWith('item_')) {
    const def = content.items.tryGet(hint);
    if (def) {
      const holder = new Container();
      const sprite = new ItemSprite(def, 5);
      holder.addChild(sprite);
      fitInto(sprite, s, s, 1.4);
      return holder;
    }
  }
  if (hint.startsWith('bug_')) {
    const def = content.bugs.tryGet(hint);
    if (def) {
      const g = new Graphics();
      drawFriend(g, def, 0, 0, s * 0.9);
      return g;
    }
  }
  const g = new Graphics();
  questionMark(g, 0, 0, s * 0.8, 0x4d9bff);
  return g;
}

/** A row of hint pictograms in cream bubbles, centered on (0, 0). */
export function hintRow(hints: readonly string[], s: number, content: Content, bubble = true): Container {
  const row = new Container();
  const pitch = s * 1.25;
  hints.forEach((h, i) => {
    const x = (i - (hints.length - 1) / 2) * pitch;
    if (bubble) {
      const b = new Graphics();
      b.circle(x, 0, s * 0.6)
        .fill(0xfffbef)
        .stroke(stroke(Math.max(2.5, s * 0.07)));
      row.addChild(b);
    }
    const node = hintNode(h, s * 0.78, content);
    node.position.set(x, 0);
    row.addChild(node);
  });
  return row;
}

/**
 * The date stamp on a found entry: an inked ring with a sun or a moon, and
 * the day as dots (or a number after a week).
 */
export function drawDateStamp(g: Graphics, stamp: DateStamp, r: number, ink = 0xd9483b): void {
  g.circle(0, 0, r)
    .fill({ color: lighten(ink, 0.85), alpha: 0.85 })
    .stroke({ width: r * 0.14, color: ink });
  g.circle(0, 0, r * 0.78).stroke({ width: r * 0.05, color: ink, alpha: 0.7 });
  if (stamp.night) {
    g.circle(-r * 0.05, -r * 0.18, r * 0.36).fill(ink);
    g.circle(r * 0.12, -r * 0.3, r * 0.3).fill(lighten(ink, 0.85));
  } else {
    g.circle(0, -r * 0.2, r * 0.22).fill(ink);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.moveTo(Math.cos(a) * r * 0.32, -r * 0.2 + Math.sin(a) * r * 0.32)
        .lineTo(Math.cos(a) * r * 0.45, -r * 0.2 + Math.sin(a) * r * 0.45)
        .stroke({ width: r * 0.07, color: ink, cap: 'round' });
    }
  }
  if (stamp.day <= 7) {
    const n = stamp.day;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * r * 0.2;
      g.circle(x, r * 0.42, r * 0.075).fill(ink);
    }
  } else drawNumber(g, String(Math.min(999, stamp.day)), 0, r * 0.42, r * 0.36, lighten(ink, 0.85), ink);
}

/** A tab's pictogram (section 13): ladybug, acorn, hammer, bottle, keyhole, magnifier, camera, folded map. */
export function drawTabIcon(g: Graphics, page: PageId | 'home', s: number): void {
  const h = s / 2;
  const w = Math.max(2.5, s * 0.06);
  switch (page) {
    case 'page_bugs': {
      for (const dx of [-0.3, 0.3])
        g.moveTo(h * dx * 0.5 + h * 0.55, -h * 0.25)
          .quadraticCurveTo(h * (0.75 + dx), -h * 0.85, h * (0.6 + dx * 1.4), -h * 0.85)
          .stroke(stroke(w * 0.8));
      g.circle(h * 0.55, -h * 0.05, h * 0.32)
        .fill(OUTLINE)
        .stroke(stroke(w));
      g.circle(-h * 0.05, h * 0.12, h * 0.68)
        .fill(0xe8453c)
        .stroke(stroke(w));
      g.moveTo(-h * 0.05, -h * 0.55)
        .lineTo(-h * 0.05, h * 0.78)
        .stroke(stroke(w * 0.8));
      for (const [x, y] of [
        [-0.4, -0.1],
        [0.28, -0.05],
        [-0.35, 0.4],
        [0.25, 0.45],
      ] as const)
        g.circle(h * x, h * y, h * 0.12).fill(OUTLINE);
      g.circle(h * 0.65, -h * 0.12, h * 0.08).fill(0xffffff);
      return;
    }
    case 'page_items': {
      // An acorn.
      g.moveTo(-h * 0.55, -h * 0.05)
        .quadraticCurveTo(-h * 0.6, h * 0.75, 0, h * 0.9)
        .quadraticCurveTo(h * 0.6, h * 0.75, h * 0.55, -h * 0.05)
        .closePath()
        .fill(0xd9944a)
        .stroke(stroke(w));
      g.moveTo(-h * 0.7, 0)
        .quadraticCurveTo(-h * 0.7, -h * 0.7, 0, -h * 0.7)
        .quadraticCurveTo(h * 0.7, -h * 0.7, h * 0.7, 0)
        .closePath()
        .fill(0x8a5a32)
        .stroke(stroke(w));
      for (const x of [-0.35, 0, 0.35])
        g.moveTo(h * x - h * 0.1, -h * 0.5)
          .lineTo(h * x + h * 0.1, -h * 0.1)
          .stroke({ width: w * 0.6, color: darken(0x8a5a32, 0.35) });
      g.moveTo(0, -h * 0.7)
        .quadraticCurveTo(h * 0.05, -h * 0.95, h * 0.25, -h * 1.0)
        .stroke(stroke(w));
      g.ellipse(-h * 0.25, h * 0.3, h * 0.08, h * 0.2).fill({ color: 0xffffff, alpha: 0.6 });
      return;
    }
    case 'page_recipes': {
      // A hammer.
      g.moveTo(-h * 0.6, h * 0.75)
        .lineTo(h * 0.15, -h * 0.1)
        .stroke({ width: h * 0.34, color: OUTLINE, cap: 'round' });
      g.moveTo(-h * 0.6, h * 0.75)
        .lineTo(h * 0.15, -h * 0.1)
        .stroke({ width: h * 0.2, color: 0xc98d52, cap: 'round' });
      const c = Math.cos(-Math.PI / 4);
      const sn = Math.sin(-Math.PI / 4);
      const p = (x: number, y: number): [number, number] => [
        h * 0.25 + x * c - y * sn,
        -h * 0.25 + x * sn + y * c,
      ];
      g.poly([
        ...p(-h * 0.55, -h * 0.25),
        ...p(h * 0.55, -h * 0.25),
        ...p(h * 0.55, h * 0.25),
        ...p(-h * 0.55, h * 0.25),
      ])
        .fill(0x9aa3b5)
        .stroke(stroke(w));
      g.poly([
        ...p(-h * 0.5, -h * 0.2),
        ...p(h * 0.5, -h * 0.2),
        ...p(h * 0.5, -h * 0.05),
        ...p(-h * 0.5, -h * 0.05),
      ]).fill({
        color: 0xffffff,
        alpha: 0.5,
      });
      return;
    }
    case 'page_potions':
      drawGlyph(g, 'bottle', 0, 0, s);
      return;
    case 'page_secrets': {
      // A keyhole on a brass plate.
      g.roundRect(-h * 0.6, -h * 0.85, h * 1.2, h * 1.7, h * 0.35)
        .fill(0xf2c14e)
        .stroke(stroke(w));
      g.circle(0, -h * 0.2, h * 0.26).fill(OUTLINE);
      g.poly([-h * 0.16, -h * 0.05, h * 0.16, -h * 0.05, h * 0.26, h * 0.55, -h * 0.26, h * 0.55]).fill(
        OUTLINE,
      );
      g.circle(-h * 0.35, -h * 0.6, h * 0.08).fill({ color: 0xffffff, alpha: 0.7 });
      return;
    }
    case 'page_mysteries': {
      // A magnifying glass.
      g.moveTo(h * 0.25, h * 0.25)
        .lineTo(h * 0.85, h * 0.85)
        .stroke({ width: h * 0.36, color: OUTLINE, cap: 'round' });
      g.moveTo(h * 0.3, h * 0.3)
        .lineTo(h * 0.82, h * 0.82)
        .stroke({ width: h * 0.2, color: 0x8a5a32, cap: 'round' });
      g.circle(-h * 0.15, -h * 0.15, h * 0.6)
        .fill(0xbfe7ff)
        .stroke(stroke(w * 1.3));
      g.arc(-h * 0.15, -h * 0.15, h * 0.4, Math.PI * 1.05, Math.PI * 1.45).stroke({
        width: w,
        color: 0xffffff,
        cap: 'round',
      });
      return;
    }
    case 'page_photos':
      cameraIcon(g, s * 1.05);
      return;
    case 'page_map':
      drawGlyph(g, 'map', 0, 0, s);
      return;
    case 'home':
      drawGlyph(g, 'stars', 0, 0, s);
      return;
  }
}

/** A pictogram for each item group's header on the items page. */
export function drawGroupIcon(g: Graphics, group: string, s: number): void {
  const h = s / 2;
  switch (group) {
    case 'food':
      g.circle(-h * 0.25, h * 0.15, h * 0.42)
        .fill(0xe8453c)
        .stroke(stroke(3));
      g.circle(h * 0.3, h * 0.25, h * 0.38)
        .fill(0x4d7cff)
        .stroke(stroke(3));
      g.ellipse(-h * 0.1, -h * 0.4, h * 0.3, h * 0.14)
        .fill(0x7bd84a)
        .stroke(stroke(2.5));
      return;
    case 'toys':
      drawPicto(g, 'spring', 0, 0, s);
      return;
    case 'music':
      drawGlyph(g, 'notes3', 0, 0, s);
      return;
    case 'hats':
      drawGlyph(g, 'hat', 0, 0, s);
      return;
    case 'paints':
      for (const [dx, c] of [
        [-0.45, 0xe8453c],
        [0, 0xffd23f],
        [0.45, 0x4d7cff],
      ] as const)
        g.ellipse(h * dx, h * 0.2, h * 0.3, h * 0.2)
          .fill(c)
          .stroke(stroke(2.5));
      g.moveTo(-h * 0.6, -h * 0.6)
        .lineTo(h * 0.3, -h * 0.1)
        .stroke({ width: 7, color: OUTLINE, cap: 'round' });
      g.moveTo(-h * 0.6, -h * 0.6)
        .lineTo(h * 0.3, -h * 0.1)
        .stroke({ width: 4, color: 0xc98d52, cap: 'round' });
      return;
    case 'treasures':
      drawGlyph(g, 'crown', 0, 0, s);
      return;
    default:
      // Stuff: a pebble, a button, and a twig.
      g.ellipse(-h * 0.25, h * 0.25, h * 0.45, h * 0.3)
        .fill(0x9aa3b5)
        .stroke(stroke(3));
      g.circle(h * 0.4, -h * 0.1, h * 0.3)
        .fill(0xff8fab)
        .stroke(stroke(3));
      for (const [x, y] of [
        [0.33, -0.17],
        [0.47, -0.03],
      ] as const)
        g.circle(h * x, h * y, h * 0.06).fill(OUTLINE);
      return;
  }
}

/** One essence as a colored drop; `known` false draws it grey with a "?". */
export function drawEssence(
  g: Graphics,
  ess: EssenceId | null,
  x: number,
  y: number,
  r: number,
  known = true,
): void {
  const color = known && ess ? ESSENCE_COLORS[ess] : 0xb8aecb;
  g.moveTo(x, y - r * 1.5)
    .bezierCurveTo(x + r * 0.4, y - r * 0.85, x + r, y - r * 0.4, x + r, y + r * 0.15)
    .arc(x, y + r * 0.15, r, 0, Math.PI)
    .bezierCurveTo(x - r, y - r * 0.4, x - r * 0.4, y - r * 0.85, x, y - r * 1.5)
    .closePath()
    .fill(color)
    .stroke(stroke(Math.max(2.5, r * 0.16)));
  g.ellipse(x - r * 0.35, y - r * 0.05, r * 0.18, r * 0.3).fill({ color: 0xffffff, alpha: 0.75 });
  if (!known) questionMark(g, x, y + r * 0.15, r * 1.1, 0xffffff);
}

/** A recipe ingredient's picture. */
export function inputBuilder(input: RecipeInput, content: Content): { build: () => Container; size: number } {
  if (typeof input === 'string') {
    const def = content.items.tryGet(input);
    if (def) return { build: itemBuilder(def), size: itemSize(def) };
  } else if ('anyOf' in input) {
    const def = content.items.tryGet(input.anyOf[0] ?? '');
    if (def) return { build: itemBuilder(def), size: itemSize(def) };
  } else {
    const tag = input.tag;
    return {
      build: () => {
        const g = new Graphics();
        drawTagIcon(g, tag, 0, 0, 60);
        return g;
      },
      size: 60,
    };
  }
  return {
    build: () => {
      const g = new Graphics();
      questionMark(g, 0, 0, 50, 0x4d9bff);
      return g;
    },
    size: 50,
  };
}

/** Which glyph shows each potion's effect next to a little bug face. */
const EFFECT_GLYPH: Partial<Record<PotionEffect, Parameters<typeof drawGlyph>[1]>> = {
  floaty: 'cloud',
  balloon: 'chubby',
  glow: 'light',
  rainbow: 'rainbow',
  sticky_feet: 'feet',
  burp: 'drops3',
  bubble: 'drops5',
  bubble_burp: 'drops5',
  heavy: 'boot',
  bouncy: 'spring_big',
  speedy: 'arcs',
  slowmo: 'worm',
  sleepy: 'moon',
  opera: 'notes3',
  squeaky: 'squeak',
  upside_down: 'flip',
  copycat: 'blinks',
  hairy: 'root',
  magnet: 'coins',
  ghost: 'ghost',
  rocket: 'rocket_bug',
  snowball: 'snow',
  wings: 'moth',
  jelly: 'drop',
  wobble: 'flip',
  sludge: 'leaf_bitten',
  water: 'drop',
};

/** A potion's effect: a little bug face showing it. */
export function drawEffect(g: Graphics, effect: PotionEffect, s: number, dot: BugDef | undefined): void {
  const h = s / 2;
  const face = (k: number, dx = 0, dy = 0): void => {
    if (dot) drawFriend(g, dot, dx, dy, s * k);
  };
  switch (effect) {
    case 'giant':
      face(0.95, 0, h * 0.05);
      drawPicto(g, 'up', h * 0.7, -h * 0.6, s * 0.4);
      return;
    case 'tiny':
      face(0.38, 0, h * 0.35);
      for (const dx of [-0.6, 0.6]) drawPicto(g, 'up', h * dx, -h * 0.35, s * 0.3);
      return;
    case 'fire_breath':
      face(0.62, -h * 0.25, 0);
      drawPicto(g, 'fire', h * 0.55, h * 0.1, s * 0.45);
      return;
    case 'frosty':
      face(0.62, -h * 0.15, h * 0.1);
      drawPicto(g, 'snow', h * 0.55, -h * 0.5, s * 0.4);
      return;
    case 'stinky':
      face(0.62, -h * 0.15, h * 0.1);
      drawPicto(g, 'stink', h * 0.55, -h * 0.5, s * 0.45);
      return;
    case 'paint':
      face(0.7, 0, h * 0.05);
      for (const [dx, dy, c] of [
        [-0.55, -0.45, 0xe8453c],
        [0.6, -0.4, 0xffd23f],
        [0.55, 0.55, 0x4d7cff],
      ] as const)
        g.circle(h * dx, h * dy, h * 0.17)
          .fill(c)
          .stroke(stroke(2.5));
      return;
    default: {
      face(0.62, -h * 0.15, h * 0.12);
      const glyph = EFFECT_GLYPH[effect] ?? 'stars';
      drawGlyph(g, glyph, h * 0.55, -h * 0.5, s * 0.45);
    }
  }
}

/** The potion's essence colors, or the rainbow's, for a recipe-less potion. */
export function potionDrops(recipe: readonly EssenceId[], effect: PotionEffect): (EssenceId | null)[] {
  if (recipe.length > 0) return [...recipe];
  // Potions from a rule rather than a recipe show a swirl of mixed drops.
  return effect === 'rainbow' ? ['ess_hot', 'ess_speed', 'ess_grow', 'ess_cold'] : [null, null];
}

/** The gold ladybug stamp for a finished book (section 13). */
export function drawGoldLadybug(g: Graphics, r: number): void {
  g.circle(0, 0, r)
    .fill(0xf2c14e)
    .stroke(stroke(Math.max(3, r * 0.12)));
  g.circle(0, 0, r * 0.82).stroke({ width: r * 0.06, color: 0xb8862a });
  g.circle(r * 0.32, -r * 0.05, r * 0.2).fill(0x8a5a1a);
  g.circle(-r * 0.05, r * 0.05, r * 0.42)
    .fill(0xffe08a)
    .stroke({ width: r * 0.07, color: 0x8a5a1a });
  g.moveTo(-r * 0.05, -r * 0.35)
    .lineTo(-r * 0.05, r * 0.46)
    .stroke({ width: r * 0.06, color: 0x8a5a1a });
  for (const [x, y] of [
    [-0.25, -0.1],
    [0.12, -0.08],
    [-0.22, 0.22],
    [0.1, 0.24],
  ] as const)
    g.circle(r * x, r * y, r * 0.07).fill(0x8a5a1a);
  g.star(-r * 0.55, -r * 0.55, 4, r * 0.22, r * 0.07).fill(0xffffff);
}

/** A soft round glow dot (the jar's fireflies). */
export function glowDot(g: Graphics, x: number, y: number, r: number, color = 0xfff36b): void {
  g.circle(x, y, r * 1.9).fill({ color, alpha: 0.18 });
  g.circle(x, y, r * 1.35).fill({ color, alpha: 0.3 });
  g.circle(x, y, r).fill(color);
  g.circle(x - r * 0.3, y - r * 0.3, r * 0.35).fill({ color: 0xffffff, alpha: 0.85 });
}

/**
 * A glass jar of glowing dots, `s` across, filled to `fill` (0 to 1): the
 * journal's completion jar, small, for the menu's slot signs.
 */
export function drawDotJar(g: Graphics, s: number, fill: number): void {
  const k = s / 100;
  const w = 52 * k;
  const h = 68 * k;
  g.roundRect(-w / 2, -h / 2, w, h, 12 * k).fill({ color: 0xe8f6ff, alpha: 0.95 });
  const n = fill <= 0 ? 0 : fill >= 1 ? 20 : Math.max(1, Math.min(19, Math.round(20 * fill)));
  for (const p of jarDots(n, w - 8 * k, h - 8 * k, 5 * k)) glowDot(g, p.x, p.y, 4.4 * k);
  g.roundRect(-w / 2, -h / 2, w, h, 12 * k).stroke(stroke(4.5 * k));
  g.roundRect(-w / 2 - 3 * k, -h / 2 - 10 * k, w + 6 * k, 12 * k, 4 * k)
    .fill(0xff9f1c)
    .stroke(stroke(4 * k));
  g.moveTo(-w / 2 + 8 * k, -h / 2 + 10 * k)
    .lineTo(-w / 2 + 8 * k, h / 2 - 16 * k)
    .stroke({ width: 4 * k, color: 0xffffff, alpha: 0.7, cap: 'round' });
}

/** A star color for sparkles. */
export const SPARKLE = STAR;
