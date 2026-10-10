// An art set's night lights (docs/06-art-guide.md, B20). Set art sits in the
// part of the world the sky grades, so anything painted to glow goes dark at
// night with the rest of the bug. A set can list points on a bug that the
// game lights after dark instead: soft additive glows in the weather's light
// layer, each riding the part it was painted on.
//
// The points are data, in `<bug_id>.lights.json` beside the bug's .ora:
//
//   { "lights": [ { "part": "shell", "x": 350, "y": 634, "r": 60, "color": "#7dffe0" } ] }
//
// `x`, `y`, and `r` are template pixels, the coordinates the layer is painted
// in. `pnpm art:build` checks the file against the bug's rig and writes each
// light into the manifest in game pixels from its part's pivot.
//
// This file is the pure half: the file's checks, which lights show in a body
// form, how bright they are, and where a light on a feeler sits. No runtime
// imports, so the Node scripts in scripts/art/ can load it.

import type { BodyForm } from '../render/bugFace';
import type { BugLight, RigFile, XY } from './rigFile';

/** The body forms a light may be limited to. */
export const LIGHT_FORMS = ['normal', 'curled', 'in_shell', 'flying'] as const satisfies readonly BodyForm[];
/** The most lights one bug's file may list. A part drawn several times shows each of its lights that many times. */
export const LIGHTS_PER_BUG = 16;
/** The longest reach a light may have, in template pixels (a meter in the game). */
export const LIGHT_MAX_R = 400;
const KEYS = ['part', 'x', 'y', 'r', 'color', 'forms'];
const ENTRY = '{ "part": "shell", "x": 350, "y": 634, "r": 60, "color": "#7dffe0" }';
const EXAMPLE = `{ "lights": [ ${ENTRY} ] }`;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Check a bug's `.lights.json` against its rig and turn each light into game
 * pixels from its part's pivot. Returns the lights that are right and, in
 * plain words, everything wrong with the rest. `pivots` are any the artist
 * moved (`pivot_` dots).
 */
export function parseBugLights(
  text: string,
  rig: Pick<RigFile, 'parts' | 'scale' | 'canvas'>,
  pivots?: ReadonlyMap<string, XY>,
): { lights: BugLight[]; problems: string[] } {
  const lights: BugLight[] = [];
  const problems: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { lights, problems: [`The lights file is not valid JSON: ${(err as Error).message}`] };
  }
  if (!isObject(raw) || !Array.isArray(raw.lights))
    return { lights, problems: [`The lights file must look like ${EXAMPLE}.`] };
  for (const key of Object.keys(raw))
    if (key !== 'lights') problems.push(`"${key}" is not a key the lights file can have. Only "lights" is.`);
  const names = rig.parts.map((p) => p.name);
  const { w, h } = rig.canvas;
  raw.lights.forEach((entry: unknown, i: number) => {
    const at = `Light ${i + 1}`;
    if (i >= LIGHTS_PER_BUG) {
      if (i === LIGHTS_PER_BUG)
        problems.push(
          `There are ${(raw.lights as unknown[]).length} lights. A bug can have at most ${LIGHTS_PER_BUG}; the rest are left out.`,
        );
      return;
    }
    if (!isObject(entry)) {
      problems.push(`${at} must be an object, like ${ENTRY}.`);
      return;
    }
    const wrong: string[] = [];
    for (const key of Object.keys(entry))
      if (!KEYS.includes(key))
        wrong.push(`"${key}" is not a key a light has. The keys are ${KEYS.join(', ')}.`);
    const part = rig.parts.find((p) => p.name === entry.part);
    if (!part) wrong.push(`"part" must be one of this bug's parts: ${names.join(', ')}.`);
    const { x, y, r } = entry;
    if (!isNumber(x) || !isNumber(y) || x < 0 || y < 0 || x > w || y > h)
      wrong.push(`"x" and "y" must be numbers inside the canvas (${w} x ${h}).`);
    if (!isNumber(r) || r < 1 || r > LIGHT_MAX_R)
      wrong.push(`"r" must be a number from 1 to ${LIGHT_MAX_R}.`);
    const color =
      typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color)
        ? parseInt(entry.color.slice(1), 16)
        : null;
    if (color === null) wrong.push('"color" must be a color like "#7dffe0".');
    const forms = entry.forms;
    const formsOk =
      forms === undefined ||
      (Array.isArray(forms) &&
        forms.length > 0 &&
        forms.every((f) => (LIGHT_FORMS as readonly unknown[]).includes(f)));
    if (!formsOk) wrong.push(`"forms" must list one or more of ${LIGHT_FORMS.join(', ')}.`);
    if (wrong.length || !part || color === null) {
      for (const text of wrong) problems.push(`${at}: ${text}`);
      return;
    }
    const pivot = pivots?.get(part.name) ?? part.pivot;
    const light: BugLight = {
      part: part.name,
      x: r3(((x as number) - pivot.x) / rig.scale),
      y: r3(((y as number) - pivot.y) / rig.scale),
      r: r3((r as number) / rig.scale),
      color,
    };
    if (forms !== undefined) light.forms = [...(forms as string[])];
    lights.push(light);
  });
  return { lights, problems };
}

/** Whether a light shows in a body form. */
export const lightInForm = (light: BugLight, form: string): boolean =>
  !light.forms || light.forms.includes(form);

/** Below this much of the sky's night glow the lights are off: by day they cost nothing. */
export const LIGHT_NIGHT = 0.05;
/** How bright a light is at full night on a bug that is awake. */
const STRENGTH = 0.8;
/** A sleeping bug's lights are dimmer, about as Flick's lantern is. */
const ASLEEP = 0.5;

/**
 * How bright a bug's lights are, 0 to 1. `glow` is the sky's night glow
 * (`SkyLook.glow`), the curve the mushrooms and Flick's lantern follow, so
 * the lights come up at dusk and go down at dawn with them. They are dimmer
 * on a sleeping bug, go out under water as the lantern does, and fade with a
 * see-through bug. A bug still disguised as a twig has none: plain twigs do
 * not glow, and the lights would give him away. `pulse` is the bug's slow
 * breathing, about 1.
 */
export function nightLightAlpha(
  glow: number,
  bug: { asleep: boolean; submerged: number; alpha: number; disguised?: boolean },
  pulse = 1,
): number {
  if (glow <= LIGHT_NIGHT || bug.submerged > 0.3 || bug.disguised) return 0;
  const a = glow * STRENGTH * (bug.asleep ? ASLEEP : 1) * bug.alpha * pulse;
  return Math.max(0, Math.min(1, a));
}

/**
 * The point `t` of the way along a feeler (0 its base, 1 its tip), stepping
 * evenly from point to point as the feeler's drawing is stretched over them.
 */
export function alongRope(pts: readonly XY[], t: number, out: XY = { x: 0, y: 0 }): XY {
  const last = pts.length - 1;
  if (last < 0) return out;
  const f = Math.max(0, Math.min(1, t)) * last;
  const i = Math.min(last, Math.floor(f));
  const a = pts[i]!;
  const b = pts[Math.min(last, i + 1)]!;
  out.x = a.x + (b.x - a.x) * (f - i);
  out.y = a.y + (b.y - a.y) * (f - i);
  return out;
}
