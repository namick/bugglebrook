import { GRAVITY } from '../constants';
import type { Entity, EntityId } from '../core/entities';
import { SIM_DT, SIM_HZ } from '../core/loop';
import type { AreaDef, FixtureDef } from '../data/types';
import type { BoxPartSpec } from '../physics/physics';
import type { Sim } from '../sim';

/**
 * Barriers and unlocks (game design doc, section 3, and M7). Four areas
 * start locked, each behind a barrier fixture that `opens` it: the droopy
 * sunflower (the flowerbed), the lattice panel (the porch), the can tunnel
 * (the compost lab), and the bucket lift (the treehouse). Until a barrier
 * opens, an invisible wall at its `wall` x stops bugs and everything else,
 * and the camera stays on this side of it (with a short look past). Once
 * open, an area stays open: `open` is saved.
 */

/** A barrier fixture with its world positions. */
export interface Barrier {
  id: string;
  kind: FixtureDef['kind'];
  /** The area it opens. */
  opens: string;
  /** World x of its wall. */
  wall: number;
  /** Where the fixture is, in world meters. */
  x: number;
  y: number;
  radius: number;
  /** The area the fixture stands in. */
  area: AreaDef;
}

export type LiftPhase = 'down' | 'up' | 'top' | 'back';

/** The bucket lift: where the bottom bucket is and what it is doing. Plain JSON, saved. */
export interface LiftState {
  phase: LiftPhase;
  /** The bottom bucket floor's top, in world y. */
  y: number;
  /** Ticks left in `top`, or ticks the load has been heavy enough in `down`. */
  timer: number;
}

export interface BarrierState {
  /** Areas opened so far (not counting those open from the start). */
  open: string[];
  lift: LiftState;
}

/** Round things this wide (m) bump the latch; smaller ones clink under it (the doc's 36 to 52 px, at our scale). */
export const LATCH_MIN = 0.44;
export const LATCH_MAX = 1;
/** The lattice panel is out of the way once it is this far from where it leaned, or tipped over. */
export const LATTICE_MOVED = 1.8;
export const LATTICE_TIPPED = 0.9;
/** Rain opens the sunflower after this long, like any other wet soil (R15). */
const RAIN_SOAK = 5 * SIM_HZ;

/** The buckets: a floor and two walls, relative to the floor's center. */
export const BUCKET_W = 2.1;
export const BUCKET_WALL = 0.95;
export const BUCKET_PARTS: readonly BoxPartSpec[] = [
  { x: 0, y: 0, width: BUCKET_W, height: 0.12, angle: 0 },
  { x: -BUCKET_W / 2 + 0.04, y: -BUCKET_WALL / 2, width: 0.08, height: BUCKET_WALL, angle: 0 },
  { x: BUCKET_W / 2 - 0.04, y: -BUCKET_WALL / 2, width: 0.08, height: BUCKET_WALL, angle: 0 },
];
/** The acorn's mass in the top bucket: about three small bugs, or Moose alone (kg in planck units). */
export const ACORN_MASS = 1.9;
/** Once open, a pebble stays in the top bucket as a counterweight: any bug will do. */
export const COUNTERWEIGHT_MASS = 0.3;
/** How far up the bottom bucket goes: its floor's top reaches this far above the ground... */
export const LIFT_TOP = 6.3;
/** ...at this speed (m/s). */
export const LIFT_SPEED = 1.1;
/** The top bucket hangs this far to the right of the bottom one. */
export const TOP_BUCKET_DX = 2.35;
const lift = (b: Barrier): { x: number } => ({ x: b.x });

/** Where the tossed things land, measured into the treehouse from its left edge. */
const TOSS_TO = 1.3;
const TOSS_TIME = 0.8;

export class Barriers {
  state: BarrierState;
  private readonly list: Barrier[] = [];
  /** Things that rolled into the tunnel recently, and when: each one counts once a second. */
  private readonly tunnelSeen = new Map<EntityId, number>();

  constructor(private readonly sim: Sim) {
    for (const area of sim.content.areas.all)
      for (const f of area.fixtures ?? []) {
        if (!f.opens || f.wall === undefined) continue;
        this.list.push({
          id: f.id,
          kind: f.kind,
          opens: f.opens,
          wall: area.xStart + f.wall,
          x: area.xStart + f.x,
          y: f.y,
          radius: f.radius,
          area,
        });
      }
    this.state = { open: [], lift: { phase: 'down', y: this.bottomY(), timer: 0 } };
  }

  /** Every barrier, left to right. */
  barriers(): readonly Barrier[] {
    return this.list;
  }

  barrier(kind: FixtureDef['kind']): Barrier | null {
    return this.list.find((b) => b.kind === kind) ?? null;
  }

  isOpen(areaId: string): boolean {
    const area = this.sim.content.areas.tryGet(areaId);
    return !!area && (area.unlockedByDefault || this.state.open.includes(areaId));
  }

  /** Is the barrier still shut? */
  closed(b: Barrier): boolean {
    return !this.isOpen(b.opens);
  }

  /** Walls and the lift's buckets. Call once the sim's physics exists. */
  build(): void {
    const physics = this.sim.physics;
    for (const b of this.list) if (this.closed(b)) physics.addWall(`wall_${b.id}`, b.wall);
    const lift = this.barrier('bucket_lift');
    if (lift) {
      physics.addKinematic('bucket_bottom', lift.x, this.state.lift.y + 0.06, BUCKET_PARTS);
      physics.addKinematic('bucket_top', lift.x + TOP_BUCKET_DX, this.topBucketY() + 0.06, BUCKET_PARTS);
    }
  }

  /** Loading a save: the areas it opened stay open, and the lift is where it was. */
  restore(state: BarrierState): void {
    this.state = state;
    for (const b of this.list)
      if (!this.closed(b)) {
        this.sim.physics.removePlatform(`wall_${b.id}`);
        this.removeSolidsFor(b.opens);
      }
    this.sim.places.build();
    this.placeBuckets(0);
  }

  /** The walkable stretch of the world around the plaza: between the nearest shut barriers. */
  span(): { x0: number; x1: number } {
    const plaza = this.sim.content.areas.tryGet('area_stump_plaza');
    const mid = plaza ? (plaza.xStart + plaza.xEnd) / 2 : this.sim.worldWidth / 2;
    let x0 = 0;
    let x1 = this.sim.worldWidth;
    for (const b of this.list) {
      if (!this.closed(b)) continue;
      if (b.wall < mid) x0 = Math.max(x0, b.wall);
      else x1 = Math.min(x1, b.wall);
    }
    return { x0, x1 };
  }

  /** Open an area for good: its wall comes down, and its secret (if any) is found. */
  unlock(areaId: string, x: number, y: number): void {
    if (this.isOpen(areaId)) return;
    const b = this.list.find((q) => q.opens === areaId);
    this.state.open.push(areaId);
    this.sim.physics.removePlatform(`wall_${b?.id ?? areaId}`);
    this.removeSolidsFor(areaId);
    this.sim.places.build();
    this.sim.events.emit('area_unlocked', { areaId, barrierId: b?.id ?? '', x, y });
    const secret = this.sim.content.secrets.all.find((s) =>
      s.unlocks.some((u) => u.kind === 'area' && u.id === areaId),
    );
    if (secret) this.sim.findSecret(secret.id, x, y);
  }

  private removeSolidsFor(areaId: string): void {
    for (const area of this.sim.content.areas.all)
      for (const s of area.solids ?? []) if (s.until === areaId) this.sim.physics.removePlatform(s.id);
  }

  // --- Per step ------------------------------------------------------------

  update(): void {
    const tick = this.sim.tick;
    for (const b of this.list) {
      if (b.kind === 'bucket_lift') {
        this.updateLift(b);
        continue;
      }
      if (!this.closed(b)) continue;
      // A ball rolls a few centimeters a tick: looking every third tick is plenty.
      if (b.kind === 'can_tunnel' && tick % 3 === 0 && !this.sim.isAreaAsleep(b.area.id)) this.tunnel(b);
      else if (tick % 15 === 0 && b.kind === 'sunflower') this.sunflower(b);
      else if (tick % 15 === 0 && b.kind === 'lattice') this.lattice(b);
    }
  }

  /**
   * The droopy sunflower: any wet thing on its cracked soil, or rain, and it
   * drinks, stretches up, and opens the path to the flowerbed.
   */
  private sunflower(b: Barrier): void {
    const sim = this.sim;
    const env = sim.environment.state;
    let wet = env.rain && env.rainSince >= 0 && sim.tick - env.rainSince >= RAIN_SOAK;
    if (!wet)
      for (const e of sim.entities.all()) {
        if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
        const s = sim.physics.getState(e.id);
        if (Math.abs(s.x - b.x) > b.radius) continue;
        const bottom = s.y + sim.halfHeight(e);
        if (bottom < sim.surfaceY(s.x) - 0.3 || !sim.hasTag(e.id, 'tag_wet')) continue;
        wet = true;
        break;
      }
    if (!wet) return;
    sim.events.emit('sunflower_drank', { x: b.x, y: b.y });
    this.unlock(b.opens, b.x, b.y - 2);
  }

  /** The lattice panel: pulled aside, flung, or knocked flat, and the way in is open. */
  private lattice(b: Barrier): void {
    const sim = this.sim;
    const panels = sim.entities.ofKind('item').filter((e) => e.defId === 'item_lattice_panel');
    // No panel at all (an empty test world): nothing to move, so the way stays shut.
    const moved =
      panels.length > 0 &&
      panels.some((e) => {
        if (sim.isPocketed(e.id)) return true;
        const s = sim.physics.getState(e.id);
        return Math.abs(s.x - b.x) > LATTICE_MOVED || Math.abs(s.angle) > LATTICE_TIPPED;
      });
    if (!moved || panels.some((e) => sim.physics.grabbed === e.id)) return;
    this.unlock(b.opens, b.x, b.y);
  }

  /**
   * The can tunnel (secret_rollo_tunnel): something round rolling into it
   * at floor level pops out the far side. The right size bumps the latch and
   * the can wall swings open; a marble is too small and rolls back with a
   * sad clink.
   */
  private tunnel(b: Barrier): void {
    const sim = this.sim;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
      const r = this.roundRadius(e);
      if (r === null) continue;
      const s = sim.physics.getState(e.id);
      if (s.x < b.wall - r - 0.5 || s.x > b.wall + 0.05 || s.vx < 0.4) continue;
      if (s.y + r < sim.surfaceY(s.x) - 0.25 || s.y - r > sim.surfaceY(s.x) - 0.1) continue;
      const seen = this.tunnelSeen.get(e.id);
      if (seen !== undefined && sim.tick - seen < SIM_HZ) continue;
      this.tunnelSeen.set(e.id, sim.tick);
      const fits = r * 2 >= LATCH_MIN && r * 2 <= LATCH_MAX;
      sim.events.emit('tunnel_rolled', { id: e.id, fits, x: b.wall, y: sim.surfaceY(b.wall) - r });
      if (!fits) {
        // Under the latch with a clink, and back out it rolls.
        sim.physics.setVelocity(e.id, -Math.max(0.8, s.vx * 0.6), s.vy);
        continue;
      }
      // Through the can and out the other side, bumping the latch on the way.
      const out = this.canRight(b) + r + 0.1;
      sim.physics.setPosition(e.id, out, sim.surfaceY(out) - r - 0.02);
      sim.physics.setVelocity(e.id, Math.max(1.5, s.vx), 0);
      this.unlock(b.opens, b.wall, sim.surfaceY(b.wall) - 0.6);
    }
  }

  /** The far side of the can wall. */
  private canRight(b: Barrier): number {
    for (const s of b.area.solids ?? []) if (s.until === b.opens && s.box) return b.area.xStart + s.box[2];
    return b.wall + 0.8;
  }

  /** How round and how big: a circle item, or a bug curled into a ball. Null if not round. */
  private roundRadius(e: Entity): number | null {
    const sim = this.sim;
    if (e.kind === 'bug')
      return sim.isRolling(e.id) || sim.potions.has(e, 'snowball') || sim.potions.has(e, 'tiny')
        ? sim.bugDef(e).radius
        : null;
    const shape = sim.content.items.get(e.defId).shape;
    return shape.type === 'circle' ? shape.radius : null;
  }

  // --- The bucket lift -----------------------------------------------------

  private bottomY(): number {
    const lift = this.barrier('bucket_lift');
    return lift ? this.sim.surfaceY(lift.x) - 0.04 : 9;
  }

  /** The top bucket goes down as the bottom one goes up. */
  private topBucketY(): number {
    const bottom = this.bottomY();
    const travel = bottom - LIFT_TOP;
    const up = bottom - this.state.lift.y;
    return LIFT_TOP - 0.85 + (up / Math.max(0.01, travel)) * (bottom - 0.4 - (LIFT_TOP - 0.85));
  }

  /** Where the buckets are now, for the renderer: floor tops in world y. */
  buckets(): { x: number; bottom: number; top: number; topX: number } | null {
    const lift = this.barrier('bucket_lift');
    if (!lift) return null;
    return { x: lift.x, bottom: this.state.lift.y, top: this.topBucketY(), topX: lift.x + TOP_BUCKET_DX };
  }

  /** Move the kinematic buckets to arrive where the state says after `dt` seconds. */
  private placeBuckets(dt: number): void {
    const lift = this.barrier('bucket_lift');
    if (!lift) return;
    this.sim.physics.moveKinematic('bucket_bottom', lift.x, this.state.lift.y + 0.06, dt);
    this.sim.physics.moveKinematic('bucket_top', lift.x + TOP_BUCKET_DX, this.topBucketY() + 0.06, dt);
  }

  /** What is in the bottom bucket right now (not held), with its total mass. */
  bucketLoad(): { ids: EntityId[]; mass: number } {
    const sim = this.sim;
    const lift = this.barrier('bucket_lift');
    const ids: EntityId[] = [];
    let mass = 0;
    if (!lift) return { ids, mass };
    const floor = this.state.lift.y;
    const half = BUCKET_W / 2 - 0.08;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
      const s = sim.physics.getState(e.id);
      if (Math.abs(s.x - lift.x) > half || s.y > floor + 0.05 || s.y < floor - 1.5) continue;
      ids.push(e.id);
      mass += sim.physics.mass(e.id);
    }
    return { ids, mass };
  }

  /** How heavy the bottom bucket's load must be to rise. */
  liftThreshold(): number {
    return this.isOpen('area_treehouse_arcade') ? COUNTERWEIGHT_MASS : ACORN_MASS;
  }

  private updateLift(b: Barrier): void {
    const sim = this.sim;
    const lift = this.state.lift;
    const bottom = this.bottomY();
    const top = LIFT_TOP;
    if (sim.isAreaAsleep(b.area.id)) return;
    switch (lift.phase) {
      case 'down': {
        if (sim.tick % 15 !== 0) break;
        const load = this.bucketLoad();
        // Heavy enough for half a second running: up it goes.
        lift.timer = load.mass > this.liftThreshold() ? lift.timer + 1 : 0;
        if (lift.timer >= 2) {
          lift.phase = 'up';
          lift.timer = 0;
          sim.events.emit('lift_moved', {
            phase: 'up',
            x: b.x,
            y: lift.y,
            count: load.ids.length,
            first: this.closed(b),
          });
        }
        break;
      }
      case 'up':
        lift.y = Math.max(top, lift.y - LIFT_SPEED * SIM_DT);
        if (lift.y <= top) {
          lift.phase = 'top';
          lift.timer = 30;
        }
        break;
      case 'top':
        if (--lift.timer === 0) this.tipOut(b);
        if (lift.timer <= -90) {
          lift.phase = 'back';
          sim.events.emit('lift_moved', { phase: 'back', x: b.x, y: lift.y, count: 0, first: false });
        }
        break;
      case 'back':
        lift.y = Math.min(bottom, lift.y + LIFT_SPEED * SIM_DT);
        if (lift.y >= bottom) {
          lift.y = bottom;
          lift.phase = 'down';
          lift.timer = 0;
          sim.events.emit('lift_moved', { phase: 'down', x: b.x, y: lift.y, count: 0, first: false });
        }
        break;
    }
    this.placeBuckets(SIM_DT);
  }

  /** At the top, the bucket tips and tosses what it carried up onto the treehouse floor. */
  private tipOut(b: Barrier): void {
    const sim = this.sim;
    const load = this.bucketLoad();
    const first = this.closed(b);
    const house = sim.content.areas.tryGet(b.opens);
    const landX = (house?.xStart ?? b.wall + 3) + TOSS_TO;
    load.ids.forEach((id, i) => {
      const e = sim.entities.get(id)!;
      // Up over the rim as the bucket tips...
      const rim = this.state.lift.y - BUCKET_WALL - sim.halfHeight(e) - 0.08 - i * 0.02;
      sim.physics.setPosition(id, lift(b).x + (i % 3) * 0.2 - 0.2, rim);
      const s = sim.physics.getState(id);
      const toX = landX + i * 0.55;
      const toY = sim.surfaceY(toX) - sim.halfHeight(e) - 0.05;
      const vx = (toX - s.x) / TOSS_TIME;
      const vy = (toY - s.y - 0.5 * GRAVITY * TOSS_TIME * TOSS_TIME) / TOSS_TIME;
      sim.tossed(id, vx, vy);
    });
    sim.events.emit('lift_moved', {
      phase: 'top',
      x: b.x,
      y: this.state.lift.y,
      count: load.ids.length,
      first,
    });
    if (first) this.unlock(b.opens, b.x, this.state.lift.y);
  }
}
