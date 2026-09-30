import type { EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Sim } from '../sim';
import { PERMANENT } from './tags';

/**
 * The setup rule (game design doc, section 5): bugs never undo the player.
 *
 * - Anything the player grabs, drops, or pokes gets `tag_player_setup` for
 *   300 s. Touching it again restarts the timer.
 * - Things built into a structure (three or more stacked on each other, or
 *   glued by something sticky) keep the tag for good while one of them was
 *   placed by the player. Pulled apart, each piece goes back to a 300 s timer.
 *
 * The AI reads the tag: bugs may use a setup in place (bounce on it, sniff
 * it, nap by it) but never carry, roll, pack, or eat it, never push it, and
 * never hop or throw things onto it.
 */
export const SETUP_TAG = 'tag_player_setup';
export const SETUP_SECONDS = 300;
/** A thing touched by the player this recently is new and interesting (60 s). */
export const FRESH_SECONDS = 60;
/** Structure checks run at 4 Hz. */
const CHECK_TICKS = 15;
/** Pieces slower than this count as resting. */
const RESTING_SPEED = 0.3;
/** Pieces of a structure falling faster than this crashed. */
const FALLING_SPEED = 2;

export class SetupRule {
  constructor(private readonly sim: Sim) {}

  /** When the player last touched each thing, for the curiosity bonus. Not saved: it lasts a minute. */
  private readonly touched = new Map<EntityId, number>();

  /** The player touched a thing: it is theirs for 300 s (or for good, in a structure). */
  touch(id: EntityId): void {
    const e = this.sim.entities.get(id);
    if (e?.kind !== 'item') return;
    this.touched.set(id, this.sim.tick);
    if (this.isPermanent(id)) return;
    this.retime(id);
  }

  /** Is this a player setup right now? */
  has(id: EntityId): boolean {
    // Never a default tag, so the entity's own tag state says it all.
    const v = this.sim.entities.get(id)?.tags?.[SETUP_TAG];
    return v !== undefined && (v === PERMANENT || v > this.sim.tick);
  }

  /** Placed by the player within the last minute: bugs come over to sniff it. */
  fresh(id: EntityId): boolean {
    const at = this.touched.get(id);
    if (at === undefined) return false;
    if (this.sim.tick - at <= FRESH_SECONDS * SIM_HZ) return true;
    this.touched.delete(id);
    return false;
  }

  isPermanent(id: EntityId): boolean {
    return this.sim.entities.get(id)?.tags?.[SETUP_TAG] === PERMANENT;
  }

  /** Put the tag on a fresh 300 s timer. */
  private retime(id: EntityId): void {
    if (this.isPermanent(id)) this.sim.removeTag(id, SETUP_TAG, 'player');
    // A timed tag only ever grows, so this restarts the 300 s from now.
    this.sim.addTag(id, SETUP_TAG, 'player', SETUP_SECONDS);
  }

  /**
   * Find structures: things resting on each other (three or more) or glued
   * together, with at least one piece the player placed. Their pieces keep the
   * tag for good. Pieces that leave a structure go back to a timer, and a
   * structure that falls fast enough is announced so bugs turn and look.
   */
  update(): void {
    const sim = this.sim;
    if (sim.tick % CHECK_TICKS !== 0) return;
    const physics = sim.physics;
    const parent = new Map<EntityId, EntityId>();
    const find = (id: EntityId): EntityId => {
      let r = id;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(id, r);
      return r;
    };
    const join = (a: EntityId, b: EntityId): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
    };
    const steady = (id: EntityId): boolean => {
      const e = sim.entities.get(id);
      if (e?.kind !== 'item' || sim.isSleeping(id) || !physics.isActive(id) || physics.grabbed === id)
        return false;
      const s = physics.getState(id);
      return Math.hypot(s.vx, s.vy) < RESTING_SPEED;
    };
    const glued = new Set<EntityId>();
    for (const [a, b] of physics.restingPairs()) {
      if (!steady(a) || !steady(b)) continue;
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      join(a, b);
    }
    for (const stick of sim.environment.state.sticks) {
      const ea = sim.entities.get(stick.a);
      const eb = sim.entities.get(stick.b);
      if (
        ea?.kind !== 'item' ||
        eb?.kind !== 'item' ||
        physics.grabbed === stick.a ||
        physics.grabbed === stick.b
      )
        continue;
      if (!parent.has(stick.a)) parent.set(stick.a, stick.a);
      if (!parent.has(stick.b)) parent.set(stick.b, stick.b);
      join(stick.a, stick.b);
      glued.add(stick.a);
      glued.add(stick.b);
    }
    const groups = new Map<EntityId, EntityId[]>();
    for (const id of [...parent.keys()].sort((a, b) => a - b)) {
      const root = find(id);
      const g = groups.get(root) ?? [];
      g.push(id);
      groups.set(root, g);
    }
    const built = new Set<EntityId>();
    for (const members of groups.values()) {
      const structure = members.length >= 3 || members.some((m) => glued.has(m));
      if (!structure || !members.some((m) => this.has(m))) continue;
      for (const m of members) {
        built.add(m);
        if (!this.isPermanent(m)) sim.addTag(m, SETUP_TAG, 'stack', null);
      }
    }
    // Pieces no longer in a structure go back on a timer. A fast fall is a crash.
    const fell: { x: number; y: number }[] = [];
    for (const e of sim.entities.ofKind('item')) {
      if (built.has(e.id) || !this.isPermanent(e.id)) continue;
      if (sim.isSleeping(e.id)) continue;
      const s = physics.getState(e.id);
      if (Math.hypot(s.vx, s.vy) > FALLING_SPEED && physics.grabbed !== e.id) fell.push({ x: s.x, y: s.y });
      this.retime(e.id);
    }
    if (fell.length >= 2) {
      const x = fell.reduce((a, f) => a + f.x, 0) / fell.length;
      const y = fell.reduce((a, f) => a + f.y, 0) / fell.length;
      sim.events.emit('stack_fell', { x, y, count: fell.length });
    }
  }
}
