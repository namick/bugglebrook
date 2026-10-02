import { Container, Graphics, Rectangle } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { constellation, telescopeSky } from '../render/constellations';
import type { SkyEntry } from '../render/constellations';
import { OUTLINE, mix } from '../render/palette';
import { markUi } from './button';

/** The eyepiece: its middle and radius on screen (px). */
const CX = VIEW_WIDTH_PX / 2;
const CY = VIEW_HEIGHT_PX / 2;
const R = 470;

/**
 * Looking through Gnome Hollow's telescope (M10, `secret_constellations`):
 * a round eyepiece of night sky with a constellation for every bug in the
 * cast, gold and twinkling for the ones found, dark outlines for the rest,
 * and a chubby eight-legged one that stays dark until Wubbo is found. A
 * click anywhere puts the telescope down.
 */
export class TelescopeView extends Container {
  private readonly g = new Graphics();
  private readonly sky = new Graphics();
  private time = 0;
  private entries: SkyEntry[] = [];
  /** 0 opening to 1 open; closing counts back down. */
  private openness = 0;
  private closing = false;
  onClose: (() => void) | null = null;

  constructor() {
    super();
    markUi(this);
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX);
    this.addChild(this.sky, this.g);
    this.on('pointerdown', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.visible = false;
  }

  get isOpen(): boolean {
    return this.visible && !this.closing;
  }

  open(cast: readonly { id: string; art: string; found: boolean }[], wubboFound: boolean): void {
    this.entries = telescopeSky(cast, wubboFound);
    this.visible = true;
    this.closing = false;
    this.openness = 0;
    this.drawSky();
  }

  close(): void {
    if (!this.visible || this.closing) return;
    this.closing = true;
    this.onClose?.();
  }

  /** How many constellations are lit and dark (test hook). */
  report(): { open: boolean; lit: string[]; dark: string[] } {
    return {
      open: this.isOpen,
      lit: this.entries.filter((e) => e.lit).map((e) => e.id),
      dark: this.entries.filter((e) => !e.lit).map((e) => e.id),
    };
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.time += dt;
    this.openness = Math.max(0, Math.min(1, this.openness + (this.closing ? -dt * 5 : dt * 3.5)));
    if (this.closing && this.openness <= 0) {
      this.visible = false;
      return;
    }
    const k = this.openness;
    const ease = 1 - (1 - k) * (1 - k);
    this.sky.scale.set(0.6 + 0.4 * ease);
    this.sky.position.set(CX * (1 - this.sky.scale.x), CY * (1 - this.sky.scale.y));
    this.alpha = Math.min(1, k * 1.5);
    this.drawFrame(ease);
    this.drawTwinkle();
  }

  /** The dark all round, and the brass ring of the eyepiece. */
  private drawFrame(k: number): void {
    const g = this.g.clear();
    const r = R * (0.6 + 0.4 * k);
    g.rect(-20, -20, VIEW_WIDTH_PX + 40, VIEW_HEIGHT_PX + 40).fill({ color: 0x07091a, alpha: 0.96 });
    g.circle(CX, CY, r).cut();
    g.circle(CX, CY, r + 14).stroke({ width: 28, color: 0xd9a441 });
    g.circle(CX, CY, r + 28).stroke({ width: 6, color: OUTLINE });
    g.circle(CX, CY, r).stroke({ width: 6, color: OUTLINE });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.circle(CX + Math.cos(a) * (r + 14), CY + Math.sin(a) * (r + 14), 3).fill(0x9b6a1e);
    }
  }

  /** The sky itself, drawn once per opening. */
  private drawSky(): void {
    const g = this.sky.clear();
    // Deep blue, lighter toward the middle.
    for (let k = 0; k < 8; k++) g.circle(CX, CY, R * (1 - k / 9)).fill(mix(0x0b1030, 0x2a3470, k / 7));
    // Faint background stars, the same every time.
    for (let i = 0; i < 140; i++) {
      const a = i * 2.399;
      const d = Math.sqrt((i + 0.5) / 140) * R * 0.97;
      g.circle(CX + Math.cos(a) * d, CY + Math.sin(a) * d, 1 + (i % 3) * 0.6).fill({
        color: 0xffffff,
        alpha: 0.25 + (i % 5) * 0.08,
      });
    }
    // The milky way.
    g.ellipse(CX, CY, R * 0.95, R * 0.22).fill({ color: 0x8fa3ff, alpha: 0.07 });
    const box = R * 1.62;
    for (const e of this.entries) {
      const shape = constellation(e.art);
      const ox = CX - box / 2 + e.x * box;
      const oy = CY - box / 2 + e.y * box;
      const s = e.scale * box * 0.5;
      const pt = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
      for (const [a, b] of shape.lines) {
        const [ax, ay] = pt(shape.stars[a]![0], shape.stars[a]![1]);
        const [bx, by] = pt(shape.stars[b]![0], shape.stars[b]![1]);
        g.moveTo(ax, ay)
          .lineTo(bx, by)
          .stroke({
            width: e.lit ? 3 : 2.5,
            color: e.lit ? 0xf2c14e : 0x5560a0,
            alpha: e.lit ? 0.75 : 0.9,
          });
      }
      for (const [x, y, size] of shape.stars) {
        const [sx, sy] = pt(x, y);
        if (e.lit) {
          g.circle(sx, sy, 4 + size * 5).fill({ color: 0xf2c14e, alpha: 0.35 });
          g.circle(sx, sy, 2 + size * 3).fill(0xfff3c4);
        } else
          g.circle(sx, sy, 2 + size * 3)
            .fill(0x1b2350)
            .stroke({ width: 2, color: 0x6a74b8 });
      }
    }
  }

  private readonly twinkle = new Graphics();

  /** A few of the lit stars twinkle. */
  private drawTwinkle(): void {
    if (!this.twinkle.parent) this.sky.addChild(this.twinkle);
    const g = this.twinkle.clear();
    const box = R * 1.62;
    this.entries.forEach((e, i) => {
      if (!e.lit) return;
      const shape = constellation(e.art);
      const star = shape.stars[i % shape.stars.length]!;
      const tw = Math.max(0, Math.sin(this.time * 2.5 + i * 1.3));
      const s = e.scale * box * 0.5;
      const sx = CX - box / 2 + e.x * box + star[0] * s;
      const sy = CY - box / 2 + e.y * box + star[1] * s;
      g.moveTo(sx - 14 * tw, sy)
        .lineTo(sx + 14 * tw, sy)
        .stroke({ width: 2, color: 0xffffff, alpha: tw });
      g.moveTo(sx, sy - 14 * tw)
        .lineTo(sx, sy + 14 * tw)
        .stroke({ width: 2, color: 0xffffff, alpha: tw });
    });
  }
}
