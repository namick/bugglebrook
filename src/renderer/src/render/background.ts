import { Container, FillGradient, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { Rng } from '../../../game/core/rng';
import type { AreaDef } from '../../../game/data/types';
import type { Terrain } from '../../../game/world/terrain';
import type { Camera } from './camera';
import { OUTLINE, darken, lighten, mix, stroke } from './palette';

const PPM = PIXELS_PER_METER;
const BOTTOM = VIEW_HEIGHT_PX + 40;

/** Parallax factors: how fast each layer moves relative to the camera. */
export const PARALLAX = { sun: 0.03, clouds: 0.12, hills: 0.28, mid: 0.55, near: 1, front: 1.22 } as const;

/** Soft outline for background art: thinner and fainter than props (readability rule). */
const soft = (
  width = 3,
  alpha = 0.55,
): { width: number; color: number; alpha: number; join: 'round'; cap: 'round' } => ({
  width,
  color: OUTLINE,
  alpha,
  join: 'round',
  cap: 'round',
});

/** Draw overlapping circles as one outlined blob: outlines first, fills on top. */
function blob(g: Graphics, circles: [number, number, number][], fill: number, line: number, alpha = 1): void {
  for (const [x, y, r] of circles) g.circle(x, y, r + line / 2).fill({ color: OUTLINE, alpha });
  for (const [x, y, r] of circles) g.circle(x, y, r - line / 2).fill(fill);
}

/** A tapering, curving blade of grass rooted at (x, y). */
function blade(
  g: Graphics,
  x: number,
  y: number,
  h: number,
  w: number,
  lean: number,
  color: number,
  line: number,
  alpha = 0.6,
): void {
  const tipX = x + lean * h;
  const tipY = y - h;
  g.moveTo(x - w / 2, y)
    .quadraticCurveTo(x - w * 0.4 + lean * h * 0.35, y - h * 0.6, tipX, tipY)
    .quadraticCurveTo(x + w * 0.4 + lean * h * 0.45, y - h * 0.5, x + w / 2, y)
    .closePath()
    .fill(color)
    .stroke(soft(line, alpha));
}

/**
 * The world backdrop, built once. Layers from back to front: sky and sun,
 * clouds, distant hills, big grass in the middle distance, then the near
 * layer (back props, the stump, and the ground) that entities stand on, and
 * a foreground of grass blades in front of everything. `update` scrolls each
 * layer at its own parallax speed.
 */
export class Background {
  readonly sky = new Container();
  readonly clouds = new Container();
  readonly hills = new Container();
  readonly mid = new Container();
  /** Behind entities, moving with the world. */
  readonly near = new Container();
  /** In front of entities. */
  readonly front = new Container();
  private readonly sunRays = new Graphics();
  private readonly sun = new Container();
  private readonly cloudSprites: Container[] = [];
  private readonly cloudBase: number[] = [];
  private cloudWidth = 0;
  private readonly worldPx: number;

  constructor(
    private readonly areas: readonly AreaDef[],
    private readonly terrain: Terrain,
    worldWidthM: number,
    renderer: Renderer | null = null,
  ) {
    this.worldPx = worldWidthM * PPM;
    const area = areas[0]!;
    const rng = new Rng(`background-${area.id}`);
    this.drawSky(area);
    this.drawClouds(rng);
    this.drawHills(rng);
    this.drawMid(rng);
    this.drawNear(rng);
    this.drawFront(rng);
    if (renderer) this.bakeAll(renderer);
  }

  /**
   * Render the static layers into textures once. They hold thousands of
   * shapes; drawing them as a few sprites per frame keeps software
   * renderers (CI, VMs) fast and costs real GPUs nothing.
   */
  private bakeAll(renderer: Renderer): void {
    const fine = Math.min(2, Math.max(1, renderer.resolution));
    const height = BOTTOM;
    this.bakeLayer(renderer, this.sky, [this.sky.children[0]!], VIEW_WIDTH_PX, height, 1);
    this.bakeLayer(
      renderer,
      this.hills,
      [...this.hills.children],
      this.span(PARALLAX.hills) + 200,
      height,
      1,
    );
    this.bakeLayer(renderer, this.mid, [...this.mid.children], this.span(PARALLAX.mid) + 300, height, 1);
    this.bakeLayer(renderer, this.near, [...this.near.children], this.worldPx, height, fine);
    this.bakeLayer(
      renderer,
      this.front,
      [...this.front.children],
      this.span(PARALLAX.front) + 200,
      height,
      fine,
    );
    this.cloudSprites.forEach((cloud, i) => {
      const b = cloud.getLocalBounds();
      const frame = new Rectangle(b.x - 4, b.y - 4, b.width + 8, b.height + 8);
      const tex = renderer.generateTexture({ target: cloud, frame, resolution: 1, antialias: true });
      const sprite = new Sprite(tex);
      const holder = new Container();
      sprite.position.set(frame.x, frame.y);
      holder.addChild(sprite);
      holder.position.copyFrom(cloud.position);
      this.clouds.addChildAt(holder, this.clouds.getChildIndex(cloud));
      this.clouds.removeChild(cloud);
      cloud.destroy();
      this.cloudSprites[i] = holder;
    });
  }

  private bakeLayer(
    renderer: Renderer,
    layer: Container,
    children: Container[],
    width: number,
    height: number,
    resolution: number,
  ): void {
    const CHUNK = 1024;
    const index = layer.getChildIndex(children[0]!);
    const holder = new Container();
    for (const c of children) holder.addChild(c);
    const out = new Container();
    for (let x = 0; x < width; x += CHUNK) {
      // Overlap neighbours a little so filtering never shows a seam.
      const w = Math.min(CHUNK + 4, width - x);
      const tex = renderer.generateTexture({
        target: holder,
        frame: new Rectangle(x, 0, w, height),
        resolution,
        antialias: true,
      });
      const sprite = new Sprite(tex);
      sprite.position.set(x, 0);
      out.addChild(sprite);
    }
    holder.destroy({ children: true });
    layer.addChildAt(out, Math.min(index, layer.children.length));
  }

  /** How wide a parallax layer must be to cover the whole world scroll. */
  private span(factor: number): number {
    return (this.worldPx - VIEW_WIDTH_PX) * factor + VIEW_WIDTH_PX;
  }

  private drawSky(area: AreaDef): void {
    const g = new Graphics();
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: area.skyTop },
        { offset: 0.75, color: area.skyBottom },
        { offset: 1, color: lighten(area.skyBottom, 0.3) },
      ],
      textureSpace: 'local',
    });
    g.rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(gradient);
    this.sky.addChild(g);

    // Sun, top right, with slowly turning rays.
    const glow = new Graphics();
    for (let i = 4; i >= 1; i--) glow.circle(0, 0, 70 + i * 26).fill({ color: 0xfff6c2, alpha: 0.12 });
    const rays = this.sunRays;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = a + 0.12;
      rays
        .poly([
          Math.cos(a - 0.12) * 96,
          Math.sin(a - 0.12) * 96,
          Math.cos(a) * 150,
          Math.sin(a) * 150,
          Math.cos(b) * 96,
          Math.sin(b) * 96,
        ])
        .fill({ color: 0xffe066, alpha: 0.85 })
        .stroke(soft(3, 0.35));
    }
    const disc = new Graphics().circle(0, 0, 82).fill(0xffd84d).stroke(stroke(5));
    disc.circle(-22, -24, 20).fill({ color: 0xffffff, alpha: 0.45 });
    // A sleepy smile: even the sun is a character.
    disc
      .moveTo(-30, 8)
      .quadraticCurveTo(-20, 0, -10, 8)
      .stroke(stroke(4))
      .moveTo(10, 8)
      .quadraticCurveTo(20, 0, 30, 8)
      .stroke(stroke(4))
      .moveTo(-14, 26)
      .quadraticCurveTo(0, 38, 14, 26)
      .stroke(stroke(4));
    disc
      .circle(-38, 24, 9)
      .fill({ color: 0xff9f6b, alpha: 0.6 })
      .circle(38, 24, 9)
      .fill({ color: 0xff9f6b, alpha: 0.6 });
    this.sun.addChild(glow, rays, disc);
    this.sun.position.set(VIEW_WIDTH_PX - 260, 170);
    this.sky.addChild(this.sun);
  }

  private drawClouds(rng: Rng): void {
    this.cloudWidth = this.span(PARALLAX.clouds) + 900;
    for (let x = 120; x < this.cloudWidth; x += rng.range(420, 760)) {
      const g = new Graphics();
      const y = rng.range(90, 330);
      const s = rng.range(0.7, 1.25);
      const puffs: [number, number, number][] = [
        [0, 0, 46 * s],
        [52 * s, -30 * s, 58 * s],
        [118 * s, -14 * s, 50 * s],
        [160 * s, 8 * s, 36 * s],
        [70 * s, 14 * s, 44 * s],
      ];
      blob(g, puffs, 0xffffff, 5, 0.35);
      // Shade the underside a touch.
      g.ellipse(80 * s, 30 * s, 110 * s, 14 * s).fill({ color: 0xd9ecf7, alpha: 0.9 });
      g.position.set(x, y);
      this.cloudBase.push(x);
      this.cloudSprites.push(g);
      this.clouds.addChild(g);
    }
  }

  private drawHills(rng: Rng): void {
    const g = new Graphics();
    const width = this.span(PARALLAX.hills) + 200;
    const base = 900;
    const ranges: [number, number, number, number][] = [
      // color, top height, wave, phase
      [0xb6e3c4, 250, 160, rng.range(0, 6)],
      [0x98d59a, 170, 120, rng.range(0, 6)],
    ];
    for (const [color, height, wave, phase] of ranges) {
      const pts: number[] = [-50, BOTTOM];
      for (let x = -50; x <= width; x += 40) {
        const y =
          base -
          height -
          Math.sin(x / 520 + phase) * wave * 0.55 -
          Math.sin(x / 210 + phase * 2) * wave * 0.2;
        pts.push(x, y);
      }
      pts.push(width, BOTTOM);
      g.poly(pts).fill(color).stroke(soft(3, 0.35));
    }
    // Tiny distant daisies and tufts.
    for (let x = 40; x < width; x += rng.range(60, 180)) {
      const y =
        base - 170 - Math.sin(x / 520 + ranges[1]![3]) * 66 - Math.sin(x / 210 + ranges[1]![3] * 2) * 24;
      const yy = y + rng.range(20, 120);
      if (rng.chance(0.5)) g.circle(x, yy, 4).fill(rng.pick([0xffffff, 0xffe066, 0xffb3c6]));
      else
        g.moveTo(x - 6, yy)
          .lineTo(x - 2, yy - 14)
          .lineTo(x + 1, yy)
          .lineTo(x + 5, yy - 10)
          .lineTo(x + 8, yy)
          .fill(0x7cc47a);
    }
    this.hills.addChild(g);
  }

  private drawMid(rng: Rng): void {
    const g = new Graphics();
    const width = this.span(PARALLAX.mid) + 300;
    const ground = 905;
    // A huge rusty watering can lying in the grass.
    const canX = width * 0.42;
    g.roundRect(canX - 260, ground - 250, 420, 250, 40)
      .fill(0x7fb3a8)
      .stroke(soft(4, 0.5));
    g.roundRect(canX - 260, ground - 250, 420, 50, 24).fill(0x9cc9bd);
    for (let i = 0; i < 5; i++)
      g.circle(canX - 200 + i * 80, ground - 120 + (i % 2) * 40, 18).fill({ color: 0xc27b4a, alpha: 0.55 });
    g.moveTo(canX + 160, ground - 180)
      .lineTo(canX + 360, ground - 320)
      .lineTo(canX + 390, ground - 290)
      .lineTo(canX + 160, ground - 120)
      .closePath()
      .fill(0x7fb3a8)
      .stroke(soft(4, 0.5));
    g.ellipse(canX + 380, ground - 308, 34, 46)
      .fill(0x6a9c91)
      .stroke(soft(4, 0.5));
    g.moveTo(canX - 250, ground - 220)
      .bezierCurveTo(canX - 380, ground - 250, canX - 380, ground - 60, canX - 250, ground - 60)
      .stroke({ width: 22, color: 0x6a9c91, cap: 'round' });

    // Tall blades, clover, and dandelions.
    for (let x = -40; x < width; x += rng.range(50, 130)) {
      const h = rng.range(140, 420);
      blade(
        g,
        x,
        ground + 10,
        h,
        rng.range(26, 44),
        rng.range(-0.25, 0.25),
        rng.pick([0x78c160, 0x6cb257, 0x86ca6a]),
        3,
        0.4,
      );
      if (rng.chance(0.18)) {
        const cx = x + rng.range(20, 60);
        const top = ground - rng.range(120, 260);
        g.moveTo(cx, ground)
          .quadraticCurveTo(cx - 12, (ground + top) / 2, cx, top)
          .stroke({ width: 7, color: 0x5ea24a, cap: 'round' });
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + (k - 1) * 2.1;
          blob(g, [[cx + Math.cos(a) * 26, top + Math.sin(a) * 26, 24]], 0x8fd16f, 3, 0.35);
        }
        g.circle(cx, top, 6).fill(0x5ea24a);
      }
      if (rng.chance(0.1)) {
        const cx = x + rng.range(10, 40);
        const top = ground - rng.range(260, 380);
        g.moveTo(cx, ground)
          .lineTo(cx + 8, top)
          .stroke({ width: 6, color: 0x5ea24a, cap: 'round' });
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          g.moveTo(cx + 8, top)
            .lineTo(cx + 8 + Math.cos(a) * 38, top + Math.sin(a) * 38)
            .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
          g.circle(cx + 8 + Math.cos(a) * 38, top + Math.sin(a) * 38, 4).fill(0xffffff);
        }
        g.circle(cx + 8, top, 9).fill(0xe8e2c8);
      }
    }
    this.mid.addChild(g);
  }

  /** The terrain surface as flat pixel pairs, with the stump flattened out. */
  private groundLine(flattenStump: boolean): number[] {
    const pts: number[] = [];
    for (const [x, y] of this.terrain.points) pts.push(x * PPM, (flattenStump ? Math.max(y, 8.9) : y) * PPM);
    return pts;
  }

  private drawNear(rng: Rng): void {
    const area = this.areas[0]!;
    const back = new Graphics();
    this.drawBackProps(back, rng);
    // Push the props back a little: softer and hazier than anything grabbable.
    back.tint = 0xe2ecdf;
    back.alpha = 0.92;
    this.near.addChild(back);

    // Soil.
    const soil = new Graphics();
    const line = this.groundLine(true);
    const dirt = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: area.dirt },
        { offset: 1, color: area.dirtDark },
      ],
      textureSpace: 'local',
    });
    soil.poly([...line, this.worldPx, BOTTOM, 0, BOTTOM]).fill(dirt);
    // Strata, buried pebbles, and roots.
    for (let i = 0; i < 3; i++) {
      const y0 = 960 + i * 38;
      soil.moveTo(0, y0);
      for (let x = 0; x <= this.worldPx; x += 60) soil.lineTo(x, y0 + Math.sin(x / 140 + i * 2) * 8);
      soil.stroke({ width: 3, color: darken(area.dirt, 0.25), alpha: 0.35 });
    }
    for (let x = 30; x < this.worldPx; x += rng.range(40, 120)) {
      const y = rng.range(950, 1070);
      const r = rng.range(6, 16);
      const tint = rng.pick([0xc9b8a6, 0xb5a79c, 0xd6c3a5, 0x9e8a7a]);
      soil
        .ellipse(x, y, r * 1.3, r)
        .fill(tint)
        .stroke(soft(2.5, 0.5));
      soil.ellipse(x - r * 0.3, y - r * 0.35, r * 0.5, r * 0.25).fill({ color: 0xffffff, alpha: 0.35 });
      if (rng.chance(0.5))
        soil
          .circle(x + rng.range(-40, 40), y + rng.range(-20, 20), 3)
          .fill({ color: darken(area.dirt, 0.4), alpha: 0.5 });
    }
    for (let x = 200; x < this.worldPx; x += rng.range(500, 900)) {
      const y = rng.range(960, 1000);
      soil
        .moveTo(x, y)
        .bezierCurveTo(x + 40, y + 30, x + 70, y - 10, x + 120, y + 25)
        .stroke({ width: 5, color: darken(area.dirt, 0.3), alpha: 0.5, cap: 'round' });
    }
    this.near.addChild(soil);

    this.near.addChild(this.drawStump(area));

    // Moss on top of the ground, with a scalloped lower edge and a bold outline.
    const moss = new Graphics();
    const top = this.groundLine(true);
    // Scallops.
    const scallop: number[] = [];
    for (let x = this.worldPx; x >= 0; x -= 28) {
      const y = this.terrain.surfaceY(Math.min(x / PPM, 38.39)) * PPM;
      const flat = Math.max(y, 890);
      scallop.push(x, flat + 30 + (Math.round(x / 28) % 2 === 0 ? 10 : 0));
    }
    moss.poly([...top, ...scallop]).fill(area.ground);
    moss
      .poly([
        ...top.map((v, i) => (i % 2 === 1 ? v + 12 : v)),
        ...scallop.map((v, i) => (i % 2 === 1 ? v - 4 : v)),
      ])
      .fill({
        color: area.groundDark,
        alpha: 0.35,
      });
    const surface = this.groundLine(false);
    moss.moveTo(surface[0]!, surface[1]!);
    for (let i = 2; i < surface.length; i += 2) moss.lineTo(surface[i]!, surface[i + 1]!);
    moss.stroke(stroke(6));
    this.near.addChild(moss);

    // Grass tufts and tiny flowers along the ground, behind the bugs.
    const tufts = new Graphics();
    for (let x = 10; x < this.worldPx; x += rng.range(34, 110)) {
      const y = this.terrain.surfaceY(x / PPM) * PPM;
      if (y < 880) continue; // not on the stump
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++)
        blade(
          tufts,
          x + k * 9,
          y + 4,
          rng.range(20, 46),
          12,
          rng.range(-0.4, 0.4),
          rng.pick([0x5aa845, 0x4e9a3a, 0x68b84f]),
          2.5,
          0.55,
        );
      if (rng.chance(0.12)) {
        const fx = x + 14;
        const fy = y - rng.range(34, 60);
        tufts.moveTo(fx, y).lineTo(fx, fy).stroke({ width: 4, color: 0x4e9a3a, cap: 'round' });
        const color = rng.pick([0xffffff, 0xffd23f, 0xff8fab, 0xb388ff]);
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          tufts
            .circle(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8, 6.5)
            .fill(color)
            .stroke(soft(2, 0.6));
        }
        tufts.circle(fx, fy, 5).fill(0xffb703);
      }
    }
    this.near.addChild(tufts);
  }

  /** Props standing behind the walk line: weather vane, ant hill, sundial, mushrooms, signpost. */
  private drawBackProps(g: Graphics, rng: Rng): void {
    const gy = 905;
    // Weather vane: a bent spoon rooster on a twig pole.
    {
      const x = 90;
      g.moveTo(x, gy)
        .lineTo(x, gy - 330)
        .stroke({ width: 14, color: 0x8b6a45, cap: 'round' });
      g.moveTo(x, gy)
        .lineTo(x, gy - 330)
        .stroke(soft(3, 0.5));
      g.ellipse(x + 10, gy - 350, 46, 20)
        .fill(0xc9d4e0)
        .stroke(soft(3, 0.6));
      g.ellipse(x - 40, gy - 362, 16, 22)
        .fill(0xc9d4e0)
        .stroke(soft(3, 0.6));
      g.poly([x - 44, gy - 384, x - 36, gy - 400, x - 28, gy - 384]).fill(0xe8453c);
      g.circle(x - 42, gy - 366, 3).fill(OUTLINE);
    }
    // Ant hill: a soft brown mound with a dark doorway and a line of ants.
    {
      const x = 290;
      g.moveTo(x - 190, gy + 4)
        .bezierCurveTo(x - 110, gy - 40, x - 60, gy - 175, x, gy - 175)
        .bezierCurveTo(x + 60, gy - 175, x + 110, gy - 40, x + 190, gy + 4)
        .closePath()
        .fill(0xc49464)
        .stroke(soft(4, 0.6));
      for (let i = 0; i < 26; i++)
        g.circle(
          x + rng.range(-120, 120),
          gy - rng.range(10, 140) * (1 - Math.abs(rng.range(-0.7, 0.7))),
          rng.range(2, 4),
        ).fill({ color: 0x8a6440, alpha: 0.6 });
      g.ellipse(x, gy - 150, 26, 18).fill(OUTLINE);
      for (let i = 0; i < 7; i++) {
        const ax = x + 60 + i * 34;
        const ay = gy - 60 + i * 9;
        g.circle(ax, ay, 5)
          .fill(OUTLINE)
          .circle(ax + 7, ay, 4)
          .fill(OUTLINE);
      }
    }
    // Sundial: a stone disc with a stick gnomon.
    {
      const x = 920;
      g.roundRect(x - 26, gy - 110, 52, 110, 8)
        .fill(0xb8b1c7)
        .stroke(soft(3, 0.6));
      g.ellipse(x, gy - 112, 92, 26)
        .fill(0xd4cedf)
        .stroke(soft(3, 0.6));
      g.poly([x - 4, gy - 116, x + 30, gy - 175, x + 34, gy - 116])
        .fill(0x8b6a45)
        .stroke(soft(3, 0.6));
      g.circle(x - 50, gy - 112, 9).fill(0xffd23f);
      g.circle(x + 58, gy - 112, 8).fill(0x6b7bd6);
    }
    // Mushroom ring behind the toy pile.
    const mushrooms: [number, number, number][] = [
      [2780, 120, 70],
      [2930, 190, 100],
      [3080, 95, 58],
      [3220, 150, 84],
      [3360, 110, 64],
    ];
    for (const [x, h, r] of mushrooms) {
      g.roundRect(x - r * 0.28, gy - h, r * 0.56, h + 4, r * 0.2)
        .fill(0xfff1dc)
        .stroke(soft(3, 0.6));
      g.moveTo(x - r, gy - h + 6)
        .bezierCurveTo(x - r, gy - h - r * 0.95, x + r, gy - h - r * 0.95, x + r, gy - h + 6)
        .closePath()
        .fill(0xe8453c)
        .stroke(soft(3.5, 0.6));
      for (const [dx, dy, s] of [
        [-0.5, -0.35, 0.16],
        [0.1, -0.6, 0.2],
        [0.55, -0.25, 0.13],
        [-0.1, -0.2, 0.1],
      ] as const)
        g.circle(x + dx * r, gy - h + dy * r, s * r).fill(0xffffff);
    }
    // Bottle-cap signpost with arrow pictograms.
    {
      const x = 3740;
      g.moveTo(x, gy)
        .lineTo(x - 10, gy - 280)
        .stroke({ width: 12, color: 0x8b6a45, cap: 'round' });
      g.circle(x - 10, gy - 290, 50)
        .fill(0xff9f1c)
        .stroke(soft(4, 0.6));
      g.circle(x - 10, gy - 290, 38).fill(0xffc45e);
      g.poly([
        x - 34,
        gy - 298,
        x + 6,
        gy - 298,
        x + 6,
        gy - 312,
        x + 24,
        gy - 290,
        x + 6,
        gy - 268,
        x + 6,
        gy - 282,
        x - 34,
        gy - 282,
      ]).fill(OUTLINE);
      g.poly([x - 60, gy - 200, x - 20, gy - 214, x - 20, gy - 190])
        .fill(0x4d9bff)
        .stroke(soft(3, 0.6));
    }
  }

  private drawStump(area: AreaDef): Graphics {
    void area;
    const g = new Graphics();
    const pts = this.terrain.points.filter(([x, y]) => y < 8.99 || (x > 11 && x < 28));
    const stumpPts = pts.filter(([x]) => x >= 11.8 && x <= 27.2);
    if (stumpPts.length < 3) return g;
    const bark = 0xa8744f;
    const barkDark = 0x7a4e32;
    const poly: number[] = [];
    for (const [x, y] of stumpPts) poly.push(x * PPM, y * PPM);
    const x0 = stumpPts[0]![0] * PPM;
    const x1 = stumpPts[stumpPts.length - 1]![0] * PPM;
    poly.push(x1, 930, x0, 930);
    const barkGrad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: darken(bark, 0.1) },
        { offset: 0.35, color: lighten(bark, 0.08) },
        { offset: 1, color: darken(bark, 0.18) },
      ],
      textureSpace: 'local',
    });
    g.poly(poly).fill(barkGrad);

    // Bark grooves that follow the flare of the roots.
    const top = 4 * PPM;
    const left = 16.1 * PPM;
    const right = 22.9 * PPM;
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const x = left + (right - left) * t;
      const spread = (t - 0.5) * 2;
      g.moveTo(x, top + 40)
        .bezierCurveTo(x, top + 250, x + spread * 120, 800, x + spread * 330, 905)
        .stroke({ width: 5, color: barkDark, alpha: 0.55, cap: 'round' });
    }
    // Roots bulging down each flare and into the soil.
    for (const side of [-1, 1]) {
      const rimX = side < 0 ? left : right;
      for (const [off, reach, w] of [
        [40, 330, 30],
        [150, 240, 22],
      ] as const) {
        const sx = rimX - side * off;
        const ex = rimX + side * reach;
        g.moveTo(sx, top + 70)
          .bezierCurveTo(sx + side * 30, 640, ex - side * 80, 860, ex, 935)
          .stroke({ width: w + 8, color: OUTLINE, alpha: 0.5, cap: 'round' })
          .moveTo(sx, top + 70)
          .bezierCurveTo(sx + side * 30, 640, ex - side * 80, 860, ex, 935)
          .stroke({ width: w, color: lighten(bark, 0.12), cap: 'round' });
      }
    }
    // A knothole, dark and mysterious.
    const kx = 19.9 * PPM;
    const ky = 6.9 * PPM;
    g.ellipse(kx, ky, 64, 84).fill(darken(bark, 0.25)).stroke(soft(4, 0.7));
    g.ellipse(kx + 4, ky + 6, 42, 60).fill(0x2b1d2e);
    g.ellipse(kx - 18, ky - 40, 18, 8).fill({ color: lighten(bark, 0.3), alpha: 0.6 });

    // Outline along the stump's sides.
    g.moveTo(stumpPts[0]![0] * PPM, stumpPts[0]![1] * PPM);
    for (const [x, y] of stumpPts) g.lineTo(x * PPM, y * PPM);
    g.stroke(stroke(6));

    // The cut top: an ellipse of pale wood with growth rings, seen from just above.
    const cx = (left + right) / 2;
    const rx = (right - left) / 2 + 8;
    const ry = 44;
    g.ellipse(cx, top, rx, ry).fill(0xe8c08e).stroke(stroke(6));
    for (let k = 1; k <= 5; k++)
      g.ellipse(cx + k * 3, top + 2, rx * (1 - k * 0.16), ry * (1 - k * 0.16)).stroke({
        width: 3,
        color: 0xc9955f,
        alpha: 0.8,
      });
    g.moveTo(cx - rx * 0.2, top - 6)
      .lineTo(cx - rx * 0.05, top + 18)
      .lineTo(cx + rx * 0.05, top + 6)
      .stroke({ width: 3, color: 0xa87444, cap: 'round' });
    // Moss dripping over the rim.
    for (let k = 0; k < 9; k++) {
      const mx = left + 30 + k * ((right - left - 60) / 8);
      if (k % 3 === 1) continue;
      const w = 34 + (k % 2) * 18;
      g.moveTo(mx - w, top + 30)
        .quadraticCurveTo(mx - w * 0.6, top + 62 + (k % 2) * 16, mx, top + 58)
        .quadraticCurveTo(mx + w * 0.6, top + 64, mx + w, top + 30)
        .closePath()
        .fill(0x6fbf4a)
        .stroke(soft(3, 0.55));
    }
    return g;
  }

  private drawFront(rng: Rng): void {
    const g = new Graphics();
    const width = this.span(PARALLAX.front) + 200;
    for (let x = rng.range(0, 200); x < width; x += rng.range(260, 620)) {
      const n = rng.int(3, 6);
      for (let k = 0; k < n; k++) {
        const h = rng.range(90, 190);
        blade(
          g,
          x + k * 22,
          VIEW_HEIGHT_PX + 30,
          h,
          rng.range(26, 38),
          rng.range(-0.3, 0.3),
          mix(0x3f8a35, 0x2e6b28, rng.next()),
          4,
          0.7,
        );
      }
      if (rng.chance(0.3)) {
        const px = x + rng.range(-60, 60);
        g.ellipse(px, VIEW_HEIGHT_PX - 18, 46, 28)
          .fill(0x8f8aa0)
          .stroke(stroke(4));
        g.ellipse(px - 12, VIEW_HEIGHT_PX - 30, 18, 8).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
    this.front.addChild(g);
  }

  update(camera: Camera, time: number): void {
    const px = camera.x * camera.ppm;
    this.sun.x = VIEW_WIDTH_PX - 260 - px * PARALLAX.sun;
    this.sunRays.rotation = time * 0.05;
    this.clouds.x = -px * PARALLAX.clouds;
    // Clouds drift left and wrap around one at a time.
    const w = this.cloudWidth;
    this.cloudSprites.forEach((c, i) => {
      c.x = ((((this.cloudBase[i]! - time * 7 + 400) % w) + w) % w) - 400;
    });
    this.hills.x = -px * PARALLAX.hills;
    this.mid.x = -px * PARALLAX.mid;
    this.near.x = -px;
    this.front.x = -px * PARALLAX.front;
  }
}
