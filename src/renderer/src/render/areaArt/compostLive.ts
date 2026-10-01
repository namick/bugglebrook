import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { BUCKET_W, BUCKET_WALL } from '../../../../game/systems/barriers';
import type { Particles } from '../particles';
import { OUTLINE, darken, stroke } from '../palette';
import { soft } from './common';
import { COMPOST, JAR_COLORS } from './compost';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;

interface Puff {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  vx: number;
}

/** Rotten things fruit flies like to orbit. */
const ROTTEN: ReadonlySet<string> = new Set([
  'item_rotten_banana_bit',
  'item_compost_goo',
  'item_apple_core',
  'item_dung_ball',
]);

/**
 * The compost lab, alive: steam rising off the heap (harder in the rain,
 * sideways in the wind), worms poking out of the warm heap, fruit flies
 * round anything rotten, mold puffs, potion jars glowing at night, and the
 * bucket lift with its rope, its two buckets, and the heavy acorn.
 */
export class CompostLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly ax: number;
  private steam: Puff[] = [];
  private worm = { x: 0, t: -1, wait: 4 };
  private spores: Puff[] = [];

  constructor(private readonly area: AreaDef) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('lift_moved', (e) => {
        if (e.phase === 'top') particles.sparkles(e.x * PPM, e.y * PPM - 60, e.first ? 20 : 6);
      }),
      ev.on('jar_refilled', (e) => particles.sparkles(e.x * PPM, e.y * PPM - 30, 5)),
      ev.on('item_transformed', (e) => {
        if (e.to === 'item_compost_goo') particles.puff(e.x * PPM, e.y * PPM, 0x9ccc4a, 6, 0, -40, 18);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    if (!this.shows(f)) return;
    this.drawSteam(fg, f);
    this.drawWorm(g, f);
    this.drawFlies(fg, f);
    this.drawLift(g, fg, f);
  }

  /** Steam from the vents in the heap: soft columns of puffs. */
  private drawSteam(g: Graphics, f: AreaFrame): void {
    const heap = this.area.fixtures?.find((q) => q.kind === 'compost_heap');
    if (!heap) return;
    const wind = f.sim.environment.state.wind;
    const harder = 1 + f.weather.rain * 1.5;
    for (const dx of [0.28, 0.52, 0.74]) {
      if (Math.random() > f.dt * 3 * harder) continue;
      const x = this.ax + (1.6 + dx * 6.6) * PPM;
      this.steam.push({
        x,
        y: f.sim.surfaceY(x / PPM) * PPM,
        r: 10,
        age: 0,
        life: 2.5 + Math.random(),
        vx: wind * 30,
      });
    }
    this.steam = this.steam.filter((p) => (p.age += f.dt) < p.life).slice(-60);
    for (const p of this.steam) {
      p.y -= 50 * f.dt;
      p.x += (p.vx + Math.sin(p.age * 3 + p.y * 0.02) * 14) * f.dt;
      const t = p.age / p.life;
      g.circle(p.x, p.y, p.r + t * 26).fill({ color: 0xffffff, alpha: 0.4 * (1 - t) * Math.min(1, t * 5) });
    }
  }

  /** A worm pokes out of the warm heap now and then, looks around, and goes back down. */
  private drawWorm(g: Graphics, f: AreaFrame): void {
    const w = this.worm;
    if (w.t < 0) {
      w.wait -= f.dt;
      if (w.wait <= 0 && f.look.dapple > 0.2) {
        w.t = 0;
        w.x = this.ax + (2.4 + Math.random() * 5.6) * PPM;
      }
      return;
    }
    w.t += f.dt;
    const up = Math.min(1, w.t * 1.5, Math.max(0, (4 - w.t) * 1.5));
    if (w.t > 4) {
      w.t = -1;
      w.wait = 6 + Math.random() * 10;
      return;
    }
    const base = f.sim.surfaceY(w.x / PPM) * PPM + 8;
    const h = 46 * up;
    const look = Math.sin(w.t * 2) * 10;
    g.moveTo(w.x, base)
      .quadraticCurveTo(w.x - 8, base - h * 0.5, w.x + look * 0.4, base - h)
      .stroke({
        width: 15,
        color: 0xff9fb0,
        cap: 'round',
      });
    for (let k = 1; k < 4; k++)
      g.moveTo(w.x - 7, base - (h * k) / 4)
        .lineTo(w.x + 7, base - (h * k) / 4)
        .stroke({ width: 2, color: 0xe07890, alpha: up });
    if (up > 0.6) {
      g.circle(w.x + look * 0.4 - 3, base - h - 2, 2.5).fill(OUTLINE);
      g.circle(w.x + look * 0.4 + 3, base - h - 2, 2.5).fill(OUTLINE);
    }
  }

  /** Little clouds of fruit flies orbit anything rotten; mold puffs off it now and then. */
  private drawFlies(g: Graphics, f: AreaFrame): void {
    let n = 0;
    for (const v of f.views) {
      if (!ROTTEN.has(v.defId) || v.x * PPM < f.left - 100 || v.x * PPM > f.right + 100 || n > 6) continue;
      n++;
      const x = v.x * PPM;
      const y = v.y * PPM - 40;
      for (let k = 0; k < 4; k++) {
        const a = f.time * (3 + k) + k * 1.7 + v.id;
        const fx = x + Math.cos(a) * (18 + k * 5);
        const fy = y + Math.sin(a * 1.3) * 12;
        g.circle(fx, fy, 2.5).fill(0x3b3040);
        g.ellipse(fx - 2, fy - 3, 3, 1.6).fill({ color: 0xffffff, alpha: 0.7 });
      }
      if (Math.random() < f.dt * 0.4) this.spores.push({ x, y: y + 30, r: 4, age: 0, life: 1.2, vx: 0 });
    }
    this.spores = this.spores.filter((p) => (p.age += f.dt) < p.life).slice(-20);
    for (const p of this.spores) {
      const t = p.age / p.life;
      for (let k = 0; k < 3; k++)
        g.circle(p.x + (k - 1) * 8 * t, p.y - 20 * t - k * 3, 3 + t * 3).fill({
          color: 0xc8e07a,
          alpha: 0.7 * (1 - t),
        });
    }
  }

  /** The rope over the branch, its pulley, the two buckets, the acorn (or, once open, a pebble), the ladder. */
  private drawLift(g: Graphics, fg: Graphics, f: AreaFrame): void {
    const b = f.sim.barriers.buckets();
    if (!b) return;
    const open = f.sim.barriers.isOpen('area_treehouse_arcade');
    const half = (BUCKET_W / 2) * PPM;
    const wall = BUCKET_WALL * PPM;
    const pulley = { x: ((b.x + b.topX) / 2) * PPM, y: 275 };
    // The rope ladder down the roots, once the treehouse is open (rolled up before).
    const r0 = this.ax + 26.2 * PPM;
    const r1 = this.ax + 28.8 * PPM;
    if (open) {
      const steps = 9;
      for (const side of [-18, 18]) {
        g.moveTo(r1 + side * 0.3, 640);
        for (let k = 1; k <= steps; k++) {
          const x = r1 + ((r0 - r1) * k) / steps;
          g.lineTo(x + side * 0.3, f.sim.surfaceY(x / PPM) * PPM - 26 + side);
        }
        g.stroke({ width: 4, color: 0xd9b27a, cap: 'round' });
      }
      for (let k = 1; k < steps; k++) {
        const x = r1 + ((r0 - r1) * k) / steps;
        const y = f.sim.surfaceY(x / PPM) * PPM - 26;
        g.moveTo(x - 4, y - 18)
          .lineTo(x + 4, y + 18)
          .stroke({ width: 7, color: 0xa87444, cap: 'round' });
      }
    } else {
      g.roundRect(r1 - 60, 600, 70, 40, 18)
        .fill(0xd9b27a)
        .stroke(soft(2.5, 0.6));
      for (let k = 0; k < 3; k++)
        g.moveTo(r1 - 50 + k * 22, 602)
          .lineTo(r1 - 50 + k * 22, 638)
          .stroke({ width: 3, color: 0xa87444 });
    }
    // The bottom bucket swings a little when the hand rests near or hovers it (section 2).
    const nudge = open ? 0 : (f.hints?.wobble('barrier_bucket_lift') ?? 0) * (f.reduced ? 0.4 : 1) * 8;
    const drawBucket = (cx: number, floor: number, front: boolean, gg: Graphics): void => {
      const x = cx * PPM + (cx === b.x ? nudge : 0);
      const y = floor * PPM;
      const top = y - wall;
      if (!front) {
        // Rope to the handle.
        g.moveTo(pulley.x, pulley.y)
          .lineTo(x, top - 50)
          .stroke({ width: 4, color: 0xd9b27a });
        g.moveTo(x - half + 8, top)
          .quadraticCurveTo(x, top - 70, x + half - 8, top)
          .stroke({ width: 5, color: 0x6a6878 });
        gg.poly([x - half, top, x + half, top, x + half - 14, y + 8, x - half + 14, y + 8]).fill(
          darken(0xa87444, 0.35),
        );
        return;
      }
      // The front of the bucket, in front of what is inside: staves and bands.
      gg.poly([
        x - half,
        top + wall * 0.45,
        x + half,
        top + wall * 0.45,
        x + half - 14,
        y + 8,
        x - half + 14,
        y + 8,
      ])
        .fill(0xa87444)
        .stroke(stroke(4));
      for (let k = 1; k < 6; k++) {
        const sx = x - half + 10 + (k * (half * 2 - 20)) / 6;
        gg.moveTo(sx, top + wall * 0.47)
          .lineTo(sx - (sx - x) * 0.06, y + 6)
          .stroke({ width: 2, color: darken(0xa87444, 0.3), alpha: 0.6 });
      }
      gg.rect(x - half + 4, top + wall * 0.55, half * 2 - 8, 10)
        .fill(0x8e9bb0)
        .stroke(soft(2, 0.6));
      gg.rect(x - half + 10, y - 12, half * 2 - 20, 8)
        .fill(0x8e9bb0)
        .stroke(soft(2, 0.6));
      // The back rim, seen over the contents.
      g.poly([x - half, top, x + half, top, x + half, top + 10, x - half, top + 10])
        .fill(0x8a5a32)
        .stroke(soft(2, 0.6));
    };
    drawBucket(b.x, b.bottom, false, g);
    drawBucket(b.topX, b.top, false, g);
    // What weighs the top bucket down: the heavy acorn, or once open, a counterweight pebble.
    const tx = b.topX * PPM;
    const ty = b.top * PPM - 20;
    if (!open) {
      g.ellipse(tx, ty - 34, 52, 58)
        .fill(0xc9853f)
        .stroke(stroke(4));
      g.ellipse(tx - 18, ty - 50, 12, 20).fill({ color: 0xffffff, alpha: 0.3 });
      g.ellipse(tx, ty - 86, 60, 26)
        .fill(0x8a5a32)
        .stroke(stroke(4));
      for (let k = -2; k <= 2; k++) g.circle(tx + k * 20, ty - 88, 4).fill(darken(0x8a5a32, 0.3));
      g.moveTo(tx, ty - 108)
        .lineTo(tx + 8, ty - 128)
        .stroke({ width: 6, color: 0x5a3b2b, cap: 'round' });
    } else {
      g.ellipse(tx, ty - 10, 26, 20)
        .fill(0xb3adc4)
        .stroke(stroke(4));
    }
    drawBucket(b.x, b.bottom, true, fg);
    drawBucket(b.topX, b.top, true, fg);
    // The pulley wheel under the branch.
    g.circle(pulley.x, pulley.y, 22).fill(0x9aa3b5).stroke(stroke(4));
    g.circle(pulley.x, pulley.y, 6).fill(OUTLINE);
    const spin = b.bottom * 3;
    g.moveTo(pulley.x, pulley.y)
      .lineTo(pulley.x + Math.cos(spin) * 18, pulley.y + Math.sin(spin) * 18)
      .stroke({ width: 3, color: OUTLINE });
    g.moveTo(pulley.x, pulley.y - 22)
      .lineTo(pulley.x, pulley.y - 50)
      .stroke({ width: 5, color: 0x6a6878 });
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    const glow = f.look.glow;
    // The heap's warm shimmer, and the jars glowing at night.
    const heap = this.area.fixtures?.find((q) => q.kind === 'compost_heap');
    if (heap) light(this.ax + heap.x * PPM, 860, 300, 0xff9a4a, 0.08 + glow * 0.3, 1.3, 0.5);
    if (glow > 0.15) {
      let i = 0;
      for (const fix of this.area.fixtures ?? []) {
        if (fix.kind !== 'shelf_jar') continue;
        const pulse = 0.85 + 0.15 * Math.sin(f.time * 1.6 + i);
        light(
          this.ax + fix.x * PPM,
          fix.y * PPM - 30,
          110,
          JAR_COLORS[i++ % JAR_COLORS.length]!,
          glow * 0.6 * pulse,
        );
      }
    }
    void COMPOST;
  }
}
