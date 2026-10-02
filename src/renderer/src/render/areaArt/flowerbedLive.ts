import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { HOUR, timeOfDay } from '../../../../game/systems/sky';
import type { Particles } from '../particles';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { flower, soft } from './common';
import { FLOWERBED } from './flowerbed';
import { AreaLive } from './live';
import { drawSequencer, drawThemeChalk } from './sequencerArt';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;

/** Paint puddle colors, by paint ID. */
export const PAINT_COLORS: Readonly<Record<string, number>> = {
  paint_red: 0xe8453c,
  paint_blue: 0x4d7cff,
  paint_yellow: 0xffd23f,
  paint_white: 0xfafaf4,
  paint_black: 0x2b2438,
};

/** How open a flower is at this hour: 1 by day, closing into a bud at dusk, 0 at night. */
export function bloom(hour: number): number {
  if (hour >= 7.5 && hour < 18.5) return 1;
  if (hour >= 20 || hour < 5.5) return 0;
  if (hour < 7.5) return (hour - 5.5) / 2;
  return 1 - (hour - 18.5) / 1.5;
}

interface Stem {
  x: number;
  h: number;
  r: number;
  color: number;
  center: number;
  petals: number;
  phase: number;
  aphids: number;
}

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  color: number;
  age: number;
}

/**
 * The flowerbed, alive: flowers that sway, open by day and close at night,
 * droop in the rain and lose petals in the wind; aphids on the stems; the
 * stage lights (off, warm, disco, spotlight) and the bluebell speakers; the
 * five paint puddles; Munch's nibbled leaf; the humming tulip; a little bird
 * on the edging board.
 */
export class FlowerbedLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly cones = new Graphics();
  private readonly stems: Stem[] = [];
  private petals: Petal[] = [];
  private readonly ax: number;
  private wobble: Record<string, number> = {};
  private flash = 0;
  private birdTilt = 0;
  private birdIn = 3;
  private ripple: Record<string, number> = {};
  private spotX: number | null = null;

  constructor(private readonly area: AreaDef) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
    this.glow.addChild(this.cones);
    const spots: [number, number, number, number][] = [
      // x (px in the area), height, head radius, petals
      [700, 300, 40, 6],
      [790, 420, 46, 8],
      [1065, 360, 44, 5],
      [1240, 250, 34, 7],
      [3010, 320, 42, 6],
      [3095, 430, 50, 8],
      [3165, 260, 36, 5],
    ];
    const colors = [
      FLOWERBED.pink,
      FLOWERBED.violet,
      FLOWERBED.yellow,
      0xff8a5c,
      0xffffff,
      FLOWERBED.pink,
      FLOWERBED.violet,
    ];
    spots.forEach(([x, h, r, n], i) => {
      const color = colors[i % colors.length]!;
      this.stems.push({
        x: this.ax + x,
        h,
        r,
        petals: n,
        color,
        center: color === FLOWERBED.yellow ? 0x8a5a2b : 0xffd23f,
        phase: i * 1.7,
        aphids: i % 3 === 1 ? 3 : 0,
      });
    });
  }

  private fx(id: string): { x: number; y: number; f: NonNullable<AreaDef['fixtures']>[number] } | null {
    const f = this.area.fixtures?.find((q) => q.id === id);
    return f ? { x: this.ax + f.x * PPM, y: f.y * PPM, f } : null;
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    const px = (m: number): number => m * PPM;
    return [
      ev.on('stage_lights_changed', () => (this.flash = 0.25)),
      ev.on('speaker_toggled', (e) => (this.wobble[e.id] = 1)),
      ev.on('hideout_stirred', (e) => {
        this.wobble[e.fixture] = 1;
        if (e.fixture === 'fix_tulip') particles.boop(px(e.x), px(e.y) - 40);
      }),
      ev.on('gnome_knocked', (e) => {
        this.wobble.fix_gnome = 1;
        particles.ring(px(e.x) - 220, px(e.y) + 20, 40);
      }),
      ev.on('gnome_answered', (e) => {
        for (let k = 0; k < 3; k++) particles.ring(px(e.x) - 220, px(e.y) + 20 - k * 6, 30 + k * 18);
        particles.stars(px(e.x) - 220, px(e.y) - 30);
      }),
      ev.on('painted', (e) => {
        for (const f of this.area.fixtures ?? [])
          if (f.kind === 'paint_puddle' && Math.abs(this.ax + f.x * PPM - px(e.x)) < 60)
            this.ripple[f.id] = 1;
      }),
      ev.on('band_played', (e) => {
        this.flash = 1.2;
        particles.sparkles(px(e.x), px(e.y) - 160, 24);
        particles.hearts(px(e.x), px(e.y) - 220, 4);
      }),
      ev.on('bug_joined', (e) => {
        if (e.defId === 'bug_caterpillar_munch') this.wobble.fix_munch_leaf = 1;
      }),
      ev.on('sequencer_changed', (e) => {
        if (e.action === 'wobbled') this.wobble.fix_mushroom_sequencer = 1;
        else if (e.action === 'cleared' && e.by === null)
          particles.puff(px(e.x) + 60, px(e.y) + 40, 0x9a7a4a, 8);
        else if (e.action === 'cap' && e.on) particles.boop(px(e.x), px(e.y) - 10);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    this.cones.clear();
    for (const k of Object.keys(this.wobble)) this.wobble[k] = Math.max(0, this.wobble[k]! - f.dt * 1.6);
    for (const k of Object.keys(this.ripple)) this.ripple[k] = Math.max(0, this.ripple[k]! - f.dt * 1.2);
    this.flash = Math.max(0, this.flash - f.dt);
    this.updatePetals(f);
    if (!this.shows(f)) return;
    const hour = timeOfDay(f.sim.weather.clock) / HOUR;
    const open = bloom(hour);
    const rain = f.weather.rain;
    const wind = f.sim.environment.state.wind;
    this.drawFlowers(g, f, open, rain, wind);
    this.drawSequencer(g, f);
    this.drawPuddles(g, f);
    // The theme, chalked on the flowerpot's front.
    drawThemeChalk(g, this.ax + 18.7 * PPM, 8.3 * PPM, 13);
    this.drawHideouts(g, f);
    this.drawBluebells(g, f);
    this.drawStageLights(g, f);
    this.drawBird(g, f);
    // Falling petals in front.
    for (const p of this.petals) {
      fg.ellipse(p.x, p.y, 9, 5).fill(p.color).stroke(soft(1.5, 0.5));
      void p.rot;
    }
  }

  private drawFlowers(g: Graphics, f: AreaFrame, open: number, rain: number, wind: number): void {
    for (const s of this.stems) {
      const sway =
        Math.sin(f.time * 1.3 + s.phase + s.x * 0.002) * (6 + Math.abs(wind) * 16) + wind * 22 - rain * 0;
      const droop = rain * 0.55;
      const base = { x: s.x, y: 908 };
      const head = { x: s.x + sway + droop * 28, y: 905 - s.h + droop * s.r * 0.9 };
      g.moveTo(base.x, base.y)
        .quadraticCurveTo(base.x + sway * 0.3, base.y - s.h * 0.55, head.x, head.y)
        .stroke({ width: 11, color: FLOWERBED.stem, cap: 'round' });
      g.moveTo(base.x, base.y)
        .quadraticCurveTo(base.x + sway * 0.3, base.y - s.h * 0.55, head.x, head.y)
        .stroke(soft(2, 0.4));
      // Two leaves.
      for (const [t, side] of [
        [0.35, 1],
        [0.55, -1],
      ] as const) {
        const lx = base.x + (head.x - base.x) * t * 0.6 + sway * t * 0.3;
        const ly = base.y - s.h * t;
        g.ellipse(lx + side * 24, ly, 28, 11)
          .fill(FLOWERBED.leaf)
          .stroke(soft(2.5, 0.5));
        g.moveTo(lx, ly)
          .lineTo(lx + side * 44, ly - 2)
          .stroke({ width: 2, color: darken(FLOWERBED.leaf, 0.25), alpha: 0.6 });
      }
      // Aphids: little green beads bobbing on the stem.
      for (let k = 0; k < s.aphids; k++) {
        const t = 0.25 + k * 0.12;
        const ax = base.x + (head.x - base.x) * t + sway * t * 0.3 + 7;
        const ay = base.y - s.h * t + Math.sin(f.time * 3 + k + s.phase) * 2;
        g.circle(ax, ay, 6).fill(0xa8e063).stroke(soft(1.5, 0.6));
        g.circle(ax + 2, ay - 2, 1.5).fill(OUTLINE);
      }
      // The head: open by day, a bud at night, drooping and dripping in the rain.
      if (open > 0.05) {
        flower(
          g,
          head.x,
          head.y,
          s.r * (0.55 + 0.45 * open),
          s.petals,
          s.color,
          s.center,
          3,
          0.55,
          f.time * 0.05 + s.phase,
        );
        // A sleepy little face on the big ones.
        if (s.r > 42) {
          const cr = s.r * 0.42 * (0.55 + 0.45 * open);
          g.moveTo(head.x - cr * 0.45, head.y - cr * 0.1)
            .quadraticCurveTo(head.x - cr * 0.3, head.y - cr * 0.3, head.x - cr * 0.15, head.y - cr * 0.1)
            .stroke(stroke(2.5));
          g.moveTo(head.x + cr * 0.15, head.y - cr * 0.1)
            .quadraticCurveTo(head.x + cr * 0.3, head.y - cr * 0.3, head.x + cr * 0.45, head.y - cr * 0.1)
            .stroke(stroke(2.5));
          g.moveTo(head.x - cr * 0.25, head.y + cr * 0.25)
            .quadraticCurveTo(head.x, head.y + cr * 0.5, head.x + cr * 0.25, head.y + cr * 0.25)
            .stroke(stroke(2.5));
        }
      } else {
        g.ellipse(head.x, head.y, s.r * 0.36, s.r * 0.55)
          .fill(s.color)
          .stroke(soft(3, 0.6));
        g.moveTo(head.x, head.y - s.r * 0.5)
          .lineTo(head.x, head.y + s.r * 0.3)
          .stroke({ width: 2, color: darken(s.color, 0.2), alpha: 0.7 });
        g.ellipse(head.x, head.y + s.r * 0.45, s.r * 0.3, s.r * 0.16)
          .fill(FLOWERBED.leaf)
          .stroke(soft(2, 0.5));
      }
      if (rain > 0.3 && Math.random() < f.dt * 0.8 * rain)
        f.particles.drip(head.x, head.y + s.r * 0.6, 0xbfe4ff);
      if (
        Math.abs(wind) > 1.5 &&
        open > 0.5 &&
        Math.random() < f.dt * 0.25 * Math.abs(wind) &&
        this.petals.length < 14
      )
        this.petals.push({
          x: head.x,
          y: head.y,
          vx: wind * 60,
          vy: -10,
          rot: 0,
          spin: (Math.random() - 0.5) * 6,
          color: s.color,
          age: 0,
        });
    }
  }

  private updatePetals(f: AreaFrame): void {
    this.petals = this.petals.filter((p) => (p.age += f.dt) < 5 && p.y < 905);
    for (const p of this.petals) {
      p.x += p.vx * f.dt + Math.sin(p.age * 4) * 20 * f.dt;
      p.y += (p.vy + 40) * f.dt;
      p.rot += p.spin * f.dt;
    }
  }

  /** The mushroom sequencer, with its playhead on the music clock. */
  private drawSequencer(g: Graphics, f: AreaFrame): void {
    const layout = f.sim.places.sequencerLayout();
    if (!layout) return;
    const state = f.sim.places.sequencer;
    const music = f.music;
    const perStep = state.fast ? 1 : 2;
    const steps = music ? (music.beat * 4) / perStep : 0;
    drawSequencer(g, {
      layout,
      state,
      column: music && music.seqVolume > 0 ? music.seqColumn : -1,
      stepPhase: steps - Math.floor(steps),
      time: f.time,
      groundY: 908,
      wobble: this.wobble.fix_mushroom_sequencer ?? 0,
      dark: f.sim.weather.dark,
    });
  }

  private drawPuddles(g: Graphics, f: AreaFrame): void {
    for (const fix of this.area.fixtures ?? []) {
      if (fix.kind !== 'paint_puddle' || !fix.paint) continue;
      const x = this.ax + fix.x * PPM;
      const y = f.sim.surfaceY(fix.x + this.area.xStart) * PPM - 4;
      const color = PAINT_COLORS[fix.paint] ?? 0xffffff;
      const rip = this.ripple[fix.id] ?? 0;
      const w = fix.radius * PPM * (1.05 + rip * 0.08);
      g.ellipse(x, y + 2, w + 4, 14).fill({ color: darken(color, 0.35), alpha: 0.6 });
      g.ellipse(x, y, w, 11).fill(color).stroke(soft(2.5, 0.6));
      g.ellipse(x - w * 0.35, y - 3, w * 0.25, 3).fill({
        color: 0xffffff,
        alpha: color === 0xfafaf4 ? 0.9 : 0.5,
      });
      if (rip > 0)
        g.ellipse(x, y, w * (1.2 - rip * 0.4), 8).stroke({
          width: 2,
          color: lighten(color, 0.4),
          alpha: rip,
        });
      // A little splash of the color on the rim, like spilled berry juice.
      g.circle(x + w * 0.9, y - 6, 5)
        .fill(color)
        .stroke(soft(1.5, 0.6));
    }
  }

  private drawHideouts(g: Graphics, f: AreaFrame): void {
    // Munch's curled leaf: full of bite holes, rustling now and then. Unrolled once he's out.
    const leaf = this.fx('fix_munch_leaf');
    if (leaf) {
      const w = this.wobble.fix_munch_leaf ?? 0;
      const out = f.sim.cast.joined('bug_caterpillar_munch');
      const x = leaf.x;
      const y = 893;
      const shake = Math.sin(f.time * 40) * w * 5;
      if (!out) {
        g.roundRect(x - 48 + shake, y - 36, 96, 40, 20)
          .fill(0x7ccf4f)
          .stroke(stroke(4));
        g.ellipse(x + 44 + shake, y - 16, 14, 20)
          .fill(0x5fb043)
          .stroke(stroke(4));
        g.ellipse(x + 44 + shake, y - 16, 6, 11).fill(0x3f8a2a);
        for (const [dx, dy, r] of [
          [-24, -28, 7],
          [-6, -34, 5],
          [10, -30, 6],
        ] as const)
          g.circle(x + dx + shake, y + dy, r)
            .fill(0xffffff)
            .stroke(soft(1.5, 0.6));
        g.moveTo(x - 40 + shake, y - 16)
          .lineTo(x + 30 + shake, y - 16)
          .stroke({ width: 2, color: 0x4e9a3a });
      } else {
        g.ellipse(x, y - 4, 60, 12)
          .fill(0x7ccf4f)
          .stroke(soft(3, 0.6));
        for (const dx of [-30, -8, 18]) g.circle(x + dx, y - 6, 5).fill(darken(0x7a5238, 0.1));
      }
    }
    // The tulip, closed tight and humming (somebody busy is inside).
    const tulip = this.fx('fix_tulip');
    if (tulip) {
      const w = this.wobble.fix_tulip ?? 0;
      const buzz = Math.sin(f.time * 50) * (1.2 + w * 4);
      const x = tulip.x;
      const top = tulip.y;
      g.moveTo(x, 908)
        .quadraticCurveTo(x - 10, (908 + top) / 2, x + buzz * 0.4, top + 30)
        .stroke({ width: 9, color: FLOWERBED.stem, cap: 'round' });
      g.ellipse(x - 26, 820, 26, 10)
        .fill(FLOWERBED.leaf)
        .stroke(soft(2, 0.5));
      g.moveTo(x - 30 + buzz, top + 34)
        .quadraticCurveTo(x - 36 + buzz, top - 20, x - 12 + buzz, top - 40)
        .lineTo(x + buzz, top - 18)
        .lineTo(x + 12 + buzz, top - 40)
        .quadraticCurveTo(x + 36 + buzz, top - 20, x + 30 + buzz, top + 34)
        .closePath()
        .fill(0xff7aa8)
        .stroke(stroke(4));
      g.moveTo(x + buzz, top - 18)
        .lineTo(x + buzz, top + 30)
        .stroke({ width: 2.5, color: 0xd94f86, alpha: 0.7 });
    }
  }

  private drawBluebells(g: Graphics, f: AreaFrame): void {
    for (const id of ['fix_bluebell_west', 'fix_bluebell_east']) {
      const b = this.fx(id);
      if (!b) continue;
      const muted = f.sim.places.state.muted.includes(id);
      const dir = id.endsWith('west') ? 1 : -1;
      const w = this.wobble[id] ?? 0;
      const tilt = Math.sin(f.time * 20) * w * 0.25 + (muted ? 0.5 : 0) * dir;
      const hx = b.x + Math.sin(tilt) * 40;
      const hy = b.y + (muted ? 30 : 0);
      g.moveTo(b.x, 908)
        .quadraticCurveTo(b.x - dir * 20, 800, hx, hy)
        .stroke({ width: 10, color: FLOWERBED.stem, cap: 'round' });
      g.moveTo(b.x, 908)
        .quadraticCurveTo(b.x - dir * 20, 800, hx, hy)
        .stroke(soft(2, 0.4));
      // A bell-shaped horn, facing the stage.
      const mouth = { x: hx + dir * 70, y: hy + 26 };
      g.moveTo(hx, hy - 14)
        .quadraticCurveTo(hx + dir * 40, hy - 18, mouth.x, mouth.y - 34)
        .lineTo(mouth.x + dir * 6, mouth.y + 30)
        .quadraticCurveTo(hx + dir * 40, hy + 26, hx, hy + 14)
        .closePath()
        .fill(0x6f8cff)
        .stroke(stroke(4));
      g.ellipse(mouth.x + dir * 3, mouth.y - 2, 10, 32)
        .fill(muted ? 0x3d4fa8 : 0x2b3a8f)
        .stroke(stroke(3));
      g.moveTo(hx + dir * 14, hy - 8)
        .quadraticCurveTo(hx + dir * 36, hy - 10, mouth.x - dir * 8, mouth.y - 28)
        .stroke({
          width: 3,
          color: 0xffffff,
          alpha: 0.5,
          cap: 'round',
        });
      if (muted) {
        g.moveTo(mouth.x + dir * 30 - 9, mouth.y - 9)
          .lineTo(mouth.x + dir * 30 + 9, mouth.y + 9)
          .stroke(stroke(4));
        g.moveTo(mouth.x + dir * 30 + 9, mouth.y - 9)
          .lineTo(mouth.x + dir * 30 - 9, mouth.y + 9)
          .stroke(stroke(4));
      }
    }
  }

  /** The three lamps on the truss, and their light: off, warm, disco, or a spotlight. */
  private drawStageLights(g: Graphics, f: AreaFrame): void {
    const mode = f.sim.places.state.stageLights;
    const stage = f.sim.places.stage();
    const lamps = [this.ax + 1650, this.ax + 1870, this.ax + 2090];
    const beat = Math.floor(f.time * 2);
    const disco = [0xff5fa2, 0x4fb6ff, 0xffd23f, 0x7bdcb5, 0x9b6bd6];
    // Spotlight: follows the bug nearest the stage's middle.
    let spot: number | null = null;
    if (mode === 3 && stage) {
      const mid = ((stage.x0 + stage.x1) / 2) * PPM;
      let best = Infinity;
      for (const v of f.views)
        if (
          v.kind === 'bug' &&
          Math.abs(v.x * PPM - mid) < best &&
          v.x > stage.x0 - 2 &&
          v.x < stage.x1 + 2
        ) {
          best = Math.abs(v.x * PPM - mid);
          spot = v.x * PPM;
        }
      spot ??= mid;
      this.spotX = this.spotX === null ? spot : this.spotX + (spot - this.spotX) * Math.min(1, f.dt * 4);
    }
    const flash = this.flash > 0 && Math.floor(this.flash * 12) % 2 === 0;
    lamps.forEach((lx, i) => {
      const on = mode === 1 || mode === 2 || (mode === 3 && i === 1);
      const color = mode === 2 ? disco[(beat + i) % disco.length]! : 0xfff1c9;
      g.moveTo(lx, 252).lineTo(lx, 276).stroke({ width: 4, color: OUTLINE });
      g.roundRect(lx - 26, 274, 52, 40, 10)
        .fill(0x3b3a4a)
        .stroke(stroke(4));
      g.ellipse(lx, 314, 22, 8)
        .fill(on || flash ? mix(color, 0xffffff, 0.4) : 0x6a6878)
        .stroke(stroke(3));
      if (!(on || flash) || !stage) return;
      const tx = mode === 3 && this.spotX !== null ? this.spotX : lx + (i - 1) * 60;
      const ty = stage.y * PPM;
      const half = mode === 3 ? 90 : 120;
      this.cones
        .poly([lx - 18, 318, lx + 18, 318, tx + half, ty, tx - half, ty])
        .fill({ color, alpha: mode === 2 ? 0.16 : 0.12 });
    });
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    const mode = f.sim.places.state.stageLights;
    const stage = f.sim.places.stage();
    if (stage && mode > 0) {
      const beat = Math.floor(f.time * 2);
      const disco = [0xff5fa2, 0x4fb6ff, 0xffd23f, 0x7bdcb5, 0x9b6bd6];
      const y = stage.y * PPM;
      const k = 0.35 + f.look.glow * 0.6;
      if (mode === 1) light(((stage.x0 + stage.x1) / 2) * PPM, y - 20, 360, 0xffd9a0, k, 1.6, 0.5);
      if (mode === 2)
        for (let i = 0; i < 3; i++)
          light(
            this.ax + 1650 + i * 220 + Math.sin(f.time * 2 + i) * 60,
            y - 10,
            160,
            disco[(beat + i) % disco.length]!,
            k,
            1.2,
            0.5,
          );
      if (mode === 3 && this.spotX !== null) light(this.spotX, y - 30, 150, 0xffffff, k + 0.2, 1, 0.7);
    }
    // Night in the garden (P-16): the stage keeps a warm night-light on, the
    // bluebells glow softly, and moonlight pools along the floor, so the
    // gnome, the stage, and the loose things stay readable in the dark.
    const night = Math.max(0, (f.look.glow - 0.2) / 0.8);
    if (night > 0) {
      if (stage && mode === 0)
        light(((stage.x0 + stage.x1) / 2) * PPM, stage.y * PPM - 10, 440, 0xffd9a0, 0.45 * night, 1.7, 0.55);
      for (const fix of this.area.fixtures ?? []) {
        if (fix.kind === 'bluebell')
          light(this.ax + fix.x * PPM, fix.y * PPM, 110, 0x9fb4ff, 0.35 * night, 1, 1);
        if (fix.kind === 'gnome')
          light(this.ax + fix.x * PPM, fix.y * PPM + 40, 420, 0xd6dcff, 0.5 * night, 1.4, 0.55);
      }
      for (let x = 300; x < 3200; x += 420) light(this.ax + x, 870, 380, 0xc8d0ff, 0.32 * night, 1.8, 0.4);
    }
    // Glowing paint at night: a faint sheen on each puddle.
    if (f.look.glow > 0.4)
      for (const fix of this.area.fixtures ?? []) {
        if (fix.kind !== 'paint_puddle' || !fix.paint) continue;
        light(
          this.ax + fix.x * PPM,
          905,
          50,
          PAINT_COLORS[fix.paint] ?? 0xffffff,
          (f.look.glow - 0.4) * 0.3,
          1.4,
          0.4,
        );
      }
  }

  /** A round little bird on the edging board, tilting its head now and then (more when there is music). */
  private drawBird(g: Graphics, f: AreaFrame): void {
    this.birdIn -= f.dt;
    if (this.birdIn <= 0) {
      this.birdIn = 2 + Math.random() * 4;
      this.birdTilt = (Math.random() - 0.5) * 0.8;
    }
    if (f.sim.places.state.stageLights === 2) this.birdTilt = Math.sin(f.time * 4) * 0.4;
    // Perched on top of the sequencer's soil bank.
    const x = this.ax + 2830;
    const y = 505;
    g.ellipse(x, y, 30, 24).fill(0x5a7bd6).stroke(stroke(4));
    g.ellipse(x - 26, y + 4, 16, 8)
      .fill(0x3d5bb0)
      .stroke(soft(2, 0.6));
    const hx = x + 22 + Math.sin(this.birdTilt) * 6;
    const hy = y - 22;
    g.circle(hx, hy, 17).fill(0x6f8ce6).stroke(stroke(4));
    g.poly([hx + 14, hy - 2, hx + 28, hy + 3 + this.birdTilt * 6, hx + 14, hy + 6])
      .fill(0xffb703)
      .stroke(soft(2, 0.6));
    g.circle(hx + 6, hy - 4, 3.5).fill(OUTLINE);
    g.circle(hx - 2, hy + 6, 4).fill({ color: 0xff8fab, alpha: 0.7 });
    g.moveTo(x - 4, y + 22)
      .lineTo(x - 6, y + 34)
      .moveTo(x + 8, y + 22)
      .lineTo(x + 8, y + 34)
      .stroke({ width: 3, color: 0xffb703, cap: 'round' });
  }
}
