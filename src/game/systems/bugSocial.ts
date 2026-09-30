import type { BugBrain, EntityId, SocialKind, SocialState } from '../core/entities';
import { SOCIAL_KINDS } from '../core/entities';
import { SIM_HZ } from '../core/loop';
import type { BugDef, NeedId } from '../data/types';
import type { ChatTopic } from '../events';
import { CHAT_TOPICS } from '../events';
import type { BugContext, BugDecision, OtherBug } from './bugTypes';
import { EMPTY_WORLD } from './bugTypes';
import {
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
} from './bugMove';
import { addNeeds } from './needs';

/**
 * Bugs playing together (game design doc, section 5, "Bug to bug
 * interactions"). The bug that started an interaction (`lead`) runs it: it
 * keeps the count and the beat, and speaks for both sides in its notices.
 * The other bug (`follow`) moves in its own update, reading the lead's state.
 */

/** How long one line of a chat lasts. */
export const CHAT_BEAT = 72;
const BUMP_TICKS = 72;
const BUMP_HOP = 60;
const BUMP_BOOP = 44;
/** After a tag, the new chaser counts to three before running. */
export const TAG_FREEZE = 45;
const SHARE_BEAT = 55;
const COMFORT_TICKS = 84;
const COMFORT_PAT = 44;
/** Holding the toy a moment before each throw. */
export const CATCH_WINDUP = 40;
/** A throw not caught by then is a miss. */
const CATCH_FLIGHT = 110;
/** How far apart two bugs play catch, in meters. */
export const CATCH_NEAR = 1.7;
export const CATCH_FAR = 4.2;

/** What playing together is worth (game design doc: social +15 to +30). */
export const SOCIAL_REWARD: Readonly<Record<SocialKind, Readonly<Partial<Record<NeedId, number>>>>> = {
  soc_chat: { need_social: 25, need_fun: 5 },
  soc_bump: { need_social: 15, need_fun: 8 },
  soc_tag: { need_social: 20, need_fun: 25, need_energy: -6 },
  soc_share_food: { need_social: 25 },
  soc_catch: { need_social: 20, need_fun: 30, need_energy: -4 },
  soc_comfort: { need_social: 20 },
  soc_steal: { need_social: 10, need_fun: 20 },
  soc_ride: { need_social: 12, need_fun: 20 },
};

/** Affinity nudges after playing together (sharing food is +0.05). */
const NUDGE: Readonly<Record<SocialKind, number>> = {
  soc_chat: 0.01,
  soc_bump: 0.01,
  soc_tag: 0.02,
  soc_share_food: 0.05,
  soc_catch: 0.03,
  soc_comfort: 0.03,
  soc_steal: 0.01,
  soc_ride: 0.01,
};

/** Interactions where both bugs take part; the rest (comfort, ride) need only the lead. */
const TWO_SIDED: ReadonlySet<SocialKind> = new Set([
  'soc_chat',
  'soc_bump',
  'soc_tag',
  'soc_share_food',
  'soc_catch',
  'soc_steal',
]);

/** Can this bug be asked to play right now? */
export function available(o: OtherBug): boolean {
  const b = o.brain;
  return (
    !o.held &&
    o.supported &&
    b.social === null &&
    b.mouthful === null &&
    b.carrying === null &&
    (b.mode === 'st_idle' || b.mode === 'st_wander') &&
    b.needs.need_energy > 15
  );
}

/** The state that runs an interaction: the lead's copy. */
export function leadState(brain: BugBrain, partner: OtherBug | null): SocialState | null {
  const s = brain.social;
  if (!s) return null;
  if (s.role === 'lead') return s;
  return partner?.brain.social ?? null;
}

/** Whose turn it is to throw in a game of catch. */
export function catchTurn(lead: EntityId, follow: EntityId, s: SocialState): EntityId {
  return s.count % 2 === 0 ? lead : follow;
}

/**
 * Start an interaction with `p`. Two-sided ones pull the partner in too. The
 * lead may already hold the toy or snack (catch, share).
 */
export function engage(
  meId: EntityId,
  brain: BugBrain,
  p: OtherBug,
  kind: SocialKind,
  ctx: BugContext,
  out: BugDecision,
): void {
  const { rng } = ctx;
  const goal = kind === 'soc_chat' ? rng.int(3, 6) : kind === 'soc_catch' ? rng.int(4, 8) : 1;
  const left =
    kind === 'soc_tag'
      ? rng.int(5, 10) * SIM_HZ
      : kind === 'soc_steal'
        ? rng.int(4, 6) * SIM_HZ
        : kind === 'soc_ride'
          ? rng.int(3, 6) * SIM_HZ
          : 30 * SIM_HZ;
  const beat =
    kind === 'soc_chat'
      ? 16
      : kind === 'soc_bump'
        ? BUMP_TICKS
        : kind === 'soc_share_food'
          ? SHARE_BEAT
          : kind === 'soc_comfort'
            ? COMFORT_TICKS
            : kind === 'soc_tag' || kind === 'soc_steal'
              ? 20
              : 0;
  const item = brain.social?.item ?? null;
  brain.social = {
    kind,
    partner: p.id,
    role: 'lead',
    stage: 2,
    count: 0,
    goal,
    beat,
    left,
    item,
    last: null,
  };
  enter(brain, kind === 'soc_ride' ? 'st_ride' : 'st_social');
  brain.targetId = p.id;
  brain.action = kind;
  brain.timer = CATCH_WINDUP;
  if (Math.abs(p.x - ctx.state.x) > 0.05) brain.facing = p.x > ctx.state.x ? 1 : -1;
  out.notices.push({ type: 'social', partnerId: p.id, kind });
  if (!TWO_SIDED.has(kind)) return;
  const pb = p.brain;
  pb.social = {
    kind,
    partner: meId,
    role: 'follow',
    stage: 2,
    count: 0,
    goal,
    beat: 0,
    left,
    item,
    last: null,
  };
  enter(pb, 'st_social');
  pb.targetId = meId;
  pb.action = kind;
  if (Math.abs(p.x - ctx.state.x) > 0.05) pb.facing = ctx.state.x > p.x ? 1 : -1;
  out.notices.push({ type: 'social', partnerId: meId, kind, by: p.id });
}

/**
 * End an interaction for this bug and, if it is still playing along, its
 * partner. A happy ending pays out the reward and warms their affinity.
 */
export function endSocial(
  meId: EntityId,
  brain: BugBrain,
  ctx: BugContext,
  happy: boolean,
  out: BugDecision,
): void {
  const s = brain.social;
  if (!s) return;
  const world = ctx.world ?? EMPTY_WORLD;
  const p = world.bug(s.partner);
  brain.social = null;
  const toIdle = brain.mode === 'st_social' || brain.mode === 'st_ride';
  if (toIdle) enterIdle(brain, ctx.rng, ctx.def);
  if (brain.resume === 'st_social') brain.resume = 'st_idle';
  // Anything still in hand goes down.
  if (brain.carrying !== null && brain.carrying === s.item) brain.carrying = null;
  out.notices.push({ type: 'social_end', partnerId: s.partner, kind: s.kind, happy });
  const kindId = kindUseId(SOCIAL_KINDS.indexOf(s.kind));
  recordUse(brain, kindId, ctx.tick);
  recordUse(brain, s.partner, ctx.tick);
  if (happy) {
    addNeeds(brain.needs, SOCIAL_REWARD[s.kind]);
    remember(brain, s.partner, true, ctx.tick);
    out.notices.push({ type: 'affinity', partnerId: s.partner, delta: NUDGE[s.kind] });
    if (s.kind === 'soc_tag' || s.kind === 'soc_catch' || s.kind === 'soc_steal') {
      brain.reaction = null;
      if (toIdle) enter(brain, 'st_react', 70);
      out.notices.push(react(brain, 'play', ctx.rng, ctx.tick));
    }
  }
  if (!p) return;
  const ps = p.brain.social;
  if (ps && ps.partner === meId) {
    p.brain.social = null;
    if (p.brain.carrying !== null && p.brain.carrying === s.item) p.brain.carrying = null;
    const partnerIdle = p.brain.mode === 'st_social';
    if (partnerIdle) enterIdle(p.brain, ctx.rng, p.def);
    if (p.brain.resume === 'st_social') p.brain.resume = 'st_idle';
    out.notices.push({ type: 'social_end', partnerId: meId, kind: s.kind, happy, by: p.id });
    recordUse(p.brain, kindId, ctx.tick);
    recordUse(p.brain, meId, ctx.tick);
    if (happy) {
      addNeeds(p.brain.needs, SOCIAL_REWARD[s.kind]);
      remember(p.brain, meId, true, ctx.tick);
      if ((s.kind === 'soc_tag' || s.kind === 'soc_catch' || s.kind === 'soc_steal') && partnerIdle) {
        enter(p.brain, 'st_react', 70);
        out.notices.push({ ...react(p.brain, 'play', ctx.rng, ctx.tick), by: p.id });
      }
    }
  } else if (happy && !TWO_SIDED.has(s.kind) && s.kind !== 'soc_ride') {
    // Comfort: the patted bug feels better too.
    addNeeds(p.brain.needs, { need_social: 15 });
  }
}

/**
 * Something to talk about. Hungry bugs talk food, sleepy ones yawn, and
 * content ones gossip about other bugs, the sun, songs, and stars. A reply
 * answers the last line when it can.
 */
function topicFor(
  speaker: { def: BugDef; brain: BugBrain },
  partnerDef: BugDef,
  last: string | null,
  ctx: BugContext,
  gossip: string | null,
): { topic: ChatTopic; about: string | null } {
  const { rng } = ctx;
  const n = speaker.brain.needs;
  const favorite = speaker.def.loves[0] ?? speaker.def.likes[0] ?? null;
  if (last === 'question') return { topic: rng.pick(['laugh', 'star', 'heart'] as const), about: null };
  if (last === 'friend')
    return rng.chance(0.5) ? { topic: 'laugh', about: null } : { topic: 'question', about: null };
  if (last === 'food' && favorite && rng.chance(0.6)) return { topic: 'food', about: favorite };
  if (n.need_hunger < 40 && favorite) return { topic: 'food', about: favorite };
  if (n.need_energy < 35) return { topic: 'zzz', about: null };
  if (n.need_clean < 40) return { topic: 'drop', about: null };
  if (n.need_fun < 40)
    return { topic: speaker.def.likes.includes('item_spring_coil') ? 'spring' : 'star', about: null };
  const roll = rng.next();
  if (gossip && roll < 0.3) return { topic: 'friend', about: gossip };
  if (roll < 0.4) return { topic: 'friend', about: partnerDef.id };
  const plain = CHAT_TOPICS.filter((t) => t !== 'food' && t !== 'friend' && t !== 'zzz' && t !== 'drop');
  return { topic: rng.pick(plain), about: null };
}

/** Follow along with a partner who is running the interaction. */
function follow(
  meId: EntityId,
  brain: BugBrain,
  p: OtherBug,
  ctx: BugContext,
  moved: number,
  out: BugDecision,
): BugDecision {
  const ls = p.brain.social;
  const leadBusy =
    p.brain.mode === 'st_social' || (p.brain.mode === 'st_airborne' && p.brain.resume === 'st_social');
  if (!ls || ls.partner !== meId || !leadBusy || p.held) {
    const s = brain.social!;
    brain.social = null;
    if (brain.carrying !== null && brain.carrying === s.item) brain.carrying = null;
    enterIdle(brain, ctx.rng, ctx.def);
    out.notices.push({ type: 'social_end', partnerId: s.partner, kind: s.kind, happy: false });
    return out;
  }
  const dir = p.x >= ctx.state.x ? 1 : -1;
  switch (ls.kind) {
    case 'soc_bump':
      if (ls.beat === BUMP_HOP && ctx.support) {
        brain.facing = dir;
        out.velocity = { x: dir * 1.3, y: -3.2 };
        return out;
      }
      face(brain, ctx, p.x, out);
      return out;
    case 'soc_tag':
    case 'soc_steal':
      return chase(brain, p, ls, ls.count % 2 === 0, ctx, moved, out);
    case 'soc_catch':
      return catchPlay(meId, brain, p, ls, p.id, meId, ctx, moved, out);
    default:
      face(brain, ctx, p.x, out);
      return out;
  }
}

/** Run toward (chaser) or away from (runner) the partner. */
function chase(
  brain: BugBrain,
  p: OtherBug,
  s: SocialState,
  chasing: boolean,
  ctx: BugContext,
  moved: number,
  out: BugDecision,
): BugDecision {
  const n = ctx.support;
  if (!n) return out;
  const dx = p.x - ctx.state.x;
  if (chasing) {
    if (s.beat > 0) {
      // Just got tagged: count to three.
      face(brain, ctx, p.x, out);
      return out;
    }
    if (stepToward(brain, ctx, dx, moved, out, 1.15, false) === 'blocked') face(brain, ctx, p.x, out);
    return out;
  }
  const away = dx > 0 ? -1 : 1;
  // Runners dawdle a little, so games of tag have tags in them.
  if (stepToward(brain, ctx, away * 3, moved, out, 0.8, false) === 'blocked') {
    // Cornered: juke back past the chaser.
    if (stepToward(brain, ctx, -away * 3, moved, out, 0.8, false) === 'blocked') out.velocity = grip(n);
  }
  return out;
}

/**
 * One side of a game of catch. Whoever holds the toy backs off or closes in
 * to a good distance, winds up, and throws it to the other bug's front legs.
 * A miss gets fetched by whoever was meant to catch it.
 */
function catchPlay(
  meId: EntityId,
  brain: BugBrain,
  p: OtherBug,
  s: SocialState,
  leadId: EntityId,
  followId: EntityId,
  ctx: BugContext,
  moved: number,
  out: BugDecision,
): BugDecision {
  const { def, state } = ctx;
  const world = ctx.world ?? EMPTY_WORLD;
  const item = s.item;
  const info = item === null ? null : ctx.target(item);
  if (item === null || !info) {
    face(brain, ctx, p.x, out);
    return out;
  }
  const d = p.x - state.x;
  if (brain.carrying === item) {
    if (Math.abs(d) < CATCH_NEAR) {
      if (stepToward(brain, ctx, -Math.sign(d || 1) * 2, moved, out) === 'blocked')
        face(brain, ctx, p.x, out);
      brain.facing = d >= 0 ? 1 : -1;
      return out;
    }
    if (Math.abs(d) > CATCH_FAR) {
      if (stepToward(brain, ctx, d, moved, out) === 'blocked') face(brain, ctx, p.x, out);
      return out;
    }
    face(brain, ctx, p.x, out);
    if (--brain.timer > 0) return out;
    if (s.count >= s.goal) {
      s.left = 0;
      return out;
    }
    // Throw it in an arc to the partner's front legs.
    const from = handPoint(state.x, state.y, def.radius, brain.facing);
    const to = handPoint(p.x, p.y, p.def.radius, d >= 0 ? -1 : 1);
    if (world.setupBetween(Math.min(from.x, to.x) - 0.4, Math.max(from.x, to.x) + 0.4)) {
      s.left = 0;
      return out;
    }
    const v = hopVelocity(from.x, from.y, to.x, to.y, 0.55 + Math.abs(d) * 0.07);
    out.throw = { itemId: item, vx: v.x, vy: v.y, to: p.id };
    brain.carrying = null;
    s.count++;
    s.beat = CATCH_FLIGHT;
    return out;
  }
  const myTurn = catchTurn(leadId, followId, s) === meId;
  const loose = world.loose().find((l) => l.id === item);
  if (!myTurn || p.brain.carrying === item) {
    face(brain, ctx, p.brain.carrying === item ? p.x : info.x, out);
    return out;
  }
  const flying = s.beat > 0 && (!loose || loose.speed > 0.6);
  const dx = info.x - state.x;
  if (flying) {
    // Shuffle under it to make the catch.
    const reach = handPoint(state.x, state.y, def.radius, brain.facing).x;
    const off = info.x - reach;
    if (Math.abs(off) > 0.5 && Math.abs(off) < 2.5 && ctx.support)
      stepToward(brain, ctx, off, moved, out, 0.8);
    else face(brain, ctx, info.x, out);
    if (Math.abs(dx) > 0.05) brain.facing = dx > 0 ? 1 : -1;
    return out;
  }
  // A miss: go and fetch it.
  if (!loose) {
    face(brain, ctx, info.x, out);
    return out;
  }
  const side = dx >= 0 ? 1 : -1;
  const standX = info.x - side * (def.radius + info.halfWidth + 0.05);
  if (Math.abs(standX - state.x) < 0.15 || Math.abs(dx) < def.radius + info.halfWidth + 0.12) {
    brain.facing = side;
    brain.carrying = item;
    brain.timer = CATCH_WINDUP;
    face(brain, ctx, info.x, out);
    return out;
  }
  if (stepToward(brain, ctx, standX - state.x, moved, out) === 'blocked') face(brain, ctx, info.x, out);
  return out;
}

/** Where a bug holds things: in its front legs, a little below its middle. */
export function handPoint(x: number, y: number, radius: number, facing: 1 | -1): { x: number; y: number } {
  return { x: x + facing * radius * 0.95, y: y - radius * 0.15 };
}

/**
 * One tick of an interaction for a bug in `st_social`. The lead keeps time
 * and ends it; the follower moves along.
 */
export function updateSocial(
  meId: EntityId,
  brain: BugBrain,
  ctx: BugContext,
  moved: number,
  out: BugDecision,
): BugDecision {
  const s = brain.social;
  const world = ctx.world ?? EMPTY_WORLD;
  if (!s) {
    enterIdle(brain, ctx.rng, ctx.def);
    return out;
  }
  const p = world.bug(s.partner);
  if (!p) {
    endSocial(meId, brain, ctx, false, out);
    return out;
  }
  if (s.role === 'follow') return follow(meId, brain, p, ctx, moved, out);
  const { rng, state, def } = ctx;
  s.left--;
  if (s.beat > 0) s.beat--;
  const dist = Math.abs(p.x - state.x) - def.radius - p.def.radius;
  switch (s.kind) {
    case 'soc_chat': {
      face(brain, ctx, p.x, out);
      if (s.beat > 0) return out;
      if (s.count >= s.goal) {
        endSocial(meId, brain, ctx, true, out);
        return out;
      }
      const leadSpeaks = s.count % 2 === 0;
      const speaker = leadSpeaks ? { def, brain } : { def: p.def, brain: p.brain };
      const others = world.bugs().filter((b) => b.id !== meId && b.id !== p.id);
      const gossip = others.length > 0 ? rng.pick(others).defId : null;
      const line = topicFor(speaker, leadSpeaks ? p.def : def, s.last, ctx, gossip);
      s.last = line.topic;
      out.notices.push({
        type: 'chatted',
        partnerId: leadSpeaks ? p.id : meId,
        topic: line.topic,
        about: line.about,
        ...(leadSpeaks ? {} : { by: p.id }),
      });
      s.count++;
      s.beat = CHAT_BEAT;
      return out;
    }
    case 'soc_bump': {
      if (s.beat === BUMP_HOP && ctx.support) {
        brain.facing = p.x >= state.x ? 1 : -1;
        out.velocity = { x: brain.facing * 1.3, y: -3.2 };
        return out;
      }
      face(brain, ctx, p.x, out);
      if (s.beat === BUMP_BOOP) out.notices.push({ type: 'bumped', partnerId: p.id });
      if (s.beat <= 0) endSocial(meId, brain, ctx, true, out);
      return out;
    }
    case 'soc_tag':
    case 'soc_steal': {
      const leadChases = s.count % 2 === 1;
      if (s.beat <= 0 && dist < 0.16 && p.supported && !p.held) {
        const chaser = leadChases ? meId : p.id;
        const runner = leadChases ? p.id : meId;
        if (s.kind === 'soc_steal' && s.item !== null) {
          // Caught! The snack goes back to its owner, who gets to eat it.
          out.notices.push({ type: 'tagged', partnerId: runner, ...(chaser === meId ? {} : { by: chaser }) });
          brain.carrying = null;
          out.notices.push({ type: 'shared', partnerId: p.id, itemId: s.item });
          endSocial(meId, brain, ctx, true, out);
          return out;
        }
        s.count++;
        s.beat = TAG_FREEZE;
        out.notices.push({ type: 'tagged', partnerId: runner, ...(chaser === meId ? {} : { by: chaser }) });
      }
      if (s.left <= 0) {
        const snack = s.kind === 'soc_steal' ? s.item : null;
        endSocial(meId, brain, ctx, true, out);
        // Got away with it: gobble it up.
        if (snack !== null) out.notices.push({ type: 'shared', partnerId: meId, itemId: snack });
        return out;
      }
      return chase(brain, p, s, leadChases, ctx, moved, out);
    }
    case 'soc_catch': {
      const item = s.item === null ? null : ctx.target(s.item);
      const lost =
        !item ||
        item.held ||
        (Math.abs(item.x - state.x) > 7 && Math.abs(item.x - p.x) > 7) ||
        (ctx.overWater?.(item.x) ?? false);
      if (lost || s.left <= 0) {
        // Whoever has it last may just eat it, if it is a snack they fancy.
        const holder = brain.carrying === s.item ? 'me' : p.brain.carrying === s.item ? 'partner' : null;
        if (!lost && s.item !== null && holder !== null) {
          const hb = holder === 'me' ? brain : p.brain;
          const hd = holder === 'me' ? def : p.def;
          const snack = !!item && world.edible(item.defId) && isSnackFor(hd, item.defId);
          if (snack && hb.needs.need_hunger < 75) {
            hb.carrying = null;
            endSocial(meId, brain, ctx, true, out);
            out.notices.push({ type: 'shared', partnerId: holder === 'me' ? meId : p.id, itemId: s.item });
            return out;
          }
        }
        endSocial(meId, brain, ctx, !lost, out);
        return out;
      }
      return catchPlay(meId, brain, p, s, meId, p.id, ctx, moved, out);
    }
    case 'soc_share_food': {
      face(brain, ctx, p.x, out);
      if (s.beat > 0) return out;
      const item = s.item;
      brain.carrying = null;
      if (item !== null) out.notices.push({ type: 'shared', partnerId: p.id, itemId: item });
      endSocial(meId, brain, ctx, true, out);
      return out;
    }
    case 'soc_comfort': {
      face(brain, ctx, p.x, out);
      if (s.beat === COMFORT_PAT) {
        out.notices.push({ type: 'comforted', partnerId: p.id });
        // A pat takes a quarter off the dizzy spell.
        if (p.brain.mode === 'st_dizzy')
          p.brain.timer = Math.max(1, p.brain.timer - Math.round(p.brain.dizzyTicks * 0.25));
      }
      if (s.beat <= 0) endSocial(meId, brain, ctx, true, out);
      return out;
    }
    case 'soc_ride':
      return out;
  }
}

/** Is this food something the bug would eat (not disliked)? */
function isSnackFor(def: BugDef, itemDefId: string): boolean {
  return (
    (def.loves.includes(itemDefId) || def.likes.includes(itemDefId)) && !def.dislikes.includes(itemDefId)
  );
}

/**
 * Boing sitting on another bug's head (`st_ride`). He follows the mount
 * wherever it goes, then hops off to a clear spot. He falls off if the mount
 * is grabbed or sent flying.
 */
export function updateRide(meId: EntityId, brain: BugBrain, ctx: BugContext, out: BugDecision): BugDecision {
  const s = brain.social;
  const world = ctx.world ?? EMPTY_WORLD;
  const { state, def, rng } = ctx;
  const mount = s ? world.bug(s.partner) : null;
  if (!s || !mount) {
    brain.social = null;
    enterIdle(brain, rng, def);
    return out;
  }
  s.left--;
  const mb = mount.brain;
  const shaky =
    mount.held ||
    (mb.mode === 'st_airborne' && !mb.selfLaunched) ||
    mb.mode === 'st_swim' ||
    mb.mode === 'st_rolled' ||
    Math.abs(mount.vy) > 6;
  if (shaky) {
    // Tumbled off.
    brain.social = null;
    out.notices.push({ type: 'rode', mountId: mount.id, on: false });
    out.notices.push({ type: 'social_end', partnerId: mount.id, kind: 'soc_ride', happy: false });
    enter(brain, 'st_airborne');
    brain.selfLaunched = true;
    brain.airPeak = 0;
    brain.airTop = state.y;
    return out;
  }
  const topY = mount.y - mount.def.radius - def.radius + 0.02;
  if (s.left <= 0) {
    // Hop down to a clear spot beside the mount.
    for (const side of [brain.facing, brain.facing === 1 ? -1 : 1] as const) {
      const toX = mount.x + side * (mount.def.radius + def.radius + rng.range(0.6, 1.4));
      if (!clearLanding(ctx, toX)) continue;
      const toY = world.surfaceY(toX) - def.radius - 0.02;
      endSocial(meId, brain, ctx, true, out);
      out.notices.push({ type: 'rode', mountId: mount.id, on: false });
      brain.facing = side;
      launch(brain, out, hopVelocity(state.x, state.y, toX, toY, 0.5), state.y);
      brain.resume = null;
      return out;
    }
    // Nowhere clear to land: sit a little longer.
    s.left = 30;
  }
  // Sit on top: match the mount and pull toward its crown.
  out.velocity = { x: mount.vx + (mount.x - state.x) * 10, y: mount.vy + (topY - state.y) * 10 };
  return out;
}
