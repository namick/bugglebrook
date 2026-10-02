import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { HOUR, timeOfDay } from '../../../../game/systems/sky';
import { MUSHROOMS } from '../background';
import type { CritterKind, Pt, Shy } from '../critters';
import {
  CRITTER_BUDGET,
  along,
  antAt,
  birdBeat,
  blink,
  calm,
  chirp,
  critterSky,
  cruise,
  dodge,
  drift,
  flit,
  hash,
  onScreen,
  orbit,
  outOf,
  pathLength,
  presence,
  row,
  skate,
  wormRise,
} from '../critters';
import { OUTLINE, darken, lighten, mix } from '../palette';
import { drawPicto } from '../draw/pictogram';
import { soft } from './common';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';
import { NEON } from './treehouse';

const PPM = PIXELS_PER_METER;

/** One critter: its kind, its seed, and its dodge. */
interface Critter {
  kind: CritterKind;
  seed: number;
  shy: Shy;
  /** Where it was drawn this frame (world px), or null if it was not. */
  at: Pt | null;
  /** Its own spot or patch, per kind. */
  home: Pt;
  /** A second number per kind: a light's radius, a patch's width. */
  span: number;
}

/** A critter drawn this frame, for the test hook. */
export interface CritterInfo {
  area: string;
  kind: CritterKind;
  /** World meters. */
  x: number;
  y: number;
  /** Dodging the hand or a bug right now. */
  startled: boolean;
}

/** The surface of the pond at a world-pixel x, or null where there is no water. */
export type SurfaceFn = (xPx: number) => number | null;

/** Each area's critters drawn in a frame stay within half the budget: at most two areas show at once. */
const AREA_CAP = CRITTER_BUDGET / 2;

const BUTTERFLY_COLORS = [0xffd23f, 0x9fd8ff, 0xff9f5a, 0xf7f3e8];

/**
 * The ambient critters of one area (R04): render-only scenery that acts on
 * its own and dodges the hand and bugs. Motion comes from `critters.ts`
 * (pure); this draws it with thin, faint outlines and flat colors so no
 * critter reads as a grabbable thing. Off-screen areas skip all work.
 */
export class CritterLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly ax: number;
  private readonly critters: Critter[] = [];
  /** Pooled Graphics, one per critter drawn about its own origin, behind and in front of entities. */
  private readonly backPool: { list: Graphics[]; used: number } = { list: [], used: 0 };
  private readonly frontPool: { list: Graphics[]; used: number } = { list: [], used: 0 };
  /** Butterfly and bee perches (flower heads, mushroom caps, the stump), world px. */
  private perches: Pt[] = [];
  /** Lights moths gather at, world px. */
  private lamps: Pt[] = [];
  /** The ant hill's door, world px (the plaza only). */
  private antDoor: Pt | null = null;
  private antPath: number[] = [];
  private antTarget = 0;
  private wormDuck = 0;
  private birdsAway = 0;
  private readonly wx: number;
  private readonly wy: number;
  /** What was drawn this frame (test hook). */
  drawn: CritterInfo[] = [];

  constructor(
    private readonly area: AreaDef,
    sim: Sim,
    private readonly surface: SurfaceFn = () => null,
  ) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.wx = this.ax + 3.4 * PPM;
    this.wy = 3.3 * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
    this.plan(sim);
  }

  private add(kind: CritterKind, n: number, home: (i: number) => Pt, span = 0): void {
    for (let i = 0; i < n; i++)
      this.critters.push({
        kind,
        seed: this.critters.length * 7.31 + this.area.xStart * 0.13 + 1,
        shy: calm(),
        at: null,
        home: home(i),
        span,
      });
  }

  /** Each area's cast, from the design doc's "Ambient critters" lists (the porch has its own). */
  private plan(sim: Sim): void {
    const ax = this.ax;
    const ground = (xPx: number): number => sim.surfaceY(xPx / PPM) * PPM;
    const at = (lx: number, dy = 0): Pt => ({ x: ax + lx, y: ground(ax + lx) + dy });
    switch (this.area.id) {
      case 'area_flowerbed_stage': {
        // Flower heads, matching `FlowerbedLive`'s stems.
        const heads: [number, number][] = [
          [700, 300],
          [790, 420],
          [1065, 360],
          [1240, 250],
          [3010, 320],
          [3095, 430],
          [3165, 260],
        ];
        this.perches = heads.map(([x, h]) => at(x, -h - 34));
        this.lamps = [1650, 1870, 2090].map((x) => ({ x: ax + x, y: 330 }));
        this.add('butterfly', 3, (i) => this.perches[i * 2]!);
        this.add('bee', 1, () => this.perches[1]!);
        this.add('moth', 6, (i) => this.lamps[i % 3]!, 70);
        this.add('firefly', 6, (i) => at(450 + i * 480, -170 - (i % 3) * 60), 120);
        this.add('cricket', 2, (i) => at(i === 0 ? 420 : 2600, -4));
        break;
      }
      case 'area_puddle_pond': {
        const w = this.area.water;
        if (!w) break;
        const x0 = ax + w.x0 * PPM;
        const x1 = ax + w.x1 * PPM;
        const width = x1 - x0;
        this.add('boatman', 3, (i) => ({ x: x0 + width * (0.12 + i * 0.28), y: 0 }), width * 0.22);
        this.add('skater', 2, (i) => ({ x: x0 + width * (0.25 + i * 0.4), y: 0 }), width * 0.16);
        this.add('fish', 1, () => ({ x: x0 + width * 0.2, y: 0 }), width * 0.6);
        const reeds = this.area.fixtures?.find((q) => q.kind === 'reeds');
        const rx = reeds ? reeds.x * PPM : w.x1 * PPM + 200;
        this.add('cricket', 2, (i) => at(rx + (i === 0 ? -260 : 330), -4));
        // Butterflies over the far bank and the reeds.
        this.perches = [
          at(w.x0 * PPM - 300, -40),
          at(w.x0 * PPM - 120, -60),
          at(rx, -260),
          at(rx + 200, -200),
        ];
        this.add('butterfly', 1, () => this.perches[0]!);
        break;
      }
      case 'area_stump_plaza': {
        this.antDoor = { x: ax + 290, y: 905 - 150 };
        this.perches = [
          ...MUSHROOMS.map(([x, h, r]) => ({ x: ax + x, y: 905 - h - r * 0.75 })),
          at(700, -60),
          at(1500, -30),
          at(2000, -30),
          at(2400, -30),
          at(3700, -20),
        ];
        this.lamps = MUSHROOMS.filter((_, i) => i % 2 === 1).map(([x, h, r]) => ({
          x: ax + x,
          y: 905 - h - r * 0.4,
        }));
        this.add('ant', 9, () => this.antDoor!);
        this.add('butterfly', 3, (i) => this.perches[i * 3]!);
        this.add('bee', 1, () => this.perches[1]!);
        this.add('worm', 1, () => at(3150));
        this.add('moth', 4, (i) => this.lamps[i % this.lamps.length]!, 80);
        this.add('cricket', 3, (i) => at([900, 2000, 3500][i]!, -4));
        break;
      }
      case 'area_compost_lab': {
        const jars = (this.area.fixtures ?? []).filter((q) => q.kind === 'shelf_jar').slice(0, 3);
        this.lamps = jars.map((j) => ({ x: ax + j.x * PPM, y: j.y * PPM - 50 }));
        this.add('moth', 5, (i) => this.lamps[i % Math.max(1, this.lamps.length)] ?? at(1000, -300), 60);
        this.add('cricket', 2, (i) => at(i === 0 ? 300 : 2500, -4));
        this.perches = [at(220, -260), at(900, -240), at(1700, -300), at(2200, -220)];
        this.add('butterfly', 1, () => this.perches[0]!);
        break;
      }
      case 'area_treehouse_arcade': {
        this.lamps = NEON.map((n) => ({ x: ax + n.x * PPM, y: n.y * PPM }));
        this.add('moth', 6, (i) => this.lamps[i % this.lamps.length]!, 90);
        this.add('bird', 2, () => ({ x: this.wx, y: this.wy }));
        // A bumblebee that wandered in by day, bumbling from sign to sign.
        this.perches = this.lamps.map((l) => ({ x: l.x, y: l.y + 80 }));
        this.add('bee', 1, () => this.perches[0]!);
        this.add('firefly', 3, (i) => ({ x: this.wx - 50 + i * 50, y: this.wy + 10 - (i % 2) * 30 }), 34);
        break;
      }
    }
  }

  /** Things that startle critters: the hand, and bugs that aren't waiting to be found. */
  private threats(f: AreaFrame): Pt[] {
    const out: Pt[] = [];
    if (f.hand) out.push(f.hand);
    for (const v of f.views)
      if (v.kind === 'bug' && !v.bug?.pending && v.x * PPM > this.x0 - 100 && v.x * PPM < this.x1 + 100)
        out.push({ x: v.x * PPM, y: v.y * PPM });
    return out;
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    for (const pool of [this.backPool, this.frontPool]) {
      for (const h of pool.list) h.visible = false;
      pool.used = 0;
    }
    this.drawn = [];
    for (const c of this.critters) c.at = null;
    if (!this.shows(f)) return;
    const hour = timeOfDay(f.sim.weather.clock) / HOUR;
    const sky = critterSky(hour, f.weather.rain);
    const threats = this.threats(f);
    const t = f.time;
    const counts = new Map<CritterKind, number>();
    let budget = AREA_CAP;
    for (const c of this.critters) {
      const n = (counts.get(c.kind) ?? 0) + 1;
      counts.set(c.kind, n);
      const total = this.critters.filter((q) => q.kind === c.kind).length;
      if (n > outOf(total, presence(c.kind, sky))) continue;
      if (budget <= 0) break;
      const drew = this.drawCritter(g, fg, f, c, t, threats);
      if (!drew) continue;
      budget--;
    }
    if (this.antDoor && presence('ant', sky) > 0) this.drawCrumbs(g);
    this.drawWormOut(fg, f);
  }

  private note(c: Critter, x: number, y: number): void {
    c.at = { x, y };
    this.drawn.push({
      area: this.area.id,
      kind: c.kind,
      x: x / PPM,
      y: y / PPM,
      startled: c.shy.since < 0.5,
    });
  }

  /** Draw one critter if it is on screen; returns whether it was drawn. */
  private drawCritter(
    g: Graphics,
    fg: Graphics,
    f: AreaFrame,
    c: Critter,
    t: number,
    threats: Pt[],
  ): boolean {
    switch (c.kind) {
      case 'butterfly':
      case 'bee': {
        if (this.perches.length === 0) return false;
        const bee = c.kind === 'bee';
        const p = flit(c.seed, t, this.perches, {
          fly: bee ? 2.2 : 3.2,
          rest: bee ? 1.6 : 3 + hash(c.seed, 20) * 2,
          loop: bee ? 26 : 40,
          beat: bee ? 9 : 3.2,
        });
        dodge(c.shy, p, threats, bee ? 110 : 150, 260, f.dt);
        const x = p.x + c.shy.dx;
        const y = p.y + c.shy.dy - (c.shy.since < 1 ? 30 : 0);
        if (!onScreen(x, f.left, f.right)) return false;
        const startled = c.shy.since < 1;
        const flap = startled ? 0.5 + 0.5 * Math.sin(t * 40) : p.flap;
        if (bee) this.drawBee(fg, x, y, flap, p.facing, p.resting && !startled, t);
        else
          this.drawButterfly(
            fg,
            x,
            y,
            flap,
            p.facing,
            BUTTERFLY_COLORS[Math.floor(hash(c.seed, 21) * BUTTERFLY_COLORS.length)]!,
          );
        this.note(c, x, y);
        return true;
      }
      case 'moth': {
        const lamp = this.lampFor(f, c);
        if (!lamp) return false;
        const p = orbit(c.seed, t, lamp.x, lamp.y, c.span);
        if (!onScreen(p.x, f.left, f.right)) return false;
        this.drawMoth(fg, p.x, p.y, p.flap);
        this.note(c, p.x, p.y);
        return true;
      }
      case 'firefly': {
        const p = drift(c.seed, t, c.home, c.span);
        dodge(c.shy, p, f.hand ? [f.hand] : [], 120, 200, f.dt);
        const x = p.x + c.shy.dx;
        const y = p.y + c.shy.dy;
        if (!onScreen(x, f.left, f.right)) return false;
        this.drawFirefly(g, x, y, blink(c.seed, t), t, c.seed);
        this.note(c, x, y);
        return true;
      }
      case 'cricket': {
        const p = c.home;
        dodge(c.shy, p, threats, 150, 380, f.dt, true);
        const x = p.x + c.shy.dx;
        if (!onScreen(x, f.left, f.right)) return false;
        // Quiet (and crouched) while anything is close; it sings again once calm.
        const song = c.shy.since > 2 ? chirp(c.seed, t) : 0;
        const hop = c.shy.since < 0.4 ? Math.sin((c.shy.since / 0.4) * Math.PI) * 26 : 0;
        const y = f.sim.surfaceY(x / PPM) * PPM - 4 - hop;
        this.drawCricket(g, x, y, song, c.shy.vx < -5 ? -1 : 1, t);
        this.note(c, x, y);
        return true;
      }
      case 'worm': {
        const x = c.home.x;
        if (!onScreen(x, f.left, f.right)) return false;
        // Worms come up more in the rain.
        const period = 26 - f.weather.rain * 14 + hash(c.seed, 22) * 14;
        const w = wormRise(c.seed, t, period);
        const near = threats.some((th) => Math.hypot(th.x - x, th.y - c.home.y) < 130);
        this.wormDuck = near ? 1 : Math.max(0, this.wormDuck - f.dt * 0.5);
        // The plaza's worm keeps the sim's rhythm (M11): a hat can be dropped on it while it peeks.
        const plazaWorm = this.area.id === 'area_stump_plaza';
        const up = plazaWorm ? f.sim.wardrobe.wormUp() : w.up * (1 - this.wormDuck);
        if (up < 0.02) return false;
        this.drawWorm(g, x, f.sim.surfaceY(x / PPM) * PPM, up, w.look);
        c.shy.since = near ? 0 : c.shy.since + f.dt;
        this.note(c, x, c.home.y - 20 * up);
        return true;
      }
      case 'ant':
        return this.drawAnt(g, f, c, t, threats);
      case 'boatman': {
        const r = row(c.seed, t, c.home.x, c.home.x + c.span);
        const top = this.surface(r.x);
        if (top === null) return false;
        const floor = f.sim.surfaceY(r.x / PPM) * PPM;
        const y0 = top + 20 + (floor - top - 40) * r.depth * 0.5;
        dodge(c.shy, { x: r.x, y: y0 }, f.hand ? [f.hand] : [], 110, 240, f.dt);
        const x = r.x + c.shy.dx;
        const y = Math.min(floor - 12, Math.max(top + 14, y0 + c.shy.dy));
        if (!onScreen(x, f.left, f.right)) return false;
        this.drawBoatman(fg, x, y, r.stroke, r.facing);
        this.note(c, x, y);
        return true;
      }
      case 'skater': {
        const s = skate(c.seed, t, c.home.x, c.home.x + c.span);
        const top = this.surface(s.x);
        if (top === null) return false;
        dodge(c.shy, { x: s.x, y: top }, f.hand ? [f.hand] : [], 120, 300, f.dt, true);
        const x = s.x + c.shy.dx;
        const y = this.surface(x) ?? top;
        if (!onScreen(x, f.left, f.right)) return false;
        this.drawSkater(fg, x, y, s.facing, s.gliding);
        this.note(c, x, y);
        return true;
      }
      case 'fish': {
        const s = cruise(c.seed, t, c.home.x, c.home.x + c.span);
        const top = this.surface(s.x);
        if (top === null) return false;
        const floor = f.sim.surfaceY(s.x / PPM) * PPM;
        if (floor - top < 90) return false;
        const y = floor - Math.min(70, (floor - top) * 0.35);
        if (!onScreen(s.x, f.left, f.right)) return false;
        this.drawFish(fg, s.x, y, s.facing, s.tail, s.turn);
        this.note(c, s.x, y);
        return true;
      }
      case 'bird':
        return this.drawBird(g, f, c, t);
    }
  }

  /** The light a moth circles, or null when that light is out. */
  private lampFor(f: AreaFrame, c: Critter): Pt | null {
    if (this.area.id === 'area_flowerbed_stage') {
      // The stage lamps draw moths only while lit; otherwise a couple flutter by the dark lamps.
      const mode = f.sim.places.state.stageLights;
      const i = this.critters.filter((q) => q.kind === 'moth').indexOf(c);
      if (mode === 0 && i > 1) return null;
      if (mode === 3 && i > 2) return null;
    }
    return c.home;
  }

  // --- The ant line (plaza) ---------------------------------------------

  /**
   * The ant line runs from the hill's door down its side and along the
   * ground to the nearest food on the ground nearby (or a few crumbs), and
   * back with a crumb each. Ants scatter from the hand and from bugs, then
   * re-form.
   */
  private antRoute(f: AreaFrame): void {
    const door = this.antDoor!;
    // The nearest bit of food on the ground within 7 m of the hill (else the crumbs).
    let target = this.ax + 1000;
    let best = 7 * PPM;
    for (const v of f.views) {
      if (v.kind !== 'item' || v.held || v.inMouthOf !== undefined || v.carriedBy !== undefined) continue;
      const def = f.sim.content.items.tryGet(v.defId);
      if (!def?.tags.includes('tag_edible')) continue;
      const vx = v.x * PPM;
      const d = vx - (door.x + 200);
      if (d < 0 || d > best || Math.abs(f.sim.surfaceY(v.x) - v.y) > 0.6) continue;
      best = d;
      target = vx - 10;
    }
    // Ease the route's end, so the line swings over rather than jumping.
    this.antTarget =
      this.antTarget === 0 ? target : this.antTarget + (target - this.antTarget) * Math.min(1, f.dt * 1.5);
    const ground = (x: number): number => f.sim.surfaceY(x / PPM) * PPM - 3;
    const pts: number[] = [door.x + 8, door.y + 14];
    // Down the hill's right side.
    for (let k = 1; k <= 6; k++) {
      const u = k / 6;
      const x = door.x + 20 + u * 170;
      const y = door.y + 14 + (ground(x) - door.y - 14) * Math.sin((u * Math.PI) / 2);
      pts.push(x, y);
    }
    for (let x = door.x + 230; x < this.antTarget; x += 60) pts.push(x, ground(x));
    pts.push(this.antTarget, ground(this.antTarget));
    this.antPath = pts;
  }

  private drawAnt(g: Graphics, f: AreaFrame, c: Critter, t: number, threats: Pt[]): boolean {
    if (!this.antDoor) return false;
    const ants = this.critters.filter((q) => q.kind === 'ant');
    const i = ants.indexOf(c);
    if (i === 0) this.antRoute(f);
    const len = pathLength(this.antPath);
    const a = antAt(i, ants.length, t, len, 34);
    const p = along(this.antPath, a.s);
    dodge(c.shy, p, threats, 75, 220, f.dt, true);
    const x = p.x + c.shy.dx;
    if (!onScreen(x, f.left, f.right, 60)) return false;
    // Scattered ants run along the ground, not in the air.
    const y = c.shy.dx !== 0 ? Math.min(p.y, f.sim.surfaceY(x / PPM) * PPM - 3) : p.y;
    const dir = c.shy.since < 0.6 ? (c.shy.vx >= 0 ? 1 : -1) : a.home ? -1 : 1;
    const angle = c.shy.since < 0.6 ? 0 : a.home ? p.angle + Math.PI : p.angle;
    const body = 0x4a2e2a;
    const flip = dir < 0 && c.shy.since < 0.6 ? -1 : 1;
    const carry = a.home && c.shy.since > 0.6;
    this.local(
      g,
      x,
      y,
      1.7,
      flip,
      (g) => {
        // Legs: three short strokes ticking back and forth.
        const step = Math.sin(t * 22 + i * 1.3) * 2.5;
        for (const k of [-2, 1, 4])
          g.moveTo(k, 0)
            .lineTo(k + step * (k === 1 ? -1 : 1), 4)
            .stroke({ width: 1.2, color: body, alpha: 0.85, cap: 'round' });
        g.circle(-5, -2, 3.4).fill(body);
        g.circle(0.5, -2, 2.2).fill(body);
        g.circle(5.5, -2.5, 2.8).fill(body);
        g.circle(6.5, -3.4, 0.8).fill({ color: 0xffffff, alpha: 0.6 });
        g.moveTo(7, -4).quadraticCurveTo(9, -8, 11, -7).stroke({ width: 0.9, color: body, alpha: 0.8 });
        // Home-bound ants carry a crumb over their heads.
        if (carry) g.circle(5.5, -8.5, 3.2).fill(0xe8c48a).stroke(soft(0.8, 0.4));
      },
      angle,
    );
    this.note(c, x, y);
    return true;
  }

  /** A few crumbs where the ant line ends, when there is no real food to fetch. */
  private drawCrumbs(g: Graphics): void {
    if (Math.abs(this.antTarget - (this.ax + 1000)) > 4) return;
    const x = this.ax + 1000;
    const y = this.antPath[this.antPath.length - 1] ?? 900;
    for (const [dx, dy, r] of [
      [-6, 1, 4],
      [3, 2, 3],
      [10, 1, 3.5],
      [-12, 3, 2.5],
    ] as const)
      g.circle(x + dx, y + dy, r)
        .fill(0xe8c48a)
        .stroke(soft(1, 0.35));
  }

  // --- Birds at the treehouse window -------------------------------------

  private drawBird(g: Graphics, f: AreaFrame, c: Critter, t: number): boolean {
    const birds = this.critters.filter((q) => q.kind === 'bird');
    const i = birds.indexOf(c);
    const wx = this.wx;
    const wy = this.wy;
    if (!onScreen(wx, f.left, f.right)) return false;
    if (i === 0) {
      // The hand near the window scares them off for a few seconds.
      const near = f.hand && Math.abs(f.hand.x - wx) < 190 && Math.abs(f.hand.y - wy) < 160;
      this.birdsAway = near ? 4 : Math.max(0, this.birdsAway - f.dt);
      // The branch across the lower panes.
      g.moveTo(wx - 96, wy + 44)
        .quadraticCurveTo(wx, wy + 30, wx + 96, wy + 40)
        .stroke({ width: 5, color: 0x7a5233, cap: 'round' });
      g.moveTo(wx + 40, wy + 36)
        .lineTo(wx + 62, wy + 18)
        .stroke({ width: 3, color: 0x7a5233, cap: 'round' });
      g.ellipse(wx + 64, wy + 16, 8, 5).fill(0x86ca6a);
    }
    const away = this.birdsAway;
    const b = birdBeat(c.seed, t);
    const spots = i === 0 ? [-58, -24] : [30, 62];
    const from = spots[b.hop > 0 ? b.spot ^ 1 : b.spot]!;
    const to = spots[b.spot]!;
    const k = b.hop > 0 ? b.hop : 1;
    let x = wx + from + (to - from) * k;
    let y = wy + 30 - Math.sin(k * Math.PI) * (b.hop > 0 ? 14 : 0);
    if (away > 0) {
      // Flown off up and out of the pane; they come back down when calm.
      const u = Math.min(1, (4 - away) * 3, away);
      x += (i === 0 ? -1 : 1) * u * 60;
      y -= u * 110;
      if (y < wy - 74) {
        c.shy.since = 0;
        this.redrawMullions(g);
        return false;
      }
    }
    const color = i === 0 ? 0xd96c4a : 0x6f8ce6;
    const facing = i === 0 ? 1 : -1;
    // Body, wing, head with a beak; the head tilts or dips to peck.
    g.ellipse(x, y, 11, 9).fill(color);
    g.ellipse(x - facing * 3, y + 1, 7, 4).fill(darken(color, 0.25));
    const hx = x + facing * (8 + b.peck * 4);
    const hy = y - 8 + b.peck * 10;
    g.circle(hx, hy, 6.5).fill(lighten(color, 0.1));
    g.poly([
      hx + facing * 5,
      hy - 1,
      hx + facing * (11 + b.tilt * 2),
      hy + 1 + b.tilt * 3,
      hx + facing * 5,
      hy + 3,
    ]).fill(0xffb703);
    g.circle(hx + facing * 2 + b.tilt * 1.5, hy - 1.5, 1.6).fill(OUTLINE);
    g.moveTo(x - facing * 10, y)
      .lineTo(x - facing * 17, y - 4)
      .stroke({ width: 4, color: darken(color, 0.3), cap: 'round' });
    if (i === birds.length - 1) this.redrawMullions(g);
    this.note(c, x, y);
    return true;
  }

  /** The window's cross bars, again, so the birds sit outside the glass. */
  private redrawMullions(g: Graphics): void {
    const { wx, wy } = this;
    g.moveTo(wx, wy - 70)
      .lineTo(wx, wy + 70)
      .stroke({ width: 10, color: 0xb56a2e });
    g.moveTo(wx - 92, wy)
      .lineTo(wx + 92, wy)
      .stroke({ width: 10, color: 0xb56a2e });
  }

  // --- Drawing ------------------------------------------------------------
  // Each critter is drawn about its own origin, scaled up from a tiny model
  // so it reads at game zoom: thin, faint outlines and flat colors.

  /** Draw `fn` about (x, y), scaled by `s` and flipped for `facing`. */
  private local(
    layer: Graphics,
    x: number,
    y: number,
    s: number,
    facing: 1 | -1,
    fn: (g: Graphics) => void,
    rotation = 0,
  ): void {
    // Each critter drawn this way gets a small Graphics of its own (pooled
    // per layer), placed, scaled, and flipped by its transform.
    const pool = layer === this.fg ? this.frontPool : this.backPool;
    let h = pool.list[pool.used];
    if (!h) {
      h = new Graphics();
      pool.list.push(h);
      layer.parent!.addChild(h);
    }
    pool.used++;
    h.clear();
    h.visible = true;
    h.position.set(x, y);
    h.scale.set(s * facing, s);
    h.rotation = rotation;
    fn(h);
  }

  private drawButterfly(
    g: Graphics,
    x: number,
    y: number,
    flap: number,
    facing: 1 | -1,
    color: number,
  ): void {
    // Wings seen from the side: they fold up over the back as they close.
    const open = 0.15 + flap * 0.85;
    const wing = darken(color, 0.15);
    this.local(g, x, y, 2.9, facing, (g) => {
      g.ellipse(-3, -8 * open, 9, 9 * open + 2)
        .fill(color)
        .stroke(soft(0.9, 0.4));
      g.ellipse(-4, 5 * open, 6.5, 6 * open + 1.5)
        .fill(wing)
        .stroke(soft(0.9, 0.4));
      g.circle(-4, -9 * open, 2.2).fill({ color: 0xffffff, alpha: 0.55 });
      g.circle(-5, 5 * open, 1.4).fill({ color: darken(color, 0.4), alpha: 0.6 });
      g.roundRect(-5, -1.6, 11, 3.2, 1.6).fill(0x4a3a40);
      g.moveTo(5, -1).quadraticCurveTo(8, -7, 11, -9).stroke({ width: 0.8, color: 0x4a3a40, alpha: 0.8 });
      g.circle(11, -9, 1).fill(0x4a3a40);
    });
  }

  private drawBee(
    g: Graphics,
    x: number,
    y: number,
    flap: number,
    facing: 1 | -1,
    resting: boolean,
    t: number,
  ): void {
    const bob = resting ? 0 : Math.sin(t * 11) * 2;
    this.local(g, x, y + bob, 2.5, facing, (g) => {
      g.ellipse(-1, -6 - flap * 2, 4.5, 3.5 + flap * 2).fill({ color: 0xffffff, alpha: 0.65 });
      g.ellipse(-4, -5 - flap * 1.5, 3.5, 2.5 + flap * 1.5).fill({ color: 0xffffff, alpha: 0.5 });
      g.ellipse(0, 0, 7, 5.5).fill(0xffc93c).stroke(soft(0.8, 0.35));
      g.moveTo(-2, -5)
        .lineTo(-2, 5)
        .moveTo(2.2, -5.2)
        .lineTo(2.2, 5.2)
        .stroke({ width: 1.8, color: 0x3a2a30, alpha: 0.85 });
      g.circle(6, -1, 3).fill(0x3a2a30);
      g.circle(7, -2, 0.9).fill({ color: 0xffffff, alpha: 0.8 });
      g.moveTo(-7, 0).lineTo(-9, 0.5).stroke({ width: 1, color: 0x3a2a30 });
    });
  }

  private drawMoth(g: Graphics, x: number, y: number, flap: number): void {
    const s = 0.4 + flap * 0.6;
    this.local(g, x, y, 2.4, 1, (g) => {
      g.ellipse(-4.5, -1.5, 5 * s + 1.5, 4.2).fill({ color: 0xece2cf, alpha: 0.95 });
      g.ellipse(4.5, -1.5, 5 * s + 1.5, 4.2).fill({ color: 0xece2cf, alpha: 0.95 });
      g.ellipse(-3.5, 2, 3 * s + 1, 2.4).fill({ color: 0xd9ccb4, alpha: 0.95 });
      g.ellipse(3.5, 2, 3 * s + 1, 2.4).fill({ color: 0xd9ccb4, alpha: 0.95 });
      g.ellipse(0, 0.5, 1.8, 4.2).fill(0x9a8a76);
      g.moveTo(-0.5, -3.5)
        .lineTo(-3, -7)
        .moveTo(0.5, -3.5)
        .lineTo(3, -7)
        .stroke({ width: 0.8, color: 0x9a8a76 });
    });
  }

  private drawFirefly(g: Graphics, x: number, y: number, glow: number, t: number, seed: number): void {
    const flap = Math.sin(t * 28 + seed);
    this.local(g, x, y, 2.2, 1, (g) => {
      g.ellipse(-1, -3, 3, 1.5 + Math.abs(flap) * 1.5).fill({ color: 0xffffff, alpha: 0.35 });
      g.ellipse(0, 0, 3.6, 2.6).fill(0x3b3550);
      g.circle(-3, 0.6, 2.4).fill(mix(0x8a8a5a, 0xfff27a, glow));
      g.circle(3, -0.6, 1.6).fill(0x3b3550);
    });
  }

  private drawCricket(g: Graphics, x: number, y: number, song: number, facing: 1 | -1, t: number): void {
    const body = 0x5c5a34;
    const lift = song * (0.5 + 0.5 * Math.sin(t * 60));
    this.local(g, x, y, 2.3, facing, (g) => {
      // The big back leg, the body, wings that lift and buzz while it sings, long feelers.
      g.moveTo(-2, -4)
        .lineTo(-8, -10)
        .lineTo(-11, 0)
        .stroke({ width: 1.8, color: darken(body, 0.2), join: 'round', cap: 'round' });
      g.ellipse(0, -4, 8, 4).fill(body);
      g.circle(8, -5, 3.2).fill(darken(body, 0.1));
      g.circle(9, -6, 0.9).fill(0xfff6d8);
      g.moveTo(4, -6.5)
        .lineTo(-9, -7.5 - lift * 4)
        .stroke({ width: 3, color: lighten(body, 0.25), cap: 'round' });
      g.moveTo(10, -7).quadraticCurveTo(16, -18, 22, -16).stroke({ width: 0.8, color: body, alpha: 0.85 });
    });
    if (song > 0.2)
      // Little chirp marks over its back.
      for (let k = 0; k < 2; k++)
        g.moveTo(x - facing * (8 + k * 8), y - 22 - k * 7)
          .lineTo(x - facing * (12 + k * 8), y - 28 - k * 7)
          .stroke({ width: 2, color: 0xfff6d8, alpha: song * 0.85, cap: 'round' });
  }

  /** The worm that took a hat (M11, `secret_worm_hat`), up again in this area, still wearing it. */
  private drawWormOut(g: Graphics, f: AreaFrame): void {
    const out = f.sim.wardrobe.state.worm?.out;
    if (!out) return;
    const x = out.x * PPM;
    if (x < this.x0 || x >= this.x1 || !onScreen(x, f.left, f.right)) return;
    const gy = f.sim.surfaceY(out.x) * PPM;
    const look = Math.sin(f.time * 2.2) * 0.6;
    this.drawWorm(g, x, gy, 1, look);
    drawPicto(g, 'hat', x + look * 12, gy - 52, 13);
  }

  private drawWorm(g: Graphics, x: number, gy: number, up: number, look: number): void {
    const h = 40 * up;
    const color = 0xeb9c9c;
    const tipX = x + look * 12 * up;
    g.moveTo(x, gy + 2)
      .quadraticCurveTo(x - look * 7, gy - h * 0.6, tipX, gy - h)
      .stroke({ width: 13, color: darken(color, 0.3), cap: 'round', alpha: 0.7 });
    g.moveTo(x, gy + 2)
      .quadraticCurveTo(x - look * 7, gy - h * 0.6, tipX, gy - h)
      .stroke({ width: 10, color, cap: 'round' });
    for (const k of [0.35, 0.55])
      g.circle(x + (tipX - x) * k - look * 3, gy - h * k, 1.2).fill({
        color: darken(color, 0.25),
        alpha: 0.6,
      });
    if (up > 0.6) {
      g.circle(tipX + look * 2 - 2, gy - h - 1, 1.6).fill(OUTLINE);
      g.circle(tipX + look * 2 + 2.5, gy - h - 1, 1.6).fill(OUTLINE);
    }
    // A little dirt mound at the hole.
    g.ellipse(x, gy + 2, 13, 4).fill(0x7a5a3e);
  }

  private drawBoatman(g: Graphics, x: number, y: number, stroke: number, facing: 1 | -1): void {
    const body = 0x6b5a3a;
    const oar = Math.sin(stroke * Math.PI * 2);
    this.local(g, x, y, 2.4, facing, (g) => {
      // Long oar legs sweeping back, a boat-shaped body, and the silver air bubble it carries.
      for (const side of [-1, 1])
        g.moveTo(1, side * 1.5)
          .lineTo(-4 - oar * 5, side * (7 + Math.abs(oar) * 3))
          .stroke({ width: 1.4, color: body, alpha: 0.85, cap: 'round' });
      g.ellipse(0, 0, 7.5, 3.6).fill(body);
      g.ellipse(-1.5, 1.2, 5, 1.8).fill({ color: 0xdff4ff, alpha: 0.7 });
      g.circle(5, -1, 1.2).fill({ color: 0xfff1c9, alpha: 0.9 });
    });
  }

  private drawSkater(g: Graphics, x: number, y: number, facing: 1 | -1, gliding: boolean): void {
    const c = 0x4a4a5a;
    this.local(g, x, y, 2.1, facing, (g) => {
      g.moveTo(-10, 1)
        .lineTo(-3, -4)
        .lineTo(3, -4)
        .lineTo(10, 1)
        .moveTo(-1, -4)
        .lineTo(6, -1)
        .stroke({ width: 1.4, color: c, alpha: 0.9, join: 'round', cap: 'round' });
      g.ellipse(0, -5, 5.5, 2.2).fill(c);
      g.circle(5, -5.5, 1.6).fill(c);
      // Dimples where the feet press the water.
      for (const dx of [-10, 10]) g.ellipse(dx, 1.5, 3.2, 1).fill({ color: 0xffffff, alpha: 0.6 });
      if (gliding) g.moveTo(-13, 2).lineTo(-24, 2).stroke({ width: 1, color: 0xffffff, alpha: 0.45 });
    });
  }

  private drawFish(g: Graphics, x: number, y: number, facing: 1 | -1, tail: number, turn: number): void {
    const len = 42 * (0.35 + 0.65 * turn);
    const shade = { color: 0x1d3a4a, alpha: 0.28 };
    this.local(g, x, y, 1.6, facing, (g) => {
      g.ellipse(0, 0, len, 11).fill(shade);
      g.poly([-len * 0.9, 0, -(len + 18), -10 + tail * 4, -(len + 18), 10 + tail * 4]).fill(shade);
      g.poly([-4, -9, 8, -16, 12, -8]).fill(shade);
    });
  }

  override lights(f: AreaFrame, light: LightFn): void {
    for (const c of this.critters) {
      if (!c.at) continue;
      if (c.kind === 'firefly') light(c.at.x, c.at.y, 26, 0xfff27a, 0.15 + blink(c.seed, f.time) * 0.55);
    }
  }
}
