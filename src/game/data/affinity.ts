/**
 * How much each pair of bugs likes spending time together, from -1 to 1
 * (game design doc, section 4, "Social relationships"). Affinity changes how
 * often two bugs play and chat. It never makes rivals: the lowest value means
 * "ignores", not "hates". Events nudge it during play; the sim keeps those
 * changes. Pairs are unordered. Entries may name bugs that arrive in later
 * milestones.
 */
export interface AffinityDef {
  a: string;
  b: string;
  value: number;
  /** What the pair does together, for the journal later. */
  flavor: string;
}

/** Any pair not in the table. */
export const DEFAULT_AFFINITY = 0.1;

export const AFFINITY: readonly AffinityDef[] = [
  { a: 'bug_ladybug_dot', b: 'bug_grasshopper_boing', value: 0.6, flavor: 'Dare each other on springs' },
  { a: 'bug_pillbug_rollo', b: 'bug_stagbeetle_moose', value: 0.8, flavor: 'Moose protects Rollo' },
  { a: 'bug_snail_glorp', b: 'bug_stickinsect_twig', value: 0.5, flavor: 'Stand still together' },
  { a: 'bug_stinkbug_whiff', b: 'bug_dungbeetle_barty', value: 0.7, flavor: 'Barty likes the smell' },
  { a: 'bug_bee_buzzby', b: 'bug_cricket_fiddle', value: 0.4, flavor: 'Buzzby keeps time' },
  { a: 'bug_moth_luma', b: 'bug_firefly_flick', value: 0.6, flavor: "Luma follows Flick's glow" },
  { a: 'bug_waterstrider_skeet', b: 'bug_ladybug_dot', value: 0.3, flavor: "Impressed by Dot's stunts" },
  // Not in the doc's table, but the starting cast needs friends of its own.
  { a: 'bug_ladybug_dot', b: 'bug_pillbug_rollo', value: 0.35, flavor: 'Dot drags Rollo into games' },
  { a: 'bug_pillbug_rollo', b: 'bug_snail_glorp', value: 0.4, flavor: 'Quiet chats' },
  { a: 'bug_snail_glorp', b: 'bug_grasshopper_boing', value: 0.3, flavor: 'Boing sits on his shell' },
];

/** Bugs that everyone gets on with a little better (Munch and Wubbo). */
export const EVERYONE_AFFINITY: Readonly<Record<string, number>> = {
  bug_caterpillar_munch: 0.4,
  bug_tardigrade_wubbo: 0.5,
};

/** Starting affinity between two bug defs. */
export function baseAffinity(a: string, b: string): number {
  if (a === b) return 1;
  for (const d of AFFINITY) if ((d.a === a && d.b === b) || (d.a === b && d.b === a)) return d.value;
  return Math.max(EVERYONE_AFFINITY[a] ?? DEFAULT_AFFINITY, EVERYONE_AFFINITY[b] ?? DEFAULT_AFFINITY);
}

/** A stable key for an unordered pair of bug defs. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
