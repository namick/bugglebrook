// An art set's own colors (docs/06-art-guide.md, B19). The game colors a few
// things on and beside a bug from the original palette: the sleepy eyelid,
// Barty's shimmering tint layers, foot ripples, a flung bug's trail, potion
// fur, the journal's portrait frame, Flick's light. A set whose bugs are other
// colors names its own in `colors.json`, next to `set.json`:
//
//   { "bugs": { "bug_ladybug_dot": { "lid": "#3a2a40", "body": "#e8453c" } } }
//
// The same entry says where Flick's light sits, when the set paints his
// lantern somewhere else: `"lantern": { "x": 272, "y": 528 }`, in template
// pixels.
//
// `pnpm art:build` checks the file and copies each bug's colors into its
// manifest entry. A key the set leaves out keeps the game's own color, and a
// bug the set does not draw keeps all of them.
//
// No runtime imports, so the Node scripts in scripts/art/ can load this file.

import type { BugColors, RigFile, XY } from './rigFile';

/** The keys a bug's entry may have. */
export const BUG_COLOR_KEYS = [
  'lid',
  'sheen',
  'body',
  'glow',
  'lantern',
] as const satisfies readonly (keyof BugColors)[];

/** What a `lantern` is measured on: the bug's template, from its `.rig.json`. */
export type LanternRig = Pick<RigFile, 'canvas' | 'scale' | 'origin'>;

/** `"#3a2a40"` as 0x3a2a40, or null when it is not a six-digit hex color. */
export function hexColor(v: unknown): number | null {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * A `lantern` as the game uses it: game pixels from the rig's origin. Returns
 * what is wrong with it, in words, when it is not a spot on the bug's canvas.
 */
function lanternSpot(value: unknown, rig: LanternRig | undefined): XY | string {
  const spot = isObject(value) && Object.keys(value).every((k) => k === 'x' || k === 'y') ? value : null;
  if (!spot || !isNumber(spot.x) || !isNumber(spot.y))
    return 'must be a spot in template pixels, like { "x": 272, "y": 528 }.';
  if (!rig) return "is measured on the bug's template, and the bug has no .rig.json here.";
  const { w, h } = rig.canvas;
  if (spot.x < 0 || spot.y < 0 || spot.x > w || spot.y > h) return `must be inside the canvas (${w} x ${h}).`;
  return { x: r3((spot.x - rig.origin.x) / rig.scale), y: r3((spot.y - rig.origin.y) / rig.scale) };
}

/**
 * Check a parsed `colors.json` and turn its hex strings into numbers. Returns
 * each bug's colors and, in plain words, everything wrong with the file; a
 * build should stop if there is anything. `rigOf` finds a bug's template, to
 * turn a `lantern` from template pixels into game pixels.
 */
export function parseSetColors(
  raw: unknown,
  rigOf: (bugId: string) => LanternRig | undefined = () => undefined,
): { bugs: Record<string, BugColors>; problems: string[] } {
  const bugs: Record<string, BugColors> = {};
  const problems: string[] = [];
  if (!isObject(raw) || !isObject(raw.bugs)) {
    problems.push('It must look like { "bugs": { "bug_ladybug_dot": { "lid": "#3a2a40" } } }.');
    return { bugs, problems };
  }
  for (const key of Object.keys(raw))
    if (key !== 'bugs') problems.push(`"${key}" is not a key it can have. Only "bugs" is.`);
  for (const [id, entry] of Object.entries(raw.bugs)) {
    if (!isObject(entry)) {
      problems.push(`${id} must be an object of colors, like { "lid": "#3a2a40" }.`);
      continue;
    }
    const out: BugColors = {};
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'sheen') {
        const pair = Array.isArray(value) && value.length === 2 ? value.map(hexColor) : [];
        const [a, b] = pair;
        if (a != null && b != null) out.sheen = [a, b];
        else problems.push(`${id}: "sheen" must be two colors, like ["#2e8b7a", "#6a4fa3"].`);
      } else if (key === 'lid' || key === 'body' || key === 'glow') {
        const color = hexColor(value);
        if (color === null) problems.push(`${id}: "${key}" must be a color like "#3a2a40".`);
        else out[key] = color;
      } else if (key === 'lantern') {
        const spot = lanternSpot(value, rigOf(id));
        if (typeof spot === 'string') problems.push(`${id}: "lantern" ${spot}`);
        else out.lantern = spot;
      } else {
        problems.push(
          `${id}: "${key}" is not a key the game uses. The keys are ${BUG_COLOR_KEYS.join(', ')}.`,
        );
      }
    }
    if (Object.keys(out).length) bugs[id] = out;
  }
  return { bugs, problems };
}

/** Flick's light as the game colors it: a wide yellow-green halo and a pale core. */
const GLOW = { halo: 0xd8ff4f, core: 0xf4ffc0 } as const;
/** How far the core is from the halo toward white (the game's own pair is about this far apart). */
const CORE_LIGHTEN = 0.65;

/** The light a glowing bug casts at night: the set's color with a paler core, or the game's own pair. */
export function glowColors(colors: BugColors | undefined): { halo: number; core: number } {
  const halo = colors?.glow;
  if (halo === undefined) return GLOW;
  const paler = (shift: number): number => {
    const c = (halo >> shift) & 0xff;
    return Math.round(c + (0xff - c) * CORE_LIGHTEN) << shift;
  };
  return { halo, core: paler(16) | paler(8) | paler(0) };
}

/** Where the game puts a glowing bug's light, in bug radii from its center as it faces right: on Flick's code-drawn tail. */
const LANTERN = { x: -0.7, y: 0.1 } as const;

/**
 * Where a glowing bug's light sits at night, in game pixels from its center
 * as it faces right: the spot the set names, or the game's own. `radius` is
 * the bug's, in game pixels.
 */
export function lanternAt(colors: BugColors | undefined, radius: number): XY {
  return colors?.lantern ?? { x: LANTERN.x * radius, y: LANTERN.y * radius };
}
