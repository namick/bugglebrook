import { BUG_MODES, SOCIAL_KINDS } from '../core/entities';
import { ADVERT_ACTIONS } from '../data/types';
import { REACTION_TYPES } from '../events';
import { POCKET_SLOTS, STACK_MAX } from '../systems/pocket';

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
  const counters = world.counters;
  if (counters !== undefined && !(isObj(counters) && isNumMap(counters.fed)))
    errors.push('world.counters is invalid');
  const meta = save.meta;
  if (
    !isObj(meta) ||
    typeof meta.createdAt !== 'string' ||
    !(meta.thumb === null || (typeof meta.thumb === 'string' && THUMB.test(meta.thumb.slice(0, 32))))
  )
    errors.push('meta is invalid');
  return errors;
}

/** A thumbnail is an image data URL. */
const THUMB = /^data:image\/(png|jpeg|webp);base64,/;

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
