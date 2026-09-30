/** Shared art constants. Every shape gets the same thick dark outline. */
export const OUTLINE = 0x2b1b2e;
export const OUTLINE_WIDTH = 6;
export const EYE_WHITE = 0xffffff;
export const CHEEK = 0xff8fab;
export const SHADOW = 0x000000;

export const stroke = (
  width = OUTLINE_WIDTH,
): { width: number; color: number; join: 'round'; cap: 'round' } => ({
  width,
  color: OUTLINE,
  join: 'round',
  cap: 'round',
});
