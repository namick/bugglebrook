import type { Entity, EntityId, SavedPart } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Content } from '../data';
import type { AreaDef, FixtureDef, ItemDef } from '../data/types';
import type { Sim } from '../sim';
import { halfExtents } from '../simShared';
import { react } from './bugMove';
import { skySpot } from './bounds';
import type { DropCandidate } from './dropTargets';

/**
 * The trash can (playtest F1): a tin can with a hinged lid in the plaza.
 * Anything dropped or tossed into it gets chomped, and a moment later the
 * can burps. Nothing that matters is lost, so no recipe, secret, or unlock
 * can be stranded:
 *
 * - Things that belong to the world wait inside, then drop back in from the
 *   sky over their home spot (where the area's start list put one), with a
 *   puff. Things with no home spot come back beside the can.
 * - Things the player made come apart: a crafted toy or a junk blob gives
 *   up its parts, which go home in turn. A potion bottle is gone (its
 *   ingredients came from the world, and the world still has them).
 * - Bugs are never trashed. One that falls in pops right back out, smelly
 *   and indignant. So does anything built into the player's setup, and
 *   anything too big for the can's mouth.
 *
 * A click on the can hiccups up the last thing it ate. Bugs that love it
 * (Rollo, Barty, and Whiff) dive in to rummage and come up with the oldest.
 */

/** Plain JSON, saved as `world.trash`. */
export interface TrashState {
  /** World things waiting to go home, in the order they come out. */
  inside: { part: SavedPart; back: number }[];
  /** Things eaten so far. */
  eaten: number;
  /** The can burps at this tick, or -1. */
  burpAt: number;
  /** Things eaten since the last burp: the burp's size. */
  meal: number;
}

/** World things come home this long after they were eaten. */
export const TRASH_BACK = 40 * SIM_HZ;
/** Things come home at least this far apart. */
export const BACK_GAP = SIM_HZ;
/** The burp comes this long after the last chomp. */
export const BURP_AFTER = 40;
/** Things this far either side of the can's middle fall in. */
export const MOUTH_HALF = 0.62;
/** Things wider or taller than this do not fit in the can (m). */
export const FITS = 1.4;
/** A thing just spat out does not fall straight back in for this long. */
const SPIT_GRACE = 45;
/** Things with no home spot come back this far beside the can (m). */
const LOST_FOUND = 2.4;
/** Bugs this close look round at a burp. */
const BURP_RANGE = 5;
/** A home spot already holding this many of its kind within HOME_CROWD (m) counts as full. */
const HOME_CROWD = 1.5;

export const JUNK_BLOB = 'item_junk_blob';
export const TIDY_WHISTLE = 'item_tidy_whistle';

export function newTrashState(): TrashState {
  return { inside: [], eaten: 0, burpAt: -1, meal: 0 };
}

/**
 * Who a thing belongs to: the world (it came from an area's start list, a
 * respawn, a jar, or a rule that changed one world thing into another), a
 * crafted thing the player made (a toy, a hat, a junk blob: anything with
 * parts, or a recipe's output), or a potion bottle.
 */
export type Ownership = 'world' | 'crafted' | 'bottle';

export function ownership(
  def: ItemDef,
  parts: readonly SavedPart[] | undefined,
  content: Content,
): Ownership {
  if (def.potion || def.id === 'item_potion_mix') return 'bottle';
  if (parts || def.toy || def.id === JUNK_BLOB || recipeOutputs(content).has(def.id)) return 'crafted';
  return 'world';
}

const OUTPUTS = new WeakMap<Content, Set<string>>();

function recipeOutputs(content: Content): Set<string> {
  let out = OUTPUTS.get(content);
  if (!out) {
    out = new Set(content.recipes.all.map((r) => r.output));
    OUTPUTS.set(content, out);
  }
  return out;
}

/** A place a world thing lives: world x, the ground (or a start y) there, and its area. */
export interface HomeSpot {
  x: number;
  /** The start entry's y, if it gave one. */
  y: number | null;
  area: string;
}

const HOMES = new WeakMap<Content, Map<string, HomeSpot[]>>();

/**
 * Every home spot of an item kind: where each area's start list puts one,
 * and the shelf jars that refill it. Respawned things live where their
 * area's start list puts them; a kind only respawned lives in the middle of
 * its area. Things made by rules (popcorn, compost goo, a moon pebble) have
 * no home spot.
 */
export function homeSpots(content: Content, defId: string): readonly HomeSpot[] {
  let all = HOMES.get(content);
  if (!all) {
    all = new Map();
    const add = (id: string, h: HomeSpot): void => {
      const list = all!.get(id) ?? [];
      list.push(h);
      all!.set(id, list);
    };
    for (const area of content.areas.all) {
      for (const s of area.start)
        if (s.kind === 'item') add(s.defId, { x: area.xStart + s.x, y: s.y ?? null, area: area.id });
      for (const f of area.fixtures ?? [])
        if (f.kind === 'shelf_jar' && f.item) add(f.item, { x: area.xStart + f.x, y: null, area: area.id });
    }
    for (const area of content.areas.all)
      for (const r of area.respawn)
        if (!all.has(r.item)) add(r.item, { x: (area.xStart + area.xEnd) / 2, y: null, area: area.id });
    HOMES.set(content, all);
  }
  return all.get(defId) ?? [];
}

/**
 * How far a thing at x is from the nearest home spot of its kind (m), or
 * null if it has none. `open` says which areas count (the open ones).
 */
export function awayFromHome(
  content: Content,
  defId: string,
  x: number,
  open: (areaId: string) => boolean = () => true,
): number | null {
  const homes = homeSpots(content, defId).filter((h) => open(h.area));
  if (homes.length === 0) return null;
  return Math.min(...homes.map((h) => Math.abs(h.x - x)));
}

/**
 * Pieces of the player's builds (structures, with `tag_player_setup` for
 * good) and everything touching them, directly or through other things.
 * Tidying by the player's own hand (the can, the whistle) leaves these be.
 */
export function builtLinked(sim: Sim): Set<EntityId> {
  const ids = new Set<EntityId>();
  for (const e of sim.entities.ofKind('item'))
    if (sim.setup.isPermanent(e.id) && !sim.isPocketed(e.id)) ids.add(e.id);
  if (ids.size === 0) return ids;
  const pairs = sim.physics.touchingPairs();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b] of pairs)
      if (ids.has(a) !== ids.has(b)) {
        if (sim.entities.get(a)?.kind !== 'item' || sim.entities.get(b)?.kind !== 'item') continue;
        ids.add(a);
        ids.add(b);
        grew = true;
      }
  }
  return ids;
}

type Can = { area: AreaDef; fixture: FixtureDef; x: number };

export class Trash {
  state: TrashState = newTrashState();
  /** Things just spat out, and when: they do not fall straight back in. */
  private readonly spatAt = new Map<EntityId, number>();

  constructor(private readonly sim: Sim) {}

  restore(state: TrashState): void {
    this.state = state;
  }

  serialize(): TrashState {
    return JSON.parse(JSON.stringify(this.state)) as TrashState;
  }

  /** Every trash can, with its world x. */
  cans(): readonly Can[] {
    return this.sim.places.fixtures('trash_can');
  }

  /** The can's rim (the mouth), in world meters. */
  rim(can: Can): { x: number; y: number } {
    return { x: can.x, y: can.fixture.y - (can.fixture.h ?? 1.8) / 2 };
  }

  private ready(can: Can): boolean {
    return this.sim.barriers.isOpen(can.area.id) && !this.sim.isAreaAsleep(can.area.id);
  }

  /** The first can, for the bug AI and the whistle: its rim, and how much waits inside. */
  bugView(): { x: number; y: number; ground: number; count: number } | null {
    const can = this.cans().find((c) => this.ready(c));
    if (!can) return null;
    const r = this.rim(can);
    return { x: r.x, y: r.y, ground: this.sim.surfaceY(r.x), count: this.state.inside.length };
  }

  /**
   * Why the can would not keep this thing, or null if it would: bugs, the
   * player's builds, pinned things, and things too big for its mouth.
   */
  refusal(e: Entity, built?: ReadonlySet<EntityId>): 'bug' | 'big' | 'setup' | null {
    if (e.kind === 'bug') return 'bug';
    const def = this.sim.content.items.get(e.defId);
    const ext = halfExtents(def.shape, 0);
    const scale = this.sim.potions.scaleOf(e);
    if (def.unpocketable || e.pinned || Math.max(ext.w, ext.h) * 2 * scale > FITS) return 'big';
    if ((built ?? builtLinked(this.sim)).has(e.id)) return 'setup';
    return null;
  }

  /** A drop target over each can's mouth, while the held thing would go in. */
  candidates(heldId: EntityId): DropCandidate[] {
    const e = this.sim.entities.get(heldId);
    if (!e || e.kind !== 'item' || this.refusal(e) !== null) return [];
    return this.cans().flatMap((can, i) => {
      if (!this.ready(can)) return [];
      const r = this.rim(can);
      return [{ kind: 'trash' as const, entityId: -20 - i, x: r.x, y: r.y - 0.35 }];
    });
  }

  /** The player let go over a can's mouth (drop rule 2). */
  drop(e: Entity, target: EntityId): void {
    const can = this.cans()[-20 - target] ?? this.cans()[0];
    if (can) this.swallow(e, can, 'player');
  }

  /** Something arrived in the can: eat it, or spit it back out. */
  swallow(e: Entity, can: Can, by: 'player' | 'tidy'): void {
    const why = this.refusal(e);
    if (why) {
      this.spit(e, can, why);
      return;
    }
    const sim = this.sim;
    const r = this.rim(can);
    const part = sim.snapshot(e);
    const before = this.state.inside.length;
    const fate = this.take(part);
    sim.remove(e.id);
    this.state.eaten++;
    this.state.meal++;
    this.state.burpAt = sim.tick + BURP_AFTER;
    sim.events.emit('trash_chomped', {
      id: e.id,
      defId: e.defId,
      fate,
      parts: this.state.inside.length - before,
      by,
      x: r.x,
      y: r.y,
    });
  }

  /**
   * Keep what went in: a world thing waits to go home, a crafted thing comes
   * apart and its parts wait, and a bottle is gone.
   */
  private take(part: SavedPart): 'home' | 'recycled' | 'gone' {
    const content = this.sim.content;
    if (!content.items.has(part.defId)) return 'gone';
    const kind = ownership(content.items.get(part.defId), part.parts, content);
    if (kind === 'bottle') return 'gone';
    if (kind === 'crafted') {
      for (const p of part.parts ?? []) this.take(p);
      return part.parts && part.parts.length > 0 ? 'recycled' : 'gone';
    }
    // Home good as new: no bites, paint, or tags from its adventures.
    const last = this.state.inside[this.state.inside.length - 1]?.back ?? -Infinity;
    this.state.inside.push({
      part: { defId: part.defId },
      back: Math.max(this.sim.tick + TRASH_BACK, last + BACK_GAP),
    });
    return 'home';
  }

  /** Out it pops, up and over the rim. A bug comes out smelly and cross. */
  private spit(e: Entity, can: Can, why: 'bug' | 'big' | 'setup' | 'hiccup'): void {
    const sim = this.sim;
    const r = this.rim(can);
    const s = sim.physics.getState(e.id);
    const side = s.x < r.x ? -1 : s.x > r.x ? 1 : (this.state.eaten + e.id) % 2 === 0 ? 1 : -1;
    sim.physics.setPosition(e.id, r.x + side * 0.3, r.y - sim.halfHeight(e) - 0.15);
    sim.physics.setVelocity(e.id, side * 2.6, -7);
    this.spatAt.set(e.id, sim.tick);
    if (e.bug && !e.bug.pending) {
      sim.addTag(e.id, 'tag_smelly', 'stink', 10);
      sim.emitNotice(e, react(e.bug, 'trashed', sim.rng, sim.tick), sim.physics.getState(e.id));
    }
    sim.events.emit('trash_spat', { id: e.id, kind: e.kind, defId: e.defId, why, x: r.x, y: r.y });
  }

  /** Bring back one thing from inside at the can's mouth, flying out to `side`. */
  private popOut(index: number, can: Can, side: 1 | -1): Entity | null {
    const sim = this.sim;
    const got = this.state.inside.splice(index, 1)[0];
    if (!got) return null;
    const r = this.rim(can);
    const e = sim.restorePart(got.part, r.x + side * 0.25, r.y - sim.halfHeightOfDef(got.part.defId) - 0.2);
    sim.physics.setVelocity(e.id, side * 2.4, -6.5);
    this.spatAt.set(e.id, sim.tick);
    return e;
  }

  /** A click on the can: it hiccups up the last thing it ate, or clacks its lid. */
  poke(can: Can): void {
    const sim = this.sim;
    if (!this.ready(can)) return;
    const r = this.rim(can);
    const e = this.popOut(this.state.inside.length - 1, can, this.state.eaten % 2 === 0 ? 1 : -1);
    if (e)
      sim.events.emit('trash_spat', {
        id: e.id,
        kind: e.kind,
        defId: e.defId,
        why: 'hiccup',
        x: r.x,
        y: r.y,
      });
    else sim.events.emit('trash_poked', { x: r.x, y: r.y });
  }

  /** A bug rummaged in the can: out comes the oldest thing, toward it. */
  rummage(bug: Entity): void {
    const sim = this.sim;
    const can = this.cans().find((c) => this.ready(c));
    if (!can || !bug.bug) return;
    const r = this.rim(can);
    const bx = sim.physics.getState(bug.id).x;
    const e = this.popOut(0, can, bx < r.x ? -1 : 1);
    sim.events.emit('trash_rummaged', {
      bugId: bug.id,
      itemId: e?.id ?? null,
      defId: e?.defId ?? null,
      x: r.x,
      y: r.y,
    });
    sim.emitNotice(
      bug,
      react(bug.bug, e ? 'cheer' : 'blegh', sim.rng, sim.tick),
      sim.physics.getState(bug.id),
    );
  }

  /**
   * Where a world thing of this kind goes home to: the emptiest of its home
   * spots in an open area (nearest to `fromX` on a tie), or, with none, a
   * spot beside the can.
   */
  homeFor(defId: string, fromX: number): number {
    const sim = this.sim;
    const homes = homeSpots(sim.content, defId).filter((h) => sim.barriers.isOpen(h.area));
    if (homes.length > 0) {
      const near = sim.entities
        .ofKind('item')
        .filter((e) => e.defId === defId && !sim.isPocketed(e.id))
        .map((e) => sim.physics.getState(e.id).x);
      const crowd = (h: HomeSpot): number => near.filter((x) => Math.abs(x - h.x) < HOME_CROWD).length;
      const best = [...homes].sort(
        (a, b) => crowd(a) - crowd(b) || Math.abs(a.x - fromX) - Math.abs(b.x - fromX) || a.x - b.x,
      )[0]!;
      return best.x;
    }
    const can = this.cans()[0];
    if (!can) return fromX;
    const side = this.state.eaten % 2 === 0 ? 1 : -1;
    return can.x + side * LOST_FOUND;
  }

  /**
   * Where to put a thing `half` tall coming home to x: dropping in from the
   * sky, or, in an area nobody is looking at or for a thing that would break
   * (`fragile`), just above the ground there.
   */
  landing(x: number, half: number, fragile = false): { x: number; y: number } {
    const sim = this.sim;
    // Never back down a can's mouth: beside it.
    for (const can of this.cans())
      if (Math.abs(x - can.x) < MOUTH_HALF + 0.4) x = can.x + (x >= can.x ? 1 : -1) * (MOUTH_HALF + 0.5);
    const spot = skySpot(sim, x, half, 0.5);
    if (fragile) return { x: spot.x, y: sim.surfaceY(spot.x) - half - 0.25 };
    if (!sim.isAreaAsleep(sim.areaOf(spot.x).id)) return spot;
    return { x: spot.x, y: sim.surfaceY(spot.x) - half - 0.02 };
  }

  update(): void {
    const sim = this.sim;
    this.comeHome();
    if (this.state.burpAt >= 0 && sim.tick >= this.state.burpAt) this.burp();
    if (sim.tick % 2 !== 0) return;
    for (const can of this.cans()) if (this.ready(can)) this.catchFalling(can);
  }

  /** Anything the player drops, throws, or flings into the mouth goes in. */
  private catchFalling(can: Can): void {
    const sim = this.sim;
    const r = this.rim(can);
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || !sim.physics.has(e.id)) continue;
      const p = sim.physics.position(e.id);
      if (Math.abs(p.x - r.x) > MOUTH_HALF || p.y < r.y - 0.05 || p.y > r.y + 0.6) continue;
      if (sim.physics.grabbed === e.id || !sim.physics.isActive(e.id)) continue;
      const s = sim.physics.getState(e.id);
      if (s.vy < 0.5) continue;
      if (sim.tick - (this.spatAt.get(e.id) ?? -999) < SPIT_GRACE) continue;
      // Only what the player sent: a thing they just let go of or threw, or a bug they flung.
      // Bugs hopping over, a bug's toss, or a berry dropping from the sky pass by.
      if (e.bug ? e.bug.pending || !sim.byPlayer(e) : !sim.thrown.has(e.id) && !sim.setup.fresh(e.id))
        continue;
      this.swallow(e, can, 'player');
    }
  }

  /** One thing a tick comes home once its time is up. */
  private comeHome(): void {
    const sim = this.sim;
    const next = this.state.inside[0];
    if (!next || next.back > sim.tick) return;
    this.state.inside.shift();
    if (!sim.content.items.has(next.part.defId)) return;
    const can = this.cans()[0];
    const x = this.homeFor(next.part.defId, can?.x ?? 0);
    const def = sim.content.items.get(next.part.defId);
    const spot = this.landing(x, sim.halfHeightOfDef(def.id), !!def.shatters);
    const e = sim.restorePart(next.part, spot.x, spot.y);
    sim.physics.setVelocity(e.id, 0, 1);
    sim.events.emit('item_came_home', { id: e.id, defId: e.defId, x: spot.x, y: spot.y });
  }

  private burp(): void {
    const sim = this.sim;
    const can = this.cans()[0];
    const size = this.state.meal;
    this.state.burpAt = -1;
    this.state.meal = 0;
    if (!can) return;
    const r = this.rim(can);
    sim.events.emit('trash_burped', { size, x: r.x, y: r.y });
    // A good burp turns heads.
    if (sim.nearestBug(r.x, r.y, BURP_RANGE)) sim.noteLoud(r.x, r.y);
  }

  /** Forget a removed thing. */
  forget(id: EntityId): void {
    this.spatAt.delete(id);
  }
}
