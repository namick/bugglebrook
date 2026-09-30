import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { OUTLINE, darken, lighten, stroke } from '../render/palette';
import { Bounce, markUi } from './button';
import { CREAM, LEAF, LEAF_DARK, SUNNY } from './icons';

/** Slider value (0 to 100) for a point `x` along a track `width` wide. Pure. */
export function sliderValueAt(x: number, width: number): number {
  return Math.round(Math.max(0, Math.min(1, x / width)) * 100);
}

/**
 * A volume slider drawn as a vine: the grown part is leafy, and a sunflower
 * knob rides along it. Drag it or click anywhere on it.
 */
export class VineSlider extends Container {
  private readonly vine = new Graphics();
  private readonly knob = new Container();
  private readonly knobArt = new Graphics();
  private readonly bounce = new Bounce(500, 14);
  private dragging = false;
  private time = Math.random() * 10;
  value: number;
  /** `done` is true when the drag ends (store the setting then). */
  onChange: ((value: number, done: boolean) => void) | null = null;

  constructor(
    readonly trackWidth: number,
    value: number,
  ) {
    super();
    markUi(this);
    this.value = value;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hit = new Graphics().rect(-30, -40, trackWidth + 60, 80).fill({ color: 0, alpha: 0 });
    this.addChild(hit, this.vine, this.knob);
    this.knob.addChild(this.knobArt);
    this.drawKnob();
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.dragging = true;
      this.bounce.kick(0.8);
      this.bounce.target = 1.18;
      this.setFrom(e);
    });
    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (this.dragging) this.setFrom(e);
    });
    const end = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.bounce.target = 1;
      this.bounce.kick(1.25);
      this.onChange?.(this.value, true);
    };
    this.on('pointerup', end);
    this.on('pointerupoutside', end);
    this.redraw();
  }

  private setFrom(e: FederatedPointerEvent): void {
    const v = sliderValueAt(this.toLocal(e.global).x, this.trackWidth);
    if (v === this.value) return;
    this.value = v;
    this.redraw();
    this.onChange?.(v, false);
  }

  /** Where value `v` sits along the track, in this slider's local x. */
  xFor(v: number): number {
    return (Math.max(0, Math.min(100, v)) / 100) * this.trackWidth;
  }

  set(value: number): void {
    this.value = value;
    this.redraw();
  }

  private drawKnob(): void {
    const g = this.knobArt;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.ellipse(Math.cos(a) * 17, Math.sin(a) * 17, 11, 7)
        .fill(SUNNY)
        .stroke(stroke(3.5));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.ellipse(Math.cos(a) * 17, Math.sin(a) * 17, 8, 4.5).fill(SUNNY);
    }
    g.circle(0, 0, 14).fill(0x8d5a3b).stroke(stroke(4));
    g.circle(-4, -4, 4).fill(lighten(0x8d5a3b, 0.35));
  }

  private redraw(): void {
    const g = this.vine.clear();
    const w = this.trackWidth;
    const at = this.xFor(this.value);
    const wave = (x: number): number => Math.sin(x / 34) * 6;
    // The whole track: a thin pale stem.
    g.moveTo(0, wave(0));
    for (let x = 8; x <= w; x += 8) g.lineTo(x, wave(x));
    g.stroke({ width: 16, color: OUTLINE, cap: 'round', join: 'round' });
    g.moveTo(0, wave(0));
    for (let x = 8; x <= w; x += 8) g.lineTo(x, wave(x));
    g.stroke({ width: 8, color: 0xd9ecc2, cap: 'round', join: 'round' });
    // The grown part: a fat green vine with leaves.
    if (at > 1) {
      g.moveTo(0, wave(0));
      for (let x = 6; x <= at; x += 6) g.lineTo(x, wave(x));
      g.lineTo(at, wave(at));
      g.stroke({ width: 12, color: LEAF_DARK, cap: 'round', join: 'round' });
      for (let x = 30, i = 0; x < at - 16; x += 44, i++) {
        const up = i % 2 === 0 ? -1 : 1;
        const cx = x;
        const cy = wave(x) + up * 14;
        g.ellipse(cx, cy, 13, 7).fill(LEAF).stroke(stroke(3));
        g.moveTo(cx - 10, cy)
          .lineTo(cx + 8, cy)
          .stroke({ width: 1.5, color: LEAF_DARK });
      }
    }
    this.knob.position.set(at, wave(at));
  }

  update(dt: number): void {
    this.time += dt;
    this.knob.scale.set(this.bounce.update(dt));
    this.knobArt.rotation = Math.sin(this.time * 1.4) * 0.12;
  }
}

/**
 * An on/off toggle: an icon above a little switch. On is a green switch
 * with the ball to the right and a bright icon; off is grey and dimmed.
 */
export class Toggle extends Container {
  private readonly pill = new Graphics();
  private readonly bounce = new Bounce();
  private ball = 0;
  onToggle: ((on: boolean) => void) | null = null;

  constructor(
    readonly icon: Graphics,
    public isOn: boolean,
  ) {
    super();
    markUi(this);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hit = new Graphics().rect(-70, -70, 140, 150).fill({ color: 0, alpha: 0 });
    const plate = new Graphics();
    plate.circle(0, 6, 54).fill({ color: OUTLINE, alpha: 0.15 });
    plate.circle(0, 0, 54).fill(CREAM).stroke(stroke(5));
    this.addChild(hit, plate, icon, this.pill);
    this.ball = isOn ? 1 : 0;
    this.on('pointerover', () => (this.bounce.target = 1.07));
    this.on('pointerout', () => (this.bounce.target = 1));
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.bounce.kick(0.85);
    });
    this.on('pointertap', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.isOn = !this.isOn;
      this.bounce.kick(1.2);
      this.onToggle?.(this.isOn);
    });
    this.draw();
  }

  set(on: boolean): void {
    this.isOn = on;
  }

  private draw(): void {
    const g = this.pill.clear();
    const y = 76;
    const t = this.ball;
    const fill = t > 0.5 ? LEAF : 0xc9c3cf;
    g.roundRect(-34, y - 15, 68, 30, 15)
      .fill(fill)
      .stroke(stroke(4.5));
    const bx = -17 + 34 * t;
    g.circle(bx, y, 12).fill(0xffffff).stroke(stroke(3.5));
    this.icon.alpha = 0.45 + 0.55 * t;
  }

  update(dt: number): void {
    this.scale.set(this.bounce.update(dt));
    const want = this.isOn ? 1 : 0;
    const next = want + (this.ball - want) * Math.exp(-18 * dt);
    if (Math.abs(next - this.ball) > 0.001 || (next !== want && Math.abs(next - want) < 0.001)) {
      this.ball = Math.abs(next - want) < 0.001 ? want : next;
      this.draw();
    }
  }
}

/** A plank board with nails and grain: the backing for panels and signs. */
export function drawBoard(g: Graphics, w: number, h: number, color = 0xd49a5e): Graphics {
  g.roundRect(-w / 2 + 6, -h / 2 + 12, w, h, 34).fill({ color: OUTLINE, alpha: 0.22 });
  g.roundRect(-w / 2, -h / 2, w, h, 34)
    .fill(color)
    .stroke(stroke(7));
  const planks = Math.max(2, Math.round(h / 150));
  for (let i = 1; i < planks; i++) {
    const y = -h / 2 + (h * i) / planks;
    g.moveTo(-w / 2 + 10, y)
      .lineTo(w / 2 - 10, y)
      .stroke({ width: 4, color: darken(color, 0.28) });
  }
  for (let i = 0; i < planks; i++) {
    const y0 = -h / 2 + (h * i) / planks;
    const ph = h / planks;
    for (let j = 0; j < 3; j++) {
      const gy = y0 + ph * (0.3 + j * 0.2);
      const gx = -w / 2 + 60 + ((i * 97 + j * 211) % Math.max(1, w - 260));
      g.moveTo(gx, gy)
        .quadraticCurveTo(gx + 60, gy - 6, gx + 140, gy)
        .stroke({ width: 3, color: darken(color, 0.16), cap: 'round' });
    }
  }
  for (const [x, y] of [
    [-w / 2 + 26, -h / 2 + 26],
    [w / 2 - 26, -h / 2 + 26],
    [-w / 2 + 26, h / 2 - 26],
    [w / 2 - 26, h / 2 - 26],
  ] as const) {
    g.circle(x, y, 7).fill(0x9aa3b5).stroke(stroke(3));
    g.circle(x - 2, y - 2, 2).fill(0xffffff);
  }
  return g;
}
