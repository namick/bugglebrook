// Potion bottles, drinking and breaking them, drop targets, and the potion effects that move bugs
// about.
// These are parts of `Sim`, split out of sim.ts to keep it readable: each
// takes the sim, and `Sim` keeps a one-line method that calls it.

import type { Entity, EntityId } from './core/entities';
import type { DropTarget } from './systems/dropTargets';
import type { Brew } from './systems/brewing';
import type { Sim } from './sim';

/** Is this a potion bottle? */
export function isPotion(sim: Sim, e: Entity): boolean {
  if (e.kind !== 'item') return false;
  return !!e.brew || !!sim.content.items.get(e.defId).potion || e.defId === 'item_potion_mix';
}

/** The brew in a bottle that never went through the cauldron: its potion, plain. */
export function brewOf(sim: Sim, potionId: string): Brew {
  const p = sim.content.potions.get(potionId);
  return {
    potion: p.id,
    effects: [p.effect],
    strength: 1,
    durationTicks: p.durationTicks,
    color: p.color,
    essences: [...p.recipe],
    ...(p.effect === 'paint' ? { paint: 'paint_red' } : {}),
  };
}

export function bottleBrew(sim: Sim, e: Entity): Brew {
  if (e.brew) return e.brew;
  const potion = sim.content.items.get(e.defId).potion;
  return sim.brewOf(potion ?? 'potion_water');
}

/** A bug drank a potion. */
export function drink(sim: Sim, bug: Entity, bottle: Entity): void {
  const s = sim.physics.getState(bug.id);
  const b = sim.bottleBrew(bottle);
  sim.remove(bottle.id);
  sim.events.emit('potion_drunk', { id: bug.id, defId: bug.defId, potion: b.potion, x: s.x, y: s.y });
  sim.potions.give(bug, b, 'drink');
}

/** A bottle hit something hard: it breaks and splashes what it hit (half the time). */
export function shatterPotion(
  sim: Sim,
  bottle: Entity,
  otherId: EntityId | null,
  x: number,
  y: number,
): void {
  const b = sim.bottleBrew(bottle);
  sim.remove(bottle.id);
  let target = otherId === null ? undefined : sim.entities.get(otherId);
  if (target && (sim.isSleeping(target.id) || target.bug?.pending)) target = undefined;
  // Smashed on the ground right next to a bug still splashes it.
  if (!target) target = sim.nearestBug(x, y, 0.7) ?? undefined;
  const applied = target ? sim.potions.give(target, b, 'splash') : false;
  if (target?.bug && applied && b.potion !== 'potion_sludge') sim.reactBug(target, 'wow');
  sim.events.emit('potion_shattered', {
    id: bottle.id,
    targetId: target?.id ?? null,
    potion: b.potion,
    color: b.color,
    applied,
    x,
    y,
  });
}

/** Rule R11: a fragile thing knocked hard breaks into pieces. */
export function shatter(sim: Sim, e: Entity, into: string, count: number): void {
  const s = sim.physics.getState(e.id);
  sim.remove(e.id);
  const pieces: EntityId[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const piece = sim.spawn('item', into, s.x + Math.cos(a) * 0.15, s.y - 0.05 + Math.sin(a) * 0.08);
    sim.physics.setVelocity(piece.id, s.vx * 0.3 + Math.cos(a) * 2, -2 - sim.rng.range(0, 1.5));
    pieces.push(piece.id);
  }
  sim.events.emit('shattered', { id: e.id, defId: e.defId, into, pieces, x: s.x, y: s.y });
}

/** Paint a bug from a paint drop let go on it (drop rule 5): the drop is used up. */
export function paintFromDrop(sim: Sim, bugId: EntityId, drop: Entity): void {
  const bug = sim.entities.get(bugId);
  const paint = sim.content.items.get(drop.defId).paint;
  // Rainbow paint (M10, the rainbow's end) gives a bug all five colors at once: a patchwork bug.
  if (bug && drop.defId === 'item_paint_rainbow') {
    const s = sim.physics.getState(bugId);
    sim.remove(drop.id);
    for (const c of ['paint_red', 'paint_blue', 'paint_yellow', 'paint_white', 'paint_black'])
      sim.places.paint(bug, c, s.x, s.y);
    return;
  }
  if (!bug || !paint) return;
  const s = sim.physics.getState(bugId);
  sim.remove(drop.id);
  sim.places.paint(bug, paint, s.x, s.y);
}

/** The drop target took it: in a mouth, a tray, the cauldron, or paint on a bug. */
export function dropInto(sim: Sim, target: DropTarget, entity: Entity): void {
  switch (target.kind) {
    case 'mouth':
      sim.feed(target.entityId, entity.id, true);
      return;
    case 'tray':
      sim.bench.place(entity.id, -1 - target.entityId);
      return;
    case 'cauldron':
      sim.cauldron.add(entity);
      return;
    case 'body':
      sim.paintFromDrop(target.entityId, entity);
      return;
  }
}

/** An upside-down bug on the porch boards: it hangs with the spider and they share a crumb. */
export function upsideDownAt(sim: Sim, bug: Entity, x: number, y: number): void {
  const spider = sim.places.fixtures('spider')[0];
  if (!spider || !sim.barriers.isOpen(spider.area.id)) return;
  if (Math.abs(x - spider.x) < 2 && y < 3.6) sim.findSecret('secret_upside_tea', x, y);
  void bug;
}

/** A ghost bug drifting through the lattice spooks Whiff, who spooks everyone. */
export function ghostAt(sim: Sim, bug: Entity, x: number, y: number): void {
  for (const e of sim.entities.ofKind('item')) {
    if (e.defId !== 'item_lattice_panel') continue;
    const s = sim.physics.getState(e.id);
    if (Math.abs(s.x - x) > 0.5 || Math.abs(s.y - y) > 3) continue;
    if (!sim.secrets.includes('secret_ghost_lattice')) {
      sim.findSecret('secret_ghost_lattice', x, y);
      for (const whiff of sim.entities.ofKind('bug'))
        if (sim.content.bugs.get(whiff.defId).habits.stinkCloud && !whiff.bug?.pending) sim.puff(whiff);
    }
  }
  void bug;
}

/** Ghosts pass through the lattice panel. */
export function ghostThrough(sim: Sim, a: EntityId, b: EntityId): boolean {
  const ea = sim.entities.get(a);
  const eb = sim.entities.get(b);
  if (!ea || !eb) return false;
  return (
    (ea.defId === 'item_lattice_panel' && sim.isGhost(b)) ||
    (eb.defId === 'item_lattice_panel' && sim.isGhost(a))
  );
}

export function isGhost(sim: Sim, id: EntityId): boolean {
  const e = sim.entities.get(id);
  return !!e?.effects && sim.potions.ghostly(e);
}
