import { Container, Graphics } from 'pixi.js';
import { darken, lighten, stroke } from '../render/palette';
import { markUi } from './button';

const BIN = 0x5aa05a;
/** The lid takes this long to close on a slot (game design doc, section 17). */
export const BIN_CLOSE_SECONDS = 1.5;
/** Lid angle when wide open, radians. */
const OPEN = -1.25;

/**
 * Pure: the bin's closing progress after `dt` seconds. It closes while a
 * slot sign is over it and springs back open (fast) when the sign leaves.
 */
export function binProgress(progress: number, signOver: boolean, dt: number): number {
  return signOver ? Math.min(1, progress + dt / BIN_CLOSE_SECONDS) : Math.max(0, progress - dt * 3);
}

/**
 * The compost bin on the menu: drop a slot's sign in it and the lid closes
 * slowly over 1.5 s. Pull the sign back out before it shuts to keep the
 * slot. It pongs a little (stink lines, a banana peel over the rim).
 */
export class CompostBin extends Container {
  private readonly body = new Graphics();
  private readonly lid = new Container();
  private readonly lidArt = new Graphics();
  private readonly stink = new Graphics();
  private time = 0;
  private lidAngle = 0;
  /** 0 open (or idle) to 1 shut on a slot. */
  progress = 0;
  /** A sign is being dragged somewhere: the lid opens wide to invite it. */
  inviting = false;
  /** How far the lid is from closed, for tests: 0 closed. */
  get lidOpen(): number {
    return this.lidAngle / OPEN;
  }

  constructor() {
    super();
    markUi(this);
    this.addChild(this.stink, this.body, this.lid);
    this.lid.addChild(this.lidArt);
    this.draw();
  }

  /** Radius around the bin's mouth that counts as "in the bin", in local pixels. */
  static readonly CATCH = 150;

  private draw(): void {
    const g = this.body;
    // A banana peel flopping over the back rim.
    g.moveTo(-20, -96)
      .quadraticCurveTo(-40, -150, -70, -128)
      .quadraticCurveTo(-50, -118, -36, -92)
      .fill(0xffe066)
      .stroke(stroke(4));
    g.moveTo(10, -96)
      .quadraticCurveTo(30, -146, 58, -134)
      .quadraticCurveTo(40, -120, 30, -94)
      .fill(0xffe066)
      .stroke(stroke(4));
    g.roundRect(-96, -100, 192, 20, 8).fill(darken(BIN, 0.2)).stroke(stroke(5));
    g.moveTo(-90, -84)
      .lineTo(90, -84)
      .lineTo(74, 110)
      .lineTo(-74, 110)
      .closePath()
      .fill(BIN)
      .stroke(stroke(6));
    for (const x of [-44, 0, 44])
      g.moveTo(x, -64)
        .lineTo(x * 0.85, 90)
        .stroke({ width: 6, color: darken(BIN, 0.18), cap: 'round' });
    // A recycling-ish leaf loop on the front.
    g.circle(0, 16, 30).fill(lighten(BIN, 0.3)).stroke(stroke(4));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      g.ellipse(Math.cos(a) * 13, 16 + Math.sin(a) * 13, 10, 6).fill(0x3f9a34);
    }
    const lid = this.lidArt;
    lid.roundRect(0, -16, 204, 28, 12).fill(lighten(BIN, 0.1)).stroke(stroke(6));
    lid.roundRect(84, -34, 40, 22, 9).fill(darken(BIN, 0.25)).stroke(stroke(4));
    this.lid.position.set(-102, -102);
    this.lid.pivot.set(0, 0);
  }

  update(dt: number): void {
    this.time += dt;
    const idle = -0.12 - Math.max(0, Math.sin(this.time * 2.3)) * 0.1;
    const target = this.progress > 0 ? OPEN * (1 - this.progress) : this.inviting ? OPEN : idle;
    this.lidAngle += (target - this.lidAngle) * Math.min(1, dt * (this.progress > 0 ? 30 : 8));
    this.lid.rotation = this.lidAngle;
    // Wobbly stink lines.
    const s = this.stink.clear();
    for (let i = 0; i < 3; i++) {
      const x = -40 + i * 40;
      const t = (this.time * 0.6 + i * 0.33) % 1;
      const y0 = -120 - t * 70;
      s.moveTo(x, y0);
      for (let k = 1; k <= 6; k++) s.lineTo(x + Math.sin(this.time * 4 + k + i) * 8, y0 - k * 8);
      s.stroke({ width: 5, color: 0x9ccf5a, alpha: 1 - t, cap: 'round' });
    }
    this.stink.visible = this.progress < 0.9;
    this.body.scale.set(1 + this.progress * 0.04 * Math.sin(this.time * 40), 1);
  }

  /** Is a point (in this bin's parent's coordinates) over the bin's mouth? */
  catches(x: number, y: number): boolean {
    return Math.hypot(x - this.x, y - (this.y - 60)) < CompostBin.CATCH;
  }
}
