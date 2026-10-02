import type { Entity, EntityId, SavedPart } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { AreaDef, FixtureDef } from '../data/types';
import type { Sim } from '../sim';
import type { DropCandidate } from './dropTargets';
import { brew, essenceOf } from './brewing';
import type { Brew } from './brewing';

/**
 * The compost cauldron (game design doc, section 9): half an eggshell in the
 * warm heap. Things dropped or tossed into it splash, sink, and tint the
 * brew (up to three). Two full turns of the ladle and it bubbles hard, and a
 * corked bottle pops out. A click tips it and gives everything back.
 */

/** Plain JSON, saved as `world.cauldron`. */
export interface CauldronState {
  /** What is in it, as it went in. */
  contents: SavedPart[];
  /** Radians stirred since the last brew. Two full turns brew. */
  stir: number;
  /** Bubbling hard until this tick, then the bottle pops; or -1. */
  brewAt: number;
  /** Potions made so far. */
  brewed: number;
  /** The triple potion's foam fountain runs until this tick. */
  foamUntil: number;
}

/** Two full turns of the ladle. */
export const STIR_TURNS = 2;
export const STIR_RADIANS = STIR_TURNS * Math.PI * 2;
/** It bubbles hard for a second before the bottle pops. */
export const BUBBLE_TICKS = SIM_HZ;
export const MAX_INGREDIENTS = 3;
/** Things this far either side of the middle fall in; the rim is the fixture's y. */
export const MOUTH_HALF = 1.15;
/** Bugs this close cheer when it bubbles. */
const CHEER_RANGE = 4;
const FOAM_TICKS = 6 * SIM_HZ;

export function newCauldronState(): CauldronState {
  return { contents: [], stir: 0, brewAt: -1, brewed: 0, foamUntil: -1 };
}

export class Cauldron {
  state: CauldronState = newCauldronState();
  /** Half turns announced so far, for the stirring sound. */
  private halves = 0;

  constructor(private readonly sim: Sim) {}

  restore(state: CauldronState): void {
    this.state = state;
    this.halves = Math.floor(state.stir / Math.PI);
  }

  serialize(): CauldronState {
    return JSON.parse(JSON.stringify(this.state)) as CauldronState;
  }

  private place(): { area: AreaDef; fixture: FixtureDef; x: number } | null {
    return this.sim.places.fixtures('cauldron')[0] ?? null;
  }

  private ready(): boolean {
    const c = this.place();
    return !!c && this.sim.barriers.isOpen(c.area.id) && !this.sim.isAreaAsleep(c.area.id);
  }

  /** The middle of the brew's surface, in world meters. */
  mouth(): { x: number; y: number } | null {
    const c = this.place();
    return c ? { x: c.x, y: c.fixture.y } : null;
  }

  get bubbling(): boolean {
    return this.state.brewAt >= 0;
  }

  /** How far the stirring has got, 0 to 1. */
  progress(): number {
    return Math.min(1, this.state.stir / STIR_RADIANS);
  }

  /** The brew's color right now: the mix of what is in it, or clear green. */
  essences(): Brew['essences'] {
    const night = this.sim.weather.dark;
    return this.state.contents.flatMap((p) => {
      const d = essenceOf(this.sim.content.items.get(p.defId), this.partTags(p), night);
      return d.essence ? [d.essence] : [];
    });
  }

  private partTags(p: SavedPart): string[] {
    const def = this.sim.content.items.get(p.defId);
    const tags = new Set([...def.tags, ...this.sim.materialTags(def.material)]);
    for (const [tag, v] of Object.entries(p.tags ?? {})) {
      if (v === -1 || v > this.sim.tick) tags.add(tag);
      else tags.delete(tag);
    }
    return [...tags];
  }

  /** What brewing it now would make (the renderer tints the liquid with it). */
  preview(): Brew {
    const night = this.sim.weather.dark;
    const drops = this.state.contents.map((p) =>
      essenceOf(this.sim.content.items.get(p.defId), this.partTags(p), night),
    );
    return brew(drops, this.sim.content.potions);
  }

  /**
   * The cauldron as the bug AI sees it (R20): its mouth, how much is in it,
   * whether it takes more, and which things would tint the brew. Null while
   * its area is shut or asleep.
   */
  bugView(): {
    x: number;
    y: number;
    count: number;
    ready: boolean;
    ingredient: (itemId: EntityId) => boolean;
  } | null {
    const m = this.mouth();
    if (!m || !this.ready()) return null;
    const sim = this.sim;
    return {
      x: m.x,
      y: m.y,
      count: this.state.contents.length,
      ready: !this.bubbling && this.state.contents.length < MAX_INGREDIENTS,
      ingredient: (itemId) => {
        const e = sim.entities.get(itemId);
        if (!e || e.kind !== 'item') return false;
        const def = sim.content.items.get(e.defId);
        // Bottles and crafted things stay out of it; a bug brews from plain stuff.
        if (def.potion || def.toy || e.parts) return false;
        return essenceOf(def, sim.tagsOf(itemId), sim.weather.dark).essence !== null;
      },
    };
  }

  /** The drop target over the brew while it has room. */
  candidates(): DropCandidate[] {
    const m = this.mouth();
    if (!m || !this.ready() || this.bubbling || this.state.contents.length >= MAX_INGREDIENTS) return [];
    return [{ kind: 'cauldron', entityId: -10, x: m.x, y: m.y - 0.3 }];
  }

  /** In it goes: splash, sink, tint. */
  add(e: Entity): void {
    const sim = this.sim;
    const m = this.mouth();
    if (!m || e.kind !== 'item') return;
    // One-of-a-kind treasures are never brewed (M10): the brew spits them back.
    if (
      this.state.contents.length >= MAX_INGREDIENTS ||
      this.bubbling ||
      sim.content.items.get(e.defId).unique
    ) {
      this.spitOut(e.id);
      return;
    }
    const part = sim.snapshot(e);
    const drop = essenceOf(sim.content.items.get(e.defId), sim.tagsOf(e.id), sim.weather.dark);
    sim.remove(e.id);
    this.state.contents.push(part);
    const color = this.preview().color;
    sim.events.emit('cauldron_added', {
      defId: part.defId,
      essence: drop.essence,
      color,
      count: this.state.contents.length,
      x: m.x,
      y: m.y,
    });
  }

  /** Full up: it bounces back out. */
  private spitOut(id: EntityId): void {
    const sim = this.sim;
    const m = this.mouth()!;
    const s = sim.physics.getState(id);
    sim.physics.setPosition(id, s.x, m.y - 0.6);
    sim.physics.setVelocity(id, s.x < m.x ? -3 : 3, -5);
    sim.events.emit('cauldron_full', { id, x: s.x, y: m.y });
  }

  /** The ladle went round by `radians`. Two full turns brew. */
  stir(radians: number): void {
    const sim = this.sim;
    const m = this.mouth();
    if (!m || !this.ready() || this.bubbling || !Number.isFinite(radians)) return;
    this.state.stir += Math.min(Math.PI, Math.abs(radians));
    const halves = Math.floor(this.state.stir / Math.PI);
    if (halves > this.halves) {
      this.halves = halves;
      sim.events.emit('cauldron_stirred', { turns: Math.min(STIR_TURNS, halves / 2), x: m.x, y: m.y });
    }
    if (this.state.stir < STIR_RADIANS) return;
    this.state.brewAt = sim.tick + BUBBLE_TICKS;
    const cheer: EntityId[] = [];
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id) || bug.bug.mode === 'st_sleep') continue;
      const s = sim.physics.getState(bug.id);
      if (Math.hypot(s.x - m.x, s.y - m.y) > CHEER_RANGE) continue;
      cheer.push(bug.id);
      sim.reactBug(bug, 'cheer');
    }
    sim.events.emit('cauldron_bubbled', { color: this.preview().color, cheer, x: m.x, y: m.y });
  }

  /** A click tips the cauldron: everything in it comes back out. */
  tip(): void {
    const sim = this.sim;
    const m = this.mouth();
    if (!m || !this.ready() || this.bubbling) return;
    const parts = this.state.contents;
    this.state.contents = [];
    this.state.stir = 0;
    this.halves = 0;
    parts.forEach((part, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      const e = sim.restorePart(part, m.x + dir * 0.4, m.y - 0.7);
      sim.physics.setVelocity(e.id, dir * (2.5 + i * 0.6), -5);
    });
    sim.events.emit('cauldron_tipped', { count: parts.length, x: m.x, y: m.y });
  }

  update(): void {
    const sim = this.sim;
    const m = this.mouth();
    if (!m || !this.ready()) return;
    if (this.bubbling && sim.tick >= this.state.brewAt) this.finish();
    // Anything falling into the mouth goes in; bugs splash and hop out. Checked every other step.
    if (sim.tick % 2 !== 0) return;
    for (const e of sim.entities.all()) {
      if (sim.isSleeping(e.id) || sim.physics.grabbed === e.id || !sim.physics.isActive(e.id)) continue;
      const s = sim.physics.getState(e.id);
      if (Math.abs(s.x - m.x) > MOUTH_HALF || s.vy < 0.5) continue;
      if (s.y < m.y - 0.05 || s.y > m.y + 0.5) continue;
      if (e.kind === 'bug') {
        if (e.bug?.pending) continue;
        sim.addTag(e.id, 'tag_wet', 'water');
        sim.physics.setVelocity(e.id, s.x < m.x ? -3.5 : 3.5, -6);
        sim.events.emit('cauldron_full', { id: e.id, x: s.x, y: m.y });
        continue;
      }
      // Things that just came out of it (a fresh bottle) are on their way out.
      if (sim.tick - (this.poppedAt.get(e.id) ?? -999) < 45) continue;
      this.add(e);
    }
  }

  /** A bottle just popped out: it neither falls back in nor breaks where it lands. */
  fresh(id: EntityId): boolean {
    const at = this.poppedAt.get(id);
    return at !== undefined && this.sim.tick - at < 120;
  }

  /** Bottles that just popped out, so they do not fall straight back in. */
  private readonly poppedAt = new Map<EntityId, number>();

  /** Pop: the bottle comes out and the cauldron is clear again. */
  private finish(): void {
    const sim = this.sim;
    const m = this.mouth()!;
    const b = this.preview();
    this.state.contents = [];
    this.state.stir = 0;
    this.halves = 0;
    this.state.brewAt = -1;
    this.state.brewed++;
    const defId = b.potion ? sim.content.potions.get(b.potion).bottle : 'item_potion_mix';
    const bottle = sim.spawn('item', defId, m.x, m.y - 0.6);
    bottle.brew = b;
    const dir = this.state.brewed % 2 === 0 ? -1 : 1;
    sim.physics.setVelocity(bottle.id, dir * 2.4, -4.5);
    this.poppedAt.set(bottle.id, sim.tick);
    const triple = !!b.potion && sim.content.potions.get(b.potion).recipe.length === 3;
    sim.events.emit('potion_brewed', {
      id: bottle.id,
      potion: b.potion,
      color: b.color,
      triple,
      x: m.x,
      y: m.y,
    });
    sim.findSecret('secret_first_potion', m.x, m.y);
    if (triple) {
      this.state.foamUntil = sim.tick + FOAM_TICKS;
      sim.findSecret('secret_triple_potion', m.x, m.y);
    }
  }
}
