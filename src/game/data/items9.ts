import type { Advert, ItemDef } from './types';

/**
 * Bugs play instruments on their own (game design doc, section 10): fun
 * +20, for 8 to 24 beats.
 */
export const PLAY_INSTRUMENT: Advert = { action: 'play', needs: { need_fun: 20 } };

/**
 * M9's instruments that lie about in the world (game design doc, section
 * 7.6): a seedpod maraca and acorn castanets in the flowerbed, a bottle
 * flute half sunk at the pond's edge, and a leaf xylophone in the treehouse.
 * The crafted ones (kazoo, harp, can bass, thimble drum) are in `items8.ts`.
 * Each plays notes in the current track's key, on its beat.
 */
export const M9_ITEMS: readonly ItemDef[] = [
  {
    id: 'item_inst_seedpod_maraca',
    name: 'Seedpod maraca',
    shape: { type: 'box', width: 0.34, height: 0.62 },
    material: 'mat_wood',
    density: 0.6,
    friction: 0.6,
    restitution: 0.25,
    art: 'maraca',
    color: 0xc98a3a,
    accent: 0x6b8f3a,
    tags: ['tag_musical', 'tag_light'],
    adverts: [PLAY_INSTRUMENT],
    toy: 'instrument',
    note: 0,
  },
  {
    id: 'item_inst_acorn_castanets',
    name: 'Acorn castanets',
    shape: { type: 'box', width: 0.46, height: 0.3 },
    material: 'mat_wood',
    density: 0.8,
    friction: 0.6,
    restitution: 0.3,
    art: 'castanets',
    color: 0xa86a32,
    accent: 0x6b4a2a,
    tags: ['tag_musical'],
    adverts: [PLAY_INSTRUMENT],
    toy: 'instrument',
    note: 0,
  },
  {
    id: 'item_inst_bottle_flute',
    name: 'Bottle flute',
    shape: { type: 'box', width: 0.3, height: 0.7 },
    material: 'mat_glass',
    density: 0.9,
    friction: 0.5,
    restitution: 0.15,
    art: 'bottle_flute',
    color: 0x7ec8a8,
    accent: 0xf2c98a,
    tags: ['tag_musical'],
    adverts: [PLAY_INSTRUMENT],
    toy: 'instrument',
    note: 4,
  },
  {
    id: 'item_inst_leaf_xylophone',
    name: 'Leaf xylophone',
    shape: { type: 'box', width: 1.1, height: 0.34 },
    material: 'mat_wood',
    density: 0.7,
    friction: 0.7,
    restitution: 0.2,
    art: 'leaf_xylophone',
    color: 0x6fbf4a,
    accent: 0x8a5a3a,
    tags: ['tag_musical'],
    adverts: [PLAY_INSTRUMENT],
    toy: 'instrument',
    note: 2,
  },
];
