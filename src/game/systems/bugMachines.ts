// The machines of the newer areas, used by bugs on their own (review R20,
// principle 13 of the play research): a bored bug pushes the sundial's rim a
// notch and watches the sky change, a wishing bug tosses one ingredient of its
// wish into an empty bench tray, a bug drops something in the empty cauldron
// and stirs it, and bugs ride the leaf slide and wade through the bead pit.
// Each one is rare enough to be a little event, and keeps the setup rule.

import type { BugBrain, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { AdvertCandidate, BugContext, BugDecision, Machines } from './bugTypes';
import {
  EMPTY_WORLD,
  SPOT_BEADS,
  SPOT_CAULDRON,
  SPOT_DIAL,
  SPOT_SLIDE,
  SPOT_TRASH,
  SPOT_TRAY,
} from './bugTypes';
import {
  SEEK_TIMEOUT,
  clearIntent,
  clearLanding,
  enter,
  enterIdle,
  grip,
  hopVelocity,
  launch,
  react,
  recordUse,
  walkVelocity,
} from './bugMove';
import { handPoint } from './bugSocial';
import { addNeeds } from './needs';
import { PERCEPTION } from './bugTuning';

/** A bug uses some machine at most this often. */
export const MACHINE_REST = 75 * SIM_HZ;
/** The sundial gets pushed by some bug at most once in this long (it moves everyone's day on). */
export const DIAL_GAP = 5 * 60 * SIM_HZ;
/** A bug brews in the cauldron at most this often, counting every bug. */
export const CAULDRON_GAP = 4 * 60 * SIM_HZ;
/** Bench trays: one bug's toss at a time. */
export const TRAY_GAP = 40 * SIM_HZ;
/** The slide and the bead pit wait this long before the same bug goes again. */
export const PLAY_REST = 50 * SIM_HZ;
/** One push of the sundial's rim: this many game minutes, two hours of sky in two seconds. */
export const DIAL_MINUTES = 120;
/** Things this close to the bench or the cauldron are fair game to carry there. */
export const MACHINE_RANGE = 8;
/** Stirring: radians a second, and how long a bug keeps at it. */
export const STIR_RATE = 2.6;
export const STIR_TICKS = 6 * SIM_HZ;
/** A bug that loves the trash can dives in at most this often, and some bug at most this often. */
export const RUMMAGE_REST = 100 * SIM_HZ;
export const RUMMAGE_GAP = 30 * SIM_HZ;
/** A rummage lasts this long: a dive, legs kicking, and up it comes. */
export const RUMMAGE_TICKS = 150;
/** How long a wish lasts (set by the bench). */
export const WISH_TICKS = 40 * SIM_HZ;

const PUSH_TICKS = 70;
const PUSH_AT = 40;
const TOSS_WINDUP = 36;
const SKID_TICKS = 24;

export type MachineKind = 'dial' | 'tray' | 'cauldron' | 'slide' | 'beads' | 'trash';

/** The actions that run as machine use in `st_use`. */
export const MACHINE_ACTIONS: ReadonlySet<string> = new Set([
  'turn',
  'tinker',
  'brew',
  'slide',
  'wade',
  'rummage',
]);

function lastUse(brain: BugBrain, kind: MachineKind): number {
  return brain.machines?.[kind] ?? -Infinity;
}

function markUse(brain: BugBrain, kind: MachineKind, tick: number): void {
  brain.machines = { ...(brain.machines ?? {}), [kind]: tick };
}

/** Has this bug rested from machines long enough (and from this one for `rest`)? */
function rested(brain: BugBrain, kind: MachineKind, tick: number, rest: number): boolean {
  const any = Math.max(-Infinity, ...Object.values(brain.machines ?? {}));
  return tick - any >= MACHINE_REST && tick - lastUse(brain, kind) >= rest;
}

/** Did any bug use this machine within `gap`? */
function usedLately(ctx: BugContext, kind: MachineKind, gap: number): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  return world.bugs().some((o) => ctx.tick - lastUse(o.brain, kind) < gap);
}

/** Is another bug already going for this spot or thing? */
function taken(me: EntityId, ctx: BugContext, id: EntityId, max = 1): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  const others = world
    .bugs()
    .filter((o) => o.id !== me && (o.brain.targetId === id || o.brain.carrying === id)).length;
  return others >= max;
}

function machinesOf(ctx: BugContext): Machines | null {
  return ctx.world?.machines?.() ?? null;
}

/** Where to stand beside something `half` wide, on the near side. */
function besideX(fromX: number, x: number, half: number, radius: number): number {
  const side = fromX <= x ? -1 : 1;
  return x + side * (half + radius + 0.1);
}

/** The machine adverts for this bug right now: spots to go to, and things to carry to a machine. */
export function machineAdverts(me: EntityId, brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const m = machinesOf(ctx);
  if (!m || brain.carrying !== null || brain.pending) return [];
  const { def, state, tick } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  const n = brain.needs;
  const out: AdvertCandidate[] = [];
  // In sight, and no wall (the claw machine's tall jar) in the way.
  const near = (x: number, y: number): boolean =>
    Math.abs(x - state.x) < PERCEPTION &&
    Math.abs(y - state.y) < 3 &&
    !m.walls.some((w) => w.x1 > Math.min(x, state.x) && w.x0 < Math.max(x, state.x));
  const spot = (
    id: EntityId,
    x: number,
    y: number,
    action: AdvertCandidate['action'],
    fun: number,
    bonus = 0,
  ) =>
    out.push({
      id,
      defId: '',
      x,
      y,
      action,
      needs: { need_fun: fun },
      claimed: taken(me, ctx, id),
      like: 1,
      bonus,
    });

  // A bored day bug pushes the sundial's rim a notch, and watches the sky change.
  if (
    m.dial &&
    m.dial.turnable &&
    def.active !== 'night' &&
    n.need_fun < 50 &&
    n.need_energy > 30 &&
    !ctx.sky?.dark &&
    near(m.dial.x, m.dial.y) &&
    rested(brain, 'dial', tick, DIAL_GAP) &&
    !usedLately(ctx, 'dial', DIAL_GAP)
  )
    spot(SPOT_DIAL, besideX(state.x, m.dial.x, 0.55, def.radius), m.dial.y, 'turn', 12);

  // A wishing bug takes one ingredient of its wish to an empty tray.
  const wish = brain.wish && tick < brain.wish.until ? brain.wish : null;
  const bench = m.bench;
  if (
    wish &&
    bench &&
    bench.trays.length > 0 &&
    rested(brain, 'tray', tick, TRAY_GAP) &&
    !usedLately(ctx, 'tray', TRAY_GAP)
  ) {
    const mid = (bench.x0 + bench.x1) / 2;
    for (const l of world.loose())
      if (
        Math.abs(l.x - mid) < MACHINE_RANGE &&
        l.speed < 0.3 &&
        l.y > bench.y + 0.4 &&
        Math.abs(l.y - state.y) < 2 &&
        !taken(me, ctx, l.id) &&
        bench.fits(wish.recipe, l.id)
      )
        out.push({
          id: l.id,
          defId: l.defId,
          x: l.x,
          y: l.y,
          action: 'tinker',
          needs: { need_fun: 26 },
          claimed: false,
          like: 1.4,
          bonus: 10,
        });
  }

  // Something for the empty cauldron: in it goes, and a good stir.
  const pot = m.cauldron;
  if (
    pot &&
    pot.ready &&
    pot.count === 0 &&
    n.need_fun < 60 &&
    n.need_energy > 30 &&
    rested(brain, 'cauldron', tick, CAULDRON_GAP) &&
    !usedLately(ctx, 'cauldron', CAULDRON_GAP)
  )
    for (const l of world.loose())
      if (
        Math.abs(l.x - pot.x) < MACHINE_RANGE &&
        l.speed < 0.3 &&
        l.top > pot.y &&
        Math.abs(l.y - state.y) < 2.5 &&
        !taken(me, ctx, l.id) &&
        pot.ingredient(l.id)
      )
        out.push({
          id: l.id,
          defId: l.defId,
          x: l.x,
          y: l.y,
          action: 'brew',
          needs: { need_fun: 28 },
          claimed: false,
          like: 1.2,
          bonus: 6,
        });

  // Rollo, Barty, and Whiff love the trash can (playtest F1): a dive in, legs kicking, and up with whatever is in it.
  const can = m.trash;
  if (
    can &&
    def.habits.rummages &&
    n.need_fun < 75 &&
    n.need_energy > 25 &&
    Math.abs(can.ground - state.y) < 2 &&
    near(can.x, can.ground - 0.5) &&
    rested(brain, 'trash', tick, RUMMAGE_REST) &&
    !usedLately(ctx, 'trash', RUMMAGE_GAP)
  )
    spot(
      SPOT_TRASH,
      besideX(state.x, can.x, 0.75, def.radius),
      can.ground,
      'rummage',
      24,
      can.count > 0 ? 14 : 5,
    );

  // The treehouse: up the leaf and slide down it, or a wade through the beads.
  const playful = n.need_fun < 85 && n.need_energy > 30;
  if (playful && m.slide && near(m.slide.topX, m.slide.topY + 3) && rested(brain, 'slide', tick, PLAY_REST))
    spot(SPOT_SLIDE, m.slide.topX, m.slide.topY, 'slide', 30, 4);
  if (
    playful &&
    m.beads &&
    near((m.beads.x0 + m.beads.x1) / 2, m.beads.y) &&
    rested(brain, 'beads', tick, PLAY_REST)
  ) {
    const x = (m.beads.x0 + m.beads.x1) / 2 + ((tick % 5) - 2) * 0.7;
    spot(SPOT_BEADS, x, m.beads.y, 'wade', 30, 4);
    out[out.length - 1]!.claimed = taken(me, ctx, SPOT_BEADS, 2);
  }
  return out;
}

/** Picked up a thing to take to a machine (`tinker` or `brew`). False if it cannot. */
export function carryToMachine(brain: BugBrain, ctx: BugContext, itemId: EntityId): boolean {
  const m = machinesOf(ctx);
  const world = ctx.world ?? EMPTY_WORLD;
  if (!m || world.isSetup(itemId) || world.bugs().some((o) => o.brain.carrying === itemId)) return false;
  const { state, def } = ctx;
  let x: number;
  if (brain.action === 'tinker') {
    if (!m.bench || m.bench.trays.length === 0) return false;
    // Stand just off the end of the table, on the side nearest the tray it means to fill.
    const tray = nearestTray(m.bench.trays, state.x)!;
    const mid = (m.bench.x0 + m.bench.x1) / 2;
    x = tray.x < mid ? m.bench.x0 - def.radius - 0.6 : m.bench.x1 + def.radius + 0.6;
    brain.targetId = SPOT_TRAY;
  } else {
    if (!m.cauldron || !m.cauldron.ready || m.cauldron.count > 0) return false;
    x = besideX(state.x, m.cauldron.x, 1.5, def.radius);
    brain.targetId = SPOT_CAULDRON;
  }
  const reach = ctx.reach ?? { x0: 0, x1: ctx.worldWidth };
  if (x < reach.x0 + def.radius + 0.3 || x > reach.x1 - def.radius - 0.3) return false;
  brain.carrying = itemId;
  brain.targetX = x;
  brain.timer = SEEK_TIMEOUT + Math.round((Math.abs(x - state.x) / def.speed) * SIM_HZ);
  return true;
}

function nearestTray<T extends { x: number }>(trays: readonly T[], x: number): T | undefined {
  return [...trays].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
}

/**
 * Got to a machine spot (`seek`, place branch). Starts using it and returns
 * true, or returns false to give up.
 */
export function arriveAtMachine(brain: BugBrain, ctx: BugContext, id: EntityId, out: BugDecision): boolean {
  const m = machinesOf(ctx);
  const { state, rng, tick, def } = ctx;
  const n = ctx.support;
  if (!m || !n) return false;
  const start = (action: 'turn' | 'tinker' | 'brew' | 'slide' | 'wade' | 'rummage', ticks: number): void => {
    enter(brain, 'st_use', ticks);
    brain.targetId = id;
    brain.action = action;
    brain.done = false;
  };
  switch (id) {
    case SPOT_DIAL:
      if (!m.dial?.turnable) return false;
      brain.facing = m.dial.x >= state.x ? 1 : -1;
      start('turn', PUSH_TICKS);
      out.velocity = grip(n);
      return true;
    case SPOT_TRAY:
    case SPOT_CAULDRON: {
      if (brain.carrying === null) return false;
      const to = id === SPOT_TRAY ? m.bench && nearestTray(m.bench.trays, state.x) : m.cauldron;
      if (!to || (id === SPOT_CAULDRON && (!m.cauldron!.ready || m.cauldron!.count > 0))) return false;
      brain.facing = to.x >= state.x ? 1 : -1;
      start(id === SPOT_TRAY ? 'tinker' : 'brew', TOSS_WINDUP);
      out.velocity = grip(n);
      return true;
    }
    case SPOT_SLIDE: {
      if (!m.slide || state.y > m.slide.topY + 0.8) return false;
      start('slide', 5 * SIM_HZ);
      brain.facing = m.slide.bottomX < state.x ? -1 : 1;
      out.velocity = { x: brain.facing * 1.6, y: 0.4 };
      out.notices.push(react(brain, 'whee', rng, tick));
      return true;
    }
    case SPOT_TRASH:
      if (!m.trash || Math.abs(m.trash.x - state.x) > 0.75 + def.radius + 0.6) return false;
      brain.facing = m.trash.x >= state.x ? 1 : -1;
      start('rummage', RUMMAGE_TICKS);
      out.velocity = grip(n);
      return true;
    case SPOT_BEADS:
      if (!m.beads || state.y < m.beads.y - def.radius - 1.2) return false;
      start('wade', rng.int(3 * SIM_HZ, 5 * SIM_HZ));
      out.velocity = grip(n);
      out.notices.push(react(brain, 'whee', rng, tick));
      return true;
    default:
      return false;
  }
}

/** Is this bug riding the slide right now? Physics has it: it counts as off its feet. */
export function sliding(brain: BugBrain): boolean {
  return brain.mode === 'st_use' && brain.action === 'slide' && !brain.done;
}

/** Using a machine (`st_use` with a machine action). */
export function useMachine(brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const m = machinesOf(ctx);
  const { state, rng, tick, def } = ctx;
  const n = ctx.support;
  const done = (kind: MachineKind, spot: EntityId, fun: number): void => {
    addNeeds(brain.needs, { need_fun: fun });
    recordUse(brain, spot, tick);
    markUse(brain, kind, tick);
    out.notices.push({ type: 'used', action: brain.action as 'turn', targetId: null });
  };
  switch (brain.action) {
    case 'turn': {
      out.velocity = n ? grip(n) : null;
      brain.timer--;
      if (brain.timer === PUSH_AT) {
        if (!m?.dial?.turnable) {
          enterIdle(brain, rng, def);
          return out;
        }
        // Shoulder to the rim: a notch forward, and the sky sweeps on.
        out.notices.push(
          { type: 'fidgeted', fidget: 'stretch' },
          { type: 'turned_dial', minutes: DIAL_MINUTES },
        );
        done('dial', SPOT_DIAL, 22);
      }
      if (brain.timer > 0) return out;
      // Then a long look up at the sky going by.
      enter(brain, 'st_react', 110);
      clearIntent(brain);
      out.notices.push(react(brain, 'wonder', rng, tick));
      return out;
    }
    case 'tinker':
    case 'brew': {
      out.velocity = n ? grip(n) : null;
      if (!brain.done) {
        if (--brain.timer > 0) return out;
        const itemId = brain.carrying;
        const tray = brain.action === 'tinker' && m?.bench ? nearestTray(m.bench.trays, state.x) : null;
        const to =
          brain.action === 'tinker'
            ? tray && m?.bench
              ? { x: tray.x, y: m.bench.y - 0.35 }
              : null
            : m?.cauldron?.ready && m.cauldron.count === 0
              ? { x: m.cauldron.x - brain.facing * 0.25, y: m.cauldron.y + 0.2 }
              : null;
        if (itemId === null || !to || !n || !tossClear(ctx, to.x)) {
          enterIdle(brain, rng, def);
          return out;
        }
        // Up and in it goes, in a little arc.
        const hand = handPoint(state.x, state.y, def.radius, brain.facing);
        const v = hopVelocity(hand.x, hand.y, to.x, to.y, 0.75 + Math.abs(to.x - hand.x) * 0.09);
        out.throw = { itemId, vx: v.x, vy: v.y, to: -1 };
        out.notices.push({
          type: 'tossed',
          itemId,
          into: brain.action === 'tinker' ? 'tray' : 'cauldron',
          tray: tray?.i ?? -1,
        });
        brain.carrying = null;
        if (brain.action === 'tinker') {
          done('tray', SPOT_TRAY, 16);
          delete brain.wish;
          enter(brain, 'st_react', 70);
          clearIntent(brain);
          out.notices.push(react(brain, 'cheer', rng, tick));
          return out;
        }
        // Counted now: once it bubbles, the cheer ends the stirring.
        done('cauldron', SPOT_CAULDRON, 16);
        brain.done = true;
        brain.timer = STIR_TICKS;
        return out;
      }
      // Stirring: round and round with the ladle until it bubbles.
      const pot = m?.cauldron;
      const missed = brain.timer < STIR_TICKS - 50 && (pot?.count ?? 0) === 0;
      if (--brain.timer <= 0 || !pot || !pot.ready || pot.count > 1 || missed) {
        if (!missed) addNeeds(brain.needs, { need_fun: 10 });
        enterIdle(brain, rng, def);
        return out;
      }
      if (pot.count === 1 && brain.timer % 10 === 0)
        out.notices.push({ type: 'stirred', radians: (STIR_RATE * 10) / SIM_HZ });
      if (brain.timer % 40 === 0) brain.facing = brain.facing === 1 ? -1 : 1;
      if (brain.timer % 40 === 20) brain.facing = pot.x >= state.x ? 1 : -1;
      return out;
    }
    case 'slide': {
      const slide = m?.slide;
      if (!brain.done) {
        // Whee: physics has it, all the way down.
        out.velocity = null;
        const past = slide ? (state.x - slide.bottomX) * brain.facing > 0.3 : true;
        if (--brain.timer <= 0 || (n && past && state.y > (slide?.topY ?? 0) + 2)) {
          brain.done = true;
          brain.timer = SKID_TICKS;
          done('slide', SPOT_SLIDE, 24);
        }
        return out;
      }
      // A skid to a stop at the bottom, and a happy face.
      out.velocity = n ? walkVelocity(n, state.vx * 0.85) : null;
      if (--brain.timer > 0) return out;
      enter(brain, 'st_react', 60);
      clearIntent(brain);
      out.notices.push(react(brain, 'play', rng, tick));
      out.velocity = n ? grip(n) : null;
      return out;
    }
    case 'wade': {
      const pit = m?.beads;
      if (!pit || !n) {
        out.velocity = n ? grip(n) : null;
        if (!pit) enterIdle(brain, rng, def);
        return out;
      }
      if (--brain.timer > 0) {
        // Slow and swishy, back and forth through the beads.
        if (state.x < pit.x0 + 0.3) brain.facing = 1;
        else if (state.x > pit.x1 - 0.3) brain.facing = -1;
        else if (brain.timer % 70 === 0) brain.facing = rng.chance(0.5) ? 1 : -1;
        out.velocity = walkVelocity(n, brain.facing * def.speed * 0.4);
        return out;
      }
      done('beads', SPOT_BEADS, 20);
      // Out over the rim in one hop, on the nearer side.
      const left = state.x - pit.x0 < pit.x1 - state.x;
      const world = ctx.world ?? EMPTY_WORLD;
      for (const side of left ? [-1, 1] : [1, -1]) {
        const landX = side < 0 ? pit.x0 - 1.3 : pit.x1 + 1.3;
        if (!clearLanding(ctx, landX)) continue;
        clearIntent(brain);
        brain.facing = side < 0 ? -1 : 1;
        launch(
          brain,
          out,
          hopVelocity(state.x, state.y, landX, world.surfaceY(landX) - def.radius - 0.05, 0.6),
          state.y,
        );
        brain.resume = null;
        return out;
      }
      enterIdle(brain, rng, def);
      out.velocity = grip(n);
      return out;
    }
    case 'rummage': {
      // Head first in the can, legs kicking; then up, with whatever was in there.
      out.velocity = n ? grip(n) : null;
      if (m?.trash) brain.facing = m.trash.x >= state.x ? 1 : -1;
      if (--brain.timer > 0) return out;
      done('trash', SPOT_TRASH, 24);
      enter(brain, 'st_react', 80);
      clearIntent(brain);
      out.notices.push({ type: 'rummaged' });
      return out;
    }
    default:
      enterIdle(brain, rng, def);
      return out;
  }
}

/** No player setup under a toss from here to x (the setup rule). */
function tossClear(ctx: BugContext, x: number): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  const from = ctx.state.x;
  const dir = x >= from ? 1 : -1;
  // Up to just short of where it lands: that tray or the cauldron's mouth is empty.
  return !world.setupBetween(Math.min(from, x - dir * 0.55), Math.max(from, x - dir * 0.55));
}
