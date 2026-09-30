import { BUG_MODES } from '../core/entities';
import { REACTION_TYPES } from '../events';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const BODY_KEYS = ['x', 'y', 'angle', 'vx', 'vy', 'av'] as const;
const BUG_MODES_SET = new Set<string>(BUG_MODES);
const NEEDS = ['need_hunger', 'need_fun', 'need_energy'] as const;
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
] as const;
const REACTIONS = new Set<string>(REACTION_TYPES);

/** Problems with a saved bug brain, or an empty list. */
function brainProblems(bug: unknown): string[] {
  if (!isObj(bug)) return ['is not an object'];
  const errors: string[] = [];
  if (!BUG_MODES_SET.has(bug.mode as string)) errors.push('has an unknown mode');
  for (const k of BRAIN_NUMBERS) if (!isNum(bug[k])) errors.push(`${k} must be a number`);
  if (bug.facing !== 1 && bug.facing !== -1) errors.push('facing must be 1 or -1');
  if (bug.targetId !== null && !isNum(bug.targetId)) errors.push('targetId must be a number or null');
  if (bug.action !== null && bug.action !== 'eat' && bug.action !== 'bounce')
    errors.push('action is invalid');
  const needs = bug.needs;
  if (!isObj(needs) || !NEEDS.every((n) => isNum(needs[n]))) errors.push('needs are invalid');
  if (typeof bug.selfLaunched !== 'boolean' || typeof bug.done !== 'boolean')
    errors.push('flags are invalid');
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
    return undefined;
  });
  return errors;
}
