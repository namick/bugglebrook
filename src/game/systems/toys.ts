import type { Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import { GRAVITY } from '../constants';
import type { ItemDef } from '../data/types';
import type { Impact } from '../physics/physics';
import type { Sim } from '../sim';
import { SKY_TOP } from './potions';

/**
 * Crafted toys and balloons in the world (game design doc, section 7.1, and
 * rule R17). Each is an ordinary physics item; this gives each kind its
 * trick: balloons and the basket lift, the trampoline bounces harder, the
 * slingshot fires what is pulled back from its fork, the spring launcher
 * and the straw rocket fire on a click, the parachute slows a fall, the
 * seesaw and the spoon catapult turn on their pivots, the disco ball hangs
 * from an overhang and gets bugs dancing, and instruments play notes.
 */

/** One balloon lifts this much (kg): a small bug, or a medium one with three (rule R17). */
export const BALLOON_LIFT = 0.9;
/** Balloons rise at about this speed when they can (m/s, up is negative). */
const RISE = -1.2;
/** The basket lifts itself and up to about two small bugs. */
export const BASKET_CARGO = 2;
const BASKET_RISE = -0.55;
/** The trampoline gives back a bit more than it gets, up to this speed (1400 px/s). */
export const TRAMPOLINE_CAP = 14;
/** The slingshot's fork: things pulled back from it this far fly, faster the further. */
const SLING_GRAB = 0.7;
const SLING_MIN = 0.3;
const SLING_MAX = 1.9;
const SLING_POWER = 13;
const SLING_CAP = 24;
/** The spring launcher fires at 1600 px/s, the straw rocket at 2200. */
const ROCKET_SPEED = 22;
/** A parachute falls no faster than 80 px/s (plus what it carries). */
const CHUTE_FALL = 0.8;
/** A disco ball hangs when let go this close under an overhang. */
const HANG_REACH = 2.2;
/** Bugs this close to a hung disco ball dance now and then. */
const DISCO_RANGE = 4;
const DISCO_EVERY = 5 * SIM_HZ;
/** Things struck at 1.5 m/s or more play their note (rule R20). */
const NOTE_SPEED = 1.5;
/** The seesaw tips this far each way; the catapult's spoon swings between these. */
const SEESAW_TIP = 0.3;
const SPOON_REST = 0.38;
const SPOON_DOWN = -0.32;
const SPOON_SPRING = 900;

export class Toys {
  /** The slingshot being pulled, and what is in it. Not saved: it lasts as long as a press. */
  pulling: { sling: EntityId; item: EntityId } | null = null;
  /** Notes rate-limited per thing. */
  private noted = new Map<EntityId, number>();

  constructor(private readonly sim: Sim) {}

  private def(e: Entity): ItemDef | null {
    return e.kind === 'item' ? this.sim.content.items.get(e.defId) : null;
  }

  /** Pivots and hangs come back after a load. */
  restore(): void {
    const sim = this.sim;
    for (const e of sim.entities.ofKind('item')) {
      const t = e.toy;
      if (!t) continue;
      if (t.pivot) this.pivot(e, t.pivot[0], t.pivot[1]);
      if (t.hung) sim.physics.setPinned(e.id, true);
    }
  }

  // --- Hooks from the sim ------------------------------------------------

  /** Grabbed: off its pivot or hook; and is it being pulled back in a slingshot? */
  grabbed(e: Entity, x: number, y: number): void {
    const sim = this.sim;
    if (e.toy?.pivot) {
      sim.physics.removePivot(e.id);
      delete e.toy.pivot;
    }
    if (e.toy?.hung) delete e.toy.hung;
    if (e.toy && Object.keys(e.toy).length === 0) delete e.toy;
    this.pulling = null;
    for (const sling of sim.entities.ofKind('item')) {
      if (this.def(sling)?.toy !== 'slingshot' || sling.id === e.id || sim.isSleeping(sling.id)) continue;
      const f = this.fork(sling);
      if (f && Math.hypot(x - f.x, y - f.y) <= SLING_GRAB) {
        this.pulling = { sling: sling.id, item: e.id };
        return;
      }
    }
  }

  /** Where a slingshot's band sits: between the tops of its fork. Null if it has tipped over. */
  fork(sling: Entity): { x: number; y: number } | null {
    const s = this.sim.physics.getState(sling.id);
    if (Math.abs(s.angle) > 0.6) return null;
    const h = this.sim.halfHeight(sling) * 0.55;
    return { x: s.x + Math.sin(s.angle) * h, y: s.y - Math.cos(s.angle) * h };
  }

  /**
   * Let go. A slingshot fires what was pulled back; a balloon or parachute
   * let go touching something ties on; a disco ball under an overhang
   * hangs there. Returns true if a toy took over the throw.
   */
  released(e: Entity): boolean {
    const sim = this.sim;
    const pull = this.pulling;
    this.pulling = null;
    if (pull && pull.item === e.id && sim.entities.has(pull.sling)) {
      const sling = sim.entities.get(pull.sling)!;
      const f = this.fork(sling);
      const s = sim.physics.getState(e.id);
      if (f) {
        const dx = f.x - s.x;
        const dy = f.y - s.y;
        const d = Math.hypot(dx, dy);
        if (d >= SLING_MIN) {
          const speed = Math.min(SLING_CAP, SLING_POWER * Math.min(d, SLING_MAX));
          sim.physics.setPosition(e.id, f.x - (dx / d) * 0.1, f.y - (dy / d) * 0.1);
          sim.physics.setVelocity(e.id, (dx / d) * speed, (dy / d) * speed);
          sim.events.emit('toy_used', { id: sling.id, toy: 'slingshot', action: 'fire', x: f.x, y: f.y });
          return true;
        }
      }
    }
    const def = this.def(e);
    if (!def) return false;
    if (def.lift !== undefined || def.toy === 'parachute') return this.tie(e);
    if (def.toy === 'disco') return this.hang(e);
    return false;
  }

  /** A balloon's string, or a parachute's lines, tie onto what they touch. */
  private tie(e: Entity): boolean {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    const half = sim.halfHeight(e);
    const end = { x: s.x, y: s.y + half + (this.def(e)?.toy === 'parachute' ? 0.3 : 0.55) };
    let best: { id: EntityId; d: number } | null = null;
    for (const o of sim.entities.all()) {
      if (o.id === e.id || sim.isSleeping(o.id) || !sim.physics.isActive(o.id)) continue;
      if (o.bug?.pending) continue;
      const os = sim.physics.getState(o.id);
      const d = Math.hypot(os.x - end.x, os.y - sim.halfHeight(o) - end.y);
      if (d < 0.6 && (!best || d < best.d)) best = { id: o.id, d };
    }
    if (!best) return false;
    const os = sim.physics.getState(best.id);
    sim.environment.tie(e.id, best.id, os.x, os.y - sim.halfHeight(sim.entities.get(best.id)!));
    sim.events.emit('toy_used', {
      id: e.id,
      toy: this.def(e)?.toy ?? 'parachute',
      action: 'attach',
      x: os.x,
      y: os.y,
    });
    return false;
  }

  /** A disco ball let go under an overhang hangs from it on a thread. */
  private hang(e: Entity): boolean {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    if (!sim.physics.coveredAbove(e.id, s.x, s.y - 0.35, HANG_REACH)) return false;
    sim.physics.place(e.id, s.x, s.y, 0);
    sim.physics.setPinned(e.id, true);
    e.toy = { ...(e.toy ?? {}), hung: [s.x, s.y] };
    sim.events.emit('toy_used', { id: e.id, toy: 'disco', action: 'hang', x: s.x, y: s.y });
    return true;
  }

  /** A click on a toy. True if it did its thing (instead of a hop). */
  poked(e: Entity): boolean {
    const sim = this.sim;
    const def = this.def(e);
    if (!def) return false;
    const s = sim.physics.getState(e.id);
    switch (def.toy) {
      case 'launcher':
        this.fireLauncher(e, def);
        return true;
      case 'rocket': {
        const up = { x: Math.sin(s.angle), y: -Math.cos(s.angle) };
        // It stands itself up and goes.
        sim.physics.place(e.id, s.x, s.y - 0.1, 0);
        sim.physics.setVelocity(e.id, up.x * 2, -ROCKET_SPEED);
        e.toy = { ...(e.toy ?? {}), flying: true };
        sim.events.emit('toy_used', { id: e.id, toy: 'rocket', action: 'launch', x: s.x, y: s.y });
        return true;
      }
      case 'basket': {
        const off = !e.toy?.off;
        if (off) e.toy = { ...(e.toy ?? {}), off: true };
        else if (e.toy) delete e.toy.off;
        sim.events.emit('toy_used', {
          id: e.id,
          toy: 'basket',
          action: off ? 'deflate' : 'inflate',
          x: s.x,
          y: s.y,
        });
        return true;
      }
      case 'instrument':
        this.note(e, s.x, s.y, true);
        return false;
      default:
        if (def.tags.includes('tag_musical')) this.note(e, s.x, s.y, true);
        return false;
    }
  }

  /** The spring launcher fires whatever sits on it straight up its axis. */
  private fireLauncher(e: Entity, def: ItemDef): void {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    const up = { x: Math.sin(s.angle), y: -Math.cos(s.angle) };
    const speed = (def.launchSpeed ?? 16) * Math.sqrt(sim.potions.scaleOf(e));
    let count = 0;
    for (const c of sim.physics.contactsOf(e.id)) {
      // The other thing is above: the normal from the launcher to it points up its axis.
      if (c.nx * up.x + c.ny * up.y < 0.5) continue;
      const o = sim.entities.get(c.other);
      if (!o || sim.physics.grabbed === o.id) continue;
      sim.launchFromToy(o, up.x * speed, up.y * speed);
      count++;
    }
    sim.events.emit('toy_used', { id: e.id, toy: 'launcher', action: 'fire', x: s.x, y: s.y });
    void count;
  }

  /** Rule R20: a musical thing plays its note, at most a few times a second. */
  private note(e: Entity, x: number, y: number, poked: boolean): void {
    const sim = this.sim;
    const last = this.noted.get(e.id) ?? -99;
    if (sim.tick - last < (poked ? 4 : 9)) return;
    this.noted.set(e.id, sim.tick);
    const note = this.def(e)?.note ?? e.id % 7;
    sim.events.emit('note_played', { id: e.id, defId: e.defId, note, x, y });
  }

  /** New contacts: trampoline bounces, notes from musical things. */
  impacts(impacts: readonly Impact[]): void {
    const sim = this.sim;
    for (const impact of impacts) {
      for (const [id, other, sign] of [
        [impact.a, impact.b, 1],
        [impact.b, impact.a, -1],
      ] as const) {
        if (id === null) continue;
        const e = sim.entities.get(id);
        if (!e || e.kind !== 'item') continue;
        const def = sim.content.items.get(e.defId);
        if (def.toy === 'trampoline' && impact.speed > 2 && other !== null)
          this.bounce(e, other, impact, sign);
        if (def.tags.includes('tag_musical') && impact.speed >= NOTE_SPEED)
          this.note(e, impact.px, impact.py, false);
      }
    }
  }

  /**
   * The trampoline gives back a little more than it got (restitution 1.05),
   * up to 1400 px/s, to whatever lands on its bed from above.
   */
  private bounce(t: Entity, otherId: EntityId, impact: Impact, sign: number): void {
    const sim = this.sim;
    const physics = sim.physics;
    if (!sim.entities.has(otherId) || physics.grabbed === otherId) return;
    const s = physics.getState(t.id);
    const up = { x: Math.sin(s.angle), y: -Math.cos(s.angle) };
    // The normal from the trampoline to the other thing points up its axis: it came down on the bed.
    if ((impact.nx * up.x + impact.ny * up.y) * sign < 0.6) return;
    const speed = Math.min(TRAMPOLINE_CAP, impact.speed * 1.05);
    const o = physics.getState(otherId);
    const along = o.vx * up.x + o.vy * up.y;
    physics.setVelocity(otherId, o.vx + up.x * (speed - along), o.vy + up.y * (speed - along));
    const other = sim.entities.get(otherId)!;
    if (other.bug && !other.bug.pending) sim.bounceBug(other, t.id);
    sim.events.emit('toy_used', { id: t.id, toy: 'trampoline', action: 'boing', x: impact.px, y: impact.py });
  }

  // --- Per step ------------------------------------------------------------

  /** Forces for the coming step: lift, drag, springs. */
  beforePhysics(): void {
    const sim = this.sim;
    const physics = sim.physics;
    const lifted = new Set<EntityId>();
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || !physics.isActive(e.id)) continue;
      const def = sim.content.items.get(e.defId);
      if (def.lift !== undefined && !lifted.has(e.id)) this.lift(e, lifted);
      switch (def.toy) {
        case 'basket':
          this.basket(e);
          break;
        case 'parachute':
          this.chute(e);
          break;
        case 'rocket':
          if (e.toy?.flying) this.rocket(e);
          break;
        case 'seesaw':
          this.settle(e, 'seesaw');
          break;
        case 'catapult':
          this.settle(e, 'catapult');
          if (e.toy?.pivot) this.spoon(e);
          break;
        case 'trampoline':
          this.capBounces(e);
          break;
        case 'disco':
          if (e.toy?.hung) this.disco(e);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Rule R17: balloons lift what they are tied to, if they can. They rise
   * gently up to a roof or the top of the sky.
   */
  private lift(balloon: Entity, done: Set<EntityId>): void {
    const sim = this.sim;
    const physics = sim.physics;
    const group = sim.environment.tiedGroup(balloon.id);
    const balloons = group.filter((id) => {
      const e = sim.entities.get(id);
      return !!e && e.kind === 'item' && sim.content.items.get(e.defId).lift !== undefined;
    });
    for (const id of balloons) done.add(id);
    const held = group.some((id) => physics.grabbed === id);
    const mass = group.reduce((m, id) => m + physics.mass(id), 0);
    const capacity = balloons.length * BALLOON_LIFT * GRAVITY;
    const s = physics.getState(balloon.id);
    const want = mass * (GRAVITY + 4 * (s.vy - RISE));
    const force = held ? Math.min(capacity, mass * GRAVITY) : Math.max(0, Math.min(capacity, want));
    for (const id of balloons) {
      physics.applyForce(id, 0, -force / balloons.length);
      this.keepUnderSky(id);
    }
    // Enough to lift a bug off its feet: it goes up with them, paddling.
    if (!held && capacity > mass * GRAVITY * 1.02)
      for (const id of group) {
        const bug = sim.entities.get(id);
        if (bug?.bug && !bug.bug.pending && sim.physics.isSupported(id)) sim.liftBug(bug);
      }
  }

  /** The balloon basket rises with its cargo while inflated, and sinks slowly when let down. */
  private basket(e: Entity): void {
    const sim = this.sim;
    const physics = sim.physics;
    const s = physics.getState(e.id);
    let cargo = 0;
    for (const o of sim.entities.all()) {
      if (o.id === e.id || sim.isSleeping(o.id) || !physics.isActive(o.id)) continue;
      const os = physics.getState(o.id);
      if (Math.abs(os.x - s.x) < 0.66 && os.y < s.y + 0.8 && os.y > s.y - 0.4) cargo += physics.mass(o.id);
    }
    const own = physics.mass(e.id);
    const mass = own + cargo;
    if (physics.grabbed === e.id) {
      physics.applyForce(e.id, 0, -own * GRAVITY);
      return;
    }
    const capacity = (own + BASKET_CARGO) * GRAVITY;
    const target = e.toy?.off ? 0.6 : BASKET_RISE;
    const want = mass * (GRAVITY + 3 * (s.vy - target));
    physics.applyForce(e.id, 0, -Math.max(0, Math.min(capacity, want)));
    // It drifts with the wind outdoors.
    const wind = sim.environment.state.wind;
    if (wind !== 0 && sim.outdoors(s.x, s.y) && !physics.isSupported(e.id))
      physics.applyForce(e.id, mass * 0.8 * (wind - s.vx), 0);
    this.keepUnderSky(e.id);
  }

  /** A parachute (and whatever it is tied to) falls slowly. */
  private chute(e: Entity): void {
    const sim = this.sim;
    const physics = sim.physics;
    if (physics.grabbed !== null && sim.environment.tiedGroup(e.id).includes(physics.grabbed)) return;
    const s = physics.getState(e.id);
    if (s.vy <= CHUTE_FALL) return;
    const group = sim.environment.tiedGroup(e.id);
    const mass = group.reduce((m, id) => m + physics.mass(id), 0);
    physics.applyForce(e.id, -mass * 0.6 * s.vx, -mass * Math.min(GRAVITY * 1.6, 14 * (s.vy - CHUTE_FALL)));
  }

  /** A straw rocket coming back down on its little parachute. */
  private rocket(e: Entity): void {
    const sim = this.sim;
    const physics = sim.physics;
    const s = physics.getState(e.id);
    if (s.vy > 1.2) {
      const m = physics.mass(e.id);
      physics.applyForce(e.id, -m * 0.8 * s.vx, -m * Math.min(GRAVITY * 1.5, 30 * (s.vy - 1.2)));
      physics.applyTorque(e.id, -s.angle * physics.inertia(e.id) * 40);
    }
    if (s.vy >= 0 && s.vy < 1.6 && physics.isSupported(e.id) && e.toy) delete e.toy.flying;
  }

  /**
   * A seesaw or catapult let go comes to rest on its pivot: from then on it
   * turns about it. Grabbing it lifts it off.
   */
  private settle(e: Entity, kind: 'seesaw' | 'catapult'): void {
    const sim = this.sim;
    const physics = sim.physics;
    if (e.toy?.pivot || physics.grabbed === e.id || physics.isPinned(e.id)) return;
    const s = physics.getState(e.id);
    if (Math.hypot(s.vx, s.vy) > 0.15 || Math.abs(s.av) > 0.2 || !physics.isSupported(e.id)) return;
    if (Math.abs(s.angle) > 0.5) return;
    const k = sim.potions.scaleOf(e);
    // The pivot: the bottom of the cork (seesaw) or the eraser (catapult).
    const local = kind === 'seesaw' ? { x: 0, y: 0.25 * k } : { x: 0.4 * k, y: 0.31 * k };
    const c = Math.cos(s.angle);
    const sn = Math.sin(s.angle);
    const px = s.x + local.x * c - local.y * sn;
    const py = s.y + local.x * sn + local.y * c;
    this.pivot(e, px, py);
    e.toy = { ...(e.toy ?? {}), pivot: [px, py] };
  }

  private pivot(e: Entity, x: number, y: number): void {
    const physics = this.sim.physics;
    const angle = physics.getState(e.id).angle;
    if (this.def(e)?.toy === 'catapult') physics.setPivot(e.id, x, y, SPOON_DOWN - angle, SPOON_REST - angle);
    else physics.setPivot(e.id, x, y, -SEESAW_TIP - angle, SEESAW_TIP - angle);
  }

  /** The catapult's spoon springs back up to rest: pull it down and let go, and whatever is in it flies. */
  private spoon(e: Entity): void {
    const physics = this.sim.physics;
    if (physics.grabbed === e.id) return;
    const s = physics.getState(e.id);
    // Turning about the pivot, not the middle: add the parallel-axis part.
    const p = e.toy!.pivot!;
    const inertia = physics.inertia(e.id) + physics.mass(e.id) * ((s.x - p[0]) ** 2 + (s.y - p[1]) ** 2);
    const torque = (SPOON_SPRING * (SPOON_REST - s.angle) - 10 * s.av) * inertia;
    physics.applyTorque(e.id, torque);
    if (s.av > 6 && s.angle > SPOON_REST - 0.12 && this.sim.tick % 4 === 0)
      this.sim.events.emit('toy_used', { id: e.id, toy: 'catapult', action: 'fling', x: s.x, y: s.y });
  }

  /** The trampoline gives a bit extra, but never more than 1400 px/s. */
  private capBounces(e: Entity): void {
    const sim = this.sim;
    for (const c of sim.physics.contactsOf(e.id)) {
      const s = sim.physics.getState(c.other);
      const v = Math.hypot(s.vx, s.vy);
      if (v > TRAMPOLINE_CAP)
        sim.physics.setVelocity(c.other, (s.vx / v) * TRAMPOLINE_CAP, (s.vy / v) * TRAMPOLINE_CAP);
    }
  }

  /** Bugs near a hung disco ball dance every few seconds. */
  private disco(e: Entity): void {
    const sim = this.sim;
    if ((sim.tick + e.id * 7) % DISCO_EVERY !== 0) return;
    const s = sim.physics.getState(e.id);
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || b.pending || sim.isSleeping(bug.id)) continue;
      if (b.mode !== 'st_idle' && b.mode !== 'st_wander') continue;
      const bs = sim.physics.getState(bug.id);
      // A hung ball is up high: bugs on the floor under it count.
      if (Math.abs(bs.x - s.x) > DISCO_RANGE || bs.y < s.y - 1) continue;
      sim.reactBug(bug, 'dance');
    }
  }

  /** Lifted things stop at the top of the sky. */
  private keepUnderSky(id: EntityId): void {
    const physics = this.sim.physics;
    const s = physics.getState(id);
    const half = this.sim.halfHeight(this.sim.entities.get(id)!);
    if (s.y - half >= SKY_TOP) return;
    physics.setPosition(id, s.x, SKY_TOP + half);
    if (s.vy < 0) physics.setVelocity(id, s.vx, 0);
  }

  forget(id: EntityId): void {
    this.noted.delete(id);
    if (this.pulling && (this.pulling.item === id || this.pulling.sling === id)) this.pulling = null;
  }
}
