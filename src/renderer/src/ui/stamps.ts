/**
 * The discovery stamps: a lasting, wordless record of what the player has
 * found, until the journal arrives in M10 (game design doc, sections 13 and
 * 17). Everything here comes from data the save already keeps: the secrets
 * found (which include the bugs found and the areas opened), the blueprint
 * cards pinned on the bench's cork board, and the recipes made. Pure.
 */

export type StampKind = 'secret' | 'bug' | 'area' | 'blueprint' | 'recipe' | 'potion';

export interface Stamp {
  /** Unique and stable, so a stamp is only ever new once. */
  key: string;
  kind: StampKind;
  /** The secret, recipe, bug, or area it is for. */
  ref: string;
}

export interface StampSource {
  /** Secrets found, in order. */
  secrets: readonly string[];
  /** What each secret unlocks (from its def), if anything. */
  unlocks: (secretId: string) => readonly { kind: string; id: string }[];
  /** Blueprint cards pinned on the cork board, in order. */
  hinted: readonly string[];
  /** Recipes made at least once, in order. */
  made: readonly string[];
}

/** Secrets that are about potions get the bottle stamp. */
const POTION_SECRETS = new Set([
  'secret_first_potion',
  'secret_triple_potion',
  'secret_sludge_burp',
  'secret_giant_launch',
  'secret_upside_tea',
]);

/** Every stamp the world has earned, oldest kinds first. */
export function stampsOf(src: StampSource): Stamp[] {
  const out: Stamp[] = [];
  for (const id of src.secrets) {
    const unlock = src.unlocks(id);
    const bug = unlock.find((u) => u.kind === 'bug');
    const area = unlock.find((u) => u.kind === 'area');
    if (bug) out.push({ key: `secret:${id}`, kind: 'bug', ref: bug.id });
    else if (area) out.push({ key: `secret:${id}`, kind: 'area', ref: area.id });
    else out.push({ key: `secret:${id}`, kind: POTION_SECRETS.has(id) ? 'potion' : 'secret', ref: id });
  }
  for (const r of src.hinted) out.push({ key: `blueprint:${r}`, kind: 'blueprint', ref: r });
  for (const r of src.made) out.push({ key: `recipe:${r}`, kind: 'recipe', ref: r });
  return out;
}

/** The stamps in `now` that `seen` has not had yet, in order. */
export function freshStamps(seen: ReadonlySet<string>, now: readonly Stamp[]): Stamp[] {
  return now.filter((s) => !seen.has(s.key));
}

export const STAMP_UI = {
  /** Icons fade after the cursor has been away this long (section 17). */
  fadeAfter: 5,
  /** To this opacity. */
  faded: 0.4,
  /** Over this long. */
  fadeSeconds: 0.6,
  /** The cursor counts as near within this many pixels of the strip. */
  nearPx: 160,
  /** How many stamps the strip shows; older ones are tucked into the notebook. */
  shown: 8,
  /** A new stamp lands this long after it is earned (after the discovery's own chime). */
  landDelay: 0.5,
} as const;

/** How opaque an icon is, `away` seconds after the cursor was last near it. */
export function iconAlpha(away: number): number {
  if (away <= STAMP_UI.fadeAfter) return 1;
  const u = Math.min(1, (away - STAMP_UI.fadeAfter) / STAMP_UI.fadeSeconds);
  return 1 - (1 - STAMP_UI.faded) * u;
}

/** A stamp slamming down, `t` seconds after it starts: scale and opacity. */
export function stampSlam(t: number): { scale: number; alpha: number } {
  if (t <= 0) return { scale: 2.4, alpha: 0 };
  const DROP = 0.16;
  if (t < DROP) {
    const u = t / DROP;
    return { scale: 2.4 - 1.55 * u * u, alpha: Math.min(1, u * 2) };
  }
  // Squash on impact, then a little bounce back to 1.
  const k = t - DROP;
  return { scale: 1 - 0.15 * Math.exp(-k * 9) * Math.cos(k * 26), alpha: 1 };
}
