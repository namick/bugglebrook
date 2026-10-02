import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game/sim';
import { ITEMS, WRITTEN_ITEMS } from '../../src/game/data/items';
import {
  GROW,
  GROW_FULL,
  GROW_NONE,
  MIN_LOOSE,
  FLAT,
  MIN_THICK,
  bodyDensity,
  grownSpan,
  keepsSize,
  shapeArea,
  shapeSpan,
} from '../../src/game/data/itemSize';
import { LATCH_MAX, LATCH_MIN } from '../../src/game/systems/barriers';
import { PIXELS_PER_METER } from '../../src/game/constants';
import type { ItemDef } from '../../src/game/data/types';

const written = new Map(WRITTEN_ITEMS.map((d) => [d.id, d]));
const radius = (def: ItemDef): number => (def.shape.type === 'circle' ? def.shape.radius : NaN);

describe('loose item sizes (review R05)', () => {
  it('grows small things by half again, less as they get bigger, and none from GROW_NONE up', () => {
    expect(grownSpan(0.3)).toBeCloseTo(0.3 * GROW);
    expect(grownSpan(0.1)).toBe(MIN_LOOSE);
    expect(grownSpan(GROW_FULL)).toBeCloseTo(GROW_FULL * GROW);
    expect(grownSpan(GROW_NONE)).toBeCloseTo(GROW_NONE);
    expect(grownSpan(2)).toBe(2);
    let last = 0;
    for (let s = 0.05; s < 1.2; s += 0.01) {
      const g = grownSpan(s);
      expect(g).toBeGreaterThanOrEqual(last);
      expect(g).toBeGreaterThanOrEqual(Math.max(s, MIN_LOOSE));
      last = g;
    }
  });

  it('draws every loose thing at least 40 px long, and flat ones with a little height', () => {
    for (const def of ITEMS.all) {
      if (keepsSize(def)) continue;
      expect(shapeSpan(def.shape) * PIXELS_PER_METER, def.id).toBeGreaterThanOrEqual(
        MIN_LOOSE * PIXELS_PER_METER - 0.5,
      );
      if (def.shape.type === 'box')
        expect(Math.min(def.shape.width, def.shape.height), def.id).toBeGreaterThanOrEqual(
          (written.get(def.id) === def ? FLAT : MIN_THICK) - 1e-9,
        );
    }
  });

  it('grows seeds, petals, buttons, toothpicks, pollen, paperclips, crumbs, coins, and beads', () => {
    for (const id of [
      'item_seed_sunflower',
      'item_petal',
      'item_button',
      'item_toothpick',
      'item_pollen_puff',
      'item_paperclip',
      'item_crumb_cookie',
      'item_ant_crumb',
      'item_old_coin',
      'item_glass_bead',
    ]) {
      const before = shapeSpan(written.get(id)!.shape);
      const after = shapeSpan(ITEMS.get(id).shape);
      expect(after, id).toBeGreaterThanOrEqual(Math.min(before * 1.4, Math.max(before, MIN_LOOSE)) - 1e-9);
    }
  });

  it('keeps every grown thing exactly as heavy as it was written, and as floaty', () => {
    for (const def of ITEMS.all) {
      const before = written.get(def.id)!;
      expect(def.density, def.id).toBe(before.density);
      if (def === before) continue;
      const mass = before.mass ?? before.density * shapeArea(before.shape);
      expect(bodyDensity(def) * shapeArea(def.shape), def.id).toBeCloseTo(mass, 6);
    }
    // The body the physics builds weighs the same.
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', 70, 3);
    expect(sim.physics.mass(pebble.id)).toBeCloseTo(2.5 * Math.PI * 0.2 * 0.2, 4);
  });

  it('leaves alone things whose size is a rule: toys, track pieces, the lattice, dominoes, big props', () => {
    for (const id of [
      'item_popsicle_seesaw',
      'item_marble_track_straight',
      'item_marble_funnel',
      'item_lattice_panel',
      'item_domino',
      'item_ruler_ramp',
      'item_leaf_raft',
    ])
      expect(ITEMS.get(id).shape, id).toEqual(written.get(id)!.shape);
  });

  it('keeps the can tunnel rule: a marble is too small, the rubber ball fits', () => {
    for (const id of ['item_marble_blue', 'item_marble_red', 'item_marble_green'])
      expect(radius(ITEMS.get(id)) * 2, id).toBeLessThan(LATCH_MIN);
    const ball = radius(ITEMS.get('item_rubber_ball')) * 2;
    expect(ball).toBeGreaterThanOrEqual(LATCH_MIN);
    expect(ball).toBeLessThanOrEqual(LATCH_MAX);
  });

  it('keeps marbles, pebbles, and the rubber ball small enough for Rollo and Barty to roll', () => {
    for (const id of ['item_marble_blue', 'item_pebble', 'item_rubber_ball', 'item_berry_red']) {
      const r = radius(ITEMS.get(id));
      expect(r, id).toBeGreaterThanOrEqual(0.12);
      expect(r, id).toBeLessThanOrEqual(0.36);
    }
  });
});

describe('the grab pad', () => {
  // The porch is being laid out again elsewhere, so it is left out here.
  const SKIP = new Set(['area_under_porch']);

  it('a click at the middle of every start item grabs that item', () => {
    const sim = Sim.create({ seed: 'grab-pad' });
    for (const a of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
      sim.send({ type: 'unlock', area: a });
    sim.run(90);
    const missed: string[] = [];
    let checked = 0;
    for (const e of sim.entities.ofKind('item')) {
      const v = sim.view(e.id);
      if (!v || v.pocket !== undefined || v.inMouthOf !== undefined || v.carriedBy !== undefined) continue;
      if (SKIP.has(sim.areaOf(v.x).id)) continue;
      checked++;
      const hit = sim.physics.bodyAt(v.x, v.y, 0.2);
      if (hit !== e.id) missed.push(`${e.defId} in ${sim.areaOf(v.x).id} (got ${hit})`);
    }
    expect(checked).toBeGreaterThan(80);
    expect(missed).toEqual([]);
  });
});
