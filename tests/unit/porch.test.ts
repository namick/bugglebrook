import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Sim, loadSaveFile } from '../../src/game';
import type { WorldSave } from '../../src/game';
import { relayPorch } from '../../src/game/save/relayPorch';
import type { Content } from '../../src/game/data';
import { CONTENT } from '../../src/game/data';
import { PORCH_LID } from '../../src/game/data/areas';
import { createRegistry } from '../../src/game/data/registry';
import type { ItemDef, StartEntity } from '../../src/game/data/types';
import { MAGNET_RANGE } from '../../src/game/systems/environment';
import { leanAgainst, stackTop } from '../../src/game/world/startLayout';

// R02: the porch's junk lies in piles, on shelves, and in a jar lid, not in one even row.

const PORCH = CONTENT.areas.get('area_under_porch');
const JUNK = PORCH.start.filter((s) => s.kind === 'item' && s.defId !== 'item_lattice_panel');
const onShelf = (s: StartEntity): boolean => s.y !== undefined;
/** Stacked, leaning, or something the next thing leans on. */
const inPile = (s: StartEntity): boolean =>
  !!s.stack || s.lean !== undefined || JUNK[JUNK.indexOf(s) + 1]?.lean !== undefined;
const inLid = (s: StartEntity): boolean => s.x > PORCH_LID.x0 && s.x < PORCH_LID.x1;

/** The same game with every porch item this much bigger (the item size pass may scale them). */
function scaled(k: number): Content {
  const ids = new Set(JUNK.map((s) => s.defId));
  const items = CONTENT.items.all.map((d): ItemDef => {
    if (!ids.has(d.id)) return d;
    const shape =
      d.shape.type === 'circle'
        ? { ...d.shape, radius: d.shape.radius * k }
        : { ...d.shape, width: d.shape.width * k, height: d.shape.height * k };
    return { ...d, shape };
  });
  return { ...CONTENT, items: createRegistry('item', items) };
}

/** Only the porch, open, with its start list laid out; returns the entity for each start entry. */
function porch(content: Content = CONTENT): { sim: Sim; ids: number[] } {
  const sim = Sim.empty({ seed: 'porch', content });
  sim.populate([content.areas.get('area_under_porch')]);
  sim.send({ type: 'unlock', area: 'area_under_porch' });
  const items = sim.entities.ofKind('item').map((e) => e.id);
  return { sim, ids: items.slice(1) };
}

describe('the porch layout (R02)', () => {
  it('keeps the floor to 15 to 20 loose things and puts the rest in piles, on shelves, and in the lid', () => {
    const floor = JUNK.filter((s) => !onShelf(s) && !inPile(s) && !inLid(s));
    expect(floor.length).toBeGreaterThanOrEqual(15);
    expect(floor.length).toBeLessThanOrEqual(20);
    expect(JUNK.filter(inPile).length).toBeGreaterThanOrEqual(4);
    expect(JUNK.filter(onShelf).length).toBeGreaterThanOrEqual(4);
    expect(JUNK.filter(inLid).map((s) => s.defId)).toEqual(['item_button', 'item_button', 'item_button']);
    // Loose things on the floor lie at least 0.6 m apart.
    const xs = floor.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]! - xs[i - 1]!, `near ${xs[i]}`).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });

  it('has everything the bench needs for each porch recipe', () => {
    const count = (id: string): number => JUNK.filter((s) => s.defId === id).length;
    // Two buttons for the racer and the glasses, two caps for the skates, two cans for the phone,
    // two toothpicks for the beanie.
    for (const id of ['item_button', 'item_bottle_cap', 'item_tin_can', 'item_toothpick'])
      expect(count(id), id).toBeGreaterThanOrEqual(2);
    for (const id of [
      'item_rubber_band',
      'item_popsicle_stick',
      'item_matchbox',
      'item_paper_scrap',
      'item_straw',
      'item_tissue',
      'item_string',
      'item_paperclip',
      'item_comb_tooth',
      'item_foil_ball',
      'item_magnet',
      'item_thread_spool',
      'item_hat_thimble',
    ])
      expect(count(id), id).toBeGreaterThanOrEqual(1);
    // As many as the porch tops itself back up to.
    for (const r of PORCH.respawn) expect(count(r.item), r.item).toBeGreaterThanOrEqual(r.count);
  });

  it('keeps the magnet out of reach of anything it would pull', () => {
    const { sim, ids } = porch();
    sim.run(30);
    const magnets = ids.filter((id) => sim.content.items.get(sim.entities.get(id)!.defId).magnet);
    expect(magnets.length).toBeGreaterThan(0);
    for (const m of magnets) {
      const a = sim.view(m)!;
      for (const id of ids) {
        if (id === m || !sim.hasTag(id, 'tag_magnetic')) continue;
        const b = sim.view(id)!;
        expect(Math.hypot(a.x - b.x, a.y - b.y), b.defId).toBeGreaterThan(MAGNET_RANGE + 0.3);
      }
    }
  });

  for (const [label, k] of [
    ['at today’s sizes', 1],
    ['with every item half as big again', 1.5],
  ] as const)
    it(`settles where it was put, and a click on each thing's middle picks up that thing, ${label}`, () => {
      const { sim, ids } = porch(k === 1 ? CONTENT : scaled(k));
      const start = new Map(ids.map((id) => [id, sim.view(id)!]));
      sim.run(300);
      expect(sim.rescues).toBe(0);
      JUNK.forEach((s, i) => {
        const id = ids[i]!;
        const v = sim.view(id)!;
        const was = start.get(id)!;
        expect(v.defId).toBe(s.defId);
        // Nothing slid off, rolled away, or fell off a shelf.
        expect(Math.abs(v.x - was.x), `${s.defId} at ${s.x} moved`).toBeLessThan(0.35);
        expect(Math.abs(v.y - was.y), `${s.defId} at ${s.x} fell`).toBeLessThan(0.3);
        // The grab audit: the hand at its middle picks up this thing and no neighbor.
        expect(sim.physics.bodyAt(v.x, v.y, 0.2), `${s.defId} at ${s.x}`).toBe(id);
      });
      // Leaners still lean.
      JUNK.forEach((s, i) => {
        if (s.lean) expect(Math.abs(sim.view(ids[i]!)!.angle), s.defId).toBeGreaterThan(0.3);
      });
    });
});

describe('piling start things (pure)', () => {
  it('stacks on the highest thing under it', () => {
    const placed = [
      { x0: 0, x1: 1, top: 8 },
      { x0: 1.2, x1: 2, top: 7.5 },
    ];
    expect(stackTop(placed, 1.1, 0.2)).toBe(7.5);
    expect(stackTop(placed, 0.5, 0.2)).toBe(8);
    expect(stackTop(placed, 3, 0.2)).toBeNull();
  });

  it('leans a stick on the corner of the thing before it, foot on the ground', () => {
    const can = { x0: 10, x1: 10.5, top: 8.4 };
    const stick = { type: 'box' as const, width: 1.1, height: 0.1 };
    const right = leanAgainst(can, stick, 1, 9);
    expect(right.x).toBeLessThan(10);
    expect(right.angle).toBeLessThan(0);
    const left = leanAgainst(can, stick, -1, 9);
    expect(left.x).toBeGreaterThan(10.5);
    expect(left.angle).toBeCloseTo(-right.angle);
    // The same pile at a bigger size leans at the same angle.
    const big = leanAgainst(
      { x0: 10, x1: 10.75, top: 8.1 },
      { type: 'box', width: 1.65, height: 0.15 },
      1,
      9,
    );
    expect(big.angle).toBeCloseTo(right.angle);
  });
});

describe("relaying an old save's porch (R02)", () => {
  const wall = PORCH.xStart + PORCH.fixtures!.find((f) => f.kind === 'lattice')!.wall!;
  const old = (): WorldSave =>
    loadSaveFile(readFileSync(join(import.meta.dirname, 'fixtures', 'save-v9.json'), 'utf8')).world;
  const sorted = (xs: string[]): string[] => [...xs].sort();
  const porchItems = (sim: Sim): string[] =>
    sim.entities
      .ofKind('item')
      .filter((e) => {
        const x = sim.physics.getState(e.id).x;
        return x >= wall && x < PORCH.xEnd;
      })
      .map((e) => e.defId);

  it('lays a still-locked porch out afresh, lattice and all, and leaves the rest of the world alone', () => {
    const world = old();
    // The fixture has the porch open; pretend nobody has pulled the lattice yet.
    world.barriers!.open = world.barriers!.open.filter((id) => id !== 'area_under_porch');
    const before = Sim.load(structuredClone(world));
    const elsewhere = (sim: Sim): number =>
      sim.entities.ofKind('item').filter((e) => {
        const x = sim.physics.getState(e.id).x;
        return (x < wall || x >= PORCH.xEnd) && e.defId !== 'item_lattice_panel';
      }).length;
    const copy = structuredClone(world);
    const relaid = relayPorch(world);
    expect(world).toEqual(copy);
    expect(relaid.built).not.toContain('area_under_porch');
    const sim = Sim.load(relaid);
    expect(sorted(porchItems(sim))).toEqual(sorted(JUNK.map((s) => s.defId)));
    expect(sim.entities.ofKind('item').filter((e) => e.defId === 'item_lattice_panel')).toHaveLength(1);
    expect(sim.built).toContain('area_under_porch');
    expect(elsewhere(sim)).toBe(elsewhere(before));
    expect(sim.entities.ofKind('bug').length).toBe(before.entities.ofKind('bug').length);
    // And it still saves and loads.
    expect(() => Sim.load(sim.serialize())).not.toThrow();
  });

  it('leaves an opened porch as the player left it', () => {
    const world = old();
    expect(relayPorch(world)).toBe(world);
  });
});
