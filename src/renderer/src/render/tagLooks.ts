/**
 * How tags show on things (game design doc, section 6, the "Look" column).
 * Every rule has to be visible so players can guess the combos: wet things
 * drip and look darker, hot things glow and shimmer, frozen things sit in
 * ice, stinky things give off green lines, soapy things foam. Pure, so the
 * table is unit-tested.
 */
export interface TagLook {
  /** A color multiplied over the sprite, or null. */
  tint: number | null;
  /** Drips falling off it, and their color. */
  drip: number | null;
  /** Seconds between drips. */
  dripEvery: number;
  /** Wavy green stink lines rising, with the odd cloud puff. */
  stink: boolean;
  /** A warm glow behind it, and heat shimmer above. */
  hot: boolean;
  /** Frost sparkles around it (cold). */
  frost: boolean;
  /** Encased in a block of ice. */
  ice: boolean;
  /** White foam bits on top (soapy). */
  foam: boolean;
  /** A glossy highlight (sticky). */
  gloss: boolean;
  /** Hair sticking out in spikes (fuzzy). */
  fuzz: boolean;
  /** A green sheen (slimy). */
  slime: boolean;
}

export const NO_LOOK: TagLook = {
  tint: null,
  drip: null,
  dripEvery: 0,
  stink: false,
  hot: false,
  frost: false,
  ice: false,
  foam: false,
  gloss: false,
  fuzz: false,
  slime: false,
};

export const WET_TINT = 0xa9c1de;
export const FROZEN_TINT = 0xcfeeff;
export const HOT_TINT = 0xffc09a;
export const WATER_DROP = 0x5cc3e6;
export const SLIME_DROP = 0x9bd14a;

/**
 * The look for a set of tags. `inWater` is how far under water the thing
 * is: things in the water do not drip. Frozen beats wet beats hot for tint.
 */
export function tagLook(tags: readonly string[], inWater = 0): TagLook {
  const has = (t: string): boolean => tags.includes(t);
  const look: TagLook = { ...NO_LOOK };
  if (has('tag_hot')) {
    look.hot = true;
    look.tint = HOT_TINT;
  }
  if (has('tag_wet')) {
    look.tint = WET_TINT;
    if (inWater < 0.2) {
      look.drip = WATER_DROP;
      look.dripEvery = has('tag_absorbent') ? 0.12 : 0.32;
    }
  }
  if (has('tag_slimy')) {
    look.slime = true;
    if (look.drip === null) {
      look.drip = SLIME_DROP;
      look.dripEvery = 0.8;
    }
  }
  if (has('tag_frozen')) {
    look.ice = true;
    look.tint = FROZEN_TINT;
    look.drip = null;
  }
  look.frost = has('tag_cold') || has('tag_frozen');
  look.stink = has('tag_smelly');
  look.foam = has('tag_soapy');
  look.gloss = has('tag_sticky');
  look.fuzz = has('tag_fuzzy');
  return look;
}
