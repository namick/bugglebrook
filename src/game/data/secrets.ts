import type { SecretDef } from './types';
import { createRegistry } from './registry';

// Secrets (game design doc, section 12). The journal that lists them comes
// in M10; for now the sim logs each one the first time it is found
// (`sim.secrets`, `secret_found`). M6 brings the ones that hang on the time
// of day: the sundial, the sun, the knothole, the moonlit teacup, and the
// fireflies. M7 adds the areas' unlocks, the found bugs, and a few secrets
// in the new areas. M8 adds the bench's first blob, the cauldron's
// potions, the bug scope, and what potions get up to.
export const SECRETS = createRegistry<SecretDef>('secret', [
  {
    id: 'secret_sundial_midnight',
    name: 'Midnight on the sundial',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_sun_shades',
    name: 'Sun shades',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_stump_eyes',
    name: 'Eyes in the stump',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_moon_pebble',
    name: 'Moon pebble',
    trigger: { type: 'scripted', area: 'area_puddle_pond' },
    unlocks: [{ kind: 'item', id: 'item_moon_pebble' }],
  },
  {
    id: 'secret_firefly_flick',
    name: 'Flick the firefly',
    trigger: { type: 'scripted', area: 'area_puddle_pond' },
    unlocks: [{ kind: 'bug', id: 'bug_firefly_flick' }],
  },
  // M7: areas and the bugs found in them.
  {
    id: 'secret_sunflower_drink',
    name: 'The sunflower drinks',
    trigger: { type: 'scripted', area: 'area_puddle_pond' },
    unlocks: [{ kind: 'area', id: 'area_flowerbed_stage' }],
  },
  {
    id: 'secret_rollo_tunnel',
    name: 'Through the can tunnel',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [{ kind: 'area', id: 'area_compost_lab' }],
  },
  {
    id: 'secret_whiff_found',
    name: 'Whiff the stink bug',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [{ kind: 'bug', id: 'bug_stinkbug_whiff' }],
  },
  {
    id: 'secret_moose_found',
    name: 'Moose the stag beetle',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [{ kind: 'bug', id: 'bug_stagbeetle_moose' }],
  },
  {
    id: 'secret_barty_found',
    name: 'Barty the dung beetle',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [{ kind: 'bug', id: 'bug_dungbeetle_barty' }],
  },
  {
    id: 'secret_munch_found',
    name: 'Munch the caterpillar',
    trigger: { type: 'scripted', area: 'area_flowerbed_stage' },
    unlocks: [{ kind: 'bug', id: 'bug_caterpillar_munch' }],
  },
  {
    id: 'secret_prim_found',
    name: 'Prim the mantis',
    trigger: { type: 'scripted', area: 'area_treehouse_arcade' },
    unlocks: [{ kind: 'bug', id: 'bug_mantis_prim' }],
  },
  {
    id: 'secret_twig_blinks',
    name: 'Twig the stick insect',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [{ kind: 'bug', id: 'bug_stickinsect_twig' }],
  },
  {
    id: 'secret_munch_butterfly',
    name: 'Munch the butterfly',
    trigger: { type: 'scripted', area: 'area_flowerbed_stage' },
    unlocks: [],
  },
  {
    id: 'secret_gnome_knock',
    name: 'Somebody knocks back',
    trigger: { type: 'scripted', area: 'area_flowerbed_stage' },
    unlocks: [],
  },
  {
    id: 'secret_band_of_three',
    name: 'A band of three',
    trigger: { type: 'scripted', area: 'area_flowerbed_stage' },
    unlocks: [],
  },
  {
    id: 'secret_sequencer_song',
    name: 'The Bugglebrook theme',
    trigger: { type: 'scripted', area: 'area_flowerbed_stage' },
    unlocks: [],
  },
  {
    id: 'secret_paint_all_five',
    name: 'Patchwork bug',
    trigger: { type: 'scripted', area: 'area_flowerbed_stage' },
    unlocks: [],
  },
  {
    id: 'secret_spider_wave',
    name: 'The spider waves back',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [],
  },
  {
    id: 'secret_floor_coin',
    name: 'Caught through the floorboards',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [{ kind: 'item', id: 'item_old_coin' }],
  },
  {
    id: 'secret_lamp_moths',
    name: 'Moths round the lamp',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [],
  },
  {
    id: 'secret_domino_chain',
    name: 'Twelve dominoes',
    trigger: { type: 'scripted', area: 'area_treehouse_arcade' },
    unlocks: [],
  },
  // M8: crafting and potions.
  {
    id: 'secret_first_blob',
    name: 'The first junk blob',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [],
  },
  {
    id: 'secret_first_potion',
    name: 'The first potion',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [],
  },
  {
    id: 'secret_sludge_burp',
    name: 'Sludge burp',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [],
  },
  {
    id: 'secret_triple_potion',
    name: 'Three-essence fountain',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [],
  },
  {
    id: 'secret_scope_wubbo',
    name: 'Something tiny in the moss',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [],
  },
  {
    id: 'secret_giant_launch',
    name: 'Giant launch',
    trigger: { type: 'scripted', area: 'area_compost_lab' },
    unlocks: [],
  },
  {
    id: 'secret_upside_tea',
    name: 'Tea with the spider',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [],
  },
  {
    id: 'secret_ghost_lattice',
    name: 'A ghost in the lattice',
    trigger: { type: 'scripted', area: 'area_under_porch' },
    unlocks: [],
  },
  // M11: photo mode.
  {
    id: 'secret_bug_totem',
    name: 'Bug totem',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_pond_freeze',
    name: 'The pond freezes over',
    trigger: { type: 'scripted', area: 'area_puddle_pond' },
    unlocks: [],
  },
]);
