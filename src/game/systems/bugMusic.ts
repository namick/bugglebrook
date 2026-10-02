// Bugs making music on their own (game design doc, section 10, "How bugs
// play"): a bored bug walks up to an instrument lying about, stands beside
// it, and plays it for 8 to 24 beats; and now and then a bug hops on the caps
// of the mushroom sequencer, but only while the player's grid is empty, with
// a pattern of its own that goes when it leaves. The sim decides who plays
// what and for how long; the renderer's music toys play the notes on the
// music clock. Instruments are played where they lie, never carried off, and
// player setups are left alone (the setup rule).

import type { BugBrain, EntityId } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { AdvertCandidate, BugContext, BugDecision } from './bugTypes';
import { EMPTY_WORLD, SPOT_CAPS } from './bugTypes';
import { clearIntent, enter, enterIdle, grip, react, recordUse } from './bugMove';
import { addNeeds } from './needs';
import { PERCEPTION } from './bugTuning';
import { SEQ_COLS, SEQ_ROWS } from './sequencer';

/** Sim ticks in a beat at the day tempo (96 BPM). The music clock does the real timing. */
export const BEAT_TICKS = Math.round((60 / 96) * SIM_HZ);
/** A bug plays for this many beats (section 10). */
export const PLAY_BEATS: readonly [number, number] = [8, 24];
/** A bug plays an instrument at most this often. */
export const PLAY_REST = 60 * SIM_HZ;
/** Hopping on the sequencer: how long, how often a cap, and how often per bug. */
export const TAP_TICKS: readonly [number, number] = [8 * SIM_HZ, 14 * SIM_HZ];
export const TAP_EVERY = 40;
export const TAP_REST = 2 * 60 * SIM_HZ;
/** Playing is fun: section 10's `play_instrument` advert. */
export const PLAY_FUN = 20;

type MusicKind = 'play' | 'tap';

function lastUse(brain: BugBrain, kind: MusicKind): number {
  return brain.machines?.[kind] ?? -Infinity;
}

function markUse(brain: BugBrain, kind: MusicKind, tick: number): void {
  brain.machines = { ...(brain.machines ?? {}), [kind]: tick };
}

/** In the mood for some music: not too full of fun, awake enough, and rested from the last tune. */
function inTheMood(brain: BugBrain, ctx: BugContext, kind: MusicKind, rest: number): boolean {
  const n = brain.needs;
  return n.need_fun < 80 && n.need_energy > 25 && ctx.tick - lastUse(brain, kind) >= rest;
}

/** May this bug go and play the instrument `id` (an item advert)? */
export function canPlay(me: EntityId, brain: BugBrain, ctx: BugContext, id: EntityId): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  if (brain.carrying !== null || brain.pending || world.isSetup(id)) return false;
  if (!inTheMood(brain, ctx, 'play', PLAY_REST)) return false;
  // One player per instrument.
  return !world.bugs().some((o) => o.id !== me && o.brain.targetId === id && o.brain.action === 'play');
}

/** The sequencer's caps, when the player's grid is empty and nobody else is on them. */
export function musicAdverts(me: EntityId, brain: BugBrain, ctx: BugContext): AdvertCandidate[] {
  const seq = ctx.world?.machines?.()?.sequencer;
  if (!seq || !seq.free || brain.carrying !== null || brain.pending) return [];
  if (!inTheMood(brain, ctx, 'tap', TAP_REST)) return [];
  const x = (seq.x0 + seq.x1) / 2 + ((ctx.tick % 7) - 3) * 0.3;
  if (Math.abs(x - ctx.state.x) > PERCEPTION || Math.abs(seq.y - ctx.state.y) > 3) return [];
  const world = ctx.world ?? EMPTY_WORLD;
  const claimed = world.bugs().some((o) => o.id !== me && o.brain.targetId === SPOT_CAPS);
  return [
    {
      id: SPOT_CAPS,
      defId: '',
      x,
      y: seq.y,
      action: 'tap',
      needs: { need_fun: 24 },
      claimed,
      like: 1,
      bonus: 2,
    },
  ];
}

/** Got beside an instrument (`seek`, item branch): start playing it. */
export function startPlaying(brain: BugBrain, ctx: BugContext, id: EntityId, out: BugDecision): boolean {
  const world = ctx.world ?? EMPTY_WORLD;
  const target = ctx.target(id);
  if (!target || target.held || world.isSetup(id) || !ctx.support) return false;
  const beats = ctx.rng.int(PLAY_BEATS[0], PLAY_BEATS[1]);
  enter(brain, 'st_use', beats * BEAT_TICKS);
  brain.targetId = id;
  brain.action = 'play';
  brain.done = false;
  brain.facing = target.x >= ctx.state.x ? 1 : -1;
  out.velocity = grip(ctx.support);
  out.notices.push({ type: 'played', itemId: id, beats });
  return true;
}

/** Got to the sequencer's bank (`seek`, place branch): start hopping on its caps. */
export function arriveAtCaps(brain: BugBrain, ctx: BugContext, out: BugDecision): boolean {
  const seq = ctx.world?.machines?.()?.sequencer;
  if (!seq || !seq.free || !ctx.support) return false;
  enter(brain, 'st_use', ctx.rng.int(TAP_TICKS[0], TAP_TICKS[1]));
  brain.targetId = SPOT_CAPS;
  brain.action = 'tap';
  brain.done = false;
  out.velocity = grip(ctx.support);
  out.notices.push(react(brain, 'play', ctx.rng, ctx.tick));
  return true;
}

/** Playing (`st_use` with `play` or `tap`). */
export function useMusic(me: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const { rng, tick, def } = ctx;
  out.velocity = ctx.support ? grip(ctx.support) : null;
  const finish = (kind: MusicKind, fun: number): BugDecision => {
    addNeeds(brain.needs, { need_fun: fun });
    markUse(brain, kind, tick);
    if (brain.targetId !== null) recordUse(brain, brain.targetId, tick);
    out.notices.push({ type: 'used', action: kind, targetId: kind === 'play' ? brain.targetId : null });
    if (kind === 'tap') out.notices.push({ type: 'left_caps' });
    enter(brain, 'st_react', 60);
    clearIntent(brain);
    out.notices.push(react(brain, 'cheer', rng, tick));
    return out;
  };
  if (brain.action === 'play') {
    const id = brain.targetId;
    const target = id === null ? null : ctx.target(id);
    // Picked up, carried off, or rolled away: the tune stops.
    if (!target || target.held || Math.abs(target.x - ctx.state.x) > def.radius + target.halfWidth + 0.6) {
      enterIdle(brain, rng, def);
      return out;
    }
    brain.facing = target.x >= ctx.state.x ? 1 : -1;
    if (--brain.timer > 0) return out;
    return finish('play', PLAY_FUN);
  }
  // Tapping the sequencer's caps. The player started a pattern: off it hops.
  const seq = ctx.world?.machines?.()?.sequencer;
  if (!seq || (!seq.free && seq.tapper !== me)) {
    out.notices.push({ type: 'left_caps' });
    enterIdle(brain, rng, def);
    return out;
  }
  if (brain.timer % TAP_EVERY === 0) {
    brain.done = true;
    out.notices.push(
      { type: 'tapped_cap', row: rng.int(0, SEQ_ROWS - 1), col: rng.int(0, SEQ_COLS - 1) },
      { type: 'hopped' },
    );
    brain.facing = rng.chance(0.5) ? 1 : -1;
  }
  if (--brain.timer > 0) return out;
  return finish('tap', 24);
}
