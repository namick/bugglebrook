import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent, Renderer } from 'pixi.js';
import type { Command, PhotoRecord, Sim } from '../../../game';
import { PIXELS_PER_METER } from '../../../game/constants';
import { PHOTO_THUMB_WIDTH } from '../../../shared/photo';
import type { SfxName } from '../audio/sfx';
import type { Camera, Point } from '../render/camera';
import { OUTLINE, STAR, stroke } from '../render/palette';
import { Bounce, PictureButton, markUi } from '../ui/button';
import { CREAM, LEAF, LEAF_DARK, WOOD, WOOD_DARK, token } from '../ui/icons';
import { FILTERS, LookFilter, filterById } from './filters';
import type { FilterDef } from './filters';
import { FRAMES, frameById } from './frames';
import type { FrameDef } from './frames';
import {
  DEFAULT_VIEW,
  H,
  STICKER_SIZE,
  W,
  bugsInFrame,
  clampView,
  dragHandle,
  offPhoto,
  panView,
  settleSticker,
  stickerAt,
  stickerHandle,
  viewTransform,
  wheelZoom,
  zoomAt,
} from './photoMath';
import type { PhotoView, StickerPlacement } from './photoMath';
import { lockedStickers, trayStickers } from './stickers';
import type { StickerDef } from './stickers';

export interface PhotoHooks {
  sound(name: SfxName, strength?: number): void;
  send(command: Command): void;
  /** Write the PNG (its bytes). Resolves to its path. */
  save(png: Uint8Array): Promise<string>;
  reduceMotion(): boolean;
  /** A photo was taken. The record's `file` fills in once the write finishes. */
  onPhoto(record: PhotoRecord): void;
  /** the polaroid landed on the journal. */
  onLanded(): void;
  /** Where the polaroid flies to, in view pixels. */
  journalAt(): Point;
  /** The time for the record (ISO). */
  now(): string;
}

/** The three trays, one open at a time. */
export type TrayKind = 'frames' | 'filters' | 'stickers';

/** Stickers shown per tray page. */
export const TRAY_PER_PAGE = 14;
const TRAY_PITCH = 92;
/** The tray band along the bottom: its top edge, and the y its cards sit on. */
const TRAY_TOP = H - 150;
const TRAY_Y = H - 76;
/** The tray's left and right ends: it leaves room for the tabs and the shutter. */
const TRAY_X0 = 170;
const TRAY_X1 = W - 290;
const FRAME_THUMB_W = 118;
const FRAME_PITCH = 140;
const FILTER_PITCH = 108;
const TAB_X = 76;
const SHUTTER_AT = { x: W - 140, y: H - 140 };
/** How long the polaroid takes to fly to the journal, in seconds. */
export const POLAROID_FLIGHT = 1.1;

interface Flying {
  node: Container;
  from: Point;
  t: number;
  record: PhotoRecord;
  cross: Graphics;
}

/**
 * Photo mode (game design doc, section 14). While it is open the world view
 * lives inside its `scene` (zoomed and filtered, with the frame and the
 * stickers over it), which is what the shutter captures. Everything else
 * here is the viewfinder: corner brackets, three small tabs at the bottom
 * left that open one tray at a time (frames, filters, stickers), the big
 * round shutter at the bottom right, and the flash. The chrome fades while
 * the player drags the view, so the scene stays the point.
 */
export class PhotoMode extends Container {
  /** What the photo is of: the zoomed world, the filter, the stickers, and the frame. */
  readonly scene = new Container();
  private readonly zoomed = new Container();
  /**
   * Holds the zoomed world and carries the look filter. Its filter area is
   * the screen: the world view's own bounds are the whole 195 m world, and a
   * filter over that would want a texture tens of thousands of pixels wide.
   */
  private readonly filtered = new Container();
  private readonly stickerLayer = new Container();
  private readonly frameLayer = new Graphics();
  /** Catches pans, zooms, and sticker drags on the photo itself. */
  private readonly pad = new Graphics();
  private readonly viewfinder = new Graphics();
  private readonly handles = new Graphics();
  private readonly flash = new Graphics();
  /** Everything that is not the photo: tabs, the tray, the shutter. */
  private readonly ui = new Container();
  private readonly tray = new Container();
  private readonly trayBand = new Graphics();
  private readonly trayCards = new Container();
  readonly shutter: PictureButton;
  readonly trayPrev: PictureButton;
  readonly trayNext: PictureButton;
  readonly tabs = new Map<TrayKind, PictureButton>();
  readonly frameButtons = new Map<string, PictureButton>();
  readonly filterButtons = new Map<string, PictureButton>();
  readonly trayButtons = new Map<string, Container>();
  private readonly look: LookFilter;

  view: PhotoView = { ...DEFAULT_VIEW };
  frame: FrameDef = FRAMES[0]!;
  filter: FilterDef = FILTERS[0]!;
  stickers: StickerPlacement[] = [];
  private readonly stickerNodes: Container[] = [];
  selected = -1;
  /** The open tray, or null. */
  open: TrayKind | null = null;
  trayPage = 0;
  private readonly trayDefs: StickerDef[];
  private readonly lockedDefs: StickerDef[];
  private pointer: Point | null = null;
  private drag: { kind: 'pan' | 'sticker' | 'handle' | 'new'; last: Point; moved: number } | null = null;
  private flashAlpha = 0;
  /** The brightest the flash got for the last photo (tests check reduce motion). */
  flashPeak = 0;
  private readonly flying: Flying[] = [];
  private slide = 0;
  /** How far the tray is out, 0 to 1. */
  private trayOut = 0;
  /** The chrome's alpha: it fades while the view is dragged. */
  private chrome = 1;
  private closing = false;
  /** How many photos were taken this visit. */
  taken = 0;
  /** The last photo's record. */
  last: PhotoRecord | null = null;
  shooting = false;
  private readonly pop = new Bounce(300, 14);
  private time = 0;
  onClosed: (() => void) | null = null;

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    readonly worldView: Container,
    private readonly renderer: Renderer,
    private readonly hooks: PhotoHooks,
  ) {
    super();
    this.eventMode = 'static';
    const found = sim
      .views()
      .filter((v) => v.bug && !v.bug.pending && v.pocket === undefined)
      .map((v) => v.defId)
      .filter((id, i, all) => all.indexOf(id) === i)
      .map((id) => sim.content.bugs.get(id));
    this.trayDefs = trayStickers(found, sim.secrets);
    this.lockedDefs = lockedStickers(sim.secrets);
    this.look = new LookFilter(0);

    // The pad sits under the photo's UI and over the scene: it takes pans and sticker drags.
    this.pad.rect(0, 0, W, H).fill({ color: 0, alpha: 0 });
    this.pad.eventMode = 'static';
    this.pad.on('pointerdown', (e: FederatedPointerEvent) => this.down(e));
    this.pad.on('wheel', (e: FederatedWheelEvent) => this.wheel(e));
    this.on('globalpointermove', (e: FederatedPointerEvent) => this.move(e));
    const up = (e: FederatedPointerEvent): void => this.up(e);
    this.pad.on('pointerup', up);
    this.pad.on('pointerupoutside', up);
    this.handles.eventMode = 'none';
    this.flash.rect(0, 0, W, H).fill(0xffffff);
    this.flash.alpha = 0;
    this.flash.eventMode = 'none';
    this.viewfinder.eventMode = 'none';
    this.drawViewfinder();

    this.zoomed.addChild(worldView);
    this.filtered.addChild(this.zoomed);
    this.filtered.filterArea = new Rectangle(0, 0, W, H);
    this.filtered.filters = [];
    this.scene.addChild(this.filtered, this.stickerLayer, this.frameLayer);
    this.scene.eventMode = 'none';
    this.ui.eventMode = 'static';
    markUi(this.ui);

    this.shutter = this.makeShutter();
    this.trayPrev = this.trayArrow(-1);
    this.trayNext = this.trayArrow(1);
    this.buildTray();
    this.buildTabs();
    this.ui.addChild(this.tray, ...this.tabs.values(), this.shutter);
    this.addChild(this.scene, this.pad, this.viewfinder, this.handles, this.ui, this.flash);
    this.applyView();
    this.pop.value = 0.6;
    this.pop.target = 1;
  }

  // --- Building -------------------------------------------------------------

  /** Four corner brackets round the screen: the viewfinder. */
  private drawViewfinder(): void {
    const g = this.viewfinder;
    const inset = 28;
    const len = 90;
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      const x = sx > 0 ? inset : W - inset;
      const y = sy > 0 ? inset : H - inset;
      g.moveTo(x, y + sy * len)
        .lineTo(x, y)
        .lineTo(x + sx * len, y)
        .stroke({ width: 16, color: OUTLINE, cap: 'round', join: 'round', alpha: 0.55 });
      g.moveTo(x, y + sy * len)
        .lineTo(x, y)
        .lineTo(x + sx * len, y)
        .stroke({ width: 8, color: 0xffffff, cap: 'round', join: 'round' });
    }
    // A thin middle mark on each edge, like a real viewfinder.
    for (const [x0, y0, x1, y1] of [
      [W / 2 - 26, 30, W / 2 + 26, 30],
      [W / 2 - 26, H - 30, W / 2 + 26, H - 30],
      [30, H / 2 - 26, 30, H / 2 + 26],
      [W - 30, H / 2 - 26, W - 30, H / 2 + 26],
    ] as const) {
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 10, color: OUTLINE, cap: 'round', alpha: 0.45 });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 4, color: 0xffffff, cap: 'round' });
    }
  }

  private makeShutter(): PictureButton {
    const art = new Graphics();
    art.circle(0, 8, 68).fill({ color: OUTLINE, alpha: 0.2 });
    art.circle(0, 0, 68).fill(CREAM).stroke(stroke(7));
    art.circle(0, 0, 50).fill(0xff4f5e).stroke(stroke(6));
    art.ellipse(-14, -18, 16, 9).fill({ color: 0xffffff, alpha: 0.55 });
    const button = new PictureButton(art, 160, 160, () => this.shoot());
    button.position.set(SHUTTER_AT.x, SHUTTER_AT.y);
    button.label = 'shutter';
    button.onHover = () => this.hooks.sound('hover', 0.5);
    return button;
  }

  private trayArrow(dir: 1 | -1): PictureButton {
    const art = token(new Graphics(), 28);
    art
      .moveTo(-7 * dir, -13)
      .lineTo(9 * dir, 0)
      .lineTo(-7 * dir, 13)
      .closePath()
      .fill(LEAF_DARK)
      .stroke(stroke(4));
    const button = new PictureButton(art, 70, 70, () => this.turnTray(dir));
    button.position.set(dir < 0 ? TRAY_X0 + 44 : TRAY_X1 - 44, TRAY_Y);
    button.label = dir < 0 ? 'tray_prev' : 'tray_next';
    button.onHover = () => this.hooks.sound('hover', 0.5);
    return button;
  }

  /** Three small tabs at the bottom left: a frame, a sun behind a lens, a peeling star sticker. */
  private buildTabs(): void {
    const icons: Record<TrayKind, (g: Graphics) => void> = {
      frames: (g) => {
        g.roundRect(-24, -18, 48, 36, 4).fill(CREAM).stroke(stroke(4.5));
        g.roundRect(-16, -11, 32, 22, 2).fill(0x7ec8ff);
        g.rect(-16, 3, 32, 8).fill(LEAF);
        g.circle(-6, -3, 4).fill(STAR);
      },
      filters: (g) => {
        g.circle(0, 0, 22).fill(0xffffff).stroke(stroke(4.5));
        g.moveTo(0, -22)
          .arc(0, 0, 22, -Math.PI / 2, Math.PI / 2)
          .closePath()
          .fill(0xffb347);
        g.moveTo(0, -22)
          .arc(0, 0, 22, Math.PI / 2, (3 * Math.PI) / 2)
          .closePath()
          .fill(0x7fb8ff);
        g.moveTo(0, -22).lineTo(0, 22).stroke(stroke(3.5));
      },
      stickers: (g) => {
        g.star(2, 2, 5, 24, 11, 0.2).fill(STAR).stroke(stroke(4.5));
        // A peeled corner.
        g.moveTo(14, 16).lineTo(26, 6).lineTo(26, 20).closePath().fill(0xffffff).stroke(stroke(3));
      },
    };
    (['frames', 'filters', 'stickers'] as const).forEach((kind, i) => {
      const art = new Container();
      art.addChild(token(new Graphics(), 36));
      const icon = new Graphics();
      icons[kind](icon);
      art.addChild(icon);
      const ring = new Graphics().circle(0, 0, 43).stroke({ width: 6, color: STAR });
      ring.label = 'ring';
      ring.visible = false;
      art.addChild(ring);
      const button = new PictureButton(art, 92, 92, () => this.toggleTray(kind));
      button.position.set(TAB_X, H - 76 - (2 - i) * 96);
      button.label = `tab_${kind}`;
      button.onHover = () => this.hooks.sound('hover', 0.4);
      this.tabs.set(kind, button);
    });
  }

  /** The tray band along the bottom. Its cards are filled in for the open tab. */
  private buildTray(): void {
    const g = this.trayBand;
    const w = TRAY_X1 - TRAY_X0;
    g.roundRect(TRAY_X0 + 6, TRAY_TOP + 20, w, 170, 34).fill({ color: OUTLINE, alpha: 0.2 });
    g.roundRect(TRAY_X0, TRAY_TOP + 12, w, 170, 34)
      .fill(WOOD)
      .stroke(stroke(6));
    g.roundRect(TRAY_X0 + 18, TRAY_TOP + 28, w - 36, 7, 3).fill({ color: WOOD_DARK, alpha: 0.5 });
    g.eventMode = 'static';
    g.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.tray.addChild(g, this.trayCards, this.trayPrev, this.trayNext);
    this.tray.y = 230;
    this.tray.visible = false;
  }

  /** Open a tray (closing the others), or close it if it is the open one. */
  toggleTray(kind: TrayKind): void {
    this.open = this.open === kind ? null : kind;
    for (const [k, b] of this.tabs) b.art.getChildByLabel('ring')!.visible = k === this.open;
    this.hooks.sound(this.open ? 'ui_open' : 'ui_close', 0.7);
    if (this.open) this.fillTray();
  }

  private fillTray(): void {
    this.trayCards.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.frameButtons.clear();
    this.filterButtons.clear();
    this.trayButtons.clear();
    this.trayPrev.visible = this.trayNext.visible = false;
    if (this.open === 'frames') this.fillFrames();
    else if (this.open === 'filters') this.fillFilters();
    else if (this.open === 'stickers') this.fillStickers();
  }

  /** A locked thing's cover: a dim pane with a little padlock ring. */
  private lockOver(g: Graphics, w: number, h: number, round: number): void {
    g.roundRect(-w / 2, -h / 2, w, h, round).fill({ color: 0x3a3045, alpha: 0.78 });
    g.circle(0, -5, Math.min(w, h) * 0.22).stroke({ width: 4, color: 0xffffff, alpha: 0.7 });
    g.circle(0, Math.min(w, h) * 0.18, 3.5).fill({ color: 0xffffff, alpha: 0.7 });
  }

  /** A card with a tiny picture of each frame, in a row. */
  private fillFrames(): void {
    const thumbH = (FRAME_THUMB_W * H) / W;
    const x0 = (TRAY_X0 + TRAY_X1) / 2 - ((FRAMES.length - 1) * FRAME_PITCH) / 2;
    FRAMES.forEach((def, i) => {
      const unlocked = !def.unlock || this.sim.secrets.includes(def.unlock);
      const art = new Container();
      const card = new Graphics();
      card
        .roundRect(-FRAME_THUMB_W / 2 - 6, -thumbH / 2 - 1, FRAME_THUMB_W + 12, thumbH + 12, 10)
        .fill({ color: OUTLINE, alpha: 0.2 });
      card
        .roundRect(-FRAME_THUMB_W / 2 - 6, -thumbH / 2 - 6, FRAME_THUMB_W + 12, thumbH + 12, 10)
        .fill(CREAM)
        .stroke(stroke(4.5));
      art.addChild(card);
      // A little sky and grass behind the frame, so its shape reads.
      const mini = new Container();
      const scene = new Graphics();
      scene.rect(0, 0, W, H).fill(0x7ec8ff);
      scene.rect(0, H * 0.62, W, H * 0.38).fill(0x7bd84a);
      scene
        .circle(W * 0.5, H * 0.66, 90)
        .fill(0xe8485c)
        .stroke(stroke(14));
      const frame = new Graphics();
      def.draw(frame);
      mini.addChild(scene, frame);
      mini.scale.set(FRAME_THUMB_W / W);
      mini.position.set(-FRAME_THUMB_W / 2, -thumbH / 2);
      const mask = new Graphics()
        .roundRect(-FRAME_THUMB_W / 2, -thumbH / 2, FRAME_THUMB_W, thumbH, 6)
        .fill(0xffffff);
      mini.mask = mask;
      art.addChild(mini, mask);
      if (!unlocked) {
        const lock = new Graphics();
        this.lockOver(lock, FRAME_THUMB_W, thumbH, 6);
        art.addChild(lock);
      }
      const ring = new Graphics();
      ring
        .roundRect(-FRAME_THUMB_W / 2 - 10, -thumbH / 2 - 10, FRAME_THUMB_W + 20, thumbH + 20, 12)
        .stroke({ width: 6, color: STAR });
      ring.label = 'ring';
      ring.visible = def.id === this.frame.id;
      art.addChild(ring);
      const button = new PictureButton(art, FRAME_PITCH - 6, 110, () => this.pickFrame(def));
      button.enabled = unlocked;
      if (!unlocked) button.alpha = 0.8;
      button.position.set(x0 + i * FRAME_PITCH, TRAY_Y);
      button.label = def.id;
      button.onHover = () => this.hooks.sound('hover', 0.4);
      this.frameButtons.set(def.id, button);
      this.trayCards.addChild(button);
    });
  }

  /** A token per filter, in a row. */
  private fillFilters(): void {
    const x0 = (TRAY_X0 + TRAY_X1) / 2 - ((FILTERS.length - 1) * FILTER_PITCH) / 2;
    FILTERS.forEach((def, i) => {
      const unlocked = !def.unlock || this.sim.secrets.includes(def.unlock);
      const art = new Container();
      art.addChild(token(new Graphics(), 40));
      const icon = new Graphics();
      def.icon(icon, 64);
      art.addChild(icon);
      if (!unlocked) {
        const lock = new Graphics();
        lock.circle(0, 0, 40).fill({ color: 0x3a3045, alpha: 0.78 });
        lock.circle(0, -4, 12).stroke({ width: 4, color: 0xffffff, alpha: 0.7 });
        lock.circle(0, 10, 3.5).fill({ color: 0xffffff, alpha: 0.7 });
        art.addChild(lock);
      }
      const ring = new Graphics().circle(0, 0, 47).stroke({ width: 6, color: STAR });
      ring.label = 'ring';
      ring.visible = def.id === this.filter.id;
      art.addChild(ring);
      const button = new PictureButton(art, 100, 100, () => this.pickFilter(def));
      button.enabled = unlocked;
      button.position.set(x0 + i * FILTER_PITCH, TRAY_Y);
      button.label = def.id;
      button.onHover = () => this.hooks.sound('hover', 0.4);
      this.filterButtons.set(def.id, button);
      this.trayCards.addChild(button);
    });
  }

  /** One page of stickers, arrows at each end when there is more than one. */
  private fillStickers(): void {
    const all: { def: StickerDef; locked: boolean }[] = [
      ...this.trayDefs.map((def) => ({ def, locked: false })),
      ...this.lockedDefs.map((def) => ({ def, locked: true })),
    ];
    const pages = this.trayPages;
    this.trayPage = ((this.trayPage % pages) + pages) % pages;
    const page = all.slice(this.trayPage * TRAY_PER_PAGE, (this.trayPage + 1) * TRAY_PER_PAGE);
    const x0 = (TRAY_X0 + TRAY_X1) / 2 - ((page.length - 1) * TRAY_PITCH) / 2;
    page.forEach(({ def, locked }, i) => {
      const card = new Container();
      markUi(card);
      const back = new Graphics();
      back.roundRect(-40, -36, 80, 80, 14).fill({ color: OUTLINE, alpha: 0.18 });
      back.roundRect(-40, -40, 80, 80, 14).fill(CREAM).stroke(stroke(4));
      card.addChild(back);
      const art = new Graphics();
      def.draw(art);
      art.scale.set(60 / STICKER_SIZE);
      if (locked) {
        art.tint = 0x6a6070;
        art.alpha = 0.55;
        const q = new Graphics();
        q.roundRect(-5, -18, 10, 22, 5).fill(0xffffff);
        q.circle(0, 14, 5).fill(0xffffff);
        card.addChild(art, q);
      } else card.addChild(art);
      card.position.set(x0 + i * TRAY_PITCH, TRAY_Y);
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.hitArea = new Rectangle(-44, -44, 88, 88);
      card.label = def.id;
      if (!locked) {
        card.on('pointerover', () => {
          card.scale.set(1.1);
          this.hooks.sound('hover', 0.4);
        });
        card.on('pointerout', () => card.scale.set(1));
        card.on('pointerdown', (e: FederatedPointerEvent) => {
          e.stopPropagation();
          this.pickUp(def, { x: e.global.x, y: e.global.y });
        });
      } else card.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
      this.trayButtons.set(def.id, card);
      this.trayCards.addChild(card);
    });
    this.trayPrev.visible = this.trayNext.visible = pages > 1;
  }

  /** How many sticker pages there are. */
  get trayPages(): number {
    return Math.max(1, Math.ceil((this.trayDefs.length + this.lockedDefs.length) / TRAY_PER_PAGE));
  }

  turnTray(dir: 1 | -1): void {
    this.trayPage += dir;
    this.hooks.sound('ui_pop');
    this.fillTray();
  }

  // --- Picking frames and filters -------------------------------------------

  pickFrame(def: FrameDef): void {
    this.frame = frameById(def.id);
    this.frameLayer.clear();
    this.frame.draw(this.frameLayer);
    for (const [id, b] of this.frameButtons) b.art.getChildByLabel('ring')!.visible = id === def.id;
    this.hooks.sound('sticker_stick', 0.8);
  }

  pickFilter(def: FilterDef): void {
    this.filter = filterById(def.id);
    this.look.setMode(this.filter.mode);
    this.filtered.filters = this.filter.mode === 0 ? [] : [this.look];
    for (const [id, b] of this.filterButtons) b.art.getChildByLabel('ring')!.visible = id === def.id;
    this.hooks.sound('ui_tick', 0.6 + 0.05 * def.mode);
  }

  // --- Stickers --------------------------------------------------------------

  private stickerNode(def: StickerDef): Container {
    const node = new Container();
    const g = new Graphics();
    def.draw(g);
    node.addChild(g);
    return node;
  }

  /** A sticker comes off the tray into the hand. */
  private pickUp(def: StickerDef, at: Point): void {
    const p = this.toLocal(at);
    this.stickers.push({ id: def.id, x: p.x, y: p.y, scale: 0.2, rotation: 0 });
    this.stickerNodes.push(this.stickerLayer.addChild(this.stickerNode(def)));
    this.selected = this.stickers.length - 1;
    this.drag = { kind: 'new', last: p, moved: 0 };
    this.hooks.sound('sticker_peel', 0.9);
  }

  /** Put a sticker on at a point (tests and staging). */
  place(id: string, x: number, y: number, scale = 1, rotation = 0): number {
    const def = [...this.trayDefs, ...this.lockedDefs].find((d) => d.id === id);
    if (!def) return -1;
    this.stickers.push(settleSticker({ id, x, y, scale, rotation }, this.open !== null));
    this.stickerNodes.push(this.stickerLayer.addChild(this.stickerNode(def)));
    this.selected = this.stickers.length - 1;
    return this.selected;
  }

  private removeSticker(i: number): void {
    this.stickers.splice(i, 1);
    const [node] = this.stickerNodes.splice(i, 1);
    node?.destroy({ children: true });
    if (this.selected === i) this.selected = -1;
    else if (this.selected > i) this.selected--;
  }

  private bringToFront(i: number): number {
    const [s] = this.stickers.splice(i, 1);
    const [n] = this.stickerNodes.splice(i, 1);
    this.stickers.push(s!);
    this.stickerNodes.push(n!);
    this.stickerLayer.addChild(n!);
    return this.stickers.length - 1;
  }

  private syncStickers(): void {
    this.stickers.forEach((s, i) => {
      const node = this.stickerNodes[i]!;
      node.position.set(s.x, s.y);
      node.rotation = s.rotation;
      // A fresh sticker pops up to size as it leaves the tray.
      const pop = this.drag?.kind === 'new' && i === this.selected ? this.pop.value : 1;
      node.scale.set(s.scale * pop);
    });
    const g = this.handles.clear();
    const sel = this.stickers[this.selected];
    if (!sel || this.shooting) return;
    const half = (STICKER_SIZE / 2) * sel.scale;
    const c = Math.cos(sel.rotation);
    const sn = Math.sin(sel.rotation);
    const corner = (lx: number, ly: number): [number, number] => [
      sel.x + lx * c - ly * sn,
      sel.y + lx * sn + ly * c,
    ];
    const pts = [corner(-half, -half), corner(half, -half), corner(half, half), corner(-half, half)].flat();
    g.poly(pts).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
    g.poly(pts).stroke({ width: 2, color: OUTLINE, alpha: 0.6 });
    const h = stickerHandle(sel);
    const pulse = 1 + 0.06 * Math.sin(this.time * 6);
    g.circle(h.x, h.y + 3, 22 * pulse).fill({ color: OUTLINE, alpha: 0.25 });
    g.circle(h.x, h.y, 22 * pulse)
      .fill(STAR)
      .stroke(stroke(5));
    // A little curved arrow on the knob: turn and stretch.
    g.moveTo(h.x + Math.cos(-2.4) * 11 * pulse, h.y + Math.sin(-2.4) * 11 * pulse)
      .arc(h.x, h.y, 11 * pulse, -2.4, 0.9)
      .stroke({ width: 4, color: OUTLINE, cap: 'round' });
    g.moveTo(h.x + 7 * pulse, h.y + 14 * pulse)
      .lineTo(h.x + 12 * pulse, h.y + 4 * pulse)
      .lineTo(h.x + 2 * pulse, h.y + 6 * pulse)
      .fill(OUTLINE);
  }

  // --- Input --------------------------------------------------------------------

  private down(e: FederatedPointerEvent): void {
    if (this.closing || this.shooting) return;
    e.stopPropagation();
    const p = this.toLocal(e.global);
    const sel = this.stickers[this.selected];
    if (sel && Math.hypot(p.x - stickerHandle(sel).x, p.y - stickerHandle(sel).y) <= 34) {
      this.drag = { kind: 'handle', last: p, moved: 0 };
      this.hooks.sound('pick', 0.5);
      return;
    }
    const hit = stickerAt(this.stickers, p);
    if (hit >= 0) {
      this.selected = this.bringToFront(hit);
      this.drag = { kind: 'sticker', last: p, moved: 0 };
      this.hooks.sound('pick', 0.6);
      return;
    }
    this.selected = -1;
    this.drag = { kind: 'pan', last: p, moved: 0 };
    this.camera.holding = true;
  }

  private move(e: FederatedPointerEvent): void {
    const p = this.toLocal(e.global);
    this.pointer = p;
    const d = this.drag;
    if (!d) return;
    const dx = p.x - d.last.x;
    const dy = p.y - d.last.y;
    d.moved += Math.hypot(dx, dy);
    d.last = p;
    const sel = this.stickers[this.selected];
    if (d.kind === 'pan') {
      const r = panView(this.view, dx, dy);
      this.view = r.view;
      if (r.overX !== 0) this.camera.panBy(r.overX / PIXELS_PER_METER);
      this.applyView();
    } else if (sel && (d.kind === 'sticker' || d.kind === 'new')) {
      sel.x += dx;
      sel.y += dy;
    } else if (sel && d.kind === 'handle') {
      this.stickers[this.selected] = dragHandle(sel, p);
    }
  }

  private up(e: FederatedPointerEvent): void {
    if (this.drag) e.stopPropagation();
    this.release(e.global);
  }

  /**
   * The pointer went up at a stage point: finish any drag. The game also
   * calls this for releases over its own buttons, so a sticker is never
   * left hanging from the hand.
   */
  release(global: Point): void {
    const d = this.drag;
    this.drag = null;
    this.camera.holding = false;
    if (!d) return;
    const p = this.toLocal(global);
    const i = this.selected;
    const sel = this.stickers[i];
    if (sel && (d.kind === 'sticker' || d.kind === 'new')) {
      if (offPhoto(p, this.open !== null)) {
        this.removeSticker(i);
        this.hooks.sound('sticker_peel', 0.6);
      } else {
        this.stickers[i] = settleSticker(d.kind === 'new' ? { ...sel, scale: 1 } : sel, this.open !== null);
        if (d.kind === 'new') this.pop.kick(1.25);
        this.hooks.sound('sticker_stick');
      }
    } else if (d.kind === 'handle') this.hooks.sound('drop', 0.4);
  }

  private wheel(e: FederatedWheelEvent): void {
    if (this.closing || this.shooting) return;
    const p = this.toLocal(e.global);
    const before = this.view.zoom;
    this.view = zoomAt(this.view, wheelZoom(e.deltaY), p);
    if (this.view.zoom !== before) {
      this.applyView();
      this.hooks.sound('ui_tick', 0.3 + (this.view.zoom - 1) * 0.3);
    }
  }

  private applyView(): void {
    this.view = clampView(this.view);
    const t = viewTransform(this.view);
    this.zoomed.scale.set(t.scale);
    this.zoomed.position.set(t.x, t.y);
  }

  // --- The shutter ------------------------------------------------------------------

  /** Which bugs are in the frame right now, nearest the middle first. */
  bugsInFrame(): string[] {
    const bugs = this.sim
      .views()
      .filter((v) => v.bug && !v.bug.pending && v.pocket === undefined)
      .map((v) => {
        const p = this.camera.worldToView({ x: v.x, y: v.y });
        const r = this.sim.content.bugs.get(v.defId).radius * (v.scale ?? 1) * PIXELS_PER_METER;
        return { defId: v.defId, x: p.x, y: p.y, r };
      });
    return bugsInFrame(this.view, bugs);
  }

  /** Click: flash, the shutter sound, the file, and a polaroid that flies to the journal. */
  shoot(): void {
    if (this.shooting || this.closing) return;
    this.shooting = true;
    this.hooks.sound('shutter');
    const reduce = this.hooks.reduceMotion();
    this.flashAlpha = reduce ? 0.25 : 1;
    this.flashPeak = this.flashAlpha;
    this.handles.visible = false;
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = this.renderer.extract.canvas({
        target: this.scene,
        frame: new Rectangle(0, 0, W, H),
        resolution: 1,
        antialias: true,
      }) as HTMLCanvasElement;
    } catch (err) {
      console.warn('Could not take the photo', err);
    }
    this.handles.visible = true;
    const record: PhotoRecord = {
      at: this.hooks.now(),
      thumb: canvas ? thumbOf(canvas) : '',
      file: null,
      frame: this.frame.id,
      filter: this.filter.id,
    };
    this.taken++;
    this.last = record;
    this.hooks.send({
      type: 'photo_taken',
      frame: this.frame.id,
      filter: this.filter.id,
      stickers: this.stickers.length,
      zoom: this.view.zoom,
      bugs: this.bugsInFrame(),
    });
    this.hooks.onPhoto(record);
    const flying = this.launchPolaroid(canvas, record);
    // `toBlob` encodes the PNG off the main thread; `toDataURL` held the game up for a visible beat (P-20).
    const saved = canvas
      ? encodePng(canvas).then((png) => this.hooks.save(png))
      : Promise.reject(new Error('No picture'));
    saved.then(
      (path) => {
        record.file = path;
        this.hooks.send({ type: 'photo_saved', ok: true });
      },
      (err: unknown) => {
        console.warn('Could not save the photo', err);
        record.file = null;
        flying.cross.visible = true;
        this.hooks.send({ type: 'photo_saved', ok: false });
      },
    );
    this.shooting = false;
  }

  /** The photo as a small polaroid that flies to the journal. */
  private launchPolaroid(canvas: HTMLCanvasElement | null, record: PhotoRecord): Flying {
    const node = new Container();
    const picW = 420;
    const picH = (picW * H) / W;
    const frame = new Graphics();
    frame
      .roundRect(-picW / 2 - 18, -picH / 2 - 18 + 10, picW + 36, picH + 80, 10)
      .fill({ color: OUTLINE, alpha: 0.3 });
    frame
      .roundRect(-picW / 2 - 18, -picH / 2 - 18, picW + 36, picH + 80, 10)
      .fill(0xffffff)
      .stroke(stroke(6));
    node.addChild(frame);
    if (canvas) {
      const sprite = new Sprite(Texture.from(canvas));
      sprite.anchor.set(0.5);
      sprite.width = picW;
      sprite.height = picH;
      node.addChild(sprite);
    } else {
      node.addChild(new Graphics().rect(-picW / 2, -picH / 2, picW, picH).fill(0x9a9aa8));
    }
    // A red x for a photo that could not be written (hidden unless that happens).
    const cross = new Graphics();
    cross
      .moveTo(picW / 2 - 40, picH / 2 + 10)
      .lineTo(picW / 2 - 4, picH / 2 + 46)
      .moveTo(picW / 2 - 4, picH / 2 + 10)
      .lineTo(picW / 2 - 40, picH / 2 + 46)
      .stroke({ width: 10, color: 0xff3b4a, cap: 'round' });
    cross.visible = false;
    node.addChild(cross);
    node.position.set(W / 2, H / 2 - 40);
    node.eventMode = 'none';
    this.addChild(node);
    const flying: Flying = { node, from: { x: W / 2, y: H / 2 - 40 }, t: 0, record, cross };
    this.flying.push(flying);
    return flying;
  }

  // --- Per frame --------------------------------------------------------------------

  /** Slide the controls away; `onClosed` fires when they are gone. The world view is given back at once. */
  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.drag = null;
    this.camera.holding = false;
    this.pad.eventMode = 'none';
    this.ui.eventMode = 'none';
  }

  get isClosing(): boolean {
    return this.closing;
  }

  update(dt: number): void {
    this.time += dt;
    // The controls slide in from the edges and slide out on close.
    this.slide = this.closing ? Math.max(0, this.slide - dt * 5) : Math.min(1, this.slide + dt * 4);
    const k = 1 - (1 - this.slide) ** 3;
    // While the view is dragged the chrome fades, so the photo is all there is.
    const want = this.drag?.kind === 'pan' ? 0 : 1;
    this.chrome += (want - this.chrome) * Math.min(1, dt * (want ? 6 : 10));
    this.ui.alpha = this.chrome;
    this.viewfinder.alpha = k * (0.4 + 0.6 * this.chrome);
    this.handles.alpha = this.chrome;
    // The tray slides up when a tab opens and drops away when it closes.
    const trayWant = this.open && !this.closing ? 1 : 0;
    this.trayOut += (trayWant - this.trayOut) * Math.min(1, dt * 9);
    if (Math.abs(this.trayOut - trayWant) < 0.002) this.trayOut = trayWant;
    this.tray.y = (1 - this.trayOut) * 230;
    this.tray.visible = this.trayOut > 0.01;
    this.shutter.scale.set(k);
    let i = 0;
    for (const tab of this.tabs.values()) {
      tab.x = TAB_X - (1 - k) * (200 + i * 60);
      tab.update(dt);
      i++;
    }
    this.trayPrev.update(dt);
    this.trayNext.update(dt);
    for (const b of this.frameButtons.values()) b.update(dt);
    for (const b of this.filterButtons.values()) b.update(dt);
    this.pop.update(dt);
    this.syncStickers();
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * (this.hooks.reduceMotion() ? 1.2 : 2.6));
      this.flash.alpha = this.flashAlpha;
    }
    for (const f of [...this.flying]) {
      f.t += dt / POLAROID_FLIGHT;
      const u = Math.min(1, f.t);
      const to = this.hooks.journalAt();
      // Hold still a moment to be seen, then swoop up to the journal, shrinking and turning.
      const hold = 0.35;
      const m = u < hold ? 0 : (u - hold) / (1 - hold);
      const ease = m * m * (3 - 2 * m);
      f.node.position.set(
        f.from.x + (to.x - f.from.x) * ease,
        f.from.y + (to.y - f.from.y) * ease - Math.sin(ease * Math.PI) * 120,
      );
      const grow = u < hold ? 0.6 + 0.4 * Math.min(1, u / 0.12) : 1;
      f.node.scale.set(grow * (1 - ease * 0.86));
      f.node.rotation = Math.sin(u * 7) * 0.08 * (1 - ease) - 0.1 * (1 - ease);
      if (u >= 1) {
        this.flying.splice(this.flying.indexOf(f), 1);
        f.node.destroy({ children: true });
        this.hooks.onLanded();
      }
    }
    if (this.closing && this.slide <= 0 && this.flying.length === 0) {
      this.onClosed?.();
      this.onClosed = null;
    }
  }

  /** The pointer's last spot over the photo, in view pixels. */
  get hand(): Point | null {
    return this.pointer;
  }

  /** The hand's pose: a fist while dragging the photo or a sticker. */
  get dragging(): 'pan' | 'sticker' | null {
    if (!this.drag) return null;
    return this.drag.kind === 'pan' ? 'pan' : 'sticker';
  }
}

/** A 320x180 JPEG of the photo, for the save and the journal. */
/** The canvas as PNG bytes, encoded without blocking the frame. */
function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The PNG did not encode'))),
      'image/png',
    );
  }).then(async (blob) => new Uint8Array(await blob.arrayBuffer()));
}

function thumbOf(canvas: HTMLCanvasElement): string {
  try {
    const small = document.createElement('canvas');
    small.width = PHOTO_THUMB_WIDTH;
    small.height = (PHOTO_THUMB_WIDTH * H) / W;
    const ctx = small.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.8);
  } catch {
    return '';
  }
}
