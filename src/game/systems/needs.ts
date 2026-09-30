import type { BugBrain, BugMode, Needs } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { Rng } from '../core/rng';
import type { BugDef, NeedId } from '../data/types';
import { NEED_IDS } from '../data/types';
import type { Mood } from '../events';

/**
 * The five needs (game design doc, section 5). Each runs 0 to 100, where 100
 * is fully satisfied. Needs only drive behavior: nothing bad happens at 0.
 */

/** Base decay per second. Energy uses the day rate until the clock arrives in M6. */
export const DECAY: Readonly<Record<NeedId, number>> = {
  need_hunger: 0.25,
  need_fun: 0.3,
  need_energy: 0.1,
  need_social: 0.18,
  need_clean: 0.02,
};

/** Energy regained per second asleep. */
export const SLEEP_ENERGY = 1.5;
/** Energy regained per second while resting (standing about, chewing, riding). */
export const REST_ENERGY = 0.05;
/** Extra energy spent per second while walking, hopping, and playing. */
export const MOVE_ENERGY = 0.08;
/** Social regained per second while napping next to a friend (a nap pile). */
export const PILE_SOCIAL = 0.3;

const RESTING: ReadonlySet<BugMode> = new Set([
  'st_idle',
  'st_eat',
  'st_recover',
  'st_landing',
  'st_react',
  'st_hide',
  'st_ride',
  'st_perform',
  'st_use',
]);
const MOVING: ReadonlySet<BugMode> = new Set(['st_wander', 'st_seek', 'st_swim', 'st_airborne']);

/** Starting needs for a new bug: comfortable, a little different for each. */
export function freshNeeds(rng: Rng): Needs {
  return {
    need_hunger: Math.round(rng.range(55, 90)),
    need_fun: Math.round(rng.range(55, 90)),
    need_energy: Math.round(rng.range(55, 90)),
    need_social: Math.round(rng.range(55, 85)),
    need_clean: Math.round(rng.range(80, 100)),
  };
}

const clamp = (v: number): number => Math.min(100, Math.max(0, v));

/** Add need changes, keeping every need within 0 to 100. */
export function addNeeds(needs: Needs, deltas: Readonly<Partial<Record<NeedId, number>>>): void {
  for (const need of NEED_IDS) {
    const d = deltas[need];
    if (d) needs[need] = clamp(needs[need] + d);
  }
}

/**
 * Advance a bug's needs by `ticks` steps: every need decays at its base rate
 * times the bug's weight; sleeping and resting refill energy; moving spends a
 * little more. `pile` is true while napping next to a friend.
 */
export function decayNeeds(brain: BugBrain, def: BugDef, ticks = 1, pile = false): void {
  const seconds = ticks / SIM_HZ;
  const n = brain.needs;
  const asleep = brain.mode === 'st_sleep';
  for (const need of NEED_IDS) {
    if (asleep && need === 'need_energy') continue;
    n[need] = clamp(n[need] - DECAY[need] * def.needWeights[need] * seconds);
  }
  if (brain.mode === 'st_sleep') {
    // Sleeping bugs don't get hungry or bored as fast.
    n.need_hunger = clamp(n.need_hunger + DECAY.need_hunger * def.needWeights.need_hunger * seconds * 0.5);
    n.need_fun = clamp(n.need_fun + DECAY.need_fun * def.needWeights.need_fun * seconds * 0.8);
    n.need_energy = clamp(n.need_energy + SLEEP_ENERGY * seconds);
    if (pile) n.need_social = clamp(n.need_social + PILE_SOCIAL * seconds);
  } else if (RESTING.has(brain.mode)) n.need_energy = clamp(n.need_energy + REST_ENERGY * seconds);
  else if (MOVING.has(brain.mode) || brain.mode === 'st_social')
    n.need_energy = clamp(n.need_energy - MOVE_ENERGY * def.needWeights.need_energy * seconds);
}

/** How badly a need wants filling: 0 when full, 100 when empty. */
export function urgency(value: number): number {
  const lack = Math.min(100, Math.max(0, 100 - value)) / 100;
  return lack * lack * 100;
}

/** The lowest need and its value. */
export function lowestNeed(needs: Needs): [NeedId, number] {
  let best: [NeedId, number] = ['need_hunger', needs.need_hunger];
  for (const need of NEED_IDS) if (needs[need] < best[1]) best = [need, needs[need]];
  return best;
}

/**
 * Mood from needs and recent events (game design doc, section 5): grumpy
 * for a while after something annoying, then sleepy, hungry, bored, happy
 * (average of all five at least 65 and none under 25), or content.
 */
export function moodOf(brain: BugBrain, tick: number): Mood {
  const n = brain.needs;
  if (tick < brain.grumpyUntil) return 'mood_grumpy';
  if (n.need_energy < 20) return 'mood_sleepy';
  if (n.need_hunger < 25) return 'mood_hungry';
  if (n.need_fun < 25) return 'mood_bored';
  let sum = 0;
  let low = false;
  for (const need of NEED_IDS) {
    sum += n[need];
    if (n[need] < 25) low = true;
  }
  return sum / NEED_IDS.length >= 65 && !low ? 'mood_happy' : 'mood_content';
}
