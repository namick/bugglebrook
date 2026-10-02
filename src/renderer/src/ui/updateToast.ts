import { Container, Graphics } from 'pixi.js';
import { VIEW_HEIGHT_PX } from '../../../game/constants';
import { OUTLINE, stroke } from '../render/palette';
import { PictureButton, markUi } from './button';
import { CREAM, LEAF, SUNNY, token } from './icons';

/** Where the toast rests: the middle of the left edge, clear of every corner button. */
export const TOAST_AT = { x: 150, y: VIEW_HEIGHT_PX / 2 } as const;
/** Where it starts, just off the left edge. */
const TOAST_FROM = -170;
/** Seconds to slide in. */
const SLIDE_TIME = 0.6;

/** The toast's x for slide progress 0..1, with a small overshoot at the end. */
export function toastX(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  // easeOutBack: arrives, overshoots a little, settles.
  const c = 1.4;
  const e = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  return TOAST_FROM + (TOAST_AT.x - TOAST_FROM) * e;
}

/** A gift box with a bow: something new arrived. */
export function giftIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  g.roundRect(-30 * k, -10 * k, 60 * k, 42 * k, 6 * k)
    .fill(0xff6b8a)
    .stroke(stroke(5 * k));
  g.roundRect(-36 * k, -24 * k, 72 * k, 18 * k, 5 * k)
    .fill(0xff8fab)
    .stroke(stroke(5 * k));
  g.rect(-7 * k, -24 * k, 14 * k, 56 * k).fill(SUNNY);
  g.moveTo(-7 * k, -24 * k)
    .lineTo(-7 * k, 32 * k)
    .moveTo(7 * k, -24 * k)
    .lineTo(7 * k, 32 * k)
    .stroke(stroke(3 * k));
  for (const side of [-1, 1])
    g.ellipse(side * 14 * k, -32 * k, 14 * k, 9 * k)
      .fill(SUNNY)
      .stroke(stroke(4 * k));
  g.circle(0, -30 * k, 6 * k)
    .fill(SUNNY)
    .stroke(stroke(4 * k));
  return g;
}

/** Restart: a round arrow chasing its tail. */
export function restartIcon(g: Graphics, s: number): Graphics {
  const k = s / 100;
  const r = 24 * k;
  const a0 = -Math.PI * 0.35;
  const a1 = a0 + Math.PI * 1.55;
  g.arc(0, 0, r, a0, a1).stroke({ width: 16 * k, color: OUTLINE, cap: 'round' });
  g.arc(0, 0, r, a0, a1).stroke({ width: 9 * k, color: CREAM, cap: 'round' });
  // The arrowhead at the arc's start, pointing along it.
  const hx = Math.cos(a0) * r;
  const hy = Math.sin(a0) * r;
  g.moveTo(hx - 4 * k, hy - 16 * k)
    .lineTo(hx + 16 * k, hy + 2 * k)
    .lineTo(hx - 10 * k, hy + 12 * k)
    .closePath()
    .fill(CREAM)
    .stroke(stroke(4 * k));
  return g;
}

/**
 * The wordless "update ready" toast: a gift and a green restart button on a
 * little board that slides in from the left. Pressing the button saves and
 * restarts into the new version. Ignoring it is fine: the update installs
 * the next time the game quits.
 */
export class UpdateToast extends Container {
  readonly button: PictureButton;
  private readonly gift = new Graphics();
  private time = 0;

  constructor(
    readonly version: string,
    onRestart: () => void,
  ) {
    super();
    markUi(this);
    this.eventMode = 'static';
    // Clicks on the board must not reach the world under it.
    this.on('pointerdown', (e) => e.stopPropagation());
    const board = new Graphics();
    board.roundRect(-118, -62 + 6, 236, 124, 34).fill({ color: OUTLINE, alpha: 0.18 });
    board.roundRect(-118, -62, 236, 124, 34).fill(CREAM).stroke(stroke(6));
    this.addChild(board);
    giftIcon(this.gift, 84);
    this.gift.position.set(-52, 4);
    this.addChild(this.gift);
    const art = new Container();
    art.addChild(restartIcon(token(new Graphics(), 42, LEAF), 84));
    this.button = new PictureButton(art, 96, 96, onRestart);
    this.button.position.set(56, 0);
    this.addChild(this.button);
    this.position.set(toastX(0), TOAST_AT.y);
  }

  /** Slid all the way in? */
  get settled(): boolean {
    return this.time >= SLIDE_TIME;
  }

  update(dt: number): void {
    this.time += dt;
    this.x = toastX(this.time / SLIDE_TIME);
    // The gift bobs now and then so the toast is noticed without nagging.
    const beat = this.time % 3;
    this.gift.rotation = beat < 0.5 ? Math.sin(beat * Math.PI * 6) * 0.12 * (1 - beat / 0.5) : 0;
    this.button.update(dt);
  }
}
