/**
 * Paint colors and rule R23, paint on paint (game design doc, section 6):
 * red and yellow make orange, red and blue purple, blue and yellow green,
 * white lightens, black darkens, and three primaries make brown. Pure.
 *
 * Paint is named, never mixed as numbers, so saves stay readable and the
 * renderer looks the color up in `PAINT_HEX`.
 */

type Primary = 'r' | 'b' | 'y';
type Tone = -1 | 0 | 1;

/** Every color paint can be, by primaries and tone (dark, plain, light). */
const NAMES: Readonly<Record<string, readonly [string, string, string]>> = {
  '': ['paint_black', 'paint_grey', 'paint_white'],
  r: ['paint_maroon', 'paint_red', 'paint_pink'],
  b: ['paint_navy', 'paint_blue', 'paint_sky'],
  y: ['paint_olive', 'paint_yellow', 'paint_cream'],
  ry: ['paint_rust', 'paint_orange', 'paint_peach'],
  br: ['paint_plum', 'paint_purple', 'paint_lilac'],
  by: ['paint_forest', 'paint_green', 'paint_mint'],
  bry: ['paint_umber', 'paint_brown', 'paint_tan'],
};

/** The renderer's colors for every paint. */
export const PAINT_HEX: Readonly<Record<string, number>> = {
  paint_red: 0xe8453c,
  paint_blue: 0x4d7cff,
  paint_yellow: 0xffd23f,
  paint_white: 0xffffff,
  paint_black: 0x2b2438,
  paint_grey: 0x9a94a8,
  paint_maroon: 0x8e2a25,
  paint_pink: 0xff9aa8,
  paint_navy: 0x2a3f8f,
  paint_sky: 0x9ec5ff,
  paint_olive: 0x9a8a1e,
  paint_cream: 0xfff0a8,
  paint_rust: 0xa8521a,
  paint_orange: 0xff8c2e,
  paint_peach: 0xffc08a,
  paint_plum: 0x5a2f80,
  paint_purple: 0x9b5de5,
  paint_lilac: 0xcfa8f5,
  paint_forest: 0x2f7a3a,
  paint_green: 0x5cc85a,
  paint_mint: 0xa8e6a0,
  paint_umber: 0x4a3020,
  paint_brown: 0x8a5a3a,
  paint_tan: 0xc9a07a,
  paint_glow: 0xc8ff6b,
};

function parts(paint: string): { p: Set<Primary>; tone: Tone } | null {
  for (const [key, names] of Object.entries(NAMES)) {
    const i = names.indexOf(paint);
    if (i >= 0) return { p: new Set(key.split('').filter(Boolean) as Primary[]), tone: (i - 1) as Tone };
  }
  return null;
}

function named(p: ReadonlySet<Primary>, tone: Tone): string {
  const key = [...p].sort().join('');
  return NAMES[key]![tone + 1]!;
}

/** Rule R23: `top` painted over `under`. Glow paint does not mix: the newer coat wins. */
export function mixPaint(under: string, top: string): string {
  if (under === top || top === 'paint_glow' || under === 'paint_glow') return top;
  const a = parts(under);
  const b = parts(top);
  if (!a || !b) return top;
  const p = new Set<Primary>([...a.p, ...b.p]);
  // White and black only shift the tone; two colors keep the stronger shift.
  const sum = a.tone + b.tone;
  const tone = (sum > 0 ? 1 : sum < 0 ? -1 : 0) as Tone;
  if (p.size === 0) return named(p, a.tone === b.tone ? a.tone : 0);
  return named(p, tone);
}

/** Mix a list of paints in order, as if poured one after another. */
export function mixAll(paints: readonly string[]): string | null {
  let out: string | null = null;
  for (const p of paints) out = out === null ? p : mixPaint(out, p);
  return out;
}

/** How many different primaries are in these paints (three different colors make a rainbow brew). */
export function distinctColors(paints: readonly string[]): number {
  return new Set(paints).size;
}
