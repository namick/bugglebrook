import { GRAVITY } from '../constants';
import type { Entity, EntityId } from '../core/entities';
import { SIM_DT, SIM_HZ } from '../core/loop';
import type { AreaDef, FixtureDef } from '../data/types';
import type { TagCause } from '../events';
import type { Impact, ShapeSpec } from '../physics/physics';
import type { Sim } from '../sim';
import type { WaterSurface } from './water';
import {
  WATER_DRAG,
  WATER_SPIN_DRAG,
  buoyancyAccel,
  skipVelocity,
  sprayArc,
  submergedFraction,
  waterEdges,
} from './water';

/** A frozen patch of pond (rule R5): a slippery platform that melts. */
export interface IceSheet {
  id: number;
  areaId: string;
  x0: number;
  x1: number;
  until: number;
}

/** Two things welded by something sticky (rule R6). */
export interface Stick {
  a: EntityId;
  b: EntityId;
  /** The weld point, in world meters. */
  x: number;
  y: number;
  since: number;
}

/** A lily pad's bob: offset below its rest height and its speed. */
export interface PadState {
  dy: number;
  vy: number;
}

/**
 * World state that is not an entity: water levels, the hose, ice, welds,
 * lily pads, weather. Plain JSON, saved as `world.env`.
 */
export interface EnvState {
  /** How far each area's water is raised above rest, in meters. */
  rise: Record<string, number>;
  hoseOn: boolean;
  ice: IceSheet[];
  nextIce: number;
  sticks: Stick[];
  /** Electrified water (rule R9) until this tick. */
  zappedUntil: number;
  /** Wind in m/s, positive blowing right (rule R14). Weather arrives in M6. */
  wind: number;
  rain: boolean;
  rainSince: number;
  pads: Record<string, PadState>;
}

export function newEnvState(): EnvState {
  return {
    rise: {},
    hoseOn: false,
    ice: [],
    nextIce: 1,
    sticks: [],
    zappedUntil: -1,
    wind: 0,
    rain: false,
    rainSince: -1,
    pads: {},
  };
}

/** Area rules run at 4 Hz (game design doc, section 6). */
export const RULE_TICKS = 15;
/** A weld tears when pulled faster than this, m/s (900 px/s). */
export const STICK_BREAK = 9;
/** New welds ignore the pull test for a moment while the bodies settle. */
const STICK_GRACE = 12;
const STICKS_PER_ITEM = 3;
/** A bug stuck to something wriggles loose after this long. */
const BUG_STICK_TICKS = 6 * SIM_HZ;
const STICK_COOLDOWN = 90;
export const ICE_WIDTH = 2;
export const ICE_SECONDS = 30;
const ICE_THICK = 0.14;
const MAX_ICE = 6;
export const PAD_WIDTH = 1.3;
const PAD_THICK = 0.1;
/** Water rises this fast while the hose runs, and drains this fast after (m/s). */
const HOSE_RISE = 0.02;
const DRAIN = 0.005;
/** Where the spray leaves the nozzle relative to the tap, its velocity, and its gravity. */
export const SPRAY = { dx: -1.05, dy: 0.3, vx: -6, vy: -3.4, gravity: 12 };
const SPRAY_REACH = 0.35;
export const MAGNET_RANGE = 2.5;
const MAGNET_MAX = 40;
/** Smells carry this far (150 px). */
export const STINK_RANGE = 1.5;
/** Frozen bugs sit in their ice block this long; frozen things 15 s. */
export const FROZEN_BUG_SECONDS = 4;
/** Things falling faster than this through the air make a real splash. */
const SPLASH_SPEED = 0.8;
/** Floating densities of bugs by swim style (water is 1). */
const BUG_DENSITY = { paddle: 0.48, boat: 0.38, sink: 1.6, skate: 0.3 } as const;
/** Tags water washes off (rule R1). */
const WASHED = ['tag_muddy', 'tag_smelly', 'tag_slimy', 'tag_painted', 'tag_sticky'] as const;
/** Tags soap washes off. */
const SOAPED = ['tag_sticky', 'tag_slimy', 'tag_smelly', 'tag_painted', 'tag_muddy'] as const;

const pairKey = (a: EntityId, b: EntityId): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Water, fixtures, and the property rules (game design doc, sections 3
 * and 6). The sim calls `beforePhysics` and `afterPhysics` every step. Most
 * of the math lives in pure helpers (water.ts, tags.ts); this class applies
 * it to the world.
 */
export class Environment {
  state: EnvState = newEnvState();
  /** Fraction of each entity under water, from the end of the last step. */
  readonly submerged = new Map<EntityId, number>();
  /** Skaters standing on the surface right now. */
  readonly skating = new Set<EntityId>();
  private readonly inWater = new Set<EntityId>();
  private readonly handles = new Map<string, number>();
  private readonly cooldown = new Map<string, number>();
  private readonly pending = new Set<string>();
  private readonly skips = new Map<EntityId, number>();
  private surfaceCache: WaterSurface[] | null = null;
  private surfaceTick = -1;

  constructor(private readonly sim: Sim) {}

  // --- Queries -------------------------------------------------------------

  private get tick(): number {
    return this.sim.tick;
  }

  /** Every water surface right now, left to right. */
  surfaces(): WaterSurface[] {
    if (this.surfaceCache && this.surfaceTick === this.tick) return this.surfaceCache;
    const out: WaterSurface[] = [];
    for (const area of this.sim.content.areas.all) {
      const w = area.water;
      if (!w) continue;
      const level = w.level - (this.state.rise[area.id] ?? 0);
      const x0 = area.xStart + w.x0;
      const x1 = area.xStart + w.x1;
      const edges = waterEdges(this.sim.terrain.points, level, (x0 + x1) / 2, x0, x1);
      if (edges) out.push({ areaId: area.id, level, left: edges.left, right: edges.right });
    }
    this.surfaceCache = out;
    this.surfaceTick = this.tick;
    return out;
  }

  /** The water surface over world x, if any. */
  waterAt(x: number): WaterSurface | null {
    for (const s of this.surfaces()) if (x > s.left && x < s.right) return s;
    return null;
  }

  /** Open water at x: water with no ice or lily pad on top. */
  overOpenWater(x: number): boolean {
    const s = this.waterAt(x);
    if (!s) return false;
    if (this.state.ice.some((i) => x >= i.x0 && x <= i.x1)) return false;
    for (const pad of this.pads()) if (Math.abs(x - pad.x) <= PAD_WIDTH / 2) return false;
    return true;
  }

  /** The nearest dry land from x, just past the water's edge. */
  shoreFrom(x: number): number | null {
    const s = this.waterAt(x);
    if (!s) return null;
    return x - s.left < s.right - x ? s.left - 0.7 : s.right + 0.7;
  }

  private fixtures(kind: FixtureDef['kind']): { area: AreaDef; fixture: FixtureDef }[] {
    const out: { area: AreaDef; fixture: FixtureDef }[] = [];
    for (const area of this.sim.content.areas.all)
      for (const fixture of area.fixtures ?? []) if (fixture.kind === kind) out.push({ area, fixture });
    return out;
  }

  /** Where each lily pad is (its top center), for the renderer and tests. */
  pads(): { id: string; x: number; y: number }[] {
    const out: { id: string; x: number; y: number }[] = [];
    for (const { area, fixture } of this.fixtures('lily_pad')) {
      const p = this.sim.physics.platformPosition(fixture.id);
      const x = area.xStart + fixture.x;
      out.push({ id: fixture.id, x, y: p ? p.y - PAD_THICK / 2 : this.levelOf(area) });
    }
    return out;
  }

  private levelOf(area: AreaDef): number {
    return (area.water?.level ?? 9) - (this.state.rise[area.id] ?? 0);
  }

  /** The hose's spray arc while it runs (empty when off). */
  spray(): [number, number][] {
    if (!this.state.hoseOn) return [];
    const tap = this.fixtures('hose_tap')[0];
    if (!tap) return [];
    const area = tap.area;
    return sprayArc(
      area.xStart + tap.fixture.x + SPRAY.dx,
      tap.fixture.y + SPRAY.dy,
      SPRAY.vx,
      SPRAY.vy,
      SPRAY.gravity,
      this.levelOf(area),
    ).map(([x, y]) => [x, y]);
  }

  /** A clickable fixture near a world point, or null. */
  fixtureAt(x: number, y: number): { id: string; kind: FixtureDef['kind']; x: number; y: number } | null {
    for (const area of this.sim.content.areas.all)
      for (const f of area.fixtures ?? []) {
        if (f.kind === 'lily_pad') continue;
        const fx = area.xStart + f.x;
        if (Math.hypot(x - fx, y - f.y) <= f.radius) return { id: f.id, kind: f.kind, x: fx, y: f.y };
      }
    return null;
  }

  /** A click on a fixture: the hose tap toggles, the boot burps bubbles. True if one was hit. */
  pokeFixture(x: number, y: number): boolean {
    const f = this.fixtureAt(x, y);
    if (!f || this.sim.isAreaAsleep(this.sim.areaOf(f.x).id)) return false;
    if (f.kind === 'hose_tap') {
      this.state.hoseOn = !this.state.hoseOn;
      this.sim.events.emit('hose_toggled', { on: this.state.hoseOn, x: f.x, y: f.y });
    } else if (f.kind === 'rubber_boot') {
      this.sim.events.emit('boot_bubbled', { x: f.x, y: f.y });
    }
    return true;
  }

  // --- Loading -------------------------------------------------------------

  /** Restore saved state: rebuild welds, and note what is already in the water. */
  restore(state: EnvState): void {
    this.state = state;
    const keep: Stick[] = [];
    for (const s of state.sticks) {
      if (!this.sim.entities.has(s.a) || !this.sim.entities.has(s.b)) continue;
      this.handles.set(pairKey(s.a, s.b), this.sim.physics.weld(s.a, s.b, s.x, s.y));
      keep.push(s);
    }
    state.sticks = keep;
    this.surfaceCache = null;
    for (const e of this.sim.entities.all()) {
      const frac = this.fractionOf(e);
      this.submerged.set(e.id, frac);
      if (frac > 0.02) this.inWater.add(e.id);
    }
  }

  forget(id: EntityId): void {
    this.submerged.delete(id);
    this.skating.delete(id);
    this.inWater.delete(id);
    this.skips.delete(id);
    for (let i = this.state.sticks.length - 1; i >= 0; i--) {
      const s = this.state.sticks[i]!;
      if (s.a === id || s.b === id) this.unstick(i, false);
    }
  }

  // --- Per step ------------------------------------------------------------

  private shapeOf(e: Entity): ShapeSpec {
    return e.kind === 'bug'
      ? { type: 'circle', radius: this.sim.content.bugs.get(e.defId).radius }
      : this.sim.content.items.get(e.defId).shape;
  }

  private fractionOf(e: Entity): number {
    if (!this.sim.physics.isActive(e.id)) return 0;
    const s = this.sim.physics.getState(e.id);
    const w = this.waterAt(s.x);
    if (!w) return 0;
    return submergedFraction(this.shapeOf(e), s.angle, s.y, w.level);
  }

  /** How dense something is compared to water right now (soggy paper sinks). */
  densityOf(e: Entity): number {
    if (e.kind === 'bug') return BUG_DENSITY[this.sim.content.bugs.get(e.defId).swim];
    const def = this.sim.content.items.get(e.defId);
    let d = def.density / (def.hull ?? 1);
    if (def.soggyAfter !== undefined && (e.soak ?? 0) >= def.soggyAfter * SIM_HZ) d = 1.35;
    if (this.sim.hasTag(e.id, 'tag_absorbent') && this.sim.hasTag(e.id, 'tag_wet')) d = Math.max(d, 0.85);
    return d;
  }

  /** Forces for the coming physics step: water, skating, parachutes, wind, magnets, spray; and weld tests. */
  beforePhysics(): void {
    this.updateLevels();
    this.updatePads();
    this.updateIce();
    const sim = this.sim;
    const physics = sim.physics;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !physics.isActive(e.id)) continue;
      const s = physics.getState(e.id);
      const held = physics.grabbed === e.id;
      const mass = physics.mass(e.id);
      const bugDef = e.kind === 'bug' ? sim.content.bugs.get(e.defId) : null;
      if (bugDef?.swim === 'skate' && !held && this.skate(e, s.x, s.y, s.vx, s.vy, bugDef.radius, mass))
        continue;
      const w = this.waterAt(s.x);
      const frac = w ? submergedFraction(this.shapeOf(e), s.angle, s.y, w.level) : 0;
      if (frac > 0 && w) this.float(e, frac, w, held, mass);
      if (bugDef?.glidesWhenFlung && e.bug?.mode === 'st_airborne' && !e.bug.selfLaunched && s.vy > 2.5) {
        // A parachute of long legs.
        physics.applyForce(e.id, -mass * 0.8 * s.vx, -mass * Math.min(GRAVITY * 1.4, 12 * (s.vy - 2.5)));
      }
      if (this.state.wind !== 0 && !held && sim.hasTag(e.id, 'tag_light')) {
        const push = this.state.wind - s.vx;
        if (Math.sign(push) === Math.sign(this.state.wind)) physics.applyForce(e.id, mass * 14 * push, 0);
      }
    }
    this.pullMagnets();
    this.pushSpray();
    this.testSticks();
  }

  /**
   * Buoyancy, water drag, the current, and a righting torque for floaters.
   * Vertical damping is tuned to each thing's own bob, so a cork settles as
   * fast as a raft (within a second or two).
   */
  private float(e: Entity, frac: number, w: WaterSurface, held: boolean, mass: number): void {
    const physics = this.sim.physics;
    const s = physics.getState(e.id);
    const density = this.densityOf(e);
    const shape = this.shapeOf(e);
    const half =
      shape.type === 'circle'
        ? shape.radius
        : (shape.width / 2) * Math.abs(Math.sin(s.angle)) + (shape.height / 2) * Math.abs(Math.cos(s.angle));
    const floating = density < 1 && frac < 0.99;
    // Floaters ride the surface current; everything else sits in still water.
    const current = floating && !held ? (this.sim.content.areas.get(w.areaId).water?.current ?? 0) : 0;
    const bob = Math.sqrt(GRAVITY / (Math.max(0.05, density) * 2 * half));
    const damp = floating
      ? Math.max(WATER_DRAG * frac, 0.7 * bob * Math.min(1, frac / density))
      : WATER_DRAG * frac;
    physics.applyForce(
      e.id,
      -mass * WATER_DRAG * frac * (s.vx - current),
      -mass * (buoyancyAccel(GRAVITY, frac, density) + damp * s.vy),
    );
    physics.applyTorque(e.id, -physics.inertia(e.id) * WATER_SPIN_DRAG * frac * s.av);
    if (density < 1 && shape.type === 'box' && shape.width > shape.height) {
      // Flat things float flat; boats float upright.
      const def = e.kind === 'item' ? this.sim.content.items.get(e.defId) : null;
      const upright = (def?.hull ?? 1) > 1;
      const tilt = upright ? Math.sin(s.angle) : Math.sin(2 * s.angle) / 2;
      physics.applyTorque(e.id, -physics.inertia(e.id) * 160 * tilt * Math.min(1, frac * 4));
    }
  }

  /** A skater on the water stands on the surface. Returns true if it did. */
  private skate(e: Entity, x: number, y: number, vx: number, vy: number, r: number, mass: number): boolean {
    const w = this.waterAt(x);
    const bottom = y + r;
    const onSurface =
      !!w && this.overOpenWater(x) && vy >= -0.5 && bottom > w.level - 0.12 && bottom < w.level + 0.6;
    if (!onSurface || !w) {
      this.skating.delete(e.id);
      return false;
    }
    if (!this.skating.has(e.id)) {
      // Touchdown: counts as a gentle landing, never a dizzy one.
      this.sim.noteBugImpact(e.id, Math.min(5, Math.max(0.5, vy)));
      this.sim.events.emit('splashed', {
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        x,
        y: w.level,
        speed: Math.min(2, vy),
        size: 0.1,
      });
    }
    this.skating.add(e.id);
    this.sim.physics.setPosition(e.id, x, w.level - r);
    this.sim.physics.setVelocity(e.id, vx, 0);
    this.sim.physics.applyForce(e.id, 0, -mass * GRAVITY);
    return true;
  }

  private updateLevels(): void {
    for (const area of this.sim.content.areas.all) {
      const w = area.water;
      if (!w || this.sim.isAreaAsleep(area.id)) continue;
      const hose = this.state.hoseOn && (area.fixtures ?? []).some((f) => f.kind === 'hose_tap');
      const rise = this.state.rise[area.id] ?? 0;
      const next = hose ? Math.min(w.maxRise, rise + HOSE_RISE * SIM_DT) : Math.max(0, rise - DRAIN * SIM_DT);
      if (next !== rise) {
        this.state.rise[area.id] = next;
        this.surfaceCache = null;
      }
    }
  }

  /** Lily pads float at the surface, dip under weight, and bob back. */
  private updatePads(): void {
    const physics = this.sim.physics;
    let i = 0;
    for (const { area, fixture } of this.fixtures('lily_pad')) {
      i++;
      if (this.sim.isAreaAsleep(area.id) && physics.hasPlatform(fixture.id)) continue;
      const pad = (this.state.pads[fixture.id] ??= { dy: 0, vy: 0 });
      let load = 0;
      for (const id of physics.onPlatform(fixture.id)) load += physics.mass(id);
      const target = Math.min(0.14, load * 0.06);
      pad.vy += (70 * (target - pad.dy) - 7 * pad.vy) * SIM_DT;
      pad.dy += pad.vy * SIM_DT;
      const bob = Math.sin(this.tick * 0.035 + i * 2.1) * 0.015;
      const y = this.levelOf(area) + pad.dy + bob - PAD_THICK / 2 + 0.03;
      physics.setPlatform(fixture.id, area.xStart + fixture.x, y, PAD_WIDTH, PAD_THICK, 0.9, SIM_DT);
    }
  }

  private updateIce(): void {
    const physics = this.sim.physics;
    for (let i = this.state.ice.length - 1; i >= 0; i--) {
      const sheet = this.state.ice[i]!;
      const key = `ice_${sheet.id}`;
      const area = this.sim.content.areas.get(sheet.areaId);
      const level = this.levelOf(area);
      if (this.tick >= sheet.until) {
        physics.removePlatform(key);
        this.state.ice.splice(i, 1);
        this.sim.events.emit('ice_melted', { x0: sheet.x0, x1: sheet.x1, y: level });
        continue;
      }
      const cx = (sheet.x0 + sheet.x1) / 2;
      physics.setPlatform(key, cx, level + 0.02, sheet.x1 - sheet.x0, ICE_THICK, 0.02, SIM_DT);
    }
  }

  /** Rule R5: a cold thing touching the water freezes the surface around it. */
  private freezeSurface(x: number, w: WaterSurface): void {
    if (this.state.ice.some((i) => x > i.x0 - 0.8 && x < i.x1 + 0.8)) return;
    if (this.state.ice.length >= MAX_ICE) return;
    const x0 = Math.max(w.left + 0.05, x - ICE_WIDTH / 2);
    const x1 = Math.min(w.right - 0.05, x0 + ICE_WIDTH);
    const sheet: IceSheet = {
      id: this.state.nextIce++,
      areaId: w.areaId,
      x0,
      x1,
      until: this.tick + ICE_SECONDS * SIM_HZ,
    };
    this.state.ice.push(sheet);
    this.sim.physics.setPlatform(
      `ice_${sheet.id}`,
      (x0 + x1) / 2,
      w.level + 0.02,
      x1 - x0,
      ICE_THICK,
      0.02,
      SIM_DT,
    );
    this.sim.events.emit('ice_formed', { x0, x1, y: w.level });
  }

  /** Rule R10: magnets pull magnetic things, and are pulled back just as hard. */
  private pullMagnets(): void {
    const sim = this.sim;
    const physics = sim.physics;
    const all = sim.entities.all();
    for (const m of all) {
      if (m.kind !== 'item') continue;
      const strength = sim.content.items.get(m.defId).magnet;
      if (!strength || sim.isSleeping(m.id) || !physics.isActive(m.id)) continue;
      const ms = physics.getState(m.id);
      for (const o of all) {
        if (o.id === m.id || sim.isSleeping(o.id) || !physics.isActive(o.id)) continue;
        if (!sim.hasTag(o.id, 'tag_magnetic')) continue;
        const os = physics.getState(o.id);
        const dx = ms.x - os.x;
        const dy = ms.y - os.y;
        const d = Math.hypot(dx, dy);
        if (d > MAGNET_RANGE || d < 0.05) continue;
        const a = Math.min(MAGNET_MAX, strength / (d * d));
        const f = physics.mass(o.id) * a;
        physics.applyForce(o.id, (dx / d) * f, (dy / d) * f);
        physics.applyForce(m.id, (-dx / d) * f, (-dy / d) * f);
      }
    }
  }

  /** The hose's spray pushes light things along its arc. */
  private pushSpray(): void {
    const arc = this.spray();
    if (arc.length < 2) return;
    const physics = this.sim.physics;
    for (const e of this.sim.entities.all()) {
      if (this.sim.isSleeping(e.id) || !physics.isActive(e.id) || physics.grabbed === e.id) continue;
      if (!this.sim.hasTag(e.id, 'tag_light')) continue;
      const s = physics.getState(e.id);
      for (let i = 1; i < arc.length; i++) {
        const [x, y] = arc[i]!;
        if (Math.hypot(s.x - x, s.y - y) > SPRAY_REACH + 0.2) continue;
        const [px, py] = arc[i - 1]!;
        const len = Math.hypot(x - px, y - py) || 1;
        const m = physics.mass(e.id);
        physics.applyForce(e.id, ((x - px) / len) * m * 30, ((y - py) / len) * m * 30);
        break;
      }
    }
  }

  /** Rule R6's other half: welds tear when yanked faster than 900 px/s. */
  private testSticks(): void {
    const physics = this.sim.physics;
    for (let i = this.state.sticks.length - 1; i >= 0; i--) {
      const s = this.state.sticks[i]!;
      const a = physics.getState(s.a);
      const b = physics.getState(s.b);
      const age = this.tick - s.since;
      const rel = age > STICK_GRACE ? Math.hypot(a.vx - b.vx, a.vy - b.vy) : 0;
      const held = physics.grabbed;
      const hand = held === s.a || held === s.b ? physics.handSpeed : 0;
      const bugStuck =
        this.sim.entities.get(s.a)?.kind === 'bug' || this.sim.entities.get(s.b)?.kind === 'bug';
      if (Math.max(rel, hand) > STICK_BREAK || (bugStuck && age > BUG_STICK_TICKS)) this.unstick(i, true);
    }
  }

  // --- After the step ----------------------------------------------------

  afterPhysics(impacts: Impact[]): void {
    const sim = this.sim;
    const physics = sim.physics;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id)) continue;
      const frac = this.fractionOf(e);
      this.submerged.set(e.id, frac);
      const was = this.inWater.has(e.id);
      if (!was && frac > 0.02 && !this.skating.has(e.id)) this.enterWater(e, frac);
      else if (was && frac <= 0) {
        this.inWater.delete(e.id);
        const s = physics.getState(e.id);
        sim.events.emit('left_water', { id: e.id, kind: e.kind, x: s.x, y: s.y });
      }
      if (e.kind === 'item') {
        const def = sim.content.items.get(e.defId);
        if (def.soggyAfter !== undefined) {
          if (frac > 0.02) e.soak = (e.soak ?? 0) + 1;
          else if (!sim.hasTag(e.id, 'tag_wet')) delete e.soak;
        }
        if (def.blowsBubbles && physics.grabbed === e.id && this.tick % 6 === 0) this.wave(e);
      }
    }
    for (const impact of impacts) {
      if (impact.a === null || impact.b === null) continue;
      if (!sim.entities.has(impact.a) || !sim.entities.has(impact.b)) continue;
      this.pending.add(pairKey(impact.a, impact.b));
      if (sim.hasTag(impact.a, 'tag_sticky')) this.tryStick(impact.a, impact.b);
      else if (sim.hasTag(impact.b, 'tag_sticky')) this.tryStick(impact.b, impact.a);
      this.snapMagnet(impact.a, impact.b, impact);
    }
    if (this.tick % RULE_TICKS === 0) this.ruleTick();
  }

  private enterWater(e: Entity, frac: number): void {
    const sim = this.sim;
    const physics = sim.physics;
    const s = physics.getState(e.id);
    const w = this.waterAt(s.x);
    if (!w) return;
    if (e.kind === 'item' && physics.grabbed !== e.id) {
      const bounce = skipVelocity(s.vx, s.vy);
      if (bounce) {
        // Skipping stone: bounce off, and do not count as in the water yet.
        const shape = this.shapeOf(e);
        const half = shape.type === 'circle' ? shape.radius : shape.height / 2;
        physics.setPosition(e.id, s.x, w.level - half - 0.01);
        physics.setVelocity(e.id, bounce.vx, bounce.vy);
        const count = (this.skips.get(e.id) ?? 0) + 1;
        this.skips.set(e.id, count);
        sim.events.emit('skipped', { id: e.id, x: s.x, y: w.level, count });
        return;
      }
    }
    this.skips.delete(e.id);
    this.inWater.add(e.id);
    const shape = this.shapeOf(e);
    const size = shape.type === 'circle' ? shape.radius : shape.height / 2;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed >= SPLASH_SPEED || frac > 0.3)
      sim.events.emit('splashed', {
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        x: s.x,
        y: w.level,
        speed,
        size,
      });
    // Rule R5: cold into water freezes the surface.
    if (sim.hasTag(e.id, 'tag_cold')) this.freezeSurface(s.x, w);
    this.immerse(e.id);
  }

  /** Rule R1: in the water, things get wet and washed. */
  private immerse(id: EntityId): void {
    const sim = this.sim;
    sim.addTag(id, 'tag_wet', 'water');
    for (const tag of WASHED)
      if (sim.removeTag(id, tag, 'water', 30) && tag === 'tag_sticky') this.unstickAll(id);
    if (sim.removeTag(id, 'tag_hot', 'water', 30)) {
      const s = sim.physics.getState(id);
      sim.events.emit('steamed', { id, otherId: null, x: s.x, y: s.y });
    }
  }

  /** The bubble wand blows a trail while it is wet or soapy and moving. */
  private wave(e: Entity): void {
    if (!this.sim.hasTag(e.id, 'tag_wet') && !this.sim.hasTag(e.id, 'tag_soapy')) return;
    const s = this.sim.physics.getState(e.id);
    if (Math.hypot(s.vx, s.vy) < 2.5) return;
    const def = this.sim.content.items.get(e.defId);
    const ring = def.shape.type === 'box' ? def.shape.width / 2 : 0;
    const x = s.x + Math.cos(s.angle) * ring;
    const y = s.y + Math.sin(s.angle) * ring;
    this.sim.events.emit('bubbles_blown', { id: e.id, x, y, count: 2 });
  }

  private snapMagnet(a: EntityId, b: EntityId, impact: Impact): void {
    if (impact.speed < 0.4) return;
    const items = this.sim.content.items;
    for (const [m, o] of [
      [a, b],
      [b, a],
    ] as const) {
      const e = this.sim.entities.get(m);
      if (e?.kind !== 'item' || !items.get(e.defId).magnet || !this.sim.hasTag(o, 'tag_magnetic')) continue;
      this.sim.events.emit('magnet_snapped', { id: o, magnetId: m, x: impact.px, y: impact.py });
      return;
    }
  }

  /** Rule R6: weld a sticky thing to what it touched. */
  tryStick(sticky: EntityId, other: EntityId): void {
    const sim = this.sim;
    const physics = sim.physics;
    if (sticky === other || sim.isSleeping(sticky) || sim.isSleeping(other)) return;
    if (!physics.isActive(sticky) || !physics.isActive(other)) return;
    const key = pairKey(sticky, other);
    if (this.handles.has(key)) return;
    const until = this.cooldown.get(key);
    if (until !== undefined && this.tick < until) return;
    const count = this.state.sticks.filter((s) => s.a === sticky || s.b === sticky).length;
    if (count >= STICKS_PER_ITEM) return;
    const p = physics.contactPoint(sticky, other);
    this.handles.set(key, physics.weld(sticky, other, p.x, p.y));
    this.state.sticks.push({ a: sticky, b: other, x: p.x, y: p.y, since: this.tick });
    sim.events.emit('stuck', { a: sticky, b: other, x: p.x, y: p.y });
  }

  private unstick(index: number, announce: boolean): void {
    const s = this.state.sticks[index];
    if (!s) return;
    const key = pairKey(s.a, s.b);
    const handle = this.handles.get(key);
    if (handle !== undefined) this.sim.physics.unweld(handle);
    this.handles.delete(key);
    this.state.sticks.splice(index, 1);
    this.cooldown.set(key, this.tick + STICK_COOLDOWN);
    if (!announce) return;
    const a = this.sim.physics.getState(s.a);
    const b = this.sim.physics.getState(s.b);
    this.sim.events.emit('unstuck', { a: s.a, b: s.b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  /** Let go of every weld this thing is part of. */
  unstickAll(id: EntityId): void {
    for (let i = this.state.sticks.length - 1; i >= 0; i--) {
      const s = this.state.sticks[i]!;
      if (s.a === id || s.b === id) this.unstick(i, true);
    }
  }

  /** Is this pair welded? */
  stuckTogether(a: EntityId, b: EntityId): boolean {
    return this.handles.has(pairKey(a, b));
  }

  /**
   * Rule R18: a shaken sponge squeezes its water (and soap) onto whatever is
   * below it. Returns true if it had anything to squeeze.
   */
  wring(e: Entity): boolean {
    const sim = this.sim;
    if (!sim.hasTag(e.id, 'tag_absorbent')) return false;
    const liquids = (['tag_wet', 'tag_soapy'] as const).filter((t) => sim.hasTag(e.id, t));
    if (liquids.length === 0) return false;
    const s = sim.physics.getState(e.id);
    for (const tag of liquids) {
      sim.removeTag(e.id, tag, 'wring');
      sim.events.emit('wrung_out', { id: e.id, tag, x: s.x, y: s.y });
      for (const o of sim.entities.all()) {
        if (o.id === e.id || sim.isSleeping(o.id)) continue;
        const os = sim.physics.getState(o.id);
        if (Math.abs(os.x - s.x) < 0.8 && os.y > s.y - 0.2 && os.y < s.y + 5) sim.addTag(o.id, tag, 'wring');
      }
    }
    return true;
  }

  // --- 4 Hz rules ----------------------------------------------------------

  private ruleTick(): void {
    const sim = this.sim;
    const physics = sim.physics;
    const pairs = new Map<string, [EntityId, EntityId]>();
    for (const [a, b] of physics.touchingPairs()) pairs.set(pairKey(a, b), [a, b]);
    for (const key of this.pending) {
      const [a, b] = key.split(':').map(Number) as [number, number];
      pairs.set(key, [a, b]);
    }
    this.pending.clear();
    for (const [a, b] of [...pairs.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
      if (!sim.entities.has(a) || !sim.entities.has(b) || sim.isSleeping(a) || sim.isSleeping(b)) continue;
      this.contact(a, b);
      if (sim.entities.has(a) && sim.entities.has(b)) this.contact(b, a);
    }
    const arc = this.spray();
    const raining =
      this.state.rain && this.state.rainSince >= 0 && this.tick - this.state.rainSince >= 5 * SIM_HZ;
    const zapped = this.tick < this.state.zappedUntil;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.entities.has(e.id)) continue;
      sim.expire(e);
      const frac = this.submerged.get(e.id) ?? 0;
      const s = physics.getState(e.id);
      if (frac > 0.2) this.immerse(e.id);
      // R15: rain soaks anything under the open sky.
      if (raining && frac <= 0.2 && physics.isActive(e.id)) sim.addTag(e.id, 'tag_wet', 'rain');
      if (arc.some(([x, y]) => Math.hypot(s.x - x, s.y - y) < SPRAY_REACH + 0.25))
        sim.addTag(e.id, 'tag_wet', 'hose');
      // R7: soap and water blow bubbles every half second.
      if (this.tick % (RULE_TICKS * 2) === 0 && sim.hasTag(e.id, 'tag_soapy') && sim.hasTag(e.id, 'tag_wet'))
        sim.events.emit('bubbles_blown', { id: e.id, x: s.x, y: s.y, count: frac > 0 ? 3 : 2 });
      // R8: stink reaches bugs nearby.
      if (sim.hasTag(e.id, 'tag_smelly') && physics.isActive(e.id) && physics.grabbed !== e.id)
        this.stink(e, s.x, s.y);
      // R9: sparky things electrify the water.
      if (frac > 0 && sim.hasTag(e.id, 'tag_sparky')) {
        if (!zapped) sim.events.emit('water_zapped', { x: s.x, y: s.y });
        this.state.zappedUntil = this.tick + 2 * SIM_HZ;
      }
    }
    if (this.tick < this.state.zappedUntil)
      for (const e of sim.entities.ofKind('bug'))
        if ((this.submerged.get(e.id) ?? 0) > 0 && !sim.isSleeping(e.id))
          sim.addTag(e.id, 'tag_fuzzy', 'zap');
    sim.refreshFriction();
  }

  private stink(source: Entity, x: number, y: number): void {
    for (const bug of this.sim.entities.ofKind('bug')) {
      if (bug.id === source.id || this.sim.isSleeping(bug.id)) continue;
      const s = this.sim.physics.getState(bug.id);
      if (Math.hypot(s.x - x, s.y - y) > STINK_RANGE) continue;
      this.sim.smell(bug, source.id, x);
    }
  }

  /** Contact rules, applied one way (the sim calls both orders). */
  private contact(x: EntityId, y: EntityId): void {
    const sim = this.sim;
    const has = (id: EntityId, tag: string): boolean => sim.hasTag(id, tag);
    const at = (): { x: number; y: number } => sim.physics.contactPoint(x, y);
    // Soap first: it cleans before anything can stick.
    if (has(x, 'tag_soapy')) {
      for (const tag of SOAPED)
        if (sim.removeTag(y, tag, 'soap', 20) && tag === 'tag_sticky') this.unstickAll(y);
      if (has(y, 'tag_absorbent')) sim.addTag(y, 'tag_soapy', 'soap');
    }
    // R2: hot and wet cancel out in a puff of steam.
    if (has(x, 'tag_wet') && has(y, 'tag_hot')) {
      sim.removeTag(x, 'tag_wet', 'steam');
      sim.removeTag(y, 'tag_hot', 'steam', 20);
      const p = at();
      sim.events.emit('steamed', { id: y, otherId: x, x: p.x, y: p.y });
    }
    // R4: heat melts ice.
    if (has(x, 'tag_frozen') && has(y, 'tag_hot')) this.thaw(x);
    // R3: cold freezes wet things.
    if (has(x, 'tag_wet') && has(y, 'tag_cold') && !has(x, 'tag_hot') && !has(y, 'tag_hot')) this.freeze(x);
    // R6: sticky welds on contact.
    if (has(x, 'tag_sticky')) this.tryStick(x, y);
    // R8: stink soaks into absorbent things.
    if (has(x, 'tag_smelly') && has(y, 'tag_absorbent')) sim.addTag(y, 'tag_smelly', 'stink');
  }

  freeze(id: EntityId): void {
    const sim = this.sim;
    const e = sim.entities.get(id);
    if (!e) return;
    sim.removeTag(id, 'tag_wet', 'freeze');
    sim.addTag(id, 'tag_frozen', 'freeze', e.kind === 'bug' ? FROZEN_BUG_SECONDS : undefined);
    const s = sim.physics.getState(id);
    sim.events.emit('froze', { id, x: s.x, y: s.y });
  }

  thaw(id: EntityId, cause: TagCause = 'thaw'): void {
    const sim = this.sim;
    sim.removeTag(id, 'tag_frozen', cause);
    sim.addTag(id, 'tag_wet', 'thaw');
    const s = sim.physics.getState(id);
    sim.events.emit('thawed', { id, x: s.x, y: s.y });
  }
}
