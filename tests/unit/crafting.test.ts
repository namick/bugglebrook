import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim, loadSaveFile, SAVE_VERSION } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { ITEMS } from '../../src/game/data/items';
import { RECIPES } from '../../src/game/data/recipes';
import type { RecipeInput } from '../../src/game/data/types';
import { BENCH_SHAKE, TRAY_OFFSETS } from '../../src/game/systems/bench';
import type { Ingredient } from '../../src/game/systems/crafting';
import {
  blobKind,
  defaultParts,
  fills,
  matchRecipe,
  nearMiss,
  recipeFor,
  tagNudge,
} from '../../src/game/systems/crafting';
import { PLAZA_X } from './world';

// M8 (game design doc, section 8): the Tinker Bench.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

/** A concrete item for a recipe input. */
function concrete(input: RecipeInput): string {
  if (typeof input === 'string') return input;
  if ('anyOf' in input) return input.anyOf[0]!;
  return 'item_moon_pebble';
}

/** An ingredient as the bench sees it: the item and its tags (def and material). */
function ing(defId: string): Ingredient {
  const def = ITEMS.get(defId);
  const material: Record<string, readonly string[]> = {
    mat_metal: ['tag_magnetic', 'tag_heavy'],
    mat_rubber: ['tag_bouncy'],
    mat_glass: ['tag_fragile'],
    mat_food: ['tag_edible'],
    mat_jelly: ['tag_sticky'],
  };
  return { defId, tags: [...def.tags, ...(material[def.material] ?? [])] };
}

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** An empty world with the porch open: just the bench and what a test puts on it. */
function benchWorld(seed = 'bench'): Sim {
  const sim = Sim.empty({ seed });
  sim.send({ type: 'unlock', area: 'area_under_porch' });
  sim.step();
  return sim;
}

function benchAt(sim: Sim): { x: number; y: number } {
  const b = sim.places.fixtures('tinker_bench')[0]!;
  return { x: b.x, y: b.fixture.y };
}

/** Put these things in the trays, in order. */
function fill(sim: Sim, defIds: readonly string[]): number[] {
  const at = benchAt(sim);
  return defIds.map((defId, i) => {
    const e = sim.spawn('item', defId, at.x + TRAY_OFFSETS[i]!, at.y - 1.2);
    sim.bench.place(e.id, i);
    return e.id;
  });
}

function pull(sim: Sim): void {
  sim.send({ type: 'pull_lever' });
  sim.run(BENCH_SHAKE + 2);
}

const items = (sim: Sim): Entity[] => sim.entities.ofKind('item');

describe('recipes (pure)', () => {
  it('has the 32 recipes from the design doc and the yarn scarf, each making something different', () => {
    expect(RECIPES.all).toHaveLength(33);
    expect(new Set(RECIPES.all.map((r) => r.output)).size).toBe(33);
  });

  it.each(RECIPES.all.map((r) => [r.id, r] as const))('%s makes its output in every order', (_, recipe) => {
    const parts = recipe.inputs.map(concrete);
    for (const order of permutations(parts)) {
      const got = matchRecipe(RECIPES.all, order.map(ing));
      expect(got?.id, order.join(' + ')).toBe(recipe.id);
    }
  });

  it('takes any balloon, any paint, and anything glowing where the recipe says so', () => {
    expect(matchRecipe(RECIPES.all, ['item_balloon_blue', 'item_string', 'item_matchbox'].map(ing))?.id).toBe(
      'recipe_balloon_basket',
    );
    for (const paint of ['item_paint_red', 'item_paint_yellow', 'item_paint_white'])
      expect(matchRecipe(RECIPES.all, [paint, 'item_moon_pebble'].map(ing))?.id).toBe('recipe_glow_paint');
    // A glowing headlamp needs its bead and band, plus anything glowing: glow paint will do.
    expect(
      matchRecipe(RECIPES.all, ['item_paint_glow', 'item_rubber_band', 'item_glass_bead'].map(ing))?.id,
    ).toBe('recipe_headlamp');
  });

  it('knows a match only with exactly the right number of things', () => {
    expect(fills(['item_twig', 'item_rubber_band'], ['item_twig'].map(ing))).toBe(false);
    expect(matchRecipe(RECIPES.all, ['item_twig', 'item_rubber_band', 'item_pebble'].map(ing))).toBeNull();
    expect(matchRecipe(RECIPES.all, ['item_pebble', 'item_cork'].map(ing))).toBeNull();
  });

  it('gives a near miss for two thirds of the first unmade three-thing recipe', () => {
    const miss = nearMiss(RECIPES.all, ['item_button', 'item_matchbox'].map(ing), []);
    expect(miss?.recipe.id).toBe('recipe_matchbox_racer');
    expect(miss?.missing).toBe('item_button');
    // Once the racer is made, the same two point at the next one that fits (googly glasses need a clip).
    expect(
      nearMiss(RECIPES.all, ['item_button', 'item_matchbox'].map(ing), ['recipe_matchbox_racer']),
    ).toBeNull();
    expect(
      nearMiss(RECIPES.all, ['item_button', 'item_button'].map(ing), ['recipe_matchbox_racer'])?.recipe.id,
    ).toBe('recipe_googly_glasses');
    expect(nearMiss(RECIPES.all, ['item_twig', 'item_rubber_band'].map(ing), [])).toBeNull();
  });

  it('nudges with a tag when glowing things go in without the rest of their recipe', () => {
    const nudge = tagNudge(RECIPES.all, ['item_moon_pebble', 'item_pebble'].map(ing));
    expect(nudge?.tag).toBe('tag_glowing');
    expect(tagNudge(RECIPES.all, ['item_pebble', 'item_cork'].map(ing))).toBeNull();
  });

  it('picks a failed combo by the inputs’ tags: sticky, smelly, bouncy, food, or plain', () => {
    expect(blobKind(['item_gum_blob', 'item_pebble'].map(ing))).toBe('sticky');
    expect(blobKind(['item_onion_ring', 'item_pebble'].map(ing))).toBe('smelly');
    expect(blobKind(['item_rubber_ball', 'item_pebble'].map(ing))).toBe('bouncy');
    expect(blobKind(['item_berry_red', 'item_pebble'].map(ing))).toBe('food');
    expect(blobKind(['item_cork', 'item_pebble'].map(ing))).toBe('plain');
  });

  it('knows what every crafted thing breaks back into', () => {
    for (const r of RECIPES.all) {
      expect(recipeFor(RECIPES.all, r.output)?.id).toBe(r.id);
      const parts = defaultParts(r, ITEMS);
      expect(matchRecipe(RECIPES.all, parts.map(ing))?.id, r.id).toBe(r.id);
    }
  });
});

describe('the Tinker Bench', () => {
  it.each(RECIPES.all.map((r) => [r.id, r] as const))(
    '%s crafts at the bench in every order',
    (_, recipe) => {
      for (const order of permutations(recipe.inputs.map(concrete))) {
        const sim = benchWorld(`craft-${recipe.id}`);
        const log = record(sim);
        fill(sim, order);
        pull(sim);
        const made = named(log, 'crafted');
        expect(made, order.join(' + ')).toHaveLength(1);
        expect(made[0]!.defId).toBe(recipe.output);
        expect(made[0]!.first).toBe(true);
        expect(items(sim).map((e) => e.defId)).toEqual([recipe.output]);
        expect(sim.bench.state.made).toEqual([recipe.id]);
      }
    },
  );

  it('shakes for 1.2 s before the result pops out onto the table, and bugs nearby help', () => {
    const sim = Sim.create({ seed: 'help' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.step();
    const at = benchAt(sim);
    const dot = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_ladybug_dot')!;
    sim.physics.place(dot.id, at.x - 1, GROUND_Y - 0.6, 0);
    const log = record(sim);
    fill(sim, ['item_twig', 'item_rubber_band']);
    sim.send({ type: 'pull_lever' });
    sim.step();
    expect(named(log, 'bench_pulled')[0]!.helpers).toContain(dot.id);
    sim.run(BENCH_SHAKE - 4);
    expect(named(log, 'crafted')).toHaveLength(0);
    sim.run(80);
    const out = sim.entities.get(named(log, 'crafted')[0]!.id as number)!;
    const v = sim.view(out.id)!;
    expect(Math.abs(v.x - at.x)).toBeLessThan(2.3);
    // It lands on the table top, not the floor.
    expect(v.y).toBeLessThan(at.y);
  });

  it('pops loudly enough that idle bugs nearby turn to gawk at the new thing (R09)', () => {
    const sim = benchWorld('gawk');
    const at = benchAt(sim);
    const near = sim.spawn('bug', 'bug_ladybug_dot', at.x + 6, GROUND_Y - 0.6);
    const far = sim.spawn('bug', 'bug_snail_glorp', at.x - 11, GROUND_Y - 0.8);
    for (const bug of [near, far])
      for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
        sim.send({ type: 'set_need', id: bug.id, need, value: 100 });
    sim.run(30);
    for (const bug of [near, far]) {
      bug.bug!.mode = 'st_idle';
      bug.bug!.decideIn = 600;
    }
    const log = record(sim);
    fill(sim, ['item_twig', 'item_rubber_band']);
    sim.send({ type: 'pull_lever' });
    sim.run(BENCH_SHAKE - 2);
    expect(named(log, 'bug_gawked')).toHaveLength(0);
    sim.run(6);
    expect(named(log, 'crafted')).toHaveLength(1);
    const lookers = named(log, 'bug_gawked').map((e) => e.id);
    expect(lookers).toContain(near.id);
    expect(lookers).not.toContain(far.id);
  });

  it('pulls a crafted thing back into its parts, into the trays, and they craft again', () => {
    const sim = benchWorld();
    const log = record(sim);
    fill(sim, ['item_paper_scrap', 'item_straw', 'item_fizz_candy']);
    pull(sim);
    const rocket = items(sim)[0]!;
    expect(rocket.defId).toBe('item_straw_rocket');
    expect(rocket.parts).toHaveLength(3);
    sim.bench.place(rocket.id, 1);
    pull(sim);
    const parts = items(sim)
      .map((e) => e.defId)
      .sort();
    expect(parts).toEqual(['item_fizz_candy', 'item_paper_scrap', 'item_straw']);
    expect(named(log, 'uncrafted')).toHaveLength(1);
    expect(sim.bench.state.trays.filter((t) => t !== null)).toHaveLength(3);
    pull(sim);
    expect(items(sim).map((e) => e.defId)).toEqual(['item_straw_rocket']);
    // Second time round it is not a first.
    expect(named(log, 'crafted').map((e) => e.first)).toEqual([true, false]);
  });

  it('pulls apart crafted things that never went through the bench (the leaf raft)', () => {
    const sim = benchWorld();
    fill(sim, ['item_leaf_raft']);
    pull(sim);
    expect(
      items(sim)
        .map((e) => e.defId)
        .sort(),
    ).toEqual(['item_leaf', 'item_popsicle_stick']);
  });

  it('keeps what parts were like: paint and tags come back out', () => {
    const sim = benchWorld();
    const [scrap] = fill(sim, ['item_paper_scrap', 'item_straw']);
    sim.entities.get(scrap!)!.paint = ['paint_blue'];
    pull(sim);
    const boat = items(sim)[0]!;
    sim.bench.place(boat.id, 0);
    pull(sim);
    const back = items(sim).find((e) => e.defId === 'item_paper_scrap')!;
    expect(back.paint).toEqual(['paint_blue']);
  });

  it('one plain thing alone hops back off the tray', () => {
    const sim = benchWorld();
    const log = record(sim);
    const [pebble] = fill(sim, ['item_pebble']);
    pull(sim);
    expect(named(log, 'bench_shrugged')).toHaveLength(1);
    expect(sim.entities.has(pebble!)).toBe(true);
    expect(sim.bench.state.trays).toEqual([null, null, null]);
  });

  it('pulling with empty trays only clunks', () => {
    const sim = benchWorld();
    const log = record(sim);
    pull(sim);
    expect(named(log, 'bench_pulled')[0]!.empty).toBe(true);
    expect(sim.bench.busy).toBe(false);
  });

  it('flickers the missing thing for a near miss once, when the second thing goes in', () => {
    const sim = benchWorld();
    const log = record(sim);
    fill(sim, ['item_matchbox', 'item_button']);
    sim.step();
    const hints = named(log, 'bench_hinted');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ recipe: 'recipe_matchbox_racer', missing: 'item_button', tray: 2 });
  });

  it('holds things in the trays while it shakes', () => {
    const sim = benchWorld();
    const [twig] = fill(sim, ['item_twig', 'item_rubber_band']);
    sim.send({ type: 'pull_lever' });
    sim.step();
    const v = sim.view(twig!)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sim.physics.grabbed).toBeNull();
  });

  it('a drop near an empty tray goes in it; a bug dropped there hops out with a look', () => {
    const sim = Sim.create({ seed: 'drop' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.step();
    const at = benchAt(sim);
    const log = record(sim);
    const cork = sim.spawn('item', 'item_cork', at.x + TRAY_OFFSETS[2]!, at.y - 0.4);
    sim.send({ type: 'grab', x: at.x + TRAY_OFFSETS[2]!, y: at.y - 0.4 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.bench.state.trays[2]).toBe(cork.id);
    const dot = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_ladybug_dot')!;
    sim.physics.place(dot.id, at.x, at.y - 0.6, 0);
    sim.send({ type: 'grab', x: at.x, y: at.y - 0.6 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(named(log, 'bench_refused')).toHaveLength(1);
  });

  it('pins a blueprint card when its scroll is picked up', () => {
    const sim = benchWorld();
    const log = record(sim);
    const scroll = sim.spawn('item', 'item_blueprint_slingshot', PLAZA_X + 5, GROUND_Y - 0.3);
    sim.run(30);
    const v = sim.view(scroll.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(sim.bench.state.hinted).toEqual(['recipe_slingshot']);
    expect(named(log, 'blueprint_found')).toHaveLength(1);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    expect(named(log, 'blueprint_found')).toHaveLength(1);
  });

  it('a bored bug by the bench wishes for something not made yet', () => {
    const sim = Sim.create({ seed: 'wish' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.step();
    const at = benchAt(sim);
    const log = record(sim);
    const dot = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_ladybug_dot')!;
    sim.bench.state.made = RECIPES.all.slice(1).map((r) => r.id);
    for (let i = 0; i < 40 && named(log, 'bug_wished').length === 0; i++) {
      sim.physics.place(dot.id, at.x - 1.5, GROUND_Y - 0.6, 0);
      dot.bug!.mode = 'st_idle';
      dot.bug!.timer = 600;
      // Bored, with nothing new nearby to go and look at (the porch's junk is all round the bench).
      dot.bug!.inspected = sim.entities.ofKind('item').map((e) => e.id);
      sim.send({ type: 'set_need', id: dot.id, need: 'need_fun', value: 20 });
      sim.run(120);
    }
    const wish = named(log, 'bug_wished').find((w) => w.id === dot.id);
    expect(wish).toMatchObject({ recipe: RECIPES.all[0]!.id, output: RECIPES.all[0]!.output });
  });
});

describe('failed combos (M8 acceptance)', () => {
  const combos: readonly [string, readonly string[], string][] = [
    ['sticky', ['item_gum_blob', 'item_pebble'], 'tag_sticky'],
    // Smelly food is eaten; a sponge that soaked up a stink is not.
    ['smelly', ['item_sponge', 'item_button'], 'tag_smelly'],
    ['bouncy', ['item_rubber_ball', 'item_cork'], 'tag_bouncy'],
    ['plain', ['item_cork', 'item_pebble', 'item_button'], ''],
  ];

  it.each(combos)('a %s combo makes a junk blob that splits back into its parts', (kind, inputs, tag) => {
    const sim = benchWorld(`blob-${kind}`);
    const log = record(sim);
    const ids = fill(sim, inputs);
    if (kind === 'smelly') sim.addTag(ids[0]!, 'tag_smelly', 'debug', null);
    const before = items(sim).length;
    pull(sim);
    const failed = named(log, 'bench_failed')[0]!;
    expect(failed.kind).toBe(kind);
    const blob = sim.entities.get(failed.blobId as number)!;
    expect(blob.defId).toBe('item_junk_blob');
    expect(blob.parts!.map((p) => p.defId).sort()).toEqual([...inputs].sort());
    if (tag) expect(sim.hasTag(blob.id, tag)).toBe(true);
    expect(sim.secrets).toContain('secret_first_blob');
    // Shaken in the hand, it splits back into exactly what went in.
    sim.run(60);
    const v = sim.view(blob.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    sim.send({ type: 'shake' });
    sim.step();
    expect(sim.entities.has(blob.id)).toBe(false);
    expect(
      items(sim)
        .map((e) => e.defId)
        .sort(),
    ).toEqual([...inputs].sort());
    expect(items(sim)).toHaveLength(before);
  });

  it('eats food on a failed pull and burps a blob with a bite mark', () => {
    const sim = benchWorld();
    const log = record(sim);
    fill(sim, ['item_berry_red', 'item_pebble']);
    pull(sim);
    const failed = named(log, 'bench_failed')[0]!;
    expect(failed.kind).toBe('food');
    expect(failed.ate).toEqual(['item_berry_red']);
    const blob = sim.entities.get(failed.blobId as number)!;
    expect(blob.bites).toBe(1);
    expect(blob.parts!.map((p) => p.defId)).toEqual(['item_pebble']);
  });

  it('every non-recipe pair or triple keeps the item count, food excepted (seeded sweep)', () => {
    const pool = [
      'item_pebble',
      'item_cork',
      'item_button',
      'item_twig',
      'item_leaf',
      'item_gum_blob',
      'item_onion_ring',
      'item_rubber_ball',
      'item_berry_red',
      'item_tin_can',
      'item_feather',
      'item_bottle_cap',
      'item_moon_pebble',
      'item_string',
    ];
    let seed = 7;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    let tried = 0;
    for (let t = 0; t < 30; t++) {
      const n = 2 + rand(2);
      const set = Array.from({ length: n }, () => pool[rand(pool.length)]!);
      if (matchRecipe(RECIPES.all, set.map(ing))) continue;
      tried++;
      const sim = benchWorld(`sweep-${t}`);
      fill(sim, set);
      const food = set.filter(
        (id) => ITEMS.get(id).tags.includes('tag_edible') || ITEMS.get(id).material === 'mat_food',
      );
      pull(sim);
      const blob = items(sim).find((e) => e.defId === 'item_junk_blob');
      if (blob) sim.bench.split(blob);
      expect(items(sim).length, set.join(' + ')).toBe(set.length - food.length);
    }
    expect(tried).toBeGreaterThan(15);
  });

  it('a poked blob squeaks', () => {
    const sim = benchWorld();
    const log = record(sim);
    fill(sim, ['item_cork', 'item_pebble']);
    pull(sim);
    sim.run(90);
    const blob = items(sim).find((e) => e.defId === 'item_junk_blob')!;
    const v = sim.view(blob.id)!;
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.step();
    expect(named(log, 'blob_squeaked')).toHaveLength(1);
  });
});

describe('bench saves', () => {
  it('keeps the trays, recipes made, hints, and crafted parts through a save', () => {
    const sim = benchWorld();
    fill(sim, ['item_twig', 'item_rubber_band']);
    pull(sim);
    const sling = items(sim)[0]!;
    sim.bench.state.hinted.push('recipe_disco_ball');
    const [cork] = fill(sim, ['item_cork']);
    const text = JSON.stringify({
      version: SAVE_VERSION,
      savedAt: 'x',
      world: sim.serialize(),
      view: { cameraX: 0 },
      meta: { createdAt: 'x', thumb: null },
    });
    const loaded = Sim.load(loadSaveFile(text).world);
    expect(loaded.bench.state.made).toEqual(['recipe_slingshot']);
    expect(loaded.bench.state.hinted).toEqual(['recipe_disco_ball']);
    expect(loaded.bench.state.trays[0]).toBe(cork);
    expect(loaded.physics.isPinned(cork!)).toBe(true);
    expect(loaded.entities.get(sling.id)!.parts!.map((p) => p.defId)).toEqual([
      'item_twig',
      'item_rubber_band',
    ]);
  });
});
