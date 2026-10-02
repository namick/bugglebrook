// The bug AI's modes, one function each (game design doc, section 5): idle,
// airborne, using a toy, performing, seeking, swimming, and the hidden bugs
// waiting to be found. `updateBug` in bugAi.ts picks which one runs.

import type { BugBrain, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import { DIZZY_SPEED } from '../constants';
import type { BugContext, BugDecision } from './bugTypes';
import {
  EMPTY_WORLD,
  SPOT_BEADS,
  SPOT_CAMERA,
  SPOT_SLIDE,
  SPOT_STAGE,
  SPOT_TOP,
  SPOT_WATER,
} from './bugTypes';
import { MACHINE_ACTIONS, arriveAtMachine, carryToMachine, useMachine } from './bugMachines';
import {
  ARRIVE,
  DECIDE_EVERY,
  SEEK_TIMEOUT,
  STUCK_TICKS,
  clearIntent,
  clearLanding,
  enter,
  enterIdle,
  face,
  grip,
  hopVelocity,
  kindUseId,
  launch,
  react,
  recordUse,
  remember,
  stepToward,
  walk,
  walkVelocity,
} from './bugMove';
import { CATCH_FAR, CATCH_NEAR, CATCH_WINDUP, available, endSocial, engage } from './bugSocial';
import { addNeeds } from './needs';
import { curl, enterSleep, feedBug, makeDizzy } from './bugAi';
import { choose, fidget, rowSlots, startWander } from './bugChoose';
import {
  CHOP_REACH,
  CROWD,
  CROWD_RANGE,
  CURL_FALL,
  DANCE_TICKS,
  HOP_TRIES,
  INSPECT_TICKS,
  LANDING_TICKS,
  OFFER_RANGE,
  PICNIC_CHANCE,
  POSE_TICKS,
  ROLL_WALK,
  SHAKE_DRY_TICKS,
  SHELL_TICKS,
  SPOT_PICNIC,
  SPOT_ROW,
} from './bugTuning';

/** Room a bug leaves between itself and another bug standing still, and a sleeping one (m). */
export const BUG_SPACE = 0.22;
export const SLEEPER_SPACE = 0.5;

/** Morning: out of the cocoon comes a butterfly (or, the second time round, a caterpillar again). */
export function hatch(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const was = brain.form;
  delete brain.form;
  if (was === 'cocoon' && !brain.wasButterfly) {
    brain.form = 'butterfly';
    brain.wasButterfly = true;
  } else delete brain.wasButterfly;
  enter(brain, 'st_react', 90);
  clearIntent(brain);
  out.notices.push(
    { type: 'changed', form: brain.form === 'butterfly' ? 'butterfly' : 'caterpillar' },
    react(brain, 'join', ctx.rng, ctx.tick),
  );
}

/** Set down what is held overhead (Moose) or rolled along (Barty), with a happy grunt. */
export function setDown(brain: BugBrain, ctx: BugContext, out: BugDecision): void {
  const id = brain.carrying;
  brain.carrying = null;
  delete brain.overhead;
  delete brain.rolling;
  if (id === null) return;
  addNeeds(brain.needs, { need_fun: 8 });
  out.notices.push(react(brain, 'play', ctx.rng, ctx.tick));
}

/**
 * Prim karate-chops something floating down past her: a feather, a petal, a
 * leaf in the wind. Never the player's things. Returns true if she chopped.
 */
function chop(brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const { state, rng, tick } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  if (brain.used.some((u) => u.id === kindUseId(99) && tick - u.tick < 4 * SIM_HZ)) return false;
  const floating = world
    .loose()
    .find(
      (l) =>
        !l.edible &&
        l.speed > 0.4 &&
        l.top < state.y &&
        Math.abs(l.x - state.x) < CHOP_REACH &&
        Math.abs(l.y - (state.y - ctx.def.radius)) < CHOP_REACH &&
        world.isLight?.(l.id) !== false,
    );
  if (!floating) return false;
  brain.facing = floating.x >= state.x ? 1 : -1;
  recordUse(brain, kindUseId(99), tick);
  addNeeds(brain.needs, { need_fun: 12 });
  enter(brain, 'st_react', 50);
  out.notices.push({ type: 'chopped', itemId: floating.id }, react(brain, 'chop', rng, tick));
  out.velocity = ctx.support ? grip(ctx.support) : null;
  return true;
}

/**
 * A hidden bug waiting to be found (M7) keeps to itself: Moose waves his
 * legs on his back, Barty rolls his ball to and fro, and Twig stays a twig.
 * Its needs stay where they are until it joins.
 */
export function pendingBug(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { state, def } = ctx;
  const n = ctx.support;
  if (ctx.held) {
    if (brain.mode !== 'st_held') enter(brain, 'st_held');
    return out;
  }
  if (brain.mode === 'st_held' || !n) {
    if (brain.mode === 'st_held') enter(brain, 'st_airborne');
    if (!n) return out;
  }
  if (brain.pending !== 'aloof') {
    enter(brain, brain.pending === 'stuck' ? 'st_react' : 'st_idle', 60);
    out.velocity = grip(n);
    // Moose, stuck on his back, gives a big heave every so often and looks
    // round for help (R04): signs of life for whoever passes. No dice: the
    // wait is worked out from his ID, so the world's rolls stay the same.
    if (brain.pending === 'stuck' && ctx.tick >= brain.fidgetAt) {
      brain.fidgetAt = ctx.tick + 6 * SIM_HZ + (((ctx.id ?? 0) * 97 + ctx.tick) % (4 * SIM_HZ));
      const variant = Math.floor(ctx.tick / SIM_HZ) % 3;
      brain.reaction = { type: 'huh', variant, tick: ctx.tick };
      brain.variants.huh = variant;
      out.notices.push({ type: 'fidgeted', fidget: 'kick' }, { type: 'reacted', reaction: 'huh', variant });
    }
    return out;
  }
  // Barty stops now and then to give his ball a proud polish.
  if (ctx.tick >= brain.fidgetAt && brain.mode === 'st_wander' && Math.abs(state.x - brain.restX) < 0.3) {
    brain.fidgetAt = ctx.tick + 8 * SIM_HZ + (((ctx.id ?? 0) * 89 + ctx.tick) % (5 * SIM_HZ));
    out.notices.push({ type: 'fidgeted', fidget: 'groom' });
  }
  // Barty: back and forth by his resting spot, nudging his ball along.
  if (brain.mode !== 'st_wander' || Math.abs(brain.targetX - state.x) < 0.2) {
    enter(brain, 'st_wander', 6 * SIM_HZ);
    brain.targetX = brain.restX + (state.x > brain.restX ? -1.6 : 1.6);
  }
  brain.facing = brain.targetX > state.x ? 1 : -1;
  out.velocity = walkVelocity(n, brain.facing * def.speed * 0.45);
  return out;
}

export function idle(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { def, state, tick } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  if (n && comeForLater(brain, ctx, out)) return out;
  if (offeredNear(ctx)) {
    // Food on offer: turn to it and wait, instead of wandering off.
    brain.facing = ctx.offered!.x >= state.x ? 1 : -1;
    brain.timer = Math.max(brain.timer, 30);
    out.velocity = n ? grip(n) : null;
    return out;
  }
  out.velocity = n ? grip(n) : null;
  if (def.habits.rowsPebbles && Math.abs(state.x - brain.restX) > 12) brain.restX = state.x;
  // Woken early and still tired: back to sleep.
  if (brain.napAt >= 0 && tick >= brain.napAt) {
    brain.napAt = -1;
    if (brain.needs.need_energy < 50 && n) {
      out.notices.push(...enterSleep(brain, def, state.x));
      return out;
    }
  }
  if (def.habits.crowdShy && n) {
    const crowd = world
      .bugs()
      .filter((o) => o.id !== me && Math.hypot(o.x - state.x, o.y - state.y) < CROWD_RANGE);
    if (crowd.length >= CROWD) {
      const cx = crowd.reduce((a, o) => a + o.x, 0) / crowd.length;
      const away = state.x >= cx ? 1 : -1;
      // Too many bugs: hop clear of them, then drift off.
      const landX = state.x + away * 3.2;
      brain.facing = away;
      if (clearLanding(ctx, landX)) {
        startWander(brain, ctx, landX + away * 2);
        launch(
          brain,
          out,
          hopVelocity(state.x, state.y, landX, world.surfaceY(landX) - def.radius, 0.7),
          state.y,
        );
        return out;
      }
      startWander(brain, ctx, state.x + away * 4);
      return out;
    }
  }
  if (n && scoot(me, brain, ctx, out)) return out;
  if (brain.overhead || brain.rolling) {
    // Carrying something heavy overhead, or rolling a ball: off somewhere with it.
    if (n && brain.timer-- <= 0) startWander(brain, ctx);
    out.velocity = n ? grip(n) : null;
    return out;
  }
  if (def.habits.chops && n && chop(brain, ctx, out)) return out;
  brain.timer--;
  if (--brain.decideIn <= 0) {
    brain.decideIn = DECIDE_EVERY;
    if (n && choose(me, brain, ctx, out)) return out;
  }
  if (tick >= brain.fidgetAt && n) {
    fidget(brain, ctx, out);
    if (brain.mode !== 'st_idle') return out;
  }
  if (brain.timer <= 0 && n) startWander(brain, ctx);
  return out;
}

/** After a "later", a bug free again walks over to food still held out this far away (m). */
const LATER_REACH = 6;

/**
 * A bug that said "later" to food while it was busy (R21) keeps its word:
 * once it is free, and the food is still held out a little way off, it
 * walks over to be fed. Returns true while it is on its way.
 */
function comeForLater(brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const o = ctx.offered;
  const { state, def } = ctx;
  if (!o || brain.later === undefined || ctx.tick >= brain.later) return false;
  const d = Math.abs(o.x - state.x);
  if (d < OFFER_RANGE - 0.6 || d > LATER_REACH || Math.abs(o.y - state.y) > 3) return false;
  const side = o.x >= state.x ? 1 : -1;
  const standX = o.x - side * (def.radius + 0.5);
  const result = stepToward(brain, ctx, standX - state.x, Math.abs(state.vx) / SIM_HZ, out, 1, false);
  if (result === 'blocked') {
    delete brain.later;
    return false;
  }
  return true;
}

/** Modes in which a bug counts as standing still, for keeping a little space (R15). */
const STILL: ReadonlySet<string> = new Set([
  'st_idle',
  'st_react',
  'st_sleep',
  'st_eat',
  'st_landing',
  'st_recover',
  'st_perform',
  'st_use',
]);

/**
 * Bugs standing still keep a little space between them (R15), so they never
 * stand drawn inside each other: an idle bug too close to another one that
 * is standing still shuffles a step away. It keeps well clear of a sleeper,
 * like Dot napping on her bottle cap. Returns true if it moved.
 */
export function scoot(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const { def, state } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  let closest: { dx: number; gap: number; want: number; id: EntityId } | null = null;
  for (const o of world.bugs()) {
    if (o.id === me || o.held || !o.supported || !STILL.has(o.brain.mode)) continue;
    if (o.brain.mode === 'st_use' && o.brain.action === 'bounce') continue;
    if (Math.abs(o.y - state.y) > def.radius + o.def.radius) continue;
    const dx = state.x - o.x;
    const gap = Math.abs(dx) - def.radius - o.def.radius;
    const want = o.brain.mode === 'st_sleep' ? SLEEPER_SPACE : BUG_SPACE;
    if (gap >= want) continue;
    if (!closest || gap - want < closest.gap - closest.want) closest = { dx, gap, want, id: o.id };
  }
  if (!closest) return false;
  // The player's things close by: better a little crowded than a nudge to their work.
  if (world.setupNear(state.x, state.y, def.radius + 0.9)) return false;
  // Straight on top of each other: the higher ID steps right.
  const away: 1 | -1 = closest.dx > 0.01 ? 1 : closest.dx < -0.01 ? -1 : me > closest.id ? 1 : -1;
  // Squeezed in on that side too: stay put and let the bugs on the outside make room.
  const squeezed = world
    .bugs()
    .some(
      (o) =>
        o.id !== me &&
        o.id !== closest.id &&
        (o.x - state.x) * away > 0 &&
        Math.abs(o.y - state.y) < def.radius + o.def.radius &&
        Math.abs(o.x - state.x) - def.radius - o.def.radius < BUG_SPACE + 0.1,
    );
  if (squeezed) return false;
  const facing = brain.facing;
  const result = stepToward(brain, ctx, away, Math.abs(state.vx) / SIM_HZ, out, 0.45, false);
  if (result === 'blocked') {
    brain.facing = facing;
    return false;
  }
  return true;
}

/** Flying, falling, hopping, and bouncing, and how each landing ends. */
export function airborne(
  me: EntityId,
  brain: BugBrain,
  ctx: BugContext,
  speed: number,
  out: BugDecision,
): BugDecision {
  const { def, state, rng } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  brain.airPeak = Math.max(brain.airPeak, ctx.impact);
  brain.airTop = Math.min(brain.airTop, state.y);
  const settled = def.curlsWhenFlung && !brain.selfLaunched ? speed < 1.2 : ctx.impact > 0 || speed < 1;
  if (!n || !settled) return out;
  const fall = state.y - brain.airTop;
  out.notices.push({ type: 'landed', speed: brain.airPeak });
  const glided = brain.gliding;
  brain.gliding = false;
  out.velocity = grip(n);
  if (!brain.selfLaunched && brain.airPeak >= DIZZY_SPEED && def.dizzyProof) {
    // Glorp never gets dizzy: he pulls into his shell and spins like a top.
    enter(brain, 'st_react', SHELL_TICKS);
    clearIntent(brain);
    out.notices.push(react(brain, 'land_hard', rng, ctx.tick));
  } else if (!brain.selfLaunched && brain.airPeak >= DIZZY_SPEED) {
    const ticks = makeDizzy(brain, brain.airPeak, ctx.tick);
    out.notices.push({ type: 'dizzy', speed: brain.airPeak, durationTicks: ticks });
  } else if (brain.selfLaunched && brain.resume !== null) {
    // A hop on the way somewhere: carry on.
    brain.mode = brain.resume;
    brain.resume = null;
    brain.stuck = 0;
  } else if (
    brain.selfLaunched &&
    brain.mode === 'st_use' &&
    brain.targetId !== null &&
    !brain.done &&
    brain.tries + 1 < HOP_TRIES
  ) {
    // Missed the spring. Try again.
    brain.tries++;
    brain.mode = 'st_seek';
    brain.timer = SEEK_TIMEOUT;
    brain.stuck = 0;
  } else if (brain.selfLaunched && brain.action === 'sleep') {
    out.notices.push(...enterSleep(brain, def, state.x));
  } else if (brain.selfLaunched && brain.action === 'soc_ride' && brain.social) {
    const mount = world.bug(brain.social.partner);
    const onHead =
      !!mount && Math.abs(state.x - mount.x) < mount.def.radius && state.y < mount.y - mount.def.radius * 0.5;
    if (mount && onHead) {
      engage(me, brain, mount, 'soc_ride', ctx, out);
      out.notices.push({ type: 'rode', mountId: mount.id, on: true });
    } else {
      brain.social = null;
      enterIdle(brain, rng, def);
    }
  } else if (brain.selfLaunched && glided) {
    // Dot's glide down from the top: "again!"
    addNeeds(brain.needs, { need_fun: 25, need_social: 5 });
    recordUse(brain, SPOT_TOP, ctx.tick);
    enter(brain, 'st_landing', LANDING_TICKS);
    clearIntent(brain);
    out.notices.push(
      { type: 'used', action: 'perform', targetId: null },
      react(brain, 'land', rng, ctx.tick),
    );
  } else if (!brain.selfLaunched && def.curlsWhenFlung && fall > CURL_FALL) {
    // Dropped from high up: stays curled for a while.
    out.notices.push(...curl(brain, rng));
    out.velocity = null;
  } else if (
    !brain.selfLaunched &&
    def.habits.hops &&
    brain.touchedAt >= 0 &&
    ctx.tick - brain.touchedAt < 5 * SIM_HZ
  ) {
    // Boing loves a fling: he uses the landing to hop again.
    out.notices.push(react(brain, 'land', rng, ctx.tick));
    const toX = state.x + brain.facing * 1.2;
    if (clearLanding(ctx, toX)) {
      enter(brain, 'st_airborne');
      brain.selfLaunched = true;
      brain.airPeak = 0;
      brain.airTop = state.y;
      out.velocity = { x: brain.facing * 1.8, y: -7.5 };
      out.notices.push({ type: 'hopped' });
      clearIntent(brain);
      return out;
    }
    enter(brain, 'st_landing', LANDING_TICKS);
    clearIntent(brain);
  } else {
    enter(brain, 'st_landing', LANDING_TICKS);
    clearIntent(brain);
    if (!brain.selfLaunched) out.notices.push(react(brain, 'land', rng, ctx.tick));
  }
  brain.selfLaunched = false;
  return out;
}

/** Sniffing something new (`st_use` with `inspect`). */
export function use(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  if (brain.action !== null && MACHINE_ACTIONS.has(brain.action)) return useMachine(brain, ctx, out);
  const { rng, tick, def } = ctx;
  const target = brain.targetId === null ? null : ctx.target(brain.targetId);
  if (target) face(brain, ctx, target.x, out);
  else out.velocity = ctx.support ? grip(ctx.support) : null;
  if (--brain.timer > 0 && target && !target.held) return out;
  const id = brain.targetId;
  if (id !== null && target) {
    addNeeds(brain.needs, { need_fun: 8 });
    recordUse(brain, id, tick);
    if (!brain.inspected.includes(id)) brain.inspected.push(id);
    if (brain.inspected.length > 64) brain.inspected.shift();
    out.notices.push(
      { type: 'inspected', itemId: id },
      { type: 'used', action: 'inspect', targetId: id },
      react(brain, 'inspect', rng, tick),
    );
    enter(brain, 'st_react', 60);
    brain.targetId = id;
    brain.action = null;
    return out;
  }
  enterIdle(brain, rng, def);
  return out;
}

/** Dot posing at the top (then leaping off to glide down), or for the camera. */
export function perform(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { def, state, rng, tick } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  out.velocity = ctx.support ? grip(ctx.support) : null;
  if (brain.action === 'dance') {
    // Dancing on the stage: a new move every couple of seconds.
    if (brain.timer % 150 === 0 && brain.timer > 0) out.notices.push(react(brain, 'dance', rng, tick));
    if (--brain.timer > 0) return out;
    addNeeds(brain.needs, { need_fun: 26, need_social: 10 });
    recordUse(brain, SPOT_STAGE, tick);
    out.notices.push({ type: 'used', action: 'dance', targetId: null });
    enterIdle(brain, rng, def);
    return out;
  }
  if (--brain.timer > 0) return out;
  if (brain.targetId === SPOT_TOP) {
    const top = world.summit(state.x);
    if (top && ctx.support) {
      const edges = [
        { dir: -1 as const, x: top.x0 },
        { dir: 1 as const, x: top.x1 },
      ].sort((a, b) => Math.abs(a.x - state.x) - Math.abs(b.x - state.x));
      for (const edge of edges) {
        const landX = edge.x + edge.dir * rng.range(3.2, 4.2);
        // Gliding drifts, so keep the whole way down clear of the player's things.
        if (
          !clearLanding(ctx, landX) ||
          world.setupBetween(Math.min(edge.x, landX) - 2, Math.max(edge.x, landX) + 2)
        )
          continue;
        // Leap off the edge and glide down with wings open.
        brain.facing = edge.dir;
        const toY = world.surfaceY(landX) - def.radius;
        const v = hopVelocity(state.x, state.y, landX, toY, 1.1);
        enter(brain, 'st_airborne');
        brain.targetId = SPOT_TOP;
        brain.selfLaunched = true;
        brain.gliding = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        out.velocity = { x: v.x, y: Math.min(v.y, -5.5) };
        out.notices.push({ type: 'hopped' });
        return out;
      }
    }
  }
  // Posed for the camera (or nowhere safe to leap): take a bow.
  addNeeds(brain.needs, { need_fun: 12, need_social: 20 });
  recordUse(brain, brain.targetId ?? SPOT_CAMERA, tick);
  out.notices.push({ type: 'used', action: 'perform', targetId: null });
  enterIdle(brain, rng, def);
  return out;
}

/** Where to stand to use a target, and whether the bug is there yet. */
export function seek(
  me: EntityId,
  brain: BugBrain,
  ctx: BugContext,
  moved: number,
  out: BugDecision,
): BugDecision {
  const { def, state, rng, tick } = ctx;
  const n = ctx.support;
  const world = ctx.world ?? EMPTY_WORLD;
  const id = brain.targetId;
  const giveUp = (): BugDecision => {
    // Could not get there: go off it for a while instead of trying again at once.
    if (id !== null) remember(brain, id, false, tick);
    brain.social = null;
    brain.carrying = null;
    // Stopped short against a sleeper (Dot on her bottle cap): tiptoe back off rather than stand there.
    const sleeper = world
      .bugs()
      .find(
        (o) =>
          o.id !== me &&
          o.brain.mode === 'st_sleep' &&
          Math.abs(o.y - state.y) < 1.5 &&
          Math.abs(o.x - state.x) - def.radius - o.def.radius < SLEEPER_SPACE,
      );
    if (sleeper && n) {
      const away = state.x >= sleeper.x ? 1 : -1;
      startWander(brain, ctx, sleeper.x + away * (def.radius + sleeper.def.radius + SLEEPER_SPACE + 0.4));
      return out;
    }
    enterIdle(brain, rng, def);
    out.velocity = n ? grip(n) : null;
    return out;
  };
  if (--brain.timer <= 0 || id === null) return giveUp();

  // Places: the water's edge, the top of the stump, the camera, the pebble row.
  if (id < 0) {
    const dx = brain.targetX - state.x;
    const near =
      id === SPOT_TOP || id === SPOT_STAGE ? 0.8 : id === SPOT_SLIDE || id === SPOT_BEADS ? 0.45 : 0.2;
    if (Math.abs(dx) < near && n) {
      if (id === SPOT_WATER) {
        const edge = world.waterEdge(state.x);
        const dir = edge?.dir ?? brain.facing;
        brain.facing = dir;
        addNeeds(brain.needs, { need_fun: 10 });
        recordUse(brain, SPOT_WATER, tick);
        out.notices.push({ type: 'used', action: 'splash', targetId: null });
        enter(brain, 'st_airborne');
        brain.selfLaunched = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        clearIntent(brain);
        out.velocity = { x: dir * 2.6, y: -5 };
        out.notices.push({ type: 'hopped' });
        return out;
      }
      if (id === SPOT_PICNIC) {
        // Snack time next to a friend.
        const food = brain.carrying === null ? null : ctx.target(brain.carrying);
        if (brain.carrying === null || !food) return giveUp();
        const itemId = brain.carrying;
        addNeeds(brain.needs, { need_social: 8 });
        const liking = feedBug(brain, def, itemId, food.defId);
        out.take = { itemId, liking };
        out.velocity = grip(n);
        return out;
      }
      if (id === SPOT_ROW) {
        // Set the pebble down in its place in the row.
        brain.facing = 1;
        if (brain.carrying !== null) recordUse(brain, brain.carrying, tick);
        brain.carrying = null;
        addNeeds(brain.needs, { need_fun: 12 });
        out.notices.push({ type: 'used', action: 'carry', targetId: null });
        enterIdle(brain, rng, def);
        out.velocity = grip(n);
        return out;
      }
      if (id === SPOT_STAGE) {
        const stage = world.stage?.() ?? null;
        if (!stage || !(state.y < stage.y && state.x > stage.x0 && state.x < stage.x1))
          return walk(brain, ctx, dx || brain.facing, moved, out);
        enter(brain, 'st_perform', rng.int(DANCE_TICKS[0], DANCE_TICKS[1]));
        brain.targetId = SPOT_STAGE;
        brain.action = 'dance';
        out.velocity = grip(n);
        out.notices.push(react(brain, 'dance', rng, tick));
        return out;
      }
      if (id === SPOT_TOP || id === SPOT_CAMERA) {
        const top = world.summit(state.x);
        if (id === SPOT_TOP && !(top && state.y < top.y))
          return walk(brain, ctx, dx || brain.facing, moved, out);
        const targetId = id;
        enter(brain, 'st_perform', POSE_TICKS);
        brain.targetId = targetId;
        brain.action = 'perform';
        out.velocity = grip(n);
        out.notices.push({ type: 'posed' }, react(brain, 'show_off', rng, tick));
        return out;
      }
      if (arriveAtMachine(brain, ctx, id, out)) return out;
      return giveUp();
    }
    return walk(brain, ctx, dx, moved, out);
  }

  const target = ctx.target(id);
  if (!target || target.held) return giveUp();
  // Someone else picked it up first (snatching is its own game).
  if (target.kind === 'item' && world.bugs().some((o) => o.id !== me && o.brain.carrying === id))
    return giveUp();
  const s = brain.social;
  const partner = s ? world.bug(s.partner) : null;
  if (s && !partner) return giveUp();

  // A bug to play with.
  if (s && partner && s.stage >= 1 && id === partner.id) {
    const kind = s.kind;
    const side = partner.x >= state.x ? 1 : -1;
    const gap = Math.abs(partner.x - state.x) - def.radius - partner.def.radius;
    if (kind === 'soc_catch') {
      const d = Math.abs(partner.x - state.x);
      if (d >= CATCH_NEAR && d <= CATCH_FAR && n) {
        if (!available(partner)) return giveUp();
        brain.facing = side;
        engage(me, brain, partner, kind, ctx, out);
        brain.timer = CATCH_WINDUP;
        out.velocity = grip(n);
        return out;
      }
      const want = d < CATCH_NEAR ? -side * 2 : side * (d - 2.8);
      if (stepToward(brain, ctx, want, moved, out) === 'blocked') return giveUp();
      return out;
    }
    if (kind === 'soc_ride') {
      if (gap < 1.4 && n) {
        const topY = partner.y - partner.def.radius - def.radius - 0.05;
        // A player setup right there: not worth the risk of falling on it.
        if (!clearLanding(ctx, partner.x)) return giveUp();
        brain.facing = side;
        out.velocity = hopVelocity(state.x, state.y, partner.x, topY, 0.45);
        enter(brain, 'st_airborne');
        brain.selfLaunched = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        brain.targetId = partner.id;
        brain.action = 'soc_ride';
        out.notices.push({ type: 'hopped' });
        return out;
      }
      return walkOrGiveUp(
        brain,
        ctx,
        partner.x - side * (def.radius + partner.def.radius + 0.9) - state.x,
        moved,
        out,
        giveUp,
      );
    }
    if (gap < 0.4 && n) {
      brain.facing = side;
      out.velocity = grip(n);
      if (kind === 'soc_comfort') {
        if (partner.brain.mode !== 'st_dizzy') return giveUp();
        engage(me, brain, partner, kind, ctx, out);
        return out;
      }
      if (kind === 'soc_steal') {
        const item = partner.brain.carrying;
        if (item === null || partner.held) return giveUp();
        // Snatch! Then run for it.
        if (partner.brain.social)
          endSocial(partner.id, partner.brain, { ...ctx, def: partner.def }, false, out);
        partner.brain.carrying = null;
        brain.carrying = item;
        brain.social = { ...s, item };
        out.notices.push({ type: 'snatched', partnerId: partner.id, itemId: item });
        enter(partner.brain, 'st_idle', 60);
        out.notices.push({ ...react(partner.brain, 'robbed', rng, tick), by: partner.id });
        engage(me, brain, partner, kind, ctx, out);
        return out;
      }
      if (!available(partner)) return giveUp();
      engage(me, brain, partner, kind, ctx, out);
      return out;
    }
    const chaseSpeed = kind === 'soc_comfort' || kind === 'soc_steal' ? 1.35 : 1;
    const standX = partner.x - side * (def.radius + partner.def.radius + 0.2);
    if (stepToward(brain, ctx, standX - state.x, moved, out, chaseSpeed) === 'blocked') return giveUp();
    return out;
  }

  // An item: stand beside it (a bit back for the spring).
  const side = target.x >= state.x ? 1 : -1;
  const action = brain.action;
  // Stand back a little from a spring, or from something being sniffed.
  const gap = action === 'bounce' || action === 'inspect' ? 0.3 : 0.04;
  const standX = target.x - side * (def.radius + target.halfWidth + gap);
  brain.targetX = standX;
  const dx = standX - state.x;
  const edgeGap = Math.abs(target.x - state.x) - def.radius - target.halfWidth;
  const arrived = Math.abs(dx) < ARRIVE || (edgeGap < gap + 0.1 && Math.sign(dx) !== side);
  if (!arrived || !n) {
    if (!n || action !== 'inspect' || edgeGap > 3) return walkOrGiveUp(brain, ctx, dx, moved, out, giveUp);
    // Something in the way of a new thing: have a good look from here instead.
    if (stepToward(brain, ctx, dx, moved, out) !== 'blocked') return out;
    brain.facing = side;
    out.velocity = grip(n);
    enter(brain, 'st_use', rng.int(INSPECT_TICKS[0], INSPECT_TICKS[1]));
    return out;
  }
  brain.facing = side;
  out.velocity = grip(n);
  if (s && s.stage === 0 && s.item === id) {
    // Picked up the toy or snack; now go and find the friend.
    if (world.isSetup(id) || world.bugs().some((o) => o.brain.carrying === id)) return giveUp();
    brain.carrying = id;
    s.stage = 1;
    brain.targetId = s.partner;
    brain.timer = SEEK_TIMEOUT;
    return out;
  }
  switch (action) {
    case 'eat': {
      // Sometimes a snack is nicer next to a friend: carry it over first.
      const pal =
        brain.needs.need_hunger > 15 && def.traits.sociable >= 0.5 && !world.isSetup(id)
          ? world
              .bugs()
              .find(
                (o) =>
                  o.id !== me &&
                  o.supported &&
                  o.brain.mode !== 'st_sleep' &&
                  Math.abs(o.x - state.x) < 6 &&
                  Math.abs(o.y - state.y) < 1.5 &&
                  world.affinity(def.id, o.defId) >= 0.3,
              )
          : undefined;
      if (pal && rng.chance(PICNIC_CHANCE)) {
        const toward = pal.x >= state.x ? 1 : -1;
        brain.carrying = id;
        brain.targetId = SPOT_PICNIC;
        brain.targetX = pal.x - toward * (def.radius + pal.def.radius + 0.35);
        brain.timer = SEEK_TIMEOUT;
        return out;
      }
      const liking = feedBug(brain, def, id, target.defId);
      out.take = { itemId: id, liking };
      return out;
    }
    case 'bounce': {
      if (Math.abs(target.angle) > 0.5) return giveUp(); // The spring fell over.
      // Hop onto the spring's top.
      const topY = target.y - target.halfHeight - def.radius - 0.02;
      out.velocity = hopVelocity(state.x, state.y, target.x - side * 0.04, topY);
      enter(brain, 'st_use');
      brain.selfLaunched = true;
      brain.airPeak = 0;
      brain.airTop = state.y;
      out.notices.push({ type: 'hopped' });
      return out;
    }
    case 'inspect':
      enter(brain, 'st_use', rng.int(INSPECT_TICKS[0], INSPECT_TICKS[1]));
      return out;
    case 'sleep': {
      if (target.kind === 'item' && target.halfHeight * 2 <= 0.35 && !world.isSetup(id)) {
        // Hop up onto it and curl up there.
        const topY = target.y - target.halfHeight - def.radius - 0.02;
        out.velocity = hopVelocity(state.x, state.y, target.x, topY, 0.42);
        enter(brain, 'st_airborne');
        brain.targetId = id;
        brain.action = 'sleep';
        brain.selfLaunched = true;
        brain.airPeak = 0;
        brain.airTop = state.y;
        out.notices.push({ type: 'hopped' });
        return out;
      }
      out.notices.push(...enterSleep(brain, def, state.x));
      return out;
    }
    case 'shelter': {
      // Up over its head it goes: an umbrella.
      if (world.isSetup(id) || brain.carrying !== null || world.bugs().some((o) => o.brain.carrying === id))
        return giveUp();
      brain.carrying = id;
      brain.umbrella = true;
      recordUse(brain, id, tick);
      addNeeds(brain.needs, { need_fun: 4 });
      out.notices.push({ type: 'umbrella', itemId: id, on: true });
      enterIdle(brain, rng, def);
      return out;
    }
    case 'lift': {
      if (target.kind === 'bug') {
        // Moose pulls a friend free of something sticky.
        const friend = world.bug(id);
        if (!friend) return giveUp();
        addNeeds(brain.needs, { need_social: 20, need_fun: 6 });
        recordUse(brain, id, tick);
        out.notices.push({ type: 'freed', partnerId: id }, react(brain, 'play', rng, tick));
        enter(brain, 'st_react', 50);
        return out;
      }
      // Up over his head it goes.
      if (world.isSetup(id) || brain.carrying !== null || world.bugs().some((o) => o.brain.carrying === id))
        return giveUp();
      brain.carrying = id;
      brain.overhead = true;
      recordUse(brain, id, tick);
      addNeeds(brain.needs, { need_fun: 14 });
      out.notices.push({ type: 'used', action: 'lift', targetId: id });
      enter(brain, 'st_idle', 50);
      brain.targetId = id;
      brain.action = null;
      return out;
    }
    case 'roll': {
      // Barty gets behind a round thing and rolls it along, walking backward.
      if (world.isSetup(id) || brain.carrying !== null || world.bugs().some((o) => o.brain.carrying === id))
        return giveUp();
      brain.carrying = id;
      brain.rolling = true;
      recordUse(brain, id, tick);
      addNeeds(brain.needs, { need_fun: 10 });
      const away = rng.chance(0.5) ? 1 : -1;
      startWander(brain, ctx, state.x + away * rng.range(ROLL_WALK[0], ROLL_WALK[1]));
      out.notices.push({ type: 'used', action: 'roll', targetId: id });
      return out;
    }
    case 'tinker':
    case 'brew':
      // Something for the bench or the cauldron: pick it up and take it there.
      if (!carryToMachine(brain, ctx, id)) return giveUp();
      return out;
    case 'carry': {
      if (world.isSetup(id) || world.bugs().some((o) => o.brain.carrying === id)) return giveUp();
      const row = rowSlots(brain, ctx);
      const slot = row.free[0];
      if (slot === undefined) return giveUp();
      // Pick it up and take it to the next free place in the row, arms out over the spot.
      brain.carrying = id;
      brain.targetId = SPOT_ROW;
      brain.targetX = slot - def.radius * 0.95;
      brain.timer = SEEK_TIMEOUT;
      return out;
    }
    default:
      return giveUp();
  }
}

/** Walk, and give up if the way is blocked. */
function walkOrGiveUp(
  brain: BugBrain,
  ctx: BugContext,
  dx: number,
  moved: number,
  out: BugDecision,
  giveUp: () => BugDecision,
): BugDecision {
  if (!ctx.support) return out;
  if (stepToward(brain, ctx, dx, moved, out) === 'blocked') return giveUp();
  return out;
}

/**
 * Swimming (game design doc, section 5, `st_swim`): paddle, float, or walk
 * the bottom toward the nearest shore, then shake dry on land. Boing kicks
 * furiously and shoots out in one big hop.
 */
export function swim(brain: BugBrain, ctx: BugContext, moved: number, out: BugDecision): BugDecision {
  const { def, state } = ctx;
  const n = ctx.support;
  const depth = ctx.submerged ?? 0;
  if (depth < 0.06 && n) {
    // Out of the water and on its feet: shake it all off.
    enter(brain, 'st_react', SHAKE_DRY_TICKS);
    out.notices.push({ type: 'shook_dry' }, react(brain, 'shake_dry', ctx.rng, ctx.tick));
    out.velocity = grip(n);
    return out;
  }
  const shore = ctx.shore ?? state.x;
  const dir: 1 | -1 = shore >= state.x ? 1 : -1;
  brain.facing = dir;
  brain.timer++;
  if (def.habits.hops && brain.timer === 40) {
    const dist = Math.abs(shore - state.x) + 1;
    out.velocity = { x: dir * Math.min(7, dist / 0.9), y: -9.5 };
    out.notices.push({ type: 'hopped' });
    return out;
  }
  brain.stuck = moved < 0.004 ? brain.stuck + 1 : 0;
  if (brain.stuck > STUCK_TICKS && (n || def.swim !== 'sink')) {
    // Bumping a lily pad or a steep bank: kick up and over.
    brain.stuck = 0;
    out.velocity = { x: dir * 2.2, y: -6 };
    out.notices.push({ type: 'hopped' });
    return out;
  }
  if (def.swim === 'sink') {
    // Holding his breath, walking along the bottom.
    out.velocity = n ? walkVelocity(n, dir * def.speed * 0.7) : { x: dir * def.speed * 0.3, y: state.vy };
    return out;
  }
  if (n && depth < 0.5) {
    // Touching the bank: climb out.
    out.velocity = walkVelocity(n, dir * Math.max(1, def.speed));
    return out;
  }
  // Paddle: little surges in rhythm.
  const stroke = 0.6 + 0.4 * Math.max(0, Math.sin(ctx.tick * 0.25));
  out.velocity = { x: dir * Math.max(0.6, def.speed * 0.55) * stroke, y: state.vy };
  return out;
}

export function offeredNear(ctx: BugContext): boolean {
  const o = ctx.offered;
  return !!o && !!ctx.support && Math.hypot(o.x - ctx.state.x, o.y - ctx.state.y) < OFFER_RANGE;
}
