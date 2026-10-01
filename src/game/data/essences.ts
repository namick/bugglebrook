import type { EssenceId } from './types';

/**
 * Essences (game design doc, section 9). Every ingredient carries one, and
 * the cauldron decides the potion from essences, not items, so players can
 * reason about it. Most come from the item; a few from a tag (anything
 * glowing, anything fuzzy, snail slime), and the moon pebble's depends on
 * the hour: glow by day, moon by night.
 */
export const ESSENCE_IDS: readonly EssenceId[] = [
  'ess_grow',
  'ess_shrink',
  'ess_float',
  'ess_inflate',
  'ess_glow',
  'ess_color',
  'ess_sticky',
  'ess_fizz',
  'ess_soap',
  'ess_hot',
  'ess_cold',
  'ess_heavy',
  'ess_bounce',
  'ess_speed',
  'ess_slow',
  'ess_stink',
  'ess_sleep',
  'ess_sound',
  'ess_moon',
  'ess_mirror',
  'ess_hair',
  'ess_magnet',
];

/** Ingredients by item ID. Paints are `ess_color` through their `paint` field. */
export const ESSENCE_ITEMS: Readonly<Record<string, EssenceId>> = {
  item_mushroom_cap: 'ess_grow',
  item_hat_mushroom: 'ess_grow',
  item_apple_core: 'ess_grow',
  item_ant_crumb: 'ess_shrink',
  item_seed_sunflower: 'ess_shrink',
  item_feather: 'ess_float',
  item_maple_seed: 'ess_float',
  item_popcorn: 'ess_float',
  item_balloon_scrap: 'ess_inflate',
  item_glass_bead: 'ess_glow',
  item_berry_red: 'ess_color',
  item_blueberry: 'ess_color',
  item_honey_drop: 'ess_sticky',
  item_gum_blob: 'ess_sticky',
  item_fizz_candy: 'ess_fizz',
  item_soap_sliver: 'ess_soap',
  item_pepper_hot: 'ess_hot',
  item_ice_cube: 'ess_cold',
  item_mint_leaf: 'ess_cold',
  item_pebble: 'ess_heavy',
  item_old_coin: 'ess_heavy',
  item_rubber_band: 'ess_bounce',
  item_jelly_bean: 'ess_bounce',
  item_coffee_bean: 'ess_speed',
  item_moss_tuft: 'ess_slow',
  item_onion_ring: 'ess_stink',
  item_dung_ball: 'ess_stink',
  item_rotten_banana_bit: 'ess_stink',
  item_compost_goo: 'ess_stink',
  item_lavender_sprig: 'ess_sleep',
  item_bluebell_bloom: 'ess_sound',
  item_foil_ball: 'ess_mirror',
  item_tissue: 'ess_hair',
  item_magnet: 'ess_magnet',
};

/** Items whose essence is the moon's at night and glow's by day. */
export const MOON_ITEMS: readonly string[] = ['item_moon_pebble'];

/** Essences that come from a tag, for items not listed above, checked in this order. */
export const ESSENCE_TAGS: readonly (readonly [string, EssenceId])[] = [
  ['tag_glowing', 'ess_glow'],
  ['tag_fuzzy', 'ess_hair'],
  ['tag_slimy', 'ess_slow'],
];

/** The colors berries bring to a paint potion. */
export const ESSENCE_PAINT: Readonly<Record<string, string>> = {
  item_berry_red: 'paint_red',
  item_blueberry: 'paint_blue',
};

/**
 * Opposite essences (game design doc, section 9, rule 2): brewed together,
 * they make a wobble potion that flips between the two every 2 s.
 */
export const OPPOSITES: readonly (readonly [EssenceId, EssenceId])[] = [
  ['ess_grow', 'ess_shrink'],
  ['ess_hot', 'ess_cold'],
  ['ess_float', 'ess_heavy'],
  ['ess_speed', 'ess_slow'],
  ['ess_sleep', 'ess_speed'],
];
