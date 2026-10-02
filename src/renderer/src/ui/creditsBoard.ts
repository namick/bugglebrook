import { Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { OUTLINE } from '../render/palette';
import { Bounce, PictureButton, markUi } from './button';
import { drawBoard } from './controls';
import type { CreditLine, CreditRole } from './credits';
import {
  brushIcon,
  heartIcon,
  mouthIcon,
  noteIcon,
  playIcon,
  screenIcon,
  shellSpeakerIcon,
  token,
} from './icons';

const BOARD_W = 900;
const ROW_H = 120;

const ICONS: Record<CreditRole, (g: Graphics, s: number) => Graphics> = {
  art: brushIcon,
  music: noteIcon,
  sound: shellSpeakerIcon,
  voices: mouthIcon,
  code: screenIcon,
};

/**
 * The credits board: who made the game. Like the settings board, a plank
 * board drops in over a dim. Each line is a picture (a paintbrush for the
 * art, a note for the music, a little screen for the code) and a name; the
 * names come from `art/CREDITS.json`. A click anywhere, or the play button,
 * puts it away.
 */
export class CreditsBoard extends Container {
  readonly close: PictureButton;
  private readonly dim = new Graphics();
  private readonly board = new Container();
  private readonly drop = new Bounce(260, 15);
  private readonly heart = new Graphics();
  private time = 0;
  private closing = false;
  onClosed: (() => void) | null = null;
  /** 0: the makers; 1: the recorded sounds' attributions (only when there are some). */
  page = 0;
  /** The attributions page's toggle, or null with no recorded sounds. */
  readonly more: PictureButton | null = null;
  private readonly names = new Container();
  private readonly list = new Container();
  private scroll = 0;
  private listH = 0;

  constructor(
    readonly lines: readonly CreditLine[],
    private readonly onClose: () => void,
    /** Attribution lines for recorded sounds (docs/08-sound-brief.md, part 5.2). */
    readonly sounds: readonly string[] = [],
  ) {
    super();
    markUi(this);
    this.label = 'credits';
    this.eventMode = 'static';
    this.dim.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill({ color: 0x1d1430, alpha: 0.45 });
    this.dim.eventMode = 'static';
    this.dim.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.dim.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.onClose();
    });
    this.addChild(this.dim, this.board);
    this.board.eventMode = 'static';
    this.board.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
    this.board.on('pointertap', (e: FederatedPointerEvent) => e.stopPropagation());
    const h = 220 + Math.max(1, lines.length) * ROW_H;
    this.board.addChild(drawBoard(new Graphics(), BOARD_W, h, 0xe0b07a));
    heartIcon(token(this.heart, 50), 70);
    this.heart.position.set(0, -h / 2 + 70);
    this.board.addChild(this.heart);
    lines.forEach((line, i) => {
      const y = -h / 2 + 175 + i * ROW_H;
      const plate = token(new Graphics(), 44);
      ICONS[line.role](plate, 66);
      plate.position.set(-BOARD_W / 2 + 120, y);
      plate.label = `credit_${line.role}`;
      const name = new Text({
        text: line.name,
        style: {
          fontFamily: 'Trebuchet MS, Verdana, sans-serif',
          fontSize: 50,
          fontWeight: 'bold',
          fill: 0xfffbef,
          stroke: { color: OUTLINE, width: 9, join: 'round' },
        },
      });
      name.anchor.set(0, 0.5);
      name.position.set(-BOARD_W / 2 + 200, y);
      // Long names shrink to fit the board.
      name.scale.set(Math.min(1, (BOARD_W - 260) / Math.max(1, name.width)));
      name.label = `credit_name_${line.role}`;
      this.names.addChild(plate, name);
    });
    this.board.addChild(this.names);
    if (sounds.length > 0) {
      // The second page: every credited sound, scrolled with the wheel.
      const text = new Text({
        text: sounds.join('\n'),
        style: {
          fontFamily: 'Trebuchet MS, Verdana, sans-serif',
          fontSize: 24,
          fill: 0xfffbef,
          stroke: { color: OUTLINE, width: 5, join: 'round' },
          wordWrap: true,
          wordWrapWidth: BOARD_W - 140,
          lineHeight: 34,
        },
      });
      text.label = 'credit_sounds';
      this.list.addChild(text);
      const top = -h / 2 + 140;
      this.listH = h - 300;
      const mask = new Graphics().rect(-BOARD_W / 2 + 60, top, BOARD_W - 120, this.listH).fill(0xffffff);
      this.list.position.set(-BOARD_W / 2 + 70, top);
      this.list.mask = mask;
      this.list.visible = false;
      this.board.addChild(mask, this.list);
      this.board.on('wheel', (e: FederatedWheelEvent) => {
        if (this.page !== 1) return;
        this.scroll = Math.max(
          0,
          Math.min(Math.max(0, text.height - this.listH), this.scroll + e.deltaY * 0.5),
        );
        this.list.y = top - this.scroll;
      });
      const art = token(new Graphics(), 52, 0xe6f4d9);
      shellSpeakerIcon(art, 80);
      this.more = new PictureButton(art, 120, 120, () => this.turn());
      this.more.position.set(-BOARD_W / 2 + 80, h / 2 - 80);
      this.more.label = 'credits_sounds';
      this.board.addChild(this.more);
    }
    const art = token(new Graphics(), 52, 0xfff1c7);
    playIcon(art, 84);
    this.close = new PictureButton(art, 120, 120, () => this.onClose());
    this.close.position.set(BOARD_W / 2 - 80, h / 2 - 80);
    this.close.label = 'credits_close';
    this.board.addChild(this.close);
    this.boardH = h;
    this.drop.value = 0;
    this.drop.target = 1;
  }

  private readonly boardH: number;

  /** Flip between the makers and the sounds' attributions. */
  turn(): void {
    if (this.sounds.length === 0) return;
    this.page = 1 - this.page;
    this.names.visible = this.page === 0;
    this.list.visible = this.page === 1;
  }

  /** Slide away, then call `onClosed`. */
  slideAway(): void {
    if (this.closing) return;
    this.closing = true;
    this.drop.target = 0;
  }

  get isClosing(): boolean {
    return this.closing;
  }

  update(dt: number): void {
    this.time += dt;
    const k = this.drop.update(dt);
    this.dim.alpha = Math.max(0, Math.min(1, k));
    this.board.position.set(
      VIEW_WIDTH_PX / 2,
      VIEW_HEIGHT_PX / 2 - (1 - k) * (VIEW_HEIGHT_PX / 2 + this.boardH),
    );
    this.board.rotation = (1 - k) * -0.1 + Math.sin(this.time * 1.1) * 0.004;
    // The heart beats.
    this.heart.scale.set(1 + 0.06 * Math.max(0, Math.sin(this.time * 6)));
    this.close.update(dt);
    this.more?.update(dt);
    if (this.closing && k < 0.05) {
      this.visible = false;
      this.onClosed?.();
      this.onClosed = null;
    }
  }
}
