import type { Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { RngState } from '../core/rng';
import { Rng } from '../core/rng';
import type { BugDef, ItemDef, WearPerk, WearSlot } from '../data/types';
import { WEAR_SLOTS } from '../data/types';
import { HEAD_TURNS } from '../data/items11';
import type { Liking, ReactionType } from '../events';
import type { Sim } from '../sim';
import { likingOf } from './bugAi';
import { enter, react } from './bugMove';
import type { DropCandidate } from './dropTargets';

/**
 * Hats and accessories (M11, game design doc, sections 2, 4, and 7.3). A
 * wearable let go on a bug's head goes on it; one already in that slot pops
 * off in a little arc. A worn thing is out of the physics (its body is off)
 * and rides on its bug: `entity.wearing` on the bug says what is where, and
 * the body is put on its anchor every step so it is where the bug is when
 * it comes off again.
 *
 * Bugs have opinions. A loved hat gets hearts, a hated one comes straight
 * off again, and everything else gets the bug's own way of wearing a hat
 * (`hatted`). Bugs nearby look, Prim judges, two bugs chatting may swap
 * hats they like better on each other, a fashionable bug (or one that loves
 * a hat) puts on one it finds lying about, and Boing hops his off and
 * catches it. Things come off when the hand pulls them off, when a held bug
 * is shaken, and when an eggshell breaks; never in a fling.
 *
 * Most of section 7.3's extra effects (`perks`) work through the body
 * (`Potions.params`), what the AI sees (`sim.bugDef`), tags, and the hooks
 * below; a few are only looks and sounds.
 */

/** A plan a bug has with something it wears, and when. Plain JSON. */
export interface WearPlan {
  item: EntityId;
  at: number;
  /** Take it off (it hates it), flip it and catch it (Boing), or judge it (Prim, `item` is the wearer). */
  act: 'doff' | 'flip' | 'judge';
}

/** Plain JSON, saved as `world.wardrobe`. */
export interface WardrobeState {
  /** Plans by bug ID. */
  plans: Record<string, WearPlan>;
  /** Pollen loads each bee has brought to a thimble since its last honey drop, by bug ID. */
  pollen: Record<string, number>;
  /** Tick the fashion parade last ran, or -1. */
  parade: number;
  /**
   * A hat the plaza's earthworm wore down into its hole (`secret_worm_hat`):
   * when, and once it has come up again elsewhere, where and until when.
   */
  worm?: { item: EntityId; at: number; out: { x: number; until: number } | null };
  rng: RngState;
}

export function newWardrobeState(seed: string): WardrobeState {
  return { plans: {}, pollen: {}, parade: -1, rng: new Rng(`${seed}-wardrobe`).getState() };
}

/** How near (m) a wearable must be let go of a bug's head or body to go on. */
export const WEAR_REACH = 0.6;
/** How near (m) goo or an eggshell must be let go above a head to become a hat. */
export const CROWN_REACH = 0.25;
/** A wearable let go this far (m) beyond a bug's body edge still goes on its head (P-24). */
export const BODY_REACH = 0.45;
/** A hated thing comes off this long after it goes on (ticks). */
export const DOFF_AFTER = Math.round(1.3 * SIM_HZ);
/** Boing flips his hat off and catches it this long after it goes on. */
export const FLIP_AFTER = 2 * SIM_HZ;
/** Prim judges a hat put on this close to her (m), this long after. */
export const JUDGE_RANGE = 8;
export const JUDGE_AFTER = Math.round(0.8 * SIM_HZ);
/** Bugs this close (m) to a newly hatted bug may look round at it. */
export const LOOK_RANGE = 4;
/** A bug dresses itself from loose things this close to its head (m), at most this often. */
export const DRESS_REACH = 0.8;
export const DRESS_EVERY = 45 * SIM_HZ;
/** An eggshell hat breaks on a landing this hard (m/s). */
export const FRAGILE_SPEED = 7;
/** A hat pulled off and let go this fast after (a click on it) goes back on: the click pokes its bug. */
export const CLICK_TICKS = 15;
/** The plaza's earthworm (section 3): where its hole is (plaza x), and how it peeks out. */
export const WORM_X = 31.5;
export const WORM_SHOW = 5 * SIM_HZ;
export const WORM_PERIOD = 26 * SIM_HZ;
export const WORM_PERIOD_RAIN = 12 * SIM_HZ;
/** The worm comes up somewhere else this long after it takes a hat down, and leaves the hat there after this. */
export const WORM_AWAY = 2 * 60 * SIM_HZ;
export const WORM_SHOWS_OFF = 8 * SIM_HZ;
/** Where it comes up again: the pond's left bank (pond x). */
export const WORM_OUT_X = 1.4;
/** It ducks from an empty hand this close (m). */
export const WORM_SHY = 1.3;

/**
 * How far the worm is up out of its hole at `tick`, 0 to 1: it peeks out
 * for five seconds now and then (more often in the rain), easing up and down.
 */
export function wormRise(tick: number, raining: boolean): number {
  const period = raining ? WORM_PERIOD_RAIN : WORM_PERIOD;
  const local = tick % period;
  if (local >= WORM_SHOW) return 0;
  const ease = 0.9 * SIM_HZ;
  return Math.max(0, Math.min(1, local / ease, (WORM_SHOW - local) / ease));
}

/** How often the slow checks run (perks, dressing, swaps, the parade). */
const SLOW = 30;

/** Opinions as a rank, for swaps. */
const RANK: Readonly<Record<Liking, number>> = { loved: 3, liked: 2, neutral: 1, disliked: 0 };

export class Wardrobe {
  state: WardrobeState;
  private rng: Rng;
  /** Worn item ID to its bug and slot. Rebuilt from the bugs' `wearing`. */
  private readonly worn = new Map<EntityId, { bug: EntityId; slot: WearSlot }>();
  /** The last thing the hand pulled off a bug, so a click (press and let go) puts it back. */
  private lastPull: { item: EntityId; bug: EntityId; tick: number } | null = null;

  constructor(private readonly sim: Sim) {
    this.state = newWardrobeState(sim.seed);
    this.rng = Rng.fromState(this.state.rng);
  }

  restore(state: WardrobeState): void {
    this.state = state;
    this.rng = Rng.fromState(state.rng);
  }

  serialize(): WardrobeState {
    this.state.rng = this.rng.getState();
    return JSON.parse(JSON.stringify(this.state)) as WardrobeState;
  }

  /**
   * After a load: worn things go back on their bugs with their bodies off.
   * Anything that has gone, or that two bugs claim, comes off the list.
   */
  rebuild(): void {
    const sim = this.sim;
    this.worn.clear();
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.wearing) continue;
      for (const slot of WEAR_SLOTS) {
        const id = bug.wearing[slot];
        if (id === undefined) continue;
        const item = sim.entities.get(id);
        const def = item?.kind === 'item' ? sim.content.items.get(item.defId) : null;
        if (!item || def?.wear !== slot || this.worn.has(id) || sim.isPocketed(id)) {
          delete bug.wearing[slot];
          continue;
        }
        this.worn.set(id, { bug: bug.id, slot });
        sim.physics.setActive(id, false);
      }
      if (Object.keys(bug.wearing).length === 0) delete bug.wearing;
    }
    // A hat down the worm's hole stays out of the world.
    const w = this.state.worm;
    if (w && sim.entities.has(w.item) && !this.worn.has(w.item)) sim.physics.setActive(w.item, false);
    else delete this.state.worm;
  }

  /** Is this thing on a bug (or on the worm)? */
  isWorn(id: EntityId): boolean {
    return this.worn.has(id) || this.state.worm?.item === id;
  }

  /** Who wears this thing, and in which slot (the worm is bug -1). */
  wornBy(id: EntityId): { bug: EntityId; slot: WearSlot } | null {
    if (this.state.worm?.item === id) return { bug: -1, slot: 'head' };
    return this.worn.get(id) ?? null;
  }

  // --- The worm (secret_worm_hat) --------------------------------------------

  /** Where the worm's hole is, in the world (m). */
  wormHole(): { x: number; y: number } | null {
    const sim = this.sim;
    if (!sim.content.areas.has('area_stump_plaza')) return null;
    const x = sim.content.areas.get('area_stump_plaza').xStart + WORM_X;
    return { x, y: sim.surfaceY(x) };
  }

  /** How far up the worm is right now, 0 to 1: its own rhythm, and it ducks from an empty hand. */
  wormUp(): number {
    const sim = this.sim;
    const hole = this.wormHole();
    if (!hole || this.state.worm) return 0;
    const hand = sim.hand;
    if (hand && sim.physics.grabbed === null && Math.hypot(hand.x - hole.x, hand.y - hole.y) < WORM_SHY)
      return 0;
    return wormRise(sim.tick, sim.weather.raining);
  }

  /** A hat let go on the peeking worm: it wears it down its hole. */
  toWorm(item: Entity): void {
    const sim = this.sim;
    const hole = this.wormHole();
    if (!hole || this.state.worm || this.worn.has(item.id)) return;
    if (sim.physics.grabbed === item.id) sim.physics.release();
    sim.environment.unstickAll(item.id);
    sim.thrown.delete(item.id);
    sim.physics.setVelocity(item.id, 0, 0);
    sim.physics.setActive(item.id, false);
    sim.physics.place(item.id, hole.x, hole.y + 0.3, 0);
    this.state.worm = { item: item.id, at: sim.tick, out: null };
    sim.linkedCache = null;
    sim.worldCache = null;
    sim.findSecret('secret_worm_hat', hole.x, hole.y);
    sim.events.emit('worm_hatted', { itemId: item.id, defId: item.defId, x: hole.x, y: hole.y });
  }

  /** Two minutes on, the worm comes up on the pond's bank still wearing it, then leaves it there. */
  private wormAway(): void {
    const sim = this.sim;
    const w = this.state.worm;
    if (!w) return;
    const item = sim.entities.get(w.item);
    if (!item) {
      delete this.state.worm;
      return;
    }
    if (!w.out) {
      if (sim.tick - w.at < WORM_AWAY) return;
      const x = sim.content.areas.get('area_puddle_pond').xStart + WORM_OUT_X;
      w.out = { x, until: sim.tick + WORM_SHOWS_OFF };
      sim.physics.place(w.item, x, sim.surfaceY(x) - 0.4, 0);
      sim.events.emit('worm_resurfaced', { itemId: w.item, defId: item.defId, x, y: sim.surfaceY(x) });
      return;
    }
    if (sim.tick < w.out.until) return;
    // Back down it goes, and the hat stays on the bank.
    const x = w.out.x + 0.5;
    const half = sim.halfHeight(item);
    delete this.state.worm;
    sim.physics.place(w.item, x, sim.surfaceY(x) - half - 0.3, 0);
    sim.physics.setActive(w.item, true);
    sim.physics.setVelocity(w.item, 0.6, -2);
    sim.linkedCache = null;
    sim.worldCache = null;
    sim.events.emit('worm_left_hat', { itemId: w.item, defId: item.defId, x, y: sim.surfaceY(x) });
  }

  /** Everything a bug wears, by slot order. */
  wornOn(bug: Entity): { slot: WearSlot; id: EntityId; def: ItemDef }[] {
    const out: { slot: WearSlot; id: EntityId; def: ItemDef }[] = [];
    if (!bug.wearing) return out;
    for (const slot of WEAR_SLOTS) {
      const id = bug.wearing[slot];
      const item = id === undefined ? undefined : this.sim.entities.get(id);
      if (item) out.push({ slot, id: item.id, def: this.sim.content.items.get(item.defId) });
    }
    return out;
  }

  /** Does the bug wear something with this extra effect? */
  has(bug: Entity, perk: WearPerk): boolean {
    if (!bug.wearing) return false;
    return this.wornOn(bug).some((w) => w.def.perks?.includes(perk));
  }

  /** A short key for what a bug wears that changes its body or its def (for caches). */
  perkKey(bug: Entity): string {
    if (!bug.wearing) return '';
    return this.wornOn(bug)
      .flatMap((w) => w.def.perks ?? [])
      .sort()
      .join(',');
  }

  // --- Anchors -------------------------------------------------------------

  /** Where a slot's anchor is on a bug in the world right now (m). */
  anchor(bug: Entity, slot: WearSlot): { x: number; y: number } {
    const sim = this.sim;
    const def = sim.content.bugs.get(bug.defId);
    const s = sim.physics.getState(bug.id);
    const k = sim.potions.scaleOf(bug);
    const f = bug.bug?.facing ?? 1;
    const w = def.wear;
    switch (slot) {
      case 'head':
        return { x: s.x + w.head[0] * f * k, y: s.y + (w.head[1] - w.headR) * k };
      case 'face':
        return { x: s.x + (w.head[0] + w.headR * 0.35) * f * k, y: s.y + w.head[1] * k };
      case 'back':
        return { x: s.x + w.back[0] * f * k, y: s.y + w.back[1] * k };
      case 'feet':
        return { x: s.x, y: s.y + sim.halfHeight(bug) };
    }
  }

  /** The middle of a bug's head in the world (m). */
  headCenter(bug: Entity): { x: number; y: number } {
    const sim = this.sim;
    const def = sim.content.bugs.get(bug.defId);
    const s = sim.physics.getState(bug.id);
    const k = sim.potions.scaleOf(bug);
    const f = bug.bug?.facing ?? 1;
    return { x: s.x + def.wear.head[0] * f * k, y: s.y + def.wear.head[1] * k };
  }

  /** Just above a bug's head, where goo or an eggshell let go becomes a hat. */
  crown(bug: Entity): { x: number; y: number } {
    const top = this.anchor(bug, 'head');
    return { x: top.x, y: top.y - 0.12 * this.sim.potions.scaleOf(bug) };
  }

  /** Can this bug have things put on it right now? */
  dressable(bug: Entity): boolean {
    const b = bug.bug;
    const sim = this.sim;
    return !!b && !b.pending && !sim.isSleeping(bug.id) && sim.physics.has(bug.id);
  }

  /** Drop targets: each bug's head and body for wearables, and just above its head for goo. */
  candidates(exclude: EntityId): DropCandidate[] {
    const sim = this.sim;
    const out: DropCandidate[] = [];
    for (const bug of sim.entities.ofKind('bug')) {
      if (bug.id === exclude || sim.physics.grabbed === bug.id || !this.dressable(bug)) continue;
      const head = this.headCenter(bug);
      const s = sim.physics.getState(bug.id);
      const top = this.anchor(bug, 'head');
      out.push({ kind: 'head', entityId: bug.id, x: head.x, y: head.y });
      out.push({ kind: 'head', entityId: bug.id, x: top.x, y: top.y });
      // Anywhere over the body counts too (P-24): a hat let go over Glorp's shell goes on his head.
      const body = sim.bugDef(bug).radius * sim.potions.scaleOf(bug) + BODY_REACH;
      out.push({ kind: 'head', entityId: bug.id, x: s.x, y: s.y, radius: body });
      const c = this.crown(bug);
      out.push({ kind: 'crown', entityId: bug.id, x: c.x, y: c.y });
    }
    // The worm, while it peeks out of its hole.
    const hole = this.wormHole();
    if (hole && this.wormUp() > 0.5 && sim.barriers.isOpen('area_stump_plaza'))
      out.push({ kind: 'worm', entityId: 0, x: hole.x, y: hole.y - 0.3 });
    return out;
  }

  // --- On and off ----------------------------------------------------------

  /**
   * Put `item` on `bug`. What it had in that slot pops off. Returns whether
   * it went on.
   */
  putOn(bug: Entity, item: Entity, by: 'player' | 'bug' | 'swap', thrown = false, quiet = false): boolean {
    const sim = this.sim;
    const def = item.kind === 'item' ? sim.content.items.get(item.defId) : null;
    const slot = def?.wear;
    if (!def || !slot || !bug.bug || this.worn.has(item.id) || sim.isPocketed(item.id)) return false;
    if (item.pinned) return false;
    if (sim.physics.grabbed === item.id) sim.physics.release();
    let took: EntityId | null = null;
    const old = bug.wearing?.[slot];
    if (old !== undefined && old !== item.id) {
      took = old;
      const f = bug.bug.facing;
      this.takeOff(old, by === 'swap' ? 'swapped' : 'popped', { vx: -f * 1.3, vy: -3.6 });
    }
    sim.environment.unstickAll(item.id);
    sim.thrown.delete(item.id);
    sim.physics.setVelocity(item.id, 0, 0);
    sim.physics.setActive(item.id, false);
    bug.wearing ??= {};
    bug.wearing[slot] = item.id;
    this.worn.set(item.id, { bug: bug.id, slot });
    const at = this.anchor(bug, slot);
    sim.physics.place(item.id, at.x, at.y, 0);
    this.changed(bug);
    const bdef = sim.content.bugs.get(bug.defId);
    const liking = this.liking(bdef, item.defId);
    sim.events.emit('wearable_worn', {
      id: item.id,
      defId: item.defId,
      bugId: bug.id,
      bugDefId: bug.defId,
      slot,
      by,
      thrown,
      liking,
      took,
      x: at.x,
      y: at.y,
    });
    if (!quiet) this.opinion(bug, item, liking, by);
    return true;
  }

  /**
   * Take a worn thing off: its body comes back on at the anchor, moving at
   * `v` (still if not given).
   */
  takeOff(
    id: EntityId,
    how: 'popped' | 'grabbed' | 'shaken' | 'disliked' | 'broke' | 'dropped' | 'swapped',
    v: { vx: number; vy: number } = { vx: 0, vy: 0 },
  ): void {
    const sim = this.sim;
    const on = this.worn.get(id);
    if (!on) return;
    this.worn.delete(id);
    const bug = sim.entities.get(on.bug);
    const item = sim.entities.get(id);
    if (bug?.wearing) {
      delete bug.wearing[on.slot];
      if (Object.keys(bug.wearing).length === 0) delete bug.wearing;
    }
    if (!item) return;
    const at = bug && sim.physics.has(bug.id) ? this.anchor(bug, on.slot) : sim.physics.position(id);
    const half = sim.halfHeight(item);
    const y = Math.min(at.y, sim.surfaceY(at.x) - half - 0.02);
    sim.physics.place(id, at.x, y, 0);
    sim.physics.setActive(id, true);
    sim.physics.setVelocity(id, v.vx, v.vy);
    sim.linkedCache = null;
    sim.worldCache = null;
    if (bug) this.changed(bug);
    sim.events.emit('wearable_removed', {
      id,
      defId: item.defId,
      bugId: on.bug,
      bugDefId: bug?.defId ?? '',
      slot: on.slot,
      how,
      x: at.x,
      y,
    });
  }

  /** Everything off a bug (it is leaving the world, or it was shaken). */
  takeAllOff(bug: Entity, how: 'shaken' | 'dropped'): void {
    const f = bug.bug?.facing ?? 1;
    this.wornOn(bug).forEach((w, i) =>
      this.takeOff(
        w.id,
        how,
        how === 'shaken' ? { vx: (i % 2 ? 1 : -1) * f * 1.6, vy: -3.2 - i * 0.4 } : undefined,
      ),
    );
  }

  /** A thing is leaving the world for good: if it was worn, or wore things, tidy up. */
  forget(id: EntityId): void {
    const on = this.worn.get(id);
    if (on) {
      this.worn.delete(id);
      const bug = this.sim.entities.get(on.bug);
      if (bug?.wearing) {
        delete bug.wearing[on.slot];
        if (Object.keys(bug.wearing).length === 0) delete bug.wearing;
        this.changed(bug);
      }
    }
    delete this.state.plans[String(id)];
    delete this.state.pollen[String(id)];
    if (this.state.worm?.item === id) delete this.state.worm;
  }

  /** Something it wears changed the bug's body or what its AI sees. */
  private changed(bug: Entity): void {
    const sim = this.sim;
    sim.potions.sync(bug);
    sim.refreshFriction(bug);
    sim.worldCache = null;
  }

  /** Every step: worn things ride on their bugs (their bodies, off, go where the anchors are). */
  place(): void {
    const sim = this.sim;
    for (const [id, on] of this.worn) {
      const bug = sim.entities.get(on.bug);
      if (!bug || sim.isPocketed(bug.id)) continue;
      const at = this.anchor(bug, on.slot);
      sim.physics.place(id, at.x, at.y, 0);
    }
  }

  // --- The hand ------------------------------------------------------------

  /** The worn thing under the hand at (x, y), if any: a hat is picked before the bug under it. */
  wornAt(x: number, y: number): EntityId | null {
    const sim = this.sim;
    let best: EntityId | null = null;
    let bestD = Infinity;
    for (const [id, on] of this.worn) {
      const bug = sim.entities.get(on.bug);
      if (!bug || sim.isSleeping(bug.id) || sim.physics.grabbed === bug.id) continue;
      const item = sim.content.items.get(sim.entities.get(id)!.defId);
      const def = sim.content.bugs.get(bug.defId);
      const at = this.anchor(bug, on.slot);
      const k = sim.potions.scaleOf(bug);
      // A hat is about as big as the head it is on.
      const reach = Math.max(0.18, def.wear.headR * 1.1 * k);
      // Hats sit above the anchor, other things on it.
      const cy = on.slot === 'head' ? at.y - halfH(item) * 0.6 : at.y;
      const d = Math.hypot(x - at.x, y - cy);
      if (d <= reach && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  /** The hand pulled a worn thing off: it comes off into the hand. */
  pulled(id: EntityId): void {
    const on = this.worn.get(id);
    if (!on) return;
    this.lastPull = { item: id, bug: on.bug, tick: this.sim.tick };
    this.takeOff(id, 'grabbed');
  }

  /**
   * A click on a worn thing (pressed, so it came off, and let go at once):
   * it goes back on, and the click is a poke on its bug. Returns the bug.
   */
  clicked(id: EntityId): Entity | null {
    const pull = this.lastPull;
    if (!pull || pull.item !== id || this.sim.tick - pull.tick > CLICK_TICKS) return null;
    this.lastPull = null;
    const bug = this.sim.entities.get(pull.bug);
    const item = this.sim.entities.get(id);
    if (!bug || !item || !this.dressable(bug)) return null;
    this.putOn(bug, item, 'player', false, true);
    return bug;
  }

  /** A held bug was shaken: everything it wears flies off. */
  shaken(bug: Entity): void {
    if (bug.wearing) this.takeAllOff(bug, 'shaken');
  }

  /** A bug landed at `speed`: an eggshell hat breaks on a hard one. */
  landed(bug: Entity, speed: number): void {
    if (!bug.wearing || speed < FRAGILE_SPEED) return;
    const sim = this.sim;
    for (const w of this.wornOn(bug)) {
      if (!w.def.perks?.includes('fragile')) continue;
      this.takeOff(w.id, 'broke', { vx: 0, vy: -1 });
      const item = sim.entities.get(w.id);
      const s = w.def.shatters;
      if (item && s) sim.shatter(item, s.into, s.count);
    }
  }

  /** A poke on a bug: the party cone toots. */
  poked(bug: Entity): void {
    if (!this.has(bug, 'horn')) return;
    const s = this.sim.physics.getState(bug.id);
    this.sim.events.emit('hat_tooted', { id: bug.id, x: s.x, y: s.y });
  }

  /** A bug sniffed something new: in the monocle, it sees one of its tags, like the bug scope. */
  inspected(bug: Entity, itemId: EntityId): void {
    if (!this.has(bug, 'peer')) return;
    const sim = this.sim;
    const tags = sim.tagsOf(itemId).filter((t) => t !== 'tag_player_setup');
    const tag = tags.length > 0 ? tags[this.rng.int(0, tags.length - 1)]! : null;
    const s = sim.physics.getState(bug.id);
    sim.events.emit('monocle_peered', { id: bug.id, itemId, tag, x: s.x, y: s.y });
  }

  // --- Drops ---------------------------------------------------------------

  /** Something let go on a bug's head: a wearable goes on, goo and eggshells become hats. */
  dropped(bugId: EntityId, item: Entity, thrown = false): void {
    const sim = this.sim;
    const bug = sim.entities.get(bugId);
    if (!bug || !this.dressable(bug)) return;
    const turn = HEAD_TURNS[item.defId];
    if (turn && sim.content.items.has(turn)) {
      const s = sim.physics.getState(item.id);
      sim.remove(item.id);
      const hat = sim.spawn('item', turn, s.x, s.y);
      sim.events.emit('item_transformed', {
        id: item.id,
        newId: hat.id,
        from: item.defId,
        to: turn,
        x: s.x,
        y: s.y,
      });
      if (turn === 'item_hat_goo') sim.findSecret('secret_compost_goo_hat', s.x, s.y);
      this.putOn(bug, hat, 'player', thrown);
      return;
    }
    this.putOn(bug, item, 'player', thrown);
  }

  // --- Opinions ------------------------------------------------------------

  /** How a bug feels about wearing something: its tastes, and a fashion lover likes them all. */
  liking(def: BugDef, itemDefId: string): Liking {
    const l = likingOf(def, itemDefId);
    if (l === 'neutral' && def.habits.fashion) return 'liked';
    return l;
  }

  /** What a bug does when something goes on it, and who else notices. */
  private opinion(bug: Entity, item: Entity, liking: Liking, by: 'player' | 'bug' | 'swap'): void {
    const sim = this.sim;
    const b = bug.bug!;
    const def = sim.content.bugs.get(bug.defId);
    const type: ReactionType =
      liking === 'loved' ? 'hat_love' : liking === 'disliked' ? 'hat_yuck' : 'hatted';
    this.say(bug, type);
    const plans = this.state.plans;
    if (liking === 'disliked')
      plans[String(bug.id)] = { item: item.id, at: sim.tick + DOFF_AFTER, act: 'doff' };
    else if (def.habits.hops && by === 'player' && sim.content.items.get(item.defId).wear === 'head')
      plans[String(bug.id)] = { item: item.id, at: sim.tick + FLIP_AFTER, act: 'flip' };
    if (by === 'swap') return;
    // Bugs nearby look round; Prim comes to judge.
    const s = sim.physics.getState(bug.id);
    let looker: { e: Entity; d: number } | null = null;
    for (const other of sim.entities.ofKind('bug')) {
      if (other.id === bug.id || !this.awake(other)) continue;
      const o = sim.physics.getState(other.id);
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      const odef = sim.content.bugs.get(other.defId);
      if (odef.habits.fashion && d <= JUDGE_RANGE && !plans[String(other.id)]) {
        plans[String(other.id)] = { item: bug.id, at: sim.tick + JUDGE_AFTER, act: 'judge' };
        continue;
      }
      if (d <= LOOK_RANGE && (!looker || d < looker.d)) looker = { e: other, d };
    }
    if (looker && this.rng.chance(0.75)) {
      const o = looker.e;
      const os = sim.physics.getState(o.id);
      o.bug!.facing = s.x >= os.x ? 1 : -1;
      this.say(o, 'hat_look');
    }
    void b;
  }

  /** Up and about: not asleep, held, pending, flying, or out of the world. */
  private awake(bug: Entity): boolean {
    const b = bug.bug;
    if (!b || b.pending || this.sim.isSleeping(bug.id) || this.sim.physics.grabbed === bug.id) return false;
    return !['st_sleep', 'st_held', 'st_airborne', 'st_swim', 'st_pocketed', 'st_eat'].includes(b.mode);
  }

  /** A reaction, shown with a moment's pause if the bug is standing about. */
  private say(bug: Entity, type: ReactionType): void {
    const sim = this.sim;
    const b = bug.bug!;
    if (['st_idle', 'st_wander', 'st_react', 'st_landing', 'st_recover'].includes(b.mode)) {
      enter(b, 'st_react', Math.round(1.3 * SIM_HZ));
      b.decideIn = Math.max(b.decideIn, Math.round(1.3 * SIM_HZ));
    }
    sim.emitNotice(bug, react(b, type, this.rng, sim.tick), sim.physics.getState(bug.id));
  }

  // --- Every step --------------------------------------------------------------

  update(): void {
    const sim = this.sim;
    this.runPlans();
    this.wormAway();
    if (sim.tick % SLOW !== 0) return;
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || sim.isSleeping(bug.id)) continue;
      if (bug.wearing) this.perks(bug);
      this.dress(bug);
    }
    this.swaps();
    this.parade();
  }

  private runPlans(): void {
    const sim = this.sim;
    for (const [key, plan] of Object.entries(this.state.plans)) {
      if (plan.at > sim.tick) continue;
      delete this.state.plans[key];
      const bug = sim.entities.get(Number(key));
      if (!bug?.bug || sim.isSleeping(bug.id)) continue;
      const s = sim.physics.getState(bug.id);
      if (plan.act === 'doff') {
        const on = this.worn.get(plan.item);
        if (!on || on.bug !== bug.id) continue;
        const f = bug.bug.facing;
        this.takeOff(plan.item, 'disliked', { vx: f * 1.8, vy: -3.4 });
        this.say(bug, 'huh');
      } else if (plan.act === 'flip') {
        const on = this.worn.get(plan.item);
        if (!on || on.bug !== bug.id || !sim.physics.isSupported(bug.id) || !this.awake(bug)) continue;
        // A little hop: the hat goes up and comes down on his head again.
        sim.physics.setVelocity(bug.id, s.vx, -3.2);
        bug.bug.selfLaunched = true;
        sim.events.emit('hat_flipped', { id: bug.id, itemId: plan.item, x: s.x, y: s.y });
      } else {
        // Prim judges: is the wearer still wearing something she can see?
        const wearer = sim.entities.get(plan.item);
        if (!wearer?.wearing || !this.awake(bug)) continue;
        const w = this.wornOn(wearer)[0];
        if (!w) continue;
        const ws = sim.physics.getState(wearer.id);
        bug.bug.facing = ws.x >= s.x ? 1 : -1;
        const judge = sim.content.bugs.get(bug.defId);
        // Disliked things, or things on a bug who hates them, get the eyebrow.
        const approve =
          likingOf(judge, w.def.id) !== 'disliked' &&
          likingOf(sim.content.bugs.get(wearer.defId), w.def.id) !== 'disliked';
        this.say(bug, 'fashion');
        bug.bug.reaction = {
          type: 'fashion',
          variant: approve ? (this.rng.chance(0.5) ? 0 : 1) : 2,
          tick: sim.tick,
        };
        sim.events.emit('hat_judged', {
          judge: bug.id,
          wearer: wearer.id,
          itemDefId: w.def.id,
          approve,
          x: ws.x,
          y: ws.y,
        });
        if (approve) sim.nudgeAffinity(bug.defId, wearer.defId, 0.03);
      }
    }
  }

  /** The extra effects that work over time: smelly goo, the viking's headbutt, the chef's chop. */
  private perks(bug: Entity): void {
    const sim = this.sim;
    if (this.has(bug, 'smelly')) sim.addTag(bug.id, 'tag_smelly', 'hat', 2);
    const b = bug.bug!;
    const s = sim.physics.getState(bug.id);
    if (this.has(bug, 'headbutt') && Math.abs(s.vx) > 0.3 && sim.physics.isSupported(bug.id))
      this.headbutt(bug, s);
    if (this.has(bug, 'chef') && sim.content.bugs.get(bug.defId).habits.chops && this.awake(bug))
      this.chop(bug, s);
    void b;
  }

  /** A light nudge for a loose thing right in front of a viking (never the player's setups). */
  private headbutt(bug: Entity, s: { x: number; y: number; vx: number }): void {
    const sim = this.sim;
    const dir = Math.sign(s.vx);
    const def = sim.bugDef(bug);
    const linked = sim.setupLinked();
    for (const e of sim.entities.ofKind('item')) {
      if (!this.loose(e) || linked.has(e.id)) continue;
      const o = sim.physics.getState(e.id);
      const ahead = (o.x - s.x) * dir;
      if (ahead < 0 || ahead > def.radius + 0.4 || Math.abs(o.y - s.y) > def.radius + 0.2) continue;
      if (sim.physics.mass(e.id) > 1.5) continue;
      sim.physics.setVelocity(e.id, dir * 2.2, -1.6);
      sim.events.emit('headbutted', { id: bug.id, itemId: e.id, x: o.x, y: o.y });
      return;
    }
  }

  /** Prim in the chef hat karate-chops a food lying near her in two (every so often). */
  private chop(bug: Entity, s: { x: number; y: number }): void {
    const sim = this.sim;
    const b = bug.bug!;
    if (sim.tick - (b.machines?.chef ?? -Infinity) < 20 * SIM_HZ) return;
    const linked = sim.setupLinked();
    for (const e of sim.entities.ofKind('item')) {
      if (!this.loose(e) || linked.has(e.id)) continue;
      const def = sim.content.items.get(e.defId);
      if (!def.tags.includes('tag_edible') || def.potion) continue;
      const o = sim.physics.getState(e.id);
      if (Math.hypot(o.x - s.x, o.y - s.y) > 1.1) continue;
      b.machines = { ...(b.machines ?? {}), chef: sim.tick };
      b.facing = o.x >= s.x ? 1 : -1;
      const half = sim.spawn('item', e.defId, o.x + 0.12, o.y - 0.1);
      sim.physics.setVelocity(half.id, 1.2, -2.2);
      sim.physics.setVelocity(e.id, -1.2, -2.2);
      this.say(bug, 'chop');
      sim.events.emit('food_chopped', {
        id: bug.id,
        itemId: e.id,
        newId: half.id,
        defId: e.defId,
        x: o.x,
        y: o.y,
      });
      return;
    }
  }

  /** Lying about in the world: not held, carried, eaten, worn, pocketed, or pinned. */
  private loose(e: Entity): boolean {
    const sim = this.sim;
    if (e.kind !== 'item' || e.pinned || sim.isSleeping(e.id) || this.worn.has(e.id)) return false;
    if (sim.physics.grabbed === e.id || sim.carried.has(e.id) || !sim.physics.isActive(e.id)) return false;
    return !sim.bench.locked(e.id);
  }

  /**
   * A bug that loves a hat, or loves hats (Prim), puts on one it finds lying
   * by its head, if that slot is free. Never one of the player's setups.
   */
  private dress(bug: Entity): void {
    const sim = this.sim;
    const b = bug.bug!;
    if (!this.awake(bug) || (b.mode !== 'st_idle' && b.mode !== 'st_wander')) return;
    if (sim.tick - (b.machines?.dress ?? -Infinity) < DRESS_EVERY) return;
    const def = sim.content.bugs.get(bug.defId);
    const head = this.headCenter(bug);
    const linked = sim.setupLinked();
    const thrown = sim.thrown;
    for (const e of sim.entities.ofKind('item')) {
      const idef = sim.content.items.get(e.defId);
      if (!idef.wear || bug.wearing?.[idef.wear] !== undefined) continue;
      if (!this.loose(e) || linked.has(e.id) || thrown.has(e.id)) continue;
      const liking = this.liking(def, e.defId);
      if (liking !== 'loved' && !(def.habits.fashion && liking === 'liked')) continue;
      const o = sim.physics.getState(e.id);
      if (Math.hypot(o.x - head.x, o.y - head.y) > DRESS_REACH + def.radius * 0.5) continue;
      if (Math.hypot(o.vx, o.vy) > 0.3) continue;
      b.machines = { ...(b.machines ?? {}), dress: sim.tick };
      this.putOn(bug, e, 'bug');
      return;
    }
  }

  /** Two bugs chatting, each liking the other's hat better than its own, swap. */
  private swaps(): void {
    const sim = this.sim;
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      const soc = b?.social;
      if (!b || !soc || soc.kind !== 'soc_chat' || soc.role !== 'lead' || soc.stage !== 2) continue;
      const other = sim.entities.get(soc.partner);
      const mine = bug.wearing?.head;
      const theirs = other?.wearing?.head;
      if (!other?.bug || mine === undefined || theirs === undefined) continue;
      const a = sim.entities.get(mine)!;
      const c = sim.entities.get(theirs)!;
      const me = sim.content.bugs.get(bug.defId);
      const them = sim.content.bugs.get(other.defId);
      const gainA = RANK[this.liking(me, c.defId)] - RANK[this.liking(me, a.defId)];
      const gainB = RANK[this.liking(them, a.defId)] - RANK[this.liking(them, c.defId)];
      if (gainA <= 0 || gainB <= 0) continue;
      this.takeOff(mine, 'swapped');
      this.takeOff(theirs, 'swapped');
      this.putOn(bug, c, 'swap');
      this.putOn(other, a, 'swap');
      const s = sim.physics.getState(bug.id);
      sim.events.emit('hats_swapped', { a: bug.id, b: other.id, x: s.x, y: s.y });
    }
  }

  /**
   * `secret_fashion_parade`: every bug that has joined wears a hat at once.
   * Prim (or whoever is first) leads, and everyone cheers.
   */
  private parade(): void {
    const sim = this.sim;
    const bugs = sim.entities.ofKind('bug').filter((b) => b.bug && !b.bug.pending);
    if (bugs.length < 3 || !bugs.every((b) => b.wearing?.head !== undefined)) return;
    if (this.state.parade >= 0 && sim.tick - this.state.parade < 5 * 60 * SIM_HZ) return;
    this.state.parade = sim.tick;
    const leader = bugs.find((b) => sim.content.bugs.get(b.defId).habits.fashion) ?? bugs[0]!;
    const s = sim.physics.getState(leader.id);
    sim.findSecret('secret_fashion_parade', s.x, s.y);
    sim.events.emit('parade_started', { leader: leader.id, ids: bugs.map((b) => b.id), x: s.x, y: s.y });
    for (const b of bugs) if (this.awake(b)) this.say(b, b === leader ? 'fashion' : 'cheer');
  }
}

function halfH(def: ItemDef): number {
  const s = def.shape;
  return s.type === 'circle' ? s.radius : s.height / 2;
}
