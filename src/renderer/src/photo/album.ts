import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { PhotoRecord } from '../../../game';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { OUTLINE, stroke } from '../render/palette';
import { Bounce, PictureButton, markUi } from '../ui/button';
import { drawBoard } from '../ui/controls';
import { CREAM, token } from '../ui/icons';

const BOARD_W = 1500;
const BOARD_H = 820;
const COLS = 4;
const ROWS = 3;
/** Photos shown per page. */
export const ALBUM_PER_PAGE = COLS * ROWS;
const PIC_W = 300;
const PIC_H = (PIC_W * 9) / 16;

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

/**
 * The photo album (game design doc, section 13's photos page, standing in
 * until the journal exists): a board over a dimmed world with the player's
 * recent photos as polaroids, newest first, twelve to a page. A red x on a
 * polaroid means the file never made it to disk. Click outside to close.
 */
export class AlbumBoard extends Container {
  private readonly dim = new Graphics();
  private readonly board = new Container();
  private readonly pics = new Container();
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
    this.dim.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill({ color: 0x1d1430, alpha: 0.45 });
    this.dim.eventMode = 'static';
    this.dim.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.dim.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.hooks.close();
    });
    this.board.position.set(VIEW_WIDTH_PX / 2, VIEW_HEIGHT_PX / 2 - 20);
    this.board.eventMode = 'static';
    this.board.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.board.on('pointertap', (e: FederatedPointerEvent) => e.stopPropagation());
    const back = drawBoard(new Graphics(), BOARD_W, BOARD_H, 0x6f8f5a);
    // A camera doodle on the board's top edge, so it reads as the photo page.
    back
      .roundRect(-70, -BOARD_H / 2 - 26, 140, 60, 18)
      .fill(CREAM)
      .stroke(stroke(6));
    back
      .circle(10, -BOARD_H / 2 + 4, 20)
      .fill(0x4d9bff)
      .stroke(stroke(5));
    back.circle(10, -BOARD_H / 2 + 4, 8).fill(0xffffff);
    back
      .roundRect(-52, -BOARD_H / 2 - 8, 26, 16, 6)
      .fill(0xff4f5e)
      .stroke(stroke(4));
    this.board.addChild(back, this.pics);
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

  private arrow(dir: 1 | -1): PictureButton {
    const art = token(new Graphics(), 34);
    art
      .moveTo(-9 * dir, -16)
      .lineTo(12 * dir, 0)
      .lineTo(-9 * dir, 16)
      .closePath()
      .fill(0x3f9a34)
      .stroke(stroke(4));
    const b = new PictureButton(art, 84, 84, () => {
      this.page = (((this.page + dir) % this.pages) + this.pages) % this.pages;
      this.hooks.sound('ui_pop');
      this.fill();
    });
    b.position.set(dir * (BOARD_W / 2 - 60), 0);
    b.label = dir < 0 ? 'album_prev' : 'album_next';
    b.onHover = () => this.hooks.sound('hover');
    return b;
  }

  /** Lay out this page's polaroids, newest first. */
  private fill(): void {
    this.pics.removeChildren().forEach((c) => c.destroy({ children: true }));
    const newestFirst = [...this.photos].reverse();
    const page = newestFirst.slice(this.page * ALBUM_PER_PAGE, (this.page + 1) * ALBUM_PER_PAGE);
    this.prev.visible = this.next.visible = this.pages > 1;
    if (page.length === 0) {
      // An empty album: a faint polaroid outline where the first one will go.
      const ghost = new Graphics();
      ghost.roundRect(-PIC_W / 2 - 14, -PIC_H / 2 - 14, PIC_W + 28, PIC_H + 60, 8).stroke({
        width: 6,
        color: CREAM,
        alpha: 0.45,
      });
      this.pics.addChild(ghost);
      return;
    }
    const pitchX = 340;
    const pitchY = 250;
    page.forEach((photo, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const node = new Container();
      node.position.set((col - (COLS - 1) / 2) * pitchX, (row - (ROWS - 1) / 2) * pitchY + 10);
      node.rotation = ((i * 7919) % 11) * 0.012 - 0.06;
      const frame = new Graphics();
      frame.roundRect(-PIC_W / 2 - 14, -PIC_H / 2 - 14 + 8, PIC_W + 28, PIC_H + 60, 8).fill({
        color: OUTLINE,
        alpha: 0.3,
      });
      frame
        .roundRect(-PIC_W / 2 - 14, -PIC_H / 2 - 14, PIC_W + 28, PIC_H + 60, 8)
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
          .moveTo(PIC_W / 2 - 30, PIC_H / 2 + 8)
          .lineTo(PIC_W / 2 - 4, PIC_H / 2 + 34)
          .moveTo(PIC_W / 2 - 4, PIC_H / 2 + 8)
          .lineTo(PIC_W / 2 - 30, PIC_H / 2 + 34)
          .stroke({ width: 7, color: 0xff3b4a, cap: 'round' });
        node.addChild(cross);
      }
      node.label = `photo_${newestFirst.length - 1 - (this.page * ALBUM_PER_PAGE + i)}`;
      this.pics.addChild(node);
    });
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
