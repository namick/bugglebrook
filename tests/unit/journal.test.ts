import { describe, expect, it } from 'vitest';
import {
  BUTTERFLY_KEY,
  CONTENT,
  GROUND_Y,
  MAP_AREAS,
  SPARKLE_AFTER,
  Sim,
  journalItems,
  journalPotions,
  loadSaveFile,
  nextSecret,
  weirdFavorite,
} from '../../src/game';
import { SAVE_VERSION } from '../../src/game/save/schema';
import type { SecretDef } from '../../src/game';
import { MIGRATIONS } from '../../src/game/save/migrations';
import { validateSaveFile } from '../../src/game/save/validate';
import { PLAZA_X } from './world';
import v13 from './fixtures/save-v13.json';

// M10, the journal (game design doc, section 13): entry states, completion,
// "new!" badges, bug observations, the sparkle hint, and save version 14.

function world(seed = 'journal'): Sim {
  const sim = Sim.empty({ seed });
  sim.step();
  return sim;
}

const countable = (): number =>
  CONTENT.bugs.all.length +
  1 + // Munch's butterfly form.
  journalItems(CONTENT).length +
  CONTENT.recipes.all.length +
  journalPotions(CONTENT).length +
  CONTENT.secrets.all.filter((s) => !s.blocked).length +
  MAP_AREAS.length;

describe('the journal book', () => {
  it('counts every countable entry and starts with only the plaza found', () => {
    const sim = world();
    const book = sim.book();
    expect(book.completion.total).toBe(countable());
    expect(book.areas.map((a) => a.id)).toEqual(MAP_AREAS);
    expect(book.areas.filter((a) => a.state === 'discovered').map((a) => a.id)).toEqual(['area_stump_plaza']);
    expect(book.completion.found).toBe(1);
    expect(book.completion.percent).toBeCloseTo(100 / countable());
    // Blocked secrets are not in the book.
    expect(book.secrets.some((s) => CONTENT.secrets.get(s.id).blocked)).toBe(false);
    expect(book.secrets.every((s) => s.state === 'unknown' && s.hint.length > 0)).toBe(true);
  });

  it('completion percent is discovered over all countable entries', () => {
    const sim = world();
    sim.findSecret('secret_sun_shades', PLAZA_X, 5);
    sim.findSecret('secret_bug_totem', PLAZA_X, 5);
    sim.spawn('item', 'item_pebble', PLAZA_X + 5, GROUND_Y - 1);
    sim.step();
    const pebble = sim.entities.ofKind('item')[0]!;
    const s = sim.physics.getState(pebble.id);
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.run(3);
    const book = sim.book();
    const found = [...book.bugs.map((b) => b.entry), ...book.items, ...book.recipes, ...book.potions]
      .concat(book.secrets, book.areas)
      .filter((e) => e.state === 'discovered').length;
    expect(found).toBe(4);
    expect(book.completion.found).toBe(found);
    expect(book.completion.percent).toBeCloseTo((100 * found) / book.completion.total);
  });

  it('marks found entries new until the player looks at them', () => {
    const sim = world();
    const e = sim.spawn('item', 'item_feather', PLAZA_X + 5, GROUND_Y - 1);
    sim.step();
    const s = sim.physics.getState(e.id);
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    let book = sim.book();
    const feather = book.items.find((i) => i.id === 'item_feather')!;
    expect(feather.state).toBe('discovered');
    expect(feather.isNew).toBe(true);
    expect(feather.stamp).toEqual({ night: false, day: 1 });
    expect(book.fresh.page_items).toBe(1);
    expect(book.newCount).toBeGreaterThanOrEqual(2); // the feather and the plaza
    sim.send({ type: 'journal_seen', keys: ['item:item_feather', 'area:area_stump_plaza'] });
    sim.step();
    book = sim.book();
    expect(book.items.find((i) => i.id === 'item_feather')!.isNew).toBe(false);
    expect(book.newCount).toBe(0);
  });

  it('meets a bug when the player touches it, and a hidden bug when it joins', () => {
    const sim = world();
    const dot = sim.spawn('bug', 'bug_ladybug_dot', PLAZA_X + 6, GROUND_Y - 0.6);
    sim.run(20);
    expect(sim.book().bugs.find((b) => b.entry.id === 'bug_ladybug_dot')!.entry.state).toBe('unknown');
    const s = sim.physics.getState(dot.id);
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.run(2);
    expect(sim.book().bugs.find((b) => b.entry.id === 'bug_ladybug_dot')!.entry.state).toBe('discovered');
    sim.findSecret('secret_munch_found', PLAZA_X, 5);
    sim.step();
    expect(sim.journal.state.bugs).toContain('bug_caterpillar_munch');
    sim.findSecret('secret_munch_butterfly', PLAZA_X, 5);
    sim.step();
    const butterfly = sim.book().bugs.find((b) => b.entry.key === BUTTERFLY_KEY)!;
    expect(butterfly.form).toBe('butterfly');
    expect(butterfly.entry.state).toBe('discovered');
  });

  it('a secret that gives an item finds that item too', () => {
    const sim = world();
    sim.findSecret('secret_floor_coin', PLAZA_X, 5);
    sim.step();
    expect(sim.journal.state.items).toContain('item_old_coin');
    expect(sim.book().secrets.find((s) => s.id === 'secret_floor_coin')!.state).toBe('discovered');
  });

  it('fills a bug card when the player sees it eat a loved food', () => {
    const sim = world();
    const dot = sim.spawn('bug', 'bug_ladybug_dot', PLAZA_X + 6, GROUND_Y - 0.6);
    const dotDef = CONTENT.bugs.get('bug_ladybug_dot');
    const love = dotDef.loves.find((f) => f !== weirdFavorite(dotDef, CONTENT.bugs.all))!;
    sim.run(30);
    const food = sim.spawn('item', love, PLAZA_X + 6.6, GROUND_Y - 1);
    sim.run(2);
    sim.feed(dot.id, food.id, true);
    sim.run(400);
    const card = sim.book().bugs.find((b) => b.entry.id === 'bug_ladybug_dot')!;
    expect(card.loved).toContain(love);
    expect(card.loved).toHaveLength(3);
    expect(card.disliked).toEqual([null, null]);
  });

  it('records a toy a bug plays with, a nap spot, and a photo', () => {
    const sim = world();
    sim.events.emit('bug_slept', { id: 1, defId: 'bug_snail_glorp', x: PLAZA_X + 3, y: 8 });
    sim.events.emit('photo_taken', {
      frame: 'f',
      filter: 'f',
      stickers: 0,
      zoom: 1,
      bugs: ['bug_snail_glorp'],
    });
    sim.step();
    const card = sim.book().bugs.find((b) => b.entry.id === 'bug_snail_glorp')!;
    expect(card.place).toBe('area_stump_plaza');
    expect(card.photo).toBe(true);
  });

  it('logs things that flew out of the world for the lost shelf', () => {
    const sim = world();
    const e = sim.spawn('item', 'item_rubber_ball', PLAZA_X + 4, GROUND_Y - 1);
    sim.step();
    sim.physics.setPosition(e.id, -40, -10);
    sim.run(20);
    expect(sim.journal.state.lost).toEqual(['item_rubber_ball']);
  });

  it('sparkles one ready secret after fifteen quiet minutes, and opening it shows one more pictogram', () => {
    const sim = world();
    sim.run(SPARKLE_AFTER - 120);
    expect(sim.journal.state.sparkle).toBeNull();
    sim.run(240);
    const key = sim.journal.state.sparkle;
    expect(key).toMatch(/^secret:/);
    const id = key!.slice('secret:'.length);
    const def = CONTENT.secrets.get(id);
    expect(def.tier).toBe(1);
    expect(sim.book().secrets.find((s) => s.id === id)!.sparkle).toBe(true);
    expect(sim.book().sparklePage).toBe('page_secrets');
    sim.send({ type: 'journal_seen', keys: [key!] });
    sim.step();
    const entry = sim.book().secrets.find((s) => s.id === id)!;
    expect(entry.extra).toBe(def.trigger.type === 'scripted' ? def.trigger.area : null);
  });

  it('the next secret is the easiest ready one, in the area being looked at first', () => {
    const def = (id: string, tier: 1 | 2 | 3, area: string, requires?: string[]): SecretDef => ({
      id,
      name: id,
      tier,
      trigger: { type: 'scripted', area },
      unlocks: [],
      hint: ['moon'],
      ...(requires ? { requires } : {}),
    });
    const all = [
      def('a_plaza_t2', 2, 'area_stump_plaza'),
      def('b_plaza_t1', 1, 'area_stump_plaza'),
      def('c_pond_t2', 2, 'area_puddle_pond'),
      def('d_pond_t1', 1, 'area_puddle_pond', ['c_pond_t2']),
      def('e_porch_t1', 1, 'area_under_porch'),
      { ...def('f_blocked', 1, 'area_stump_plaza'), blocked: 'not yet' },
    ];
    const open = (a: string): boolean => a === 'area_stump_plaza' || a === 'area_puddle_pond';
    expect(nextSecret(all, [], open, 'area_puddle_pond')!.id).toBe('c_pond_t2');
    expect(nextSecret(all, [], open, null)!.id).toBe('b_plaza_t1');
    expect(nextSecret(all, ['c_pond_t2'], open, 'area_puddle_pond')!.id).toBe('d_pond_t1');
    // Never one blocked, behind a locked area, or missing its prerequisites.
    expect(nextSecret(all, ['a_plaza_t2', 'b_plaza_t1'], (a) => a === 'area_stump_plaza', null)).toBeNull();
  });

  it('shows mysteries a panel at a time', () => {
    const sim = world();
    let page = sim.book().mysteries.find((m) => m.id === 'mystery_gnome_nose')!;
    expect(page.panels.map((p) => p.state)).toEqual([
      'next',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
    ]);
    expect(page.started).toBe(false);
    sim.send({ type: 'notice', what: 'gnome_sniffle' });
    sim.send({ type: 'notice', what: 'not_a_clue' });
    sim.step();
    expect(sim.journal.state.noticed).toEqual(['gnome_sniffle']);
    page = sim.book().mysteries.find((m) => m.id === 'mystery_gnome_nose')!;
    expect(page.panels.map((p) => p.state).slice(0, 3)).toEqual(['done', 'next', 'hidden']);
    expect(page.panels[2]!.hint).toEqual([]);
    expect(page.started).toBe(true);
  });

  it('a weird favorite is a food most other bugs dislike', () => {
    for (const bug of CONTENT.bugs.all) {
      const weird = weirdFavorite(bug, CONTENT.bugs.all);
      if (!weird) continue;
      expect([...bug.loves, ...bug.likes]).toContain(weird);
      const others = CONTENT.bugs.all.filter((b) => b.id !== bug.id);
      expect(others.filter((b) => b.dislikes.includes(weird)).length * 2).toBeGreaterThanOrEqual(
        others.length,
      );
    }
    expect(CONTENT.bugs.all.some((b) => weirdFavorite(b, CONTENT.bugs.all))).toBe(true);
  });
});

describe('secret prerequisites', () => {
  it('no secret with a Requires value fires before its prerequisites', () => {
    for (const def of CONTENT.secrets.all) {
      if (!def.requires || def.blocked) continue;
      const sim = world(def.id);
      expect(sim.findSecret(def.id, 0, 0)).toBe(false);
      for (const r of def.requires) {
        // Found in an order that keeps each prerequisite's own prerequisites first.
        const chain = (id: string): string[] => [
          ...(CONTENT.secrets.get(id).requires ?? []).flatMap(chain),
          id,
        ];
        for (const id of chain(r)) sim.findSecret(id, 0, 0);
      }
      expect(sim.secrets).not.toContain(def.id);
      expect(sim.findSecret(def.id, 0, 0)).toBe(true);
    }
  });

  it('blocked secrets never fire', () => {
    const sim = world();
    for (const def of CONTENT.secrets.all.filter((s) => s.blocked)) {
      for (const r of def.requires ?? []) sim.secrets.push(r);
      expect(sim.findSecret(def.id, 0, 0)).toBe(false);
    }
  });
});

describe('unique items', () => {
  it('come home when flung out of the world', () => {
    const sim = world();
    const key = sim.spawn('item', 'item_key_tiny', PLAZA_X + 9, GROUND_Y - 0.5);
    expect(key.home).toEqual({ x: PLAZA_X + 9, y: GROUND_Y - 0.5 });
    sim.run(30);
    sim.physics.setPosition(key.id, PLAZA_X + 9, -60);
    sim.run(30);
    const s = sim.physics.getState(key.id);
    expect(Math.abs(s.x - (PLAZA_X + 9))).toBeLessThan(0.5);
    expect(sim.entities.get(key.id)).toBeDefined();
  });

  it('are never brewed or crafted', () => {
    for (const def of CONTENT.items.all.filter((d) => d.unique)) {
      expect(def.tags).not.toContain('tag_edible');
      expect(def.shatters).toBeUndefined();
      expect(CONTENT.recipes.all.some((r) => r.inputs.includes(def.id))).toBe(false);
    }
  });
});

describe('save version 14', () => {
  it('round-trips the journal', () => {
    const sim = world();
    sim.findSecret('secret_sun_shades', PLAZA_X, 5);
    sim.send({ type: 'notice', what: 'moss_squeak' });
    sim.step();
    const save = sim.serialize();
    expect(save.journal?.noticed).toEqual(['moss_squeak']);
    const back = Sim.load(JSON.parse(JSON.stringify(save)));
    expect(back.serialize().journal).toEqual(save.journal);
  });

  it('migrates a version 13 save and seeds its journal from what it proves', () => {
    expect(SAVE_VERSION).toBe(14);
    expect(MIGRATIONS[13]).toBeDefined();
    const file = loadSaveFile(JSON.stringify(v13));
    expect(file.version).toBe(14);
    expect(file.world.journal).toBeUndefined();
    const sim = Sim.load(file.world);
    const j = sim.journal.state;
    expect(j.bugs.length).toBeGreaterThan(0);
    expect(j.areas).toContain('area_stump_plaza');
    expect(sim.book().newCount).toBe(0);
    const saved = { ...file, world: sim.serialize() };
    expect(validateSaveFile(JSON.parse(JSON.stringify(saved)))).toEqual([]);
  });

  it('rejects a broken journal', () => {
    const sim = world();
    const file = {
      version: SAVE_VERSION,
      savedAt: 0,
      world: sim.serialize(),
      view: { cameraX: 0 },
      meta: {},
    };
    (file.world as unknown as Record<string, unknown>).journal = { bugs: 3 };
    expect(validateSaveFile(file).join()).toMatch(/world.journal is invalid/);
  });
});
