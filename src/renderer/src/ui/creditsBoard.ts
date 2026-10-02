import { Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { OUTLINE } from '../render/palette';
import { Bounce, PictureButton, markUi } from './button';
import { drawBoard } from './controls';
import type { CreditLine, CreditRole } from './credits';
import { brushIcon, heartIcon, noteIcon, playIcon, screenIcon, token } from './icons';

const BOARD_W = 900;
const ROW_H = 120;

const ICONS: Record<CreditRole, (g: Graphics, s: number) => Graphics> = {
  art: brushIcon,
  music: noteIcon,
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

  constructor(
    readonly lines: readonly CreditLine[],
    private readonly onClose: () => void,
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
      this.board.addChild(plate, name);
    });
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
    if (this.closing && k < 0.05) {
      this.visible = false;
      this.onClosed?.();
      this.onClosed = null;
    }
  }
}
