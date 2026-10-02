import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { Rng } from '../../src/game/core/rng';
import { CONTENT } from '../../src/game/data';
import { SAVE_VERSION } from '../../src/game/save/schema';
import { MIGRATIONS, loadSaveFile } from '../../src/game/save/migrations';
import {
  BACK_GAP,
  BURP_AFTER,
  TRASH_BACK,
  awayFromHome,
  builtLinked,
  homeSpots,
  ownership,
} from '../../src/game/systems/trash';
import {
  DRIFT_AFTER,
  DRIFT_EVERY,
  HOME_NEAR,
  JUNK_CAP,
  WHISTLE_DELAY,
  WHISTLE_GAP,
} from '../../src/game/systems/tidy';
import { PLAZA_X } from './world';

// Playtest F1 and F2: the trash can, ownership and homes, recycling, the
// no-softlock guarantee, the setup rule, the tidy whistle, slow tidying,
// the junk cap, rummaging bugs, and save version 14.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const AREAS = CONTENT.areas.all.map((a) => a.id);

function can(sim: Sim) {
  return sim.trash.cans()[0]!;
}

function rim(sim: Sim): { x: number; y: number } {
  return sim.trash.rim(can(sim));
}

function put(sim: Sim, defId: string, x: number, y?: number): Entity {
  const half = sim.halfHeightOfDef(defId);
  return sim.spawn('item', defId, x, y ?? sim.surfaceY(x) - half - 0.02);
}

/** Pick a thing up, carry it over the can's mouth, and let go there, the way the hand would. */
function dropInCan(sim: Sim, e: Entity): void {
  const s = sim.view(e.id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  const r = rim(sim);
  for (let i = 0; i < 40; i++) {
    sim.send({ type: 'drag', x: r.x, y: r.y - 0.4 });
    sim.step();
  }
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

/** No bugs at all: nobody eats, carries, or bumps what a test is watching. */
function noBugs(sim: Sim): void {
  for (const b of sim.entities.ofKind('bug')) sim.remove(b.id);
}

/** Every bug naps and is full, so nobody wanders into a staged scene. */
function calm(sim: Sim): void {
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
}

describe('who owns what, and where home is', () => {
  it('tells world things from crafted things and bottles', () => {
    const items = CONTENT.items;
    expect(ownership(items.get('item_pebble'), undefined, CONTENT)).toBe('world');
    expect(ownership(items.get('item_compost_goo'), undefined, CONTENT)).toBe('world');
    expect(ownership(items.get('item_junk_blob'), [{ defId: 'item_pebble' }], CONTENT)).toBe('crafted');
    expect(ownership(items.get('item_slingshot_twig'), undefined, CONTENT)).toBe('crafted');
    expect(ownership(items.get('item_hat_pirate'), undefined, CONTENT)).toBe('crafted');
    expect(ownership(items.get('item_potion_giant'), undefined, CONTENT)).toBe('bottle');
    expect(ownership(items.get('item_potion_mix'), undefined, CONTENT)).toBe('bottle');
    // Anything with parts was made: a pebble glued into something is that thing.
    expect(ownership(items.get('item_pebble'), [{ defId: 'item_twig' }], CONTENT)).toBe('crafted');
  });

  it('finds every home spot from the start lists and the shelf jars, and none for things rules make', () => {
    const pebbles = homeSpots(CONTENT, 'item_pebble').filter((h) => h.area === 'area_stump_plaza');
    expect(pebbles.map((h) => Math.round((h.x - PLAZA_X) * 10) / 10)).toEqual([1, 4.4, 16.9, 31.3]);
    expect(homeSpots(CONTENT, 'item_tidy_whistle')).toEqual([
      { x: PLAZA_X + 33, y: null, area: 'area_stump_plaza' },
    ]);
    const jars = CONTENT.areas.all.flatMap((a) =>
      (a.fixtures ?? []).filter((f) => f.kind === 'shelf_jar' && f.item).map((f) => f.item!),
    );
    for (const item of jars) expect(homeSpots(CONTENT, item).length).toBeGreaterThan(0);
    for (const made of ['item_compost_goo', 'item_moon_pebble', 'item_popcorn', 'item_old_coin'])
      expect(homeSpots(CONTENT, made)).toEqual([]);
    expect(awayFromHome(CONTENT, 'item_pebble', PLAZA_X + 10)).toBeCloseTo(5.6);
    expect(awayFromHome(CONTENT, 'item_compost_goo', PLAZA_X + 10)).toBeNull();
    // Only open areas count, when asked.
    expect(awayFromHome(CONTENT, 'item_button', PLAZA_X + 10, (a) => a === 'area_stump_plaza')).toBeNull();
  });

  it('every item kind with a home has one inside the world', () => {
    for (const def of CONTENT.items.all)
      for (const h of homeSpots(CONTENT, def.id)) {
        const area = CONTENT.areas.get(h.area);
        expect(h.x).toBeGreaterThanOrEqual(area.xStart);
        expect(h.x).toBeLessThan(area.xEnd);
      }
  });
});

describe('the trash can', () => {
  it('chomps a thing let go over its mouth, burps, and sends it home later from the sky', () => {
    const sim = Sim.create({ seed: 'chomp' });
    calm(sim);
    const log = record(sim);
    const pebble = put(sim, 'item_pebble', PLAZA_X + 27.5);
    sim.run(20);
    dropInCan(sim, pebble);
    expect(sim.entities.has(pebble.id)).toBe(false);
    expect(named(log, 'trash_chomped')).toMatchObject([
      { id: pebble.id, defId: 'item_pebble', fate: 'home' },
    ]);
    expect(sim.trash.state.inside.map((t) => t.part.defId)).toEqual(['item_pebble']);
    sim.run(BURP_AFTER + 2);
    expect(named(log, 'trash_burped')).toHaveLength(1);
    sim.run(TRASH_BACK);
    const home = named(log, 'item_came_home');
    expect(home).toHaveLength(1);
    expect(home[0]!.defId).toBe('item_pebble');
    expect(sim.trash.state.inside).toEqual([]);
    sim.run(180);
    const back = sim.view(home[0]!.id as number)!;
    expect(awayFromHome(CONTENT, 'item_pebble', back.x)).toBeLessThan(HOME_NEAR);
    expect(back.y).toBeGreaterThan(0);
  });

  it('eats a thing the player throws in, but not one that only falls from the sky', () => {
    const sim = Sim.create({ seed: 'toss' });
    calm(sim);
    const log = record(sim);
    const r = rim(sim);
    const thrown = put(sim, 'item_pebble', r.x - 1.6, r.y - 1.2);
    sim.send({ type: 'grab', x: r.x - 1.6, y: r.y - 1.2 });
    sim.step();
    sim.send({ type: 'release', vx: 3.2, vy: -1 });
    sim.run(60);
    expect(named(log, 'trash_chomped').map((e) => e.id)).toEqual([thrown.id]);
    // A berry dropping in from the sky (a respawn) is nobody's doing: it lands, uneaten.
    const berry = put(sim, 'item_berry_red', r.x, r.y - 2);
    sim.run(90);
    expect(sim.entities.has(berry.id)).toBe(true);
    expect(named(log, 'trash_chomped')).toHaveLength(1);
  });

  it('recycles a junk blob and a crafted toy into their parts, and a potion bottle is gone', () => {
    const sim = Sim.create({ seed: 'recycle' });
    calm(sim);
    const log = record(sim);
    const blob = put(sim, 'item_junk_blob', PLAZA_X + 27);
    blob.parts = [{ defId: 'item_twig' }, { defId: 'item_pebble' }, { defId: 'item_potion_giant' }];
    const toy = put(sim, 'item_slingshot_twig', PLAZA_X + 29);
    toy.parts = [{ defId: 'item_twig' }, { defId: 'item_rubber_band' }];
    const bottle = put(sim, 'item_potion_glow', PLAZA_X + 30);
    sim.run(20);
    for (const e of [blob, toy, bottle]) sim.trash.swallow(e, can(sim), 'player');
    expect(named(log, 'trash_chomped').map((e) => [e.defId, e.fate, e.parts])).toEqual([
      ['item_junk_blob', 'recycled', 2],
      ['item_slingshot_twig', 'recycled', 2],
      ['item_potion_glow', 'gone', 0],
    ]);
    expect(sim.trash.state.inside.map((t) => t.part.defId)).toEqual([
      'item_twig',
      'item_pebble',
      'item_twig',
      'item_rubber_band',
    ]);
    // They come home a second apart, not all at once.
    const backs = sim.trash.state.inside.map((t) => t.back);
    for (let i = 1; i < backs.length; i++) expect(backs[i]! - backs[i - 1]!).toBeGreaterThanOrEqual(BACK_GAP);
    sim.run(TRASH_BACK + 5 * BACK_GAP);
    expect(named(log, 'item_came_home').map((e) => e.defId)).toEqual([
      'item_twig',
      'item_pebble',
      'item_twig',
      'item_rubber_band',
    ]);
  });

  it('a click hiccups up the last thing it ate; empty, it clacks its lid', () => {
    const sim = Sim.create({ seed: 'hiccup' });
    calm(sim);
    const log = record(sim);
    const a = put(sim, 'item_pebble', PLAZA_X + 27);
    const b = put(sim, 'item_twig', PLAZA_X + 29);
    sim.run(10);
    sim.trash.swallow(a, can(sim), 'player');
    sim.trash.swallow(b, can(sim), 'player');
    const c = can(sim);
    sim.send({ type: 'poke', x: c.x, y: c.fixture.y });
    sim.step();
    expect(named(log, 'trash_spat')).toMatchObject([{ why: 'hiccup', defId: 'item_twig' }]);
    sim.send({ type: 'poke', x: c.x, y: c.fixture.y });
    sim.step();
    sim.send({ type: 'poke', x: c.x, y: c.fixture.y });
    sim.step();
    expect(named(log, 'trash_spat').map((e) => e.defId)).toEqual(['item_twig', 'item_pebble']);
    expect(named(log, 'trash_poked')).toHaveLength(1);
    // What it hiccupped up does not fall straight back in.
    sim.run(120);
    expect(named(log, 'trash_chomped')).toHaveLength(2);
  });

  it('never keeps a bug: a flung one pops back out, smelly and indignant', () => {
    const sim = Sim.create({ seed: 'bug' });
    calm(sim);
    const log = record(sim);
    const r = rim(sim);
    const dot = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_ladybug_dot')!;
    sim.physics.place(dot.id, r.x, r.y - 1.5, 0);
    sim.send({ type: 'grab', x: r.x, y: r.y - 1.5 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 3 });
    sim.run(40);
    expect(sim.entities.has(dot.id)).toBe(true);
    expect(named(log, 'trash_spat')).toMatchObject([{ id: dot.id, why: 'bug' }]);
    expect(named(log, 'bug_reacted').some((e) => e.id === dot.id && e.reaction === 'trashed')).toBe(true);
    expect(sim.hasTag(dot.id, 'tag_smelly')).toBe(true);
    expect(sim.trash.state.inside).toEqual([]);
  });

  it('leaves a hidden bug waiting to be found alone, and never offers itself for one', () => {
    const sim = Sim.create({ seed: 'twig' });
    calm(sim);
    const log = record(sim);
    const twig = sim.entities.ofKind('bug').find((b) => b.bug?.pending)!;
    const r = rim(sim);
    sim.physics.place(twig.id, r.x, r.y - 0.4, 0);
    sim.physics.setVelocity(twig.id, 0, 3);
    sim.run(30);
    expect(sim.entities.has(twig.id)).toBe(true);
    expect(named(log, 'trash_chomped')).toEqual([]);
    expect(sim.dropTargetFor(twig.id)).toBeNull();
  });

  it('keeps the setup rule: a piece of the player’s build is spat out, and no drop target lights for it', () => {
    const sim = Sim.create({ seed: 'setup' });
    calm(sim);
    const log = record(sim);
    const x = PLAZA_X + 28;
    const caps = [0, 1, 2].map((i) => put(sim, 'item_bottle_cap', x, GROUND_Y - 0.09 - i * 0.18));
    sim.run(60);
    for (const c of caps) sim.addTag(c.id, 'tag_player_setup', 'debug', null);
    // A pebble leaning on the build counts as part of it.
    const leaning = put(sim, 'item_pebble', x + 0.32);
    sim.run(30);
    const built = builtLinked(sim);
    for (const c of caps) expect(built.has(c.id)).toBe(true);
    expect(sim.trash.refusal(caps[2]!)).toBe('setup');
    expect(sim.trash.candidates(caps[2]!.id)).toEqual([]);
    sim.trash.swallow(caps[2]!, can(sim), 'player');
    expect(sim.entities.has(caps[2]!.id)).toBe(true);
    expect(named(log, 'trash_spat')).toMatchObject([{ id: caps[2]!.id, why: 'setup' }]);
    void leaning;
    // Too big for its mouth: the lattice panel.
    const lattice = put(sim, 'item_lattice_panel', PLAZA_X + 24);
    expect(sim.trash.refusal(lattice)).toBe('big');
  });

  it('keeps what is inside through a save, and loads a version 13 save with an empty can and the whistle', () => {
    const sim = Sim.create({ seed: 'save' });
    calm(sim);
    const e = put(sim, 'item_twig', PLAZA_X + 27);
    sim.run(5);
    sim.trash.swallow(e, can(sim), 'player');
    const saved = JSON.parse(JSON.stringify(sim.serialize()));
    const loaded = Sim.load(saved);
    expect(loaded.trash.state.inside).toEqual(sim.trash.state.inside);
    expect(loaded.tidy.state).toEqual(sim.tidy.serialize());
    // Version 13: no trash, no whistle. The migration only bumps the version; loading adds the whistle.
    const old = JSON.parse(JSON.stringify(saved));
    delete old.trash;
    delete old.tidy;
    old.entities = old.entities.filter((x: { defId: string }) => x.defId !== 'item_tidy_whistle');
    const file = {
      version: 13,
      savedAt: 't',
      world: old,
      view: { cameraX: 1 },
      meta: { createdAt: 't', thumb: null },
    };
    expect(MIGRATIONS[13]!(structuredClone(file))).toEqual({ ...file, version: 14 });
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(14);
    const migrated = loadSaveFile(JSON.stringify(file));
    const w = Sim.load(migrated.world);
    expect(w.trash.state.inside).toEqual([]);
    expect(w.entities.ofKind('item').filter((x) => x.defId === 'item_tidy_whistle')).toHaveLength(1);
    // A malformed can is refused.
    const bad = structuredClone(migrated);
    (bad.world as unknown as { trash: unknown }).trash = { inside: 'nope' };
    expect(() => loadSaveFile(JSON.stringify(bad))).toThrow();
  });
});

describe('nothing is lost (no softlock)', () => {
  /**
   * The property: trash every item in the world, in a random order, then
   * wait. Every world thing is back (at least as many of each kind as
   * before, counting the parts of crafted things), nothing waits in the can,
   * and each is inside an open area, above the ground. So every recipe
   * ingredient and every secret item is there to be found again.
   */
  for (const seed of ['softlock-a', 'softlock-b']) {
    it(`trashing everything in a random order (${seed}) brings every world thing back`, () => {
      const sim = Sim.create({ seed });
      for (const area of AREAS) sim.send({ type: 'unlock', area });
      sim.step();
      // Bugs eat food and carry things off; this is about the can alone.
      noBugs(sim);
      // Some of everything: a blob and a toy with parts, a bottle, and things rules make.
      const x = PLAZA_X + 26;
      const blob = put(sim, 'item_junk_blob', x);
      blob.parts = [{ defId: 'item_button' }, { defId: 'item_paperclip' }];
      const toy = put(sim, 'item_matchbox_racer', x + 1);
      toy.parts = [{ defId: 'item_matchbox' }, { defId: 'item_button' }, { defId: 'item_button' }];
      for (const d of ['item_potion_giant', 'item_moon_pebble', 'item_old_coin', 'item_compost_goo'])
        put(sim, d, x + 2);
      sim.run(30);

      const want = new Map<string, number>();
      const count = (defId: string, parts?: readonly { defId: string; parts?: unknown }[]): void => {
        const def = CONTENT.items.get(defId);
        const kind = ownership(def, parts as never, CONTENT);
        if (kind === 'bottle') return;
        if (kind === 'crafted') {
          for (const p of parts ?? []) count(p.defId, p.parts as never);
          return;
        }
        want.set(defId, (want.get(defId) ?? 0) + 1);
      };
      const rng = new Rng(seed);
      const items = sim.entities.ofKind('item').filter((e) => sim.trash.refusal(e) === null);
      for (const e of items) count(e.defId, e.parts);
      // Shuffle.
      for (let i = items.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [items[i], items[j]] = [items[j]!, items[i]!];
      }
      const kept = new Set(
        sim.entities
          .ofKind('item')
          .filter((e) => !items.includes(e))
          .map((e) => e.defId),
      );
      for (const e of items) if (sim.entities.has(e.id)) sim.trash.swallow(e, can(sim), 'player');
      expect(sim.trash.state.inside.length).toBeGreaterThan(100);

      sim.run(TRASH_BACK + sim.trash.state.inside.length * BACK_GAP + 4 * 60);
      expect(sim.trash.state.inside).toEqual([]);

      const have = new Map<string, number>();
      for (const e of sim.entities.ofKind('item')) have.set(e.defId, (have.get(e.defId) ?? 0) + 1);
      for (const [defId, n] of want) expect(have.get(defId) ?? 0, defId).toBeGreaterThanOrEqual(n);
      for (const e of sim.entities.ofKind('item')) {
        const v = sim.view(e.id)!;
        expect(sim.barriers.isOpen(sim.areaOf(v.x).id), `${e.defId} at ${v.x}`).toBe(true);
        expect(v.y, e.defId).toBeLessThan(sim.surfaceY(v.x) + 0.3);
        expect(v.x).toBeGreaterThan(0);
        expect(v.x).toBeLessThan(sim.worldWidth);
      }
      // Every recipe's named ingredients that the world had are there again.
      for (const r of CONTENT.recipes.all)
        for (const input of r.inputs)
          if (typeof input === 'string' && (want.has(input) || kept.has(input)))
            expect(have.get(input) ?? 0, `${r.id}: ${input}`).toBeGreaterThan(0);
      // So is every secret's item that was out in the world.
      for (const s of CONTENT.secrets.all)
        for (const u of s.unlocks ?? [])
          if (u.kind === 'item' && want.has(u.id)) expect(have.get(u.id) ?? 0, u.id).toBeGreaterThan(0);
      expect(sim.bounds.returned).toBe(0);
      expect(sim.rescues).toBe(0);
    }, 120_000);
  }
});

describe('the tidy whistle', () => {
  it('the can will not eat the whistle: it spits it back out with a "nope" (P-26)', () => {
    const sim = Sim.create({ seed: 'whistle-nope' });
    calm(sim);
    const log = record(sim);
    const whistle = sim.entities.ofKind('item').find((e) => e.defId === 'item_tidy_whistle')!;
    expect(sim.trash.refusal(whistle)).toBe('tool');
    // Its mouth still lights for it, so letting go there is answered, not a plain drop.
    expect(sim.trash.candidates(whistle.id)).toHaveLength(1);
    dropInCan(sim, whistle);
    sim.run(5);
    expect(sim.entities.has(whistle.id)).toBe(true);
    expect(sim.trash.state.inside).toEqual([]);
    expect(named(log, 'trash_spat')).toMatchObject([{ id: whistle.id, why: 'tool' }]);
    expect(named(log, 'trash_chomped')).toEqual([]);
    // The tidy whistle never tidies itself into the can either.
    sim.run(3 * 60);
    expect(sim.entities.has(whistle.id)).toBe(true);
  });

  it('sends loose things in view home one after another, junk into the can, and leaves builds and toys', () => {
    const sim = Sim.create({ seed: 'whistle' });
    calm(sim);
    sim.send({ type: 'focus', x0: PLAZA_X + 19, x1: PLAZA_X + 38.2 });
    const log = record(sim);
    const strays = [
      put(sim, 'item_mint_leaf', PLAZA_X + 24),
      put(sim, 'item_flashlight_pen', PLAZA_X + 26),
      put(sim, 'item_leaf', PLAZA_X + 36),
    ];
    const blob = put(sim, 'item_junk_blob', PLAZA_X + 25);
    blob.parts = [{ defId: 'item_twig' }];
    const toy = put(sim, 'item_spring_launcher', PLAZA_X + 28.5);
    // A stack of three bottle caps far from their home, the player's build.
    const build = [0, 1, 2].map((i) => put(sim, 'item_bottle_cap', PLAZA_X + 30, GROUND_Y - 0.1 - i * 0.2));
    sim.run(60);
    for (const b of build) sim.addTag(b.id, 'tag_player_setup', 'debug', null);
    const before = new Map(build.map((b) => [b.id, sim.view(b.id)!]));
    const toyAt = sim.view(toy.id)!;
    const whistle = sim.entities.ofKind('item').find((e) => e.defId === 'item_tidy_whistle')!;
    const w = sim.view(whistle.id)!;
    sim.send({ type: 'poke', x: w.x, y: w.y });
    sim.step();
    const blown = named(log, 'whistle_blown');
    expect(blown).toHaveLength(1);
    expect(blown[0]!.count).toBe(4);
    sim.run(WHISTLE_DELAY + 4 * WHISTLE_GAP + 2);
    const tidied = named(log, 'item_tidied');
    expect(tidied.map((e) => e.id).sort()).toEqual([...strays.map((s) => s.id), blob.id].sort());
    expect(tidied.find((e) => e.id === blob.id)!.to).toBe('can');
    expect(named(log, 'trash_chomped')).toMatchObject([{ id: blob.id, fate: 'recycled', by: 'tidy' }]);
    sim.run(240);
    for (const s of strays) {
      const v = sim.view(s.id)!;
      expect(awayFromHome(CONTENT, s.defId, v.x)!, s.defId).toBeLessThan(HOME_NEAR);
    }
    for (const [id, a] of before) {
      const b = sim.view(id)!;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.05);
    }
    expect(Math.abs(sim.view(toy.id)!.x - toyAt.x)).toBeLessThan(0.3);
    // Out of view stays put.
    expect(named(log, 'item_tidied').every((e) => (e.fromX as number) >= PLAZA_X + 19)).toBe(true);
  });

  it('blown again while things are still on their way, it only toots', () => {
    const sim = Sim.create({ seed: 'toot' });
    calm(sim);
    const log = record(sim);
    put(sim, 'item_leaf', PLAZA_X + 28);
    sim.run(30);
    const whistle = sim.entities.ofKind('item').find((e) => e.defId === 'item_tidy_whistle')!;
    sim.tidy.blow(whistle);
    sim.tidy.blow(whistle);
    expect(named(log, 'whistle_blown').map((e) => e.count)).toEqual([1, 0]);
  });
});

describe('slow tidying', () => {
  it('litter in an area nobody has looked at for a while drifts home; the player’s things stay', () => {
    const sim = Sim.create({ seed: 'drift' });
    noBugs(sim);
    const log = record(sim);
    const stray = put(sim, 'item_leaf', PLAZA_X + 27);
    const mine = put(sim, 'item_mint_leaf', PLAZA_X + 30);
    sim.run(10);
    sim.addTag(mine.id, 'tag_player_setup', 'debug', 20 * 60);
    // The camera off at the far left: the plaza sleeps.
    sim.send({ type: 'focus', x0: 0, x1: 19.2 });
    sim.run(DRIFT_AFTER - 30 * 60);
    expect(named(log, 'item_tidied')).toEqual([]);
    sim.run(30 * 60 + DRIFT_EVERY * 3);
    const drifted = named(log, 'item_tidied');
    expect(drifted.map((e) => e.id)).toContain(stray.id);
    expect(drifted.every((e) => e.cause === 'drift')).toBe(true);
    expect(drifted.map((e) => e.id)).not.toContain(mine.id);
    expect(awayFromHome(CONTENT, 'item_leaf', sim.view(stray.id)!.x)!).toBeLessThan(HOME_NEAR);
  });

  it('rain skitters light litter toward home, a hop at a time', () => {
    const sim = Sim.create({ seed: 'rainy' });
    noBugs(sim);
    const log = record(sim);
    const leaf = put(sim, 'item_leaf', PLAZA_X + 9.6);
    sim.run(30);
    const start = sim.view(leaf.id)!.x;
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(40 * 60);
    const nudges = named(log, 'litter_nudged').filter((e) => e.id === leaf.id);
    expect(nudges.length).toBeGreaterThan(0);
    expect(nudges.every((e) => e.dir === -1 && e.cause === 'rain')).toBe(true);
    expect(sim.view(leaf.id)!.x).toBeLessThan(start);
  });

  it(`keeps at most ${JUNK_CAP} junk blobs loose in an area: the oldest goes in the trash can`, () => {
    const sim = Sim.create({ seed: 'cap' });
    calm(sim);
    const log = record(sim);
    const blobs = [0, 1, 2, 3, 4, 5].map((i) => {
      const b = put(sim, 'item_junk_blob', PLAZA_X + 24 + i * 0.9);
      b.parts = [{ defId: 'item_twig' }];
      return b;
    });
    sim.run(5 * 60);
    const left = sim.entities.ofKind('item').filter((e) => e.defId === 'item_junk_blob');
    expect(left).toHaveLength(JUNK_CAP);
    expect(named(log, 'trash_chomped').map((e) => e.id)).toEqual([blobs[0]!.id, blobs[1]!.id]);
    expect(named(log, 'item_tidied').every((e) => e.cause === 'cap' && e.to === 'can')).toBe(true);
  });
});

describe('rummaging', () => {
  it('a bug that loves the can dives in and comes up with the oldest thing in it', () => {
    const sim = Sim.create({ seed: 'rummage' });
    for (const area of AREAS) sim.send({ type: 'unlock', area });
    sim.step();
    calm(sim);
    const log = record(sim);
    const r = rim(sim);
    const e = put(sim, 'item_cork', PLAZA_X + 27);
    sim.run(5);
    sim.trash.swallow(e, can(sim), 'player');
    const rollo = sim.entities.ofKind('bug').find((b) => b.defId === 'bug_pillbug_rollo')!;
    sim.physics.place(rollo.id, r.x - 3, GROUND_Y - 0.4, 0);
    let found: Record<string, unknown> | undefined;
    for (let t = 0; t < 120 && !found; t++) {
      rollo.bug!.needs.need_fun = 40;
      rollo.bug!.needs.need_hunger = 100;
      rollo.bug!.needs.need_energy = 100;
      rollo.bug!.needs.need_social = 100;
      sim.run(30);
      found = named(log, 'trash_rummaged')[0];
    }
    expect(found).toMatchObject({ bugId: rollo.id, defId: 'item_cork' });
    expect(sim.trash.state.inside).toEqual([]);
    expect(named(log, 'bug_reacted').some((x) => x.id === rollo.id && x.reaction === 'cheer')).toBe(true);
  });
});
