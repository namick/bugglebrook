import { Container, Graphics } from 'pixi.js';
import { Rng } from '../../../game/core/rng';
import { GROUND_Y, PIXELS_PER_METER, VIEW_HEIGHT_PX } from '../../../game/constants';
import type { AreaDef } from '../../../game/data/types';
import type { Camera } from './camera';
import { OUTLINE, stroke } from './palette';

const lerpColor = (a: number, b: number, t: number): number => {
  const ch = (c: number, s: number): number => (c >> s) & 0xff;
  const mix = (s: number): number => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
};

/**
 * The world backdrop: sky, parallax clouds and hills, ground, and simple
 * area dressing. Built once; `update` only moves layers for parallax.
 */
export class Background {
  readonly sky = new Container();
  readonly far = new Container();
  readonly mid = new Container();
  readonly near = new Container();

  constructor(areas: readonly AreaDef[], worldWidthM: number) {
    const ppm = PIXELS_PER_METER;
    const rng = new Rng('background');
    const groundPx = GROUND_Y * ppm;

    // Sky in world space so each area has its own colors.
    const sky = new Graphics();
    const bands = 10;
    for (const area of areas) {
      const x0 = area.xStart * ppm;
      const w = (area.xEnd - area.xStart) * ppm;
      for (let i = 0; i < bands; i++) {
        const h = groundPx / bands;
        sky.rect(x0, i * h, w + 1, h + 1).fill(lerpColor(area.skyTop, area.skyBottom, i / (bands - 1)));
      }
    }
    this.sky.addChild(sky);

    // Clouds drift at 30% speed.
    const clouds = new Graphics();
    clouds.circle(620, 190, 80).fill(0xffe066).stroke(stroke());
    for (let x = 200; x < worldWidthM * ppm * 0.5 + 2000; x += rng.range(500, 900)) {
      const y = rng.range(80, 320);
      const s = rng.range(0.7, 1.3);
      clouds
        .circle(x, y, 50 * s)
        .circle(x + 55 * s, y - 20 * s, 60 * s)
        .circle(x + 115 * s, y, 45 * s);
      clouds.rect(x, y, 115 * s, 45 * s);
      clouds.fill(0xffffff);
    }
    this.far.addChild(clouds);

    // Hills at 60% speed.
    const hills = new Graphics();
    for (let x = -200; x < worldWidthM * ppm * 0.6 + 2400; x += rng.range(420, 700)) {
      const r = rng.range(260, 420);
      hills
        .circle(x, groundPx + r * 0.45, r)
        .fill(0x9ee07a)
        .stroke({ ...stroke(), alpha: 0.35 });
    }
    this.mid.addChild(hills);

    // Ground with a wavy grass edge.
    const ground = new Graphics();
    for (const area of areas) {
      const x0 = area.xStart * ppm;
      const w = (area.xEnd - area.xStart) * ppm;
      ground.rect(x0, groundPx, w + 1, VIEW_HEIGHT_PX - groundPx).fill(area.ground);
      ground.rect(x0, groundPx + 70, w + 1, VIEW_HEIGHT_PX - groundPx).fill(area.groundDark);
    }
    ground
      .moveTo(0, groundPx)
      .lineTo(worldWidthM * ppm, groundPx)
      .stroke(stroke());
    for (let x = 30; x < worldWidthM * ppm; x += rng.range(60, 160)) {
      const h = rng.range(14, 28);
      ground
        .moveTo(x - 8, groundPx + 2)
        .lineTo(x - 2, groundPx - h)
        .lineTo(x + 3, groundPx + 2)
        .lineTo(x + 9, groundPx - h * 0.7)
        .lineTo(x + 14, groundPx + 2)
        .fill(0x4caf3a)
        .stroke({ width: 3, color: OUTLINE, join: 'round' });
    }
    for (const area of areas) {
      if (area.id === 'pond') {
        const cx = ((area.xStart + area.xEnd) / 2) * ppm;
        ground
          .ellipse(cx, groundPx + 60, 520, 40)
          .fill(0x4cc9f0)
          .stroke(stroke());
        ground.ellipse(cx - 120, groundPx + 50, 120, 10).fill({ color: 0xffffff, alpha: 0.5 });
      }
      // A few flowers per area.
      for (let i = 0; i < 6; i++) {
        const fx = rng.range(area.xStart + 0.5, area.xEnd - 0.5) * ppm;
        const color = rng.pick([0xff5d8f, 0xffd23f, 0xb388ff, 0xffffff]);
        ground
          .moveTo(fx, groundPx)
          .lineTo(fx, groundPx - 55)
          .stroke({ width: 5, color: 0x2e7d32 });
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ground
            .circle(fx + Math.cos(a) * 12, groundPx - 55 + Math.sin(a) * 12, 10)
            .fill(color)
            .stroke(stroke(3));
        }
        ground
          .circle(fx, groundPx - 55, 8)
          .fill(0xffb703)
          .stroke(stroke(3));
      }
    }
    this.near.addChild(ground);
  }

  update(camera: Camera): void {
    const px = camera.x * camera.ppm;
    this.sky.x = -px;
    this.far.x = -px * 0.3;
    this.mid.x = -px * 0.6;
    this.near.x = -px;
  }
}
