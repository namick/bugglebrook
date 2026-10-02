import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import { DEPTHS_LEVELS } from '../../../../game/data/hiddenAreas';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import type { Particles } from '../particles';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { ANTS, DEPTHS_LAMPS, LARVA_POCKETS } from './depths';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;
const L = DEPTHS_LEVELS;

/** A worker ant's beat: a stretch of floor (area-local x0..x1 at world y), walked back and forth. */
interface Walk {
  x0: number;
  x1: number;
  y: number;
}

const WALKS: readonly Walk[] = [
  { x0: 1, x1: 10.6, y: L.top },
  { x0: 21.9, x1: 25.2, y: L.top },
  { x0: 1, x1: 5.4, y: L.middle },
  { x0: 21.9, x1: 25.2, y: L.middle },
  { x0: 1, x1: 5.5, y: L.bottom },
  { x0: 9.6, x1: 16.3, y: L.bottom },
  { x0: 16.9, x1: 18.2, y: 9.12 },
  { x0: 19.8, x1: 21.2, y: 9.12 },
  { x0: 21.7, x1: 23.1, y: L.bottom },
];

/** Where the ants sleep at night, in rows (area-local x0, x1, floor y). */
const BEDS: readonly Walk[] = [
  { x0: 1.1, x1: 5.3, y: L.bottom },
  { x0: 9.8, x1: 16.1, y: L.bottom },
  { x0: 1.1, x1: 5.2, y: L.middle },
];

interface Worker {
  walk: number;
  speed: number;
  phase: number;
  carry: number;
  size: number;
}

const CARRY_COLORS = [ANTS.crumb, 0x6b8f3a, 0xd23c3c, 0xf2dfb0, 0x9b6a3a];

/** One worker ant, side on, feet at (x, y), facing `dir`. Drawn in px. */
export function drawAnt(
  g: Graphics,
  x: number,
  y: number,
  dir: 1 | -1,
  s: number,
  t: number,
  opts: { carry?: number | null; umbrella?: boolean; asleep?: boolean; arms?: number; kick?: number } = {},
): void {
  const legs = opts.asleep ? 0 : Math.sin(t * 16);
  const by = y - 9 * s;
  const line = { width: 1.6 * s, color: OUTLINE, alpha: 0.9, cap: 'round' as const };
  // Legs: three pairs, scuttling.
  if (!opts.asleep)
    for (let k = -1; k <= 1; k++) {
      const lx = x + k * 5 * s;
      const swing = (k % 2 === 0 ? legs : -legs) * 3 * s;
      g.moveTo(lx, by + 2 * s)
        .lineTo(lx + swing - 2 * s, y)
        .stroke(line);
    }
  if (opts.kick)
    g.moveTo(x - dir * 6 * s, by + 2 * s)
      .lineTo(x - dir * (12 + 6 * opts.kick) * s, y - 6 * s * opts.kick)
      .stroke(line);
  // Body: abdomen, waist, thorax, head.
  g.ellipse(x - dir * 7 * s, by - 1 * s, 7 * s, 5.5 * s)
    .fill(ANTS.ant)
    .stroke({ width: 1.6 * s, color: OUTLINE, alpha: 0.85 });
  g.ellipse(x, by - 1 * s, 4 * s, 3.4 * s)
    .fill(ANTS.ant)
    .stroke({ width: 1.4 * s, color: OUTLINE, alpha: 0.85 });
  const hx = x + dir * 7 * s;
  const hy = by - (opts.asleep ? 0 : 3) * s;
  g.circle(hx, hy, 4.4 * s)
    .fill(ANTS.antDark)
    .stroke({ width: 1.4 * s, color: OUTLINE, alpha: 0.85 });
  // A shine on the abdomen.
  g.ellipse(x - dir * 8 * s, by - 3.5 * s, 2.6 * s, 1.4 * s).fill({ color: 0xffffff, alpha: 0.35 });
  if (opts.asleep) {
    g.moveTo(hx + dir * 0.5 * s, hy - 0.5 * s)
      .lineTo(hx + dir * 3 * s, hy - 0.5 * s)
      .stroke({ width: 1.2 * s, color: 0xffffff, alpha: 0.8 });
  } else {
    g.circle(hx + dir * 1.8 * s, hy - 1.2 * s, 1.3 * s).fill(0xffffff);
    // Feelers.
    const wag = Math.sin(t * 5) * 1.5 * s;
    g.moveTo(hx + dir * 2 * s, hy - 3 * s)
      .quadraticCurveTo(hx + dir * 6 * s, hy - 10 * s + wag, hx + dir * 10 * s, hy - 8 * s + wag)
      .stroke(line);
  }
  // Arms up (the conveyor, the cheer, the conga).
  if (opts.arms) {
    const up = opts.arms;
    g.moveTo(x + dir * 2 * s, by - 2 * s)
      .lineTo(x + dir * 4 * s, by - (6 + 8 * up) * s)
      .stroke(line);
    g.moveTo(x - dir * 1 * s, by - 2 * s)
      .lineTo(x - dir * 1 * s, by - (6 + 7 * up) * s)
      .stroke(line);
  }
  if (opts.carry !== null && opts.carry !== undefined) {
    // A load over its head: a crumb, a seed, a bit of leaf.
    g.ellipse(x + dir * 3 * s, by - 13 * s, 6 * s, 4.5 * s)
      .fill(opts.carry)
      .stroke({ width: 1.4 * s, color: OUTLINE, alpha: 0.8 });
  }
  if (opts.umbrella) {
    // A tiny leaf held up against the drips.
    const ux = x + dir * 2 * s;
    g.moveTo(ux, by - 2 * s)
      .lineTo(ux, by - 18 * s)
      .stroke({ width: 1.4 * s, color: 0x4e7a2a });
    g.moveTo(ux - 11 * s, by - 16 * s)
      .quadraticCurveTo(ux, by - 30 * s, ux + 11 * s, by - 16 * s)
      .quadraticCurveTo(ux, by - 20 * s, ux - 11 * s, by - 16 * s)
      .fill(0x6fbf4a)
      .stroke({ width: 1.4 * s, color: OUTLINE, alpha: 0.8 });
  }
}

/**
 * The Ant Hill Depths, alive (M10): worker ants hauling crumbs along every
 * tunnel, the ant line on the middle level passing things to the pantry,
 * the queen on her throne (she dances when fed, and snoozes at night), the
 * nursery's larvae (they wiggle when poked), the root knot and the glint
 * behind it, the pantry's pile and its guards, amber lamps, the light down
 * the shaft. At night the ants sleep in rows and snore in unison; in rain,
 * water trickles down the shaft and the ants hold leaf umbrellas; with the
 * flowerbed's music playing through the bluebells, they conga.
 */
export class DepthsLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly ax: number;
  private readonly workers: Worker[] = [];
  private readonly wiggle: Record<string, number> = {};
  private cheer = 0;
  private queenPoke = 0;
  /** The root's yank, 0 to 1 while it plays. */
  private yank = -1;
  private snoreAt = 0;
  private drops: { x: number; y: number; v: number }[] = [];

  constructor(
    private readonly area: AreaDef,
    private readonly pile: readonly (readonly [number, number])[],
  ) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
    // A fixed colony, the same every time.
    for (let i = 0; i < 22; i++)
      this.workers.push({
        walk: i % WALKS.length,
        speed: 0.28 + ((i * 37) % 10) * 0.025,
        phase: (i * 0.618) % 1,
        carry: i % 3 === 0 ? -1 : i % CARRY_COLORS.length,
        size: 1.05 + ((i * 13) % 5) * 0.06,
      });
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    const px = (m: number): number => m * PPM;
    return [
      ev.on('larva_wiggled', (e) => {
        this.wiggle[e.fixture] = 1;
        particles.boop(px(e.x), px(e.y) - 20);
      }),
      ev.on('queen_fed', (e) => {
        this.cheer = 2.4;
        particles.hearts(px(e.x), px(e.y) - 80, 6);
        particles.sparkles(px(e.x), px(e.y) - 40, 10);
      }),
      ev.on('queen_gave', (e) => particles.sparkles(px(e.x), px(e.y) - 60, 14)),
      ev.on('queen_poked', () => (this.queenPoke = 1)),
      ev.on('root_poked', () => (this.wiggle.root = 1)),
      ev.on('root_pulled', (e) => {
        this.yank = 0;
        particles.dust(px(e.x), px(e.y) + 60, 1);
        for (let i = 0; i < 4; i++) particles.crumbs(px(e.x) + (i - 2) * 20, px(e.y) - 80, ANTS.earth);
        particles.stars(px(e.x) + 60, px(e.y));
      }),
      ev.on('conveyor_took', (e) => particles.dust(px(e.x), px(e.y) + 10, 0.3)),
      ev.on('pantry_scrap_found', (e) => particles.sparkles(px(e.x), px(e.y), 10)),
      ev.on('ants_conga', () => (this.cheer = 1.2)),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    const dt = f.dt;
    this.cheer = Math.max(0, this.cheer - dt);
    this.queenPoke = Math.max(0, this.queenPoke - dt * 1.5);
    for (const k of Object.keys(this.wiggle)) this.wiggle[k] = Math.max(0, this.wiggle[k]! - dt * 0.8);
    if (this.yank >= 0) this.yank = this.yank + dt / 0.9 >= 1 ? -1 : this.yank + dt / 0.9;
    if (!this.shows(f)) return;
    const night = f.sim.weather.night;
    const rain = f.weather.rain;
    const depths = f.sim.hidden.depths;
    this.drawLamps(g, f);
    this.drawShaft(g, fg, f, rain);
    this.drawPile(g, f, night);
    this.drawRoot(g, fg, f);
    this.drawLarvae(g, f);
    this.drawConveyor(g, f, night);
    this.drawQueen(fg, f, night);
    if (night) this.drawSleepers(g, f);
    else if (depths.state.conga) this.drawConga(g, f);
    else this.drawWorkers(g, f, rain > 0.3);
  }

  private px(m: number): number {
    return this.ax + m * PPM;
  }

  /** Amber firefly jars hanging from the tunnel ceilings. */
  private drawLamps(g: Graphics, f: AreaFrame): void {
    for (const [x, y] of DEPTHS_LAMPS) {
      const lx = this.px(x);
      const ly = y * PPM;
      const flick = 0.85 + 0.15 * Math.sin(f.time * 7 + x * 3);
      g.roundRect(lx - 13, ly - 16, 26, 30, 9)
        .fill({ color: mix(ANTS.amber, 0xffffff, 0.3), alpha: 0.95 })
        .stroke(stroke(3));
      g.roundRect(lx - 14, ly - 22, 28, 8, 3)
        .fill(0x9b6a3a)
        .stroke(stroke(2.5));
      g.circle(lx + Math.sin(f.time * 2 + x) * 4, ly + 1, 5 * flick).fill(0xfff3c4);
    }
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    for (const [x, y] of DEPTHS_LAMPS) {
      const flick = 0.9 + 0.1 * Math.sin(f.time * 7 + x * 3);
      light(this.px(x), y * PPM, 190, ANTS.amber, 0.42 * flick);
    }
    // Light from the plaza down the shaft: daylight, or moonlight.
    const day = 1 - f.look.glow;
    const sx = this.px(4);
    light(sx, 140, 150, day > 0.5 ? 0xfff4d0 : 0xa8b8ff, 0.18 + 0.3 * day, 0.9, 2.2);
    // The queen's crown glints, and the nose behind the root.
    const q = this.px(19);
    light(q - 40, 690, 90, 0xffd23f, 0.25 + 0.1 * Math.sin(f.time * 3));
  }

  /** The shaft: a ray of light, and in the rain, water trickling down to a puddle. */
  private drawShaft(g: Graphics, fg: Graphics, f: AreaFrame, rain: number): void {
    const x0 = this.px(3.25);
    const x1 = this.px(4.75);
    const day = 1 - f.look.glow;
    g.rect(x0 + 10, 0, x1 - x0 - 20, 22).fill({ color: day > 0.5 ? 0xd6f0ff : 0x2a3470, alpha: 0.9 });
    g.poly([x0 + 20, 15, x1 - 20, 15, x1 + 30, L.top * PPM, x0 - 30, L.top * PPM]).fill({
      color: day > 0.5 ? 0xfff4d0 : 0xa8b8ff,
      alpha: 0.06 + 0.08 * day,
    });
    if (rain < 0.05) {
      this.drops = [];
      return;
    }
    // Drips down the shaft wall, and a little puddle at the bottom.
    if (Math.random() < f.dt * 14 * rain && this.drops.length < 30)
      this.drops.push({ x: this.px(3.5 + Math.random() * 1.0), y: 20, v: 200 + Math.random() * 120 });
    this.drops = this.drops.filter((d) => {
      d.v += 900 * f.dt;
      d.y += d.v * f.dt;
      return d.y < L.top * PPM - 4;
    });
    for (const d of this.drops)
      fg.moveTo(d.x, d.y)
        .lineTo(d.x, d.y + 12)
        .stroke({ width: 3, color: 0xbfe3ff, alpha: 0.75, cap: 'round' });
    // A thin trickle down one side.
    const tx = this.px(3.45);
    fg.moveTo(tx, 18)
      .bezierCurveTo(tx + 6, 120, tx - 6, 220, tx + 4, L.top * PPM - 6)
      .stroke({ width: 3 + 2 * rain, color: 0xbfe3ff, alpha: 0.5 * rain, cap: 'round' });
    g.ellipse(this.px(4), L.top * PPM - 2, 60 * rain + 20, 7).fill({ color: 0x7fb2d8, alpha: 0.55 * rain });
  }

  /** The pantry's heap, with guards by day, a paper corner sticking out, and sleepers at night. */
  private drawPile(g: Graphics, f: AreaFrame, night: boolean): void {
    const pts = this.pile.flatMap(([x, y]) => [this.px(x), y * PPM]);
    if (pts.length < 4) return;
    const first = this.pile[0]!;
    const last = this.pile[this.pile.length - 1]!;
    g.poly([...pts, this.px(last[0]), 9.35 * PPM, this.px(first[0]), 9.35 * PPM]).fill(ANTS.crumb);
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke(stroke(4));
    // Crumbs, seeds, and berries in the heap (fixed spots, so it does not flicker).
    for (let i = 0; i < 34; i++) {
      const u = ((i * 0.618) % 1) * 0.86 + 0.07;
      const x = first[0] + (last[0] - first[0]) * u;
      const top = this.topAt(x);
      const depth = ((i * 0.37) % 1) * (9.3 - top) * 0.8;
      const color = [0xc98a3a, 0xf2dfb0, 0xd23c3c, 0x9b6a3a, 0x6b8f3a][i % 5]!;
      g.ellipse(this.px(x), (top + 0.08 + depth) * PPM, 7 + (i % 3) * 3, 5 + (i % 2) * 2)
        .fill(color)
        .stroke({ width: 1.5, color: OUTLINE, alpha: 0.5 });
    }
    // A sugar cube on top: the ants' pride.
    const peak = this.topAt(7.5);
    g.roundRect(this.px(7.5) - 16, peak * PPM - 22, 32, 28, 4)
      .fill(0xfffdf6)
      .stroke(stroke(3));
    // The map scrap's corner, until it comes out at night.
    const scrapOut =
      f.sim.secrets.includes('secret_map_scrap_2') || f.views.some((v) => v.defId === 'item_map_scrap_2');
    if (!scrapOut) {
      const cx = this.px(8.05);
      const cy = this.topAt(8.05) * PPM + 4;
      g.poly([cx - 16, cy + 10, cx + 20, cy - 18, cx + 26, cy + 8])
        .fill(0xf2dfb0)
        .stroke(stroke(2.5));
      g.moveTo(cx + 2, cy + 2)
        .lineTo(cx + 18, cy - 8)
        .stroke({ width: 2, color: 0x8b5a3c, alpha: 0.8 });
    }
    // Two guards with twig spears by day, nodding off at night.
    for (const [x, dir] of [
      [6.55, 1],
      [8.7, -1],
    ] as const) {
      const gx = this.px(x);
      const gy = this.topAt(x) * PPM;
      if (night) {
        drawAnt(g, gx, gy, dir, 2, f.time, { asleep: true });
        continue;
      }
      g.moveTo(gx + dir * 8, gy - 8)
        .lineTo(gx + dir * 8, gy - 52)
        .stroke({ width: 3, color: 0x9b6a3a, cap: 'round' });
      g.poly([gx + dir * 8 - 5, gy - 50, gx + dir * 8 + 5, gy - 50, gx + dir * 8, gy - 62])
        .fill(0xc9ced6)
        .stroke(stroke(1.5));
      drawAnt(g, gx, gy, dir, 2, f.time * 0.2, { arms: 0.5 });
    }
  }

  /** Height of the pile (world y) at area-local x. */
  private topAt(x: number): number {
    const p = this.pile;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1]!;
      const [x1, y1] = p[i]!;
      if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return 9.2;
  }

  /** The root knot in the dead end, and the shiny thing behind it. */
  private drawRoot(g: Graphics, fg: Graphics, f: AreaFrame): void {
    const stuck = f.sim.hidden.depths.rootStuck;
    const x = this.px(23.6);
    const top = 7 * PPM;
    const floor = 9 * PPM;
    if (stuck) {
      // The glint: something shiny peeking between the roots.
      const tw = Math.max(0, Math.sin(f.time * 2.3));
      g.ellipse(this.px(24.75), 8.72 * PPM, 22, 18)
        .fill(0xf2a08a)
        .stroke(stroke(3));
      fg.circle(this.px(24.6), 8.6 * PPM, 3 + 6 * tw).fill({ color: 0xffffff, alpha: 0.9 * tw });
    }
    const sway = Math.sin(f.time * 9) * 6 * (this.wiggle.root ?? 0);
    const up = stuck ? 0 : this.yank >= 0 ? easeIn(this.yank) : 1;
    const len = (floor - top) * (1 - up * 0.82);
    const strands: readonly [number, number, number][] = [
      [-22, 16, 18],
      [0, -14, 22],
      [20, 10, 16],
      [-8, 22, 12],
    ];
    // Outlines first, so the strands read as one twisted bundle.
    for (const [dx, bend, w] of strands) {
      const sx = x + dx;
      fg.moveTo(sx, top - 10)
        .bezierCurveTo(
          sx + bend + sway,
          top + len * 0.35,
          sx - bend + sway,
          top + len * 0.7,
          sx + dx * 0.5 + sway,
          top + len,
        )
        .stroke({ width: w + 8, color: OUTLINE, cap: 'round' });
    }
    for (const [dx, bend, w] of strands) {
      const sx = x + dx;
      fg.moveTo(sx, top - 10)
        .bezierCurveTo(
          sx + bend + sway,
          top + len * 0.35,
          sx - bend + sway,
          top + len * 0.7,
          sx + dx * 0.5 + sway,
          top + len,
        )
        .stroke({ width: w, color: ANTS.root, cap: 'round' });
      fg.moveTo(sx, top - 10)
        .bezierCurveTo(
          sx + bend + sway,
          top + len * 0.35,
          sx - bend + sway,
          top + len * 0.7,
          sx + dx * 0.5 + sway,
          top + len,
        )
        .stroke({ width: w * 0.35, color: lighten(ANTS.root, 0.25), alpha: 0.6, cap: 'round' });
    }
    if (stuck) {
      // A knot where they twist together, and little hairs.
      fg.ellipse(x + sway, top + len * 0.5, 34, 26)
        .fill(darken(ANTS.root, 0.1))
        .stroke(stroke(4));
      fg.ellipse(x - 8 + sway, top + len * 0.5 - 6, 12, 6).fill({
        color: lighten(ANTS.root, 0.3),
        alpha: 0.7,
      });
      for (let i = 0; i < 6; i++)
        fg.moveTo(x - 30 + i * 12 + sway, floor - 4)
          .lineTo(x - 36 + i * 13 + sway, floor + 6)
          .stroke({ width: 2, color: ANTS.root });
    }
  }

  /** The larvae: plump, pale, asleep in their pockets, wiggling when poked. */
  private drawLarvae(g: Graphics, f: AreaFrame): void {
    LARVA_POCKETS.forEach(([x, y], i) => {
      const id = ['fix_larva_west', 'fix_larva_middle', 'fix_larva_east'][i]!;
      const w = this.wiggle[id] ?? 0;
      const breathe = 1 + 0.05 * Math.sin(f.time * 1.8 + i);
      const lx = this.px(x);
      const ly = y * PPM + 6;
      const curl = Math.sin(f.time * 14) * 0.35 * w;
      // A curled "C" of segments.
      for (let k = 0; k < 6; k++) {
        const a = Math.PI * 0.15 + (k / 5) * Math.PI * 1.1 + curl * (k / 5);
        const sx = lx + Math.cos(a) * 22;
        const sy = ly + Math.sin(a) * 14 - 4;
        const r = (11 - Math.abs(k - 2.5) * 1.2) * breathe;
        g.circle(sx, sy, r).fill(0xfff3dc).stroke({ width: 2.5, color: OUTLINE, alpha: 0.8 });
      }
      const hx = lx + Math.cos(Math.PI * 0.15 + curl) * 22;
      const hy = ly + Math.sin(Math.PI * 0.15 + curl) * 14 - 4;
      g.circle(hx, hy, 8).fill(0xffc98a).stroke(stroke(2.5));
      if (w > 0.2) g.circle(hx + 2, hy - 2, 2).fill(OUTLINE);
      else
        g.moveTo(hx - 2, hy - 2)
          .lineTo(hx + 3, hy - 2)
          .stroke({ width: 1.5, color: OUTLINE });
    });
  }

  /** The ant line on the middle level: arms up, passing things along to the left. */
  private drawConveyor(g: Graphics, f: AreaFrame, night: boolean): void {
    const line = f.sim.content.areas.get(this.area.id).fixtures?.find((q) => q.kind === 'ant_conveyor');
    if (!line) return;
    const half = (line.w ?? 6) / 2;
    const y = line.y * PPM;
    let i = 0;
    for (let x = line.x - half + 0.2; x <= line.x + half; x += 0.46, i++) {
      const wave = night ? 0 : 0.5 + 0.5 * Math.sin(f.time * 7 + x * 2.4);
      drawAnt(g, this.px(x), y, -1, 1.8, f.time + i, { asleep: night, arms: night ? 0 : wave });
    }
  }

  /** The queen on her thimble throne. */
  private drawQueen(g: Graphics, f: AreaFrame, night: boolean): void {
    const depths = f.sim.hidden.depths;
    const dancing = depths.queenDancing;
    const qx = this.px(19);
    const seat = 8.15 * PPM;
    const t = f.time;
    const sway = dancing ? Math.sin(t * 10) * 12 : this.queenPoke * Math.sin(t * 20) * 5;
    const bob = dancing ? Math.abs(Math.sin(t * 10)) * -8 : Math.sin(t * 1.6) * 2;
    const asleep = night && !dancing;
    const x = qx + sway;
    const y = seat + bob;
    const line = { width: 5, color: OUTLINE, alpha: 0.95, cap: 'round' as const };
    // Legs down to the throne's rim.
    for (const [dx, foot] of [
      [-18, -40],
      [2, -6],
      [20, 26],
    ] as const) {
      g.moveTo(x + dx, y - 40)
        .lineTo(qx + foot, seat + 4)
        .stroke(line);
    }
    // Abdomen (big and round, striped), thorax, head turned to the left.
    g.ellipse(x + 38, y - 44, 52, 40)
      .fill(ANTS.ant)
      .stroke(stroke(4));
    for (const k of [0, 1, 2])
      g.moveTo(x + 18 + k * 18, y - 80)
        .quadraticCurveTo(x + 24 + k * 18, y - 44, x + 18 + k * 18, y - 8)
        .stroke({ width: 3, color: ANTS.antDark, alpha: 0.7 });
    g.ellipse(x + 30, y - 62, 14, 8).fill({ color: 0xffffff, alpha: 0.3 });
    g.ellipse(x - 14, y - 52, 22, 18)
      .fill(ANTS.ant)
      .stroke(stroke(4));
    const hx = x - 46;
    const hy = y - (asleep ? 62 : 78);
    g.circle(hx, hy, 26).fill(ANTS.antDark).stroke(stroke(4));
    // Arms: waving in the dance, folded otherwise.
    const wave = dancing ? Math.sin(t * 10) : 0;
    g.moveTo(x - 24, y - 52)
      .lineTo(x - 44 - 10 * wave, y - (dancing ? 104 : 40))
      .stroke(line);
    g.moveTo(x - 10, y - 50)
      .lineTo(x - 18 + 10 * wave, y - (dancing ? 108 : 36))
      .stroke(line);
    // Face: big eyes (or shut), a smile, the monocle until she gives it away.
    if (asleep) {
      for (const ex of [-10, 8])
        g.moveTo(hx + ex - 6, hy - 2)
          .quadraticCurveTo(hx + ex, hy + 3, hx + ex + 6, hy - 2)
          .stroke({ width: 2.5, color: 0xffffff });
    } else {
      for (const ex of [-10, 8]) {
        g.circle(hx + ex, hy - 4, 7).fill(0xffffff);
        g.circle(hx + ex - 1, hy - 3, 3.5).fill(OUTLINE);
      }
      if (!f.sim.secrets.includes('secret_queen_sweet')) {
        g.circle(hx + 8, hy - 4, 10).stroke({ width: 3, color: 0xe8b84a });
        g.moveTo(hx + 17, hy)
          .quadraticCurveTo(hx + 22, hy + 16, hx + 14, hy + 30)
          .stroke({ width: 1.5, color: 0xe8b84a });
      }
    }
    g.moveTo(hx - 10, hy + 10)
      .quadraticCurveTo(hx - 1, hy + (dancing ? 20 : 15), hx + 8, hy + 10)
      .stroke({ width: 2.5, color: 0xffffff, cap: 'round' });
    // Feelers.
    for (const s of [-1, 1])
      g.moveTo(hx + s * 8, hy - 22)
        .quadraticCurveTo(hx + s * 18, hy - 50 + Math.sin(t * 3 + s) * 4, hx + s * 6 - 14, hy - 58)
        .stroke(line);
    // The bottle-cap crown, crimped, tilted.
    const cy = hy - 30;
    g.poly([
      hx - 22,
      cy + 8,
      hx - 26,
      cy - 14,
      hx - 14,
      cy - 4,
      hx - 4,
      cy - 20,
      hx + 6,
      cy - 4,
      hx + 18,
      cy - 16,
      hx + 18,
      cy + 8,
    ])
      .fill(0xe8453c)
      .stroke(stroke(3));
    g.circle(hx - 4, cy - 2, 4).fill(0xffd23f);
    if (asleep) {
      if (Math.sin(t * 1.2) > 0.98) f.particles.zzz(hx, hy - 30, -1);
    }
    // Hover clue: she dreams of sweets.
    const hand = f.hand;
    if (!asleep && !dancing && hand && Math.hypot(hand.x - qx, hand.y - (seat - 60)) < 120) {
      const bx = qx - 110;
      const by = seat - 190;
      for (const [ox, oy, r] of [
        [-22, 0, 22],
        [10, -10, 24],
        [30, 4, 20],
      ] as const)
        g.circle(bx + ox, by + oy, r)
          .fill(0xffffff)
          .stroke(stroke(3.5));
      g.ellipse(bx + 4, by + 2, 40, 20).fill(0xffffff);
      g.circle(bx + 30, by + 40, 7)
        .fill(0xffffff)
        .stroke(stroke(3));
      // A wrapped sweet.
      g.ellipse(bx + 4, by - 2, 13, 10)
        .fill(0xff5fa2)
        .stroke(stroke(2.5));
      g.poly([bx - 9, by - 2, bx - 20, by - 10, bx - 20, by + 6])
        .fill(0xff9fd0)
        .stroke(stroke(2));
      g.poly([bx + 17, by - 2, bx + 28, by - 10, bx + 28, by + 6])
        .fill(0xff9fd0)
        .stroke(stroke(2));
    }
  }

  /** Workers on their beats, carrying crumbs to the pantry; umbrellas up in the rain. */
  private drawWorkers(g: Graphics, f: AreaFrame, rain: boolean): void {
    const root = f.sim.hidden.depths.rootStuck;
    const cheer = this.cheer > 0;
    const hand = f.hand;
    for (const w of this.workers) {
      const walk = WALKS[w.walk]!;
      const x1 = w.walk === WALKS.length - 1 && !root ? 25.2 : walk.x1;
      const span = Math.max(0.5, x1 - walk.x0);
      const u = (f.time * w.speed) / span + w.phase;
      const tri = u % 2 < 1 ? u % 1 : 1 - (u % 1);
      const dir: 1 | -1 = u % 2 < 1 ? 1 : -1;
      let x = this.px(walk.x0 + tri * span);
      let y = walk.y * PPM;
      // Ants dodge the hand with a hop.
      if (hand && Math.abs(hand.x - x) < 50 && Math.abs(hand.y - y) < 60) {
        y -= 12;
        x += Math.sign(x - hand.x) * 10;
      }
      if (cheer) y -= Math.abs(Math.sin(f.time * 12 + w.phase * 6)) * 10;
      const carry = !cheer && w.carry >= 0 && dir < 0 ? CARRY_COLORS[w.carry]! : null;
      drawAnt(g, x, y, dir, w.size * 1.85, f.time * w.speed * 3 + w.phase * 10, {
        carry,
        umbrella: rain && !cheer,
        arms: cheer ? 1 : 0,
      });
    }
  }

  /** Night: the colony asleep in rows, breathing (and snoring) together. */
  private drawSleepers(g: Graphics, f: AreaFrame): void {
    const breathe = Math.sin(f.time * 1.6);
    let n = 0;
    for (const bed of BEDS)
      for (let x = bed.x0; x <= bed.x1; x += 0.56, n++) {
        const s = 1.8 * (1 + 0.05 * breathe);
        drawAnt(g, this.px(x), bed.y * PPM, n % 2 ? 1 : -1, s, 0, { asleep: true });
      }
    // In unison: every snore, a few Zs go up at once.
    if (f.time - this.snoreAt > 3.9) {
      this.snoreAt = f.time;
      for (const bed of BEDS) f.particles.zzz(this.px((bed.x0 + bed.x1) / 2), bed.y * PPM - 30, 1);
      f.sound('ant_snore', 0.8);
    }
  }

  /** The conga: every worker in two lines, kicking on the beat. */
  private drawConga(g: Graphics, f: AreaFrame): void {
    const beat = f.music?.beat ?? f.time * 1.6;
    const lines: readonly { y: number; x0: number; x1: number; dir: 1 | -1; n: number }[] = [
      { y: L.bottom, x0: 1, x1: 23, dir: 1, n: 14 },
      { y: L.top, x0: 1, x1: 10.6, dir: -1, n: 8 },
    ];
    for (const ln of lines) {
      const len = ln.x1 - ln.x0;
      for (let i = 0; i < ln.n; i++) {
        const along = (((beat * 0.25 + i * (len / ln.n)) % len) + len) % len;
        const x = ln.dir > 0 ? ln.x0 + along : ln.x1 - along;
        // Fade in and out at the ends, as if round a bend.
        const edge = Math.min(along, len - along);
        if (edge < 0.15) continue;
        const kick = Math.max(0, Math.sin((beat + i * 0.5) * Math.PI));
        const hop = Math.abs(Math.sin(beat * Math.PI)) * 6;
        drawAnt(g, this.px(x), ln.y * PPM - hop, ln.dir, 1.9, beat * 2 + i, { arms: 0.6, kick });
      }
    }
    if (Math.sin(f.time * 3) > 0.97) f.particles.sparkles(this.px(12), L.bottom * PPM - 80, 3);
  }
}

function easeIn(t: number): number {
  return t * t;
}
