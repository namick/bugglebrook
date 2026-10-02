import type { Entity } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { FixtureDef } from '../data/types';
import type { Sim } from '../sim';
import { clearIntent, enter } from './bugMove';

/**
 * The gnome and Gnome Hollow (game design doc, section 3, area 8, and
 * `mystery_gnome_nose`).
 *
 * - The flowerbed's gnome is missing his nose. The gnome's nose, dropped in
 *   the hole (or tossed through it), makes him sneeze; his hat flips open
 *   into a doorway and the hollow opens (`secret_gnome_inside`). Carried in
 *   from the depths, the nose counts as a clue (`nose_carried`).
 * - The telescope (`secret_constellations`): a click looks through it. The
 *   renderer draws the sky; the sim only counts the look.
 * - The moon pedestal (`secret_golden_marble_home`): the golden marble set
 *   in its cup starts the finale. The telescope opens, every bug in the
 *   world walks to the plaza, and bug-shaped fireworks go up over the stump.
 */

/** The hole where the gnome's nose should be, area-local to the flowerbed (m). */
export const NOSE_HOLE = { x: 1.76, y: 7.42 } as const;
/** Let go of the nose this close (m) to the hole, and it goes in. */
export const NOSE_DROP = 0.8;
/** Anything passing this close (m) to the hole's middle goes in (a toss). */
export const NOSE_CATCH = 0.45;
/** The marble settles in the pedestal's cup from this close (m). */
export const CUP_REACH = 0.6;
/** How long the finale lasts (ticks), and when the first firework goes up. */
export const FINALE_TICKS = 40 * SIM_HZ;
export const FIREWORKS_FROM = 5 * SIM_HZ;
export const FIREWORK_EVERY = 70;
/** Where the bugs gather around the stump (plaza-local x), in the order they get a spot. */
const SLOTS = [11, 28, 13, 26, 9.5, 29.5, 14.6, 24.4, 8, 31, 12, 27, 10.3, 30.3, 15.4, 23.6];
/** Where the fireworks burst over the stump (plaza-local x, world y). */
const BURSTS: readonly (readonly [number, number])[] = [
  [19.5, 1.6],
  [15.5, 2.2],
  [23.5, 1.9],
  [17.2, 1.2],
  [21.8, 2.4],
  [13.8, 1.5],
  [25.2, 1.4],
  [19.6, 2.7],
];

export interface HollowState {
  /** When the finale started (tick), -1 before it, or -2 once it is over. */
  finale: number;
  /** Fireworks set off so far in this finale. */
  bursts: number;
}

export function newHollowState(): HollowState {
  return { finale: -1, bursts: 0 };
}

const HOLLOW = 'area_gnome_hollow';

export class Hollow {
  state: HollowState = newHollowState();

  constructor(private readonly sim: Sim) {}

  restore(state: HollowState): void {
    this.state = state;
  }

  /** Where the gnome's nose hole is (world m), or null without a flowerbed. */
  noseHole(): { x: number; y: number } | null {
    const g = this.sim.places.fixtures('gnome')[0];
    return g ? { x: g.area.xStart + NOSE_HOLE.x, y: NOSE_HOLE.y } : null;
  }

  /** The gnome has his nose back (and so his hat is a doorway). */
  get noseOn(): boolean {
    return this.sim.barriers.isOpen(HOLLOW);
  }

  /** Where the marble sits in the pedestal's cup (world m), or null. */
  cup(): { x: number; y: number } | null {
    const p = this.sim.places.fixtures('moon_pedestal')[0];
    return p ? { x: p.x, y: p.fixture.y } : null;
  }

  /** Is the finale playing? Ticks since it started, or -1. */
  get finaleAge(): number {
    const f = this.state.finale;
    return f >= 0 ? this.sim.tick - f : -1;
  }

  // --- Per step ------------------------------------------------------------

  update(): void {
    const sim = this.sim;
    if (sim.tick % 5 === 0 && !this.noseOn) this.noseRule();
    if (sim.tick % 30 === 0) this.carriedRule();
    if (sim.tick % 15 === 0) this.pedestalRule();
    if (this.state.finale >= 0) this.finale();
  }

  /** The nose tossed through the hole goes in too. */
  private noseRule(): void {
    const sim = this.sim;
    const hole = this.noseHole();
    if (!hole) return;
    for (const e of sim.entities.ofKind('item')) {
      if (e.defId !== 'item_gnome_nose' || sim.isSleeping(e.id) || sim.physics.grabbed === e.id) continue;
      const s = sim.physics.getState(e.id);
      if (Math.hypot(s.x - hole.x, s.y - hole.y) <= NOSE_CATCH) this.fixNose(e);
      return;
    }
  }

  /** Clue: the nose, carried up from the depths, is back in the flowerbed. */
  private carriedRule(): void {
    const sim = this.sim;
    if (sim.journal.state.noticed.includes('nose_carried')) return;
    const nose = sim.entities.ofKind('item').find((e) => e.defId === 'item_gnome_nose');
    if (!nose || sim.isPocketed(nose.id)) return;
    if (sim.areaOf(sim.physics.getState(nose.id).x).id !== 'area_flowerbed_stage') return;
    sim.journal.notice('nose_carried');
  }

  /** The golden marble in the pedestal's cup: it settles there, and the finale begins. */
  private pedestalRule(): void {
    const sim = this.sim;
    const cup = this.cup();
    if (!cup || sim.isAreaAsleep(HOLLOW)) return;
    for (const e of sim.entities.ofKind('item')) {
      if (e.defId !== 'item_marble_gold' || sim.isSleeping(e.id) || sim.physics.grabbed === e.id) continue;
      if (e.pinned) continue;
      const s = sim.physics.getState(e.id);
      if (Math.hypot(s.x - cup.x, s.y - cup.y) > CUP_REACH) continue;
      this.seat(e, cup);
      return;
    }
  }

  private seat(e: Entity, cup: { x: number; y: number }): void {
    const sim = this.sim;
    const r = sim.halfHeight(e);
    sim.physics.place(e.id, cup.x, cup.y + 0.12 - r, 0);
    sim.physics.setPinned(e.id, true);
    e.pinned = true;
    sim.events.emit('marble_seated', { id: e.id, x: cup.x, y: cup.y });
  }

  // --- The finale ----------------------------------------------------------

  /** The finale: a night for fireworks, and every bug walks to the plaza to watch. */
  startFinale(): void {
    const sim = this.sim;
    this.state.finale = sim.tick;
    this.state.bursts = 0;
    // A night for fireworks: dusk turning dark, before the bugs' bedtime.
    sim.weather.setTime(19.5);
    const plaza = sim.content.areas.tryGet('area_stump_plaza');
    const stump = plaza ? plaza.xStart + 19.5 : sim.worldWidth / 2;
    sim.events.emit('finale_started', { x: stump, y: 2 });
    if (!plaza) return;
    let slot = 0;
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || b.pending || sim.isPocketed(bug.id) || sim.physics.grabbed === bug.id) continue;
      const local = SLOTS[slot % SLOTS.length]! + Math.floor(slot / SLOTS.length) * 0.5;
      slot++;
      const target = plaza.xStart + local;
      const s = sim.physics.getState(bug.id);
      const inPlaza = s.x >= plaza.xStart && s.x < plaza.xEnd && !sim.isSleeping(bug.id);
      if (!inPlaza) {
        // Bugs from far away come in from the plaza's edge on their side.
        const from = plaza.xStart + (local < 19.5 ? 1.2 : plaza.xEnd - plaza.xStart - 1.2);
        const def = sim.bugDef(bug);
        sim.bringBack(bug, from, sim.surfaceY(from) - def.radius - 0.05);
      }
      sim.putDown(bug.id);
      b.social = null;
      this.gathering.set(bug.id, target);
      this.walkTo(bug, target);
    }
  }

  /** Where each bug is headed for the fireworks (not saved: a reload just lets them be). */
  private readonly gathering = new Map<number, number>();

  private walkTo(bug: Entity, target: number): void {
    const b = bug.bug!;
    b.plan = null;
    clearIntent(b);
    enter(b, 'st_wander', 16 * SIM_HZ);
    b.targetX = target;
    b.restX = target;
    b.decideIn = 18 * SIM_HZ;
    b.facing = target >= this.sim.physics.getState(bug.id).x ? 1 : -1;
  }

  /** Bugs still on their way (an off-screen plan or a nap got in the way) are sent on again. */
  private keepGathering(): void {
    const sim = this.sim;
    for (const [id, target] of this.gathering) {
      const bug = sim.entities.get(id);
      if (!bug?.bug || sim.isSleeping(id) || sim.physics.grabbed === id) continue;
      const b = bug.bug;
      if (b.mode === 'st_airborne' || b.mode === 'st_held') continue;
      if (Math.abs(sim.physics.getState(id).x - target) < 0.8) {
        this.gathering.delete(id);
        continue;
      }
      if (b.mode !== 'st_wander' || Math.abs(b.targetX - target) > 0.1) this.walkTo(bug, target);
    }
  }

  private finale(): void {
    const sim = this.sim;
    const age = sim.tick - this.state.finale;
    if (age >= FINALE_TICKS) {
      this.state.finale = -2;
      this.gathering.clear();
      sim.events.emit('finale_ended', {});
      return;
    }
    if (age % 30 === 0 && age < FINALE_TICKS / 2) this.keepGathering();
    if (age < FIREWORKS_FROM || (age - FIREWORKS_FROM) % FIREWORK_EVERY !== 0) return;
    const plaza = sim.content.areas.tryGet('area_stump_plaza');
    if (!plaza) return;
    const cast = sim.cast.members().sort();
    const n = this.state.bursts++;
    const [bx, by] = BURSTS[n % BURSTS.length]!;
    const defId = cast.length > 0 ? cast[n % cast.length]! : 'bug_ladybug_dot';
    sim.events.emit('firework_burst', { defId, x: plaza.xStart + bx, y: by, n });
    // Everybody looks up and goes "ooh".
    if (n % 3 === 0) sim.lookUp(plaza.xStart + bx, by);
  }

  // --- Hooks -----------------------------------------------------------------

  /** Let go near the nose hole: the nose goes in. */
  released(e: Entity): void {
    if (e.defId !== 'item_gnome_nose' || this.noseOn) return;
    const hole = this.noseHole();
    if (!hole) return;
    const s = this.sim.physics.getState(e.id);
    if (Math.hypot(s.x - hole.x, s.y - hole.y) <= NOSE_DROP) this.fixNose(e);
  }

  /** The nose goes in: a big sneeze, and the hat flips open. Not before the root was pulled. */
  private fixNose(e: Entity): void {
    const sim = this.sim;
    const hole = this.noseHole();
    if (!hole || !sim.canFind('secret_gnome_inside')) return;
    sim.remove(e.id);
    sim.events.emit('gnome_sneezed', { x: hole.x, y: hole.y });
    const hat = sim.hidden.door('fix_gnome_hat');
    sim.barriers.unlock(HOLLOW, hat?.x ?? hole.x, hat?.y ?? hole.y);
  }

  poke(f: { id: string; kind: FixtureDef['kind']; x: number; y: number }): boolean {
    const sim = this.sim;
    switch (f.kind) {
      case 'telescope':
        sim.events.emit('telescope_viewed', { x: f.x, y: f.y });
        sim.findSecret('secret_constellations', f.x, f.y);
        return true;
      case 'moon_pedestal':
        sim.events.emit('pedestal_poked', { x: f.x, y: f.y });
        return true;
      case 'gnome_door':
      case 'hollow_door':
        return true;
      default:
        return false;
    }
  }
}
