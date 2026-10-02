import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Command, JournalBook, PageId, PhotoRecord } from '../../../game';
import { PAGE_IDS } from '../../../game';
import type { Content } from '../../../game/data';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { SfxName } from '../audio/sfx';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';
import { drawNumber } from '../render/draw/digits';
import { Bounce, markUi } from '../ui/button';
import { LEAF, LEAF_DARK } from '../ui/icons';
import { stampSlam } from '../ui/stamps';
import { drawCover } from '../ui/journalButton';
import { drawTabIcon, hintNode, revealTint, twinkle } from './entryArt';
import type { Spread } from './layout';
import { firstSpreadOf, spreadEntries, spreadsOf, withSeen } from './layout';
import type { EntryView, SideView } from './sides';
import { PAGE_H, PAGE_W, TAB_COLORS, buildSide, disposeSide, drawSparkle, predictExtra } from './sides';

/** Where the spine sits on screen. */
const CX = 900;
const CY = 552;
const COVER_PAD = 26;
const TAB_W = 96;
const TAB_H = 90;
const TAB_GAP = 8;
/** Seconds for a page turn, the open, and the close. */
const FLIP_S = 0.5;
const OPEN_FLY_S = 0.32;
const OPEN_FLIP_S = 0.5;
const CLOSE_S = 0.42;

export interface JournalHooks {
  content: Content;
  book(): JournalBook;
  photos: readonly PhotoRecord[];
  /** Keys looked at this session (shared with the button's badge until the sim catches up). */
  seen: Set<string>;
  send(command: Command): void;
  sound(name: SfxName, strength?: number): void;
  close(): void;
  travel(areaId: string): void;
  canTravel(areaId: string): boolean;
  cameraCenter(): number;
  reduceMotion(): boolean;
  /** Where the journal button sits, for the book's flight in and out. */
  buttonAt(): { x: number; y: number };
}

interface Burst {
  g: Graphics;
  parts: { x: number; y: number; vx: number; vy: number; r: number; life: number; color: number }[];
}

/**
 * The journal (game design doc, section 13): a two-page spread over the
 * dimmed, paused world, with pictogram bookmarks down the right edge. It
 * flies out of the journal button and its cover flips open; pages turn
 * with a curl. When a spread with new finds settles, each comes into color
 * with a sparkle and a stamp, and the game sends `journal_seen` for them.
 * The renderer's only write is that command.
 */
export class JournalView extends Container {
  private readonly dim = new Graphics();
  private readonly bookRoot = new Container();
  private readonly tabLayer = new Container();
  private readonly coverBack = new Graphics();
  /** The open cover's left half and the spine: hidden while the book is shut. */
  private readonly coverLeft = new Graphics();
  private readonly pages = new Container();
  private readonly gutter = new Graphics();
  private readonly fx = new Graphics();
  private readonly controls = new Container();
  private readonly dots = new Graphics();
  /** The flipping leaf: a right-half front and a left-half back, scaled about the spine. */
  private readonly leaf = new Container();
  private readonly leafShade = new Graphics();
  /** The closed book's front cover, hinged at the spine. */
  private readonly closedFront = new Container();
  readonly closeButton: Container;
  /** The ladybug bookmark ribbon over the top edge: back to the jar. */
  readonly home: Container;
  readonly prev: Container;
  readonly next: Container;
  readonly tabs = new Map<PageId, Container>();
  /** Named controls on the open spread (entries, map areas), for the test hook. */
  readonly named = new Map<string, Container>();
  spreads: Spread[];
  current = 0;
  private left: { spread: number; view: SideView } | null = null;
  private right: { spread: number; view: SideView } | null = null;
  private book: JournalBook;
  private time = 0;
  /** Keys that came into color on this visit (their "new!" stays up). */
  readonly revealed = new Set<string>();
  /** Keys waiting to reveal when the spread settles. */
  private pendingReveal = new Set<string>();
  /** Sparkling entries opened this visit. */
  readonly opened = new Set<string>();
  private flip: {
    t: number;
    dir: 1 | -1;
    to: number;
    front: SideView | null;
    back: SideView | null;
    fade: boolean;
    old: SideView[];
  } | null = null;
  /** Opening (cover flips open) or closing (it shuts and flies home). */
  private phase: 'opening' | 'open' | 'closing' = 'opening';
  private phaseT = 0;
  private wheelCool = 0;
  private queued: number | null = null;
  private readonly settle = new Bounce(300, 16);
  private readonly bursts: Burst[] = [];
  private tabWiggle = new Map<PageId, number>();
  onClosed: (() => void) | null = null;
  /** The spread the player was on, for opening there next time. */
  lastSpread = 0;

  constructor(
    private readonly hooks: JournalHooks,
    start: PageId | null = null,
    startSpread = 0,
  ) {
    super();
    markUi(this);
    this.eventMode = 'static';
    this.book = withSeen(hooks.book(), hooks.seen);
    this.spreads = spreadsOf(this.book, hooks.photos.length);
    this.current = start
      ? firstSpreadOf(this.spreads, start)
      : Math.min(startSpread, this.spreads.length - 1);
    this.dim.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill({ color: 0x1d1430, alpha: 0.55 });
    this.dim.eventMode = 'static';
    this.dim.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.dim.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hooks.close();
    });
    this.dim.on('wheel', (e) => this.wheel(e.deltaY + e.deltaX));
    this.bookRoot.position.set(CX, CY);
    this.bookRoot.eventMode = 'static';
    // The whole book (cover and tabs) takes clicks, so only a click outside it closes.
    const cw = PAGE_W + COVER_PAD;
    const ch = PAGE_H / 2 + COVER_PAD;
    this.bookRoot.hitArea = {
      contains: (x: number, y: number) =>
        (x >= -cw && x <= cw + TAB_W + 30 && y >= -ch && y <= ch) ||
        // The ladybug ribbon pokes up over the top edge (Pixi skips children outside a parent's hit area).
        (Math.abs(x - (PAGE_W - 130)) <= 40 && y >= -ch - 110 && y <= -ch),
    };
    this.bookRoot.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.bookRoot.on('pointertap', (e: FederatedPointerEvent) => e.stopPropagation());
    this.bookRoot.on('wheel', (e) => this.wheel(e.deltaY + e.deltaX));
    this.drawCoverBack();
    this.buildTabs();
    this.leaf.addChild(this.leafShade);
    const coverArt = new Graphics();
    drawCover(coverArt, PAGE_W + COVER_PAD, PAGE_H + COVER_PAD * 2, this.book.completion, true);
    coverArt.position.set((PAGE_W + COVER_PAD) / 2, 0);
    this.closedFront.addChild(coverArt);
    this.prev = this.corner(-1);
    this.next = this.corner(1);
    this.home = this.makeHome();
    this.controls.addChild(this.dots, this.prev, this.next);
    this.bookRoot.addChild(
      this.home,
      this.tabLayer,
      this.coverBack,
      this.coverLeft,
      this.pages,
      this.leaf,
      this.gutter,
      this.controls,
      this.fx,
    );
    this.drawGutter();
    this.closeButton = this.makeClose();
    this.addChild(this.dim, this.bookRoot, this.closeButton);
    this.show(this.current);
    // Opening: closed, flying out of the button, then the cover flips open.
    this.phase = 'opening';
    this.phaseT = 0;
    this.leaf.removeChildren();
    this.leaf.addChild(this.closedFront, this.leafShade);
    this.left!.view.root.visible = false;
    this.hooks.sound('book_open');
    if (hooks.reduceMotion()) {
      this.phaseT = OPEN_FLY_S + OPEN_FLIP_S;
      this.alpha = 0;
    }
  }

  /** The book without its pages: the open cover's two halves and the stitched spine. */
  private drawCoverBack(): void {
    const g = this.coverBack;
    const w = PAGE_W + COVER_PAD;
    const h = PAGE_H + COVER_PAD * 2;
    g.roundRect(10, -h / 2 + 16, w, h, 34).fill({ color: OUTLINE, alpha: 0.3 });
    const left = this.coverLeft;
    left.roundRect(-w + 10, -h / 2 + 16, w, h, 34).fill({ color: OUTLINE, alpha: 0.3 });
    for (const sx of [-1, 1]) {
      const g = sx < 0 ? left : this.coverBack;
      g.roundRect(sx < 0 ? -w : 0, -h / 2, w, h, 34)
        .fill(LEAF)
        .stroke(stroke(8));
      // Leafy veins pressed into the cover.
      for (let i = 0; i < 5; i++) {
        const y = -h / 2 + 60 + i * 170;
        g.moveTo(sx * 18, y)
          .quadraticCurveTo(sx * (w * 0.5), y + 40, sx * (w - 30), y - 20)
          .stroke({ width: 4, color: darken(LEAF, 0.12), alpha: 0.6, cap: 'round' });
      }
    }
    left
      .roundRect(-24, -h / 2, 48, h, 14)
      .fill(LEAF_DARK)
      .stroke(stroke(6));
    for (let y = -h / 2 + 40; y < h / 2 - 20; y += 60) left.circle(0, y, 5).fill(lighten(LEAF, 0.6));
  }

  /** Shade in the gutter over the pages, so the spread looks bound. */
  private drawGutter(): void {
    const g = this.gutter;
    g.eventMode = 'none';
    for (let i = 0; i < 6; i++) {
      const w = 6 + i * 6;
      g.rect(-w / 2, -PAGE_H / 2, w, PAGE_H).fill({ color: 0x5a3a2a, alpha: 0.05 });
    }
    g.moveTo(0, -PAGE_H / 2 + 6)
      .lineTo(0, PAGE_H / 2 - 6)
      .stroke({ width: 3, color: darken(0xfff6df, 0.35), alpha: 0.8 });
  }

  /** The bookmarks: one per page, sticking out of the right edge. */
  private buildTabs(): void {
    const x0 = PAGE_W + COVER_PAD - 10;
    const total = PAGE_IDS.length * TAB_H + (PAGE_IDS.length - 1) * TAB_GAP;
    PAGE_IDS.forEach((page, i) => {
      const tab = new Container();
      // Positioned by the icon's middle, so the test hook clicks the part that sticks out.
      tab.position.set(x0 + 50, -total / 2 + i * (TAB_H + TAB_GAP) + TAB_H / 2);
      tab.pivot.x = 50;
      this.tabLayer.addChild(tab);
      markUi(tab);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.hitArea = {
        contains: (x: number, y: number) => x >= 8 && x <= TAB_W + 30 && Math.abs(y) <= TAB_H / 2,
      };
      tab.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
      tab.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.openTab(page);
      });
      tab.on('pointerover', () => this.hooks.sound('hover', 0.5));
      this.tabs.set(page, tab);
    });
    this.drawTabs();
  }

  private drawTabs(): void {
    const active = this.spreads[this.current]?.page ?? null;
    for (const [page, tab] of this.tabs) {
      tab.removeChildren().forEach((c) => c.destroy({ children: true }));
      const on = page === active;
      const color = TAB_COLORS[page];
      const out = on ? 34 : 0;
      const g = new Graphics();
      g.roundRect(-20 + out + 6, -TAB_H / 2 + 6, TAB_W + 20, TAB_H - 4, 22).fill({
        color: OUTLINE,
        alpha: 0.25,
      });
      g.roundRect(-20 + out, -TAB_H / 2, TAB_W + 20, TAB_H - 4, 22)
        .fill(on ? lighten(color, 0.15) : color)
        .stroke(stroke(6));
      // A stitched edge.
      g.moveTo(-6 + out, -TAB_H / 2 + 10)
        .lineTo(-6 + out, TAB_H / 2 - 14)
        .stroke({ width: 3, color: lighten(color, 0.5), alpha: 0.8 });
      g.circle(out + 50, -2, 34)
        .fill(0xfffbef)
        .stroke(stroke(4));
      tab.addChild(g);
      const icon = new Graphics();
      drawTabIcon(icon, page, 46);
      icon.position.set(out + 50, -2);
      tab.addChild(icon);
      const fresh = this.book.fresh[page];
      if (fresh > 0) {
        const b = new Graphics();
        b.circle(0, 0, 19).fill(0xff3b4a).stroke(stroke(4));
        drawNumber(b, fresh > 9 ? '9+' : String(fresh), 0, 0, 20, 0xffffff);
        b.position.set(out + 86, -TAB_H / 2 + 10);
        tab.addChild(b);
      }
      tab.zIndex = on ? 2 : 1;
    }
    this.tabLayer.sortableChildren = true;
  }

  /** A dog-eared page corner that turns the page. */
  private corner(dir: 1 | -1): Container {
    const c = new Container();
    markUi(c);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const g = new Graphics();
    const s = 92;
    // The folded-up corner of the page, with an arrow on it.
    g.poly([0, 0, -dir * s, 0, 0, -s])
      .fill(darken(0xfff6df, 0.12))
      .stroke(stroke(5));
    g.poly([-dir * s, 0, 0, -s, -dir * s, -s]).fill({ color: OUTLINE, alpha: 0.12 });
    g.moveTo(-dir * 50, -24)
      .lineTo(-dir * 26, -24)
      .lineTo(-dir * 26, -14)
      .lineTo(-dir * 8, -32)
      .lineTo(-dir * 26, -50)
      .lineTo(-dir * 26, -40)
      .lineTo(-dir * 50, -40)
      .closePath()
      .fill(0xff9f1c)
      .stroke(stroke(3.5));
    c.addChild(g);
    c.position.set(dir * (PAGE_W - 4), PAGE_H / 2 - 4);
    c.hitArea = {
      contains: (x: number, y: number) => x * -dir >= -10 && x * -dir <= s + 20 && y <= 10 && y >= -s - 20,
    };
    c.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    c.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.turn(dir);
    });
    c.on('pointerover', () => {
      c.scale.set(1.12);
      this.hooks.sound('hover', 0.4);
    });
    c.on('pointerout', () => c.scale.set(1));
    return c;
  }

  /** A red ribbon with a ladybug charm, poking up out of the pages: the first spread. */
  private makeHome(): Container {
    const c = new Container();
    markUi(c);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.position.set(PAGE_W - 130, -PAGE_H / 2 - COVER_PAD - 34);
    const g = new Graphics();
    g.moveTo(0, 20).lineTo(0, 70).stroke({ width: 18, color: OUTLINE, cap: 'round' });
    g.moveTo(0, 20).lineTo(0, 70).stroke({ width: 11, color: 0xe8453c, cap: 'round' });
    g.circle(0, 0, 26).fill(0xe8453c).stroke(stroke(5));
    g.circle(0, -18, 12).fill(OUTLINE);
    g.moveTo(0, -12).lineTo(0, 24).stroke(stroke(3));
    for (const [x, y] of [
      [-11, -2],
      [10, 0],
      [-9, 13],
      [9, 13],
    ] as const)
      g.circle(x, y, 4.5).fill(OUTLINE);
    g.circle(-4, -21, 3).fill(0xffffff);
    c.addChild(g);
    c.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= 34 && y >= -40 && y <= 40 };
    c.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    c.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hooks.sound('ui_tick', 0.6);
      this.turnTo(0);
    });
    c.on('pointerover', () => c.scale.set(1.12));
    c.on('pointerout', () => c.scale.set(1));
    return c;
  }

  /** The closed-book icon where the journal button was: click it to close. */
  private makeClose(): Container {
    const c = new Container();
    markUi(c);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    const at = this.hooks.buttonAt();
    c.position.set(at.x, at.y);
    const g = new Graphics();
    drawCover(g, 84, 100, this.book.completion, false);
    c.addChild(g);
    c.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= 60 && Math.abs(y) <= 66 };
    c.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    c.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hooks.close();
    });
    c.on('pointerover', () => c.scale.set(1.1));
    c.on('pointerout', () => c.scale.set(1));
    return c;
  }

  private sideHooks(): Parameters<typeof buildSide>[2] {
    return {
      content: this.hooks.content,
      book: this.book,
      photos: this.hooks.photos,
      canTravel: (id) => this.hooks.canTravel(id),
      cameraCenter: this.hooks.cameraCenter(),
      revealing: (key) => this.pendingReveal.has(key),
      opened: (key) => this.opened.has(key),
      tapEntry: (v) => this.tapEntry(v),
      travel: (id) => {
        this.hooks.sound('ui_pop');
        this.hooks.travel(id);
      },
      openTab: (page) => this.openTab(page),
      name: (name, node) => this.named.set(name, node),
    };
  }

  private build(spread: number, which: 'left' | 'right'): SideView {
    const s = this.spreads[spread]!;
    const view = buildSide(which === 'left' ? s.left : s.right, which, this.sideHooks());
    view.root.position.set(which === 'left' ? -PAGE_W : 0, -PAGE_H / 2);
    return view;
  }

  /** Put a spread up at once (no turn). */
  private show(index: number): void {
    this.current = index;
    this.queueReveal();
    this.named.clear();
    for (const side of [this.left, this.right]) if (side) disposeSide(side.view);
    this.left = { spread: index, view: this.build(index, 'left') };
    this.right = { spread: index, view: this.build(index, 'right') };
    this.pages.addChild(this.left.view.root, this.right.view.root);
    this.afterTurn();
  }

  /** New finds on the spread about to show reveal once it settles. */
  private queueReveal(): void {
    const s = this.spreads[this.current];
    this.pendingReveal = new Set(
      s
        ? spreadEntries(this.book, s).flatMap((e) => (e.isNew && e.state === 'discovered' ? [e.key] : []))
        : [],
    );
  }

  private afterTurn(): void {
    const s = this.spreads[this.current]!;
    this.prev.visible = this.current > 0;
    this.next.visible = this.current < this.spreads.length - 1;
    this.drawTabs();
    const d = this.dots.clear();
    if (s.count > 1)
      for (let i = 0; i < s.count; i++) {
        const x = (i - (s.count - 1) / 2) * 26;
        d.circle(x, PAGE_H / 2 + COVER_PAD - 2, i === s.index ? 9 : 6)
          .fill(i === s.index ? 0xffd23f : 0xfffbef)
          .stroke(stroke(3));
      }
    this.lastSpread = this.current;
  }

  /** Jump to a tab's first spread with a page turn. */
  openTab(page: PageId): void {
    // A tab opens where its newest finds are, if it has any.
    const first = firstSpreadOf(this.spreads, page);
    const fresh = this.spreads.findIndex(
      (sp, i) => i >= first && sp.page === page && spreadEntries(this.book, sp).some((e) => e.isNew),
    );
    const to = fresh >= 0 ? fresh : first;
    this.tabWiggle.set(page, 1);
    if (to === this.current && !this.flip) {
      this.hooks.sound('ui_tick', 0.5);
      return;
    }
    this.turnTo(to);
  }

  /** One spread on or back. */
  turn(dir: 1 | -1): void {
    const target = (this.flip?.to ?? this.current) + dir;
    if (target < 0 || target >= this.spreads.length) return;
    this.turnTo(target);
  }

  private wheel(delta: number): void {
    if (this.wheelCool > 0 || Math.abs(delta) < 4 || this.phase !== 'open') return;
    this.wheelCool = 0.3;
    this.turn(delta > 0 ? 1 : -1);
  }

  /** Turn to spread `to`: the leaf curls over from one side to the other. */
  turnTo(to: number): void {
    // A turn asked for while the cover is still opening waits for it.
    if (this.phase !== 'open') {
      if (this.phase === 'opening') this.queued = to;
      return;
    }
    if (this.flip) this.finishFlip();
    if (to === this.current) return;
    const dir: 1 | -1 = to > this.current ? 1 : -1;
    const oldLeft = this.left!;
    const oldRight = this.right!;
    this.current = to;
    this.queueReveal();
    this.named.clear();
    const newLeft = { spread: to, view: this.build(to, 'left') };
    const newRight = { spread: to, view: this.build(to, 'right') };
    this.hooks.sound('page_flip');
    const fade = this.hooks.reduceMotion();
    this.pages.removeChildren();
    if (fade) {
      // Reduce motion: the new pages fade in over the old.
      this.pages.addChild(oldLeft.view.root, oldRight.view.root, newLeft.view.root, newRight.view.root);
      newLeft.view.root.alpha = 0;
      newRight.view.root.alpha = 0;
      this.flip = { t: 0, dir, to, front: null, back: null, fade: true, old: [oldLeft.view, oldRight.view] };
    } else if (dir > 0) {
      // Forward: the old right page lifts and lands as the new left.
      this.pages.addChild(oldLeft.view.root, newRight.view.root);
      this.leaf.removeChildren();
      this.leaf.addChild(oldRight.view.root, newLeft.view.root, this.leafShade);
      this.flip = {
        t: 0,
        dir,
        to,
        front: oldRight.view,
        back: newLeft.view,
        fade: false,
        old: [oldLeft.view, oldRight.view],
      };
    } else {
      this.pages.addChild(newLeft.view.root, oldRight.view.root);
      this.leaf.removeChildren();
      this.leaf.addChild(newRight.view.root, oldLeft.view.root, this.leafShade);
      this.flip = {
        t: 0,
        dir,
        to,
        front: newRight.view,
        back: oldLeft.view,
        fade: false,
        old: [oldLeft.view, oldRight.view],
      };
    }
    this.left = newLeft;
    this.right = newRight;
    this.drawTabs();
    this.applyLeaf(dir > 0 ? 0 : 1);
  }

  /**
   * Leaf progress `p`: 0 lies flat on the right, 1 flat on the left. The
   * front shrinks toward the spine, then the back grows out of it, with a
   * little skew for the curl and a shade at the fold.
   */
  private applyLeaf(p: number): void {
    const f = this.flip;
    const front = f ? f.front?.root : this.leaf.children.find((c) => c === this.closedFront);
    const back = f ? f.back?.root : this.left?.view.root;
    const c = Math.cos(Math.PI * p);
    const curl = Math.sin(Math.PI * p);
    if (front) {
      front.visible = p < 0.5;
      front.scale.x = Math.max(0.001, c);
      front.skew.y = -0.1 * curl;
    }
    if (back) {
      back.visible = p >= 0.5;
      back.scale.x = Math.max(0.001, -c);
      back.skew.y = 0.1 * curl;
    }
    const sh = this.leafShade.clear();
    if (curl > 0.02) {
      const w = PAGE_W * Math.abs(c);
      const x = p < 0.5 ? 0 : -w;
      sh.rect(x, -PAGE_H / 2, w, PAGE_H).fill({ color: 0x3a2a1a, alpha: 0.22 * curl });
      // The lifted page's shadow on the page under it.
      const sx = p < 0.5 ? w : -w;
      sh.rect(p < 0.5 ? sx : sx - 40, -PAGE_H / 2, 40, PAGE_H).fill({ color: 0x3a2a1a, alpha: 0.14 * curl });
    }
  }

  private finishFlip(): void {
    const f = this.flip;
    if (!f) return;
    this.flip = null;
    for (const v of f.old) disposeSide(v);
    this.leaf.removeChildren();
    this.leaf.addChild(this.leafShade);
    this.leafShade.clear();
    for (const side of [this.left!, this.right!]) {
      const r = side.view.root;
      r.scale.set(1);
      r.skew.set(0);
      r.alpha = 1;
      r.visible = true;
      this.pages.addChild(r);
    }
    this.afterTurn();
    if (!this.hooks.reduceMotion()) this.settle.kick(1.012);
  }

  private tapEntry(v: EntryView): void {
    v.wiggle = 1;
    const e = v.entry;
    if (e.sparkle && !this.opened.has(e.key)) {
      // Opening a sparkling entry shows one more pictogram (section 13).
      this.opened.add(e.key);
      this.hooks.send({ type: 'journal_seen', keys: [e.key] });
      this.hooks.sound('twinkle');
      const extra = e.extra ?? predictExtra(e);
      if (extra && v.extraAt) {
        const node = hintBubble(extra, v.extraAt.s, this.hooks.content);
        node.position.set(v.extraAt.x, v.extraAt.y);
        node.scale.set(0.01);
        v.node.addChild(node);
        this.pops.push({ node, t: 0 });
      }
      this.burst(v.node, v.sparkleAt?.x ?? 0, v.sparkleAt?.y ?? 0);
      return;
    }
    this.hooks.sound(e.state === 'discovered' ? 'pick' : 'ui_tick', 0.6);
  }

  private readonly pops: { node: Container; t: number }[] = [];

  /** Sparkles flying out from a point inside `node`. */
  private burst(node: Container, x: number, y: number): void {
    if (this.hooks.reduceMotion()) return;
    const p = node.toGlobal({ x, y });
    const local = this.bookRoot.toLocal(p, undefined, undefined);
    const parts: Burst['parts'] = [];
    const colors = [0xffd23f, 0xffffff, 0xff8fab, 0x7ec8ff];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.sin(i * 7.1) * 0.3;
      const sp = 260 + (i % 3) * 90;
      parts.push({
        x: local.x,
        y: local.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        r: 10 + (i % 4) * 4,
        life: 0.55 + (i % 3) * 0.12,
        color: colors[i % colors.length]!,
      });
    }
    this.bursts.push({ g: this.fx, parts });
  }

  /** Close: the cover shuts and the book flies back into the button. */
  close(): void {
    if (this.phase === 'closing') return;
    if (this.flip) this.finishFlip();
    this.phase = 'closing';
    this.phaseT = 0;
    this.eventMode = 'none';
    this.hooks.sound('book_close');
    // Fold the left half back over onto the right.
    this.leaf.removeChildren();
    this.leaf.addChild(this.closedFront, this.left!.view.root, this.leafShade);
  }

  get isClosing(): boolean {
    return this.phase === 'closing';
  }

  /** Mark what this spread shows as seen, and start the reveal. */
  private startReveal(): void {
    const keys = [...this.pendingReveal];
    this.pendingReveal.clear();
    if (keys.length === 0) return;
    for (const k of keys) {
      this.hooks.seen.add(k);
      this.revealed.add(k);
    }
    this.hooks.send({ type: 'journal_seen', keys });
    const views = [this.left!.view, this.right!.view]
      .flatMap((v) => v.entries)
      .filter((v) => keys.includes(v.entry.key));
    views.forEach((v, i) => {
      v.t = -(0.15 + i * 0.22);
    });
    this.book = withSeen(this.hooks.book(), this.hooks.seen);
    this.drawTabs();
  }

  update(dt: number): void {
    this.time += dt;
    this.wheelCool = Math.max(0, this.wheelCool - dt);
    const reduce = this.hooks.reduceMotion();
    if (this.phase === 'opening') this.updateOpening(dt, reduce);
    else if (this.phase === 'closing') {
      this.updateClosing(dt, reduce);
      // The last closing frame takes the book down.
      if (this.destroyed) return;
    } else {
      this.dim.alpha = 1;
      if (this.flip) {
        const f = this.flip;
        f.t += dt / (f.fade ? 0.18 : FLIP_S);
        const t = Math.min(1, f.t);
        if (f.fade) {
          for (const side of [this.left!, this.right!]) side.view.root.alpha = t;
        } else {
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          this.applyLeaf(f.dir > 0 ? e : 1 - e);
        }
        if (f.t >= 1) this.finishFlip();
      } else if (this.pendingReveal.size > 0) this.startReveal();
      this.bookRoot.scale.set(this.settle.update(dt));
    }
    // Live pages: breathing bugs, glowing dots, twinkles, reveals, wiggles.
    const views = [this.left?.view, this.right?.view, this.flip?.front, this.flip?.back].filter(
      (v): v is SideView => !!v && !v.root.destroyed,
    );
    for (const v of new Set(views)) {
      for (const p of v.pictures) p.update(dt);
      for (const t of v.tick) t(this.time, dt);
      for (const e of v.entries) this.updateEntry(e, dt, reduce);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i]!;
      pop.t = Math.min(1, pop.t + dt * 3.5);
      if (pop.node.destroyed) this.pops.splice(i, 1);
      else pop.node.scale.set(reduce ? 1 : Math.max(0.01, pop.t + 0.4 * Math.sin(pop.t * Math.PI)));
      if (pop.t >= 1) this.pops.splice(i, 1);
    }
    for (const [page, w] of this.tabWiggle) {
      const tab = this.tabs.get(page);
      const nw = Math.max(0, w - dt * 3);
      this.tabWiggle.set(page, nw);
      if (tab) tab.rotation = reduce ? 0 : Math.sin(nw * 20) * 0.08 * nw;
    }
    this.updateBursts(dt);
  }

  private updateOpening(dt: number, reduce: boolean): void {
    this.phaseT += dt;
    if (reduce) {
      this.alpha = Math.min(1, this.alpha + dt * 6);
      this.phaseT = OPEN_FLY_S + OPEN_FLIP_S;
    }
    const at = this.hooks.buttonAt();
    const fly = Math.min(1, this.phaseT / OPEN_FLY_S);
    // Ease out with a little overshoot.
    const k = reduce ? 1 : 1 + 2.2 * Math.pow(fly - 1, 3) + 1.2 * Math.pow(fly - 1, 2);
    const s = 0.08 + 0.92 * k;
    const home = { x: CX, y: CY };
    // The closed book's middle travels from the button to the right half of the spread.
    const half = (PAGE_W + COVER_PAD) / 2;
    const u = Math.min(1, k);
    this.bookRoot.position.set(at.x + (CX + half - at.x) * u - half * s, at.y + (CY - at.y) * u);
    this.bookRoot.scale.set(s);
    this.bookRoot.rotation = reduce ? 0 : (1 - fly) * 0.25;
    this.dim.alpha = Math.min(1, this.phaseT / OPEN_FLY_S);
    this.closeButton.alpha = this.dim.alpha;
    const p = Math.max(0, Math.min(1, (this.phaseT - OPEN_FLY_S) / OPEN_FLIP_S));
    this.flip = null;
    const opened = p >= 0.5;
    this.left!.view.root.visible = opened;
    this.coverLeft.visible = opened;
    this.controls.visible = opened;
    this.gutter.visible = opened;
    const e = 1 - Math.pow(1 - p, 3);
    this.applyLeaf(e);
    if (p >= 1) {
      this.phase = 'open';
      this.bookRoot.position.set(home.x, home.y);
      this.bookRoot.scale.set(1);
      this.bookRoot.rotation = 0;
      this.leaf.removeChildren();
      this.leaf.addChild(this.leafShade);
      this.leafShade.clear();
      const l = this.left!.view.root;
      l.scale.set(1);
      l.skew.set(0);
      l.visible = true;
      this.pages.addChildAt(l, 0);
      if (!reduce) this.settle.kick(1.03);
      if (this.queued !== null) {
        const to = this.queued;
        this.queued = null;
        this.turnTo(to);
      }
    }
  }

  private updateClosing(dt: number, reduce: boolean): void {
    this.phaseT += dt;
    const total = reduce ? 0.2 : CLOSE_S;
    const t = Math.min(1, this.phaseT / total);
    if (reduce) {
      this.alpha = 1 - t;
    } else {
      // First half: the left half folds over; second: the closed book flies home.
      const p = Math.min(1, t / 0.55);
      const back = this.left!.view.root;
      const c = Math.cos(Math.PI * (1 - p));
      back.visible = p < 0.5;
      back.scale.x = Math.max(0.001, -c);
      this.closedFront.visible = p >= 0.5;
      this.closedFront.scale.x = Math.max(0.001, c);
      if (p >= 0.5) {
        this.right!.view.root.visible = false;
        this.tabLayer.visible = false;
        this.coverLeft.visible = false;
        this.controls.visible = false;
        this.gutter.visible = false;
      }
      const fly = Math.max(0, (t - 0.55) / 0.45);
      const at = this.hooks.buttonAt();
      const k = fly * fly;
      const s = 1 - 0.92 * k;
      const half = (PAGE_W + COVER_PAD) / 2;
      this.bookRoot.position.set(CX + half + (at.x - CX - half) * k - half * s, CY + (at.y - CY) * k);
      this.bookRoot.scale.set(s);
      this.bookRoot.rotation = k * 0.3;
      this.dim.alpha = 1 - t;
      this.closeButton.alpha = 1 - t;
    }
    if (t >= 1) {
      this.onClosed?.();
      this.onClosed = null;
    }
  }

  private updateEntry(v: EntryView, dt: number, reduce: boolean): void {
    if (v.sparkle) drawSparkle(v.sparkle, this.time, v.sparkleAt?.w ?? 160, v.sparkleAt?.h ?? 160);
    if (v.wiggle > 0) {
      v.wiggle = Math.max(0, v.wiggle - dt * 3);
      v.node.rotation = reduce ? 0 : Math.sin(v.wiggle * 22) * 0.05 * v.wiggle;
    }
    if (v.t === -1) return;
    const before = v.t;
    v.t += dt;
    if (v.t < 0) return;
    if (before < 0) {
      this.hooks.sound('reveal');
      this.burst(v.node, v.sparkleAt?.x ?? 0, v.sparkleAt?.y ?? 0);
    }
    // Into color over 0.45 s, with a pop.
    const k = Math.min(1, v.t / 0.45);
    v.picture?.reveal(k);
    if (v.tintNode) v.tintNode.tint = revealTint(k);
    if (v.label) v.label.alpha = k;
    const pop = reduce ? 1 : 1 + 0.12 * Math.sin(Math.min(1, v.t / 0.5) * Math.PI);
    if (v.picture) v.picture.scale.set(pop);
    // Then the stamp thunks down.
    const st = v.t - 0.45;
    if (v.stamp) {
      v.stamp.visible = st > 0;
      if (st > 0) {
        const slam = stampSlam(st);
        v.stamp.scale.set(reduce ? 1 : slam.scale);
        v.stamp.alpha = slam.alpha;
      }
    }
    if (st - dt < 0.16 && st >= 0.16) this.hooks.sound('stamp');
    if (v.badge) {
      const bt = v.t - 0.7;
      v.badge.visible = bt > 0;
      if (bt > 0)
        v.badge.scale.set(
          reduce ? 1 : Math.min(1, bt * 6) * (1 + 0.25 * Math.exp(-bt * 6) * Math.sin(bt * 30)),
        );
    }
    if (v.t > 1.4) {
      v.t = -1;
      v.picture?.reveal(1);
      if (v.picture) v.picture.scale.set(1);
      if (v.tintNode) v.tintNode.tint = 0xffffff;
      if (v.stamp) v.stamp.scale.set(1);
      if (v.badge) v.badge.scale.set(1);
    }
  }

  private updateBursts(dt: number): void {
    const g = this.fx.clear();
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      let alive = false;
      for (const p of b.parts) {
        p.life -= dt;
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 500 * dt;
        p.vx *= 1 - dt * 2.5;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        twinkle(g, p.x, p.y, p.r * Math.min(1, p.life * 3), p.color, Math.min(1, p.life * 2.5));
      }
      if (!alive) this.bursts.splice(i, 1);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const side of [this.left, this.right]) if (side) disposeSide(side.view);
    this.left = null;
    this.right = null;
    super.destroy(options);
  }

  /** Is anything still moving (the open, a turn, a reveal)? */
  get busy(): boolean {
    const revealing = [this.left?.view, this.right?.view].some((v) => v?.entries.some((e) => e.t !== -1));
    return this.phase !== 'open' || this.flip !== null || this.pendingReveal.size > 0 || revealing;
  }

  /** For the test hook. */
  info(): {
    page: PageId | null;
    spread: number;
    spreads: number;
    index: number;
    count: number;
    busy: boolean;
    phase: string;
    shown: { key: string; state: string; isNew: boolean; extra: string | null; sparkle: boolean }[];
    photos: number;
  } {
    const s = this.spreads[this.current]!;
    const entries = [this.left?.view, this.right?.view].flatMap((v) => v?.entries ?? []);
    const photos = s.left.kind === 'photos' ? s.left.photos.length : 0;
    const photosR = s.right.kind === 'photos' ? s.right.photos.length : 0;
    return {
      page: s.page,
      spread: this.current,
      spreads: this.spreads.length,
      index: s.index,
      count: s.count,
      busy: this.busy,
      phase: this.phase,
      shown: entries.map((v) => ({
        key: v.entry.key,
        state: v.entry.state,
        isNew: v.entry.isNew || this.revealed.has(v.entry.key),
        extra: v.entry.extra ?? (this.opened.has(v.entry.key) ? predictExtra(v.entry) : null),
        sparkle: v.entry.sparkle,
      })),
      photos: photos + photosR,
    };
  }
}

/** A hint pictogram in a cream bubble, for a sparkle's extra. */
function hintBubble(hint: string, s: number, content: Content): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, s * 0.62)
    .fill(0xfff2a8)
    .stroke(stroke(4));
  c.addChild(g);
  const node = hintNode(hint, s * 0.8, content);
  c.addChild(node);
  return c;
}
