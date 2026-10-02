// The setup rule's physical side (game design doc, section 5): which things count as the player's
// setups, and keeping bugs from shoving them.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { Entity, EntityId } from './core/entities';
import { SIM_HZ } from './core/loop';
import type { Sim } from './sim';
import { halfExtents } from './simShared';

/**
 * The setup rule's walk-force cap (game design doc, section 5): a bug
 * walking, turning, or standing against a player setup (or anything
 * leaning on one) never pushes into it. Any velocity into the contact is
 * taken away before physics runs. Flung and curled-up bugs are the
 * player's doing and keep theirs.
 */
export function capWalkForces(sim: Sim): void {
  const linked = sim.setupLinked();
  if (linked.size === 0) return;
  for (const bug of sim.entities.ofKind('bug')) {
    const b = bug.bug;
    if (!b || sim.isSleeping(bug.id) || sim.byPlayer(bug)) continue;
    const s = sim.physics.getState(bug.id);
    let vx = s.vx;
    let vy = s.vy;
    let changed = false;
    for (const c of sim.physics.contactsOf(bug.id)) {
      // The thing in the player's hand is the player's doing; the one in its mouth is its meal.
      if (!linked.has(c.other) || sim.physics.grabbed === c.other || b.mouthful === c.other) continue;
      if (c.ny > 0.5 && b.mode !== 'st_airborne' && b.mode !== 'st_use' && b.mode !== 'st_swim') {
        // Standing on the player's things: hop off, clear of them.
        const o = sim.physics.getState(c.other);
        const boxes = [...linked].map((id) => sim.boxOf(id));
        const free = (d: number): boolean =>
          !boxes.some((q) => s.x + d * 1.5 > q.x0 - 0.8 && s.x + d * 1.5 < q.x1 + 0.8);
        const pref = s.x >= o.x ? 1 : -1;
        if (!free(pref) && !free(-pref)) continue;
        const dir: 1 | -1 = free(pref) ? pref : (-pref as 1 | -1);
        b.facing = dir;
        b.mode = 'st_airborne';
        b.selfLaunched = true;
        b.resume = null;
        b.airPeak = 0;
        b.airTop = s.y;
        b.social = null;
        b.carrying = null;
        b.targetId = null;
        b.action = null;
        vx = dir * 2.6;
        vy = -5.5;
        changed = true;
        sim.events.emit('bug_hopped', { id: bug.id, defId: bug.defId, x: s.x, y: s.y });
        break;
      }
      const into = vx * c.nx + vy * c.ny;
      if (into <= 0) continue;
      // Standing on top of it: only its weight rests there, no shove.
      vx -= into * c.nx;
      vy -= into * c.ny;
      changed = true;
    }
    if (changed) sim.physics.setVelocity(bug.id, vx, vy);
  }
}

/** Is this bug in the air on its own (hopping, or on a machine)? */
export function inAir(_sim: Sim, bug: Entity): boolean {
  const mode = bug.bug?.mode;
  return mode === 'st_airborne' || mode === 'st_use';
}

/**
 * A walking bug brushing the side of a player setup (or anything leaning
 * on one) slips past it instead of shoving it: the walk-force cap. Standing
 * on top still works, and flung or curled-up bugs hit things for real.
 */
export function softContact(sim: Sim, a: EntityId, b: EntityId, ny: number): boolean {
  const ea = sim.entities.get(a);
  const eb = sim.entities.get(b);
  const bug = ea?.bug ? ea : eb?.bug ? eb : null;
  const item = ea?.kind === 'item' ? ea : eb?.kind === 'item' ? eb : null;
  if (!bug?.bug || !item) return false;
  if (sim.byPlayer(bug)) return false;
  if (sim.physics.grabbed === item.id) return false;
  if (!sim.setupLinked().has(item.id)) return false;
  // Once a bug is passing through a setup, it keeps passing until they part, even if it
  // lands on something else part way (a friend's head) and stops being in the air.
  const key = bug.id * 100003 + item.id;
  const passing = (sim.passing.get(key) ?? -9) >= sim.tick - 1;
  // A bug hopping about on its own drops past the player's things; one walking only slides past their sides.
  const air = inAir(sim, bug);
  if (!passing && !air && Math.abs(ny) > 0.95) return false;
  if (air || passing) sim.passing.set(key, sim.tick);
  return true;
}

/** Is this bug moving because the player just grabbed, flung, or poked it? Then it hits for real. */
export function byPlayer(sim: Sim, bug: Entity): boolean {
  const b = bug.bug;
  if (!b) return false;
  if (b.mode === 'st_held' || sim.physics.grabbed === bug.id) return true;
  const recent = b.touchedAt >= 0 && sim.tick - b.touchedAt < 5 * SIM_HZ;
  return recent && ((b.mode === 'st_airborne' && !b.selfLaunched) || b.mode === 'st_rolled');
}

/** Is this thing leaning on a player setup (so pushing it would push the setup)? */
export function touchesSetup(sim: Sim, id: EntityId): boolean {
  return sim.setupLinked().has(id);
}

/**
 * Player setups plus every item touching them, directly or through other
 * items: a bug pushing any of these would push the player's work. The thing
 * in the hand is not set up anywhere yet, so it links nothing: food carried
 * to a bug napping on the bottle cap does not make the cap the player's
 * (PM-03 of the post-merge playtest).
 */
export function setupLinked(sim: Sim): Set<EntityId> {
  if (sim.linkedCache?.tick === sim.tick) return sim.linkedCache.ids;
  const ids = new Set<EntityId>();
  const held = sim.physics.grabbed;
  for (const e of sim.entities.ofKind('item'))
    // Things out of the world (pocketed, in a mouth) are nobody's obstacle.
    if (sim.setup.has(e.id) && e.id !== held && !sim.pocketed.has(e.id) && sim.physics.isActive(e.id))
      ids.add(e.id);
  if (ids.size > 0) {
    const pairs = sim.physics
      .touchingPairs()
      .filter(
        ([a, b]) =>
          a !== held &&
          b !== held &&
          sim.entities.get(a)?.kind === 'item' &&
          sim.entities.get(b)?.kind === 'item',
      );
    let grew = true;
    while (grew) {
      grew = false;
      for (const [a, b] of pairs) {
        if (ids.has(a) !== ids.has(b)) {
          ids.add(a);
          ids.add(b);
          grew = true;
        }
      }
    }
    // Anything about to bump into them counts too: a buffer of a few centimeters.
    const boxes = [...ids].map((id) => sim.boxOf(id));
    for (const e of sim.entities.ofKind('item')) {
      if (ids.has(e.id) || e.id === held || sim.isSleeping(e.id) || !sim.physics.isActive(e.id)) continue;
      const b = sim.boxOf(e.id);
      if (
        boxes.some((o) => b.x0 < o.x1 + 0.3 && b.x1 > o.x0 - 0.3 && b.y0 < o.y1 + 0.15 && b.y1 > o.y0 - 0.15)
      )
        ids.add(e.id);
    }
  }
  sim.linkedCache = { tick: sim.tick, ids };
  return ids;
}

export function boxOf(sim: Sim, id: EntityId): { x0: number; x1: number; y0: number; y1: number } {
  const st = sim.physics.getState(id);
  const ext = halfExtents(sim.content.items.get(sim.entities.get(id)!.defId).shape, st.angle);
  return { x0: st.x - ext.w, x1: st.x + ext.w, y0: st.y - ext.h, y1: st.y + ext.h };
}

/** Is part of a player setup (other than `except`) within `reach` of x? */
export function setupNearExcept(sim: Sim, x: number, reach: number, except: EntityId): boolean {
  for (const it of sim.bugWorld().setups)
    if (it.id !== except && it.x1 > x - reach && it.x0 < x + reach) return true;
  return false;
}
