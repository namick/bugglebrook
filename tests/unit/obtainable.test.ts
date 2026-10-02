import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { CONTENT } from '../../src/game/data';
import { HEAD_TURNS } from '../../src/game/data/items11';
import type { ItemDef, RecipeInput } from '../../src/game/data/types';
import { brew, essenceOf } from '../../src/game/systems/brewing';
import type { EssenceDrop } from '../../src/game/systems/brewing';
import { journalItems, journalPotions } from '../../src/game/systems/journalBook';
import { CLOUD_JARS_MAX } from '../../src/game/systems/clues';
import { CLAW_POOL, GAP_POOL_DAY, GAP_POOL_NIGHT, PETAL_CAP } from '../../src/game/systems/places';
import { REPLACED, TRASH_BACK } from '../../src/game/systems/trash';
import { KNOTHOLE_POOL } from '../../src/game/systems/weather';
import { PLAZA_X } from './world';

// P-04 to P-06 and P-27 of the pre-release review: every journal entry must
// be obtainable from a new world. This is a reachability analysis over the
// start lists, respawns, shelf jars, the pools things drop from, the rules
// that turn one thing into another, recipes, and brewing.

/**
 * Things rules and secrets make in code, and what they need to exist first
 * (empty: only a place or a secret). Every item ID the sim spawns by name
 * must be here or in a start list, so a new spawn cannot slip past.
 */
const RULE_PRODUCTS: Readonly<Record<string, readonly string[]>> = {
  item_popcorn: ['item_popcorn_kernel'],
  item_sprout: ['item_seed_sunflower'],
  item_moon_pebble: ['item_pebble'],
  item_compost_goo: ['item_apple_core'],
  item_old_coin: [],
  item_honey_drop: [],
  item_key_tiny: [],
  item_hat_candle: [],
  item_map_scrap_1: ['item_key_tiny'],
  item_map_scrap_2: [],
  item_map_scrap_3: [],
  item_paint_rainbow: ['item_jar_glass'],
  item_cloud_jar: ['item_jar_glass'],
  item_treasure_map: ['item_map_scrap_1', 'item_map_scrap_2', 'item_map_scrap_3', 'item_map_scrap_4'],
  item_marble_gold: [],
  item_hat_bubble: ['item_old_coin'],
  item_acc_monocle: ['item_sugar_cube'],
  item_gnome_nose: [],
  item_berry_red: [],
  // The wind, or a flick of the tulip (P-05).
  item_petal: [],
  // Two things that make no recipe on the bench.
  item_junk_blob: ['item_pebble', 'item_twig'],
};

/** Things a rule or secret uses up for good: each must come back (`Trash.owe`). */
const USED_UP = ['item_jar_glass', 'item_balloon_red', 'item_balloon_blue'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Item IDs the sim spawns by name anywhere in src/game. */
function spawnedByName(): Set<string> {
  const out = new Set<string>();
  for (const f of sourceFiles(join(__dirname, '../../src/game'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/spawn\(\s*'item',\s*'(item_[a-z0-9_]+)'/g)) out.add(m[1]!);
  }
  return out;
}

/** Everything a new world can come to hold. */
function reachable(): Set<string> {
  const have = new Set<string>();
  for (const area of CONTENT.areas.all) {
    for (const s of area.start) if (s.kind === 'item') have.add(s.defId);
    for (const r of area.respawn) have.add(r.item);
    for (const f of area.fixtures ?? []) if (f.kind === 'shelf_jar' && f.item) have.add(f.item);
  }
  for (const id of [...KNOTHOLE_POOL, ...GAP_POOL_DAY, ...GAP_POOL_NIGHT, ...CLAW_POOL]) have.add(id);
  const ok = (input: RecipeInput): boolean =>
    typeof input === 'string'
      ? have.has(input)
      : 'tag' in input
        ? [...have].some((id) => CONTENT.items.get(id).tags.includes(input.tag))
        : input.anyOf.some((id) => have.has(id));
  let grew = true;
  while (grew) {
    grew = false;
    const add = (id: string): void => {
      if (!have.has(id)) {
        have.add(id);
        grew = true;
      }
    };
    for (const [out, needs] of Object.entries(RULE_PRODUCTS)) if (needs.every((n) => have.has(n))) add(out);
    for (const id of [...have]) {
      const def = CONTENT.items.get(id);
      if (def.pops) add(def.pops);
      if (def.shatters) add(def.shatters.into);
      const turn = HEAD_TURNS[id];
      if (turn) add(turn);
      // A blueprint is found, and a recipe makes its output.
    }
    for (const r of CONTENT.recipes.all) if (r.inputs.every(ok)) add(r.output);
  }
  return have;
}

describe('every journal entry can be obtained from a new world', () => {
  const have = reachable();

  it('names every item the sim spawns by name as a rule product or a start thing', () => {
    const missing = [...spawnedByName()].filter((id) => !(id in RULE_PRODUCTS) && !have.has(id));
    expect(missing).toEqual([]);
    for (const id of Object.keys(RULE_PRODUCTS)) expect(CONTENT.items.has(id), id).toBe(true);
  });

  it('reaches every item on the items page', () => {
    const missing = journalItems(CONTENT)
      .map((d: ItemDef) => d.id)
      .filter((id) => !have.has(id));
    expect(missing).toEqual([]);
  });

  it('can make every recipe', () => {
    const blocked = CONTENT.recipes.all.filter(
      (r) =>
        !r.inputs.every((i) =>
          typeof i === 'string'
            ? have.has(i)
            : 'tag' in i
              ? [...have].some((id) => CONTENT.items.get(id).tags.includes(i.tag))
              : i.anyOf.some((id) => have.has(id)),
        ),
    );
    expect(blocked.map((r) => r.id)).toEqual([]);
  });

  it('can brew every potion on the potions page', () => {
    const drops = new Map<string, EssenceDrop>();
    for (const id of have) {
      const def = CONTENT.items.get(id);
      for (const night of [false, true]) {
        const d = essenceOf(def, def.tags, night);
        drops.set(`${d.essence}:${d.paint ?? ''}`, d);
      }
    }
    const list = [...drops.values()];
    const made = new Set<string>();
    for (let a = 0; a < list.length; a++)
      for (let b = a; b <= list.length; b++)
        for (let c = b; c <= list.length; c++) {
          const set = [list[a]!, list[b], list[c]].filter((d): d is EssenceDrop => d !== undefined);
          const p = brew(set, CONTENT.potions).potion;
          if (p) made.add(p);
        }
    expect(journalPotions(CONTENT).filter((p) => !made.has(p))).toEqual([]);
  });

  it('brings back what rules and secrets use up, so no secret can be locked out', () => {
    for (const id of USED_UP) expect(REPLACED.has(id), id).toBe(true);
    // Everything that pops or that a secret turns into something else is in the list.
    for (const def of CONTENT.items.all) if (def.pops) expect(USED_UP).toContain(def.id);
    for (const [out, needs] of Object.entries(RULE_PRODUCTS))
      if (out === 'item_cloud_jar' || out === 'item_paint_rainbow')
        for (const n of needs) expect(USED_UP).toContain(n);
  });
});

// --- The rules that make the missing things --------------------------------

function world(seed: string, areas: readonly string[] = []): Sim {
  const sim = Sim.empty({ seed });
  for (const area of areas) sim.send({ type: 'unlock', area });
  sim.step();
  return sim;
}

function put(sim: Sim, defId: string, x: number, y?: number): Entity {
  return sim.spawn('item', defId, x, y ?? sim.surfaceY(x) - sim.halfHeightOfDef(defId) - 0.02);
}

const count = (sim: Sim, defId: string): number =>
  sim.entities.ofKind('item').filter((e) => e.defId === defId).length;

const FLOWERBED = 'area_flowerbed_stage';
const OPEN = PLAZA_X + 28;

describe('balloons pop into scraps (P-04)', () => {
  it('a balloon dragged onto a toothpick pops with a bang and leaves a scrap', () => {
    const sim = world('pop-sharp');
    const pick = put(sim, 'item_toothpick', OPEN);
    sim.run(20);
    const p = sim.view(pick.id)!;
    const balloon = put(sim, 'item_balloon_red', p.x, p.y - 1.2);
    const popped: GameEvents['balloon_popped'][] = [];
    sim.events.on('balloon_popped', (e) => popped.push(e));
    sim.send({ type: 'grab', x: p.x, y: p.y - 1.2 });
    sim.step();
    for (let i = 0; i < 40 && popped.length === 0; i++) {
      sim.send({ type: 'drag', x: p.x, y: p.y - 1.2 + i * 0.05 });
      sim.step();
    }
    expect(popped).toHaveLength(1);
    expect(popped[0]!.cause).toBe('sharp');
    expect(sim.entities.has(balloon.id)).toBe(false);
    expect(count(sim, 'item_balloon_scrap')).toBe(1);
  });

  it('a hot balloon pops, and Prim chops one that floats past', () => {
    const sim = world('pop-hot');
    const balloon = put(sim, 'item_balloon_blue', OPEN, 6);
    sim.addTag(balloon.id, 'tag_hot', 'debug', 5);
    sim.run(2);
    expect(sim.entities.has(balloon.id)).toBe(false);
    expect(count(sim, 'item_balloon_scrap')).toBe(1);
    const chopped = world('pop-chop');
    const prim = chopped.spawn('bug', 'bug_mantis_prim', OPEN, GROUND_Y - 0.8);
    chopped.run(30);
    const b = put(chopped, 'item_balloon_red', OPEN, 6);
    chopped.emitNotice(prim, { type: 'chopped', itemId: b.id }, chopped.physics.getState(prim.id));
    expect(chopped.entities.has(b.id)).toBe(false);
    expect(count(chopped, 'item_balloon_scrap')).toBe(1);
  });

  it('a popped balloon comes home later, so balloons never run out', () => {
    const sim = Sim.create({ seed: 'pop-home' });
    sim.send({ type: 'unlock', area: FLOWERBED });
    sim.step();
    const before = count(sim, 'item_balloon_red');
    const b = sim.entities.ofKind('item').find((e) => e.defId === 'item_balloon_red')!;
    sim.pop(b, 'sharp');
    expect(count(sim, 'item_balloon_red')).toBe(before - 1);
    sim.run(TRASH_BACK + 5);
    expect(count(sim, 'item_balloon_red')).toBe(before);
  });
});

describe('petals blow off the flowers (P-05)', () => {
  it('a stiff wind sheds petals in the flowerbed, a few at most', () => {
    const sim = world('petals', [FLOWERBED]);
    sim.send({ type: 'focus', x0: 4, x1: 23.2 });
    sim.send({ type: 'set_weather', weather: 'weather_wind', wind: 3, rain: false });
    sim.run(60 * 60);
    const n = count(sim, 'item_petal');
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(PETAL_CAP);
  });

  it('no wind, no petals; a flick of the tulip shakes one loose', () => {
    const sim = world('petals-calm', [FLOWERBED]);
    sim.send({ type: 'focus', x0: 4, x1: 23.2 });
    sim.run(60 * 30);
    expect(count(sim, 'item_petal')).toBe(0);
    const tulip = sim.places.fixtures('tulip')[0]!;
    sim.places.poke({ id: tulip.fixture.id, kind: 'tulip', x: tulip.x, y: tulip.fixture.y });
    expect(count(sim, 'item_petal')).toBe(1);
  });
});

describe('glass jars come back after a secret uses one (P-06)', () => {
  it('a jar caught in a cloud is replaced at its home spot 40 s later, every time', () => {
    const sim = Sim.create({ seed: 'jar-home' });
    sim.send({ type: 'unlock', area: 'area_compost_lab' });
    sim.send({ type: 'set_weather', weather: 'weather_rain', wind: 0, rain: true });
    sim.step();
    expect(count(sim, 'item_jar_glass')).toBe(2);
    for (let round = 1; round <= 2; round++) {
      const jar = sim.entities.ofKind('item').find((e) => e.defId === 'item_jar_glass')!;
      sim.physics.setPosition(jar.id, PLAZA_X + 20, -1.5);
      sim.run(20);
      expect(count(sim, 'item_cloud_jar')).toBe(round);
      expect(count(sim, 'item_jar_glass')).toBe(1);
      sim.run(TRASH_BACK + 5);
      expect(count(sim, 'item_jar_glass')).toBe(2);
    }
    // Two cloud jars are enough: a third jar up there stays a jar, so they never pile up.
    const jar = sim.entities.ofKind('item').find((e) => e.defId === 'item_jar_glass')!;
    sim.physics.setPosition(jar.id, PLAZA_X + 20, -1.5);
    sim.run(20);
    expect(count(sim, 'item_cloud_jar')).toBe(CLOUD_JARS_MAX);
    expect(count(sim, 'item_jar_glass')).toBe(2);
  });

  it('a jar broken by a hard knock is replaced too', () => {
    const sim = Sim.create({ seed: 'jar-break' });
    sim.send({ type: 'unlock', area: 'area_compost_lab' });
    sim.step();
    const jar = sim.entities.ofKind('item').find((e) => e.defId === 'item_jar_glass')!;
    sim.shatter(jar, 'item_glass_bead', 4);
    expect(count(sim, 'item_jar_glass')).toBe(1);
    sim.run(TRASH_BACK + 5);
    expect(count(sim, 'item_jar_glass')).toBe(2);
  });
});
