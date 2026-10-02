import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Content } from '../../../game/data';
import { ESSENCE_IDS, ESSENCE_ITEMS, ESSENCE_TAGS, MOON_ITEMS } from '../../../game/data/essences';
import type { BugCard, JournalBook, JournalEntry, MysteryPage, PageId, PhotoRecord } from '../../../game';
import { PAGE_IDS } from '../../../game';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';
import { drawNumber } from '../render/draw/digits';
import { drawAreaIcon, drawGlyph } from '../render/draw/glyphs';
import { drawFriend, drawPicto } from '../render/draw/pictogram';
import { drawTagIcon } from '../render/draw/tagIcon';
import { markUi } from '../ui/button';
import { cameraIcon } from '../ui/photoButtons';
import {
  ESSENCE_COLORS,
  INK,
  PAPER,
  PAPER_LINE,
  Picture,
  SILHOUETTE,
  bugBuilder,
  drawDateStamp,
  drawEffect,
  drawEssence,
  drawGoldLadybug,
  drawGroupIcon,
  drawTabIcon,
  glowDot,
  hintNode,
  hintRow,
  inputBuilder,
  itemBuilder,
  potionDrops,
  questionMark,
  twinkle,
} from './entryArt';
import type { Side } from './layout';
import { jarDotCount, jarDots, mapLayout, pageCounts, percentText } from './layout';
import { fitLabel, label } from './text';

/** One page of the open book, in view pixels. */
export const PAGE_W = 720;
export const PAGE_H = 840;

/** Tab colors, one per page (the bookmarks down the right edge). */
export const TAB_COLORS: Record<PageId, number> = {
  page_bugs: 0xe8453c,
  page_items: 0xff9f1c,
  page_recipes: 0x9a6436,
  page_potions: 0x9b6bd6,
  page_secrets: 0x1f9e93,
  page_mysteries: 0x3c6fd6,
  page_photos: 0xff7ab0,
  page_map: 0x5cc85a,
};

/** An entry on a page, for the reveal and the test hook. */
export interface EntryView {
  entry: JournalEntry;
  /** What wiggles when clicked. */
  node: Container;
  picture: Picture | null;
  /** Art that is not a Picture but still comes into color in the reveal. */
  tintNode: Container | null;
  /** The date stamp, the label, and the "new!" badge: hidden until the reveal shows them. */
  stamp: Container | null;
  label: Container | null;
  badge: Container | null;
  /** Where a sparkling entry's extra pictogram goes once opened. */
  extraAt: { x: number; y: number; s: number } | null;
  sparkle: Graphics | null;
  /** Where its twinkles circle, if it sparkles. */
  sparkleAt: { x: number; y: number; w: number; h: number } | null;
  /** Reveal clock in seconds, or -1 when not revealing. */
  t: number;
  wiggle: number;
}

interface EntryOpts {
  picture?: Picture | null;
  tintNode?: Container | null;
  stamp?: Container | null;
  label?: Container | null;
  badgeAt?: { x: number; y: number } | null;
  extraAt?: EntryView['extraAt'];
  sparkleAt?: EntryView['sparkleAt'];
  tap?: () => void;
}

export interface SideHooks {
  content: Content;
  book: JournalBook;
  photos: readonly PhotoRecord[];
  /** Areas the map may jump to (found, and in the registry). */
  canTravel(areaId: string): boolean;
  /** The camera's middle, in world meters, for the map's "you are here". */
  cameraCenter: number;
  /** Is this key newly found (it reveals when the page settles)? */
  revealing(key: string): boolean;
  /** Has the player opened this sparkling entry? */
  opened(key: string): boolean;
  tapEntry(view: EntryView): void;
  travel(areaId: string): void;
  openTab(page: PageId): void;
  /** Named controls for the test hook. */
  name(name: string, node: Container): void;
}

export interface SideView {
  root: Container;
  entries: EntryView[];
  pictures: Picture[];
  /** Per-frame motion (twinkles, glowing dots). */
  tick: ((time: number, dt: number) => void)[];
  /** Masked containers, unmasked before the side is destroyed. */
  masked: Container[];
}

/** Take a side down: masks off first, then everything in it. */
export function disposeSide(view: SideView): void {
  if (view.root.destroyed) return;
  for (const c of view.masked) if (!c.destroyed) c.mask = null;
  view.root.destroy({ children: true });
}

/** Paper for one side: cream, a faint dot grid, the gutter's shade, and page edges. */
function drawPaper(g: Graphics, which: 'left' | 'right'): void {
  const r = 22;
  // Page edges peeking out under the top page.
  for (const k of [3, 2, 1]) {
    const dx = which === 'left' ? -k * 4 : k * 4;
    g.roundRect(dx, k * 3, PAGE_W, PAGE_H, r).fill(darken(PAPER, 0.06 + k * 0.03));
  }
  g.roundRect(0, 0, PAGE_W, PAGE_H, r).fill(PAPER);
  for (let y = 60; y < PAGE_H - 30; y += 44)
    for (let x = 44; x < PAGE_W - 30; x += 44) g.circle(x, y, 2.2).fill(PAPER_LINE);
  // The gutter: darker toward the spine.
  for (let i = 0; i < 8; i++) {
    const w = 10 + i * 8;
    const x = which === 'left' ? PAGE_W - w : 0;
    g.rect(x, 0, w, PAGE_H).fill({ color: 0x8a6a4a, alpha: 0.035 });
  }
  g.roundRect(0, 0, PAGE_W, PAGE_H, r).stroke({ width: 3, color: darken(PAPER, 0.25) });
}

function on(node: Container, tap: () => void): Container {
  markUi(node);
  node.eventMode = 'static';
  node.cursor = 'pointer';
  node.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
  node.on('pointertap', (e: FederatedPointerEvent) => {
    e.stopPropagation();
    tap();
  });
  return node;
}

/** A "new!" tag: the one written word besides labels, red with a white outline. */
export function newBadge(): Container {
  const c = new Container();
  const g = new Graphics();
  g.star(0, 0, 10, 40, 30, 0.1).fill(0xff3b4a).stroke(stroke(4));
  c.addChild(g);
  const t = label('new!', 22, 0xffffff);
  t.rotation = -0.18;
  c.addChild(t);
  return c;
}

function stampNode(entry: JournalEntry, r: number, ink?: number): Container | null {
  if (!entry.stamp) return null;
  const g = new Graphics();
  drawDateStamp(g, entry.stamp, r, ink);
  g.rotation = (((entry.key.length * 37) % 11) - 5) * 0.04;
  return g;
}

function dashedCircle(g: Graphics, x: number, y: number, r: number, color = INK, alpha = 0.5): void {
  const n = Math.max(8, Math.round(r / 5));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI / n) * 1.1;
    g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r)
      .arc(x, y, r, a0, a1)
      .stroke({ width: 3, color, alpha, cap: 'round' });
  }
}

/** Build the view for one side, in page pixels (0 to PAGE_W, 0 to PAGE_H). */
export function buildSide(side: Side, which: 'left' | 'right', hooks: SideHooks): SideView {
  const root = new Container();
  const paper = new Graphics();
  drawPaper(paper, which);
  root.addChild(paper);
  const view: SideView = { root, entries: [], pictures: [], tick: [], masked: [] };
  const b = new Builder(view, hooks);
  switch (side.kind) {
    case 'blank':
      b.doodle(which);
      break;
    case 'jar':
      b.jar();
      break;
    case 'contents':
      b.contents();
      break;
    case 'bugs':
      side.cards.forEach((i, k) => b.bugCard(hooks.book.bugs[i]!, 30 + k * 400));
      break;
    case 'items':
      b.items(side.group, side.entries);
      break;
    case 'recipes':
      side.entries.forEach((i, k) => b.recipe(hooks.book.recipes[i]!, 40 + k * 196));
      break;
    case 'essences':
      b.essences();
      break;
    case 'potions':
      side.entries.forEach((i, k) => b.potion(hooks.book.potions[i]!, 30 + k * 160));
      break;
    case 'secrets':
      b.secrets(side.area, side.entries);
      break;
    case 'mystery':
      b.mystery(hooks.book.mysteries[side.index]!, side.index);
      break;
    case 'photos':
      b.photos(side.photos);
      break;
    case 'map':
      b.map(which);
      break;
  }
  return view;
}

/** Picture textures by data URL, loaded once each. */
const textures = new Map<string, Promise<Texture | null>>();

export function textureOf(dataUrl: string): Promise<Texture | null> {
  let p = textures.get(dataUrl);
  if (!p) {
    p = new Promise<Texture | null>((resolve) => {
      if (!dataUrl.startsWith('data:image/')) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(Texture.from(img));
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    textures.set(dataUrl, p);
  }
  return p;
}

/** A round push pin with a shine. */
export function pin(g: Graphics, x: number, y: number, color: number): void {
  g.circle(x + 2, y + 5, 13).fill({ color: OUTLINE, alpha: 0.3 });
  g.circle(x, y, 13).fill(color).stroke(stroke(4));
  g.circle(x - 4, y - 4, 4).fill({ color: 0xffffff, alpha: 0.7 });
}

/** A strip of tape holding something to the page. */
function tape(g: Graphics, x: number, y: number, rot: number, w = 90): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const p = (px: number, py: number): [number, number] => [x + px * c - py * s, y + px * s + py * c];
  g.poly([...p(-w / 2, -14), ...p(w / 2, -14), ...p(w / 2, 14), ...p(-w / 2, 14)]).fill({
    color: 0xfff0b0,
    alpha: 0.75,
  });
}

class Builder {
  constructor(
    private readonly view: SideView,
    private readonly hooks: SideHooks,
  ) {}

  private get root(): Container {
    return this.view.root;
  }

  private add<T extends Container>(c: T, x = 0, y = 0): T {
    c.position.set(x, y);
    this.root.addChild(c);
    return c;
  }

  private g(x = 0, y = 0): Graphics {
    return this.add(new Graphics(), x, y);
  }

  /** Register an entry's parts. Found-and-new ones start dark for the reveal. */
  private entryView(entry: JournalEntry, node: Container, o: EntryOpts = {}): EntryView {
    const revealing = this.hooks.revealing(entry.key);
    let badge: Container | null = null;
    if (o.badgeAt && (entry.isNew || revealing)) {
      badge = newBadge();
      badge.position.set(o.badgeAt.x, o.badgeAt.y);
      node.addChild(badge);
    }
    const picture = o.picture ?? null;
    if (picture) this.view.pictures.push(picture);
    const v: EntryView = {
      entry,
      node,
      picture,
      tintNode: o.tintNode ?? null,
      stamp: o.stamp ?? null,
      label: o.label ?? null,
      badge,
      extraAt: o.extraAt ?? null,
      sparkle: null,
      sparkleAt: o.sparkleAt ?? null,
      t: -1,
      wiggle: 0,
    };
    if (revealing) {
      picture?.reveal(0);
      if (v.tintNode) v.tintNode.tint = SILHOUETTE;
      if (v.stamp) v.stamp.visible = false;
      if (v.label) v.label.alpha = 0;
      if (badge) badge.visible = false;
    }
    if (entry.sparkle && v.sparkleAt) {
      const sp = new Graphics();
      sp.position.set(v.sparkleAt.x, v.sparkleAt.y);
      node.addChildAt(sp, 0);
      v.sparkle = sp;
    }
    on(node, o.tap ?? (() => this.hooks.tapEntry(v)));
    this.hooks.name(`journal_entry_${entry.key}`, node);
    this.view.entries.push(v);
    return v;
  }

  /** Big header: an icon and an optional label, top of the page. */
  private header(
    draw: (g: Graphics) => void,
    text: string | null,
    count?: { found: number; total: number },
  ): void {
    const g = this.g(70, 62);
    draw(g);
    if (text) this.add(fitLabel(text, 38, 380), 330, 62);
    if (count) this.count(count, PAGE_W - 110, 62, 34);
    const line = this.g();
    line
      .moveTo(40, 112)
      .lineTo(PAGE_W - 40, 112)
      .stroke({ width: 4, color: PAPER_LINE, cap: 'round' });
  }

  /** "found/total" in drawn digits on a cream pill. */
  private count(c: { found: number; total: number }, x: number, y: number, h: number): void {
    const g = this.g(x, y);
    const text = `${c.found}/${c.total}`;
    const w = text.length * h * 0.84 + h * 0.6;
    g.roundRect(-w / 2, -h * 0.85, w, h * 1.7, h * 0.85)
      .fill(c.found === c.total && c.total > 0 ? 0xffe27a : 0xfffbef)
      .stroke(stroke(4));
    drawNumber(g, text, 0, 0, h, c.found > 0 ? 0x5cc85a : 0xd8cfe6);
  }

  /** Something to look at on an empty page: a doodled bug trail and a leaf. */
  doodle(which: 'left' | 'right'): void {
    const g = this.g(PAGE_W / 2, PAGE_H / 2);
    g.alpha = 0.35;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      g.circle(-200 + t * 400, 120 - Math.sin(t * Math.PI * 2) * 60, 7).fill(INK);
    }
    drawGlyph(g, 'leaf_bitten', which === 'left' ? -120 : 140, -120, 160);
  }

  /** The first page: the big jar with glowing dots and the percentage. */
  jar(): void {
    const { completion } = this.hooks.book;
    const cx = PAGE_W / 2;
    const cy = 450;
    const w = 420;
    const h = 520;
    const g = this.g(cx, cy);
    // Shadow, glass, the lid, and a cork-colored label with the percentage.
    g.ellipse(0, h / 2 + 10, w * 0.55, 30).fill({ color: OUTLINE, alpha: 0.15 });
    g.roundRect(-w / 2, -h / 2, w, h, 70).fill({ color: 0xe8f6ff, alpha: 0.9 });
    const dots = new Graphics();
    this.add(dots, cx, cy);
    const n = jarDotCount(completion.found, completion.total, 150);
    const spots = jarDots(n, w - 50, h - 60, 14);
    const glass = this.g(cx, cy);
    glass.roundRect(-w / 2, -h / 2, w, h, 70).stroke(stroke(8));
    glass
      .moveTo(-w / 2 + 40, -h / 2 + 70)
      .lineTo(-w / 2 + 40, h / 2 - 90)
      .stroke({ width: 14, color: 0xffffff, alpha: 0.65, cap: 'round' });
    glass
      .roundRect(-w / 2 - 16, -h / 2 - 52, w + 32, 60, 20)
      .fill(0xff9f1c)
      .stroke(stroke(7));
    glass.roundRect(-w / 2 - 6, -h / 2 - 44, w + 12, 14, 7).fill({ color: 0xffffff, alpha: 0.35 });
    // A ladybug sitting on the lid.
    glass
      .circle(w / 2 - 50, -h / 2 - 62, 22)
      .fill(0xe8453c)
      .stroke(stroke(4));
    glass.circle(w / 2 - 28, -h / 2 - 66, 11).fill(OUTLINE);
    glass.circle(w / 2 - 58, -h / 2 - 66, 4.5).fill(OUTLINE);
    glass.circle(w / 2 - 44, -h / 2 - 54, 4.5).fill(OUTLINE);
    const tag = this.g(cx, cy + 40);
    tag.roundRect(-150, -70, 300, 140, 26).fill(PAPER).stroke(stroke(6));
    tag.rotation = -0.04;
    drawNumber(tag, percentText(completion.found, completion.total), 0, 0, 84, 0xffc94d);
    const phase = spots.map((_, i) => (i * 1.618) % (Math.PI * 2));
    this.view.tick.push((time) => {
      dots.clear();
      spots.forEach((p, i) => {
        const pulse = 0.85 + 0.15 * Math.sin(time * 2.2 + phase[i]!);
        glowDot(dots, p.x, p.y + Math.sin(time * 1.3 + phase[i]!) * 2, 11 * pulse);
      });
    });
    if (completion.total > 0 && completion.found >= completion.total) {
      const gold = this.g(cx + 170, cy + 210);
      drawGoldLadybug(gold, 70);
      gold.rotation = 0.2;
    }
  }

  /** Beside the jar: each tab with its count, a row to click. */
  contents(): void {
    const counts = pageCounts(this.hooks.book, this.hooks.photos.length);
    PAGE_IDS.forEach((page, i) => {
      const row = new Container();
      this.add(row, 0, 90 + i * 94);
      const g = new Graphics();
      row.addChild(g);
      g.roundRect(40, -40, PAGE_W - 80, 80, 24).fill({ color: lighten(TAB_COLORS[page], 0.8), alpha: 0.7 });
      g.circle(90, 0, 34).fill(0xfffbef).stroke(stroke(4));
      const icon = new Graphics();
      drawTabIcon(icon, page, 46);
      icon.position.set(90, 0);
      row.addChild(icon);
      const c = counts[page];
      const k = c.total === 0 ? 0 : c.found / c.total;
      const barX = 150;
      const barW = 300;
      g.roundRect(barX, -14, barW, 28, 14).fill(0xfffbef).stroke(stroke(4));
      if (k > 0) g.roundRect(barX + 4, -10, Math.max(20, (barW - 8) * k), 20, 10).fill(TAB_COLORS[page]);
      const n = new Graphics();
      drawNumber(n, page === 'page_photos' ? String(c.found) : `${c.found}/${c.total}`, 0, 0, 30, 0xffffff);
      n.position.set(560, 0);
      row.addChild(n);
      const fresh = this.hooks.book.fresh[page];
      if (fresh > 0) {
        const bdg = newBadge();
        bdg.scale.set(0.8);
        bdg.position.set(PAGE_W - 70, -18);
        row.addChild(bdg);
      }
      on(row, () => this.hooks.openTab(page));
      row.hitArea = {
        contains: (x: number, y: number) => x >= 40 && x <= PAGE_W - 40 && y >= -42 && y <= 42,
      };
      this.hooks.name(`journal_contents_${page}`, row);
    });
  }

  /** A bug's card: portrait, name, stamp, and the observation slots. */
  bugCard(card: BugCard, top: number): void {
    const { content } = this.hooks;
    const e = card.entry;
    const def = content.bugs.get(e.id);
    const node = new Container();
    this.add(node, 0, top);
    const found = e.state === 'discovered';
    const g = new Graphics();
    node.addChild(g);
    const rot = ((e.key.length % 5) - 2) * 0.006;
    node.rotation = rot;
    g.roundRect(34, 6, PAGE_W - 60, 370, 22).fill({ color: OUTLINE, alpha: 0.12 });
    g.roundRect(30, 0, PAGE_W - 60, 370, 22)
      .fill(found ? 0xfffdf6 : 0xf1ebe0)
      .stroke(stroke(5));
    // The portrait in a frame.
    g.roundRect(52, 24, 236, 236, 26)
      .fill(found ? lighten(def.body, 0.75) : 0xd9d0e3)
      .stroke(stroke(5));
    tape(g, 170, 26, -0.08);
    const picture = new Picture(
      bugBuilder(def),
      196,
      196,
      e.state,
      0xffd23f,
      def,
      card.form === 'butterfly' ? 'butterfly' : undefined,
    );
    picture.position.set(170, 142);
    node.addChild(picture);
    if (!found) {
      const q = new Graphics();
      questionMark(q, 170, 130, 90);
      node.addChild(q);
      const hints = hintRow([...e.hint, ...(card.form ? [] : [])], 54, content);
      hints.position.set(170, 312);
      node.addChild(hints);
    }
    const lbl = found ? fitLabel(e.label, 40, 230, 0xffffff) : null;
    if (lbl) {
      lbl.position.set(170, 310);
      node.addChild(lbl);
    }
    const stamp = stampNode(e, 34);
    stamp?.position.set(268, 46);
    if (stamp) node.addChild(stamp);
    // Observation slots.
    const slot = (
      x: number,
      y: number,
      filled: string | null,
      iconDraw: ((gg: Graphics) => void) | null,
    ): void => {
      const s = new Graphics();
      s.position.set(x, y);
      node.addChild(s);
      if (filled) {
        s.circle(0, 0, 40).fill(0xfffbef).stroke(stroke(4));
        const thing = hintNode(filled, 58, content);
        thing.position.set(x, y);
        node.addChild(thing);
      } else {
        s.circle(0, 0, 40).fill({ color: 0xffffff, alpha: found ? 0.6 : 0.25 });
        dashedCircle(s, 0, 0, 40, INK, found ? 0.45 : 0.2);
        if (iconDraw) {
          const ic = new Graphics();
          iconDraw(ic);
          ic.alpha = found ? 0.3 : 0.12;
          ic.position.set(x, y);
          node.addChild(ic);
        }
      }
    };
    const rowIcon = (x: number, y: number, draw: (gg: Graphics) => void): void => {
      const ic = new Graphics();
      draw(ic);
      ic.position.set(x, y);
      ic.alpha = found ? 1 : 0.35;
      node.addChild(ic);
    };
    const X0 = 330;
    rowIcon(X0, 72, (gg) => drawPicto(gg, 'heart', 0, 0, 44));
    card.loved.forEach((f, i) => slot(X0 + 72 + i * 92, 72, f, null));
    rowIcon(X0, 180, (gg) => drawPicto(gg, 'yuck', 0, 0, 44));
    card.disliked.forEach((f, i) => slot(X0 + 72 + i * 92, 180, f, null));
    if (card.weird) {
      rowIcon(X0 + 72 + 2 * 92 + 2, 140, (gg) => drawPicto(gg, 'swirl', 0, 0, 30));
      slot(X0 + 72 + 2 * 92, 180, card.weird.seen ? card.weird.food : null, (gg) =>
        questionMark(gg, 0, 0, 40, 0x9b6bd6),
      );
    }
    slot(X0 + 72, 290, card.toy, (gg) => drawPicto(gg, 'spring', 0, 0, 44));
    slot(X0 + 72 + 92, 290, card.place, (gg) => drawGlyph(gg, 'map', 0, 0, 46));
    slot(X0 + 72 + 184, 290, null, (gg) => cameraIcon(gg, 52));
    if (card.photo) {
      const p = new Graphics();
      p.position.set(X0 + 72 + 184, 290);
      p.roundRect(-30, -34, 60, 66, 4).fill(0xffffff).stroke(stroke(4));
      p.rect(-24, -28, 48, 40).fill(lighten(def.body, 0.5));
      drawFriend(p, def, 0, -8, 34);
      p.rotation = 0.12;
      node.addChild(p);
    }
    this.entryView(e, node, {
      picture,
      stamp,
      label: lbl,
      badgeAt: { x: 70, y: 30 },
      extraAt: { x: 170, y: 250, s: 50 },
      sparkleAt: { x: 170, y: 142, w: 220, h: 220 },
    });
  }

  /** Six items in a grid, under their group's header. */
  items(group: string, entries: number[]): void {
    const { book, content } = this.hooks;
    const all = book.items.filter((e) => e.group === group);
    this.header((g) => drawGroupIcon(g, group, 64), null, {
      found: all.filter((e) => e.state === 'discovered').length,
      total: all.length,
    });
    entries.forEach((i, k) => {
      const e = book.items[i]!;
      const def = content.items.get(e.id);
      const col = k % 2;
      const row = Math.floor(k / 2);
      const cx = 190 + col * 340;
      const top = 140 + row * 232;
      const node = new Container();
      this.add(node, cx, top);
      const g = new Graphics();
      node.addChild(g);
      const found = e.state === 'discovered';
      g.roundRect(-150, 0, 300, 214, 26).fill({
        color: found ? 0xffffff : 0xece4d8,
        alpha: found ? 0.75 : 0.6,
      });
      const picture = new Picture(itemBuilder(def), 150, 120, e.state);
      picture.position.set(0, 84);
      node.addChild(picture);
      if (!found) {
        const q = new Graphics();
        questionMark(q, 0, 84, 54);
        node.addChild(q);
      }
      const lbl = found ? fitLabel(e.label, 30, 270, 0xffffff) : null;
      if (lbl) {
        lbl.position.set(0, 180);
        node.addChild(lbl);
      }
      const stamp = stampNode(e, 26);
      stamp?.position.set(112, 34);
      if (stamp) node.addChild(stamp);
      this.entryView(e, node, {
        picture,
        stamp,
        label: lbl,
        badgeAt: { x: -112, y: 26 },
        sparkleAt: { x: 0, y: 84, w: 200, h: 160 },
      });
    });
  }

  /** A recipe as a picture equation: A + B (+ C) = D. */
  recipe(e: JournalEntry, top: number): void {
    const { content } = this.hooks;
    const def = content.recipes.get(e.id);
    const out = content.items.tryGet(def.output);
    const node = new Container();
    this.add(node, 0, top);
    const g = new Graphics();
    node.addChild(g);
    g.roundRect(30, 0, PAGE_W - 60, 180, 30).fill({
      color: 0xffffff,
      alpha: e.state === 'discovered' ? 0.7 : 0.4,
    });
    const n = def.inputs.length;
    const box = n === 3 ? 96 : 116;
    const op = 44;
    const totalW = (n + 1) * box + n * op;
    let x = (PAGE_W - totalW) / 2 + box / 2;
    const cy = 82;
    const pictures: Picture[] = [];
    def.inputs.forEach((input, i) => {
      if (e.state === 'unknown') {
        dashedCircle(g, x, cy, box * 0.42, INK, 0.45);
        questionMark(g, x, cy, box * 0.42, 0xd8cfe6);
      } else {
        const ib = inputBuilder(input, content);
        const pic = new Picture(
          ib.build,
          box * 0.85,
          box * 0.85,
          e.state === 'hinted' ? 'hinted' : 'discovered',
          0x4d9bff,
        );
        pic.position.set(x, cy);
        node.addChild(pic);
        pictures.push(pic);
        if (typeof input === 'object' && 'anyOf' in input) {
          // "Any of these": a little stack of cards behind.
          g.roundRect(x - box * 0.42 + 8, cy - box * 0.42 + 8, box * 0.84, box * 0.84, 14).stroke({
            width: 3,
            color: INK,
            alpha: 0.35,
          });
        }
      }
      x += box / 2 + op / 2;
      const sym = new Graphics();
      if (i < n - 1) {
        sym.rect(-14, -4, 28, 8).fill(INK);
        sym.rect(-4, -14, 8, 28).fill(INK);
      } else {
        sym.rect(-15, -10, 30, 7).fill(INK);
        sym.rect(-15, 3, 30, 7).fill(INK);
      }
      sym.position.set(x, cy);
      node.addChild(sym);
      x += op / 2 + box / 2;
    });
    const outPic = out ? new Picture(itemBuilder(out), box * 1.05, box * 1.05, e.state, 0x4d9bff) : null;
    if (outPic) {
      outPic.position.set(x, cy);
      node.addChild(outPic);
    }
    if (e.state !== 'discovered') {
      const q = new Graphics();
      questionMark(q, x, cy, 44);
      node.addChild(q);
    }
    const lbl = e.state === 'discovered' ? fitLabel(e.label, 28, 260, 0xffffff) : null;
    if (lbl) {
      lbl.position.set(PAGE_W / 2, 158);
      node.addChild(lbl);
    }
    const stamp = stampNode(e, 26, 0x9a6436);
    stamp?.position.set(PAGE_W - 66, 34);
    if (stamp) node.addChild(stamp);
    for (const p of pictures) this.view.pictures.push(p);
    this.entryView(e, node, { picture: outPic, stamp, label: lbl, badgeAt: { x: 66, y: 28 } });
  }

  /** The essence chart: every essence's drop and a thing that carries it. */
  essences(): void {
    const { content } = this.hooks;
    this.header((g) => drawEssence(g, 'ess_glow', 0, 8, 22), null);
    ESSENCE_IDS.forEach((ess, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 100 + col * 172;
      const y = 175 + row * 112;
      const g = this.g(x, y);
      g.roundRect(-70, -48, 150, 96, 26).fill({ color: lighten(ESSENCE_COLORS[ess], 0.75), alpha: 0.8 });
      drawEssence(g, ess, -32, 4, 22);
      const itemId =
        Object.entries(ESSENCE_ITEMS).find(([, v]) => v === ess)?.[0] ??
        (ess === 'ess_moon' ? MOON_ITEMS[0] : undefined) ??
        (ess === 'ess_color' ? 'item_berry_red' : undefined);
      const tag = ESSENCE_TAGS.find(([, v]) => v === ess)?.[0];
      if (itemId && content.items.has(itemId)) {
        const node = hintNode(itemId, 62, content);
        node.position.set(x + 32, y);
        this.root.addChild(node);
      } else if (tag) {
        drawTagIcon(g, tag, 32, 0, 50);
      }
    });
  }

  /** A potion: its essences as drops, its bottle, and what it does. */
  potion(e: JournalEntry, top: number): void {
    const { content } = this.hooks;
    const def = content.potions.get(e.id);
    const node = new Container();
    this.add(node, 0, top);
    const g = new Graphics();
    node.addChild(g);
    g.roundRect(30, 0, PAGE_W - 60, 146, 30).fill({
      color: lighten(def.color, 0.8),
      alpha: e.state === 'discovered' ? 0.75 : 0.3,
    });
    const drops = potionDrops(def.recipe, def.effect);
    const known = e.state !== 'unknown';
    drops.forEach((ess, i) => {
      const x = 80 + i * 62 + (3 - drops.length) * 31;
      drawEssence(g, ess, x, 78, 22, known && ess !== null);
    });
    g.rect(270, 64, 32, 7).fill(INK);
    g.rect(270, 79, 32, 7).fill(INK);
    const bottle = content.items.tryGet(def.bottle);
    const picture = bottle ? new Picture(itemBuilder(bottle), 110, 112, e.state, def.color) : null;
    picture?.position.set(372, 74);
    if (picture) node.addChild(picture);
    if (e.state === 'discovered') {
      const fx = new Graphics();
      drawEffect(fx, def.effect, 104, content.bugs.tryGet('bug_ladybug_dot'));
      fx.position.set(500, 72);
      node.addChild(fx);
    } else {
      dashedCircle(g, 500, 72, 46, INK, 0.4);
      questionMark(g, 500, 72, 50, 0xd8cfe6);
    }
    const lbl = e.state === 'discovered' ? fitLabel(e.label, 26, 130, 0xffffff) : null;
    if (lbl) {
      lbl.position.set(612, 74);
      node.addChild(lbl);
    }
    const stamp = stampNode(e, 24, 0x9b6bd6);
    stamp?.position.set(420, 30);
    if (stamp) node.addChild(stamp);
    this.entryView(e, node, { picture, stamp, label: lbl, badgeAt: { x: 330, y: 22 } });
  }

  /** One area's secrets, with its count. */
  secrets(area: string, entries: number[]): void {
    const { book, content } = this.hooks;
    const count = book.areaCounts[area] ?? { found: 0, total: 0 };
    const visited = book.areas.find((a) => a.id === area)?.state === 'discovered';
    const name = content.areas.tryGet(area)?.name ?? null;
    this.header((g) => drawAreaIcon(g, area, 0, 0, 74), visited ? name : null, count);
    entries.forEach((i, k) => {
      const e = book.secrets[i]!;
      const def = content.secrets.tryGet(e.id);
      const col = k % 2;
      const row = Math.floor(k / 2);
      const node = new Container();
      this.add(node, 40 + col * 330, 130 + row * 176);
      const g = new Graphics();
      node.addChild(g);
      const found = e.state === 'discovered';
      g.roundRect(0, 0, 310, 160, 28).fill({ color: found ? 0xffffff : 0xece4d8, alpha: found ? 0.75 : 0.6 });
      const disc = new Container();
      disc.position.set(76, 80);
      node.addChild(disc);
      const d = new Graphics();
      disc.addChild(d);
      const thing = def?.unlocks.find((u) => u.kind === 'bug' || u.kind === 'item');
      if (found) {
        d.circle(0, 0, 60).fill(0x1f9e93).stroke(stroke(5));
        d.circle(0, 0, 48).fill(lighten(0x1f9e93, 0.7));
        const pic = thing ? hintNode(thing.id, 80, content) : hintNode(e.hint[0] ?? 'stars', 76, content);
        disc.addChild(pic);
      } else {
        d.circle(0, 0, 60).fill(SILHOUETTE).stroke(stroke(5));
        questionMark(d, 0, 0, 62);
      }
      const lbl = found ? fitLabel(e.label, 26, 160, 0xffffff) : null;
      if (lbl) {
        lbl.position.set(226, 46);
        node.addChild(lbl);
      }
      const hints = hintRow(e.hint, found ? 46 : 62, content);
      hints.position.set(226, found ? 110 : 80);
      node.addChild(hints);
      const opened = this.hooks.opened(e.key) || e.extra !== null;
      const extra = e.extra ?? (opened ? predictExtra(e) : null);
      if (extra) {
        const ex = hintRow([extra], 40, content);
        ex.position.set(226, 140);
        node.addChild(ex);
      }
      const stamp = stampNode(e, 26, 0x1f9e93);
      stamp?.position.set(124, 30);
      if (stamp) node.addChild(stamp);
      this.entryView(e, node, {
        tintNode: found ? disc : null,
        stamp,
        label: lbl,
        badgeAt: { x: 28, y: 22 },
        extraAt: { x: 226, y: 140, s: 40 },
        sparkleAt: { x: 76, y: 80, w: 150, h: 150 },
      });
    });
  }

  /** One mystery as a comic strip of panels. */
  mystery(m: MysteryPage, index: number): void {
    const { content } = this.hooks;
    this.header((g) => drawTabIcon(g, 'page_mysteries', 64), m.started ? m.name : null, {
      found: m.panels.filter((p) => p.state === 'done').length,
      total: m.panels.length,
    });
    // The areas it crosses, small, under the header.
    const areas = new Container();
    m.areas.forEach((a, i) => {
      const ag = new Graphics();
      drawAreaIcon(ag, a, 0, 0, 34);
      ag.position.set(i * 44, 0);
      areas.addChild(ag);
    });
    this.add(areas, 130, 62);
    const n = m.panels.length;
    const rows = Math.ceil(n / 2);
    // Leave the bottom corner free for the page turn.
    const ph = Math.min(170, (PAGE_H - 250) / rows - 16);
    m.panels.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const wide = n % 2 === 1 && i === n - 1;
      const pw = wide ? 640 : 312;
      const x = wide ? 40 : 40 + col * 328;
      const y = 136 + row * (ph + 16);
      const panel = new Container();
      this.add(panel, x + pw / 2, y + ph / 2);
      panel.rotation = (((i * 7 + index * 3) % 5) - 2) * 0.008;
      const g = new Graphics();
      panel.addChild(g);
      const bg =
        p.state === 'done'
          ? [0xfff2a8, 0xc8f0ff, 0xffd6e8, 0xd8f5c0][i % 4]!
          : p.state === 'next'
            ? 0xffffff
            : 0x3b3150;
      g.rect(-pw / 2 + 6, -ph / 2 + 8, pw, ph).fill({ color: OUTLINE, alpha: 0.18 });
      g.rect(-pw / 2, -ph / 2, pw, ph)
        .fill(bg)
        .stroke(stroke(6));
      // Panel number, top left.
      g.circle(-pw / 2 + 22, -ph / 2 + 22, 16)
        .fill(0xfffbef)
        .stroke(stroke(3));
      drawNumber(g, String(i + 1), -pw / 2 + 22, -ph / 2 + 22, 18, INK);
      if (p.state === 'hidden') {
        questionMark(g, 0, 0, 70, 0x8f84a8);
      } else {
        const hints = hintRow(
          p.hint,
          Math.min(p.state === 'done' ? 96 : 84, ph * 0.55),
          content,
          p.state !== 'done',
        );
        panel.addChild(hints);
        if (p.state === 'next') {
          hints.alpha = 0.85;
          questionMark(g, pw / 2 - 30, ph / 2 - 30, 34, 0x4d9bff);
        } else {
          // A check stamp.
          g.circle(pw / 2 - 28, ph / 2 - 28, 20)
            .fill(0x5cc85a)
            .stroke(stroke(3));
          g.moveTo(pw / 2 - 37, ph / 2 - 28)
            .lineTo(pw / 2 - 30, ph / 2 - 20)
            .lineTo(pw / 2 - 18, ph / 2 - 36)
            .stroke({ width: 5, color: 0xffffff, cap: 'round', join: 'round' });
        }
      }
      this.hooks.name(`journal_panel_${m.id}_${i}`, panel);
    });
    if (m.solved) {
      const gold = this.g(PAGE_W - 90, PAGE_H - 90);
      drawGoldLadybug(gold, 54);
      gold.rotation = -0.15;
    }
  }

  /** The photos page: polaroids, newest first. */
  photos(indexes: number[]): void {
    const { photos } = this.hooks;
    const W = 300;
    const H = (W * 9) / 16;
    if (indexes.length === 0) {
      const g = this.g(PAGE_W / 2, PAGE_H / 2 - 40);
      g.roundRect(-W / 2 - 16, -H / 2 - 16, W + 32, H + 76, 8).stroke({ width: 5, color: INK, alpha: 0.35 });
      dashedCircle(g, 0, 0, 60, INK, 0.3);
      cameraIcon(g, 110);
      g.star(130, -110, 4, 26, 10).fill(0xffffff).stroke(stroke(3.5));
      g.rotation = -0.03;
      return;
    }
    const newest = [...photos].reverse();
    indexes.forEach((i, k) => {
      const photo = newest[i];
      if (!photo) return;
      const node = new Container();
      this.add(node, PAGE_W / 2 + (k % 2 === 0 ? -60 : 60), 150 + k * 262);
      node.rotation = (((i * 7919) % 11) - 5) * 0.014;
      const g = new Graphics();
      node.addChild(g);
      g.roundRect(-W / 2 - 14, -H / 2 - 14 + 8, W + 28, H + 66, 6).fill({ color: OUTLINE, alpha: 0.28 });
      g.roundRect(-W / 2 - 14, -H / 2 - 14, W + 28, H + 66, 6)
        .fill(0xffffff)
        .stroke(stroke(5));
      g.rect(-W / 2, -H / 2, W, H).fill(0x8d8da0);
      void textureOf(photo.thumb).then((tex) => {
        if (!tex || node.destroyed) return;
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.width = W;
        sprite.height = H;
        node.addChildAt(sprite, 1);
      });
      if (photo.file === null) {
        g.moveTo(W / 2 - 34, H / 2 + 12)
          .lineTo(W / 2 - 8, H / 2 + 38)
          .moveTo(W / 2 - 8, H / 2 + 12)
          .lineTo(W / 2 - 34, H / 2 + 38)
          .stroke({ width: 7, color: 0xff3b4a, cap: 'round' });
      }
      const t = new Graphics();
      tape(t, 0, -H / 2 - 12, 0.05 * (k % 2 === 0 ? 1 : -1), 110);
      node.addChild(t);
      node.label = `photo_${newest.length - 1 - i}`;
      this.hooks.name(`journal_photo_${k}`, node);
    });
  }

  /**
   * The garden map, drawn across the whole spread (each side draws all of
   * it under a mask, so the page turn carries its half). Found areas are in
   * color with their secret counts; click one to go there.
   */
  map(which: 'left' | 'right'): void {
    const { book, content } = this.hooks;
    const holder = new Container();
    // In left-page pixels: the spread is 2 * PAGE_W wide.
    holder.position.set(which === 'left' ? 0 : -PAGE_W, 0);
    this.root.addChild(holder);
    const mask = new Graphics().rect(0, 0, PAGE_W, PAGE_H).fill(0xffffff);
    this.root.addChild(mask);
    holder.mask = mask;
    this.view.masked.push(holder);
    const left = 90;
    const width = PAGE_W * 2 - 180;
    const stripY = 220;
    const stripH = 290;
    const areas = mapLayout(
      (id) => {
        const def = content.areas.tryGet(id);
        return def ? { x0: def.xStart, x1: def.xEnd } : null;
      },
      width,
      stripH,
      200,
      80,
    );
    const g = new Graphics();
    holder.addChild(g);
    // Title: the folded map and the areas found.
    drawGlyph(g, 'map', 110, 90, 90);
    const found = book.areas.filter((a) => a.state === 'discovered').length;
    const pill = new Graphics();
    pill.roundRect(-70, -30, 140, 60, 30).fill(0xfffbef).stroke(stroke(4));
    drawNumber(pill, `${found}/${book.areas.length}`, 0, 0, 34, 0x5cc85a);
    pill.position.set(250, 90);
    holder.addChild(pill);
    // The ground line the strip sits on, and dotted tunnels down to the hidden places.
    for (const a of areas.filter((x) => x.hidden)) {
      const cx = left + a.x + a.w / 2;
      for (let y = stripY + stripH + 8; y < stripY + a.y; y += 16)
        g.circle(cx, y, 4).fill({ color: INK, alpha: 0.5 });
    }
    for (const a of areas) {
      const e = book.areas.find((x) => x.id === a.id);
      if (!e) continue;
      const def = content.areas.tryGet(a.id);
      const known = e.state === 'discovered';
      const node = new Container();
      node.position.set(left + a.x, stripY + a.y);
      holder.addChild(node);
      const ag = new Graphics();
      node.addChild(ag);
      const r = a.hidden ? 40 : 18;
      if (known) {
        const top = def?.skyTop ?? 0xbfe7f5;
        const bottom = def?.skyBottom ?? 0xe8f6ff;
        ag.roundRect(0, 0, a.w, a.h, r).fill(toColor(bottom));
        ag.roundRect(0, 0, a.w, a.h * 0.45, r).fill({ color: toColor(top), alpha: 0.8 });
        ag.rect(0, a.h * 0.72, a.w, a.h * 0.28 - r / 2).fill(toColor(def?.ground ?? 0x6fbf4a));
        ag.roundRect(0, a.h * 0.72, a.w, a.h * 0.28, r).fill(toColor(def?.ground ?? 0x6fbf4a));
        ag.rect(0, a.h * 0.72, a.w, 8).fill(toColor(def?.groundDark ?? 0x4e9a3a));
      } else {
        ag.roundRect(0, 0, a.w, a.h, r).fill(a.hidden ? 0x4a3a2e : SILHOUETTE);
      }
      ag.roundRect(0, 0, a.w, a.h, r).stroke(stroke(6));
      const icon = new Graphics();
      drawAreaIcon(icon, a.id, 0, 0, Math.min(a.w * 0.6, a.h * 0.5));
      icon.position.set(a.w / 2, a.h * 0.42);
      if (!known) icon.tint = 0x5a4a6e;
      node.addChild(icon);
      if (!known) {
        const q = new Graphics();
        questionMark(q, a.w / 2, a.h * 0.42, Math.min(70, a.h * 0.4));
        node.addChild(q);
      } else {
        const lbl = fitLabel(e.label, 22, a.w - 16, 0xffffff);
        lbl.position.set(a.w / 2, a.h * 0.86);
        node.addChild(lbl);
      }
      const c = book.areaCounts[a.id] ?? { found: 0, total: 0 };
      if (c.total > 0) {
        const cp = new Graphics();
        const text = `${c.found}/${c.total}`;
        const w = text.length * 17 + 20;
        cp.roundRect(-w / 2, -20, w, 40, 20)
          .fill(c.found === c.total ? 0xffe27a : 0xfffbef)
          .stroke(stroke(4));
        drawNumber(cp, text, 0, 0, 22, c.found > 0 ? 0x1f9e93 : 0xd8cfe6);
        cp.position.set(a.w / 2, a.hidden ? -4 : -6);
        node.addChild(cp);
      }
      // Only the side the area mostly sits on takes clicks.
      const mid = left + a.x + a.w / 2;
      const mine = which === 'left' ? mid < PAGE_W : mid >= PAGE_W;
      if (mine) {
        node.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= a.w && y >= -20 && y <= a.h };
        const go = this.hooks.canTravel(a.id);
        const v: EntryView = this.entryView(e, node, {
          tintNode: known ? ag : null,
          tap: () => (go ? this.hooks.travel(a.id) : this.hooks.tapEntry(v)),
        });
        this.hooks.name(`journal_area_${a.id}`, node);
      } else node.eventMode = 'none';
    }
    // A compass rose in the corner.
    const rose = new Graphics();
    rose.circle(0, 0, 62).fill(0xfffbef).stroke(stroke(5));
    rose.star(0, 0, 4, 54, 14).fill(0xff9f1c).stroke(stroke(4));
    rose
      .star(0, 0, 4, 34, 9, Math.PI / 4)
      .fill(0x3c6fd6)
      .stroke(stroke(3));
    rose.circle(0, 0, 8).fill(0xe8453c).stroke(stroke(3));
    rose.position.set(PAGE_W * 2 - 150, PAGE_H - 170);
    rose.rotation = 0.12;
    holder.addChild(rose);
    // You are here: a ladybug pin over the camera's spot on the strip.
    const strip = areas.filter((a) => !a.hidden);
    const first = content.areas.tryGet(strip[0]!.id);
    const last = content.areas.tryGet(strip[strip.length - 1]!.id);
    if (first && last) {
      const k = width / (last.xEnd - first.xStart);
      const px = left + (this.hooks.cameraCenter - first.xStart) * k;
      const pinG = new Graphics();
      pinG.moveTo(0, 0).lineTo(0, 36).stroke({ width: 5, color: OUTLINE, cap: 'round' });
      pinG.circle(0, 0, 20).fill(0xe8453c).stroke(stroke(4));
      pinG.circle(8, -4, 8).fill(OUTLINE);
      pinG.circle(-6, -2, 3.5).fill(OUTLINE);
      pinG.circle(-1, 8, 3.5).fill(OUTLINE);
      pinG.position.set(px, stripY - 42);
      holder.addChild(pinG);
      this.view.tick.push((time) => {
        pinG.y = stripY - 42 - Math.abs(Math.sin(time * 3)) * 8;
      });
    }
  }
}

function toColor(c: number | string): number {
  return typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16);
}

/**
 * The extra pictogram a sparkling entry shows once opened, until the sim
 * writes the real one down on its next step (the world is paused while the
 * book is open): the secret's area, unless its hint already shows it.
 */
export function predictExtra(e: JournalEntry): string | null {
  if (e.kind !== 'secret' || !e.group.startsWith('area_')) return null;
  return e.hint.includes(e.group) ? null : e.group;
}

/** Draw a sparkling entry's soft twinkles at `time`. */
export function drawSparkle(g: Graphics, time: number, w: number, h: number): void {
  g.clear();
  for (let i = 0; i < 5; i++) {
    const a = time * 0.8 + (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * w * 0.5;
    const y = Math.sin(a * 1.3) * h * 0.4;
    const k = 0.5 + 0.5 * Math.sin(time * 4 + i * 1.7);
    twinkle(g, x, y, 8 + 10 * k, 0xfff36b, 0.35 + 0.6 * k);
  }
}

export { hintRow, hintNode };
