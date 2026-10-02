import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { PhotoRecord } from '../../../game';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { OUTLINE, STAR, darken, lighten, stroke } from '../render/palette';
import { Bounce, PictureButton, markUi } from '../ui/button';
import { CREAM, LEAF, LEAF_DARK, WOOD, WOOD_DARK, token } from '../ui/icons';
import { cameraIcon } from '../ui/photoButtons';

const BOARD_W = 1560;
const BOARD_H = 860;
const COLS = 3;
const ROWS = 2;
/** Photos shown per page. */
export const ALBUM_PER_PAGE = COLS * ROWS;
const PIC_W = 400;
const PIC_H = (PIC_W * 9) / 16;
const CORK = 0xc9955a;
const PIN_COLORS = [0xff4f5e, 0x4d9bff, 0x7bd84a, 0xffd23f, 0xff8fab, 0x9b6bff];

/** Picture textures by data URL, loaded once each. */
const textures = new Map<string, Promise<Texture | null>>();

function textureOf(dataUrl: string): Promise<Texture | null> {
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

/** A round push pin with a shine, in one of the bright colors. */
function pin(g: Graphics, x: number, y: number, color: number): void {
  g.circle(x + 2, y + 5, 13).fill({ color: OUTLINE, alpha: 0.3 });
  g.circle(x, y, 13).fill(color).stroke(stroke(4));
  g.circle(x - 4, y - 4, 4).fill({ color: 0xffffff, alpha: 0.7 });
}

/**
 * The photo album (game design doc, section 13's photos page, standing in
 * until the journal exists): a corkboard in a wooden frame over the dimmed
 * world, with the player's photos pinned up as polaroids, newest first, six
 * to a page. A red x on a polaroid means the file never made it to disk.
 * Click outside the board to close it.
 */
export class AlbumBoard extends Container {
  private readonly dim = new Graphics();
  private readonly board = new Container();
  private readonly pics = new Container();
  private readonly dots = new Container();
  readonly prev: PictureButton;
  readonly next: PictureButton;
  private readonly drop = new Bounce(260, 15);
  private closing = false;
  page = 0;
  onClosed: (() => void) | null = null;

  constructor(
    private readonly photos: readonly PhotoRecord[],
    private readonly hooks: { close(): void; sound(name: 'ui_pop' | 'hover' | 'ui_open' | 'ui_close'): void },
  ) {
    super();
    markUi(this);
    this.eventMode = 'static';
    this.dim.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill({ color: 0x1d1430, alpha: 0.5 });
    this.dim.eventMode = 'static';
    this.dim.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.dim.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hooks.close();
    });
    this.board.position.set(VIEW_WIDTH_PX / 2, VIEW_HEIGHT_PX / 2 + 10);
    this.board.eventMode = 'static';
    this.board.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.board.on('pointertap', (e: FederatedPointerEvent) => e.stopPropagation());
    this.board.addChild(this.drawBoard(), this.pics, this.dots);
    this.prev = this.arrow(-1);
    this.next = this.arrow(1);
    this.board.addChild(this.prev, this.next);
    this.addChild(this.dim, this.board);
    this.drop.value = 0;
    this.drop.target = 1;
    this.fill();
    this.hooks.sound('ui_open');
  }

  get pages(): number {
    return Math.max(1, Math.ceil(this.photos.length / ALBUM_PER_PAGE));
  }

  /** The cork in its wooden frame, with a camera badge and a sprig of leaves on top. */
  private drawBoard(): Graphics {
    const g = new Graphics();
    const w = BOARD_W;
    const h = BOARD_H;
    g.roundRect(-w / 2 + 8, -h / 2 + 16, w, h, 30).fill({ color: OUTLINE, alpha: 0.3 });
    g.roundRect(-w / 2, -h / 2, w, h, 30)
      .fill(WOOD)
      .stroke(stroke(7));
    // Wood grain on the frame.
    for (const y of [-h / 2 + 14, -h / 2 + 26, h / 2 - 14, h / 2 - 26])
      g.moveTo(-w / 2 + 40, y)
        .lineTo(w / 2 - 40, y)
        .stroke({ width: 3, color: WOOD_DARK, alpha: 0.35 });
    const cw = w - 76;
    const ch = h - 76;
    g.roundRect(-cw / 2, -ch / 2, cw, ch, 16)
      .fill(CORK)
      .stroke(stroke(6));
    // Cork speckle, seeded so it never shimmers.
    let seed = 11;
    const rnd = (): number => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 420; i++) {
      const x = -cw / 2 + 14 + rnd() * (cw - 28);
      const y = -ch / 2 + 14 + rnd() * (ch - 28);
      const dark = rnd() < 0.55;
      g.ellipse(x, y, 3 + rnd() * 6, 2 + rnd() * 3).fill({
        color: dark ? darken(CORK, 0.3) : lighten(CORK, 0.3),
        alpha: 0.35 + rnd() * 0.3,
      });
    }
    // Corner screws.
    for (const [x, y] of [
      [-w / 2 + 26, -h / 2 + 26],
      [w / 2 - 26, -h / 2 + 26],
      [-w / 2 + 26, h / 2 - 26],
      [w / 2 - 26, h / 2 - 26],
    ] as const) {
      g.circle(x, y, 9).fill(0x8a8a90).stroke(stroke(3));
      g.moveTo(x - 5, y)
        .lineTo(x + 5, y)
        .stroke({ width: 2.5, color: OUTLINE });
    }
    // A camera badge on the top edge, and leaves tucked behind it.
    for (const [dx, rot, c] of [
      [-70, -0.9, LEAF],
      [70, 0.9, LEAF_DARK],
      [-40, -1.6, LEAF_DARK],
      [40, 1.6, LEAF],
    ] as const) {
      const x = dx;
      const y = -h / 2 - 6;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const p = (lx: number, ly: number): [number, number] => [x + lx * cs - ly * sn, y + lx * sn + ly * cs];
      g.moveTo(...p(0, 0))
        .quadraticCurveTo(...p(50, -40), ...p(90, 0))
        .quadraticCurveTo(...p(50, 40), ...p(0, 0))
        .fill(c)
        .stroke(stroke(4));
    }
    g.translateTransform(0, -h / 2);
    token(g, 54);
    cameraIcon(g, 90);
    g.resetTransform();
    return g;
  }

  private arrow(dir: 1 | -1): PictureButton {
    const art = token(new Graphics(), 36);
    art
      .moveTo(-10 * dir, -17)
      .lineTo(13 * dir, 0)
      .lineTo(-10 * dir, 17)
      .closePath()
      .fill(LEAF_DARK)
      .stroke(stroke(4));
    const b = new PictureButton(art, 88, 88, () => {
      this.page = (((this.page + dir) % this.pages) + this.pages) % this.pages;
      this.hooks.sound('ui_pop');
      this.fill();
    });
    b.position.set(dir * (BOARD_W / 2 - 30), 0);
    b.label = dir < 0 ? 'album_prev' : 'album_next';
    b.onHover = () => this.hooks.sound('hover');
    return b;
  }

  /** Pin up this page's polaroids, newest first. */
  private fill(): void {
    this.pics.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.dots.removeChildren().forEach((c) => c.destroy({ children: true }));
    const newestFirst = [...this.photos].reverse();
    const page = newestFirst.slice(this.page * ALBUM_PER_PAGE, (this.page + 1) * ALBUM_PER_PAGE);
    this.prev.visible = this.next.visible = this.pages > 1;
    if (page.length === 0) {
      this.pics.addChild(this.emptyNote());
      return;
    }
    const pitchX = 470;
    const pitchY = 380;
    // A short page sits in the middle of the board rather than along its top.
    const rows = Math.min(ROWS, Math.ceil(page.length / COLS));
    page.forEach((photo, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cols = Math.min(COLS, page.length - row * COLS);
      const node = new Container();
      node.position.set((col - (cols - 1) / 2) * pitchX, (row - (rows - 1) / 2) * pitchY + 24);
      const k = (i * 7919) % 11;
      node.rotation = k * 0.012 - 0.06;
      const frame = new Graphics();
      frame
        .roundRect(-PIC_W / 2 - 16, -PIC_H / 2 - 16 + 10, PIC_W + 32, PIC_H + 76, 8)
        .fill({ color: OUTLINE, alpha: 0.32 });
      frame
        .roundRect(-PIC_W / 2 - 16, -PIC_H / 2 - 16, PIC_W + 32, PIC_H + 76, 8)
        .fill(0xffffff)
        .stroke(stroke(5));
      frame.rect(-PIC_W / 2, -PIC_H / 2, PIC_W, PIC_H).fill(0x8d8da0);
      node.addChild(frame);
      void textureOf(photo.thumb).then((tex) => {
        if (!tex || node.destroyed) return;
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.width = PIC_W;
        sprite.height = PIC_H;
        node.addChildAt(sprite, 1);
      });
      if (photo.file === null) {
        const cross = new Graphics();
        cross
          .moveTo(PIC_W / 2 - 36, PIC_H / 2 + 12)
          .lineTo(PIC_W / 2 - 6, PIC_H / 2 + 42)
          .moveTo(PIC_W / 2 - 6, PIC_H / 2 + 12)
          .lineTo(PIC_W / 2 - 36, PIC_H / 2 + 42)
          .stroke({ width: 8, color: 0xff3b4a, cap: 'round' });
        node.addChild(cross);
      }
      const pinG = new Graphics();
      pin(pinG, 0, -PIC_H / 2 - 4, PIN_COLORS[(this.page * ALBUM_PER_PAGE + i) % PIN_COLORS.length]!);
      node.addChild(pinG);
      node.label = `photo_${newestFirst.length - 1 - (this.page * ALBUM_PER_PAGE + i)}`;
      this.pics.addChild(node);
    });
    // Page dots along the bottom edge.
    if (this.pages > 1) {
      const d = new Graphics();
      for (let p = 0; p < this.pages; p++) {
        const x = (p - (this.pages - 1) / 2) * 30;
        d.circle(x, BOARD_H / 2 - 20, 7)
          .fill(p === this.page ? STAR : CREAM)
          .stroke(stroke(3));
      }
      this.dots.addChild(d);
    }
  }

  /** An empty board: a pinned note with a camera doodle and a dotted polaroid waiting for the first photo. */
  private emptyNote(): Container {
    const node = new Container();
    const g = new Graphics();
    // A dotted polaroid outline where the first photo will go.
    g.roundRect(-PIC_W / 2 - 16, -PIC_H / 2 - 16, PIC_W + 32, PIC_H + 76, 8).stroke({
      width: 5,
      color: CREAM,
      alpha: 0.6,
    });
    for (let x = -PIC_W / 2 + 10; x < PIC_W / 2; x += 28)
      g.moveTo(x, -PIC_H / 2)
        .lineTo(x + 14, -PIC_H / 2)
        .stroke({ width: 3, color: CREAM, alpha: 0.5 });
    for (let x = -PIC_W / 2 + 10; x < PIC_W / 2; x += 28)
      g.moveTo(x, PIC_H / 2)
        .lineTo(x + 14, PIC_H / 2)
        .stroke({ width: 3, color: CREAM, alpha: 0.5 });
    // A sticky note beside it, pinned, with a camera and a sparkle.
    const nx = PIC_W / 2 + 150;
    g.roundRect(nx - 110 + 6, -120 + 8, 220, 220, 6).fill({ color: OUTLINE, alpha: 0.3 });
    g.roundRect(nx - 110, -120, 220, 220, 6)
      .fill(0xfff2a8)
      .stroke(stroke(5));
    g.translateTransform(nx, -10);
    cameraIcon(g, 120);
    g.resetTransform();
    g.star(nx + 70, -80, 4, 22, 9)
      .fill(0xffffff)
      .stroke(stroke(3.5));
    pin(g, nx, -110, PIN_COLORS[0]!);
    pin(g, 0, -PIC_H / 2 - 4, PIN_COLORS[1]!);
    node.addChild(g);
    node.rotation = -0.03;
    return node;
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.drop.target = 0;
    this.eventMode = 'none';
    this.hooks.sound('ui_close');
  }

  update(dt: number): void {
    const k = this.drop.update(dt);
    this.board.scale.set(Math.max(0, k));
    this.dim.alpha = Math.max(0, Math.min(1, k));
    this.prev.update(dt);
    this.next.update(dt);
    if (this.closing && k <= 0.02) {
      this.onClosed?.();
      this.onClosed = null;
    }
  }
}
