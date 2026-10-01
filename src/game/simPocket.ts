// Putting things into the pocket and taking them out (game design doc, section 2). The slot logic
// itself is pure, in `systems/pocket.ts`.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { Entity, EntityId } from './core/entities';
import { shiftTags } from './systems/tags';
import { pocketBug, releaseBug, shiftBrain } from './systems/bugAi';
import type { Pocketable } from './systems/pocket';
import { fits, isPocketSlot, pocketPut, pocketTake } from './systems/pocket';
import type { Sim } from './sim';
import { BUG_RESTITUTION } from './simShared';

export function pocketable(sim: Sim, e: Entity): Pocketable {
  return {
    id: e.id,
    defId: e.defId,
    stackable: e.kind === 'item' && sim.content.items.get(e.defId).tags.includes('tag_stackable'),
  };
}

/** Could the thing in the hand go in this slot without a swap? */
export function pocketFits(sim: Sim, slot: number, id: EntityId): boolean {
  const e = sim.entities.get(id);
  if (!e || !isPocketSlot(slot)) return false;
  const contents = sim.pocket.slots[slot]!.map((i) => sim.pocketable(sim.entities.get(i)!));
  return fits(contents, sim.pocketable(e));
}

/**
 * Tuck the held thing into a pocket slot: it leaves the world. A slot that
 * cannot take it swaps, and what was there pops out where the thing was.
 */
export function putInPocket(sim: Sim, entity: Entity, slot: number): void {
  const id = entity.id;
  const s = sim.physics.getState(id);
  sim.physics.release();
  const contents = sim.pocket.slots[slot]!.map((i) => sim.pocketable(sim.entities.get(i)!));
  const out = pocketPut(sim.pocket, slot, sim.pocketable(entity), contents, sim.tick);
  sim.environment.unstickAll(id);
  sim.thrown.delete(id);
  if (entity.bug) {
    sim.putDown(id);
    if (sim.rolling.delete(id)) sim.physics.setRolling(id, false, BUG_RESTITUTION);
    pocketBug(entity.bug);
  }
  sim.physics.setVelocity(id, 0, 0);
  sim.physics.setActive(id, false);
  sim.pocketed.add(id);
  sim.worldCache = null;
  sim.linkedCache = null;
  sim.events.emit('pocketed', { id, kind: entity.kind, defId: entity.defId, slot, x: s.x, y: s.y });
  out.forEach(({ id: other, ticks }, i) => {
    const e = sim.entities.get(other);
    if (!e) return;
    const x = s.x + (i - (out.length - 1) / 2) * 0.35;
    const y = Math.min(s.y, sim.surfaceY(x) - sim.halfHeightOf(e) - 0.05) - 0.2;
    sim.leavePocket(e, x, y, ticks);
    sim.physics.setVelocity(other, sim.rng.range(-1.2, 1.2), -4.5);
    if (e.bug) releaseBug(e.bug, sim.content.bugs.get(e.defId), false, y);
    sim.events.emit('pocket_swapped', { id: other, defId: e.defId, slot, x, y });
  });
}

/** Pull the top thing out of a slot into the hand at (x, y), kept above the ground. */
export function takeFromPocket(sim: Sim, slot: number, x: number, y: number): void {
  if (sim.physics.grabbed !== null) return;
  const taken = pocketTake(sim.pocket, slot, sim.tick);
  const entity = taken ? sim.entities.get(taken.id) : undefined;
  if (!taken || !entity) return;
  const half = sim.halfHeightOf(entity);
  const px = Math.max(half + 0.1, Math.min(sim.worldWidth - half - 0.1, x));
  const py = Math.min(y, sim.surfaceY(px) - half - 0.04);
  sim.leavePocket(entity, px, py, taken.ticks);
  // Into the hand, as if just grabbed.
  if (entity.bug) entity.bug.mode = 'st_idle';
  sim.physics.grab(entity.id, px, py);
  sim.setup.touch(entity.id);
  sim.worldCache = null;
  sim.linkedCache = null;
  sim.events.emit('unpocketed', {
    id: entity.id,
    kind: entity.kind,
    defId: entity.defId,
    slot,
    x: px,
    y: py,
  });
  sim.events.emit('item_grabbed', { id: entity.id, kind: entity.kind, defId: entity.defId, x: px, y: py });
}

/** Back into the world at (x, y), with its timers moved on past the time it spent in the pocket. */
export function leavePocket(sim: Sim, entity: Entity, x: number, y: number, ticks: number): void {
  sim.pocketed.delete(entity.id);
  sim.physics.place(entity.id, x, y, 0);
  sim.physics.setActive(entity.id, true);
  if (entity.tags) shiftTags(entity.tags, ticks);
  sim.potions.shift(entity, ticks);
  if (entity.bug) {
    shiftBrain(entity.bug, ticks);
    entity.bug.lastX = x;
    entity.bug.touchedAt = sim.tick;
  }
}
