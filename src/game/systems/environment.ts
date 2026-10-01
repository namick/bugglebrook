import { GRAVITY } from '../constants';
import type { Entity, EntityId } from '../core/entities';
import { SIM_DT, SIM_HZ } from '../core/loop';
import type { AreaDef, FixtureDef } from '../data/types';
import type { TagCause } from '../events';
import type { BodyState, Impact, ShapeSpec } from '../physics/physics';
import type { Sim } from '../sim';
import { scaleShape } from './potions';
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
  /** Tied on with string (a balloon, a parachute), not stuck: bugs do not wriggle out of it. */
  tied?: boolean;
}

/** A strip of Glorp's slime trail on the ground (tag_slimy, 30 s). */
export interface SlimeStrip {
  x0: number;
  x1: number;
  /** The height of the bug that left it, so it lies on the right surface. */
  y: number;
  until: number;
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
  /** Glorp's slime trail. */
  slime: SlimeStrip[];
}

/** Where the sun is painted on the sundial, and how big a spot a click on it has. */
export const SUN_SPOT = 0.24;
export function sundialSun(f: { x: number; y: number }): { x: number; y: number } {
  return { x: f.x - 0.5, y: f.y };
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
    slime: [],
  };
}

/** Slime lasts this long, in seconds. */
export const SLIME_SECONDS = 30;
const MAX_SLIME = 40;

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
/** Water rises this fast while the hose runs, and drains this fast after (m/s): 1 px per 2 s. */
export const HOSE_RISE = 0.02;
export const DRAIN = 0.005;
/** Rain raises the pond more gently than the hose: 0.3 px/s (m/s). */
export const RAIN_RISE = 0.003;
/** Wind pushes the pond's floaters along: current plus this much of the wind (3x faster at 2 m/s). */
const WIND_CURRENT = 0.08;
/** Wind drifts flying bugs (and Dot gliding) a little. */
const WIND_AIR = 2.5;
/** A glowing thing warms up bugs this close at night: social +5 per second (rule R16). */
export const GLOW_RANGE = 1.6;
const GLOW_SOCIAL = 5;
/** Where the spray leaves the nozzle relative to the tap, its velocity, and its gravity. */
export const SPRAY = { dx: -1.05, dy: 0.3, vx: -6, vy: -3.4, gravity: 12 };
const SPRAY_REACH = 0.35;
export const MAGNET_RANGE = 2.5;
const MAGNET_MAX = 40;
/** Smells carry this far (150 px). */
export const STINK_RANGE = 1.5;
/** Rule R12: food hot for 3 s is toasted. Rule R22: a wet seed in the sun sprouts after 30 s. */
export const TOAST_TICKS = 3 * SIM_HZ;
export const SPROUT_TICKS = 30 * SIM_HZ;
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

/** Fixtures a click does something to. */
const CLICKABLE: ReadonlySet<FixtureDef['kind']> = new Set<FixtureDef['kind']>([
  'hose_tap',
  'rubber_boot',
  'teacup',
  'sundial',
  'weather_vane',
  'knothole',
  'sunflower',
  'can_tunnel',
  'stage_lights',
  'bluebell',
  'gnome',
  'munch_leaf',
  'tulip',
  'whiff_pot',
  'porch_lamp',
  'spider',
  'claw_button',
  'bench_lever',
  'cauldron',
  'bug_scope',
]);

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
  /** Things standing in a rain puddle. */
  private readonly inPuddle = new Set<EntityId>();
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
        if (!CLICKABLE.has(f.kind)) continue;
        // Hidden bugs' hideouts stop answering once their bug is found.
        if (f.kind === 'munch_leaf' && this.sim.cast.joined('bug_caterpillar_munch')) continue;
        const fx = area.xStart + f.x;
        const hit =
          f.w !== undefined && f.h !== undefined
            ? Math.abs(x - fx) <= f.w / 2 && Math.abs(y - f.y) <= f.h / 2
            : Math.hypot(x - fx, y - f.y) <= f.radius;
        if (hit) return { id: f.id, kind: f.kind, x: fx, y: f.y };
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
    } else if (f.kind === 'weather_vane') {
      this.sim.weather.clickVane(f.x, f.y);
    } else if (f.kind === 'sundial') {
      // The sun painted on the dial's left: five quick clicks and the sun puts on sunglasses.
      const sun = sundialSun(f);
      if (Math.hypot(x - sun.x, y - sun.y) <= SUN_SPOT) this.sim.weather.clickSun(sun.x, sun.y);
    } else if (f.kind === 'knothole') {
      this.sim.weather.pokeKnothole(f);
    } else this.sim.places.poke(f);
    return true;
  }

  // --- Loading -------------------------------------------------------------

  /** Restore saved state: rebuild welds, and note what is already in the water. */
  /**
   * Glorp leaves a slime trail as he slides along the ground: strips that
   * last 30 s. Other bugs slip on it.
   */
  slime(bug: Entity, s: BodyState, radius: number): void {
    const tick = this.tick;
    const trail = this.state.slime;
    for (let i = trail.length - 1; i >= 0; i--) if (trail[i]!.until <= tick) trail.splice(i, 1);
    if (!this.sim.physics.isSupported(bug.id) || Math.abs(s.vx) < 0.1 || this.waterAt(s.x)) return;
    const mode = bug.bug?.mode;
    if (mode !== 'st_wander' && mode !== 'st_seek' && mode !== 'st_social') return;
    const x0 = s.x - radius * 1.2;
    const x1 = s.x + radius * 0.2;
    const until = tick + SLIME_SECONDS * SIM_HZ;
    const last = trail[trail.length - 1];
    if (
      last &&
      Math.abs(last.y - s.y) < 0.15 &&
      x0 <= last.x1 + 0.05 &&
      x1 >= last.x0 - 0.05 &&
      last.x1 - last.x0 < 3
    ) {
      last.x0 = Math.min(last.x0, x0);
      last.x1 = Math.max(last.x1, x1);
      last.until = until;
      return;
    }
    trail.push({ x0, x1, y: s.y, until });
    if (trail.length > MAX_SLIME) trail.shift();
  }

  restore(state: EnvState): void {
    this.state = state;
    state.slime ??= [];
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
    this.inPuddle.delete(id);
    this.heat.delete(id);
    this.growth.delete(id);
    for (let i = this.state.sticks.length - 1; i >= 0; i--) {
      const s = this.state.sticks[i]!;
      if (s.a === id || s.b === id) this.unstick(i, false);
    }
  }

  // --- Per step ------------------------------------------------------------

  private shapeOf(e: Entity): ShapeSpec {
    if (e.kind === 'item')
      return scaleShape(this.sim.content.items.get(e.defId).shape, this.sim.potions.scaleOf(e));
    const def = this.sim.bugDef(e);
    return def.collider
      ? { type: 'box', width: def.collider.width, height: def.collider.height }
      : { type: 'circle', radius: def.radius };
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
    const windy = this.state.wind !== 0;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !physics.isActive(e.id)) continue;
      // A thing at rest out of the water feels nothing here but the wind.
      if (e.kind === 'item' && !windy && !this.inWater.has(e.id) && !physics.isAwake(e.id)) continue;
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
      if (e.bug?.form === 'butterfly' && e.bug.mode === 'st_airborne' && s.vy > 0.8) {
        // Butterfly wings: a slow, fluttering drift down.
        physics.applyForce(e.id, -mass * 0.4 * s.vx, -mass * Math.min(GRAVITY * 1.2, 14 * (s.vy - 0.8)));
      }
      if (e.bug?.gliding && s.vy > 1.6) {
        // Dot gliding down from the top on open wings.
        physics.applyForce(e.id, -mass * 0.3 * s.vx, -mass * Math.min(GRAVITY * 1.3, 10 * (s.vy - 1.6)));
      }
      // No wind indoors (under the porch, in the treehouse), or behind a locked barrier.
      const breezy = this.state.wind !== 0 && !held && sim.outdoors(s.x, s.y);
      if (breezy && sim.hasTag(e.id, 'tag_light')) {
        const push = this.state.wind - s.vx;
        if (Math.sign(push) === Math.sign(this.state.wind)) physics.applyForce(e.id, mass * 14 * push, 0);
      } else if (breezy && e.bug?.mode === 'st_airborne' && frac === 0) {
        // Flying bugs drift with the wind.
        const push = this.state.wind - s.vx;
        if (Math.sign(push) === Math.sign(this.state.wind))
          physics.applyForce(e.id, mass * WIND_AIR * push, 0);
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
    const current =
      floating && !held
        ? (this.sim.content.areas.get(w.areaId).water?.current ?? 0) + this.state.wind * WIND_CURRENT
        : 0;
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
      const rate = (hose ? HOSE_RISE : 0) + (this.state.rain ? RAIN_RISE : 0);
      const rise = this.state.rise[area.id] ?? 0;
      const next = rate > 0 ? Math.min(w.maxRise, rise + rate * SIM_DT) : Math.max(0, rise - DRAIN * SIM_DT);
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

  /**
   * A frosty bug's step (M8): water just ahead of it freezes into an ice
   * path, so it walks out across the pond.
   */
  frostStep(x: number, y: number): void {
    const w = this.waterAt(x);
    if (!w || Math.abs(y - w.level) > 1.6) return;
    this.freezeSurface(x, w);
  }

  /** Rule R24: fire breath melts ice sheets within `reach` of x. */
  meltAt(x: number, reach: number): void {
    for (let i = this.state.ice.length - 1; i >= 0; i--) {
      const sheet = this.state.ice[i]!;
      if (sheet.x1 < x - reach || sheet.x0 > x + reach) continue;
      sheet.until = this.tick;
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
    // Three sheets at once make the pond a rink.
    if (this.state.ice.filter((i) => i.areaId === w.areaId).length >= 3)
      this.sim.findSecret('secret_pond_freeze', x, w.level);
  }

  /** Rule R10: magnets pull magnetic things, and are pulled back just as hard. */
  private pullMagnets(): void {
    const sim = this.sim;
    const physics = sim.physics;
    const all = sim.entities.all();
    for (const m of all) {
      const def = m.kind === 'item' ? sim.content.items.get(m.defId) : null;
      // Magnet items, and anything a magnet potion is working on.
      const strength = (def?.magnet ?? 0) || (m.effects ? sim.potions.magnetOf(m) : 0);
      if (!strength || sim.isSleeping(m.id) || !physics.isActive(m.id)) continue;
      const ms = physics.getState(m.id);
      // The crane's magnet dangles off the end of its rod.
      const at = def?.magnetAt;
      const mx = at ? ms.x + at[0] * Math.cos(ms.angle) - at[1] * Math.sin(ms.angle) : ms.x;
      const my = at ? ms.y + at[0] * Math.sin(ms.angle) + at[1] * Math.cos(ms.angle) : ms.y;
      for (const o of all) {
        if (o.id === m.id || sim.isSleeping(o.id) || !physics.isActive(o.id)) continue;
        if (!sim.hasTag(o.id, 'tag_magnetic')) continue;
        const os = physics.getState(o.id);
        const dx = mx - os.x;
        const dy = my - os.y;
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
        !s.tied && (this.sim.entities.get(s.a)?.kind === 'bug' || this.sim.entities.get(s.b)?.kind === 'bug');
      if (Math.max(rel, hand) > STICK_BREAK || (bugStuck && age > BUG_STICK_TICKS)) this.unstick(i, true);
    }
  }

  // --- After the step ----------------------------------------------------

  afterPhysics(impacts: Impact[]): void {
    const sim = this.sim;
    const physics = sim.physics;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id)) continue;
      // A thing at rest out of the water stays out of it.
      if (
        e.kind === 'item' &&
        e.soak === undefined &&
        !this.inWater.has(e.id) &&
        physics.isActive(e.id) &&
        !physics.isAwake(e.id)
      )
        continue;
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

  /** Rule R1: in the water, things get wet and washed. A dip gets a bug fully clean. */
  private immerse(id: EntityId, cause: TagCause = 'water'): void {
    const sim = this.sim;
    sim.addTag(id, 'tag_wet', cause);
    const brain = sim.entities.get(id)?.bug;
    if (brain) brain.needs.need_clean = 100;
    // A dunk washes every potion off (paint goes with tag_painted, below).
    sim.potions.dunk(id);
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
      if (!e || !this.sim.hasTag(o, 'tag_magnetic')) continue;
      // A magnet bug (a potion) keeps the metal it catches stuck to it.
      const bugMagnet = e.kind === 'bug' && !!e.effects && this.sim.potions.magnetOf(e) > 0;
      if (!bugMagnet && (e.kind !== 'item' || !items.get(e.defId).magnet)) continue;
      if (bugMagnet && this.state.sticks.filter((s) => s.a === m || s.b === m).length < 4)
        this.tie(m, o, impact.px, impact.py);
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

  /** Tie two things together with string at (x, y): a balloon or a parachute on what it lifts. */
  tie(a: EntityId, b: EntityId, x: number, y: number): void {
    const sim = this.sim;
    const key = pairKey(a, b);
    if (this.handles.has(key) || a === b) return;
    this.handles.set(key, sim.physics.weld(a, b, x, y));
    this.state.sticks.push({ a, b, x, y, since: this.tick, tied: true });
    sim.events.emit('stuck', { a, b, x, y });
  }

  /** Everything joined to this thing by welds and ties, itself included, sorted. */
  tiedGroup(id: EntityId): EntityId[] {
    const seen = new Set<EntityId>([id]);
    const todo = [id];
    while (todo.length > 0) {
      const at = todo.pop()!;
      for (const s of this.state.sticks) {
        const other = s.a === at ? s.b : s.b === at ? s.a : null;
        if (other !== null && !seen.has(other)) {
          seen.add(other);
          todo.push(other);
        }
      }
    }
    return [...seen].sort((p, q) => p - q);
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
      // R15: rain soaks anything under the open sky, and rinses bugs (+2/s).
      if (raining && frac <= 0.2 && physics.isActive(e.id) && !sim.sheltered(e)) {
        sim.addTag(e.id, 'tag_wet', 'rain');
        if (e.bug) e.bug.needs.need_clean = Math.min(100, e.bug.needs.need_clean + 0.5);
      }
      if (arc.some(([x, y]) => Math.hypot(s.x - x, s.y - y) < SPRAY_REACH + 0.25)) {
        sim.addTag(e.id, 'tag_wet', 'hose');
        if (e.bug) e.bug.needs.need_clean = Math.min(100, e.bug.needs.need_clean + 5);
      }
      // Skating keeps a water strider's feet clean.
      if (e.bug && this.skating.has(e.id))
        e.bug.needs.need_clean = Math.min(100, e.bug.needs.need_clean + 0.3);
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
    this.puddleRule();
    this.cookAndGrow();
    if (sim.weather.dark) {
      this.glowRule();
      this.moonRule();
    }
    if (this.tick < this.state.zappedUntil)
      for (const e of sim.entities.ofKind('bug'))
        if ((this.submerged.get(e.id) ?? 0) > 0 && !sim.isSleeping(e.id))
          sim.addTag(e.id, 'tag_fuzzy', 'zap');
    sim.refreshFriction();
  }

  /**
   * Puddles act like tiny ponds (game design doc, section 3): anything
   * standing in one gets wet and washed (R1), with a little splash going in.
   */
  private puddleRule(): void {
    const sim = this.sim;
    const puddles = sim.weather.puddles();
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id)) {
        this.inPuddle.delete(e.id);
        continue;
      }
      const s = sim.physics.getState(e.id);
      const bottom = s.y + this.sim.halfHeight(e);
      const p = puddles.find((q) => Math.abs(s.x - q.x) <= q.half && Math.abs(bottom - q.y) < 0.2);
      if (!p) {
        this.inPuddle.delete(e.id);
        continue;
      }
      if (!this.inPuddle.has(e.id)) {
        this.inPuddle.add(e.id);
        sim.events.emit('splashed', {
          id: e.id,
          kind: e.kind,
          defId: e.defId,
          x: s.x,
          y: p.y,
          speed: Math.max(0.5, Math.hypot(s.vx, s.vy)),
          size: 0.08,
        });
      }
      this.immerse(e.id, 'puddle');
    }
  }

  /** R16: at night, glowing things are a campfire: bugs close by warm up to each other. */
  private glowRule(): void {
    const sim = this.sim;
    const lights: { x: number; y: number; id: EntityId; reach?: number }[] = [];
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || !sim.glows(e)) continue;
      const s = sim.physics.getState(e.id);
      lights.push({ x: s.x, y: s.y, id: e.id });
    }
    // The porch lamp and the stage lights warm bugs up too, over a wider circle.
    for (const l of sim.places.lights()) lights.push({ x: l.x, y: l.y, id: -1, reach: l.reach });
    if (lights.length === 0) return;
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || sim.isSleeping(bug.id) || b.mode === 'st_sleep') continue;
      const s = sim.physics.getState(bug.id);
      if (!lights.some((l) => l.id !== bug.id && Math.hypot(l.x - s.x, l.y - s.y) <= (l.reach ?? GLOW_RANGE)))
        continue;
      b.needs.need_social = Math.min(100, b.needs.need_social + GLOW_SOCIAL / (SIM_HZ / RULE_TICKS));
    }
  }

  /**
   * `secret_moon_pebble`: at night a pebble that comes to rest in the sunken
   * teacup, where the moon's reflection falls, comes out a moon pebble.
   */
  private moonRule(): void {
    const sim = this.sim;
    for (const { area, fixture } of this.fixtures('teacup')) {
      const cx = area.xStart + fixture.x;
      const bottom = sim.surfaceY(cx);
      for (const e of sim.entities.ofKind('item')) {
        if (e.defId !== 'item_pebble' || sim.isSleeping(e.id) || !sim.physics.isActive(e.id)) continue;
        if (sim.physics.grabbed === e.id) continue;
        const s = sim.physics.getState(e.id);
        if (Math.abs(s.x - cx) > fixture.radius - 0.05 || s.y < bottom - 0.75 || s.y > bottom) continue;
        if (Math.hypot(s.vx, s.vy) > 0.4 || !sim.content.items.has('item_moon_pebble')) continue;
        sim.remove(e.id);
        const moon = sim.spawn('item', 'item_moon_pebble', s.x, s.y - 0.05);
        sim.physics.setVelocity(moon.id, 0, -1.2);
        sim.events.emit('item_transformed', {
          id: e.id,
          newId: moon.id,
          from: e.defId,
          to: moon.defId,
          x: s.x,
          y: s.y,
        });
        sim.findSecret('secret_moon_pebble', s.x, s.y);
      }
    }
  }

  private stink(source: Entity, x: number, y: number): void {
    // Wind carries a smell farther downwind.
    const wind = this.state.wind;
    for (const bug of this.sim.entities.ofKind('bug')) {
      if (bug.id === source.id || this.sim.isSleeping(bug.id)) continue;
      const s = this.sim.physics.getState(bug.id);
      const downwind = wind !== 0 && Math.sign(s.x - x) === Math.sign(wind) ? Math.abs(wind) * 0.8 : 0;
      if (Math.hypot(s.x - x, s.y - y) > STINK_RANGE + downwind) continue;
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
    // R19: mud gets everywhere.
    if (has(x, 'tag_muddy') && !has(y, 'tag_wet')) sim.addTag(y, 'tag_muddy', 'mud');
  }

  /** Ticks each thing has spent hot (food toasts) or wet in the sun (seeds sprout). Not saved. */
  private readonly heat = new Map<EntityId, number>();
  private readonly growth = new Map<EntityId, number>();

  /**
   * Rules about heat and growing (M8): R12, hot food for 3 s is toasted; R13,
   * a hot popcorn kernel pops; R22, a wet seed in the sun on soil for 30 s
   * sprouts.
   */
  private cookAndGrow(): void {
    const sim = this.sim;
    const physics = sim.physics;
    const sunny = !sim.weather.dark && !this.state.rain;
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || !physics.isActive(e.id) || !sim.entities.has(e.id)) continue;
      const hot = sim.hasTag(e.id, 'tag_hot');
      if (hot && e.defId === 'item_popcorn_kernel' && sim.content.items.has('item_popcorn')) {
        this.transform(e, 'item_popcorn', -5);
        continue;
      }
      if (hot && sim.hasTag(e.id, 'tag_edible') && !e.toasted) {
        const t = (this.heat.get(e.id) ?? 0) + RULE_TICKS;
        this.heat.set(e.id, t);
        if (t >= TOAST_TICKS) {
          e.toasted = true;
          this.heat.delete(e.id);
          const s = physics.getState(e.id);
          sim.events.emit('toasted', { id: e.id, defId: e.defId, x: s.x, y: s.y });
        }
      } else if (!hot) this.heat.delete(e.id);
      if (sim.hasTag(e.id, 'tag_seed') && e.defId !== 'item_popcorn_kernel') {
        const s = physics.getState(e.id);
        const onSoil =
          sunny &&
          sim.hasTag(e.id, 'tag_wet') &&
          sim.outdoors(s.x, s.y) &&
          Math.abs(s.y + sim.halfHeight(e) - sim.surfaceY(s.x)) < 0.12 &&
          (this.submerged.get(e.id) ?? 0) === 0;
        if (!onSoil) {
          this.growth.delete(e.id);
          continue;
        }
        const t = (this.growth.get(e.id) ?? 0) + RULE_TICKS;
        this.growth.set(e.id, t);
        if (t >= SPROUT_TICKS && sim.content.items.has('item_sprout')) this.transform(e, 'item_sprout', 0);
      }
    }
  }

  /** One thing turns into another where it is (a kernel pops, a seed sprouts). */
  private transform(e: Entity, to: string, vy: number): void {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    sim.remove(e.id);
    this.heat.delete(e.id);
    this.growth.delete(e.id);
    const half = sim.halfHeightOfDef(to);
    const y = vy === 0 ? sim.surfaceY(s.x) - half - 0.02 : s.y;
    const made = sim.spawn('item', to, s.x, y);
    if (vy !== 0) sim.physics.setVelocity(made.id, s.vx, vy);
    sim.events.emit('item_transformed', { id: e.id, newId: made.id, from: e.defId, to, x: s.x, y: s.y });
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
