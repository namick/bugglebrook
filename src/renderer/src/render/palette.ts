/** Shared art constants. Every shape gets the same thick dark outline. */
export const OUTLINE = 0x2b1d2e;
export const OUTLINE_WIDTH = 6;
export const EYE_WHITE = 0xffffff;
export const CHEEK = 0xff8fab;
export const SHADOW = 0x2b1d2e;
export const STAR = 0xffd23f;

export const stroke = (
  width = OUTLINE_WIDTH,
  color = OUTLINE,
): { width: number; color: number; join: 'round'; cap: 'round' } => ({
  width,
  color,
  join: 'round',
  cap: 'round',
});

/** Blend two 0xRRGGBB colors; t = 0 gives a, t = 1 gives b. */
export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number): number => (c >> s) & 0xff;
  const m = (s: number): number => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);
export const darken = (c: number, t: number): number => mix(c, OUTLINE, t);
