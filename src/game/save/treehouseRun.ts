import { AREAS } from '../data/areas';
import type { SaveFile, SavedEntity } from './schema';

/**
 * The pegboard's starting run (review R16), for saves made before it. New
 * worlds pin four track pieces on the treehouse pegboard: three straights
 * stepping down to the right and a curve that flicks the marble off toward
 * the bead pit. Saves written earlier have only the top straight and the
 * curve, which sat where a marble missed it.
 *
 * Pure: it returns a new save and leaves the one passed in alone. It changes
 * nothing unless the treehouse was built in that save and both old pieces
 * still hang where they started (a player who moved them has made their own
 * track, and that stays as it is). Run it on load, after the migrations.
 * Running it again changes nothing.
 */

const TREEHOUSE_X = AREAS.get('area_treehouse_arcade').xStart;
const STRAIGHT = 'item_marble_track_straight';
const CURVE = 'item_marble_track_curve';
/** The old pieces, in world meters. */
const TOP = { x: TREEHOUSE_X + 6.4, y: 2.9 };
const OLD_CURVE = { x: TREEHOUSE_X + 8, y: 4.4 };
/** Where the curve goes now, and the two new straights between. */
const NEW_CURVE = { x: TREEHOUSE_X + 11.6, y: 5.6, angle: 0.3 };
const MIDDLE = [
  { x: TREEHOUSE_X + 7.8, y: 3.9, angle: 0.4 },
  { x: TREEHOUSE_X + 9.4, y: 4.6, angle: 0.4 },
];

const at = (e: SavedEntity, x: number, y: number): boolean =>
  Math.abs(e.body.x - x) < 0.05 && Math.abs(e.body.y - y) < 0.05;

export function addTreehouseRun(save: SaveFile): SaveFile {
  const world = save.world;
  if (!world.built?.includes('area_treehouse_arcade')) return save;
  const pinned = world.entities.filter((e) => e.kind === 'item' && e.pinned);
  const top = pinned.some((e) => e.defId === STRAIGHT && at(e, TOP.x, TOP.y));
  const curve = pinned.find((e) => e.defId === CURVE && at(e, OLD_CURVE.x, OLD_CURVE.y));
  if (!top || !curve) return save;
  const still = { vx: 0, vy: 0, av: 0 };
  const entities = world.entities.map((e) =>
    e === curve
      ? { ...e, body: { ...e.body, ...still, x: NEW_CURVE.x, y: NEW_CURVE.y, angle: NEW_CURVE.angle } }
      : e,
  );
  let id = world.nextId;
  for (const p of MIDDLE)
    entities.push({
      id: id++,
      kind: 'item',
      defId: STRAIGHT,
      body: { x: p.x, y: p.y, angle: p.angle, ...still },
      pinned: true,
    });
  return { ...save, world: { ...world, nextId: id, entities } };
}
