import { VIEW_WIDTH_M } from '../constants';
import type { Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import { Rng } from '../core/rng';
import type { RngState } from '../core/rng';
import type { Sim } from '../sim';
import { halfExtents } from '../simShared';
import { JUNK_BLOB, awayFromHome, builtLinked, ownership } from './trash';

/**
 * Tidying up (playtest F2), on top of the trash can.
 *
 * - The tidy whistle: a click blows it, and every loose thing in view that
 *   has wandered from home swooshes back there, one after another. Junk
 *   blobs swoosh into the trash can and come apart. The player's builds,
 *   and anything touching them, stay put.
 * - Slow tidying, nobody's doing: small litter in an area nobody has looked
 *   at for a few minutes drifts home, one thing at a time; rain and wind
 *   nudge small litter out in the open a hop toward home. Neither touches
 *   anything the player has touched lately (`tag_player_setup`).
 * - A cap on junk blobs: past four loose in one area, the oldest goes into
 *   the trash can.
 *
 * Its dice are its own (`world.tidy.rng`), so tidying never shifts the bugs'.
 */

/** Plain JSON, saved as `world.tidy`. */
export interface TidyState {
  /** Things on their way home, and the tick each goes. */
  queue: { id: EntityId; to: 'home' | 'can'; cause: 'whistle' | 'cap'; at: number }[];
  /** Times the whistle was blown. */
  blown: number;
  rng: RngState;
}

/** Things nearer home than this (m) are home already. */
export const HOME_NEAR = 2.5;
/** The whistle sends at most this many things home at once. */
export const WHISTLE_MAX = 30;
/** The first thing leaves this long after the toot, and the rest this far apart (ticks). */
export const WHISTLE_DELAY = 18;
export const WHISTLE_GAP = 5;
/** Litter no bigger than this across (m, a twig) drifts, gets nudged, and counts as clutter. */
export const LITTER_SIZE = 1.35;
/** An area nobody has looked at for this long starts tidying itself. */
export const DRIFT_AFTER = 3 * 60 * SIM_HZ;
/** Then one thing in it drifts home this often. */
export const DRIFT_EVERY = 20 * SIM_HZ;
/** Rain and wind nudge litter this often, each thing with this chance. */
export const NUDGE_EVERY = SIM_HZ;
export const NUDGE_CHANCE = 0.12;
/** Things lighter than this (kg) get nudged. */
export const NUDGE_MASS = 0.12;
/** More loose junk blobs than this in one area, and the oldest goes in the trash can. */
export const JUNK_CAP = 4;
const CAP_EVERY = 2 * SIM_HZ;
/** Bugs this close to the whistle look round at it. */
const HEAR_RANGE = 8;

export function newTidyState(seed: string): TidyState {
  return { queue: [], blown: 0, rng: new Rng(`${seed}-tidy`).getState() };
}

export class Tidy {
  state: TidyState;
  private rng: Rng;
  /** When each area fell asleep (nobody looking). Not saved: areas wake on load. */
  private readonly asleepSince = new Map<string, number>();

  constructor(private readonly sim: Sim) {
    this.state = newTidyState(sim.seed);
    this.rng = Rng.fromState(this.state.rng);
  }

  restore(state: TidyState): void {
    this.state = state;
    this.rng = Rng.fromState(state.rng);
  }

  serialize(): TidyState {
    this.state.rng = this.rng.getState();
    return JSON.parse(JSON.stringify(this.state)) as TidyState;
  }

  private mouthCache: { tick: number; ids: ReadonlyMap<EntityId, EntityId> } | null = null;

  /** Things in bugs' mouths this tick. */
  private mouths(): ReadonlyMap<EntityId, EntityId> {
    if (this.mouthCache?.tick !== this.sim.tick)
      this.mouthCache = { tick: this.sim.tick, ids: this.sim.mouthOwners() };
    return this.mouthCache.ids;
  }

  /** Is this thing loose: in the world, not held, carried, eaten, or pinned? */
  private loose(e: Entity): boolean {
    const sim = this.sim;
    if (e.kind !== 'item' || e.pinned || sim.isPocketed(e.id) || sim.physics.grabbed === e.id) return false;
    if (sim.carried.has(e.id) || this.mouths().has(e.id)) return false;
    return sim.physics.has(e.id);
  }

  private small(e: Entity): boolean {
    const def = this.sim.content.items.get(e.defId);
    const ext = halfExtents(def.shape, 0);
    return !def.unpocketable && Math.max(ext.w, ext.h) * 2 * this.sim.potions.scaleOf(e) <= LITTER_SIZE;
  }

  /**
   * Where the whistle sends this thing: home (a world thing away from home),
   * the trash can (a junk blob), or nowhere (null).
   */
  whistleTarget(e: Entity, built: ReadonlySet<EntityId>): 'home' | 'can' | null {
    const sim = this.sim;
    if (!this.loose(e) || built.has(e.id)) return null;
    const def = sim.content.items.get(e.defId);
    if (def.whistle || def.unpocketable) return null;
    if (e.defId === JUNK_BLOB) return sim.trash.cans().length > 0 ? 'can' : null;
    // Toys, hats, and potions the player made stay where they were left.
    if (ownership(def, e.parts, sim.content) !== 'world') return null;
    if (sim.trash.refusal(e, built) !== null) return null;
    const away = this.away(e);
    return away !== null && away > HOME_NEAR ? 'home' : null;
  }

  /**
   * Litter, as slow tidying sees it: a small world thing away from home that
   * the player has not touched lately and that no setup leans on.
   */
  litter(e: Entity, linked: ReadonlySet<EntityId>): boolean {
    const sim = this.sim;
    if (!this.loose(e) || !this.small(e) || sim.setup.has(e.id) || linked.has(e.id)) return false;
    const def = sim.content.items.get(e.defId);
    if (ownership(def, e.parts, sim.content) !== 'world') return false;
    const away = this.away(e);
    return away !== null && away > HOME_NEAR;
  }

  /**
   * How far a thing is from its nearest home in an open area, or null: no
   * home, or it lies behind a shut barrier (tidying never crosses one).
   */
  private away(e: Entity): number | null {
    const sim = this.sim;
    const x = sim.physics.getState(e.id).x;
    if (!sim.barriers.isOpen(sim.areaOf(x).id)) return null;
    return awayFromHome(sim.content, e.defId, x, (a) => sim.barriers.isOpen(a));
  }

  /** The whistle's click: a toot, and everything in view that wandered heads home. */
  blow(whistle: Entity): void {
    const sim = this.sim;
    const s = sim.physics.getState(whistle.id);
    this.state.blown++;
    let count = 0;
    if (this.state.queue.length === 0) {
      const view = sim.focus ?? { x0: s.x - VIEW_WIDTH_M / 2, x1: s.x + VIEW_WIDTH_M / 2 };
      const built = builtLinked(sim);
      for (const e of sim.entities.ofKind('item')) {
        if (count >= WHISTLE_MAX || e.id === whistle.id || sim.isSleeping(e.id)) continue;
        const x = sim.physics.getState(e.id).x;
        if (x < view.x0 || x > view.x1) continue;
        const to = this.whistleTarget(e, built);
        if (!to) continue;
        this.state.queue.push({
          id: e.id,
          to,
          cause: 'whistle',
          at: sim.tick + WHISTLE_DELAY + count * WHISTLE_GAP,
        });
        count++;
      }
    }
    sim.events.emit('whistle_blown', { id: whistle.id, count, x: s.x, y: s.y });
    // Bugs nearby jump and look round.
    for (const bug of sim.entities.ofKind('bug')) {
      if (!bug.bug || bug.bug.pending || sim.isSleeping(bug.id) || bug.bug.mode === 'st_sleep') continue;
      const b = sim.physics.getState(bug.id);
      if (Math.abs(b.x - s.x) > HEAR_RANGE) continue;
      sim.reactBug(bug, 'wow');
    }
  }

  update(): void {
    const sim = this.sim;
    this.runQueue();
    if (sim.tick % 15 === 0) this.noteSleep();
    if (sim.tick % DRIFT_EVERY === 0) this.drift();
    if (sim.tick % NUDGE_EVERY === 0) this.nudge();
    if (sim.tick % CAP_EVERY === 0) this.cap();
  }

  /** Send what is due on its way. A thing picked up or eaten meanwhile stays. */
  private runQueue(): void {
    const sim = this.sim;
    while (this.state.queue.length > 0 && this.state.queue[0]!.at <= sim.tick) {
      const job = this.state.queue.shift()!;
      const e = sim.entities.get(job.id);
      if (!e || !this.loose(e)) continue;
      if (job.to === 'can') this.toCan(e, job.cause);
      else this.sendHome(e, job.cause);
    }
  }

  /** Off it goes into the trash can, which eats it. */
  private toCan(e: Entity, cause: 'whistle' | 'cap'): void {
    const sim = this.sim;
    const can = sim.trash.cans()[0];
    if (!can) return;
    const s = sim.physics.getState(e.id);
    const r = sim.trash.rim(can);
    sim.events.emit('item_tidied', {
      id: e.id,
      defId: e.defId,
      to: 'can',
      cause,
      fromX: s.x,
      fromY: s.y,
      x: r.x,
      y: r.y,
    });
    sim.trash.swallow(e, can, 'tidy');
  }

  /** Home it goes: it leaves where it is and drops in over its home spot. */
  sendHome(e: Entity, cause: 'whistle' | 'cap' | 'drift'): void {
    const sim = this.sim;
    const s = sim.physics.getState(e.id);
    const x = sim.trash.homeFor(e.defId, s.x);
    const spot = sim.trash.landing(x, sim.halfHeight(e), !!sim.content.items.get(e.defId).shatters);
    sim.bringBack(e, spot.x, spot.y);
    sim.events.emit('item_tidied', {
      id: e.id,
      defId: e.defId,
      to: 'home',
      cause,
      fromX: s.x,
      fromY: s.y,
      x: spot.x,
      y: spot.y,
    });
  }

  private noteSleep(): void {
    const sim = this.sim;
    for (const area of sim.content.areas.all) {
      const asleep = sim.isAreaAsleep(area.id);
      if (!asleep) this.asleepSince.delete(area.id);
      else if (!this.asleepSince.has(area.id)) this.asleepSince.set(area.id, sim.tick);
    }
  }

  /** In each area nobody has looked at for a while, one bit of litter drifts home. */
  private drift(): void {
    const sim = this.sim;
    const due = sim.content.areas.all.filter((a) => {
      const since = this.asleepSince.get(a.id);
      return since !== undefined && sim.tick - since >= DRIFT_AFTER;
    });
    if (due.length === 0) return;
    const linked = sim.setupLinked();
    for (const area of due) {
      const e = sim.entities.ofKind('item').find((i) => {
        if (!sim.isSleeping(i.id) || sim.isPocketed(i.id)) return false;
        const x = sim.physics.getState(i.id).x;
        return x >= area.xStart && x < area.xEnd && this.litter(i, linked);
      });
      if (e) this.sendHome(e, 'drift');
    }
  }

  /** Rain and wind out in the open skitter light litter a hop toward home. */
  private nudge(): void {
    const sim = this.sim;
    const wind = sim.environment.state.wind;
    const rain = sim.weather.raining;
    if (!rain && wind === 0) return;
    const linked = sim.setupLinked();
    for (const e of sim.entities.ofKind('item')) {
      if (sim.isSleeping(e.id) || !this.litter(e, linked)) continue;
      const s = sim.physics.getState(e.id);
      if (Math.hypot(s.vx, s.vy) > 0.2 || !sim.outdoors(s.x, s.y)) continue;
      if (sim.physics.mass(e.id) > NUDGE_MASS || sim.environment.submerged.get(e.id)) continue;
      // Resting on the ground, not on a shelf or a pile.
      if (s.y < sim.surfaceY(s.x) - sim.halfHeight(e) - 0.15) continue;
      const home = sim.trash.homeFor(e.defId, s.x);
      const dir: 1 | -1 = home >= s.x ? 1 : -1;
      // The wind helps only the way it blows.
      const cause = rain ? 'rain' : 'wind';
      if (!rain && Math.sign(wind) !== dir) continue;
      if (!this.rng.chance(NUDGE_CHANCE)) continue;
      // Never toward the player's things.
      if (sim.setupNearExcept(s.x + dir * 0.8, 0.6, e.id)) continue;
      sim.physics.setVelocity(e.id, dir * 1.3, -1.4);
      sim.events.emit('litter_nudged', { id: e.id, dir, cause, x: s.x, y: s.y });
    }
  }

  /** Too many junk blobs lying about one area: the oldest goes in the trash can. */
  private cap(): void {
    const sim = this.sim;
    if (sim.trash.cans().length === 0) return;
    const queued = new Set(this.state.queue.map((j) => j.id));
    const built = builtLinked(sim);
    for (const area of sim.content.areas.all) {
      const blobs = sim.entities.ofKind('item').filter((e) => {
        if (e.defId !== JUNK_BLOB || !this.loose(e) || queued.has(e.id)) return false;
        const x = sim.physics.getState(e.id).x;
        return x >= area.xStart && x < area.xEnd;
      });
      if (blobs.length <= JUNK_CAP) continue;
      const oldest = blobs.find((b) => !built.has(b.id));
      if (oldest) this.state.queue.push({ id: oldest.id, to: 'can', cause: 'cap', at: sim.tick });
    }
  }

  /** Is the whistle's work still going (things queued to go home)? */
  get busy(): boolean {
    return this.state.queue.length > 0;
  }
}
