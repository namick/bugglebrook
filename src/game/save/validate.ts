import { BUG_MODES, SOCIAL_KINDS } from '../core/entities';
import { sequencerProblems } from '../systems/sequencer';
import { ADVERT_ACTIONS } from '../data/types';
import { REACTION_TYPES } from '../events';
import { POCKET_SLOTS, STACK_MAX } from '../systems/pocket';
import { WEATHER_IDS } from '../systems/sky';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const BODY_KEYS = ['x', 'y', 'angle', 'vx', 'vy', 'av'] as const;
const BUG_MODES_SET = new Set<string>(BUG_MODES);
const NEEDS = ['need_hunger', 'need_fun', 'need_energy', 'need_social', 'need_clean'] as const;
const ACTIONS = new Set<string>([...ADVERT_ACTIONS, ...SOCIAL_KINDS]);
const SOCIAL_SET = new Set<string>(SOCIAL_KINDS);
const PLANS = new Set(['rest', 'sleep', 'wander', 'eat', 'play', 'visit', 'home']);
const BRAIN_NUMBERS = [
  'timer',
  'targetX',
  'decideIn',
  'airPeak',
  'lastHardLanding',
  'dizzyStreak',
  'dizzyTicks',
  'stuck',
  'tries',
  'lastX',
  'grumpyUntil',
  'burpAt',
  'tickle',
  'woozyUntil',
  'smelledAt',
  'hopAt',
  'groggyUntil',
  'napAt',
  'fidgetAt',
  'slippedAt',
  'restX',
  'hopReady',
  'touchedAt',
  'airTop',
  'audience',
] as const;
const isIdOrNull = (v: unknown): boolean => v === null || isNum(v);
const REACTIONS = new Set<string>(REACTION_TYPES);
const PENDING = new Set(['stuck', 'aloof', 'disguised']);
const LIFT_PHASES = new Set(['down', 'up', 'top', 'back']);
const CLAW_PHASES = new Set(['idle', 'down', 'up', 'carry', 'drop']);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Problems with the saved barriers (open areas, the bucket lift), or an empty list. */
function barrierProblems(b: unknown): string[] {
  if (!isObj(b)) return ['is not an object'];
  const errors: string[] = [];
  if (!isStrings(b.open)) errors.push('open is invalid');
  const lift = b.lift;
  if (!isObj(lift) || !LIFT_PHASES.has(lift.phase as string) || !isNum(lift.y) || !isNum(lift.timer))
    errors.push('lift is invalid');
  return errors;
}

/** Problems with the saved state of the M7 areas' fixtures, or an empty list. */
function placeProblems(p: unknown): string[] {
  if (!isObj(p)) return ['is not an object'];
  const errors: string[] = [];
  for (const k of ['stageLights', 'knockBack', 'gapNext', 'band'] as const)
    if (!isNum(p[k])) errors.push(`${k} must be a number`);
  if (typeof p.lampOn !== 'boolean') errors.push('lampOn must be a boolean');
  if (!isStrings(p.muted)) errors.push('muted is invalid');
  for (const k of ['knocks', 'falling', 'falls'] as const)
    if (!Array.isArray(p[k]) || !(p[k] as unknown[]).every(isNum)) errors.push(`${k} is invalid`);
  for (const k of ['heap', 'jars', 'web'] as const) if (!isNumMap(p[k])) errors.push(`${k} is invalid`);
  const dominoes = p.dominoes;
  if (!isObj(dominoes) || !Object.values(dominoes).every((v) => typeof v === 'boolean'))
    errors.push('dominoes is invalid');
  const sp = p.spider;
  if (!isObj(sp) || !isNum(sp.x) || !isNum(sp.dir) || !isNum(sp.waved) || !Array.isArray(sp.turns))
    errors.push('spider is invalid');
  const c = p.claw;
  if (
    !isObj(c) ||
    !CLAW_PHASES.has(c.phase as string) ||
    !['x', 'depth', 'misses', 'stocked'].every((k) => isNum(c[k])) ||
    !isIdOrNull(c.holding) ||
    typeof c.used !== 'boolean'
  )
    errors.push('claw is invalid');
  if (!Array.isArray(p.rng) || p.rng.length !== 4 || !p.rng.every(isNum)) errors.push('rng is invalid');
  if (p.sequencer !== undefined) errors.push(...sequencerProblems(p.sequencer));
  return errors;
}

/** Problems with a saved bug brain, or an empty list. */
function brainProblems(bug: unknown): string[] {
  if (!isObj(bug)) return ['is not an object'];
  const errors: string[] = [];
  if (!BUG_MODES_SET.has(bug.mode as string)) errors.push('has an unknown mode');
  for (const k of BRAIN_NUMBERS) if (!isNum(bug[k])) errors.push(`${k} must be a number`);
  if (bug.facing !== 1 && bug.facing !== -1) errors.push('facing must be 1 or -1');
  if (bug.targetId !== null && !isNum(bug.targetId)) errors.push('targetId must be a number or null');
  if (bug.action !== null && !ACTIONS.has(bug.action as string)) errors.push('action is invalid');
  const needs = bug.needs;
  if (!isObj(needs) || !NEEDS.every((n) => isNum(needs[n]) && needs[n] >= 0 && needs[n] <= 100))
    errors.push('needs are invalid');
  if (
    typeof bug.selfLaunched !== 'boolean' ||
    typeof bug.done !== 'boolean' ||
    typeof bug.gliding !== 'boolean'
  )
    errors.push('flags are invalid');
  if (!isIdOrNull(bug.carrying)) errors.push('carrying must be a number or null');
  if (bug.umbrella !== undefined && typeof bug.umbrella !== 'boolean')
    errors.push('umbrella must be a boolean');
  if (bug.pending !== undefined && !PENDING.has(bug.pending as string)) errors.push('pending is invalid');
  if (bug.form !== undefined && bug.form !== 'cocoon' && bug.form !== 'butterfly')
    errors.push('form is invalid');
  for (const k of ['blinkAt', 'eyesUntil', 'leafy', 'puffedAt'] as const)
    if (bug[k] !== undefined && !isNum(bug[k])) errors.push(`${k} must be a number`);
  for (const k of ['overhead', 'rolling', 'wasButterfly'] as const)
    if (bug[k] !== undefined && typeof bug[k] !== 'boolean') errors.push(`${k} must be a boolean`);
  if (bug.resume !== null && !BUG_MODES_SET.has(bug.resume as string)) errors.push('resume is invalid');
  const social = bug.social;
  if (
    social !== null &&
    !(
      isObj(social) &&
      SOCIAL_SET.has(social.kind as string) &&
      isNum(social.partner) &&
      (social.role === 'lead' || social.role === 'follow') &&
      ['stage', 'count', 'goal', 'beat', 'left'].every((k) => isNum(social[k])) &&
      isIdOrNull(social.item) &&
      (social.last === null || typeof social.last === 'string')
    )
  )
    errors.push('social is invalid');
  const memory = bug.memory;
  if (
    !Array.isArray(memory) ||
    !memory.every((m) => isObj(m) && isNum(m.id) && isNum(m.tick) && typeof m.good === 'boolean')
  )
    errors.push('memory is invalid');
  for (const k of ['inspected', 'pokes'] as const) {
    const list = bug[k];
    if (!Array.isArray(list) || !list.every(isNum)) errors.push(`${k} is invalid`);
  }
  const plan = bug.plan;
  if (
    plan !== null &&
    !(
      isObj(plan) &&
      PLANS.has(plan.kind as string) &&
      isNum(plan.at) &&
      isNum(plan.x) &&
      isIdOrNull(plan.targetId)
    )
  )
    errors.push('plan is invalid');
  const used = bug.used;
  if (!Array.isArray(used) || !used.every((u) => isObj(u) && isNum(u.id) && isNum(u.tick)))
    errors.push('used is invalid');
  if (bug.mouthful !== null && !isNum(bug.mouthful)) errors.push('mouthful must be a number or null');
  const reaction = bug.reaction;
  if (
    reaction !== null &&
    !(
      isObj(reaction) &&
      REACTIONS.has(reaction.type as string) &&
      isNum(reaction.variant) &&
      isNum(reaction.tick)
    )
  )
    errors.push('reaction is invalid');
  const variants = bug.variants;
  if (!isObj(variants) || !Object.entries(variants).every(([k, v]) => REACTIONS.has(k) && isNum(v)))
    errors.push('variants are invalid');
  return errors;
}

const isNumMap = (v: unknown): boolean => isObj(v) && Object.values(v).every(isNum);

/** Problems with the saved pond and weather state, or an empty list. */
function envProblems(env: unknown): string[] {
  if (!isObj(env)) return ['is not an object'];
  const errors: string[] = [];
  if (!isNumMap(env.rise)) errors.push('rise is invalid');
  if (typeof env.hoseOn !== 'boolean' || typeof env.rain !== 'boolean') errors.push('flags are invalid');
  for (const k of ['nextIce', 'zappedUntil', 'wind', 'rainSince'] as const)
    if (!isNum(env[k])) errors.push(`${k} must be a number`);
  const ice = env.ice;
  if (
    !Array.isArray(ice) ||
    !ice.every(
      (i) =>
        isObj(i) &&
        isNum(i.id) &&
        typeof i.areaId === 'string' &&
        isNum(i.x0) &&
        isNum(i.x1) &&
        isNum(i.until),
    )
  )
    errors.push('ice is invalid');
  const sticks = env.sticks;
  if (
    !Array.isArray(sticks) ||
    !sticks.every((t) => isObj(t) && isNum(t.a) && isNum(t.b) && isNum(t.x) && isNum(t.y) && isNum(t.since))
  )
    errors.push('sticks are invalid');
  const pads = env.pads;
  if (!isObj(pads) || !Object.values(pads).every((p) => isObj(p) && isNum(p.dy) && isNum(p.vy)))
    errors.push('pads are invalid');
  const slime = env.slime;
  if (
    !Array.isArray(slime) ||
    !slime.every((t) => isObj(t) && isNum(t.x0) && isNum(t.x1) && isNum(t.y) && isNum(t.until))
  )
    errors.push('slime is invalid');
  return errors;
}

const WEATHERS = new Set<string>(WEATHER_IDS);
const isTicks = (v: unknown): boolean => Array.isArray(v) && v.every(isNum);

/** Problems with the saved clock and weather, or an empty list. */
function skyProblems(sky: unknown): string[] {
  if (!isObj(sky)) return ['is not an object'];
  const errors: string[] = [];
  for (const k of [
    'clock',
    'since',
    'next',
    'wind',
    'shades',
    'starsRolled',
    'starAt',
    'rainEnded',
    'knotholeAt',
  ])
    if (!isNum(sky[k])) errors.push(`${k} must be a number`);
  if (isNum(sky.clock) && sky.clock < 0) errors.push('clock must be >= 0');
  if (!WEATHERS.has(sky.weather as string)) errors.push('weather is unknown');
  const gust = sky.gust;
  if (gust !== null && !(isObj(gust) && (gust.dir === 1 || gust.dir === -1) && isNum(gust.until)))
    errors.push('gust is invalid');
  const vane = sky.vane;
  if (!(
    isObj(vane) &&
    (vane.facing === 1 || vane.facing === -1) &&
    isTicks(vane.clicks) &&
    isNum(vane.spinUntil)
  ))
    errors.push('vane is invalid');
  const dial = sky.dial;
  if (
    dial !== null &&
    !(isObj(dial) && isNum(dial.target) && isNum(dial.from) && typeof dial.held === 'boolean')
  )
    errors.push('dial is invalid');
  if (!isTicks(sky.sunClicks) || !isTicks(sky.flashes)) errors.push('click lists are invalid');
  if (!isNumMap(sky.puddles)) errors.push('puddles are invalid');
  if (!Array.isArray(sky.rng) || sky.rng.length !== 4 || !sky.rng.every(isNum)) errors.push('rng is invalid');
  return errors;
}

/**
 * Structural check of a current-version save. Returns problems as strings.
 * Hand-written to keep the sim free of dependencies.
 */
export function validateSaveFile(save: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof save.savedAt !== 'string') errors.push('savedAt must be a string');
  const view = save.view;
  if (!isObj(view) || !isNum(view.cameraX)) errors.push('view.cameraX must be a number');

  const world = save.world;
  if (!isObj(world)) {
    errors.push('world must be an object');
    return errors;
  }
  if (typeof world.seed !== 'string') errors.push('world.seed must be a string');
  if (!isNum(world.tick) || world.tick < 0) errors.push('world.tick must be >= 0');
  if (!isNum(world.nextId) || world.nextId < 1) errors.push('world.nextId must be >= 1');
  if (!Array.isArray(world.rng) || world.rng.length !== 4 || !world.rng.every(isNum))
    errors.push('world.rng must be 4 numbers');
  if (!Array.isArray(world.entities)) {
    errors.push('world.entities must be an array');
    return errors;
  }

  const ids = new Set<number>();
  world.entities.forEach((e: unknown, i: number) => {
    const at = `world.entities[${i}]`;
    if (!isObj(e)) return errors.push(`${at} must be an object`);
    if (!isNum(e.id) || !Number.isInteger(e.id) || e.id < 1) errors.push(`${at}.id is invalid`);
    else if (ids.has(e.id)) errors.push(`${at}.id ${e.id} is duplicated`);
    else ids.add(e.id);
    if (isNum(e.id) && isNum(world.nextId) && e.id >= world.nextId)
      errors.push(`${at}.id must be below nextId`);
    if (e.kind !== 'bug' && e.kind !== 'item') errors.push(`${at}.kind is invalid`);
    if (typeof e.defId !== 'string') errors.push(`${at}.defId must be a string`);
    const body = e.body;
    if (!isObj(body) || !BODY_KEYS.every((k) => isNum(body[k]))) errors.push(`${at}.body is invalid`);
    if (e.kind === 'bug') {
      const problems = brainProblems(e.bug);
      if (problems.length > 0) errors.push(`${at}.bug is invalid: ${problems.join(', ')}`);
    }
    if (e.tags !== undefined && !isNumMap(e.tags)) errors.push(`${at}.tags is invalid`);
    if (e.soak !== undefined && !isNum(e.soak)) errors.push(`${at}.soak must be a number`);
    if (e.paint !== undefined && !isStrings(e.paint)) errors.push(`${at}.paint is invalid`);
    if (e.pinned !== undefined && typeof e.pinned !== 'boolean') errors.push(`${at}.pinned is invalid`);
    if (e.bites !== undefined && !isNum(e.bites)) errors.push(`${at}.bites must be a number`);
    if (e.parts !== undefined && !isParts(e.parts)) errors.push(`${at}.parts is invalid`);
    if (e.brew !== undefined && !isBrew(e.brew)) errors.push(`${at}.brew is invalid`);
    if (e.effects !== undefined && !(Array.isArray(e.effects) && e.effects.every(isEffect)))
      errors.push(`${at}.effects is invalid`);
    if (e.toasted !== undefined && typeof e.toasted !== 'boolean') errors.push(`${at}.toasted is invalid`);
    if (e.toy !== undefined && !isObj(e.toy)) errors.push(`${at}.toy is invalid`);
    return undefined;
  });
  if (world.env !== undefined) {
    const problems = envProblems(world.env);
    if (problems.length > 0) errors.push(`world.env is invalid: ${problems.join(', ')}`);
  }
  const social = world.social;
  if (social !== undefined && !(isObj(social) && isNumMap(social.affinity)))
    errors.push('world.social is invalid');
  if (world.pocket !== undefined) {
    const problems = pocketProblems(world.pocket, ids);
    if (problems.length > 0) errors.push(`world.pocket is invalid: ${problems.join(', ')}`);
  }
  if (world.sky !== undefined) {
    const problems = skyProblems(world.sky);
    if (problems.length > 0) errors.push(`world.sky is invalid: ${problems.join(', ')}`);
  }
  const secrets = world.secrets;
  if (secrets !== undefined && !(Array.isArray(secrets) && secrets.every((x) => typeof x === 'string')))
    errors.push('world.secrets is invalid');
  const counters = world.counters;
  if (counters !== undefined && !(isObj(counters) && isNumMap(counters.fed)))
    errors.push('world.counters is invalid');
  if (world.barriers !== undefined) {
    const problems = barrierProblems(world.barriers);
    if (problems.length > 0) errors.push(`world.barriers is invalid: ${problems.join(', ')}`);
  }
  if (world.places !== undefined) {
    const problems = placeProblems(world.places);
    if (problems.length > 0) errors.push(`world.places is invalid: ${problems.join(', ')}`);
  }
  if (world.built !== undefined && !isStrings(world.built)) errors.push('world.built is invalid');
  if (world.bench !== undefined) {
    const problems = benchProblems(world.bench);
    if (problems.length > 0) errors.push(`world.bench is invalid: ${problems.join(', ')}`);
  }
  if (world.cauldron !== undefined) {
    const c = world.cauldron;
    if (!(isObj(c) && isParts(c.contents) && isNum(c.stir) && isNum(c.brewAt) && isNum(c.brewed)))
      errors.push('world.cauldron is invalid');
  }
  const meta = save.meta;
  if (
    !isObj(meta) ||
    typeof meta.createdAt !== 'string' ||
    !(meta.thumb === null || typeof meta.thumb === 'string')
  )
    errors.push('meta is invalid');
  else if (meta.photos !== undefined && !isPhotos(meta.photos)) errors.push('meta.photos is invalid');
  return errors;
}

/** The photos a save keeps (M11): each a time, a picture, and maybe a file. */
function isPhotos(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        isObj(p) &&
        typeof p.at === 'string' &&
        typeof p.thumb === 'string' &&
        (p.file === null || typeof p.file === 'string') &&
        typeof p.frame === 'string' &&
        typeof p.filter === 'string',
    )
  );
}

/** Things tucked inside other things (M8): each has an item ID and maybe more parts. */
function isParts(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        isObj(p) &&
        typeof p.defId === 'string' &&
        (p.tags === undefined || isNumMap(p.tags)) &&
        (p.paint === undefined || isStrings(p.paint)) &&
        (p.parts === undefined || isParts(p.parts)) &&
        (p.brew === undefined || isBrew(p.brew)),
    )
  );
}

function isBrew(v: unknown): boolean {
  return (
    isObj(v) &&
    (v.potion === null || typeof v.potion === 'string') &&
    isStrings(v.effects) &&
    isNum(v.strength) &&
    isNum(v.durationTicks) &&
    isNum(v.color)
  );
}

function isEffect(v: unknown): boolean {
  return (
    isObj(v) &&
    typeof v.effect === 'string' &&
    (v.potion === null || typeof v.potion === 'string') &&
    isNum(v.strength) &&
    isNum(v.since) &&
    isNum(v.until)
  );
}

function benchProblems(b: unknown): string[] {
  if (!isObj(b)) return ['is not an object'];
  const errors: string[] = [];
  if (!(Array.isArray(b.trays) && b.trays.length === 3 && b.trays.every(isIdOrNull)))
    errors.push('trays must be three IDs or nulls');
  if (!isNum(b.busyUntil)) errors.push('busyUntil must be a number');
  for (const k of ['made', 'hinted', 'nudged'] as const) if (!isStrings(b[k])) errors.push(`${k} is invalid`);
  if (!isNumMap(b.wished)) errors.push('wished is invalid');
  if (!Array.isArray(b.rng) || b.rng.length !== 4 || !b.rng.every(isNum)) errors.push('rng is invalid');
  return errors;
}

/** Problems with the saved pocket tray, or an empty list. `ids` are the saved entity IDs. */
function pocketProblems(pocket: unknown, ids: ReadonlySet<number>): string[] {
  if (!isObj(pocket)) return ['is not an object'];
  const errors: string[] = [];
  const slots = pocket.slots;
  if (!Array.isArray(slots) || slots.length !== POCKET_SLOTS) return ['must have six slots'];
  const seen = new Set<number>();
  slots.forEach((slot: unknown, i: number) => {
    if (!Array.isArray(slot) || slot.length > STACK_MAX || !slot.every(isNum))
      return errors.push(`slot ${i} is invalid`);
    for (const id of slot as number[]) {
      if (seen.has(id)) errors.push(`entity ${id} is in two slots`);
      else if (!ids.has(id)) errors.push(`entity ${id} does not exist`);
      seen.add(id);
    }
    return undefined;
  });
  if (!isNumMap(pocket.at)) errors.push('at is invalid');
  return errors;
}
