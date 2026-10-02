import type { HintGlyph, SecretDef } from './types';
import { createRegistry } from './registry';

/**
 * All 67 secrets (game design doc, section 12), in the doc's order. The sim
 * finds each one with `sim.findSecret` (`sim.secrets`, `secret_found`), and
 * the journal lists them by area. A secret whose bug or system is not in the
 * game yet is `blocked`, with the reason; the journal leaves it out, and
 * `tests/unit/secretAudit.test.ts` checks that every other secret has a
 * trigger in the code.
 */
/**
 * Secrets being built in M10, blocked until their trigger lands. Each one
 * leaves this list when it does; the list must be empty when M10 ships.
 */
export const M10_PENDING: ReadonlySet<string> = new Set([
  'secret_ant_sugar',
  'secret_queen_sweet',
  'secret_root_pull',
  'secret_ant_conga',
  'secret_map_scrap_2',
  'secret_gnome_inside',
  'secret_constellations',
  'secret_golden_marble_home',
]);

function secret(
  id: string,
  tier: 1 | 2 | 3,
  area: string,
  name: string,
  hint: readonly HintGlyph[],
  extra: Partial<Pick<SecretDef, 'unlocks' | 'requires' | 'blocked'>> = {},
): SecretDef {
  return {
    id,
    name,
    tier,
    trigger: { type: 'scripted', area },
    unlocks: extra.unlocks ?? [],
    hint,
    ...(extra.requires ? { requires: extra.requires } : {}),
    ...(extra.blocked
      ? { blocked: extra.blocked }
      : M10_PENDING.has(id)
        ? { blocked: 'Being built in M10' }
        : {}),
  };
}

const PLAZA = 'area_stump_plaza';
const POND = 'area_puddle_pond';
const FLOWERBED = 'area_flowerbed_stage';
const PORCH = 'area_under_porch';
const COMPOST = 'area_compost_lab';
const TREEHOUSE = 'area_treehouse_arcade';
const DEPTHS = 'area_ant_hill_depths';
const HOLLOW = 'area_gnome_hollow';

/** Why some secrets wait: bugs and systems that later work brings. */
const NO_BUZZBY = 'Buzzby (bug_bee_buzzby) is not in the cast yet';
const NO_FIDDLE = 'Fiddle (bug_cricket_fiddle) is not in the cast yet';
const NO_LUMA = 'Luma (bug_moth_luma) is not in the cast yet';
const NO_WEARING = 'Wearing hats arrives with M11 wearables';

export const SECRETS = createRegistry<SecretDef>('secret', [
  // --- Mossy Stump Plaza -----------------------------------------------------
  secret('secret_stump_eyes', 1, PLAZA, 'Stump eyes', ['moon', 'eye']),
  secret('secret_ant_sugar', 1, PLAZA, 'Ant door', ['item_sugar_cube'], {
    unlocks: [{ kind: 'area', id: DEPTHS }],
  }),
  secret('secret_mushroom_chord', 1, PLAZA, 'Mushroom chord', ['mushrooms3', 'notes3']),
  secret('secret_twig_blinks', 2, PLAZA, 'Twig', ['item_twig', 'eye'], {
    unlocks: [{ kind: 'bug', id: 'bug_stickinsect_twig' }],
  }),
  secret('secret_sundial_midnight', 2, PLAZA, 'Midnight dial', ['moon', 'dial']),
  secret('secret_worm_hat', 2, PLAZA, 'Worm hat', ['worm', 'hat'], { blocked: NO_WEARING }),
  secret('secret_sun_shades', 1, PLAZA, 'Sun shades', ['sun']),
  secret('secret_bug_totem', 2, PLAZA, 'Bug totem', ['stack']),
  // --- Puddle Pond -----------------------------------------------------------
  secret('secret_boot_key', 1, POND, 'Boot key', ['boot'], {
    unlocks: [{ kind: 'item', id: 'item_key_tiny' }],
  }),
  secret('secret_knothole_door', 2, PLAZA, 'Stump door', ['item_key_tiny'], {
    requires: ['secret_boot_key'],
    unlocks: [{ kind: 'item', id: 'item_map_scrap_1' }],
  }),
  secret('secret_moon_pebble', 2, POND, 'Moon pebble', ['moon', 'item_pebble'], {
    unlocks: [{ kind: 'item', id: 'item_moon_pebble' }],
  }),
  secret('secret_teacup_coins', 3, POND, 'Frog king', ['coins'], {
    requires: ['secret_knothole_door'],
    unlocks: [{ kind: 'item', id: 'item_hat_bubble' }],
  }),
  secret('secret_skip_stone', 2, POND, 'Five skips', ['item_pebble', 'arcs']),
  secret('secret_frog_blink', 1, POND, 'Big ribbit', ['frog']),
  secret('secret_raft_regatta', 2, POND, 'Regatta', ['item_leaf_raft']),
  secret('secret_firefly_flick', 2, POND, 'Flick', ['firefly', 'blinks'], {
    unlocks: [{ kind: 'bug', id: 'bug_firefly_flick' }],
  }),
  secret('secret_pond_freeze', 2, POND, 'Ice rink', ['snow']),
  secret('secret_sunflower_drink', 1, POND, 'Sunflower drink', ['drop'], {
    unlocks: [{ kind: 'area', id: FLOWERBED }],
  }),
  // --- Flowerbed Stage -------------------------------------------------------
  secret('secret_band_of_three', 1, FLOWERBED, 'Band of three', ['notes3', 'stage']),
  secret('secret_sequencer_song', 2, FLOWERBED, 'Theme song', ['grid']),
  secret('secret_gnome_knock', 2, FLOWERBED, 'Knock back', ['moon', 'knock']),
  secret('secret_paint_all_five', 2, FLOWERBED, 'Patchwork', ['drops5']),
  secret('secret_moth_spotlight', 2, FLOWERBED, 'Moth dance', ['moth', 'light'], {
    requires: ['secret_luma_found'],
    blocked: NO_LUMA,
  }),
  secret('secret_rain_dance', 2, FLOWERBED, 'Rain dance', ['cloud', 'feet']),
  secret('secret_buzzby_found', 1, FLOWERBED, 'Buzzby', ['bee'], { blocked: NO_BUZZBY }),
  secret('secret_munch_found', 1, FLOWERBED, 'Munch', ['leaf_bitten'], {
    unlocks: [{ kind: 'bug', id: 'bug_caterpillar_munch' }],
  }),
  secret('secret_fiddle_found', 2, FLOWERBED, 'Fiddle', ['cricket', 'moon'], { blocked: NO_FIDDLE }),
  secret('secret_munch_butterfly', 2, FLOWERBED, 'Butterfly', ['cocoon'], {
    requires: ['secret_munch_found'],
  }),
  secret('secret_rainbow_end', 3, FLOWERBED, 'Rainbow end', ['rainbow', 'item_jar_glass'], {
    unlocks: [{ kind: 'item', id: 'item_paint_rainbow' }],
  }),
  // --- Under the Porch -------------------------------------------------------
  secret('secret_whiff_found', 1, PORCH, 'Whiff', ['pot_eyes'], {
    unlocks: [{ kind: 'bug', id: 'bug_stinkbug_whiff' }],
  }),
  secret('secret_luma_found', 2, PORCH, 'Luma', ['moth', 'bulb'], { blocked: NO_LUMA }),
  secret('secret_lamp_moths', 2, PORCH, 'Moth spiral', ['lights3']),
  secret('secret_floor_coin', 1, PORCH, 'Yoink', ['item_old_coin', 'gap'], {
    unlocks: [{ kind: 'item', id: 'item_old_coin' }],
  }),
  secret('secret_spider_wave', 1, PORCH, 'Spider wave', ['spider']),
  secret('secret_rollo_tunnel', 1, PORCH, 'Can tunnel', ['item_rubber_ball', 'tunnel'], {
    unlocks: [{ kind: 'area', id: COMPOST }],
  }),
  secret('secret_flashlight_shadow', 2, PORCH, 'Shadow puppet', ['item_flashlight_pen', 'moon']),
  secret('secret_upside_tea', 3, PORCH, 'Spider tea', ['flip'], {
    requires: ['secret_moon_pebble'],
  }),
  secret('secret_first_blob', 1, PORCH, 'Junk blob', ['item_junk_blob']),
  // --- Compost Lab -----------------------------------------------------------
  secret('secret_first_potion', 1, COMPOST, 'First potion', ['bottle']),
  secret('secret_sludge_burp', 1, COMPOST, 'Sludge burp', ['fly']),
  secret('secret_triple_potion', 3, COMPOST, 'Foam fountain', ['drops3']),
  secret('secret_moose_found', 1, COMPOST, 'Moose', ['beetle_back'], {
    unlocks: [{ kind: 'bug', id: 'bug_stagbeetle_moose' }],
  }),
  secret('secret_barty_found', 1, COMPOST, 'Barty', ['item_rubber_ball'], {
    unlocks: [{ kind: 'bug', id: 'bug_dungbeetle_barty' }],
  }),
  secret('secret_compost_goo_hat', 2, COMPOST, 'Goo hat', ['item_compost_goo', 'hat'], {
    blocked: NO_WEARING,
  }),
  secret('secret_scope_wubbo', 2, COMPOST, 'Tiny waver', ['item_moss_tuft', 'eye']),
  secret('secret_wubbo_found', 3, COMPOST, 'Wubbo', ['chubby'], {
    requires: ['secret_scope_wubbo'],
  }),
  secret('secret_giant_launch', 2, COMPOST, 'Giant launch', ['spring_big']),
  // --- Treehouse Arcade ------------------------------------------------------
  secret('secret_marble_tune', 2, TREEHOUSE, 'Marble tune', ['item_marble_blue', 'notes3']),
  secret('secret_domino_chain', 2, TREEHOUSE, 'Domino chain', ['item_domino']),
  secret('secret_prim_found', 1, TREEHOUSE, 'Prim', ['claw'], {
    unlocks: [{ kind: 'bug', id: 'bug_mantis_prim' }],
  }),
  secret('secret_claw_triple', 2, TREEHOUSE, 'Claw champ', ['prize3'], {
    unlocks: [{ kind: 'item', id: 'item_hat_candle' }],
  }),
  // The doc's zipline is the leaf slide: the treehouse has no zipline.
  secret('secret_zipline_souvenir', 2, TREEHOUSE, 'Slide souvenir', ['slide'], {
    unlocks: [{ kind: 'item', id: 'item_map_scrap_3' }],
  }),
  secret('secret_window_telescope', 1, TREEHOUSE, 'Window peek', ['window']),
  secret('secret_catch_cloud', 3, TREEHOUSE, 'Cloud jar', ['cloud', 'item_jar_glass'], {
    unlocks: [{ kind: 'item', id: 'item_cloud_jar' }],
  }),
  // --- Ant Hill Depths -------------------------------------------------------
  secret('secret_queen_sweet', 1, DEPTHS, 'Queen treat', ['crown'], {
    requires: ['secret_ant_sugar'],
    unlocks: [{ kind: 'item', id: 'item_acc_monocle' }],
  }),
  secret('secret_root_pull', 2, DEPTHS, 'Root pull', ['root'], {
    requires: ['secret_ant_sugar'],
    unlocks: [{ kind: 'item', id: 'item_gnome_nose' }],
  }),
  secret('secret_ant_conga', 2, DEPTHS, 'Ant conga', ['ants', 'note'], {
    requires: ['secret_ant_sugar'],
  }),
  secret('secret_map_scrap_2', 2, DEPTHS, 'Pantry scrap', ['moon', 'map'], {
    requires: ['secret_ant_sugar'],
    unlocks: [{ kind: 'item', id: 'item_map_scrap_2' }],
  }),
  // --- Gnome Hollow ----------------------------------------------------------
  secret('secret_gnome_inside', 3, HOLLOW, 'Gnome door', ['gnome'], {
    requires: ['secret_root_pull'],
    unlocks: [{ kind: 'area', id: HOLLOW }],
  }),
  secret('secret_constellations', 2, HOLLOW, 'Bug stars', ['stars'], {
    requires: ['secret_gnome_inside'],
  }),
  // --- Anywhere, and the long chains -----------------------------------------
  secret('secret_treasure_map', 3, PLAZA, 'Treasure map', ['map'], {
    unlocks: [{ kind: 'item', id: 'item_treasure_map' }],
  }),
  secret('secret_golden_marble', 3, PLAZA, 'Golden marble', ['x_mark', 'moon'], {
    requires: ['secret_treasure_map', 'secret_sundial_midnight'],
    unlocks: [{ kind: 'item', id: 'item_marble_gold' }],
  }),
  secret('secret_golden_marble_home', 3, HOLLOW, 'Finale', ['pedestal'], {
    requires: ['secret_golden_marble', 'secret_gnome_inside'],
  }),
  secret('secret_fling_orbit', 2, PLAZA, 'Orbit', ['moon', 'rocket_bug']),
  secret('secret_twig_bridge', 2, POND, 'Twig bridge', ['bridge'], {
    requires: ['secret_twig_blinks'],
  }),
  secret('secret_ghost_lattice', 3, PORCH, 'Lattice ghost', ['ghost']),
  secret('secret_fashion_parade', 3, FLOWERBED, 'Hat parade', ['hats'], { blocked: NO_WEARING }),
]);
