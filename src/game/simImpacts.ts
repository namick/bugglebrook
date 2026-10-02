// What the sim does with the contacts that began in a physics step: bonks, springs, catches, and
// breaking things.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { EntityId } from './core/entities';
import { BONK_SPEED, GRAVITY } from './constants';
import type { ItemDef } from './data/types';
import type { Impact } from './physics/physics';
import { springLaunched } from './systems/bugAi';
import { SHATTER_SPEED } from './systems/potions';
import type { Sim } from './sim';
import { THROWN_TICKS } from './simShared';
import { inAir } from './simSetupGuard';

export function handleImpacts(sim: Sim, impacts: Impact[]): void {
  const bonked = new Map<EntityId, number>();
  const launched = new Set<EntityId>();
  const breaks = new Map<EntityId, { other: EntityId | null; x: number; y: number }>();
  for (const impact of impacts) {
    // A contact the setup rule let a hopping bug drop through is no bump and no landing.
    if (impact.a !== null && impact.b !== null && droppedPast(sim, impact.a, impact.b, impact.ny)) continue;
    for (const [self, other, sign] of [
      [impact.a, impact.b, 1],
      [impact.b, impact.a, -1],
    ] as const) {
      if (self === null) continue;
      const entity = sim.entities.get(self);
      if (!entity) continue;
      if (entity.kind === 'bug')
        sim.bugImpacts.set(self, Math.max(sim.bugImpacts.get(self) ?? 0, impact.speed));
      // A bug flung into another bug: they like each other a touch less.
      const hit = other === null ? undefined : sim.entities.get(other);
      if (
        sign === 1 &&
        entity.bug &&
        hit?.bug &&
        impact.speed > 3 &&
        ((entity.bug.mode === 'st_airborne' && !entity.bug.selfLaunched) ||
          (hit.bug.mode === 'st_airborne' && !hit.bug.selfLaunched))
      )
        sim.nudgeAffinity(entity.defId, hit.defId, -0.02);
      if (entity.kind === 'item' && other !== null) sim.tryCatch(self, other);
      if (impact.speed >= BONK_SPEED) bonked.set(self, Math.max(bonked.get(self) ?? 0, impact.speed));
      const def = entity.kind === 'item' ? sim.content.items.get(entity.defId) : null;
      if (def?.launchSpeed && def.toy !== 'launcher' && other !== null && !launched.has(other))
        if (sim.trySpring(self, def, other, impact, sign)) launched.add(other);
      // A potion bottle breaks on a hard knock; so does anything fragile (rule R11).
      if (def && !breaks.has(self) && sim.physics.grabbed !== self) {
        const otherBug = hit?.kind === 'bug';
        const breaksHere =
          (sim.isPotion(entity) && impact.speed >= SHATTER_SPEED && !sim.cauldron.fresh(self)) ||
          (def.shatters !== undefined &&
            impact.speed >= def.shatters.speed &&
            !(otherBug && def.shatters.speed >= 10));
        if (breaksHere) breaks.set(self, { other, x: impact.px, y: impact.py });
      }
    }
  }
  for (const [id, speed] of [...bonked].sort((a, b) => a[0] - b[0])) {
    const entity = sim.entities.get(id);
    if (!entity) continue;
    const s = sim.physics.getState(id);
    sim.events.emit('bonked', { id, kind: entity.kind, defId: entity.defId, speed, x: s.x, y: s.y });
  }
  for (const [id, b] of [...breaks].sort((p, q) => p[0] - q[0])) {
    const e = sim.entities.get(id);
    if (!e) continue;
    if (sim.isPotion(e))
      sim.shatterPotion(e, b.other !== null && sim.entities.has(b.other) ? b.other : null, b.x, b.y);
    else {
      const sh = sim.content.items.get(e.defId).shatters;
      if (sh) sim.shatter(e, sh.into, sh.count);
    }
  }
}

/** A thrown food that hits a bug near its mouth gets eaten: a great shot. */
export function tryCatch(sim: Sim, itemId: EntityId, bugId: EntityId): void {
  const at = sim.thrown.get(itemId);
  if (at === undefined) return;
  if (sim.tick - at > THROWN_TICKS) {
    sim.thrown.delete(itemId);
    return;
  }
  const target = sim.dropTargetFor(itemId);
  if (target?.kind === 'mouth' && target.entityId === bugId) sim.feed(bugId, itemId, true);
  // A hat thrown onto a bug's head lands on it (section 2): a great shot.
  else if ((target?.kind === 'head' || target?.kind === 'crown') && target.entityId === bugId) {
    const item = sim.entities.get(itemId);
    if (item) {
      sim.thrown.delete(itemId);
      sim.wardrobe.dropped(bugId, item, true);
    }
  }
}

/**
 * A spring launches whatever lands on its top along its axis. `sign` is 1
 * if the spring is body A of the contact (so the normal points away from it).
 */
export function trySpring(
  sim: Sim,
  springId: EntityId,
  def: ItemDef,
  otherId: EntityId,
  impact: Impact,
  sign: number,
): boolean {
  if (impact.speed < 1 || sim.physics.grabbed === otherId || !sim.entities.has(otherId)) return false;
  if (def.shape.type !== 'box') return false;
  const s = sim.physics.getState(springId);
  const springEntity = sim.entities.get(springId)!;
  const k = sim.potions.scaleOf(springEntity);
  const up = { x: Math.sin(s.angle), y: -Math.cos(s.angle) };
  const along = (impact.px - s.x) * up.x + (impact.py - s.y) * up.y;
  const normalAlong = (impact.nx * up.x + impact.ny * up.y) * sign;
  if (along < (def.shape.height / 2) * k - 0.08 * k || normalAlong < 0.7) return false;
  const o = sim.physics.getState(otherId);
  const vUp = o.vx * up.x + o.vy * up.y;
  const tx = (o.vx - vUp * up.x) * 0.6;
  const ty = (o.vy - vUp * up.y) * 0.6;
  // A giant spring launches hard enough to throw even a giant bug off the top of the screen.
  const giantBug =
    !!sim.entities.get(otherId)?.effects && !!sim.potions.has(sim.entities.get(otherId)!, 'giant');
  const launch = (def.launchSpeed ?? 0) * (k > 1.2 ? (giantBug ? 2 : 1.4) : 1);
  if (k > 1.2 && giantBug) sim.findSecret('secret_giant_launch', s.x, s.y);
  // A sideways nudge so nothing lands back on the spring forever. Bugs
  // bouncing on purpose drift the way they face.
  const other = sim.entities.get(otherId);
  // The setup rule: a bug out on its own is never fired at the player's things by a spring on its side.
  if (other?.bug && !sim.byPlayer(other) && Math.abs(up.x) > 0.45) {
    const reach = Math.sign(up.x) * 6;
    if (sim.bugWorld().setupBetween(Math.min(o.x, o.x + reach), Math.max(o.x, o.x + reach))) return false;
  }
  const drift = other?.bug ? other.bug.facing * 1.4 : sim.rng.range(-1, 1);
  let vx = tx + up.x * launch - up.y * drift;
  const vy = ty + up.y * launch + up.x * drift;
  // The same for an upright spring: a bug out on its own never comes down on the player's things.
  if (other?.bug && !sim.byPlayer(other) && vy < 0) {
    const world = sim.bugWorld();
    const pad = sim.halfHeight(other) + 0.6;
    const lands = (v: number): boolean => {
      const to = o.x + v * ((-2 * vy) / GRAVITY);
      return world.setupBetween(Math.min(o.x, to) - pad, Math.max(o.x, to) + pad);
    };
    if (lands(vx)) vx = !lands(-Math.sign(vx) * 1.4) ? -Math.sign(vx) * 1.4 : 0;
  }
  sim.physics.setVelocity(otherId, vx, vy);
  sim.launchGrace.set(otherId, sim.tick + 4);
  sim.bugImpacts.delete(otherId);
  sim.events.emit('spring_bounced', { id: springId, targetId: otherId, x: s.x, y: s.y });
  if (other?.bug && springLaunched(other.bug, springId, sim.tick))
    sim.events.emit('bug_used', { id: otherId, defId: other.defId, targetId: springId, action: 'bounce' });
  return true;
}

/**
 * Did a bug in the air (a hop, a spring's throw) just drop past a player
 * setup? The pre-solve rule switched the contact off, but planck still
 * reports it as begun, and it must not count as landing on the setup (which
 * would stand the bug on it).
 */
function droppedPast(sim: Sim, a: EntityId, b: EntityId, ny: number): boolean {
  const ea = sim.entities.get(a);
  const bug = ea?.bug ? ea : sim.entities.get(b);
  if (!bug?.bug || !inAir(sim, bug)) return false;
  return sim.softContact(a, b, ny);
}
