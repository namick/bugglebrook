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
import { PORCH_LID } from '../../../../game/data/areas';
import { BOARDS, PORCH, drawLidFront, porchGaps } from './porch';
import { lampPool, shaftSlant, shaftStrength } from './porchLook';

const PPM = PIXELS_PER_METER;
/** The porch floor, in world px. */
const FLOOR = 900;

interface Mote {
  /** Across the beam (0 to 1) and down it (0 to 1). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which beam it floats in. */
  beam: number;
  size: number;
}

interface Fish {
  x: number;
  dir: 1 | -1;
  t: number;
  wait: number;
  /** The shadow it is darting to next (world px). */
  to: number;
}

/** A sunbeam through a gap in the boards: where it comes in, and how wide and bright it is. */
interface Beam {
  x: number;
  width: number;
  strength: number;
}

/** Floor shadows silverfish hide in (area-local px): under the junk pile, the shelf, the bench, the pots. */
const HIDEOUTS = [1040, 1300, 1720, 2200, 2560, 2850] as const;

/** The lamp's five bulbs, left to right. */
const LAMP_COLORS = [0xffe3a3, 0xff9fb8, 0xb6ff8a, 0x9fd8ff, 0xffd166] as const;

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
  private readonly beams: Beam[] = [];
  private readonly gaps: number[];
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
    this.gaps = porchGaps(area);
    // Sunbeams come through the floor gaps (strong) and every third board gap (faint).
    const floorGaps = this.fx('floor_gap').map((g) => g.x);
    this.gaps.forEach((x, i) => {
      const main = floorGaps.some((g) => Math.abs(g - x) < 2);
      if (main || i % 3 === 1) this.beams.push({ x, width: main ? 26 : 12, strength: main ? 1 : 0.45 });
    });
    this.beams.forEach((b, beam) => {
      for (let i = 0; i < (b.strength > 0.6 ? 16 : 6); i++)
        this.motes.push({
          x: Math.random(),
          y: Math.random(),
          vx: 0,
          vy: 0,
          beam,
          size: 1.4 + Math.random() * 1.8,
        });
    });
    this.fish.push(
      { x: this.ax + 1040, dir: 1, t: 0, wait: 2, to: this.ax + 1300 },
      { x: this.ax + 2560, dir: -1, t: 0, wait: 5, to: this.ax + 2200 },
      { x: this.ax + 1720, dir: 1, t: 0, wait: 9, to: this.ax + 2200 },
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
    // Sunbeams through the gaps between the boards, slanting with the hour, gone at night.
    const sun = day * shaftStrength(hour) * (1 - 0.7 * f.weather.rain);
    if (sun > 0.03) this.drawBeams(sh, f, hour, sun);
    // Light through the floor gaps (and drips through them in the rain).
    for (const gap of this.fx('floor_gap')) {
      if (sun <= 0.1)
        g.rect(gap.x - 3, BOARDS.top, 6, BOARDS.bottom - BOARDS.top).fill({ color: 0x1e1620, alpha: 0.85 });
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
    drawLidFront(fg, this.ax + PORCH_LID.x0 * PPM, this.ax + PORCH_LID.x1 * PPM);
    this.drawPotEyes(g, f, open);
  }

  /** Where a beam meets the floor this hour (world px). */
  private beamFoot(b: Beam, hour: number): number {
    return b.x + shaftSlant(hour) * (FLOOR - BOARDS.bottom);
  }

  /**
   * The sunbeams: soft slanting wedges of warm light from each gap, a bright
   * sliver in the gap itself, and dust motes floating in them that swirl
   * when something moves through.
   */
  private drawBeams(sh: Graphics, f: AreaFrame, hour: number, sun: number): void {
    const slant = shaftSlant(hour);
    const drop = FLOOR - BOARDS.bottom;
    const stirred = this.beams.map((b) => {
      const foot = this.beamFoot(b, hour);
      return f.views.some((v) => {
        const vx = v.x * PPM;
        const vy = v.y * PPM;
        if (vy < BOARDS.bottom || Math.hypot(v.vx, v.vy) < 0.5) return false;
        const along = b.x + (foot - b.x) * ((vy - BOARDS.bottom) / drop);
        return Math.abs(vx - along) < b.width * 2 + 40;
      });
    });
    this.beams.forEach((b, i) => {
      if (b.x < f.left - 400 || b.x > f.right + 400) return;
      const foot = this.beamFoot(b, hour);
      const k = sun * b.strength;
      sh.rect(b.x - 4, BOARDS.top, 4, BOARDS.bottom - BOARDS.top).fill({ color: 0xfff1c4, alpha: 0.9 * k });
      // Three nested wedges for a soft edge, widening toward the floor.
      for (const [spread, alpha] of [
        [3.2, 0.035],
        [2.1, 0.05],
        [1.2, 0.07],
      ] as const) {
        const top = b.width * 0.5 * spread * 0.5;
        const bottom = b.width * spread + 30 * spread;
        sh.poly([
          b.x - 2 - top,
          BOARDS.bottom,
          b.x - 2 + top,
          BOARDS.bottom,
          foot + bottom / 2,
          FLOOR,
          foot - bottom / 2,
          FLOOR,
        ]).fill({ color: PORCH.light, alpha: alpha * k });
      }
      sh.ellipse(foot, FLOOR - 2, b.width * 2 + 40, 9).fill({ color: PORCH.light, alpha: 0.22 * k });
      if (stirred[i]) for (const m of this.motes) if (m.beam === i) m.vx += (Math.random() - 0.5) * 0.25;
    });
    for (const m of this.motes) {
      const b = this.beams[m.beam]!;
      m.vx += (Math.random() - 0.5) * 0.015;
      m.vy += (Math.random() - 0.5) * 0.015 - 0.001;
      m.vx *= 0.97;
      m.vy *= 0.97;
      m.x = (m.x + m.vx * f.dt + 1) % 1;
      m.y = (m.y + m.vy * f.dt * 0.4 + 1) % 1;
      const y = BOARDS.bottom + m.y * drop;
      const center = b.x + slant * (y - BOARDS.bottom);
      const half = (b.width * 0.6 + (b.width * 2 + 30) * m.y) / 2;
      const x = center + (m.x - 0.5) * 2 * half;
      // Brightest in the middle of the beam, twinkling as they turn.
      const edge = 1 - Math.abs(m.x - 0.5) * 2;
      const tw = 0.6 + 0.4 * Math.sin(f.time * 3 + m.size * 7 + m.beam);
      sh.circle(x, y, m.size).fill({ color: 0xfff6d8, alpha: 0.75 * sun * b.strength * edge * tw });
    }
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
    const colors = LAMP_COLORS;
    pts.forEach(([x, y], i) => {
      g.rect(x - 6, y - 4, 12, 10)
        .fill(0x6a6878)
        .stroke(soft(2, 0.7));
      g.ellipse(x, y + 18, 13, 17)
        .fill(on ? mix(colors[i]!, 0xffffff, 0.35) : 0xcfd2e0)
        .stroke(stroke(3));
      if (on) g.ellipse(x - 4, y + 13, 4, 6).fill({ color: 0xffffff, alpha: 0.8 });
    });
    // Moths come to a lit lamp at night: fuzzy, pale, flapping round the bulbs.
    if (on && f.look.glow > 0.3)
      for (const m of this.moths) {
        m.a += f.dt * m.s;
        const mx = lamp.x + Math.cos(m.a) * m.r;
        const my = lamp.y + 40 + Math.sin(m.a * 1.3) * m.r * 0.4;
        const flap = Math.abs(Math.sin(f.time * 18 + m.r));
        const alpha = Math.min(1, (f.look.glow - 0.3) * 2);
        const face = Math.cos(m.a) > 0 ? -1 : 1;
        for (const side of [-1, 1]) {
          g.ellipse(mx + side * 6, my - 1, 7, 2 + flap * 6).fill({ color: 0xf2e6ff, alpha });
          g.ellipse(mx + side * 4, my + 4, 4, 1 + flap * 3).fill({ color: 0xd8c8f0, alpha });
        }
        g.ellipse(mx, my + 1, 3, 5).fill({ color: 0x8a76b8, alpha });
        g.moveTo(mx + face * 1, my - 4)
          .lineTo(mx + face * 5, my - 10)
          .moveTo(mx - face * 1, my - 4)
          .lineTo(mx - face * 3, my - 10)
          .stroke({ width: 1, color: 0x6b5ba6, alpha });
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

  /**
   * Silverfish dart from one shadow to the next along the floor (under the
   * junk pile, the shelf, the bench, the pots), wiggling as they go, and
   * wait there, just their feelers twitching.
   */
  private drawFish(g: Graphics, f: AreaFrame): void {
    for (const s of this.fish) {
      let moving = false;
      if (s.wait > 0) s.wait -= f.dt;
      else {
        moving = true;
        s.t += f.dt;
        const d = s.to - s.x;
        const step =
          Math.sign(d) * Math.min(Math.abs(d), 380 * f.dt * (0.6 + 0.4 * Math.abs(Math.sin(s.t * 9))));
        s.x += step;
        s.dir = d >= 0 ? 1 : -1;
        if (Math.abs(s.to - s.x) < 2) {
          s.wait = 2 + Math.random() * 7;
          const here = HIDEOUTS.indexOf(Math.round(s.to - this.ax) as (typeof HIDEOUTS)[number]);
          const next = Math.max(0, Math.min(HIDEOUTS.length - 1, here + (Math.random() < 0.5 ? -1 : 1)));
          s.to = this.ax + HIDEOUTS[next === here ? (here + 1) % HIDEOUTS.length : next]!;
        }
      }
      if (s.x < f.left - 100 || s.x > f.right + 100) continue;
      const y = FLOOR - 4;
      const wig = moving ? Math.sin(s.t * 30) * 2.5 : 0;
      const d = s.dir;
      // Tapering segments, head first.
      for (let k = 0; k < 5; k++) {
        const kx = s.x - d * k * 6;
        const ky = y + Math.sin(k * 1.2 + s.t * 30) * (moving ? 1.2 : 0);
        g.ellipse(kx, ky, 6 - k * 0.6, 4.4 - k * 0.5).fill(k % 2 ? 0xb8bfcf : 0xd2d8e4);
      }
      g.ellipse(s.x - d * 12, y, 17, 5.5).stroke({ width: 1.5, color: OUTLINE, alpha: 0.5 });
      // Three tail bristles and two long feelers.
      for (const a of [-0.35, 0, 0.35])
        g.moveTo(s.x - d * 28, y)
          .lineTo(s.x - d * (40 + Math.abs(a) * -6), y + a * 18 + wig)
          .stroke({ width: 1.3, color: 0xc7ccd8 });
      const tw = moving ? 0 : Math.sin(f.time * 11 + s.x) * 3;
      for (const a of [-1, 1])
        g.moveTo(s.x + d * 5, y - 2)
          .quadraticCurveTo(s.x + d * 16, y - 12 + a * 2, s.x + d * 26, y - 8 + a * 5 + tw * a)
          .stroke({ width: 1.3, color: 0xc7ccd8 });
      g.circle(s.x + d * 3, y - 1.5, 1.4).fill(OUTLINE);
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
    const sun = f.look.dapple * shaftStrength(hour) * (1 - 0.7 * f.weather.rain);
    // Warm pools where the sunbeams land.
    if (sun > 0.03)
      for (const b of this.beams) {
        const foot = this.beamFoot(b, hour);
        if (foot < f.left - 300 || foot > f.right + 300) continue;
        light(foot, FLOOR - 6, 70 + b.width * 2, PORCH.light, 0.4 * sun * b.strength, 1.8, 0.32);
      }
    // The lamp: the bulbs glow, and at night their pool of light is the room's focal point (R19).
    const lamp = this.fx('porch_lamp')[0];
    if (lamp && f.sim.places.state.lampOn) {
      const glow = f.look.glow;
      const pool = lampPool(glow);
      const flicker = 0.97 + 0.03 * Math.sin(f.time * 7.3) * Math.sin(f.time * 3.1);
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5;
        const bx = lamp.x - lamp.w / 2 + t * lamp.w;
        const by = BOARDS.bottom + 30 + Math.sin(t * Math.PI) * 50;
        light(bx, by + 18, 70 + glow * 40, LAMP_COLORS[i]!, (0.3 + glow * 0.25) * flicker);
        light(bx, by + 18, 20, 0xffffff, 0.25 + glow * 0.2);
      }
      light(lamp.x, 600, pool.radius, 0xffc98a, pool.alpha * flicker, 1.3, 0.95);
      light(lamp.x, 560, pool.radius * 0.45, 0xffe3a3, pool.alpha * 0.5 * flicker, 1.5, 0.8);
      // Where it falls on the floor.
      light(lamp.x, FLOOR - 4, pool.radius * 0.75, 0xffd9a0, pool.alpha * 0.7 * flicker, 1.5, 0.25);
    }
  }
}
