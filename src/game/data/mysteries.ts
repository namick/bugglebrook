import type { MysteryDef } from './types';
import { createRegistry } from './registry';

/**
 * The four mysteries (game design doc, section 12): chains of secrets across
 * areas. The journal draws each as a comic strip that fills in panel by
 * panel. A panel is done when its secret is found, when the player noticed
 * its clue (`journal.noticed`), or when its item has been found.
 */
export const MYSTERIES = createRegistry<MysteryDef>('mystery', [
  {
    id: 'mystery_gnome_nose',
    name: 'The gnome nose',
    areas: ['area_flowerbed_stage', 'area_ant_hill_depths', 'area_gnome_hollow'],
    steps: [
      { noticed: 'gnome_sniffle', hint: ['gnome'] },
      { secret: 'secret_gnome_knock', hint: ['moon', 'knock'] },
      { secret: 'secret_ant_sugar', hint: ['item_sugar_cube'] },
      { secret: 'secret_root_pull', hint: ['root'] },
      { item: 'item_gnome_nose', noticed: 'nose_carried', hint: ['item_gnome_nose'] },
      { secret: 'secret_gnome_inside', hint: ['gnome'] },
    ],
  },
  {
    id: 'mystery_treasure_map',
    name: 'The treasure map',
    areas: [
      'area_stump_plaza',
      'area_puddle_pond',
      'area_ant_hill_depths',
      'area_treehouse_arcade',
      'area_gnome_hollow',
    ],
    steps: [
      { secret: 'secret_knothole_door', hint: ['item_key_tiny'] },
      { secret: 'secret_map_scrap_2', hint: ['moon', 'map'] },
      { secret: 'secret_zipline_souvenir', hint: ['slide'] },
      { item: 'item_map_scrap_4', hint: ['gnome', 'map'] },
      { secret: 'secret_treasure_map', hint: ['map'] },
      { secret: 'secret_golden_marble', hint: ['x_mark', 'moon'] },
      { secret: 'secret_golden_marble_home', hint: ['pedestal'] },
    ],
  },
  {
    id: 'mystery_tiny_squeak',
    name: 'The tiny squeak',
    areas: ['area_under_porch', 'area_compost_lab'],
    steps: [
      { noticed: 'moss_squeak', hint: ['moon', 'squeak'] },
      { secret: 'secret_flashlight_shadow', hint: ['item_flashlight_pen', 'moon'] },
      { secret: 'secret_scope_wubbo', hint: ['item_moss_tuft', 'eye'] },
      { item: 'item_potion_giant', hint: ['item_mushroom_cap', 'bottle'] },
      { secret: 'secret_wubbo_found', hint: ['chubby'] },
    ],
  },
  {
    id: 'mystery_catch_a_cloud',
    name: 'Catch a cloud',
    areas: ['area_treehouse_arcade', 'area_under_porch', 'area_compost_lab'],
    steps: [
      { item: 'item_blueprint_balloon_basket', hint: ['blueprint'] },
      { item: 'item_balloon_basket', hint: ['item_balloon_red'] },
      { noticed: 'rain_seen', hint: ['cloud'] },
      { secret: 'secret_catch_cloud', hint: ['cloud', 'item_jar_glass'] },
      { noticed: 'cloud_jar_used', hint: ['item_cloud_jar'] },
    ],
  },
]);
