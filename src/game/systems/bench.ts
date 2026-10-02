import type { Entity, EntityId, SavedPart } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import { Rng } from '../core/rng';
import type { RngState } from '../core/rng';
import type { AreaDef, FixtureDef, RecipeInput } from '../data/types';
import type { Sim } from '../sim';
import type { DropCandidate } from './dropTargets';
import type { Ingredient } from './crafting';
import {
  blobKind,
  defaultParts,
  inputMatches,
  isFood,
  matchRecipe,
  nearMiss,
  recipeFor,
  tagNudge,
} from './crafting';
import { WISH_TICKS } from './bugMachines';

/**
 * The Tinker Bench (game design doc, section 8): three bottle-cap trays on a
 * thread spool, a clothespin lever, and a cork board of hints. Things
 * dropped on a tray sit pinned in it. Pulling the lever shakes the bench
 * for 1.2 s, then a recipe pops out, a crafted thing comes apart into its
 * parts, or a junk blob comes out that holds what went in. Nothing is lost.
 */

/** Plain JSON, saved as `world.bench`. */
export interface BenchState {
  /** What sits in each tray. */
  trays: (EntityId | null)[];
  /** The tick the bench stops shaking and the result pops out, or -1. */
  busyUntil: number;
  /** Recipes made at least once, in order. */
  made: string[];
  /** Recipes hinted: blueprint cards pinned on the cork board. */
  hinted: string[];
  /** Tags the cork board shows (tag nudges). */
  nudged: string[];
  /** The tray contents the last near miss was about, so it fires once. */
  hintKey: string;
  /** When each bug last wished for something (by entity ID). */
  wished: Record<string, number>;
  /** Failed pulls so far. */
  blobs: number;
  rng: RngState;
}

/** Trays sit this far left and right of the bench's middle. */
export const TRAY_OFFSETS: readonly number[] = [-1.3, 0, 1.3];
/** A gentle drop this close to an empty tray goes in it (drop rule 2: 60 px). */
export const TRAY_SNAP = 0.6;
/** The bench shakes this long before the result pops out (1.2 s). */
export const BENCH_SHAKE = Math.round(1.2 * SIM_HZ);
/** Bugs this close hammer along. */
const HELP_RANGE = 2.5;
/** Bored bugs this close to the bench sometimes wish for a toy, at most this often each. */
const WISH_RANGE = 4;
const WISH_EVERY = 30 * SIM_HZ;
const WISH_CHECK = 2 * SIM_HZ;
const WISH_CHANCE = 0.25;
/** A bouncy blob boings about for 3 s. */
export const BOING_TICKS = 3 * SIM_HZ;

export function newBenchState(seed: string): BenchState {
  return {
    trays: [null, null, null],
    busyUntil: -1,
    made: [],
    hinted: [],
    nudged: [],
    hintKey: '',
    wished: {},
    blobs: 0,
    rng: new Rng(`bench-${seed}`).getState(),
  };
}

export class Bench {
  state: BenchState;
  private rng: Rng;
  /** Bouncy blobs boinging about, until when. Not saved: it only lasts 3 s. */
  readonly boing = new Map<EntityId, number>();
  /** Things a bug tossed at a tray, on their way: which tray, and until when. Not saved: a toss lasts a second. */
  private readonly tossed = new Map<EntityId, { tray: number; until: number }>();

  constructor(private readonly sim: Sim) {
    this.state = newBenchState(sim.seed);
    this.rng = Rng.fromState(this.state.rng);
  }

  restore(state: BenchState): void {
    this.state = state;
    this.rng = Rng.fromState(state.rng);
    // Things in the trays sit pinned again.
    for (let i = 0; i < this.state.trays.length; i++) {
      const id = this.state.trays[i];
      if (id === null || id === undefined) continue;
      if (!this.sim.entities.has(id)) this.state.trays[i] = null;
      else this.sim.physics.setPinned(id, true);
    }
  }

  serialize(): BenchState {
    this.state.rng = this.rng.getState();
    return JSON.parse(JSON.stringify(this.state)) as BenchState;
  }

  /** The bench fixture, with its world x. */
  private bench(): { area: AreaDef; fixture: FixtureDef; x: number } | null {
    return this.sim.places.fixtures('tinker_bench')[0] ?? null;
  }

  /** Is the bench's area open and awake? */
  private ready(): boolean {
    const b = this.bench();
    return !!b && this.sim.barriers.isOpen(b.area.id) && !this.sim.isAreaAsleep(b.area.id);
  }

  get busy(): boolean {
    return this.state.busyUntil >= 0;
  }

  /** The middle of tray `i`'s top, in world meters. */
  trayAt(i: number): { x: number; y: number } {
    const b = this.bench()!;
    return { x: b.x + (TRAY_OFFSETS[i] ?? 0), y: b.fixture.y };
  }

  /** The tray holding this thing, or -1. */
  trayOf(id: EntityId): number {
    return this.state.trays.indexOf(id);
  }

  /** Drop targets: every empty tray while the bench is idle. */
  candidates(): DropCandidate[] {
    if (!this.ready() || this.busy) return [];
    const out: DropCandidate[] = [];
    this.state.trays.forEach((id, i) => {
      if (id !== null) return;
      const t = this.trayAt(i);
      // Trays have no entity: their candidates count down from -1.
      out.push({ kind: 'tray', entityId: -1 - i, x: t.x, y: t.y - 0.25 });
    });
    return out;
  }

  /**
   * The bench as the bug AI sees it (R20): the table top, its empty trays,
   * and whether a thing fits a recipe a bug wished for. Null while the bench
   * is shut away, asleep, or shaking.
   */
  bugView(): {
    x0: number;
    x1: number;
    y: number;
    trays: { i: number; x: number }[];
    fits: (recipe: string, itemId: EntityId) => boolean;
  } | null {
    const b = this.bench();
    if (!b || !this.ready() || this.busy) return null;
    const half = (b.fixture.w ?? 4.4) / 2;
    const trays: { i: number; x: number }[] = [];
    this.state.trays.forEach((id, i) => {
      if (id === null) trays.push({ i, x: this.trayAt(i).x });
    });
    const sim = this.sim;
    return {
      x0: b.x - half,
      x1: b.x + half,
      y: b.fixture.y,
      trays,
      fits: (recipeId, itemId) => {
        const recipe = sim.content.recipes.tryGet(recipeId);
        const e = sim.entities.get(itemId);
        if (!recipe || !e || e.kind !== 'item') return false;
        // Something like it is in a tray already: one of each is plenty.
        if (this.filled().some((id) => sim.entities.get(id)?.defId === e.defId)) return false;
        const ing = { defId: e.defId, tags: sim.tagsOf(itemId) };
        return recipe.inputs.some((input) => inputMatches(input, ing));
      },
    };
  }

  /** A bug tossed this at tray `i`: it goes in if it comes down on it. */
  expect(id: EntityId, tray: number): void {
    if (tray < 0 || tray >= this.state.trays.length) return;
    this.tossed.set(id, { tray, until: this.sim.tick + 3 * SIM_HZ });
  }

  /** Tossed things that come down on their tray drop in. */
  private catchTossed(): void {
    const sim = this.sim;
    for (const [id, t] of [...this.tossed]) {
      const e = sim.entities.get(id);
      if (!e || sim.tick > t.until || this.state.trays[t.tray] !== null || sim.isSleeping(id)) {
        this.tossed.delete(id);
        continue;
      }
      if (sim.physics.grabbed === id || !sim.physics.isActive(id) || sim.carrierOf(id) !== null) continue;
      const s = sim.physics.getState(id);
      const at = this.trayAt(t.tray);
      if (s.vy > 0 && Math.abs(s.x - at.x) < 0.55 && s.y < at.y && s.y > at.y - 1.1) {
        this.tossed.delete(id);
        this.place(id, t.tray);
      }
    }
  }

  /** Is (x, y) right over one of the trays? A bug let go there gets refused. */
  nearTray(x: number, y: number): boolean {
    if (!this.ready()) return false;
    return TRAY_OFFSETS.some((_, i) => {
      const t = this.trayAt(i);
      return Math.hypot(x - t.x, y - (t.y - 0.3)) <= TRAY_SNAP + 0.2;
    });
  }

  /** Can the player take this out right now? Not while the bench is shaking. */
  locked(id: EntityId): boolean {
    return this.busy && this.trayOf(id) >= 0;
  }

  /** Put a thing in tray `i`: it sits pinned on the bottle cap. */
  place(id: EntityId, i: number): void {
    const sim = this.sim;
    const e = sim.entities.get(id);
    if (!e || this.state.trays[i] !== null || e.kind !== 'item') return;
    const t = this.trayAt(i);
    // One-of-a-kind treasures are never crafted (M10): they hop off.
    if (sim.content.items.get(e.defId).unique) {
      const s = sim.physics.getState(id);
      sim.physics.setVelocity(id, s.x < t.x ? -3 : 3, -4.5);
      sim.events.emit('bench_shrugged', { id, x: s.x, y: s.y });
      return;
    }
    sim.environment.unstickAll(id);
    sim.physics.place(id, t.x, t.y - sim.halfHeight(e) - 0.01, 0);
    sim.physics.setPinned(id, true);
    this.state.trays[i] = id;
    sim.events.emit('tray_filled', { tray: i, id, defId: e.defId, x: t.x, y: t.y });
    this.hint();
  }

  /** A bug was let go over a tray: it hops off and gives the bench a look. */
  refuse(bug: Entity): void {
    const sim = this.sim;
    const s = sim.physics.getState(bug.id);
    const b = this.bench();
    const dir = b && s.x < b.x ? -1 : 1;
    sim.physics.setVelocity(bug.id, dir * 3, -4.5);
    sim.events.emit('bench_refused', { id: bug.id, x: s.x, y: s.y });
    sim.reactBug(bug, 'huh');
  }

  /** The player took something out of a tray (or it was removed). */
  taken(id: EntityId): void {
    const i = this.trayOf(id);
    if (i < 0) return;
    this.state.trays[i] = null;
    this.state.hintKey = '';
    const t = this.trayAt(i);
    this.sim.events.emit('tray_emptied', { tray: i, id, x: t.x, y: t.y });
  }

  /** A blueprint scroll was picked up: its card goes on the cork board. */
  pickedUp(e: Entity): void {
    if (e.kind !== 'item') return;
    const recipe = this.sim.content.items.get(e.defId).blueprint;
    if (!recipe || this.state.hinted.includes(recipe)) return;
    this.state.hinted.push(recipe);
    const s = this.sim.physics.getState(e.id);
    this.sim.events.emit('blueprint_found', { id: e.id, recipe, x: s.x, y: s.y });
  }

  private ingredients(ids: readonly EntityId[]): Ingredient[] {
    return ids.map((id) => {
      const e = this.sim.entities.get(id)!;
      return { defId: e.defId, tags: this.sim.tagsOf(id) };
    });
  }

  private filled(): EntityId[] {
    return this.state.trays.filter((id): id is EntityId => id !== null && this.sim.entities.has(id));
  }

  /** A near miss: two of a three-thing recipe in the trays. The missing one's ghost flickers. */
  private hint(): void {
    const ids = this.filled();
    const key = ids
      .map((id) => this.sim.entities.get(id)!.defId)
      .sort()
      .join('+');
    if (ids.length !== 2 || key === this.state.hintKey) return;
    const miss = nearMiss(this.sim.content.recipes.all, this.ingredients(ids), this.state.made);
    if (!miss) return;
    this.state.hintKey = key;
    const tray = this.state.trays.indexOf(null);
    const t = this.trayAt(tray);
    this.sim.events.emit('bench_hinted', {
      recipe: miss.recipe.id,
      tray,
      missing: concrete(miss.missing, this.sim),
      x: t.x,
      y: t.y,
    });
  }

  /** The lever came down. True if the bench started shaking. */
  pull(): boolean {
    const sim = this.sim;
    const b = this.bench();
    if (!b || !this.ready() || this.busy) return false;
    const ids = this.filled();
    const helpers: EntityId[] = [];
    let strong = false;
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id) || bug.bug.mode === 'st_sleep') continue;
      const s = sim.physics.getState(bug.id);
      if (Math.abs(s.x - b.x) > HELP_RANGE + 2.2 || s.y < b.fixture.y - 1) continue;
      helpers.push(bug.id);
      if (sim.content.bugs.get(bug.defId).habits.strong) strong = true;
    }
    sim.events.emit('bench_pulled', { empty: ids.length === 0, helpers, strong, x: b.x, y: b.fixture.y });
    if (ids.length === 0) return false;
    this.state.busyUntil = sim.tick + BENCH_SHAKE;
    for (const id of helpers) {
      const bug = sim.entities.get(id)!;
      sim.reactBug(bug, 'cheer');
    }
    return true;
  }

  update(): void {
    const sim = this.sim;
    if (this.busy && sim.tick >= this.state.busyUntil) {
      this.state.busyUntil = -1;
      this.resolve();
    }
    // Trays forget things that are gone (eaten off the bench, pocketed, removed).
    for (let i = 0; i < this.state.trays.length; i++) {
      const id = this.state.trays[i];
      if (id !== null && id !== undefined && (!sim.entities.has(id) || sim.isPocketed(id)))
        this.state.trays[i] = null;
    }
    this.boingBlobs();
    if (this.tossed.size > 0 && this.ready() && !this.busy) this.catchTossed();
    if (sim.tick % WISH_CHECK === 0) this.wishes();
  }

  /** What comes out: a recipe, parts, a blob, or the thing back. */
  private resolve(): void {
    const sim = this.sim;
    const b = this.bench()!;
    const ids = this.filled();
    if (ids.length === 0) return;
    const recipes = sim.content.recipes.all;
    const top = { x: b.x, y: b.fixture.y };
    if (ids.length === 1) {
      const e = sim.entities.get(ids[0]!)!;
      const recipe = recipeFor(recipes, e.defId);
      if (e.defId === 'item_junk_blob' || recipe) {
        const parts =
          e.parts ?? (recipe ? defaultParts(recipe, sim.content.items).map((defId) => ({ defId })) : []);
        this.clearTrays();
        const s = sim.physics.getState(e.id);
        sim.remove(e.id);
        const made = this.intoTrays(parts, top);
        sim.events.emit('uncrafted', { from: e.defId, parts: made, x: s.x, y: s.y });
        return;
      }
      // Nothing to pull apart: it hops back off the tray.
      this.clearTrays();
      sim.physics.setPinned(e.id, false);
      sim.physics.setVelocity(e.id, this.rng.range(-1.2, 1.2), -4);
      const s = sim.physics.getState(e.id);
      sim.events.emit('bench_shrugged', { id: e.id, x: s.x, y: s.y });
      return;
    }
    const ings = this.ingredients(ids);
    const recipe = matchRecipe(recipes, ings);
    if (recipe) {
      const parts = ids.map((id) => sim.snapshot(sim.entities.get(id)!));
      this.clearTrays();
      for (const id of ids) sim.remove(id);
      const out = this.popOut(recipe.output, top);
      out.parts = parts;
      const first = !this.state.made.includes(recipe.id);
      if (first) this.state.made.push(recipe.id);
      const s = sim.physics.getState(out.id);
      sim.events.emit('crafted', { recipe: recipe.id, id: out.id, defId: out.defId, x: s.x, y: s.y, first });
      // The pop is loud: idle bugs nearby turn round to gawk at the new thing.
      sim.noteLoud(top.x, top.y);
      return;
    }
    this.fail(ids, ings, top);
  }

  /** A failed pull: food gets eaten, the rest goes into a junk blob (section 8, "Failed combos"). */
  private fail(ids: EntityId[], ings: Ingredient[], top: { x: number; y: number }): void {
    const sim = this.sim;
    const kind = blobKind(ings);
    const keep: EntityId[] = [];
    const ate: string[] = [];
    ids.forEach((id, i) => (isFood(ings[i]!) ? ate.push(ings[i]!.defId) : keep.push(id)));
    const parts = keep.map((id) => sim.snapshot(sim.entities.get(id)!));
    const tags = new Set(keep.flatMap((id) => sim.tagsOf(id)));
    this.clearTrays();
    for (const id of ids) sim.remove(id);
    let blobId: EntityId | null = null;
    if (parts.length > 0) {
      const blob = this.popOut('item_junk_blob', top);
      blob.parts = parts;
      blobId = blob.id;
      for (const tag of [...tags].sort())
        if (tag !== 'tag_player_setup' && tag !== 'tag_edible') sim.addTag(blob.id, tag, 'contact', null);
      if (ate.length > 0) blob.bites = 1;
      if (kind === 'smelly') sim.addTag(blob.id, 'tag_smelly', 'stink', null);
      if (kind === 'bouncy') {
        this.boing.set(blob.id, sim.tick + BOING_TICKS);
        sim.physics.setRestitution(blob.id, 0.95);
      }
    }
    this.state.blobs++;
    const nudge = tagNudge(sim.content.recipes.all, ings);
    if (nudge && !this.state.nudged.includes(nudge.tag)) {
      this.state.nudged.push(nudge.tag);
      sim.events.emit('bench_nudged', { recipe: nudge.recipe.id, tag: nudge.tag, x: top.x, y: top.y });
    }
    sim.events.emit('bench_failed', { kind, blobId, ate, x: top.x, y: top.y });
    sim.findSecret('secret_first_blob', top.x, top.y);
  }

  private clearTrays(): void {
    for (const id of this.state.trays)
      if (id !== null && this.sim.entities.has(id)) this.sim.physics.setPinned(id, false);
    this.state.trays = [null, null, null];
    this.state.hintKey = '';
  }

  /** The result pops up out of the bench and lands on the table. */
  private popOut(defId: string, top: { x: number; y: number }): Entity {
    const sim = this.sim;
    const half = sim.halfHeightOfDef(defId);
    const e = sim.spawn('item', defId, top.x, top.y - half - 0.6);
    sim.physics.setVelocity(e.id, this.rng.range(-0.6, 0.6), -4.5);
    return e;
  }

  /** Parts go back into the trays (more than three spill out onto the table). */
  private intoTrays(parts: readonly SavedPart[], top: { x: number; y: number }): EntityId[] {
    const sim = this.sim;
    const out: EntityId[] = [];
    parts.forEach((part, i) => {
      if (i < 3) {
        const t = this.trayAt(i);
        const e = sim.restorePart(part, t.x, t.y - 1);
        this.place(e.id, i);
        out.push(e.id);
      } else {
        const e = sim.restorePart(part, top.x + (i - 3) * 0.4, top.y - 1.2);
        sim.physics.setVelocity(e.id, this.rng.range(-2, 2), -3);
        out.push(e.id);
      }
    });
    this.state.hintKey = 'parts';
    return out;
  }

  /** A shaken junk blob splits back into what went in. */
  split(blob: Entity): void {
    const sim = this.sim;
    const s = sim.physics.getState(blob.id);
    const parts = blob.parts ?? [];
    sim.remove(blob.id);
    const made: EntityId[] = [];
    parts.forEach((part, i) => {
      const a = (i / Math.max(1, parts.length)) * Math.PI * 2 + 0.4;
      const e = sim.restorePart(part, s.x + Math.cos(a) * 0.3, s.y + Math.sin(a) * 0.2);
      sim.physics.setVelocity(e.id, Math.cos(a) * 2.5, -3 + Math.sin(a));
      made.push(e.id);
    });
    sim.events.emit('blob_split', { id: blob.id, parts: made, x: s.x, y: s.y });
  }

  /** A bouncy blob boings about by itself for 3 s. */
  private boingBlobs(): void {
    const sim = this.sim;
    for (const [id, until] of [...this.boing]) {
      if (!sim.entities.has(id) || sim.tick >= until) {
        this.boing.delete(id);
        if (sim.entities.has(id)) sim.physics.setRestitution(id, 0.3);
        continue;
      }
      if (sim.physics.grabbed === id || sim.isSleeping(id)) continue;
      const s = sim.physics.getState(id);
      if ((until - sim.tick) % 30 === 0 && sim.physics.isSupported(id)) {
        sim.physics.setVelocity(id, this.rng.range(-2.5, 2.5), -this.rng.range(4, 6));
        sim.events.emit('toy_used', { id, toy: 'trampoline', action: 'boing', x: s.x, y: s.y });
      }
    }
  }

  /**
   * Bug wishes: a bored bug near the bench sometimes thinks about something
   * it could be made, which the player has not made yet.
   */
  private wishes(): void {
    const sim = this.sim;
    const b = this.bench();
    if (!b || !this.ready()) return;
    const open = sim.content.recipes.all.filter((r) => !this.state.made.includes(r.id));
    if (open.length === 0) return;
    for (const bug of sim.entities.ofKind('bug')) {
      const brain = bug.bug;
      if (!brain || brain.pending || sim.isSleeping(bug.id)) continue;
      if (brain.mode !== 'st_idle' && brain.mode !== 'st_wander') continue;
      if (brain.needs.need_fun >= 50) continue;
      const s = sim.physics.getState(bug.id);
      if (Math.abs(s.x - b.x) > WISH_RANGE) continue;
      const last = this.state.wished[String(bug.id)] ?? -WISH_EVERY;
      if (sim.tick - last < WISH_EVERY || !this.rng.chance(WISH_CHANCE)) continue;
      const recipe = this.rng.pick(open);
      this.state.wished[String(bug.id)] = sim.tick;
      // The bug keeps its wish in mind for a while: it may fetch a part of it (R10).
      brain.wish = { recipe: recipe.id, until: sim.tick + WISH_TICKS };
      sim.events.emit('bug_wished', {
        id: bug.id,
        defId: bug.defId,
        recipe: recipe.id,
        output: recipe.output,
      });
    }
  }
}

/** An item that would fill this input, for the near-miss ghost. */
function concrete(input: RecipeInput, sim: Sim): string {
  if (typeof input === 'string') return input;
  if ('anyOf' in input) return input.anyOf[0]!;
  return (
    sim.content.items.all.find((d) => d.tags.includes(input.tag) && !d.potion && !d.toy)?.id ?? 'item_pebble'
  );
}
