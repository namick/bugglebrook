import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { ItemDef } from '../../../../game/data/types';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { hash01 } from '../bugPose';

/**
 * A physics prop drawn from its item definition. The root sits at the body
 * center and rotates with it; `art` is squashed and stretched by the view.
 */
export class ItemSprite extends Container {
  private readonly stretchA = new Container();
  private readonly stretchB = new Container();
  private readonly stretchC = new Container();
  /** Rotates with the body. */
  private readonly spin = new Container();
  /** Inner layer for squash. */
  readonly art = new Container();
  private readonly g = new Graphics();
  private readonly coil: Graphics | null = null;
  /** Spring compression, 0 to 1, set when something bounces off it. */
  compress = 0;
  private compressV = 0;

  constructor(
    readonly def: ItemDef,
    seed = 0,
  ) {
    super();
    this.addChild(this.stretchA);
    this.stretchA.addChild(this.stretchB);
    this.stretchB.addChild(this.stretchC);
    this.stretchC.addChild(this.spin);
    this.spin.addChild(this.art);
    this.art.addChild(this.g);
    const ppm = PIXELS_PER_METER;
    const s = def.shape;
    const w = s.type === 'circle' ? s.radius * 2 * ppm : s.width * ppm;
    const h = s.type === 'circle' ? s.radius * 2 * ppm : s.height * ppm;
    switch (def.art) {
      case 'bottle_cap':
        this.bottleCap(w, h);
        break;
      case 'marble':
        this.marble(w / 2);
        break;
      case 'pebble':
        this.pebble(w / 2, seed);
        break;
      case 'ruler':
        this.ruler(w, h);
        break;
      case 'spring':
        this.coil = new Graphics();
        this.art.addChild(this.coil);
        this.drawSpring(w, h, 0);
        break;
      case 'ball':
        this.ball(w / 2);
        break;
      case 'berry':
        this.berry(w / 2);
        break;
      case 'twig':
        this.twig(w, h);
        break;
      case 'leaf':
        this.leaf(w, h);
        break;
    }
  }

  private bottleCap(w: number, h: number): void {
    const { g, def } = this;
    // A cap lying on its back: crimped skirt below, flat top above.
    const top = -h / 2;
    const bottom = h / 2;
    const pts: number[] = [-w / 2 + 4, top];
    pts.push(w / 2 - 4, top);
    const teeth = 9;
    for (let i = 0; i <= teeth; i++) {
      const x = w / 2 - (i / teeth) * w;
      pts.push(x, i % 2 === 0 ? bottom : bottom - h * 0.22);
    }
    g.poly(pts).fill(def.color).stroke(stroke(5));
    g.roundRect(-w / 2 + 4, top - 3, w - 8, h * 0.38, 4)
      .fill(lighten(def.color, 0.35))
      .stroke(stroke(4));
    for (let i = 1; i < teeth; i += 2) {
      const x = w / 2 - (i / teeth) * w;
      g.moveTo(x, bottom - h * 0.2)
        .lineTo(x, top + h * 0.4)
        .stroke({ width: 2.5, color: darken(def.color, 0.3), cap: 'round' });
    }
    g.moveTo(-w * 0.32, top + 2)
      .lineTo(-w * 0.05, top + 2)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.8, cap: 'round' });
  }

  private marble(r: number): void {
    const { g, def } = this;
    g.circle(0, 0, r).fill(lighten(def.color, 0.25)).stroke(stroke(4));
    // A swirl of color inside the glass.
    g.moveTo(-r * 0.7, r * 0.2)
      .bezierCurveTo(-r * 0.2, -r * 0.6, r * 0.3, r * 0.7, r * 0.7, -r * 0.2)
      .stroke({ width: r * 0.45, color: def.color, cap: 'round' });
    g.circle(-r * 0.32, -r * 0.34, r * 0.24).fill({ color: 0xffffff, alpha: 0.9 });
    g.circle(r * 0.35, r * 0.4, r * 0.1).fill({ color: 0xffffff, alpha: 0.6 });
    g.circle(0, 0, r).stroke(stroke(4));
  }

  private pebble(r: number, seed: number): void {
    const { g, def } = this;
    // A lumpy circle, different for each pebble.
    const pts: number[] = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + (hash01(seed, i) - 0.5) * 0.18;
      pts.push(Math.cos(a) * r * k * 1.08, Math.sin(a) * r * k * 0.95);
    }
    const tint = [def.color, 0xa8b4c2, 0xc2b1a3, 0xb7c2a8][Math.floor(hash01(seed, 99) * 4)]!;
    g.poly(pts).fill(tint).stroke(stroke(4.5));
    g.ellipse(-r * 0.25, -r * 0.35, r * 0.42, r * 0.2).fill({ color: lighten(tint, 0.45), alpha: 0.9 });
    for (let i = 0; i < 4; i++) {
      const x = (hash01(seed, i + 20) - 0.5) * r * 1.1;
      const y = (hash01(seed, i + 40) - 0.2) * r * 0.9;
      g.circle(x, y, r * 0.07).fill({ color: darken(tint, 0.3), alpha: 0.7 });
    }
  }

  private ruler(w: number, h: number): void {
    const { g, def } = this;
    g.roundRect(-w / 2, -h / 2, w, h, 5)
      .fill(def.color)
      .stroke(stroke(5));
    g.rect(-w / 2 + 3, h * 0.12, w - 6, h * 0.3).fill({ color: def.accent, alpha: 0.6 });
    // Tick marks along the top edge, longer every fifth.
    const ticks = 40;
    for (let i = 1; i < ticks; i++) {
      const x = -w / 2 + (i / ticks) * w;
      const long = i % 5 === 0;
      g.moveTo(x, -h / 2 + 2)
        .lineTo(x, -h / 2 + (long ? h * 0.55 : h * 0.3))
        .stroke({ width: long ? 3 : 2, color: OUTLINE, cap: 'round' });
    }
    g.circle(w / 2 - h * 0.9, h * 0.05, h * 0.18).fill(OUTLINE);
  }

  private drawSpring(w: number, h: number, squeeze: number): void {
    const g = this.g.clear();
    const coil = this.coil!.clear();
    const { def } = this;
    const bottom = h / 2;
    const plate = h * 0.14;
    const topY = -h / 2 + squeeze * h * 0.45;
    g.roundRect(-w / 2, bottom - plate, w, plate, 4)
      .fill(0x6c7a8c)
      .stroke(stroke(4));
    // The coil: a zigzag of thick metal between the plates.
    const turns = 5;
    const y0 = bottom - plate;
    const y1 = topY + plate;
    const pts: [number, number][] = [];
    for (let i = 0; i <= turns * 2; i++) {
      const t = i / (turns * 2);
      pts.push([i % 2 === 0 ? -w * 0.38 : w * 0.38, y0 + (y1 - y0) * t]);
    }
    for (const [width, color] of [
      [9, OUTLINE],
      [5, def.color],
    ] as const) {
      pts.forEach(([x, y], i) => (i === 0 ? coil.moveTo(x, y) : coil.lineTo(x, y)));
      coil.stroke({ width, color, cap: 'round', join: 'round' });
    }
    pts.forEach(([x, y], i) => (i === 0 ? coil.moveTo(x + 1, y - 1) : coil.lineTo(x + 1, y - 1)));
    coil.stroke({ width: 1.5, color: 0xffffff, alpha: 0.8, cap: 'round', join: 'round' });
    coil
      .roundRect(-w / 2, topY, w, plate, 4)
      .fill(def.accent)
      .stroke(stroke(4));
    coil
      .moveTo(-w * 0.35, topY + 3)
      .lineTo(-w * 0.05, topY + 3)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.8, cap: 'round' });
  }

  private ball(r: number): void {
    const { g, def } = this;
    g.circle(0, 0, r).fill(def.color).stroke(stroke(5));
    g.moveTo(-r, -r * 0.1)
      .quadraticCurveTo(0, r * 0.45, r, -r * 0.1)
      .lineTo(r * 0.95, r * 0.28)
      .quadraticCurveTo(0, r * 0.85, -r * 0.95, r * 0.28)
      .closePath()
      .fill(def.accent);
    g.star(0, -r * 0.4, 5, r * 0.22, r * 0.1).fill(0xffffff);
    g.circle(-r * 0.45, -r * 0.45, r * 0.16).fill({ color: 0xffffff, alpha: 0.85 });
    g.circle(0, 0, r).stroke(stroke(5));
  }

  private berry(r: number): void {
    const { g, def } = this;
    g.circle(0, r * 0.05, r)
      .fill(def.color)
      .stroke(stroke(4.5));
    for (const [x, y] of [
      [-0.4, 0.1],
      [0.1, 0.45],
      [0.45, 0.0],
      [-0.15, -0.25],
      [-0.5, 0.55],
    ] as const)
      g.ellipse(r * x, r * y, r * 0.07, r * 0.1).fill(0xffd6a5);
    g.circle(-r * 0.4, -r * 0.35, r * 0.18).fill({ color: 0xffffff, alpha: 0.8 });
    // Leafy cap and stem.
    g.poly([-r * 0.55, -r * 0.8, 0, -r * 0.62, r * 0.55, -r * 0.8, r * 0.1, -r * 1.05, -r * 0.1, -r * 1.05])
      .fill(def.accent)
      .stroke(stroke(3.5));
    g.moveTo(0, -r * 0.95)
      .quadraticCurveTo(r * 0.1, -r * 1.35, r * 0.35, -r * 1.45)
      .stroke({ width: 4, color: OUTLINE, cap: 'round' });
  }

  private twig(w: number, h: number): void {
    const { g, def } = this;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill(def.color)
      .stroke(stroke(4.5));
    // Two nubs where little branches broke off.
    for (const [x, dir] of [
      [-0.18, -1],
      [0.26, 1],
    ] as const) {
      g.moveTo(w * x, -h / 2 + 2)
        .lineTo(w * x + dir * h * 0.8, -h * 1.3)
        .stroke({ width: h * 0.55, color: OUTLINE, cap: 'round' });
      g.moveTo(w * x, -h / 2 + 2)
        .lineTo(w * x + dir * h * 0.8, -h * 1.3)
        .stroke({ width: h * 0.55 - 6, color: def.color, cap: 'round' });
    }
    for (let i = 0; i < 5; i++) {
      const x = -w * 0.4 + i * w * 0.2;
      g.moveTo(x, -h * 0.1)
        .lineTo(x + w * 0.07, -h * 0.1)
        .stroke({ width: 2, color: darken(def.color, 0.35), cap: 'round' });
    }
    g.ellipse(w / 2 - h * 0.5, 0, h * 0.25, h * 0.32).fill(def.accent);
  }

  private leaf(w: number, h: number): void {
    const { g, def } = this;
    const hw = w / 2;
    const bulge = h * 1.8;
    g.moveTo(-hw, 0)
      .bezierCurveTo(-hw * 0.4, -bulge, hw * 0.5, -bulge * 0.9, hw, 0)
      .bezierCurveTo(hw * 0.5, bulge * 0.7, -hw * 0.4, bulge * 0.8, -hw, 0)
      .closePath()
      .fill(def.color)
      .stroke(stroke(4.5));
    g.moveTo(-hw, 0)
      .quadraticCurveTo(0, -h * 0.3, hw * 0.9, 0)
      .stroke({ width: 3, color: def.accent, cap: 'round' });
    for (let i = 1; i <= 3; i++) {
      const x = -hw + (i / 4) * w;
      g.moveTo(x, -h * 0.15)
        .lineTo(x + w * 0.12, -bulge * 0.45)
        .stroke({ width: 2, color: def.accent, cap: 'round' });
      g.moveTo(x, -h * 0.1)
        .lineTo(x + w * 0.1, bulge * 0.35)
        .stroke({ width: 2, color: def.accent, cap: 'round' });
    }
    g.moveTo(-hw, 0)
      .lineTo(-hw - w * 0.12, h * 0.4)
      .stroke({ width: 4, color: OUTLINE, cap: 'round' });
  }

  /** Squish a spring (0 to 1); it springs back on its own in `update`. */
  squish(amount: number): void {
    this.compress = Math.max(this.compress, amount);
  }

  /**
   * Place the art: `angle` is the body's rotation, `stretch` stretches along
   * `stretchAngle` (screen space), and sx/sy is the squash spring.
   */
  pose(angle: number, stretchAngle: number, stretch: number, sx: number, sy: number): void {
    this.stretchA.rotation = stretchAngle;
    this.stretchB.scale.set(stretch, 1 / stretch);
    this.stretchC.rotation = -stretchAngle;
    this.spin.rotation = angle;
    this.art.scale.set(sx, sy);
  }

  private drawnCompress = 0;

  update(dt: number): void {
    if (!this.coil) return;
    // Damped spring back to rest, with a little overshoot for a boing.
    this.compressV += (-220 * this.compress - 10 * this.compressV) * Math.min(dt, 0.05);
    this.compress += this.compressV * Math.min(dt, 0.05);
    if (Math.abs(this.compress) < 0.002 && Math.abs(this.compressV) < 0.01) {
      this.compress = 0;
      this.compressV = 0;
    }
    const s = this.def.shape;
    if (s.type === 'box' && this.compress !== this.drawnCompress) {
      this.drawnCompress = this.compress;
      this.drawSpring(s.width * PIXELS_PER_METER, s.height * PIXELS_PER_METER, Math.max(-0.4, this.compress));
    }
  }
}
