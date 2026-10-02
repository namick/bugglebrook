import type { AreaDef } from './types';

/**
 * M10's two hidden areas (game design doc, section 3, areas 7 and 8). They
 * sit past the surface strip in world x, right after the treehouse: the Ant
 * Hill Depths from 195.2 to 220.8 m and Gnome Hollow from 220.8 to 240 m.
 * Each one is sealed (a solid wall on its left, a solid ceiling over it, and
 * the next area's wall or the world's end on its right) and is reached only
 * through a doorway: the ant hill in the plaza and the gnome's hat in the
 * flowerbed. Area data keeps area-local x, like the surface areas.
 */

/** How thick the wall on a hidden area's left is (m). Its open stretch starts here. */
export const SEAL = 0.6;

/** The levels of the ant colony's tunnels (world y of each floor). */
export const DEPTHS_LEVELS = { top: 3.4, middle: 6.2, bottom: 9 } as const;
/** The depths' ceiling (world y) and the entrance shaft's top. */
export const DEPTHS_CEILING = 1;
const SHAFT_TOP = 0.15;

/** Gnome Hollow's painted ceiling (world y). */
export const HOLLOW_CEILING = 0.9;

export const DEPTHS: AreaDef = {
  id: 'area_ant_hill_depths',
  name: 'Ant Hill Depths',
  xStart: 195.2,
  xEnd: 220.8,
  hidden: true,
  terrain: [
    [0, 9],
    [SEAL, 9],
    [5.4, 9],
    // The pantry's floor is worn a little lower by all the hauling.
    [6.2, 9.2],
    [8.6, 9.2],
    [9.4, 9],
    [16.5, 9],
    // The throne room's floor.
    [17.2, 9.12],
    [20.8, 9.12],
    [21.5, 9],
    [25.6, 9],
  ],
  start: [
    // Crumbs about the colony: tiny-potion ingredients.
    { kind: 'item', defId: 'item_ant_crumb', x: 5.2 },
    { kind: 'item', defId: 'item_ant_crumb', x: 9.7 },
    { kind: 'item', defId: 'item_ant_crumb', x: 2.2, y: DEPTHS_LEVELS.middle },
    { kind: 'item', defId: 'item_ant_crumb', x: 9.2, y: DEPTHS_LEVELS.top },
    { kind: 'item', defId: 'item_ant_crumb', x: 17.4 },
    { kind: 'item', defId: 'item_ant_crumb', x: 23.0, y: DEPTHS_LEVELS.middle },
    // The queen's old foil crown, outgrown, by the throne.
    { kind: 'item', defId: 'item_acc_crown_foil', x: 20.9 },
  ],
  respawn: [{ item: 'item_ant_crumb', count: 2 }],
  skyTop: 0x2c1a12,
  skyBottom: 0x4a2e1f,
  ground: 0x8b5a3c,
  groundDark: 0x6b4430,
  dirt: 0x8b5a3c,
  dirtDark: 0x4a2e1f,
  unlockedByDefault: false,
  mood: 'depths',
  // Always under the ground: no sky, no wind, and rain only trickles down the shaft.
  roof: { x0: 0, x1: 25.6, y: DEPTHS_CEILING, top: -1 },
  solids: [
    { id: 'solid_depths_seal', box: [0, -30, SEAL, 12] },
    // The soil overhead, with the entrance shaft rising through it at x 3.2 to 4.8.
    { id: 'solid_depths_ceiling_west', box: [SEAL, -30, 3.2, DEPTHS_CEILING] },
    { id: 'solid_depths_shaft_top', box: [3.2, -30, 4.8, SHAFT_TOP] },
    { id: 'solid_depths_ceiling_east', box: [4.8, -30, 25.6, DEPTHS_CEILING] },
    // The top tunnel's floor (the nursery is up here), cut by the throne room.
    { id: 'solid_depths_top_west', box: [SEAL, DEPTHS_LEVELS.top, 16.5, 4.3] },
    { id: 'solid_depths_top_east', box: [21.5, DEPTHS_LEVELS.top, 25.6, 4.3] },
    // The middle tunnel's floor, cut by the pantry and the throne room.
    { id: 'solid_depths_middle_west', box: [SEAL, DEPTHS_LEVELS.middle, 5.6, 7] },
    { id: 'solid_depths_middle', box: [9.4, DEPTHS_LEVELS.middle, 16.5, 7] },
    { id: 'solid_depths_middle_east', box: [21.5, DEPTHS_LEVELS.middle, 25.6, 7] },
    // The pantry's heap of crumbs and seeds: things land on it and roll down.
    {
      id: 'solid_pantry_pile',
      chain: [
        [5.8, 9.12],
        [6.4, 8.85],
        [7, 8.47],
        [7.5, 8.32],
        [8, 8.47],
        [8.5, 8.8],
        [9, 9.1],
      ],
      friction: 0.9,
    },
    // The queen's thimble throne.
    { id: 'solid_ant_throne', box: [18.45, 8.15, 19.55, 9.2] },
    // The stuck root that closes the dead end (pulled free by `secret_root_pull`).
    { id: 'solid_root_knot', box: [23.3, 7, 23.9, 9.1] },
  ],
  fixtures: [
    // The way back up: the light at the top of the entrance shaft.
    { id: 'fix_depths_shaft', kind: 'depths_door', x: 4, y: 0.75, radius: 0.75, door: 'fix_ant_hill' },
    // The pantry's heap of crumbs and seeds, bottom level.
    { id: 'fix_ant_pantry', kind: 'ant_pantry', x: 7.4, y: 8.6, radius: 1.2, w: 3 },
    // The ant line on the middle level that passes small things left into the pantry.
    { id: 'fix_ant_conveyor', kind: 'ant_conveyor', x: 12.95, y: DEPTHS_LEVELS.middle, radius: 0.5, w: 7.1 },
    // Beetle larvae asleep in side pockets of the nursery: they wiggle when poked.
    { id: 'fix_larva_west', kind: 'larva', x: 11.1, y: 2.85, radius: 0.42 },
    { id: 'fix_larva_middle', kind: 'larva', x: 13, y: 1.75, radius: 0.42 },
    { id: 'fix_larva_east', kind: 'larva', x: 14.9, y: 2.85, radius: 0.42 },
    // The queen on her thimble throne, in her bottle-cap crown.
    { id: 'fix_ant_queen', kind: 'ant_queen', x: 19, y: 7.35, radius: 0.95 },
    // The root knot in the dead end, with something shiny behind it.
    { id: 'fix_root_knot', kind: 'root_knot', x: 23.6, y: 8, radius: 0.8 },
  ],
};

export const HOLLOW: AreaDef = {
  id: 'area_gnome_hollow',
  name: 'Gnome Hollow',
  xStart: 220.8,
  xEnd: 240,
  hidden: true,
  terrain: [
    [0, 9],
    [SEAL, 9],
    [19.2, 9],
  ],
  start: [
    // The fourth map scrap, kept on the top shelf of the lost-toy museum.
    { kind: 'item', defId: 'item_map_scrap_4', x: 5.9, y: 4.4 },
  ],
  respawn: [],
  skyTop: 0x1b2350,
  skyBottom: 0x2a3470,
  ground: 0xf4efe6,
  groundDark: 0xd9cfbf,
  dirt: 0xd9cfbf,
  dirtDark: 0xb8ab96,
  unlockedByDefault: false,
  mood: 'hollow',
  roof: { x0: 0, x1: 19.2, y: HOLLOW_CEILING, top: -1 },
  solids: [
    { id: 'solid_hollow_seal', box: [0, -30, SEAL, 12] },
    { id: 'solid_hollow_ceiling', box: [SEAL, -30, 19.2, HOLLOW_CEILING] },
    // The lost-toy museum's two shelves on the left wall.
    { id: 'solid_lost_shelf_top', box: [2.2, 4.4, 6.6, 4.56] },
    { id: 'solid_lost_shelf_low', box: [2.2, 6.1, 6.6, 6.26] },
    // The moon pedestal in the middle.
    { id: 'solid_moon_pedestal', box: [9.2, 7.45, 10, 9.1] },
    // The spiral stair's steps, up to the telescope in the hat.
    { id: 'solid_stair_1', box: [15.4, 7.7, 17.6, 7.86] },
    { id: 'solid_stair_2', box: [12.9, 6.4, 15.1, 6.56] },
    { id: 'solid_stair_3', box: [15.4, 5.1, 17.6, 5.26] },
    { id: 'solid_stair_4', box: [12.9, 3.8, 15.1, 3.96] },
    { id: 'solid_stair_top', box: [15.2, 2.7, 18.4, 2.86] },
  ],
  fixtures: [
    // The little round door at the bottom of the stair: back out through the hat.
    { id: 'fix_hollow_door', kind: 'hollow_door', x: 1.5, y: 8.05, radius: 0.85, door: 'fix_gnome_hat' },
    // Pictures of every toy the player has flung out of the world.
    { id: 'fix_lost_shelf', kind: 'lost_shelf', x: 4.4, y: 5.2, radius: 0.5, w: 4.4, h: 3.4 },
    // The moon pedestal: a cup that holds the golden marble.
    { id: 'fix_moon_pedestal', kind: 'moon_pedestal', x: 9.6, y: 7.3, radius: 0.6 },
    // The brass telescope at the top of the stair, poking out through the hat.
    { id: 'fix_gnome_telescope', kind: 'telescope', x: 16.8, y: 1.9, radius: 0.85 },
  ],
};

export const HIDDEN_AREAS: readonly AreaDef[] = [DEPTHS, HOLLOW];
