import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { ItemDef } from '../../../../game/data/types';
import { OUTLINE, RIM_STYLES, darken, lighten, mix, stroke } from '../palette';
import { hash01 } from '../bugPose';
import { drawItemArt7, outlineItemArt7 } from './itemArt7';
import {
  drawItemArt8,
  drawPinwheelStick,
  drawPinwheelWheel,
  drawPotion,
  outlineItemArt8,
  pinwheelHub,
} from './itemArt8';

/** The outline behind small loose things' art (px): about 2 px heavier than their own. */
const SMALL_OUTLINE = 9;

/** The paint puddle colors, by paint ID. */
const PAINT_COLORS: Readonly<Record<string, number>> = {
  paint_red: 0xe8453c,
  paint_blue: 0x4d7cff,
  paint_yellow: 0xffd23f,
  paint_white: 0xffffff,
  paint_black: 0x2b2438,
};

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
  /** A white rim light behind the art, shown on hover. */
  private readonly rim = new Graphics();
  /** Stink lines and a fly, while the thing is smelly. */
  private readonly fx = new Graphics();
  private stink = false;
  /** How soggy a paper thing is, 0 to 1, as last drawn. */
  private soggy = 0;
  private readonly coil: Graphics | null = null;
  /** A pinwheel's blades, turning slowly on their pin. */
  private wheel: Graphics | null = null;
  private time = Math.random() * 10;
  /** Spring compression, 0 to 1, set when something bounces off it. */
  compress = 0;
  private compressV = 0;

  constructor(
    readonly def: ItemDef,
    private readonly seed = 0,
  ) {
    super();
    this.addChild(this.stretchA);
    this.stretchA.addChild(this.stretchB);
    this.stretchB.addChild(this.stretchC);
    this.stretchC.addChild(this.spin);
    this.spin.addChild(this.art);
    this.art.addChild(this.rim, this.g);
    this.addChild(this.fx);
    this.rim.visible = false;
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
      case 'sugar_cube':
        this.sugarCube(w, h, seed);
        break;
      case 'mint_leaf':
        this.mintLeaf(w, h);
        break;
      case 'pepper':
        this.pepper(w, h);
        break;
      case 'banana_mush':
        this.bananaMush(w / 2, seed);
        break;
      case 'moss_tuft':
        this.mossTuft(w / 2, seed);
        break;
      case 'jelly_bean':
        this.jellyBean(w, h);
        break;
      case 'blueberry':
        this.blueberry(w / 2);
        break;
      case 'cork':
        this.cork(w, h, seed);
        break;
      case 'leaf_raft':
        this.leafRaft(w, h);
        break;
      case 'paper_boat':
        this.paperBoat(w, h, 0);
        break;
      case 'sponge':
        this.sponge(w, h, seed);
        break;
      case 'soap':
        this.soap(w, h);
        break;
      case 'bubble_wand':
        this.bubbleWand(w, h);
        break;
      case 'feather':
        this.feather(w, h);
        break;
      case 'gum_blob':
        this.gumBlob(w / 2, seed);
        break;
      case 'magnet':
        this.magnet(w, h);
        break;
      case 'flashlight':
        this.flashlight(w, h);
        break;
      case 'moon_pebble':
        this.moonPebble(w / 2, seed);
        break;
      case 'potion':
        drawPotion(this.g, def, w, h, def.color);
        this.onLiquid = (color) => drawPotion(this.g.clear(), def, w, h, color);
        break;
      case 'pinwheel': {
        drawPinwheelStick(this.g, w, h);
        const hub = pinwheelHub(w, h);
        this.wheel = new Graphics();
        this.wheel.position.set(hub.x, hub.y);
        this.wheel.rotation = hash01(seed, 5) * Math.PI;
        drawPinwheelWheel(this.wheel, def, hub.r);
        this.art.addChild(this.wheel);
        break;
      }
      default:
        if (!drawItemArt7(this.g, def, w, h, seed)) drawItemArt8(this.g, def, w, h, seed);
    }
    const traced = this.outline(this.rim, w, h);
    for (const style of RIM_STYLES) this.rim.stroke({ ...style });
    // Small loose things get a heavier outline (review R05): a dark stroke
    // along the silhouette behind the art, so they read like the bugs do.
    if (traced && def.mass !== undefined) {
      const backing = new Graphics();
      this.outline(backing, w, h);
      backing.stroke(stroke(SMALL_OUTLINE));
      this.art.addChildAt(backing, this.art.getChildIndex(this.g));
    }
  }

  /**
   * Trace the item's silhouette (no fill), for the hover rim. False if the
   * art has no outline of its own and this is only its bounding box.
   */
  private outline(g: Graphics, w: number, h: number): boolean {
    const r = w / 2;
    switch (this.def.art) {
      case 'marble':
      case 'pebble':
      case 'moon_pebble':
      case 'ball':
      case 'banana_mush':
      case 'moss_tuft':
        g.circle(0, 0, r * 1.05);
        return true;
      case 'berry':
        g.circle(0, r * 0.05, r)
          .moveTo(0, -r * 0.95)
          .lineTo(r * 0.35, -r * 1.45);
        return true;
      case 'leaf':
      case 'mint_leaf': {
        const hw = w / 2;
        const bulge = this.def.art === 'leaf' ? h * 1.8 : h * 2.1;
        g.moveTo(-hw, 0)
          .bezierCurveTo(-hw * 0.4, -bulge, hw * 0.5, -bulge * 0.9, hw, 0)
          .bezierCurveTo(hw * 0.5, bulge * 0.7, -hw * 0.4, bulge * 0.8, -hw, 0)
          .closePath();
        return true;
      }
      case 'pepper':
        this.pepperPath(g, w, h);
        return true;
      case 'jelly_bean':
      case 'soap':
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        return true;
      case 'blueberry':
      case 'gum_blob':
        g.circle(0, 0, r * 1.05);
        return true;
      case 'leaf_raft':
        g.moveTo(-w / 2, -h * 1.2)
          .quadraticCurveTo(-w * 0.45, h * 0.9, 0, h * 0.8)
          .quadraticCurveTo(w * 0.45, h * 0.9, w / 2, -h * 1.2)
          .closePath();
        return true;
      case 'paper_boat':
        g.poly([-w / 2, -h * 0.05, w / 2, -h * 0.05, w * 0.34, h / 2, -w * 0.34, h / 2])
          .moveTo(-w * 0.2, -h * 0.05)
          .lineTo(w * 0.02, -h * 1.05)
          .lineTo(w * 0.22, -h * 0.05);
        return true;
      case 'bubble_wand':
        g.circle(w / 2 - h * 1.1, 0, h * 1.1)
          .moveTo(-w / 2, 0)
          .lineTo(w / 2 - h * 2.2, 0);
        return true;
      case 'magnet':
        g.moveTo(-w / 2, h / 2)
          .lineTo(-w / 2, -h * 0.05)
          .arc(0, -h * 0.05, w / 2, Math.PI, 0)
          .lineTo(w / 2, h / 2);
        return true;
      default:
        if (outlineItemArt7(g, this.def, w, h, this.seed) || outlineItemArt8(g, this.def, w, h, this.seed))
          return true;
        g.roundRect(-w / 2, -h / 2, w, h, Math.min(8, h / 2));
        return false;
    }
  }

  /**
   * A potion bottle's brew color (M8): bottles from the cauldron carry their
   * own (a mix, a paint color). Bottles redraw their liquid when it changes.
   */
  setLiquid(color: number): void {
    if (this.liquid === color) return;
    this.liquid = color;
    this.onLiquid?.(color);
  }
  private liquid: number | null = null;
  /** Set by potion art to redraw the liquid. */
  protected onLiquid: ((color: number) => void) | null = null;

  /** Show or hide the hover rim; `pulse` is its opacity (60 to 100 percent). */
  setRim(on: boolean, pulse = 1): void {
    this.rim.visible = on;
    this.rim.alpha = pulse;
  }

  private sugarCube(w: number, h: number, seed: number): void {
    const { g, def } = this;
    g.roundRect(-w / 2, -h / 2, w, h, 6)
      .fill(def.color)
      .stroke(stroke(4.5));
    // A shaded side and a bright top edge make it read as a cube.
    g.roundRect(w * 0.12, -h / 2 + 4, w * 0.34, h - 8, 4).fill({ color: def.accent, alpha: 0.9 });
    g.moveTo(-w * 0.34, -h * 0.3)
      .lineTo(w * 0.05, -h * 0.3)
      .stroke({ width: 3, color: 0xffffff, cap: 'round' });
    // Sugar crystals glinting.
    for (let i = 0; i < 5; i++) {
      const x = (hash01(seed, i + 3) - 0.5) * w * 0.7;
      const y = (hash01(seed, i + 9) - 0.5) * h * 0.7;
      g.rect(x - 1.5, y - 1.5, 3, 3).fill({ color: 0xc9d6ea, alpha: 0.9 });
    }
  }

  private mintLeaf(w: number, h: number): void {
    const { g, def } = this;
    const hw = w / 2;
    const bulge = h * 2.1;
    // A round leaf with a toothed edge.
    const pts: number[] = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -hw + t * w;
      const y = -Math.sin(t * Math.PI) * bulge * (0.85 + (i % 2) * 0.12);
      pts.push(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const x = -hw + t * w;
      const y = Math.sin(t * Math.PI) * bulge * 0.75 * (0.85 + (i % 2) * 0.12);
      pts.push(x, y);
    }
    g.poly(pts).fill(def.color).stroke(stroke(4));
    g.moveTo(-hw, 0)
      .quadraticCurveTo(0, -h * 0.2, hw * 0.9, 0)
      .stroke({ width: 3, color: def.accent, cap: 'round' });
    for (let i = 1; i <= 3; i++) {
      const x = -hw + (i / 4) * w;
      g.moveTo(x, -h * 0.1)
        .lineTo(x + w * 0.1, -bulge * 0.5)
        .stroke({ width: 2, color: def.accent, cap: 'round' });
      g.moveTo(x, 0)
        .lineTo(x + w * 0.09, bulge * 0.4)
        .stroke({ width: 2, color: def.accent, cap: 'round' });
    }
    g.ellipse(-hw * 0.35, -bulge * 0.45, w * 0.1, h * 0.35).fill({ color: 0xffffff, alpha: 0.5 });
    g.moveTo(-hw, 0)
      .lineTo(-hw - w * 0.12, h * 0.3)
      .stroke({ width: 4, color: OUTLINE, cap: 'round' });
  }

  private pepperPath(g: Graphics, w: number, h: number): Graphics {
    // A plump chili curling to a point on the right.
    return g
      .moveTo(-w * 0.36, -h * 0.75)
      .bezierCurveTo(w * 0.1, -h * 0.95, w * 0.42, -h * 0.4, w * 0.52, h * 0.55)
      .bezierCurveTo(w * 0.3, h * 0.2, w * 0.05, h * 0.85, -w * 0.36, h * 0.75)
      .bezierCurveTo(-w * 0.52, h * 0.5, -w * 0.52, -h * 0.5, -w * 0.36, -h * 0.75)
      .closePath();
  }

  private pepper(w: number, h: number): void {
    const { g, def } = this;
    this.pepperPath(g, w, h).fill(def.color).stroke(stroke(4.5));
    g.moveTo(-w * 0.22, -h * 0.4)
      .quadraticCurveTo(w * 0.1, -h * 0.62, w * 0.3, -h * 0.1)
      .stroke({ width: 3.5, color: 0xffffff, alpha: 0.7, cap: 'round' });
    // Green cap and a curly stem.
    g.ellipse(-w * 0.4, 0, w * 0.1, h * 0.72)
      .fill(def.accent)
      .stroke(stroke(4));
    g.moveTo(-w * 0.46, 0)
      .quadraticCurveTo(-w * 0.62, -h * 0.2, -w * 0.58, -h * 0.9)
      .stroke({ width: 5, color: OUTLINE, cap: 'round' });
    g.moveTo(-w * 0.46, 0)
      .quadraticCurveTo(-w * 0.62, -h * 0.2, -w * 0.58, -h * 0.9)
      .stroke({ width: 2, color: def.accent, cap: 'round' });
  }

  private bananaMush(r: number, seed: number): void {
    const { g, def } = this;
    // A squished, lumpy blob with a drip.
    const pts: number[] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + (hash01(seed + 7, i) - 0.5) * 0.3;
      const flat = Math.sin(a) > 0 ? 0.75 : 1;
      pts.push(Math.cos(a) * r * k * 1.12, Math.sin(a) * r * k * flat);
    }
    g.poly(pts).fill(def.color).stroke(stroke(4.5));
    g.ellipse(-r * 0.3, -r * 0.35, r * 0.35, r * 0.16).fill({ color: lighten(def.color, 0.5), alpha: 0.9 });
    for (const [x, y, s] of [
      [0.3, -0.2, 0.16],
      [-0.4, 0.2, 0.12],
      [0.1, 0.35, 0.1],
      [0.55, 0.25, 0.08],
    ] as const)
      g.ellipse(r * x, r * y, r * s * 1.3, r * s).fill({ color: def.accent, alpha: 0.85 });
    g.moveTo(r * 0.6, r * 0.5)
      .quadraticCurveTo(r * 0.7, r * 0.85, r * 0.62, r * 1.0)
      .stroke({ width: 5, color: darken(def.color, 0.15), cap: 'round' });
  }

  private mossTuft(r: number, seed: number): void {
    const { g, def } = this;
    // A fuzzy mound of little bumps.
    const bumps: [number, number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      bumps.push([
        Math.cos(a) * r * 0.62,
        Math.sin(a) * r * 0.5 + r * 0.15,
        r * (0.42 + hash01(seed, i) * 0.12),
      ]);
    }
    for (const [x, y, br] of bumps) g.circle(x, y, br).fill(def.color).stroke(stroke(4));
    g.ellipse(0, r * 0.35, r * 1.02, r * 0.55)
      .fill(def.accent)
      .stroke(stroke(4));
    for (const [x, y, br] of bumps) g.circle(x, y, br - 3).fill(def.color);
    for (let i = 0; i < 8; i++) {
      const x = (hash01(seed, i + 30) - 0.5) * r * 1.4;
      const y = (hash01(seed, i + 50) - 0.8) * r * 0.9;
      g.circle(x, y, 2.2).fill({ color: lighten(def.color, 0.5), alpha: 0.9 });
    }
  }

  private jellyBean(w: number, h: number): void {
    const { g, def } = this;
    // A kidney bean: a rounded capsule with a dent on top.
    g.moveTo(-w * 0.35, -h / 2)
      .quadraticCurveTo(0, -h * 0.2, w * 0.35, -h / 2)
      .quadraticCurveTo(w * 0.52, -h * 0.45, w * 0.5, 0)
      .quadraticCurveTo(w * 0.48, h * 0.52, 0, h * 0.52)
      .quadraticCurveTo(-w * 0.48, h * 0.52, -w * 0.5, 0)
      .quadraticCurveTo(-w * 0.52, -h * 0.45, -w * 0.35, -h / 2)
      .closePath()
      .fill(def.color)
      .stroke(stroke(4));
    g.ellipse(-w * 0.18, -h * 0.12, w * 0.16, h * 0.12).fill({ color: def.accent, alpha: 0.75 });
    g.circle(w * 0.2, h * 0.1, h * 0.07).fill({ color: def.accent, alpha: 0.5 });
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

  private blueberry(r: number): void {
    const { g, def } = this;
    g.circle(0, 0, r).fill(def.color).stroke(stroke(4.5));
    // A dusty bloom and a five-point crown on top.
    g.circle(-r * 0.2, -r * 0.1, r * 0.72).fill({ color: lighten(def.color, 0.25), alpha: 0.35 });
    g.star(0, -r * 0.62, 5, r * 0.36, r * 0.16)
      .fill(def.accent)
      .stroke(stroke(3));
    g.circle(-r * 0.42, -r * 0.3, r * 0.17).fill({ color: 0xffffff, alpha: 0.75 });
  }

  private cork(w: number, h: number, seed: number): void {
    const { g, def } = this;
    // A cork lying on its side: a slightly tapered barrel with a round end.
    g.poly([-w / 2, -h / 2 + 2, w / 2 - 6, -h / 2, w / 2 - 6, h / 2, -w / 2, h / 2 - 2])
      .fill(def.color)
      .stroke(stroke(4.5));
    g.ellipse(w / 2 - 6, 0, 7, h / 2)
      .fill(def.accent)
      .stroke(stroke(4));
    for (let i = 0; i < 9; i++) {
      const x = (hash01(seed, i) - 0.55) * w * 0.8;
      const y = (hash01(seed, i + 11) - 0.5) * h * 0.7;
      g.circle(x, y, 1.8 + hash01(seed, i + 3) * 1.6).fill({ color: darken(def.color, 0.35), alpha: 0.8 });
    }
    g.moveTo(-w * 0.38, -h * 0.28)
      .lineTo(w * 0.2, -h * 0.3)
      .stroke({ width: 3, color: lighten(def.color, 0.45), alpha: 0.8, cap: 'round' });
  }

  private leafRaft(w: number, h: number): void {
    const { g, def } = this;
    // A big leaf with its edges curled up into a shallow boat.
    const lip = h * 1.2;
    g.moveTo(-w / 2, -lip)
      .quadraticCurveTo(-w * 0.45, h * 0.9, 0, h * 0.8)
      .quadraticCurveTo(w * 0.45, h * 0.9, w / 2, -lip)
      .quadraticCurveTo(w * 0.2, -h * 0.1, 0, -h * 0.15)
      .quadraticCurveTo(-w * 0.2, -h * 0.1, -w / 2, -lip)
      .closePath()
      .fill(def.color)
      .stroke(stroke(5));
    // The inside of the leaf, lighter, with a midrib and veins.
    g.moveTo(-w * 0.44, -lip * 0.75)
      .quadraticCurveTo(0, -h * 0.4, w * 0.44, -lip * 0.75)
      .quadraticCurveTo(0, h * 0.1, -w * 0.44, -lip * 0.75)
      .fill(lighten(def.color, 0.25));
    g.moveTo(-w * 0.44, -lip * 0.72)
      .quadraticCurveTo(0, -h * 0.08, w * 0.44, -lip * 0.72)
      .stroke({ width: 4, color: def.accent, cap: 'round' });
    for (let i = 1; i < 6; i++) {
      const x = -w / 2 + (i / 6) * w;
      g.moveTo(x, -h * 0.2)
        .lineTo(x + w * 0.05, h * 0.45)
        .stroke({ width: 2.5, color: def.accent, alpha: 0.8, cap: 'round' });
    }
    // A stem curling up at the back.
    g.moveTo(-w / 2 + 4, -lip)
      .quadraticCurveTo(-w / 2 - 14, -lip - 20, -w / 2 - 4, -lip - 34)
      .stroke({ width: 6, color: OUTLINE, cap: 'round' });
    g.moveTo(-w / 2 + 4, -lip)
      .quadraticCurveTo(-w / 2 - 14, -lip - 20, -w / 2 - 4, -lip - 34)
      .stroke({ width: 3, color: def.accent, cap: 'round' });
  }

  /** A folded paper boat; `soggy` (0 to 1) sags the sail and greys the paper. */
  private paperBoat(w: number, h: number, soggy: number): void {
    const { def } = this;
    const g = this.g.clear();
    const paper = mix(def.color, 0x9fb4c4, soggy * 0.6);
    const shade = darken(paper, 0.12);
    const sag = soggy * h * 0.35;
    // The hull: a trapezoid with a folded rim.
    g.poly([-w / 2, -h * 0.05, w / 2, -h * 0.05, w * 0.34, h / 2, -w * 0.34, h / 2])
      .fill(paper)
      .stroke(stroke(4.5));
    g.poly([-w / 2, -h * 0.05, w / 2, -h * 0.05, w * 0.42, h * 0.16, -w * 0.42, h * 0.16]).fill(shade);
    // The sail: a tall triangle that droops when soggy.
    g.poly([-w * 0.22, -h * 0.05, w * 0.02 + sag * 0.8, -h * 1.05 + sag, w * 0.24, -h * 0.05])
      .fill(paper)
      .stroke(stroke(4.5));
    g.moveTo(w * 0.02 + sag * 0.8, -h * 1.05 + sag)
      .lineTo(0, -h * 0.05)
      .stroke({ width: 2.5, color: shade, cap: 'round' });
    // A blue stripe printed on the paper.
    g.moveTo(-w * 0.36, h * 0.3)
      .lineTo(w * 0.36, h * 0.3)
      .stroke({ width: 4, color: def.accent, alpha: 1 - soggy * 0.5, cap: 'round' });
    if (soggy > 0.3)
      for (let i = 0; i < 3; i++)
        g.circle(-w * 0.2 + i * w * 0.2, h * 0.05 + (i % 2) * 6, 5 + soggy * 5).fill({
          color: 0x8aa0b3,
          alpha: 0.35 * soggy,
        });
  }

  /** Show how soggy a paper boat is (0 to 1). */
  setSoggy(k: number): void {
    if (this.def.art !== 'paper_boat' || Math.abs(k - this.soggy) < 0.05) return;
    this.soggy = k;
    const s = this.def.shape;
    if (s.type === 'box') this.paperBoat(s.width * PIXELS_PER_METER, s.height * PIXELS_PER_METER, k);
  }

  private sponge(w: number, h: number, seed: number): void {
    const { g, def } = this;
    // A kitchen sponge: yellow foam with a green scrubber on top.
    g.roundRect(-w / 2, -h / 2, w, h, 8)
      .fill(def.color)
      .stroke(stroke(4.5));
    g.roundRect(-w / 2, -h / 2, w, h * 0.3, 6)
      .fill(def.accent)
      .stroke(stroke(4));
    for (let i = 0; i < 11; i++) {
      const x = (hash01(seed, i) - 0.5) * w * 0.8;
      const y = h * 0.02 + hash01(seed, i + 20) * h * 0.38;
      g.ellipse(x, y, 3 + hash01(seed, i + 5) * 3, 2 + hash01(seed, i + 7) * 2).fill({
        color: darken(def.color, 0.28),
        alpha: 0.85,
      });
    }
    g.moveTo(-w * 0.36, -h * 0.34)
      .lineTo(w * 0.2, -h * 0.34)
      .stroke({ width: 2.5, color: lighten(def.accent, 0.4), cap: 'round' });
  }

  private soap(w: number, h: number): void {
    const { g, def } = this;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill(def.color)
      .stroke(stroke(4.5));
    g.roundRect(-w * 0.36, -h * 0.34, w * 0.5, h * 0.22, h * 0.11).fill({ color: 0xffffff, alpha: 0.75 });
    // A little bubble stuck to it.
    g.circle(w * 0.3, -h * 0.55, h * 0.24)
      .fill({ color: 0xffffff, alpha: 0.35 })
      .stroke({ width: 2.5, color: 0x9fd8f0 });
    g.circle(w * 0.26, -h * 0.62, h * 0.07).fill(0xffffff);
  }

  private bubbleWand(w: number, h: number): void {
    const { g, def } = this;
    const rr = h * 1.1;
    const cx = w / 2 - rr;
    // The handle, then the ring.
    g.roundRect(-w / 2, -h * 0.22, w - rr * 2 + 4, h * 0.44, h * 0.22)
      .fill(def.color)
      .stroke(stroke(4));
    g.circle(cx, 0, rr).stroke({ width: 13, color: OUTLINE });
    g.circle(cx, 0, rr).stroke({ width: 7, color: def.accent });
    g.circle(cx, 0, rr - 7).fill({ color: 0xe8f8ff, alpha: 0.35 });
    g.moveTo(cx + Math.cos(Math.PI * 1.1) * (rr - 10), Math.sin(Math.PI * 1.1) * (rr - 10))
      .arc(cx, 0, rr - 10, Math.PI * 1.1, Math.PI * 1.5)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
    g.moveTo(-w / 2 + 8, -h * 0.08)
      .lineTo(-w * 0.1, -h * 0.08)
      .stroke({ width: 2.5, color: 0xffffff, alpha: 0.7, cap: 'round' });
  }

  private feather(w: number, h: number): void {
    const { g, def } = this;
    const hw = w / 2;
    // A soft vane on a curved quill, tipped with blue.
    g.moveTo(-hw, 0)
      .bezierCurveTo(-hw * 0.4, -h * 2.2, hw * 0.6, -h * 1.9, hw, -h * 0.3)
      .bezierCurveTo(hw * 0.6, h * 1.3, -hw * 0.4, h * 1.4, -hw * 0.7, h * 0.2)
      .closePath()
      .fill(def.color)
      .stroke(stroke(4));
    g.moveTo(hw * 0.35, -h * 1.1)
      .bezierCurveTo(hw * 0.7, -h * 0.9, hw * 0.9, -h * 0.5, hw, -h * 0.3)
      .bezierCurveTo(hw * 0.75, h * 0.4, hw * 0.5, h * 0.6, hw * 0.35, h * 0.5)
      .fill(def.accent);
    for (let i = 1; i < 7; i++) {
      const x = -hw * 0.7 + (i / 7) * w * 0.9;
      g.moveTo(x, -h * 0.1)
        .lineTo(x + w * 0.06, -h * 0.9)
        .stroke({ width: 1.8, color: 0xc8d6e6, cap: 'round' });
    }
    g.moveTo(-hw - w * 0.1, h * 0.25)
      .quadraticCurveTo(0, -h * 0.25, hw, -h * 0.25)
      .stroke({ width: 3.5, color: 0xd8c7a3, cap: 'round' });
  }

  private gumBlob(r: number, seed: number): void {
    const { g, def } = this;
    // A chewed, lumpy blob, very shiny.
    const pts: number[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const k = 1 + (hash01(seed + 3, i) - 0.5) * 0.22;
      pts.push(Math.cos(a) * r * k * 1.08, Math.sin(a) * r * k * (Math.sin(a) > 0 ? 0.82 : 1));
    }
    g.poly(pts).fill(def.color).stroke(stroke(4.5));
    g.ellipse(-r * 0.3, -r * 0.38, r * 0.34, r * 0.16).fill({ color: 0xffffff, alpha: 0.85 });
    g.circle(r * 0.3, -r * 0.15, r * 0.09).fill({ color: 0xffffff, alpha: 0.8 });
    g.moveTo(-r * 0.1, r * 0.3)
      .quadraticCurveTo(r * 0.2, r * 0.5, r * 0.5, r * 0.25)
      .stroke({ width: 3, color: darken(def.color, 0.2), alpha: 0.7, cap: 'round' });
  }

  /** A blue pen torch: a ridged barrel, a clip, and a lens at its head (on the right). */
  private flashlight(w: number, h: number): void {
    const { g, def } = this;
    const head = w * 0.26;
    g.roundRect(-w / 2, -h / 2, w - head * 0.6, h, h / 2)
      .fill(def.color)
      .stroke(stroke(4.5));
    // The head flares out a little, with a yellow lens.
    g.poly([w / 2 - head, -h / 2, w / 2, -h * 0.7, w / 2, h * 0.7, w / 2 - head, h / 2])
      .fill(lighten(def.color, 0.15))
      .stroke(stroke(4.5));
    g.roundRect(w / 2 - 7, -h * 0.58, 8, h * 1.16, 3)
      .fill(def.accent)
      .stroke(stroke(3));
    // Grip rings and a pocket clip.
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + h * 0.8 + i * 9;
      g.moveTo(x, -h / 2 + 3)
        .lineTo(x, h / 2 - 3)
        .stroke({ width: 2.5, color: darken(def.color, 0.35), alpha: 0.7 });
    }
    g.roundRect(-w * 0.1, -h / 2 - 4, w * 0.32, 6, 3)
      .fill(0xd9dde6)
      .stroke(stroke(2.5));
    // A little switch button.
    g.circle(w * 0.06, h * 0.05, 4)
      .fill(0xff5d73)
      .stroke(stroke(2));
    g.roundRect(-w / 2 + 6, -h / 2 + 3, w * 0.6, 4, 2).fill({ color: 0xffffff, alpha: 0.4 });
  }

  /** A pale pebble that glows like the moon, with a sleepy crescent on it. */
  private moonPebble(r: number, seed: number): void {
    const { g, def } = this;
    const pts: number[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const k = 1 + (hash01(seed, i) - 0.5) * 0.12;
      pts.push(Math.cos(a) * r * k * 1.06, Math.sin(a) * r * k * 0.96);
    }
    g.poly(pts).fill(def.color).stroke(stroke(4.5));
    g.ellipse(-r * 0.25, -r * 0.35, r * 0.42, r * 0.2).fill({ color: 0xffffff, alpha: 0.9 });
    // A crescent moon mark.
    g.circle(r * 0.12, r * 0.12, r * 0.42).fill(def.accent);
    g.circle(r * 0.28, r * 0.02, r * 0.36).fill(def.color);
    g.circle(-r * 0.5, r * 0.4, r * 0.08).fill({ color: def.accent, alpha: 0.8 });
    g.circle(r * 0.55, -r * 0.45, r * 0.06).fill({ color: def.accent, alpha: 0.8 });
  }

  private magnet(w: number, h: number): void {
    const { g, def } = this;
    // A red horseshoe with silver tips, legs pointing down.
    const R = w / 2;
    const r = R * 0.42;
    const cy = -h * 0.05;
    g.moveTo(-R, h / 2)
      .lineTo(-R, cy)
      .arc(0, cy, R, Math.PI, 0)
      .lineTo(R, h / 2)
      .lineTo(r, h / 2)
      .lineTo(r, cy)
      .arc(0, cy, r, 0, Math.PI, true)
      .lineTo(-r, h / 2)
      .closePath()
      .fill(def.color)
      .stroke(stroke(4.5));
    for (const sx of [-1, 1]) {
      g.rect(sx < 0 ? -R : r, h / 2 - h * 0.3, R - r, h * 0.3)
        .fill(def.accent)
        .stroke(stroke(4));
    }
    g.moveTo(Math.cos(Math.PI * 1.15) * R * 0.72, cy + Math.sin(Math.PI * 1.15) * R * 0.72)
      .arc(0, cy, R * 0.72, Math.PI * 1.15, Math.PI * 1.6)
      .stroke({
        width: 3,
        color: 0xffffff,
        alpha: 0.7,
        cap: 'round',
      });
  }

  /** Bites cut out of the edge, as last drawn. */
  private bites = 0;
  /** The holes (an inverse mask on the art) and their outlined edges. */
  private biteHoles: Graphics | null = null;
  private biteEdge: Graphics | null = null;
  /** The paint on it, as last drawn. */
  private paintId: string | undefined;
  private paintLayer: Graphics | null = null;

  /** The size of the drawing (not the collider), in art space. */
  private drawnBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const b = this.g.getLocalBounds();
    return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
  }

  /** Where a vertical line at x first meets the drawing, from the top (dir 1) or the bottom (dir -1). */
  private edgeAt(x: number, dir: 1 | -1): number | null {
    const { y0, y1 } = this.drawnBounds();
    const p = { x, y: 0 };
    for (let k = 0; k <= y1 - y0; k += 1) {
      p.y = dir === 1 ? y0 + k : y1 - k;
      if (this.g.containsPoint(p)) return p.y;
    }
    return null;
  }

  /**
   * Show `n` bites a caterpillar took out of it (only the first two show): round
   * notches cut from the top and bottom edges, outlined like the rest of it.
   */
  setBites(n: number): void {
    const k = Math.min(2, Math.max(0, Math.floor(n)));
    if (k === this.bites) return;
    this.bites = k;
    if (!this.biteHoles) {
      // The holes live beside the art (a mask inside what it masks is unreliable) and squash with it.
      this.biteHoles = new Graphics();
      this.biteEdge = new Graphics();
      this.spin.addChild(this.biteHoles);
      this.art.addChild(this.biteEdge);
    }
    const holes = this.biteHoles.clear();
    const edge = this.biteEdge!.clear();
    if (k === 0) {
      this.art.mask = null;
      return;
    }
    const { x0, y0, x1, y1 } = this.drawnBounds();
    const bw = x1 - x0;
    const r = Math.max(5, Math.min(12, Math.min(bw, y1 - y0) * 0.28));
    const circles: [number, number, number][] = [];
    const spots: [number, 1 | -1][] = [
      [x0 + bw * 0.66, 1],
      [x0 + bw * 0.32, -1],
    ];
    for (const [x, dir] of spots.slice(0, k)) {
      const y = this.edgeAt(x, dir);
      if (y === null) continue;
      const cy = y - dir * r * 0.2;
      // One big chomp with two smaller tooth marks beside it.
      circles.push(
        [x, cy, r],
        [x - r * 0.85, cy + dir * r * 0.05, r * 0.55],
        [x + r * 0.85, cy + dir * r * 0.05, r * 0.55],
      );
    }
    for (const [x, y, cr] of circles) holes.circle(x, y, cr).fill(0xffffff);
    // Outline the bitten edge: the parts of each circle that lie on the item and outside the other holes.
    const p = { x: 0, y: 0 };
    const steps = 48;
    for (const [i, [cx, cy, cr]] of circles.entries()) {
      let run: [number, number][] = [];
      const flush = (): void => {
        if (run.length > 1) {
          run.forEach(([x, y], j) => (j === 0 ? edge.moveTo(x, y) : edge.lineTo(x, y)));
          edge.stroke({ width: 9, color: OUTLINE, cap: 'round', join: 'round' });
        }
        run = [];
      };
      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        // Test just outside the hole, where the visible half of the outline falls.
        p.x = cx + Math.cos(a) * (cr + 3);
        p.y = cy + Math.sin(a) * (cr + 3);
        const onItem = this.g.containsPoint(p);
        p.x = cx + Math.cos(a) * cr;
        p.y = cy + Math.sin(a) * cr;
        const inOther = circles.some(
          ([ox, oy, or], j) => j !== i && Math.hypot(p.x - ox, p.y - oy) < or - 0.5,
        );
        if (onItem && !inOther) run.push([p.x, p.y]);
        else flush();
      }
      flush();
    }
    this.art.setMask({ mask: holes, inverse: true });
  }

  private drawnW(): number {
    const s = this.def.shape;
    return (s.type === 'circle' ? s.radius * 2 : s.width) * PIXELS_PER_METER;
  }

  private drawnH(): number {
    const s = this.def.shape;
    return (s.type === 'circle' ? s.radius * 2 : s.height) * PIXELS_PER_METER;
  }

  /**
   * Show the paint on it (items keep the last color they were dipped in): the
   * silhouette washed with the color, a wet shine, and a couple of drips.
   */
  setPaint(paint: readonly string[] | undefined): void {
    const id = paint && paint.length > 0 ? paint[paint.length - 1] : undefined;
    if (id === this.paintId) return;
    this.paintId = id;
    if (!this.paintLayer) {
      this.paintLayer = new Graphics();
      // Above the drawing, under the bite edges.
      this.art.addChildAt(this.paintLayer, this.art.getChildIndex(this.g) + (this.coil ? 2 : 1));
    }
    const g = this.paintLayer.clear();
    const color = id === undefined ? undefined : PAINT_COLORS[id];
    if (color === undefined) return;
    const w = this.drawnW();
    const h = this.drawnH();
    this.outline(g, w, h);
    g.fill({ color, alpha: 0.62 });
    const { x0, x1, y0 } = this.drawnBounds();
    const bw = x1 - x0;
    // Drips running off the bottom edge.
    for (const [t, len] of [
      [0.3, 14],
      [0.68, 4],
    ] as const) {
      const x = x0 + bw * t;
      const y = this.edgeAt(x, -1);
      if (y === null) continue;
      const l = len * Math.min(1.3, Math.max(0.7, bw / 50));
      g.moveTo(x, y - 4)
        .lineTo(x, y + l)
        .stroke({ width: 7, color: OUTLINE, cap: 'round' });
      g.circle(x, y + l + 1, 5).fill(OUTLINE);
      g.moveTo(x, y - 5)
        .lineTo(x, y + l)
        .stroke({ width: 3, color, cap: 'round' });
      g.circle(x, y + l + 1, 3).fill(color);
      g.circle(x - 1.2, y + l, 1).fill({ color: 0xffffff, alpha: 0.8 });
    }
    this.outline(g, w, h);
    g.stroke(stroke(4));
    // A wet shine near the top.
    const top = this.edgeAt(x0 + bw * 0.38, 1) ?? y0;
    g.moveTo(x0 + bw * 0.26, top + 5)
      .lineTo(x0 + bw * 0.42, top + 4)
      .stroke({ width: 3, color: 0xffffff, alpha: 0.75, cap: 'round' });
  }

  /** Show the stink lines and fly, or hide them. */
  setStink(on: boolean): void {
    if (on === this.stink) return;
    this.stink = on;
    if (!on) this.fx.clear();
  }

  /** Wavy stink lines and a fly doing loops (drawn upright, not spun). */
  private drawStink(): void {
    const g = this.fx.clear();
    const t = this.time;
    for (let i = 0; i < 2; i++) {
      const x0 = -8 + i * 16;
      const rise = (t * 0.6 + i * 0.5) % 1;
      const y0 = -22 - rise * 26;
      g.moveTo(x0, y0);
      for (let k = 1; k <= 4; k++) g.lineTo(x0 + Math.sin(k * 1.7 + t * 4) * 4, y0 - k * 5);
      g.stroke({ width: 3, color: 0x9bbf4a, alpha: 1 - rise, cap: 'round', join: 'round' });
    }
    const fx = Math.cos(t * 3.1) * 26;
    const fy = -34 + Math.sin(t * 6.2) * 9;
    const flap = Math.abs(Math.sin(t * 40));
    g.ellipse(fx - 3, fy - 4, 4, 2 + flap * 2).fill({ color: 0xffffff, alpha: 0.8 });
    g.ellipse(fx + 3, fy - 4, 4, 2 + flap * 2).fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(fx, fy, 3.2).fill(OUTLINE);
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
    this.biteHoles?.scale.set(sx, sy);
  }

  private drawnCompress = 0;

  update(dt: number): void {
    this.time += dt;
    if (this.stink) this.drawStink();
    if (this.wheel) this.wheel.rotation += dt * 1.6;
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
