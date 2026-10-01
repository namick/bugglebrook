import { FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_HEIGHT_PX } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import type { Barrier } from '../../../../game/systems/barriers';
import type { Particles } from '../particles';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { soft } from './common';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;

/** How far the sunflower has stood up, from 0 (drooping) to 1, `t` seconds after it drank: with an overshoot. */
export function standUp(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1.6) return 1;
  const u = t / 1.6;
  return 1 - Math.cos(u * Math.PI * 2.5) * Math.exp(-u * 4.5) * (1 - u);
}

/**
 * The droopy sunflower on the pond's bank, the barrier to the flowerbed:
 * head hanging across the path over cracked, thirsty soil, a dry-droplet
 * pictogram over it now and then. Wet soil and it slurps, stretches up
 * with a wobble, and stands tall for good.
 */
export class SunflowerLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly x: number;
  private readonly soilR: number;
  private since = -1;
  private hint = 2;

  constructor(private readonly barrier: Barrier) {
    super(barrier.x * PPM - 400, barrier.x * PPM + 200);
    this.x = barrier.x * PPM;
    this.soilR = barrier.radius * PPM;
    this.back.addChild(this.g);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    return [
      sim.events.on('sunflower_drank', (e) => {
        this.since = 0;
        particles.splash(e.x * PPM, e.y * PPM, 3, 0.3);
        particles.sparkles(e.x * PPM - 120, e.y * PPM - 420, 16);
      }),
      sim.events.on('hideout_stirred', (e) => {
        if (e.fixture === this.barrier.id) this.hint = 0;
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const open = !f.sim.barriers.closed(this.barrier);
    if (open && this.since < 0) this.since = 10;
    if (this.since >= 0) this.since += f.dt;
    if (!this.shows(f)) return;
    const k = open ? standUp(this.since) : 0;
    const x = this.x;
    const ground = f.sim.surfaceY(this.barrier.x) * PPM;
    const sway = Math.sin(f.time * 1.1) * 4 + f.sim.environment.state.wind * 8;
    // The soil patch: cracked and pale while thirsty, dark and damp once it drank.
    const wet = k > 0;
    g.ellipse(x, ground + 4, this.soilR, 16)
      .fill(wet ? 0x5a3b2b : 0xb8946a)
      .stroke(soft(2.5, 0.6));
    if (!wet)
      for (const [a, b] of [
        [-0.6, -0.1],
        [-0.1, 0.3],
        [0.2, 0.7],
      ] as const)
        g.moveTo(x + a * this.soilR, ground + 2)
          .lineTo(x + ((a + b) / 2) * this.soilR, ground + 10)
          .lineTo(x + b * this.soilR, ground + 4)
          .stroke({ width: 2.5, color: 0x7a5a3a });
    // Stalk: bent over toward the flowerbed while drooping, straight once it stands.
    const height = 470 + k * 60;
    const top = { x: x - 40 * (1 - k) + sway, y: ground - height };
    const head = {
      x: top.x - 170 * (1 - k),
      y: top.y + 190 * (1 - k),
    };
    g.moveTo(x, ground)
      .bezierCurveTo(
        x + 10,
        ground - height * 0.5,
        top.x + 20 * (1 - k),
        top.y + 40,
        head.x + 40 * (1 - k),
        head.y - 10 * (1 - k),
      )
      .stroke({ width: 18, color: 0x5ea24a, cap: 'round' });
    g.moveTo(x, ground)
      .bezierCurveTo(
        x + 10,
        ground - height * 0.5,
        top.x + 20 * (1 - k),
        top.y + 40,
        head.x + 40 * (1 - k),
        head.y - 10 * (1 - k),
      )
      .stroke(soft(3, 0.5));
    // Leaves, limp or perky.
    for (const [t, side] of [
      [0.3, -1],
      [0.5, 1],
    ] as const) {
      const lx = x + 6;
      const ly = ground - height * t;
      const droop = (1 - k) * 0.7;
      g.moveTo(lx, ly)
        .quadraticCurveTo(lx + side * 50, ly - 30 + droop * 40, lx + side * 90, ly + droop * 60)
        .quadraticCurveTo(lx + side * 50, ly + 10 + droop * 30, lx, ly)
        .fill(0x6fbf4a)
        .stroke(soft(2.5, 0.55));
    }
    // The head: petals limp and pointing down when thirsty, a sunny face once it stands.
    const r = 70;
    const tilt = (1 - k) * 1.1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const len = r * (0.95 + (i % 2) * 0.15) * (0.75 + 0.25 * k);
      const limp = (1 - k) * 0.6;
      const px = head.x + Math.cos(a) * (r * 0.55);
      const py = head.y + Math.sin(a) * (r * 0.55);
      const ex = head.x + Math.cos(a) * len;
      const ey = head.y + Math.sin(a) * len + limp * 40;
      g.moveTo(px, py)
        .quadraticCurveTo((px + ex) / 2 + 8, (py + ey) / 2, ex, ey)
        .stroke({
          width: 22,
          color: 0xffd23f,
          cap: 'round',
        });
    }
    g.circle(head.x, head.y, r * 0.6)
      .fill(0x8a5a2b)
      .stroke(stroke(5));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const d = Math.sqrt(i / 14) * r * 0.5;
      g.circle(head.x + Math.cos(a) * d, head.y + Math.sin(a) * d, 3).fill(0x5a3b2b);
    }
    // Face.
    const fx = head.x;
    const fy = head.y + tilt * 6;
    if (k < 0.5) {
      // Thirsty: droopy eyes and a wobbly frown.
      g.moveTo(fx - 22, fy - 6)
        .quadraticCurveTo(fx - 14, fy - 2, fx - 6, fy - 6)
        .stroke(stroke(4));
      g.moveTo(fx + 6, fy - 6)
        .quadraticCurveTo(fx + 14, fy - 2, fx + 22, fy - 6)
        .stroke(stroke(4));
      g.moveTo(fx - 12, fy + 18)
        .quadraticCurveTo(fx, fy + 10, fx + 12, fy + 18)
        .stroke(stroke(4));
    } else {
      for (const dx of [-14, 14]) {
        g.circle(fx + dx, fy - 6, 7)
          .fill(0xffffff)
          .stroke(stroke(3));
        g.circle(fx + dx + 2, fy - 5, 3.5).fill(OUTLINE);
      }
      g.moveTo(fx - 16, fy + 12)
        .quadraticCurveTo(fx, fy + 26, fx + 16, fy + 12)
        .stroke(stroke(4));
      g.circle(fx - 26, fy + 8, 6).fill({ color: 0xff8fab, alpha: 0.7 });
      g.circle(fx + 26, fy + 8, 6).fill({ color: 0xff8fab, alpha: 0.7 });
    }
    // A dry-droplet pictogram floats over the soil now and then: water me.
    if (!open) {
      this.hint += f.dt;
      const t = this.hint % 4;
      if (t < 1.6) {
        const a = Math.sin((t / 1.6) * Math.PI);
        const bx = x + 10;
        const by = ground - 60 - t * 20;
        g.circle(bx, by, 26)
          .fill({ color: 0xffffff, alpha: 0.9 * a })
          .stroke({ width: 3, color: OUTLINE, alpha: 0.6 * a });
        g.moveTo(bx, by - 15)
          .quadraticCurveTo(bx + 11, by + 2, bx, by + 12)
          .quadraticCurveTo(bx - 11, by + 2, bx, by - 15)
          .fill({ color: 0x9fd8ff, alpha: a })
          .stroke({ width: 2.5, color: OUTLINE, alpha: a });
        g.moveTo(bx + 10, by - 12)
          .lineTo(bx + 20, by - 22)
          .moveTo(bx + 20, by - 12)
          .lineTo(bx + 10, by - 22)
          .stroke({
            width: 3,
            color: 0xe8453c,
            alpha: a,
          });
      }
    }
  }
}

/**
 * The old tin can wall between the porch and the compost lab, with a tunnel
 * at the bottom just one rolled-up pill bug wide. A latch glints through it.
 * Once a ball bumps the latch, the wall stands swung open like a door.
 */
export class CanWallLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly wx0: number;
  private readonly wx1: number;
  private clink = 0;
  private swing = -1;

  constructor(
    private readonly barrier: Barrier,
    porch: AreaDef,
  ) {
    const wall = porch.solids?.find((s) => s.until === barrier.opens)?.box ?? [30.5, 2.5, 31.3, 9];
    const a = (porch.xStart + wall[0]) * PPM;
    const b = (porch.xStart + wall[2]) * PPM;
    super(a - 200, b + 300);
    this.wx0 = a;
    this.wx1 = b;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    return [
      sim.events.on('tunnel_rolled', (e) => {
        if (e.fits) return;
        this.clink = 0.8;
        particles.sparkles(e.x * PPM, e.y * PPM, 3);
      }),
      sim.events.on('area_unlocked', (e) => {
        if (e.areaId !== this.barrier.opens) return;
        this.swing = 0;
        particles.dust(this.wx0, 880, 6);
        particles.stars(this.wx0 + 40, 820);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    this.clink = Math.max(0, this.clink - f.dt);
    const open = !f.sim.barriers.closed(this.barrier);
    if (open && this.swing < 0) this.swing = 2;
    if (this.swing >= 0) this.swing += f.dt;
    if (!this.shows(f)) return;
    const top = 250;
    const bottom = 905;
    const w = this.wx1 - this.wx0;
    const labels = [0x2ec4b6, 0xe8453c, 0xffd23f, 0x4d7cff, 0x9b6bd6, 0xff8a5c];
    if (!open) {
      // A wall of cans, stacked in rows, with a tunnel at the bottom.
      for (let y = bottom, row = 0; y > top; y -= 68, row++) {
        const h = Math.min(68, y - top);
        g.roundRect(this.wx0 - 6, y - h, w + 12, h, 8)
          .fill(0xc7d3e3)
          .stroke(stroke(4));
        g.rect(this.wx0 - 6, y - h + h * 0.25, w + 12, h * 0.5).fill(labels[row % labels.length]!);
        for (let k = 1; k < 4; k++)
          g.moveTo(this.wx0 - 6, y - h + (h * k) / 4)
            .lineTo(this.wx1 + 6, y - h + (h * k) / 4)
            .stroke({
              width: 1.5,
              color: 0x8e9bb0,
              alpha: 0.5,
            });
        g.rect(this.wx0, y - h + 6, 8, h - 12).fill({ color: 0xffffff, alpha: 0.45 });
      }
      // The tunnel mouth: dark, round-topped, a pill bug wide; the latch glints inside.
      const th = 106;
      const tw = 112;
      const tx = this.wx0 - 8;
      g.moveTo(tx - tw / 2, bottom)
        .lineTo(tx - tw / 2, bottom - th + tw / 2)
        .arc(tx, bottom - th + tw / 2, tw / 2, Math.PI, 0)
        .lineTo(tx + tw / 2, bottom)
        .closePath()
        .fill(0x1c1626)
        .stroke(stroke(4));
      const glint = 0.5 + 0.5 * Math.sin(f.time * 2.2);
      g.moveTo(tx + 6, bottom - 70)
        .lineTo(tx + 6, bottom - 40)
        .lineTo(tx - 10, bottom - 34)
        .stroke({
          width: 5,
          color: 0xb8c4d6,
          alpha: 0.5 + glint * 0.4 + this.clink * 0.5,
          cap: 'round',
        });
      g.circle(tx + 6, bottom - 72, 4).fill({ color: 0xffffff, alpha: glint * 0.7 + this.clink });
      // Scratches in the dark (something is busy on the other side).
      return;
    }
    // Swung open like a door: the can wall seen edge-on against the porch's side, the way through dark and clear.
    const t = Math.min(1, this.swing / 0.8);
    const edge = this.wx1 - w * (1 - t) * 0.0;
    const panel = w * (1 - t) + 26 * t;
    const grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: 0x8e9bb0 },
        { offset: 1, color: 0xc7d3e3 },
      ],
      textureSpace: 'local',
    });
    fg.rect(edge, top, panel, bottom - top)
      .fill(grad)
      .stroke(stroke(4));
    for (let y = bottom; y > top; y -= 68)
      fg.rect(edge, y - 44, panel, 20).fill({ color: labels[((y / 68) % 6) | 0]!, alpha: 0.8 });
    fg.circle(edge + panel / 2, bottom - 90, 7)
      .fill(0x9aa3b5)
      .stroke(soft(2, 0.7));
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f) || f.sim.barriers.closed(this.barrier)) return;
    // Daylight from the compost lab spills in through the open wall.
    if (f.look.dapple > 0.05) light(this.wx0 + 40, 700, 220, 0xfff1c9, f.look.dapple * 0.3, 0.6, 1.4);
  }
}

/**
 * Locked areas, seen past their barrier: a dim, hushed preview (about 40
 * percent brightness), fading in from the barrier, with a few hints that
 * something is there (lights, eyes, steam).
 */
export class LockView extends AreaLive {
  private readonly g = new Graphics();

  constructor(private readonly areas: readonly AreaDef[]) {
    super(0, Math.max(...areas.map((a) => a.xEnd)) * PPM);
    this.front.addChild(this.g);
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const barriers = f.sim.barriers;
    for (const b of barriers.barriers()) {
      if (!barriers.closed(b)) continue;
      const area = this.areas.find((a) => a.id === b.opens);
      if (!area) continue;
      const wall = b.wall * PPM;
      // The locked side of the wall, out to the world's end on that side.
      const left = wall < (area.xStart + area.xEnd) * 0.5 * PPM;
      const a = left ? wall : 0;
      const z = left ? Math.max(...this.areas.map((q) => q.xEnd)) * PPM : wall;
      // A soft edge at the barrier, so the preview fades in over 140 px; full dimness after.
      const EDGE = 140;
      const STEPS = 7;
      const shade = (sx0: number, sx1: number, alpha: number): void => {
        const c0 = Math.max(sx0, f.left - 50);
        const c1 = Math.min(sx1, f.right + 50);
        if (c1 > c0) g.rect(c0, -20, c1 - c0, VIEW_HEIGHT_PX + 60).fill({ color: 0x2a2840, alpha });
      };
      for (let k = 0; k < STEPS; k++) {
        const e0 = left ? wall + (k * EDGE) / STEPS : wall - ((k + 1) * EDGE) / STEPS;
        shade(e0, e0 + EDGE / STEPS, (0.6 * (k + 1)) / (STEPS + 1));
      }
      if (left) shade(wall + EDGE, z, 0.6);
      else shade(a, wall - EDGE, 0.6);
    }
  }

  override lights(f: AreaFrame, light: LightFn): void {
    const barriers = f.sim.barriers;
    for (const b of barriers.barriers()) {
      if (!barriers.closed(b)) continue;
      const area = this.areas.find((a) => a.id === b.opens);
      if (!area) continue;
      const mid = ((area.xStart + area.xEnd) / 2) * PPM;
      if (Math.abs(mid - (f.left + f.right) / 2) > 3000) continue;
      // Hints of what lies beyond: a pulse of light, colored by the place.
      const pulse = 0.5 + 0.5 * Math.sin(f.time * 1.3 + b.wall);
      const color =
        area.mood === 'garden'
          ? 0xff9fd0
          : area.mood === 'porch'
            ? 0xffe3a3
            : area.mood === 'compost'
              ? 0xb6ff3b
              : 0x4fb6ff;
      const near = (left: boolean): number => (left ? b.wall * PPM + 260 : b.wall * PPM - 260);
      light(near(b.wall * PPM < mid), 520, 200, color, 0.18 * pulse);
    }
    void darken;
    void lighten;
  }
}
