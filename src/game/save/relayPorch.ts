import type { Content } from '../data';
import { CONTENT } from '../data';
import type { WorldSave } from './schema';

const PORCH = 'area_under_porch';

/**
 * Give a world saved before the porch's junk was laid out in piles and
 * shelves (R02) the new layout, if nobody has been under the porch yet.
 *
 * While the porch is locked, everything past the lattice's wall is still
 * where the start list put it, so this takes out the items behind the wall
 * and the lattice panel itself, and marks the porch as not built.
 * `Sim.load` then lays the porch out afresh, lattice and all. A world with
 * the porch open keeps its porch as the player left it. Pure: returns a new
 * world and leaves the one given alone.
 */
export function relayPorch(world: WorldSave, content: Content = CONTENT): WorldSave {
  if (!world.built?.includes(PORCH)) return world;
  if (world.barriers?.open.includes(PORCH)) return world;
  const area = content.areas.get(PORCH);
  const lattice = (area.fixtures ?? []).find((f) => f.opens === PORCH);
  if (!lattice?.wall) return world;
  const wall = area.xStart + lattice.wall;
  const behind = (x: number): boolean => x >= wall && x < area.xEnd;
  const entities = world.entities.filter(
    (e) => !(e.kind === 'item' && (behind(e.body.x) || e.defId === 'item_lattice_panel')),
  );
  return { ...world, entities, built: world.built.filter((id) => id !== PORCH) };
}
