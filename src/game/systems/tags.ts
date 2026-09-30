import { SIM_HZ } from '../core/loop';

/**
 * Tags (game design doc, section 6): states that come and go and interact
 * by rule. An entity's tags are its defaults (its item def and material)
 * plus a small plain-JSON `TagState` of changes:
 *
 * - a tick number above 0: the tag is on until that tick
 * - `PERMANENT` (-1): the tag is on for good
 * - `SUPPRESSED` (0): a default tag that is off for good
 * - a negative tick below -1: a default tag that is off until that tick
 *   (gum washed in the pond is sticky again once it dries)
 *
 * Storing changes instead of every tag keeps saves small, and new default
 * tags in later content reach old saves.
 */
export type TagState = Record<string, number>;

export const PERMANENT = -1;
export const SUPPRESSED = 0;

/** Every tag the game knows. Content may only use these. */
export const TAG_IDS = [
  'tag_wet',
  'tag_sticky',
  'tag_slimy',
  'tag_bouncy',
  'tag_hot',
  'tag_frozen',
  'tag_cold',
  'tag_smelly',
  'tag_glowing',
  'tag_magnetic',
  'tag_floaty',
  'tag_lifty',
  'tag_fragile',
  'tag_edible',
  'tag_heavy',
  'tag_light',
  'tag_sparky',
  'tag_fuzzy',
  'tag_soapy',
  'tag_fizzy',
  'tag_muddy',
  'tag_leafy',
  'tag_absorbent',
  'tag_musical',
  'tag_seed',
  'tag_painted',
  'tag_player_setup',
  'tag_sweet',
  'tag_stackable',
] as const;

export type TagId = (typeof TAG_IDS)[number];

/** How long a tag lasts once gained, in seconds, when a rule adds it (section 6). */
export const TAG_SECONDS: Readonly<Partial<Record<TagId, number>>> = {
  tag_wet: 30,
  tag_slimy: 30,
  tag_hot: 20,
  tag_frozen: 15,
  tag_cold: 10,
  tag_smelly: 20,
  tag_soapy: 20,
  tag_fuzzy: 20,
  tag_sparky: 10,
};

/** Is `tag` on right now? */
export function tagOn(
  state: TagState | undefined,
  defaults: readonly string[],
  tag: string,
  tick: number,
): boolean {
  const v = state?.[tag];
  if (v === undefined) return defaults.includes(tag);
  if (v < PERMANENT) return -v <= tick && defaults.includes(tag);
  return v === PERMANENT || v > tick;
}

/** Every tag that is on, sorted. */
export function effectiveTags(
  state: TagState | undefined,
  defaults: readonly string[],
  tick: number,
): string[] {
  const out = new Set<string>();
  for (const tag of defaults) if (tagOn(state, defaults, tag, tick)) out.add(tag);
  if (state) for (const tag of Object.keys(state)) if (tagOn(state, defaults, tag, tick)) out.add(tag);
  return [...out].sort();
}

/**
 * Turn a tag on for `seconds` (or its usual duration, or for good if it has
 * none). A default tag that is on stays on for good. A timed tag is never
 * shortened. Returns true if the tag was off before.
 */
export function addTag(
  state: TagState,
  defaults: readonly string[],
  tag: string,
  tick: number,
  seconds: number | null = TAG_SECONDS[tag as TagId] ?? null,
): boolean {
  const was = tagOn(state, defaults, tag, tick);
  const isDefault = defaults.includes(tag);
  const current = state[tag];
  if (isDefault && current === undefined) return false;
  if (isDefault && current !== undefined && current < PERMANENT) {
    // Coming back early: drop the suppression.
    delete state[tag];
    return !was;
  }
  if (seconds === null) {
    if (isDefault) delete state[tag];
    else state[tag] = PERMANENT;
    return !was;
  }
  if (current === PERMANENT) return false;
  const until = tick + Math.max(1, Math.round(seconds * SIM_HZ));
  if (current !== undefined && current > until) return !was;
  state[tag] = until;
  return !was;
}

/**
 * Turn a tag off. A default tag stays off for `seconds` and then comes back
 * (or stays off for good without it). Returns true if it was on.
 */
export function removeTag(
  state: TagState,
  defaults: readonly string[],
  tag: string,
  tick: number,
  seconds: number | null = null,
): boolean {
  const was = tagOn(state, defaults, tag, tick);
  if (!defaults.includes(tag)) delete state[tag];
  else if (seconds === null) state[tag] = SUPPRESSED;
  else {
    const until = tick + Math.max(1, Math.round(seconds * SIM_HZ));
    const current = state[tag];
    if (current !== SUPPRESSED && !(current !== undefined && current < PERMANENT && -current > until))
      state[tag] = -until;
  }
  return was;
}

/**
 * Drop timed tags that have run out, and bring back defaults whose time off
 * is over. Returns what changed, so the sim can announce it.
 */
export function expireTags(
  state: TagState,
  defaults: readonly string[],
  tick: number,
): { lost: string[]; returned: string[] } {
  const lost: string[] = [];
  const returned: string[] = [];
  for (const tag of Object.keys(state).sort()) {
    const v = state[tag]!;
    if (v > SUPPRESSED && v <= tick) {
      if (defaults.includes(tag)) state[tag] = SUPPRESSED;
      else delete state[tag];
      lost.push(tag);
    } else if (v < PERMANENT && -v <= tick) {
      delete state[tag];
      if (defaults.includes(tag)) returned.push(tag);
    }
  }
  return { lost, returned };
}
