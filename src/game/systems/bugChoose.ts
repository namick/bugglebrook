// How a bug picks what to do next (game design doc, section 5): every
// advert it can see, scored, and the start of whatever it picks.

import type { BugBrain, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { AdvertAction, BugDef, NeedId } from '../data/types';
import { NEED_IDS } from '../data/types';
import type { Fidget } from '../events';
import type { AdvertCandidate, BugContext, BugDecision } from './bugTypes';
import { EMPTY_WORLD, SPOT_CAMERA, SPOT_SLEEP_HERE, SPOT_STAGE, SPOT_TOP, SPOT_WATER } from './bugTypes';
import { SEEK_TIMEOUT, enter, launch } from './bugMove';
import { available, endSocial } from './bugSocial';
import { addNeeds, moodOf, urgency } from './needs';
import { enterSleep, isSocial, likingOf, scoreAdvert } from './bugAi';
import { machineAdverts } from './bugMachines';
import { canPlay, musicAdverts } from './bugMusic';
import {
  IGNORED_TICKS,
  PERCEPTION,
  ROW_GAP,
  ROW_SLOTS,
  SCORE_FLOOR,
  SOCIAL_NEEDS,
  WANDER_RANGE,
} from './bugTuning';

/** An outing goes this far past the edge of home (m), about one wander in this many (%). */
const OUTING: readonly [number, number] = [2, 7];
const OUTING_PERCENT = 7;

/**
 * Is it time for an outing? Only a lively bug at ease (fun under 80,
 * energy over 50, in daylight and dry), on roughly one wander in 14. Worked
 * out from the tick and the bug's ID, so it takes no dice.
 */
function outingDue(brain: BugBrain, ctx: BugContext): boolean {
  const n = brain.needs;
  if (n.need_fun >= 80 || n.need_energy <= 50 || n.need_hunger < 40) return false;
  if (ctx.sky && (ctx.sky.dark || ctx.sky.raining || ctx.sky.evening)) return false;
  return (ctx.tick * 7 + (ctx.id ?? 0) * 31) % 100 < OUTING_PERCENT;
}

/** Is this bug napping right next to a sleeping friend? */
export function inPile(me: EntityId, x: number, def: BugDef, ctx: BugContext): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  return world
    .bugs()
    .some(
      (o) =>
        o.id !== me &&
        o.brain.mode === 'st_sleep' &&
        Math.abs(o.x - x) < def.radius + o.def.radius + 0.5 &&
        world.affinity(def.id, o.defId) > 0,
    );
}

/** The pebble row's free slots, from Rollo's resting spot outward. */
export function rowSlots(brain: BugBrain, ctx: BugContext): { free: number[]; filled: number[] } {
  const world = ctx.world ?? EMPTY_WORLD;
  const x0 = brain.restX + ctx.def.radius + 0.4;
  const y0 = world.surfaceY(x0);
  const free: number[] = [];
  const filled: number[] = [];
  const loose = world.loose();
  for (let k = 0; k < ROW_SLOTS; k++) {
    const x = x0 + k * ROW_GAP;
    if (Math.abs(world.surfaceY(x) - y0) > 0.06 || ctx.overWater?.(x)) break;
    // Keep well clear of the player's things, and of anything in the way.
    if (world.setupNear(x, y0 - 0.2, 1.2)) break;
    const here = loose.filter((l) => Math.abs(l.x - x) < 0.45 && Math.abs(l.y - (y0 - 0.2)) < 0.4);
    if (here.some((l) => l.defId === 'item_pebble' && Math.abs(l.x - x) < 0.22)) filled.push(x);
    else if (here.length === 0) free.push(x);
    else break;
  }
  return { free, filled };
}

/** Other bugs' adverts: chat, bump, tag, catch, share, comfort, snatch, ride, and nap piles. */
function socialAdverts(me: EntityId, brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const world = ctx.world ?? EMPTY_WORLD;
  const { def, state } = ctx;
  const out: AdvertCandidate[] = [];
  const bugs = world.bugs();
  const loose = world.loose();
  const energetic = brain.needs.need_energy > 30;
  const sociable = 0.5 + def.traits.sociable;
  for (const o of bugs) {
    if (o.id === me || Math.abs(o.x - state.x) > PERCEPTION || Math.abs(o.y - state.y) > 4) continue;
    const aff = world.affinity(def.id, o.defId);
    const like = Math.max(0.1, (0.6 + aff) * sociable);
    const wanted = bugs.some((q) => q.id !== me && q.brain.social?.partner === o.id);
    const base = { id: o.id, defId: o.defId, x: o.x, y: o.y, claimed: wanted };
    const ob = o.brain;
    if (ob.mode === 'st_dizzy' && aff > 0 && !wanted && brain.needs.need_social < 95)
      out.push({
        ...base,
        action: 'soc_comfort',
        needs: SOCIAL_NEEDS.soc_comfort,
        like,
        bonus: 12 + 20 * aff,
      });
    if (ob.mode === 'st_sleep' && aff >= 0.2 && brain.needs.need_energy < 65)
      // A nap pile: curl up next to a sleeping friend.
      out.push({
        ...base,
        claimed: false,
        action: 'sleep',
        needs: { need_energy: 50, need_social: 20 },
        like: 0.9 + aff,
        bonus: 3,
      });
    if (def.traits.cheeky >= 0.5 && ob.carrying !== null && brain.needs.need_hunger < 75 && !wanted) {
      // A friend carrying a snack: snatch it and run.
      const snack = ctx.target(ob.carrying);
      if (snack && world.edible(snack.defId) && likingOf(def, snack.defId) !== 'disliked')
        out.push({
          ...base,
          action: 'soc_steal',
          needs: SOCIAL_NEEDS.soc_steal,
          like: 0.4 + def.traits.cheeky,
          // Mischief: too tempting to pass up.
          bonus: brain.needs.need_fun < 90 ? 9 * def.traits.cheeky : 0,
        });
    }
    if (
      def.habits.ridesHeads &&
      o.supported &&
      !o.held &&
      o.def.radius >= 0.45 &&
      ob.carrying === null &&
      (ob.mode === 'st_idle' || ob.mode === 'st_eat' || (ob.mode === 'st_use' && ob.action === 'inspect')) &&
      !bugs.some((q) => q.brain.mode === 'st_ride' && q.brain.social?.partner === o.id) &&
      !wanted
    )
      out.push({
        ...base,
        action: 'soc_ride',
        needs: SOCIAL_NEEDS.soc_ride,
        like: 0.7 + aff,
        bonus: brain.needs.need_fun < 90 ? 1 : 0,
      });
    if (!available(o) || wanted || brain.carrying !== null) continue;
    out.push({ ...base, action: 'soc_chat', needs: SOCIAL_NEEDS.soc_chat, like: like * 1.25 });
    out.push({ ...base, action: 'soc_bump', needs: SOCIAL_NEEDS.soc_bump, like: like * 0.9 });
    if (energetic && ob.needs.need_energy > 30)
      out.push({
        ...base,
        action: 'soc_tag',
        needs: SOCIAL_NEEDS.soc_tag,
        like: like * (0.3 + def.traits.cheeky * 0.5) * (0.6 + o.def.traits.restless * 0.4),
      });
    if (energetic) {
      // A ball or a berry nearby to throw back and forth.
      const toy = loose.find(
        (l) =>
          l.catchable &&
          l.speed < 0.3 &&
          Math.abs(l.x - state.x) < 5 &&
          !world.setupBetween(Math.min(l.x, o.x) - 1, Math.max(l.x, o.x) + 1),
      );
      if (toy)
        out.push({
          ...base,
          action: 'soc_catch',
          needs: SOCIAL_NEEDS.soc_catch,
          like: like * (0.6 + def.traits.restless * 0.6),
          item: toy.id,
        });
    }
    if (def.traits.generous >= 0.3 && ob.needs.need_hunger < 45) {
      // A snack the friend would like.
      const snack = loose.find(
        (l) =>
          l.edible &&
          l.speed < 0.3 &&
          Math.abs(l.x - state.x) < 6 &&
          likingOf(o.def, l.defId) !== 'disliked' &&
          likingOf(o.def, l.defId) !== 'neutral',
      );
      if (snack)
        out.push({
          ...base,
          action: 'soc_share_food',
          needs: SOCIAL_NEEDS.soc_share_food,
          like: like * (0.4 + def.traits.generous),
          bonus: urgency(ob.needs.need_hunger) * 0.08 * def.traits.generous,
          item: snack.id,
        });
    }
  }
  return out;
}

/** Places that advertise: a nap right here, the water, the top of the stump, the camera. */
function spotAdverts(brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const world = ctx.world ?? EMPTY_WORLD;
  const { def, state, tick } = ctx;
  const out: AdvertCandidate[] = [];
  const spot = (id: number, x: number, action: AdvertAction, needs: Partial<Record<NeedId, number>>) =>
    out.push({ id, defId: '', x, y: state.y, action, needs, claimed: false, like: 1 });
  if (brain.needs.need_energy < 55) spot(SPOT_SLEEP_HERE, state.x, 'sleep', { need_energy: 35 });
  if (def.swim !== 'skate') {
    const edge = world.waterEdge(state.x);
    if (edge && Math.abs(edge.x - state.x) < PERCEPTION)
      spot(SPOT_WATER, edge.x, 'splash', { need_clean: 80, need_fun: 12 });
  }
  const stage = world.stage?.() ?? null;
  if (stage && brain.needs.need_fun < 85 && brain.needs.need_energy > 30 && !ctx.overWater?.(state.x)) {
    // The flowerpot stage: up there for a little dance.
    const onStage = state.x > stage.x0 && state.x < stage.x1 && state.y < stage.y;
    const x = onStage ? state.x : (stage.x0 + stage.x1) / 2 + ((tick % 7) - 3) * 0.6;
    if (Math.abs(x - state.x) < PERCEPTION) {
      spot(SPOT_STAGE, x, 'dance', { need_fun: 26, need_social: 10 });
      // Somebody dancing up there already: come and join in.
      const dancing = world.bugs().filter((o) => o.brain.mode === 'st_perform' && o.brain.action === 'dance');
      if (dancing.length > 0) out[out.length - 1]!.bonus = 7 * Math.min(3, dancing.length);
    }
  }
  if (def.habits.showsOff) {
    const top = world.summit(state.x);
    const onTop = top && state.x > top.x0 && state.x < top.x1 && state.y < top.y;
    if (top && !onTop && brain.needs.need_energy > 35) {
      // Her signature: up to the top to pose, then a glide down.
      spot(SPOT_TOP, (top.x0 + top.x1) / 2, 'perform', { need_fun: 28, need_social: 6 });
      if (brain.needs.need_fun < 85) out[out.length - 1]!.bonus = 6;
    }
    const view = world.view;
    const since = brain.touchedAt < 0 ? tick : tick - brain.touchedAt;
    if (view && since > IGNORED_TICKS) {
      const x = Math.min(view.x1 - 3, Math.max(view.x0 + 3, state.x));
      if (!ctx.overWater?.(x) && (!ctx.home || (x > ctx.home.x0 && x < ctx.home.x1))) {
        // Nobody has played with her for ages: into view for a pose.
        spot(SPOT_CAMERA, x, 'perform', { need_social: 30, need_fun: 10 });
        out[out.length - 1]!.like = 2.5;
      }
    }
  }
  return out;
}

/** Everything this bug could do next, from items, other bugs, and spots. */
function candidates(me: EntityId, brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const { def } = ctx;
  const sleepers = (ctx.world ?? EMPTY_WORLD)
    .bugs()
    .filter((o) => o.id !== me && o.brain.mode === 'st_sleep');
  const items = ctx.adverts().filter((c) => {
    // A snack right by a sleeping bug is that bug's (Dot's berry in the first scene): tiptoe past it.
    if (
      c.action === 'eat' &&
      sleepers.some((o) => Math.abs(c.x - o.x) < o.def.radius + 0.9 && Math.abs(c.y - o.y) < 1.2)
    )
      return false;
    if (c.action === 'carry') return !!def.habits.rowsPebbles;
    if (c.action === 'lift') return !!def.habits.strong && brain.carrying === null;
    if (c.action === 'roll') return !!def.habits.rollsBalls && brain.carrying === null;
    if (c.action === 'play') return canPlay(me, brain, ctx, c.id);
    // Day bugs look for a bed when their energy runs under about half.
    if (c.action === 'sleep') return brain.needs.need_energy < 55;
    // Umbrellas are for rain, picked by `skyCheck`.
    if (c.action === 'shelter') return false;
    return true;
  });
  let carry = items.filter((c) => c.action === 'carry');
  if (carry.length > 0) {
    const row = rowSlots(brain, ctx);
    carry =
      row.free.length === 0
        ? []
        : carry
            .filter(
              (c) => Math.abs(c.x - brain.restX) < 7 && !row.filled.some((x) => Math.abs(x - c.x) < 0.3),
            )
            // Lining up pebbles is Rollo's favorite quiet pastime.
            .map((c) => ({ ...c, bonus: brain.needs.need_fun < 90 ? 7 : 0 }));
  }
  return [
    ...items.filter((c) => c.action !== 'carry'),
    ...carry,
    ...socialAdverts(me, brain, ctx),
    ...spotAdverts(brain, ctx),
    ...machineAdverts(me, brain, ctx),
    ...musicAdverts(me, brain, ctx),
  ];
}

/**
 * Score everything nearby and maybe pick something to do. Picks among the
 * top three with weights 60/30/10. Returns true if the bug chose an action.
 */
export function choose(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const { def, state, rng, tick } = ctx;
  const desperate = NEED_IDS.some((n) => brain.needs[n] < 15);
  const exhausted = brain.needs.need_energy < 10;
  const scored = candidates(me, brain, ctx)
    .filter((c) => !c.claimed && (desperate || c.id === SPOT_CAMERA || Math.abs(c.x - state.x) <= PERCEPTION))
    .filter((c) => !exhausted || c.action === 'sleep')
    .map((c) => ({ c, score: scoreAdvert(brain, def, c, state.x, tick) + rng.range(0, 6) }))
    .filter((s) => s.score > SCORE_FLOOR)
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id || a.c.action.localeCompare(b.c.action))
    .slice(0, 3)
    // Something urgent wins: the runners-up only get a look in when they are close.
    .filter((s, _i, all) => s.score >= all[0]!.score * 0.5);
  if (scored.length === 0) {
    if (exhausted && ctx.support) {
      out.notices.push(...enterSleep(brain, def, state.x));
      return true;
    }
    return false;
  }
  const weights = [60, 30, 10].slice(0, scored.length);
  let roll = rng.range(
    0,
    weights.reduce((a, b) => a + b, 0),
  );
  let pick = scored[0]!;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) {
      pick = scored[i]!;
      break;
    }
  }
  return start(brain, ctx, pick.c, out);
}

/** Set off to do what an advert offers. */
export function start(brain: BugBrain, ctx: BugContext, c: AdvertCandidate, out: BugDecision): boolean {
  const { def, state } = ctx;
  out.notices.push({ type: 'chose', action: c.action, targetId: c.id >= 0 ? c.id : null });
  if (c.id === SPOT_SLEEP_HERE) {
    out.notices.push(...enterSleep(brain, def, state.x));
    return true;
  }
  // Ten seconds, plus however long the walk takes a slow snail.
  enter(brain, 'st_seek', SEEK_TIMEOUT + Math.round((Math.abs(c.x - state.x) / def.speed) * SIM_HZ));
  brain.targetId = c.id;
  brain.action = c.action;
  brain.targetX = c.x;
  brain.tries = 0;
  brain.done = false;
  if (isSocial(c.action)) {
    const fetch = c.item !== undefined && c.item !== null;
    brain.social = {
      kind: c.action,
      partner: c.id,
      role: 'lead',
      stage: fetch ? 0 : 1,
      count: 0,
      goal: 0,
      beat: 0,
      left: 0,
      item: c.item ?? null,
      last: null,
    };
    if (fetch) brain.targetId = c.item!;
  }
  return true;
}

/**
 * Walk somewhere nearby, drifting back toward home (game design doc,
 * section 5). Bugs that cannot skate never pick a spot on open water.
 */
export function startWander(brain: BugBrain, ctx: BugContext, away?: number): void {
  const { def, state, rng } = ctx;
  const margin = def.radius + 0.5;
  const reach = ctx.reach ?? { x0: 0, x1: ctx.worldWidth };
  let lo = Math.max(reach.x0 + margin, state.x - WANDER_RANGE);
  let hi = Math.min(reach.x1 - margin, state.x + WANDER_RANGE);
  const home = ctx.home;
  let outing: { x0: number; x1: number } | null = null;
  if (home) {
    const hlo = home.x0 + margin;
    const hhi = home.x1 - margin;
    if (state.x < hlo) lo = Math.max(lo, state.x);
    else if (state.x > hhi) hi = Math.min(hi, state.x);
    else {
      lo = Math.max(lo, hlo);
      hi = Math.min(hi, hhi);
      // Now and then a lively bug pops over into the next area for a look round (R04).
      if (away === undefined && outingDue(brain, ctx)) {
        const dir = state.x - home.x0 < home.x1 - state.x ? -1 : 1;
        const edge = dir < 0 ? home.x0 : home.x1;
        const a = edge + dir * OUTING[0];
        const b = edge + dir * OUTING[1];
        outing = {
          x0: Math.max(reach.x0 + margin, Math.min(a, b)),
          x1: Math.min(reach.x1 - margin, Math.max(a, b)),
        };
        if (outing.x1 <= outing.x0) outing = null;
      }
    }
  }
  enter(brain, 'st_wander', SEEK_TIMEOUT);
  if (outing) {
    lo = outing.x0;
    hi = outing.x1;
    // A longer walk: give it time to get there.
    brain.timer = SEEK_TIMEOUT + Math.round(((Math.abs(hi - state.x) + 1) / def.speed) * SIM_HZ);
  }
  let target = away === undefined ? rng.range(lo, Math.max(lo, hi)) : away;
  if (away === undefined)
    for (const o of (ctx.world ?? EMPTY_WORLD).bugs()) {
      // Never stop right by a sleeper (Dot napping on her bottle cap): stop short, on this side.
      if (o.brain.mode !== 'st_sleep' || Math.abs(o.y - state.y) > 1.5) continue;
      const clear = def.radius + o.def.radius + 0.6;
      if (Math.abs(target - o.x) < clear) target = o.x + (state.x >= o.x ? 1 : -1) * clear;
    }
  target = Math.min(reach.x1 - margin, Math.max(reach.x0 + margin, target));
  if (def.swim !== 'skate' && ctx.overWater) {
    // Stop at the water's edge instead.
    const step = target > state.x ? 0.2 : -0.2;
    let x = state.x;
    while (Math.abs(target - x) > 0.2 && !ctx.overWater(x + step * 3)) x += step;
    target = x;
  }
  brain.targetX = target;
}

/** Drop out of anything shared: interactions end and whatever is in hand is let go. */
export function letGo(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  if (brain.social) endSocial(me, brain, ctx, false, out);
  brain.carrying = null;
  brain.gliding = false;
}

/** Small idle animations (section 5, `st_idle`): a hum, a yawn, a look around, a groom. */
export function fidget(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const { def, rng, tick } = ctx;
  brain.fidgetAt = tick + Math.round(rng.range(3, 8) * SIM_HZ * (1.3 - def.traits.restless * 0.6));
  const n = brain.needs;
  let kind: Fidget;
  if (def.habits.hops && rng.chance(0.5)) {
    // Boing can't sit still.
    kind = 'stretch';
    if (ctx.support) launch(brain, out, { x: 0, y: -4.2 }, ctx.state.y);
  } else if (def.habits.chops && rng.chance(0.5)) {
    // Prim strikes a slow, dramatic pose.
    kind = 'pose';
  } else if (def.habits.shy && rng.chance(0.6)) {
    // Twig goes very, very still. Just a stick.
    kind = 'freeze';
  } else if (n.need_energy < 40) kind = rng.chance(0.6) ? 'yawn' : 'stretch';
  else if (n.need_clean < 60 && rng.chance(0.6)) {
    // Grooming: +20 cleanliness.
    kind = 'groom';
    addNeeds(n, { need_clean: 20 });
  } else if (n.need_fun < 30) kind = rng.chance(0.5) ? 'kick' : 'look';
  else if (moodOf(brain, tick) === 'mood_happy') kind = rng.chance(0.55) ? 'hum' : 'look';
  else kind = rng.pick(['look', 'scratch', 'look', 'hum'] as const);
  out.notices.push({ type: 'fidgeted', fidget: kind });
}
