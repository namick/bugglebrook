import type { Entity } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Sim } from '../sim';
import { react } from './bugMove';

/**
 * The cast and the bugs still to be found (game design doc, section 4,
 * "Found", and section 12). A hidden bug joins through its find secret.
 * Some wait in the world first (`brain.pending`): Moose stuck on his back,
 * Barty ignoring everyone, Twig pretending to be a twig. The rest come out
 * of hiding when found: Whiff from behind his pot, Munch from his leaf,
 * Prim from the claw machine. Other bugs never play with a pending bug.
 */

/** Twig peeks every 20 to 40 s, for 400 ms, when the hand is at least 2.5 m away. */
export const BLINK_EVERY: readonly [number, number] = [20 * SIM_HZ, 40 * SIM_HZ];
export const BLINK_TICKS = 24;
export const WATCHED = 2.5;
/** Something round within this reach (m) of Barty gets his attention. */
export const BALL_REACH = 1.3;
/** A bump this hard (m/s) flips Moose back onto his feet. */
export const FLIP_BUMP = 2;

export class Cast {
  constructor(private readonly sim: Sim) {}

  /** Is a bug of this kind in the world (joined or waiting to be found)? */
  present(defId: string): boolean {
    return this.sim.entities.ofKind('bug').some((b) => b.defId === defId);
  }

  /** Has this bug joined the cast? */
  joined(defId: string): boolean {
    return this.sim.entities.ofKind('bug').some((b) => b.defId === defId && !b.bug?.pending);
  }

  /** Bugs that have joined, by def ID. */
  members(): string[] {
    return [
      ...new Set(
        this.sim.entities
          .ofKind('bug')
          .filter((b) => !b.bug?.pending)
          .map((b) => b.defId),
      ),
    ];
  }

  /**
   * Bring a hidden bug out: the one waiting in the world, or a new one at
   * (x, y). With `join`, it joins the cast at once. Null if it is already
   * here and joined, or does not exist.
   */
  find(defId: string, x: number, y: number, join = true): Entity | null {
    const sim = this.sim;
    if (!sim.content.bugs.has(defId) || this.joined(defId)) return null;
    let e = sim.entities.ofKind('bug').find((b) => b.defId === defId) ?? null;
    if (!e) {
      e = sim.spawn('bug', defId, x, y);
      sim.physics.setVelocity(e.id, 0, -3);
    }
    if (join) this.join(e, x, y);
    return e;
  }

  /** A found bug joins: its secret is logged, and it cheers. */
  join(e: Entity, x: number, y: number): void {
    const sim = this.sim;
    const b = e.bug;
    if (!b) return;
    const was = b.pending;
    delete b.pending;
    delete b.eyesUntil;
    b.restX = x;
    const def = sim.content.bugs.get(e.defId);
    const s = sim.physics.getState(e.id);
    if (was !== undefined || !sim.secrets.includes(def.foundBy ?? '')) {
      sim.events.emit('bug_joined', { id: e.id, defId: e.defId, x: s.x, y: s.y });
      sim.bugNotice(e, react(b, 'join', sim.rng, sim.tick));
    }
    if (def.foundBy) sim.findSecret(def.foundBy, x, y);
  }

  /** Waiting bugs give themselves away, and get found. */
  update(): void {
    const sim = this.sim;
    for (const e of sim.entities.ofKind('bug')) {
      const b = e.bug;
      if (!b?.pending || sim.isSleeping(e.id)) continue;
      const s = sim.physics.getState(e.id);
      if (b.pending === 'disguised') {
        // Twig: two tiny eyes open now and then, when nobody seems to be looking.
        const hand = sim.hand;
        const far = !hand || Math.hypot(hand.x - s.x, hand.y - s.y) >= WATCHED;
        b.blinkAt ??= sim.tick + sim.rng.int(BLINK_EVERY[0], BLINK_EVERY[1]);
        if (sim.tick >= b.blinkAt && far && sim.physics.grabbed !== e.id) {
          b.blinkAt = sim.tick + sim.rng.int(BLINK_EVERY[0], BLINK_EVERY[1]);
          b.eyesUntil = sim.tick + BLINK_TICKS;
          sim.events.emit('bug_blinked', { id: e.id, defId: e.defId, x: s.x, y: s.y });
        }
      } else if (b.pending === 'aloof') {
        // Barty: roll him a marble or a ball and he is thrilled.
        if (sim.tick % 15 !== 0) continue;
        const ball = sim.entities.ofKind('item').find((it) => {
          if (it.defId === 'item_dung_ball' || sim.isSleeping(it.id) || sim.physics.grabbed === it.id)
            return false;
          const def = sim.content.items.get(it.defId);
          if (def.shape.type !== 'circle' || !(def.art === 'marble' || def.art === 'ball' || def.catchable))
            return false;
          const is = sim.physics.getState(it.id);
          return Math.abs(is.x - s.x) < BALL_REACH && Math.abs(is.y - s.y) < 1;
        });
        if (ball) this.join(e, s.x, s.y);
      } else if (b.pending === 'stuck' && sim.bugImpact(e.id) >= FLIP_BUMP && sim.physics.grabbed !== e.id) {
        // Moose: knocked over by anything, he rolls back onto his feet.
        this.join(e, s.x, s.y);
      }
    }
  }

  /** The player picked up a waiting bug. Twig's legs give him away. */
  grabbed(e: Entity): void {
    const s = this.sim.physics.getState(e.id);
    if (e.bug?.pending === 'disguised') this.join(e, s.x, s.y);
  }

  /** The player put a waiting bug down. Moose, set back on his feet, joins. */
  released(e: Entity): void {
    const s = this.sim.physics.getState(e.id);
    if (e.bug?.pending === 'stuck') this.join(e, s.x, s.y);
  }

  /** A poke on a waiting bug. Twig, caught with his eyes open, sighs and joins. */
  poked(e: Entity): boolean {
    const b = e.bug;
    if (!b?.pending) return false;
    const s = this.sim.physics.getState(e.id);
    if (b.pending === 'disguised' && b.eyesUntil !== undefined && this.sim.tick < b.eyesUntil)
      this.join(e, s.x, s.y);
    return true;
  }
}
