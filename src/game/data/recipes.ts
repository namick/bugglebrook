import type { RecipeDef, RecipeInput } from './types';
import { createRegistry } from './registry';

/** Any balloon will do. */
export const ANY_BALLOON: RecipeInput = {
  anyOf: ['item_balloon_red', 'item_balloon_blue'],
  label: 'balloon',
};
/** Any paint drop will do. */
export const ANY_PAINT: RecipeInput = {
  anyOf: [
    'item_paint_red',
    'item_paint_blue',
    'item_paint_yellow',
    'item_paint_white',
    'item_paint_black',
    'item_paint_glow',
  ],
  label: 'paint',
};
const GLOWING: RecipeInput = { tag: 'tag_glowing' };

const recipe = (id: string, inputs: readonly RecipeInput[], output: string): RecipeDef => ({
  id: `recipe_${id}`,
  inputs,
  output,
});

// The Tinker Bench's 32 recipes (game design doc, section 8), in table order.
// Order matters only for hints: a near miss names the first undiscovered one.
export const RECIPES = createRegistry<RecipeDef>('recipe', [
  recipe('slingshot', ['item_twig', 'item_rubber_band'], 'item_slingshot_twig'),
  recipe('spring_launcher', ['item_spring_coil', 'item_bottle_cap'], 'item_spring_launcher'),
  recipe('matchbox_racer', ['item_matchbox', 'item_button', 'item_button'], 'item_matchbox_racer'),
  recipe('leaf_raft', ['item_leaf', 'item_popsicle_stick'], 'item_leaf_raft'),
  recipe('paper_boat', ['item_paper_scrap', 'item_straw'], 'item_paper_boat'),
  recipe('parachute', ['item_tissue', 'item_string'], 'item_parachute'),
  recipe('balloon_basket', [ANY_BALLOON, 'item_string', 'item_matchbox'], 'item_balloon_basket'),
  recipe('propeller_hat', ['item_maple_seed', 'item_bottle_cap'], 'item_hat_propeller'),
  recipe(
    'viking_helmet',
    ['item_hat_thimble', 'item_seed_sunflower', 'item_seed_sunflower'],
    'item_hat_viking',
  ),
  recipe('googly_glasses', ['item_button', 'item_button', 'item_paperclip'], 'item_acc_googly_glasses'),
  recipe('kazoo', ['item_comb_tooth', 'item_paper_scrap'], 'item_inst_comb_kazoo'),
  recipe('harp', ['item_matchbox', 'item_rubber_band'], 'item_inst_rubber_band_harp'),
  recipe('can_bass', ['item_tin_can', 'item_rubber_band'], 'item_inst_can_bass'),
  recipe('thimble_drum', ['item_hat_thimble', 'item_balloon_scrap'], 'item_inst_thimble_drum'),
  recipe('can_phone', ['item_tin_can', 'item_string', 'item_tin_can'], 'item_tin_can_phone'),
  recipe('catapult', ['item_popsicle_stick', 'item_cork', 'item_bottle_cap'], 'item_spoon_catapult'),
  recipe('seesaw', ['item_popsicle_stick', 'item_cork'], 'item_popsicle_seesaw'),
  recipe('bubble_wand', ['item_paperclip', 'item_soap_sliver'], 'item_bubble_wand'),
  recipe('pinwheel', ['item_paper_scrap', 'item_toothpick'], 'item_pinwheel'),
  recipe('disco_ball', ['item_foil_ball', 'item_string'], 'item_disco_ball'),
  recipe('magnet_crane', ['item_magnet', 'item_string', 'item_popsicle_stick'], 'item_magnet_crane'),
  recipe('snorkel', ['item_straw', 'item_cork'], 'item_acc_snorkel'),
  recipe(
    'roller_skates',
    ['item_bottle_cap', 'item_bottle_cap', 'item_rubber_band'],
    'item_acc_roller_skates',
  ),
  recipe('leaf_cape', ['item_leaf', 'item_string'], 'item_acc_cape_leaf'),
  recipe('foil_crown', ['item_foil_ball', 'item_bottle_cap'], 'item_acc_crown_foil'),
  recipe('straw_rocket', ['item_straw', 'item_paper_scrap', 'item_fizz_candy'], 'item_straw_rocket'),
  recipe('trampoline', ['item_tissue', 'item_rubber_band', 'item_popsicle_stick'], 'item_trampoline'),
  recipe('headlamp', ['item_glass_bead', 'item_rubber_band', GLOWING], 'item_acc_headlamp'),
  recipe('beanie', ['item_thread_spool', 'item_toothpick', 'item_toothpick'], 'item_hat_yarn_beanie'),
  recipe('backpack', ['item_matchbox', 'item_string'], 'item_acc_backpack_matchbox'),
  recipe('pirate_hat', ['item_paper_scrap', 'item_paint_black'], 'item_hat_pirate'),
  // M11: the yarn scarf, which section 7.3 says is crafted.
  recipe('yarn_scarf', ['item_thread_spool', 'item_string'], 'item_acc_scarf_yarn'),
  recipe('glow_paint', [ANY_PAINT, GLOWING], 'item_paint_glow'),
]);
