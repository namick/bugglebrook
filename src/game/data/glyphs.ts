/**
 * The journal's hint pictograms (game design doc, sections 12 and 13). A
 * hint says where or when, never how. Hints may also name content (an
 * `item_*`, `bug_*`, or `area_*` ID), which the journal draws as that
 * thing's own picture. `validateContent` checks every hint against this list,
 * and a renderer test checks that each glyph has a drawing.
 */
export const GLYPHS = [
  // When.
  'moon',
  'sun',
  'cloud',
  'rainbow',
  'snow',
  // Senses and gestures.
  'eye',
  'knock',
  'blinks',
  'feet',
  'arcs',
  'flip',
  'stack',
  // Music.
  'note',
  'notes3',
  'grid',
  // Things in the world.
  'dial',
  'worm',
  'boot',
  'coins',
  'frog',
  'firefly',
  'drop',
  'drops3',
  'drops5',
  'stage',
  'moth',
  'light',
  'lights3',
  'bulb',
  'bee',
  'cricket',
  'leaf_bitten',
  'cocoon',
  'pot_eyes',
  'gap',
  'spider',
  'tunnel',
  'bottle',
  'fly',
  'beetle_back',
  'hat',
  'hats',
  'chubby',
  'spring_big',
  'claw',
  'prize3',
  'slide',
  'window',
  'crown',
  'root',
  'ants',
  'map',
  'gnome',
  'stars',
  'x_mark',
  'pedestal',
  'rocket_bug',
  'bridge',
  'ghost',
  'mushrooms3',
  'squeak',
  'blueprint',
] as const;

export type Glyph = (typeof GLYPHS)[number];

const SET = new Set<string>(GLYPHS);

/** Is `name` a glyph (rather than a content ID)? */
export function isGlyph(name: string): name is Glyph {
  return SET.has(name);
}
