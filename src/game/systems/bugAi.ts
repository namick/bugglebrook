import type { Rng } from '../core/rng';
import type { BugBrain, Entity } from '../core/entities';
import type { BugDef } from '../data/types';
import type { BodyState } from '../physics/physics';

export interface BugContext {
  def: BugDef;
  state: BodyState;
  held: boolean;
  supported: boolean;
  worldWidth: number;
  rng: Rng;
}

export interface BugDecision {
  /** Horizontal velocity to set, or null to leave physics alone. */
  vx: number | null;
  /** Upward hop impulse per unit mass (m/s), or 0. */
  hop: number;
}

const IDLE_MIN = 45;
const IDLE_MAX = 180;
const DIZZY_TICKS = 120;
const WANDER_RANGE = 5;
const ARRIVE_DISTANCE = 0.15;
const TUMBLE_SPEED = 3.5;

export function newBugBrain(x: number): BugBrain {
  return { mode: 'idle', timer: 30, targetX: x, facing: 1 };
}

/**
 * One tick of bug behavior: a small state machine that wanders, stops,
 * tumbles when flung, and gets dizzy after a hard landing. Mutates `brain`
 * and returns what the bug wants physics to do.
 */
export function updateBug(entity: Entity, ctx: BugContext): BugDecision {
  const brain = entity.bug;
  if (!brain) return { vx: null, hop: 0 };
  const { def, state, rng } = ctx;
  const speed = Math.hypot(state.vx, state.vy);

  if (ctx.held) {
    brain.mode = 'held';
    return { vx: null, hop: 0 };
  }

  if (brain.mode === 'held' || (brain.mode !== 'dizzy' && !ctx.supported && speed > TUMBLE_SPEED)) {
    brain.mode = 'tumble';
  }

  switch (brain.mode) {
    case 'tumble':
      if (ctx.supported && speed < 0.5) enterIdle(brain, rng, def);
      return { vx: null, hop: 0 };

    case 'dizzy':
      brain.timer--;
      if (brain.timer <= 0) enterIdle(brain, rng, def);
      return { vx: ctx.supported ? state.vx * 0.8 : null, hop: 0 };

    case 'idle':
      brain.timer--;
      if (brain.timer <= 0 && ctx.supported) {
        const margin = def.radius + 0.5;
        const lo = Math.max(margin, state.x - WANDER_RANGE);
        const hi = Math.min(ctx.worldWidth - margin, state.x + WANDER_RANGE);
        brain.targetX = rng.range(lo, hi);
        brain.mode = 'walk';
      }
      return { vx: ctx.supported ? state.vx * 0.7 : null, hop: 0 };

    case 'walk': {
      const dx = brain.targetX - state.x;
      if (Math.abs(dx) < ARRIVE_DISTANCE) {
        enterIdle(brain, rng, def);
        return { vx: 0, hop: 0 };
      }
      brain.facing = dx > 0 ? 1 : -1;
      if (!ctx.supported) return { vx: null, hop: 0 };
      // Bouncy bugs sometimes hop while walking.
      const hop = rng.chance(0.01 * def.traits.bouncy) ? 4 : 0;
      return { vx: brain.facing * def.speed, hop };
    }
  }
}

function enterIdle(brain: BugBrain, rng: Rng, def: BugDef): void {
  brain.mode = 'idle';
  // Restless bugs rest less.
  const scale = 1.5 - def.traits.restless;
  brain.timer = Math.round(rng.int(IDLE_MIN, IDLE_MAX) * scale);
}

export function makeDizzy(brain: BugBrain): void {
  brain.mode = 'dizzy';
  brain.timer = DIZZY_TICKS;
}
