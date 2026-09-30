import type { BugBrain, CoarsePlan, Entity, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { AreaDef, BugDef } from '../data/types';
import type { Sim } from '../sim';
import { likingOf } from './bugAi';
import { enter, enterIdle } from './bugMove';
import { addNeeds, decayNeeds } from './needs';

/**
 * Off-screen simulation (game design doc, section 5). Bugs in a sleeping
 * area skip physics and run a cheap tick every 2 s: their needs decay, and
 * each picks a coarse plan (sleep here, go and eat, play at a toy, visit a
 * friend, head home) and walks it at 0.6 m/s. When the area wakes, each bug
 * is put somewhere plausible, already doing its plan, never frozen mid-fling.
 */
export const COARSE_TICKS = 2 * SIM_HZ;
/** Coarse walking speed: 60 px/s. */
export const COARSE_SPEED = 0.6;
const STEP = COARSE_SPEED * (COARSE_TICKS / SIM_HZ);
const FOOD_DELTA = { loved: 60, liked: 40, neutral: 20, disliked: 0 } as const;

/** Modes that make sense to find a bug in when you come back. */
export const PLAUSIBLE: ReadonlySet<string> = new Set([
  'st_idle',
  'st_wander',
  'st_seek',
  'st_sleep',
  'st_use',
]);

export class OffScreen {
  constructor(private readonly sim: Sim) {}

  /** Run the coarse tick for every bug whose area sleeps. */
  update(): void {
    const sim = this.sim;
    if (sim.tick % COARSE_TICKS !== 0) return;
    for (const bug of sim.entities.ofKind('bug')) {
      if (!sim.isSleeping(bug.id) || !bug.bug) continue;
      this.coarse(bug, bug.bug);
    }
  }

  private coarse(bug: Entity, brain: BugBrain): void {
    const sim = this.sim;
    const def = sim.content.bugs.get(bug.defId);
    this.settle(bug, brain, def);
    decayNeeds(brain, def, COARSE_TICKS);
    if (brain.mode === 'st_sleep') {
      if (brain.needs.need_energy >= 99.5) {
        enterIdle(brain, sim.rng, def);
        brain.plan = null;
      }
      return;
    }
    const at = brain.plan?.at ?? sim.physics.getState(bug.id).x;
    const plan = brain.plan ?? this.pick(bug, brain, def, at);
    brain.plan = plan;
    const d = plan.x - plan.at;
    if (Math.abs(d) > STEP) {
      plan.at += Math.sign(d) * STEP;
      this.place(bug, def, plan.at);
      return;
    }
    plan.at = plan.x;
    this.place(bug, def, plan.at);
    this.arrive(bug, brain, def, plan);
  }

  /** Whatever it was in the middle of when the area fell asleep settles down. */
  private settle(bug: Entity, brain: BugBrain, def: BugDef): void {
    const sim = this.sim;
    if (PLAUSIBLE.has(brain.mode) && brain.social === null && brain.carrying === null) return;
    const s = sim.physics.getState(bug.id);
    if (brain.mouthful !== null) {
      // Finish the meal.
      const food = sim.entities.get(brain.mouthful);
      if (food) {
        const liking = likingOf(def, food.defId);
        if (liking !== 'disliked') {
          addNeeds(brain.needs, { need_hunger: FOOD_DELTA[liking] });
          sim.remove(food.id);
        }
      }
      brain.mouthful = null;
    }
    if (brain.carrying !== null) sim.putDown(bug.id, true);
    brain.social = null;
    brain.gliding = false;
    let x = s.x;
    if (def.swim !== 'skate' && sim.environment.overOpenWater(x)) x = sim.environment.shoreFrom(x) ?? x;
    enterIdle(brain, sim.rng, def);
    brain.plan = { kind: 'rest', at: x, x, targetId: null };
    this.place(bug, def, x);
  }

  /** Decide what to do next, the way the full AI would, only coarser. */
  private pick(bug: Entity, brain: BugBrain, def: BugDef, at: number): CoarsePlan {
    const sim = this.sim;
    const n = brain.needs;
    const area = sim.areaOf(at);
    const home = sim.content.areas.tryGet(def.home);
    if (n.need_energy < 45) {
      enter(brain, 'st_sleep');
      return { kind: 'sleep', at, x: at, targetId: null };
    }
    const inArea = (id: EntityId): boolean => {
      const x = sim.physics.getState(id).x;
      return x >= area.xStart && x < area.xEnd;
    };
    if (n.need_hunger < 40) {
      const food = this.nearest(at, (e) => {
        if (e.kind !== 'item' || !inArea(e.id)) return false;
        const item = sim.content.items.get(e.defId);
        return (
          item.adverts.some((a) => a.action === 'eat') &&
          likingOf(def, e.defId) !== 'disliked' &&
          !sim.hasTag(e.id, 'tag_player_setup') &&
          this.reachable(def, sim.physics.getState(e.id).x)
        );
      });
      if (food) return { kind: 'eat', at, x: sim.physics.getState(food.id).x, targetId: food.id };
    }
    if (n.need_fun < 40) {
      const toy = this.nearest(
        at,
        (e) =>
          e.kind === 'item' &&
          inArea(e.id) &&
          sim.content.items.get(e.defId).adverts.some((a) => a.action === 'bounce'),
      );
      if (toy) return { kind: 'play', at, x: sim.physics.getState(toy.id).x - 0.9, targetId: toy.id };
    }
    if (n.need_social < 40) {
      const friend = this.nearest(at, (e) => e.kind === 'bug' && e.id !== bug.id && inArea(e.id));
      if (friend) {
        const fx = friend.bug?.plan?.at ?? sim.physics.getState(friend.id).x;
        return { kind: 'visit', at, x: fx + (fx > at ? -1.2 : 1.2), targetId: friend.id };
      }
    }
    if (home && (at < home.xStart || at >= home.xEnd))
      return { kind: 'home', at, x: this.spotIn(home, def, sim.rng.range(0.3, 0.7)), targetId: null };
    const lo = Math.max(area.xStart + def.radius + 0.5, at - 6);
    const hi = Math.min(area.xEnd - def.radius - 0.5, at + 6);
    let x = sim.rng.range(lo, Math.max(lo, hi));
    if (!this.reachable(def, x)) x = at;
    return { kind: 'wander', at, x, targetId: null };
  }

  private arrive(bug: Entity, brain: BugBrain, def: BugDef, plan: CoarsePlan): void {
    const sim = this.sim;
    const target = plan.targetId === null ? undefined : sim.entities.get(plan.targetId);
    switch (plan.kind) {
      case 'eat':
        if (target && sim.physics.isActive(target.id) === false && sim.isSleeping(target.id)) {
          const liking = likingOf(def, target.defId);
          addNeeds(brain.needs, { need_hunger: FOOD_DELTA[liking] });
          sim.remove(target.id);
        }
        break;
      case 'play':
        if (target) addNeeds(brain.needs, { need_fun: 30, need_energy: -5 });
        break;
      case 'visit':
        if (target) addNeeds(brain.needs, { need_social: 25 });
        break;
      default:
        break;
    }
    brain.plan = null;
  }

  private nearest(x: number, keep: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.sim.entities.all()) {
      if (!keep(e)) continue;
      const d = Math.abs(this.sim.physics.getState(e.id).x - x);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  /** Can this bug stand at x? Non-skaters stay off open water. */
  private reachable(def: BugDef, x: number): boolean {
    return def.swim === 'skate' || !this.sim.environment.overOpenWater(x);
  }

  private spotIn(area: AreaDef, def: BugDef, t: number): number {
    const x = area.xStart + (area.xEnd - area.xStart) * t;
    return this.reachable(def, x) ? x : (this.sim.environment.shoreFrom(x) ?? x);
  }

  /** Move the sleeping body to x: on the ground, or on the water for a skater. */
  place(bug: Entity, def: BugDef, x: number): void {
    const sim = this.sim;
    const w = sim.environment.waterAt(x);
    const onWater = def.swim === 'skate' && w && sim.environment.overOpenWater(x);
    const y = onWater ? w.level - def.radius : sim.surfaceY(x) - def.radius - 0.02;
    sim.physics.place(bug.id, x, y, 0);
  }

  /**
   * The bug's area woke: carry on with the plan for real. A bug heading for
   * food or a toy picks up where it left off; a sleeper is still asleep.
   */
  wake(bug: Entity): void {
    const sim = this.sim;
    const brain = bug.bug;
    if (!brain) return;
    const def = sim.content.bugs.get(bug.defId);
    const plan = brain.plan;
    brain.plan = null;
    if (!plan) return;
    this.place(bug, def, plan.at);
    brain.lastX = plan.at;
    if (brain.mode === 'st_sleep') return;
    const target = plan.targetId === null ? undefined : sim.entities.get(plan.targetId);
    switch (plan.kind) {
      case 'eat':
      case 'play':
        if (target) {
          enter(brain, 'st_seek', 12 * SIM_HZ);
          brain.targetId = target.id;
          brain.action = plan.kind === 'eat' ? 'eat' : 'bounce';
          brain.targetX = plan.x;
          return;
        }
        break;
      case 'visit':
      case 'wander':
      case 'home':
        if (Math.abs(plan.x - plan.at) > 0.3) {
          enter(brain, 'st_wander', 12 * SIM_HZ);
          brain.targetX = plan.x;
          return;
        }
        break;
      default:
        break;
    }
    enterIdle(brain, sim.rng, def);
  }
}
