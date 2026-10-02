import type { Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Sim } from '../sim';
import { beckonBug } from './bugAi';
import { enter, react } from './bugMove';
import { BEAT_TICKS } from './bugMusic';

/**
 * The three music bugs M9 left for M11 (game design doc, section 4): how
 * each is found, and what each does that the shared AI does not.
 *
 * - Buzzby (`secret_buzzby_found`) hums inside the closed tulip. An
 *   instrument played on the flowerpot stage by day (by the player or a
 *   bug) opens it, and out she comes dancing. She takes pollen from the
 *   flowerbed to the nearest thimble on the ground, and every fifth load
 *   fills it with a honey drop. A bug in the petal bonnet draws her over.
 * - Fiddle (`secret_fiddle_found`) chirps under the stage at night. Four or
 *   more caps on the player's sequencer pattern after dark bring him out.
 *   From dusk on he fiddles on his own legs now and then.
 * - Luma (`secret_luma_found`) flies in to the porch lamp left on at night
 *   (20 s). At night she flutters in slow loops round the brightest light
 *   near her, or round a headlamp; in the headlamp herself, she chases her
 *   own head in circles.
 *
 * The movement goes through the AI's own moves (`beckonBug`, hops with
 * `selfLaunched`), and nothing here touches the player's setups.
 */

/** How long the porch lamp must be on at night before Luma arrives (ticks). */
export const LUMA_AFTER = 20 * SIM_HZ;
/** Caps on the sequencer that bring Fiddle out at night. */
export const FIDDLE_CAPS = 4;
/** Pollen loads per honey drop. */
export const HONEY_LOADS = 5;
/** Buzzby makes a delivery at most this often (ticks). */
export const POLLEN_EVERY = 12 * SIM_HZ;
/** Fiddle plays his legs at most this often, for this many beats. */
export const FIDDLE_REST = 40 * SIM_HZ;
export const FIDDLE_BEATS: readonly [number, number] = [8, 16];
/** Luma looks for lights this far away (m), and loops round them this close. */
export const LIGHT_REACH = 8;
const SLOW = 30;

export class MusicBugs {
  /** When the porch lamp was found on at night, or null. Not saved: she comes 20 s after a load. */
  private lampSince: number | null = null;

  constructor(private readonly sim: Sim) {}

  update(): void {
    const sim = this.sim;
    if (sim.tick % SLOW !== 0) return;
    this.findLuma();
    this.findFiddle();
    for (const bug of sim.entities.ofKind('bug')) {
      const b = bug.bug;
      if (!b || b.pending || sim.isSleeping(bug.id) || sim.physics.grabbed === bug.id) continue;
      const habits = sim.content.bugs.get(bug.defId).habits;
      if (habits.pollen) this.buzz(bug);
      if (habits.fiddles) this.fiddle(bug);
      if (habits.moth) {
        this.spotlight(bug);
        this.flutter(bug);
      }
    }
  }

  // --- Finding them ----------------------------------------------------------

  /** An instrument sounded (a poke, a knock, or a bug playing it): on the stage by day, Buzzby comes out. */
  notePlayed(itemId: EntityId): void {
    const sim = this.sim;
    if (sim.cast.joined('bug_bee_buzzby') || sim.weather.dark) return;
    const stage = sim.places.fixtures('stage')[0];
    const tulip = sim.places.fixtures('tulip')[0];
    if (!stage || !tulip || !sim.barriers.isOpen(stage.area.id)) return;
    const s = sim.physics.getState(itemId);
    const half = (stage.fixture.w ?? stage.fixture.radius * 2) / 2;
    if (Math.abs(s.x - stage.x) > half || s.y > stage.fixture.y + 0.6) return;
    sim.events.emit('hideout_stirred', { fixture: tulip.fixture.id, x: tulip.x, y: tulip.fixture.y });
    const bee = sim.cast.find('bug_bee_buzzby', tulip.x, tulip.fixture.y - 0.4);
    if (bee?.bug) sim.bugNotice(bee, react(bee.bug, 'dance', sim.rng, sim.tick));
  }

  /** Four caps on the player's pattern after dark: Fiddle climbs out from under the stage and plays along. */
  private findFiddle(): void {
    const sim = this.sim;
    if (!sim.weather.dark || sim.cast.joined('bug_cricket_fiddle')) return;
    const stage = sim.places.fixtures('stage')[0];
    if (!stage || !sim.barriers.isOpen(stage.area.id)) return;
    const seq = sim.places.sequencer;
    const rows = seq.patterns[seq.current];
    let caps = 0;
    for (const r of rows) for (let m = r; m; m &= m - 1) caps++;
    if (caps < FIDDLE_CAPS) return;
    const x = stage.x + 1.2;
    sim.events.emit('hideout_stirred', { fixture: stage.fixture.id, x, y: stage.fixture.y });
    const cricket = sim.cast.find('bug_cricket_fiddle', x, sim.surfaceY(x) - 0.8);
    if (cricket?.bug) this.startFiddling(cricket);
  }

  /** The porch lamp on at night for 20 s: Luma flies in to it, and stays. */
  private findLuma(): void {
    const sim = this.sim;
    if (sim.cast.joined('bug_moth_luma')) return;
    const lamp = sim.places.fixtures('porch_lamp')[0];
    if (!lamp || !sim.places.state.lampOn || !sim.weather.dark || !sim.barriers.isOpen(lamp.area.id)) {
      this.lampSince = null;
      return;
    }
    this.lampSince ??= sim.tick;
    if (sim.tick - this.lampSince < LUMA_AFTER) return;
    this.lampSince = null;
    sim.cast.find('bug_moth_luma', lamp.x, lamp.fixture.y + 1);
  }

  // --- Buzzby ------------------------------------------------------------------

  /** Pollen to the thimble: walk over, drop off a load, and every fifth makes honey. */
  private buzz(bug: Entity): void {
    const sim = this.sim;
    const b = bug.bug!;
    const def = sim.bugDef(bug);
    if (sim.weather.bedtime(def, bug.id) || !['st_idle', 'st_wander'].includes(b.mode)) return;
    const s = sim.physics.getState(bug.id);
    // A bug in the petal bonnet: she goes to see it.
    const bonnet = this.wearerOf('flowery', s.x, 10, bug.id);
    if (bonnet && sim.tick - (b.machines?.bonnet ?? -Infinity) > 30 * SIM_HZ) {
      const o = sim.physics.getState(bonnet.id);
      if (Math.abs(o.x - s.x) > 1.4 && sim.physics.isSupported(bug.id) && beckonBug(b, def, s.x, o.x)) {
        b.machines = { ...(b.machines ?? {}), bonnet: sim.tick };
        return;
      }
    }
    if (sim.tick - (b.machines?.pollen ?? -Infinity) < POLLEN_EVERY) return;
    const flowerbed = sim.content.areas.get('area_flowerbed_stage');
    if (!sim.barriers.isOpen(flowerbed.id)) return;
    const thimble = this.thimble(s.x);
    if (!thimble) return;
    const t = sim.physics.getState(thimble.id);
    if (Math.abs(t.x - s.x) > def.radius + 1.4) {
      // Off to the thimble with her load.
      if (sim.physics.isSupported(bug.id)) beckonBug(b, def, s.x, t.x);
      return;
    }
    b.machines = { ...(b.machines ?? {}), pollen: sim.tick };
    const key = String(bug.id);
    const pollen = sim.wardrobe.state.pollen;
    const n = (pollen[key] ?? 0) + 1;
    sim.events.emit('pollen_delivered', { id: bug.id, itemId: thimble.id, count: n, x: t.x, y: t.y });
    if (n < HONEY_LOADS) {
      pollen[key] = n;
      return;
    }
    pollen[key] = 0;
    const honey = sim.spawn('item', 'item_honey_drop', t.x, t.y - 0.45);
    sim.events.emit('honey_made', { id: bug.id, itemId: honey.id, x: t.x, y: t.y - 0.45 });
    enter(b, 'st_react', 70);
    sim.bugNotice(bug, react(b, 'cheer', sim.rng, sim.tick));
  }

  /** The nearest thimble lying loose on the ground within 12 m (not one of the player's setups). */
  private thimble(x: number): Entity | null {
    const sim = this.sim;
    const linked = sim.setupLinked();
    let best: Entity | null = null;
    let bestD = 12;
    for (const e of sim.entities.ofKind('item')) {
      if (e.defId !== 'item_hat_thimble' || sim.isSleeping(e.id) || !sim.physics.isActive(e.id)) continue;
      if (linked.has(e.id) || sim.physics.grabbed === e.id || sim.carried.has(e.id)) continue;
      const s = sim.physics.getState(e.id);
      if (s.y < sim.surfaceY(s.x) - 0.6) continue;
      const d = Math.abs(s.x - x);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** The nearest other bug within `reach` wearing something with this perk. */
  private wearerOf(perk: 'flowery' | 'glow', x: number, reach: number, not: EntityId): Entity | null {
    const sim = this.sim;
    let best: Entity | null = null;
    let bestD = reach;
    for (const o of sim.entities.ofKind('bug')) {
      if (o.id === not || !o.wearing || sim.isSleeping(o.id) || !sim.wardrobe.has(o, perk)) continue;
      const d = Math.abs(sim.physics.getState(o.id).x - x);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  // --- Fiddle ------------------------------------------------------------------

  /** From dusk on, now and then, he stops and plays his own legs. */
  private fiddle(bug: Entity): void {
    const sim = this.sim;
    const b = bug.bug!;
    const def = sim.bugDef(bug);
    if (sim.weather.bedtime(def, bug.id) || !sim.weather.dark) return;
    if (b.mode !== 'st_idle' || !sim.physics.isSupported(bug.id) || b.needs.need_energy < 25) return;
    if (sim.tick - (b.machines?.fiddle ?? -Infinity) < FIDDLE_REST) return;
    this.startFiddling(bug);
  }

  private startFiddling(bug: Entity): void {
    const sim = this.sim;
    const b = bug.bug!;
    const beats = sim.rng.int(FIDDLE_BEATS[0], FIDDLE_BEATS[1]);
    enter(b, 'st_perform', beats * BEAT_TICKS);
    b.action = 'play';
    b.targetId = null;
    b.machines = { ...(b.machines ?? {}), fiddle: sim.tick };
    const s = sim.physics.getState(bug.id);
    sim.events.emit('bug_fiddled', { id: bug.id, defId: bug.defId, beats, x: s.x, y: s.y });
  }

  // --- Luma --------------------------------------------------------------------

  /** At night: slow loops round the brightest light near her (or her own headlamp). */
  private flutter(bug: Entity): void {
    const sim = this.sim;
    const b = bug.bug!;
    const def = sim.bugDef(bug);
    if (sim.weather.bedtime(def, bug.id) || !['st_idle', 'st_wander'].includes(b.mode)) return;
    if (!sim.physics.isSupported(bug.id)) return;
    const s = sim.physics.getState(bug.id);
    // Never flutter about over the player's setups (the setup rule).
    if (sim.bugWorld().setups.some((u) => s.x > u.x0 - 2.5 && s.x < u.x1 + 2.5)) return;
    // Her own headlamp: she spins after her own head.
    if (sim.wardrobe.has(bug, 'glow')) {
      b.facing = b.facing === 1 ? -1 : 1;
      this.hop(bug, b.facing * 0.8, -4.2);
      sim.events.emit('moth_circled', { id: bug.id, x: s.x, y: s.y, own: true });
      return;
    }
    if (!sim.weather.dark) return;
    const light = this.brightest(bug, s.x, s.y);
    if (!light) return;
    if (Math.abs(light.x - s.x) > 1.2) {
      beckonBug(b, def, s.x, light.x);
      return;
    }
    // Under it: a loop up toward it and down the other side.
    const dir = light.x >= s.x ? 1 : -1;
    b.facing = dir;
    this.hop(bug, dir * 1.4, -Math.min(6, 2.5 + Math.max(0, s.y - light.y) * 0.9));
    sim.events.emit('moth_circled', { id: bug.id, x: light.x, y: light.y, own: false });
  }

  /**
   * `secret_moth_spotlight`: at night, the stage lights on spotlight with
   * Luma on the stage. She dances in the beam, and moths swirl round her.
   */
  private spotlight(bug: Entity): void {
    const sim = this.sim;
    if (!sim.weather.dark || sim.places.state.stageLights !== 3) return;
    const stage = sim.places.fixtures('stage')[0];
    if (!stage || !sim.barriers.isOpen(stage.area.id)) return;
    const s = sim.physics.getState(bug.id);
    const half = (stage.fixture.w ?? stage.fixture.radius * 2) / 2;
    if (Math.abs(s.x - stage.x) > half || s.y > stage.fixture.y + 0.6) return;
    const b = bug.bug!;
    if (sim.tick - (b.machines?.spotlight ?? -Infinity) < 20 * SIM_HZ) return;
    b.machines = { ...(b.machines ?? {}), spotlight: sim.tick };
    if (
      !sim.weather.bedtime(sim.bugDef(bug), bug.id) &&
      ['st_idle', 'st_wander', 'st_react'].includes(b.mode)
    ) {
      enter(b, 'st_perform', 6 * SIM_HZ);
      b.action = 'dance';
      sim.bugNotice(bug, react(b, 'dance', sim.rng, sim.tick));
    }
    sim.events.emit('moth_spotlit', { id: bug.id, x: s.x, y: s.y });
    sim.findSecret('secret_moth_spotlight', s.x, s.y);
  }

  /** The brightest light within reach: a lamp or stage lights, a glowing thing, a glowing bug, a headlamp. */
  private brightest(bug: Entity, x: number, y: number): { x: number; y: number } | null {
    const sim = this.sim;
    let best: { x: number; y: number; k: number } | null = null;
    const consider = (lx: number, ly: number, k: number): void => {
      const d = Math.hypot(lx - x, ly - y);
      if (d > LIGHT_REACH) return;
      const score = k / (1 + d);
      if (!best || score > best.k) best = { x: lx, y: ly, k: score };
    };
    for (const l of sim.places.lights()) consider(l.x, l.y, 3);
    for (const e of sim.entities.all()) {
      if (e.id === bug.id || sim.isSleeping(e.id) || !sim.glows(e)) continue;
      const s = sim.physics.getState(e.id);
      // Luma loves a headlamp most of all.
      consider(s.x, s.y, e.wearing && sim.wardrobe.has(e, 'glow') ? 4 : 1.5);
    }
    return best;
  }

  /** A fluttering hop that floats down slowly on open wings. */
  private hop(bug: Entity, vx: number, vy: number): void {
    const sim = this.sim;
    const b = bug.bug!;
    const s = sim.physics.getState(bug.id);
    enter(b, 'st_airborne');
    b.selfLaunched = true;
    b.gliding = true;
    b.airPeak = 0;
    b.airTop = s.y;
    sim.physics.setVelocity(bug.id, vx, vy);
    sim.events.emit('bug_hopped', { id: bug.id, defId: bug.defId, x: s.x, y: s.y });
  }
}
