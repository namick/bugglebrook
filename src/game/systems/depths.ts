import type { Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { FixtureDef } from '../data/types';
import type { Sim } from '../sim';
import { halfExtents } from '../simShared';
import { isEmpty, playingRows } from './sequencer';

/**
 * The Ant Hill Depths (game design doc, section 3, area 7), and the ant hill
 * in the plaza that leads there. Everything here is checked a few times a
 * second; none of it uses the world's dice.
 *
 * - The ant hill (`secret_ant_sugar`): a sugar cube the player put within
 *   3 m of the hill is carried in by the ants, and the hole crumbles wide
 *   into a doorway. The plaza's own cube (starting or dropped in from the
 *   sky) is not the player's, so it never opens the hill by itself.
 * - The queen (`secret_queen_sweet`): something sweet within reach of her
 *   throne is eaten; she dances, the colony cheers, and the first time she
 *   gives the player her monocle.
 * - The conveyor: small things lying on the middle tunnel's ant line are
 *   passed left, hand to hand, until they drop into the pantry.
 * - The root knot (`secret_root_pull`): Moose, or any giant bug, touching it
 *   pulls it free, and the gnome's nose rolls out from behind.
 * - The conga (`secret_ant_conga`): the flowerbed's sequencer playing through
 *   the bluebell speakers while the player is down here.
 * - The pantry scrap (`secret_map_scrap_2`): at night, with the ants asleep,
 *   the map scrap lies on top of the pantry's pile where the player can see it.
 */

/** A sugar cube within this reach (m) of the hill's middle is found by the ants. */
export const SUGAR_REACH = 3;
/** How long the ants take to carry the cube in (ticks). */
export const SUGAR_CARRY = 3 * SIM_HZ;
/** Something sweet within this reach (m) of the queen, sideways, is hers. */
export const QUEEN_REACH = 1.05;
/** How long the queen's happy dance lasts (ticks). */
export const QUEEN_DANCE = 4 * SIM_HZ;
/** How fast the ant line passes things along (m/s, to the left). */
export const CONVEYOR_SPEED = 1.1;
/** The ant line only carries things this small (half-width and half-height, m). */
export const CONVEYOR_MAX = 0.42;
/** A big bug this close (m) to the root knot grabs it. */
export const ROOT_TOUCH = 0.18;

export interface DepthsState {
  /** The sugar cube the ants are carrying in, and when they took it (or null). */
  sugar: { id: EntityId; at: number; x: number; y: number } | null;
  /** Sweets the queen has eaten. */
  queenFed: number;
  /** When her last happy dance started (tick), or -1. */
  queenDance: number;
  /** The ants are dancing a conga right now: music is reaching the depths. */
  conga: boolean;
}

export function newDepthsState(): DepthsState {
  return { sugar: null, queenFed: 0, queenDance: -1, conga: false };
}

const DEPTHS = 'area_ant_hill_depths';

type Placed = { x: number; fixture: FixtureDef };

export class Depths {
  state: DepthsState = newDepthsState();
  /** Things on the ant line right now (not saved: they settle where they lie). */
  readonly riding = new Set<EntityId>();

  constructor(private readonly sim: Sim) {}

  restore(state: DepthsState): void {
    this.state = state;
  }

  /** The root comes out of the physics if it was pulled in this world. */
  build(): void {
    if (this.sim.secrets.includes('secret_root_pull')) this.sim.physics.removePlatform('solid_root_knot');
  }

  private fixture(kind: FixtureDef['kind']): Placed | null {
    const p = this.sim.places.fixtures(kind)[0];
    return p ? { x: p.x, fixture: p.fixture } : null;
  }

  /** Is the depths open and awake (someone is watching it, or nobody watches anything)? */
  private live(): boolean {
    return this.sim.barriers.isOpen(DEPTHS) && !this.sim.isAreaAsleep(DEPTHS);
  }

  /** Where the ant hill's doorway is (world m), or null. */
  hillDoor(): { x: number; y: number } | null {
    const hill = this.fixture('ant_hill');
    return hill ? { x: hill.x, y: hill.fixture.y - 0.35 } : null;
  }

  /** Is the root knot still in the way? */
  get rootStuck(): boolean {
    return !this.sim.secrets.includes('secret_root_pull');
  }

  /** Is the queen dancing right now? */
  get queenDancing(): boolean {
    const t = this.state.queenDance;
    return t >= 0 && this.sim.tick - t < QUEEN_DANCE;
  }

  // --- Per step ------------------------------------------------------------

  update(): void {
    const tick = this.sim.tick;
    if (this.state.sugar) this.carrySugar();
    else if (tick % 15 === 0 && !this.sim.barriers.isOpen(DEPTHS)) this.sugarRule();
    if (!this.live()) {
      this.riding.clear();
      if (tick % 30 === 0) this.congaRule();
      return;
    }
    this.conveyor();
    if (tick % 15 === 0) {
      this.queenRule();
      this.rootRule();
    }
    if (tick % 30 === 0) {
      this.congaRule();
      this.pantryRule();
    }
  }

  /** A sugar cube the player left near the hill: the ants come for it. */
  private sugarRule(): void {
    const sim = this.sim;
    const door = this.hillDoor();
    if (!door || sim.isAreaAsleep(sim.areaOf(door.x).id)) return;
    for (const e of sim.entities.ofKind('item')) {
      if (e.defId !== 'item_sugar_cube') continue;
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
      // Only the player's sugar: the plaza's own cube waits to be carried over.
      if (!sim.hasTag(e.id, 'tag_player_setup')) continue;
      const s = sim.physics.getState(e.id);
      if (Math.abs(s.x - door.x) > SUGAR_REACH) continue;
      const bottom = s.y + sim.halfHeight(e);
      if (bottom < sim.surfaceY(s.x) - 0.6 || Math.hypot(s.vx, s.vy) > 1.5) continue;
      sim.physics.setActive(e.id, false);
      this.state.sugar = { id: e.id, at: sim.tick, x: s.x, y: s.y };
      sim.events.emit('ants_took_sugar', { id: e.id, x: s.x, y: s.y });
      return;
    }
  }

  /** The ants march the cube up the hill and in; then the hole crumbles wide. */
  private carrySugar(): void {
    const sim = this.sim;
    const c = this.state.sugar!;
    const door = this.hillDoor();
    const e = sim.entities.get(c.id);
    if (!door || !e) {
      this.state.sugar = null;
      return;
    }
    const u = Math.min(1, (sim.tick - c.at) / SUGAR_CARRY);
    // Up in the ants' arms, not in the world (waking the plaza must not drop it).
    if (sim.physics.isActive(c.id)) sim.physics.setActive(c.id, false);
    if (u < 1) {
      // Along the ground first, then up the mound's side to the door.
      const k = u * u * (3 - 2 * u);
      const x = c.x + (door.x - c.x) * k;
      const lift = Math.max(0, (k - 0.55) / 0.45);
      const y = c.y + (door.y - c.y) * lift + Math.sin(u * Math.PI * 9) * 0.02;
      sim.physics.place(c.id, x, y, Math.sin(u * 20) * 0.15);
      return;
    }
    this.state.sugar = null;
    sim.remove(c.id);
    sim.events.emit('ant_hill_opened', { x: door.x, y: door.y });
    sim.barriers.unlock(DEPTHS, door.x, door.y);
  }

  /** The ant line passes small things to the left, into the pantry. */
  private conveyor(): void {
    const sim = this.sim;
    const line = this.fixture('ant_conveyor');
    if (!line) return;
    const half = (line.fixture.w ?? 6) / 2;
    const top = line.fixture.y;
    for (const e of sim.entities.all()) {
      if (e.kind !== 'item' || sim.isSleeping(e.id) || !sim.physics.isActive(e.id)) continue;
      if (sim.physics.grabbed === e.id || e.pinned) {
        this.riding.delete(e.id);
        continue;
      }
      const s = sim.physics.getState(e.id);
      const ext = halfExtents(sim.content.items.get(e.defId).shape, s.angle);
      const on =
        Math.abs(s.x - line.x) <= half &&
        Math.abs(s.y + ext.h - top) < 0.18 &&
        ext.w <= CONVEYOR_MAX &&
        ext.h <= CONVEYOR_MAX;
      if (!on) {
        this.riding.delete(e.id);
        continue;
      }
      if (!this.riding.has(e.id)) {
        this.riding.add(e.id);
        sim.events.emit('conveyor_took', { id: e.id, defId: e.defId, x: s.x, y: s.y });
      }
      sim.physics.setVelocity(e.id, -CONVEYOR_SPEED, Math.min(s.vy, 0.2));
    }
  }

  /** Something sweet by the throne: the queen eats it, dances, and the colony cheers. */
  private queenRule(): void {
    const sim = this.sim;
    const queen = this.fixture('ant_queen');
    if (!queen) return;
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || !sim.physics.isActive(e.id) || sim.physics.grabbed === e.id) continue;
      if (!sim.hasTag(e.id, 'tag_sweet') || !sim.hasTag(e.id, 'tag_edible')) continue;
      const s = sim.physics.getState(e.id);
      if (Math.abs(s.x - queen.x) > QUEEN_REACH || s.y < queen.fixture.y - 1.3 || s.y > 9.3) continue;
      if (Math.hypot(s.vx, s.vy) > 3) continue;
      this.feedQueen(e, queen);
      return;
    }
  }

  private feedQueen(e: Entity, queen: Placed): void {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    sim.remove(e.id);
    this.state.queenFed++;
    this.state.queenDance = sim.tick;
    const first = sim.findSecret('secret_queen_sweet', queen.x, queen.fixture.y - 0.6);
    sim.events.emit('queen_fed', { defId: e.defId, x: s.x, y: s.y, first });
    // The colony cheers, and any bug down here joins in.
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id)) continue;
      if (sim.areaOf(sim.physics.getState(bug.id).x).id !== DEPTHS) continue;
      sim.reactBug(bug, 'cheer');
    }
    if (!first || !sim.content.items.has('item_acc_monocle')) return;
    // Her gift: she pulls the monocle from her eye and tosses it to the player.
    const gift = sim.spawn('item', 'item_acc_monocle', queen.x + 0.7, queen.fixture.y - 0.4);
    sim.physics.setVelocity(gift.id, 2.2, -4.5);
    sim.events.emit('queen_gave', { id: gift.id, defId: gift.defId, x: queen.x, y: queen.fixture.y });
  }

  /** A big bug at the root knot: it heaves, and the root comes free. */
  private rootRule(): void {
    const sim = this.sim;
    if (!this.rootStuck || !sim.canFind('secret_root_pull')) return;
    const knot = this.fixture('root_knot');
    if (!knot) return;
    const area = sim.content.areas.get(DEPTHS);
    const box = area.solids?.find((s) => s.id === 'solid_root_knot')?.box;
    if (!box) return;
    const x0 = area.xStart + box[0];
    const x1 = area.xStart + box[2];
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id) || sim.physics.grabbed === bug.id) continue;
      const def = sim.bugDef(bug);
      const big = def.size === 'large' || !!sim.potions.has(bug, 'giant');
      if (!big) continue;
      const s = sim.physics.getState(bug.id);
      const r = sim.halfHeight(bug);
      const touching = s.x + r >= x0 - ROOT_TOUCH && s.x - r <= x1 + ROOT_TOUCH && s.y + r > box[1];
      if (!touching) continue;
      this.pullRoot(bug, knot, x1);
      return;
    }
  }

  private pullRoot(bug: Entity, knot: Placed, behind: number): void {
    const sim = this.sim;
    sim.physics.removePlatform('solid_root_knot');
    sim.events.emit('root_pulled', { id: bug.id, defId: bug.defId, x: knot.x, y: knot.fixture.y });
    sim.reactBug(bug, 'cheer');
    // Behind it, something shiny: the gnome's nose.
    const have = sim.entities.ofKind('item').some((e) => e.defId === 'item_gnome_nose');
    if (sim.content.items.has('item_gnome_nose') && !have) {
      const x = behind + 0.9;
      const nose = sim.spawn('item', 'item_gnome_nose', x, sim.surfaceY(x) - 0.4);
      sim.physics.setVelocity(nose.id, -0.6, -2);
    }
    sim.findSecret('secret_root_pull', knot.x, knot.fixture.y);
  }

  /**
   * Music through the bluebell speakers while the player is down here: the
   * sequencer has a pattern, and a speaker is not muted. The ants conga.
   */
  private congaRule(): void {
    const sim = this.sim;
    const f = sim.focus;
    const here = !!f && sim.areaOf((f.x0 + f.x1) / 2).id === DEPTHS && sim.barriers.isOpen(DEPTHS);
    const seq = sim.places.sequencerLayout() !== null && !isEmpty(playingRows(sim.places.sequencer));
    const bells = sim.places.fixtures('bluebell');
    const speakers = bells.some((b) => !sim.places.state.muted.includes(b.fixture.id));
    const conga = here && seq && speakers;
    if (conga && !this.state.conga) {
      const line = this.fixture('ant_conveyor');
      const x = line?.x ?? (f ? (f.x0 + f.x1) / 2 : 0);
      sim.events.emit('ants_conga', { x, y: line?.fixture.y ?? 6 });
      sim.findSecret('secret_ant_conga', x, 5);
    }
    this.state.conga = conga;
  }

  /** At night, with the ants asleep, the map scrap shows on top of the pantry's pile. */
  private pantryRule(): void {
    const sim = this.sim;
    if (!sim.weather.night || !sim.canFind('secret_map_scrap_2')) return;
    const pantry = this.fixture('ant_pantry');
    const f = sim.focus;
    if (!pantry || !f || pantry.x < f.x0 || pantry.x > f.x1) return;
    if (!sim.content.items.has('item_map_scrap_2')) return;
    if (!sim.entities.ofKind('item').some((e) => e.defId === 'item_map_scrap_2')) {
      const scrap = sim.spawn('item', 'item_map_scrap_2', pantry.x + 0.2, pantry.fixture.y - 0.75);
      sim.physics.setVelocity(scrap.id, 0, 0.5);
    }
    sim.events.emit('pantry_scrap_found', { x: pantry.x, y: pantry.fixture.y - 0.6 });
    sim.findSecret('secret_map_scrap_2', pantry.x, pantry.fixture.y - 0.6);
  }

  // --- Clicks --------------------------------------------------------------

  poke(f: { id: string; kind: FixtureDef['kind']; x: number; y: number }): boolean {
    const sim = this.sim;
    switch (f.kind) {
      case 'ant_hill':
        sim.events.emit('ant_hill_poked', { x: f.x, y: f.y, open: sim.barriers.isOpen(DEPTHS) });
        return true;
      case 'larva':
        sim.events.emit('larva_wiggled', { fixture: f.id, x: f.x, y: f.y });
        return true;
      case 'ant_queen':
        sim.events.emit('queen_poked', { x: f.x, y: f.y });
        return true;
      case 'root_knot':
        sim.events.emit('root_poked', { x: f.x, y: f.y, stuck: this.rootStuck });
        return true;
      case 'depths_door':
        return true;
      default:
        return false;
    }
  }
}
