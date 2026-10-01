import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { HOUR, timeOfDay } from '../../../../game/systems/sky';
import type { Particles } from '../particles';
import { OUTLINE, mix, stroke } from '../palette';
import { soft } from './common';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';
import { BOARDS, PORCH } from './porch';

const PPM = PIXELS_PER_METER;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Fish {
  x: number;
  dir: 1 | -1;
  t: number;
  wait: number;
}

/** Where the day's light shaft falls (world px in the porch), drifting across the floor through the day. */
export function shaftX(x0: number, hour: number): number {
  const t = Math.min(1, Math.max(0, (hour - 7) / 11));
  return x0 + 1300 + t * 800;
}

/**
 * Under the porch, alive: a warm shaft of daylight through the boards with
 * dust motes in it, the string of lamp bulbs (and moths when they are lit
 * at night), light through the floor gaps, a round fuzzy spider on a thread
 * who watches the hand, silverfish darting about, the cobweb hammock, the
 * eyes behind Whiff's flowerpot, and rain drumming on the boards and
 * dripping through the gaps.
 */
export class PorchLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly shaft = new Graphics();
  private readonly ax: number;
  private motes: Mote[] = [];
  private readonly fish: Fish[] = [];
  private spiderDrop = 0;
  private spiderTarget = 1;
  private wave = 0;
  private eyesUp = 0;
  private puddles: Record<number, number> = {};
  private soundIn = 1;
  private moths: { a: number; r: number; s: number }[] = [];

  constructor(private readonly area: AreaDef) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
    this.glow.addChild(this.shaft);
    for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0 });
    this.fish.push(
      { x: this.ax + 600, dir: 1, t: 0, wait: 2 },
      { x: this.ax + 2400, dir: -1, t: 0, wait: 5 },
    );
    for (let i = 0; i < 7; i++)
      this.moths.push({ a: Math.random() * 6, r: 60 + Math.random() * 90, s: 1.5 + Math.random() * 1.5 });
  }

  private fx(kind: string): { x: number; y: number; w: number; h: number }[] {
    return (this.area.fixtures ?? [])
      .filter((f) => f.kind === kind)
      .map((f) => ({ x: this.ax + f.x * PPM, y: f.y * PPM, w: (f.w ?? 0) * PPM, h: (f.h ?? 0) * PPM }));
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('spider_waved', () => (this.wave = 2.4)),
      ev.on('hideout_stirred', (e) => {
        if (e.fixture === 'fix_whiff_pot') this.eyesUp = 1.6;
        if (e.fixture === 'fix_spider') this.spiderTarget = 0.4;
      }),
      ev.on('floor_dropped', (e) => particles.dust(e.x * PPM, e.y * PPM + 10, 3)),
      ev.on('lamp_toggled', (e) => particles.sparkles(e.x * PPM, e.y * PPM, e.on ? 8 : 2)),
      ev.on('web_caught', (e) => particles.sparkles(e.x * PPM, e.y * PPM, 3)),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    const sh = this.shaft.clear();
    this.wave = Math.max(0, this.wave - f.dt);
    this.eyesUp = Math.max(0, this.eyesUp - f.dt);
    if (!this.shows(f)) return;
    const hour = timeOfDay(f.sim.weather.clock) / HOUR;
    const day = f.look.dapple;
    const open = f.sim.barriers.isOpen(this.area.id);
    // The light shaft through a gap in the boards, by day.
    const sx = shaftX(this.ax, hour);
    if (day > 0.05) {
      sh.poly([sx - 30, BOARDS.bottom, sx + 30, BOARDS.bottom, sx + 190, 905, sx - 50, 905]).fill({
        color: PORCH.light,
        alpha: 0.1 * day,
      });
      // Dust motes swirl in it; anything moving through stirs them.
      const stir = f.views.some((v) => Math.abs(v.x * PPM - sx - 70) < 140 && Math.hypot(v.vx, v.vy) > 0.5);
      for (const m of this.motes) {
        m.vx += (Math.random() - 0.5) * 0.02 + (stir ? (Math.random() - 0.5) * 0.3 : 0);
        m.vy += (Math.random() - 0.5) * 0.02 - 0.002;
        m.vx *= 0.96;
        m.vy *= 0.96;
        m.x = (m.x + m.vx * f.dt + 1) % 1;
        m.y = (m.y + m.vy * f.dt + 1) % 1;
        const y = BOARDS.bottom + m.y * (905 - BOARDS.bottom);
        const t = (y - BOARDS.bottom) / (905 - BOARDS.bottom);
        const x = sx - 30 + t * -20 + m.x * (60 + t * 180);
        sh.circle(x, y, 2.2).fill({ color: 0xfff6d8, alpha: 0.6 * day });
      }
    }
    // Light through the floor gaps (and drips through them in the rain).
    for (const gap of this.fx('floor_gap')) {
      g.rect(gap.x - 3, BOARDS.top, 6, BOARDS.bottom - BOARDS.top).fill({
        color: day > 0.1 ? PORCH.light : 0x2a2438,
        alpha: 0.85,
      });
      if (f.weather.rain > 0.3 && Math.random() < f.dt * 1.5 * f.weather.rain) {
        f.particles.drip(gap.x, BOARDS.bottom + 4, 0xbfe4ff);
        this.puddles[gap.x] = Math.min(1, (this.puddles[gap.x] ?? 0) + 0.15);
      }
      const p = (this.puddles[gap.x] = Math.max(0, (this.puddles[gap.x] ?? 0) - f.dt * 0.02));
      if (p > 0.02) g.ellipse(gap.x, 903, 18 + p * 30, 4 + p * 3).fill({ color: 0x8fb8d8, alpha: 0.6 * p });
    }
    // Rain drums on the boards.
    this.soundIn -= f.dt;
    if (this.soundIn <= 0) {
      this.soundIn = f.weather.rain > 0.2 ? 0.12 + Math.random() * 0.1 : 2 + Math.random() * 4;
      if (open && f.weather.rain > 0.2) f.sound('board_patter', f.weather.rain);
      else if (open && Math.random() < 0.4) f.sound('creak', 0.4);
    }
    this.drawLamp(g, f);
    this.drawSpider(g, f);
    this.drawFish(g, f);
    this.drawWeb(fg, f);
    this.drawPotEyes(g, f, open);
  }

  private drawLamp(g: Graphics, f: AreaFrame): void {
    const lamp = this.fx('porch_lamp')[0];
    if (!lamp) return;
    const on = f.sim.places.state.lampOn;
    const x0 = lamp.x - lamp.w / 2;
    const pts: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      pts.push([
        x0 + t * lamp.w,
        BOARDS.bottom + 30 + Math.sin(t * Math.PI) * 50 + Math.sin(f.time * 1.2 + i) * 2,
      ]);
    }
    g.moveTo(x0 - 20, BOARDS.bottom);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(x0 + lamp.w + 20, BOARDS.bottom).stroke({ width: 3, color: 0x2b2438 });
    const colors = [0xffe3a3, 0xff9fb8, 0xb6ff8a, 0x9fd8ff, 0xffd166];
    pts.forEach(([x, y], i) => {
      g.rect(x - 6, y - 4, 12, 10)
        .fill(0x6a6878)
        .stroke(soft(2, 0.7));
      g.ellipse(x, y + 18, 13, 17)
        .fill(on ? mix(colors[i]!, 0xffffff, 0.35) : 0xcfd2e0)
        .stroke(stroke(3));
      if (on) g.ellipse(x - 4, y + 13, 4, 6).fill({ color: 0xffffff, alpha: 0.8 });
    });
    // Moths come to a lit lamp at night.
    if (on && f.look.glow > 0.3)
      for (const m of this.moths) {
        m.a += f.dt * m.s;
        const mx = lamp.x + Math.cos(m.a) * m.r;
        const my = lamp.y + 40 + Math.sin(m.a * 1.3) * m.r * 0.4;
        const flap = Math.abs(Math.sin(f.time * 18 + m.r));
        g.ellipse(mx - 5, my, 6, 3 + flap * 4).fill({ color: 0xe8dcf8, alpha: Math.min(1, f.look.glow) });
        g.ellipse(mx + 5, my, 6, 3 + flap * 4).fill({ color: 0xe8dcf8, alpha: Math.min(1, f.look.glow) });
        g.circle(mx, my, 2.5).fill({ color: 0x6b5ba6, alpha: Math.min(1, f.look.glow) });
      }
  }

  /** A round, fuzzy spider on a thread: big eyes on the hand, and a wave back for a swaying one. */
  private drawSpider(g: Graphics, f: AreaFrame): void {
    const sp = this.fx('spider')[0];
    if (!sp) return;
    // It lowers and climbs back up now and then.
    if (Math.random() < f.dt * 0.08) this.spiderTarget = this.spiderTarget > 0.7 ? 0.3 : 1;
    this.spiderDrop += (this.spiderTarget - this.spiderDrop) * Math.min(1, f.dt * 0.8);
    const x = sp.x + Math.sin(f.time * 0.9) * 6;
    const y = BOARDS.bottom + (sp.y - BOARDS.bottom) * this.spiderDrop;
    g.moveTo(sp.x, BOARDS.bottom)
      .lineTo(x, y - 24)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
    const waving = this.wave > 0;
    for (let i = 0; i < 4; i++)
      for (const side of [-1, 1]) {
        const a = -0.6 + i * 0.4;
        const lift = waving ? Math.sin(f.time * 14 + i) * 0.6 - 0.6 : Math.sin(f.time * 2 + i) * 0.1;
        const kx = x + side * 26 * Math.cos(a);
        const ky = y + 22 * Math.sin(a) - 10 + lift * 12;
        g.moveTo(x + side * 12, y + (i - 1.5) * 5)
          .lineTo(kx, ky - 8)
          .lineTo(kx + side * 14, ky + 14 + lift * 18)
          .stroke({ width: 3.5, color: 0x3b3040, cap: 'round', join: 'round' });
      }
    g.circle(x, y, 22).fill(0x5d4a6e).stroke(stroke(4));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.moveTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20)
        .lineTo(x + Math.cos(a) * 27, y + Math.sin(a) * 27)
        .stroke({
          width: 2,
          color: 0x5d4a6e,
        });
    }
    // Big friendly eyes that follow the hand.
    const hand = f.hand;
    const lx = hand ? Math.max(-1, Math.min(1, (hand.x - x) / 200)) : 0;
    const ly = hand ? Math.max(-1, Math.min(1, (hand.y - y) / 200)) : 0.3;
    for (const dx of [-8, 8]) {
      g.circle(x + dx, y - 4, 8)
        .fill(0xffffff)
        .stroke(soft(2, 0.8));
      g.circle(x + dx + lx * 3, y - 4 + ly * 3, 4).fill(OUTLINE);
    }
    g.moveTo(x - 6, y + 10)
      .quadraticCurveTo(x, y + (waving ? 16 : 13), x + 6, y + 10)
      .stroke(stroke(2.5));
    g.circle(x - 14, y + 6, 4).fill({ color: 0xff8fab, alpha: 0.7 });
    g.circle(x + 14, y + 6, 4).fill({ color: 0xff8fab, alpha: 0.7 });
  }

  /** Silverfish dart between the shadows along the floor, now and then. */
  private drawFish(g: Graphics, f: AreaFrame): void {
    for (const s of this.fish) {
      if (s.wait > 0) {
        s.wait -= f.dt;
        continue;
      }
      s.t += f.dt;
      s.x += s.dir * 420 * f.dt * (0.5 + 0.5 * Math.abs(Math.sin(s.t * 6)));
      if (s.t > 2 + Math.random()) {
        s.t = 0;
        s.wait = 3 + Math.random() * 8;
        s.dir = s.dir === 1 ? -1 : 1;
      }
      s.x = Math.max(this.ax + 560, Math.min(this.ax + 2950, s.x));
      const y = 898;
      g.ellipse(s.x, y, 16, 5).fill(0xc7ccd8).stroke(soft(1.5, 0.6));
      g.moveTo(s.x - s.dir * 16, y)
        .lineTo(s.x - s.dir * 30, y - 5)
        .moveTo(s.x - s.dir * 16, y)
        .lineTo(s.x - s.dir * 30, y + 4)
        .stroke({ width: 1.5, color: 0xc7ccd8 });
      g.moveTo(s.x + s.dir * 15, y - 2)
        .lineTo(s.x + s.dir * 26, y - 9)
        .stroke({ width: 1.5, color: 0xc7ccd8 });
    }
  }

  /** The cobweb hammock, sagging between the pots, drawn over whatever it holds. */
  private drawWeb(g: Graphics, f: AreaFrame): void {
    const solid = this.area.solids?.find((s) => s.id === 'solid_cobweb');
    if (!solid?.chain) return;
    const pts = solid.chain.map(([x, y]) => [this.ax + x * PPM, y * PPM] as const);
    const holding = Object.keys(f.sim.places.state.web).length > 0;
    const sag = holding ? 8 + Math.sin(f.time * 3) * 2 : 0;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    for (let k = 0; k < 4; k++) {
      g.moveTo(a[0], a[1] - k * 6);
      for (const [x, y] of pts.slice(1, -1)) g.lineTo(x, y - k * 6 + sag);
      g.lineTo(b[0], b[1] - k * 6);
    }
    g.stroke({ width: 1.6, color: PORCH.web, alpha: 0.65 });
    for (const [x, y] of pts)
      g.moveTo(x, y + sag * 0.6)
        .lineTo(x + 6, y - 26)
        .stroke({ width: 1.4, color: PORCH.web, alpha: 0.5 });
    if (f.look.glow > 0.3)
      for (const [x, y] of pts) g.circle(x, y + sag, 2).fill({ color: 0xdfe8ff, alpha: f.look.glow * 0.8 });
  }

  /** Eyes peeking over Whiff's flowerpot until he is found (and behind the lattice before that). */
  private drawPotEyes(g: Graphics, f: AreaFrame, open: boolean): void {
    const pot = this.fx('whiff_pot')[0];
    if (!pot || f.sim.cast.joined('bug_stinkbug_whiff')) return;
    const blink = Math.sin(f.time * 0.8) > 0.97 ? 0.2 : 1;
    const up = open ? 0.6 + Math.min(1, this.eyesUp) * 0.6 : 0;
    const hover = f.hand && Math.abs(f.hand.x - pot.x) < 80 && Math.abs(f.hand.y - pot.y) < 90;
    const peek = open ? (hover ? 1 : up) : 0;
    if (!open) {
      // Behind the lattice: just two eyes in the dark, blinking.
      const ex = this.ax + 260 + Math.sin(f.time * 0.4) * 60;
      for (const dx of [-11, 11]) g.ellipse(ex + dx, 700, 7, 9 * blink).fill({ color: 0xfff27a, alpha: 0.9 });
      return;
    }
    const y = pot.y - 92 - peek * 26;
    for (const dx of [-12, 12]) {
      g.ellipse(pot.x + dx + 6, y, 9, 11 * blink)
        .fill(0xffffff)
        .stroke(stroke(3));
      if (blink > 0.5) g.circle(pot.x + dx + 8, y + 2, 4).fill(OUTLINE);
    }
    // Apologetic eyebrows.
    g.moveTo(pot.x - 22, y - 16)
      .lineTo(pot.x - 6, y - 12)
      .moveTo(pot.x + 30, y - 16)
      .lineTo(pot.x + 14, y - 12)
      .stroke(stroke(3));
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    const hour = timeOfDay(f.sim.weather.clock) / HOUR;
    const day = f.look.dapple;
    if (day > 0.05) light(shaftX(this.ax, hour) + 70, 900, 160, PORCH.light, 0.35 * day, 1.6, 0.35);
    const lamp = this.fx('porch_lamp')[0];
    if (lamp && f.sim.places.state.lampOn) {
      const k = 0.35 + f.look.glow * 0.65;
      for (let i = 0; i < 5; i++)
        light(lamp.x - lamp.w / 2 + ((i + 0.5) / 5) * lamp.w, lamp.y + 30, 140, 0xffe3a3, k * 0.7);
      light(lamp.x, 700, 420, 0xffd9a0, k * 0.4, 1.3, 0.9);
    }
    for (const gap of this.fx('floor_gap'))
      if (day > 0.1) light(gap.x, BOARDS.bottom + 30, 40, PORCH.light, day * 0.5, 0.4, 1.6);
  }
}
