import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { ESSENCE_IDS, ESSENCE_ITEMS, OPPOSITES } from '../../src/game/data/essences';
import { ITEMS } from '../../src/game/data/items';
import { POTIONS } from '../../src/game/data/potions';
import type { EssenceId, PotionEffect } from '../../src/game/data/types';
import { basePotion, brew, essenceOf } from '../../src/game/systems/brewing';
import type { EssenceDrop } from '../../src/game/systems/brewing';
import { BUBBLE_TICKS, MAX_INGREDIENTS, STIR_RADIANS } from '../../src/game/systems/cauldron';
import { mixPaint } from '../../src/game/systems/paint';
import { PLAZA_X } from './world';

// M8 (game design doc, section 9): the cauldron, potions, and what they do.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const drop = (essence: EssenceId | null, paint?: string): EssenceDrop =>
  paint ? { essence, paint } : { essence };

/** One item for every essence, to put in the cauldron. */
const ESSENCE_ITEM: Record<EssenceId, string> = (() => {
  const out: Partial<Record<EssenceId, string>> = {
    ess_moon: 'item_moon_pebble',
    ess_glow: 'item_glass_bead',
    ess_color: 'item_paint_red',
    ess_hair: 'item_tissue',
  };
  for (const [item, e] of Object.entries(ESSENCE_ITEMS)) out[e] ??= item;
  return out as Record<EssenceId, string>;
})();

describe('essences (pure)', () => {
  it('gives every listed ingredient its essence', () => {
    for (const [item, e] of Object.entries(ESSENCE_ITEMS))
      expect(essenceOf(ITEMS.get(item), ITEMS.get(item).tags, false).essence, item).toBe(e);
  });

  it('moon pebbles are moonlight at night and glow by day; paints are color; tags count too', () => {
    const moon = ITEMS.get('item_moon_pebble');
    expect(essenceOf(moon, moon.tags, true).essence).toBe('ess_moon');
    expect(essenceOf(moon, moon.tags, false).essence).toBe('ess_glow');
    expect(essenceOf(ITEMS.get('item_paint_blue'), [], false)).toEqual({
      essence: 'ess_color',
      paint: 'paint_blue',
    });
    expect(essenceOf(ITEMS.get('item_berry_red'), [], false)).toEqual({
      essence: 'ess_color',
      paint: 'paint_red',
    });
    expect(essenceOf(ITEMS.get('item_pebble'), ['tag_fuzzy'], false).essence).toBe('ess_heavy');
    expect(essenceOf(ITEMS.get('item_cork'), ['tag_fuzzy'], false).essence).toBe('ess_hair');
    expect(essenceOf(ITEMS.get('item_cork'), ['tag_slimy'], false).essence).toBe('ess_slow');
    expect(essenceOf(ITEMS.get('item_flashlight_pen'), ['tag_glowing'], false).essence).toBe('ess_glow');
    expect(essenceOf(ITEMS.get('item_button'), [], false).essence).toBeNull();
  });
});

describe('brewing (M8 acceptance: every essence and pair rule)', () => {
  it.each(ESSENCE_IDS.map((e) => [e] as const))('%s alone brews its base potion', (e) => {
    const p = basePotion(POTIONS, e);
    const one = brew([drop(e, e === 'ess_color' ? 'paint_red' : undefined)], POTIONS);
    expect(one.potion).toBe(p.id);
    expect(one.strength).toBe(1);
    expect(one.durationTicks).toBe(p.durationTicks);
  });

  it('extra copies of one essence last 50 percent longer and are 25 percent stronger each', () => {
    const p = POTIONS.get('potion_giant');
    const two = brew([drop('ess_grow'), drop('ess_grow')], POTIONS);
    const three = brew([drop('ess_grow'), drop('ess_grow'), drop('ess_grow')], POTIONS);
    expect(two).toMatchObject({
      potion: 'potion_giant',
      strength: 1.25,
      durationTicks: p.durationTicks * 1.5,
    });
    expect(three).toMatchObject({
      potion: 'potion_giant',
      strength: 1.5,
      durationTicks: p.durationTicks * 2,
    });
  });

  it.each(POTIONS.all.filter((p) => p.recipe.length >= 2).map((p) => [p.id, p] as const))(
    '%s comes from its special recipe, in any order',
    (_, p) => {
      const drops = p.recipe.map((e) => drop(e, e === 'ess_color' ? 'paint_blue' : undefined));
      expect(brew(drops, POTIONS).potion).toBe(p.id);
      expect(brew([...drops].reverse(), POTIONS).potion).toBe(p.id);
    },
  );

  it.each(OPPOSITES.map(([a, b]) => [a, b] as const))('%s with %s wobbles between the two', (a, b) => {
    const w = brew([drop(a), drop(b)], POTIONS);
    expect(w.potion).toBe('potion_wobble');
    expect(w.flip).toEqual([basePotion(POTIONS, a).effect, basePotion(POTIONS, b).effect]);
  });

  it('any other pair is both base effects at 70 percent ("floaty + glow")', () => {
    const m = brew([drop('ess_float'), drop('ess_glow')], POTIONS);
    expect(m.potion).toBeNull();
    expect(m.effects).toEqual(['floaty', 'glow']);
    expect(m.strength).toBe(0.7);
  });

  it('an unlisted triple is sludge; so is anything with no essence; nothing at all is water', () => {
    expect(brew([drop('ess_hot'), drop('ess_magnet'), drop('ess_sleep')], POTIONS).potion).toBe(
      'potion_sludge',
    );
    expect(brew([drop('ess_grow'), drop(null)], POTIONS).potion).toBe('potion_sludge');
    expect(brew([], POTIONS).potion).toBe('potion_water');
  });

  it('three different colors make a rainbow; fewer mix into one paint color (rule R23)', () => {
    const rainbow = brew(
      [drop('ess_color', 'paint_red'), drop('ess_color', 'paint_blue'), drop('ess_color', 'paint_yellow')],
      POTIONS,
    );
    expect(rainbow.potion).toBe('potion_rainbow');
    const orange = brew([drop('ess_color', 'paint_red'), drop('ess_color', 'paint_yellow')], POTIONS);
    expect(orange).toMatchObject({ potion: 'potion_paint', paint: 'paint_orange' });
  });

  it('mixes paint like paint (rule R23)', () => {
    expect(mixPaint('paint_red', 'paint_yellow')).toBe('paint_orange');
    expect(mixPaint('paint_red', 'paint_blue')).toBe('paint_purple');
    expect(mixPaint('paint_blue', 'paint_yellow')).toBe('paint_green');
    expect(mixPaint('paint_red', 'paint_white')).toBe('paint_pink');
    expect(mixPaint('paint_blue', 'paint_black')).toBe('paint_navy');
    expect(mixPaint('paint_orange', 'paint_blue')).toBe('paint_brown');
    expect(mixPaint('paint_white', 'paint_black')).toBe('paint_grey');
  });
});

/** A world with the compost lab open, everyone calm. */
function labWorld(seed: string, empty = false): Sim {
  const sim = empty ? Sim.empty({ seed }) : Sim.create({ seed });
  for (const area of ['area_under_porch', 'area_compost_lab']) sim.send({ type: 'unlock', area });
  sim.step();
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  return sim;
}

function mouth(sim: Sim): { x: number; y: number } {
  return sim.cauldron.mouth()!;
}

/** Drop things into the cauldron the way the player does: a gentle drop over its mouth. */
function putIn(sim: Sim, defIds: readonly string[]): void {
  const m = mouth(sim);
  for (const defId of defIds) {
    const e = sim.spawn('item', defId, m.x, m.y - 0.6);
    sim.send({ type: 'grab', x: m.x, y: m.y - 0.6 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.entities.has(e.id), defId).toBe(false);
  }
}

/** Two full turns of the ladle, then wait for the bottle. */
function stir(sim: Sim): Entity {
  for (let i = 0; i < 16; i++) sim.send({ type: 'stir', radians: STIR_RADIANS / 16 });
  sim.step();
  sim.run(BUBBLE_TICKS + 2);
  const bottle = [...sim.entities.ofKind('item')].reverse().find((e) => sim.isPotion(e))!;
  return bottle;
}

describe('the cauldron', () => {
  it.each(POTIONS.all.filter((p) => p.recipe.length > 0).map((p) => [p.id, p] as const))(
    'brews %s from its ingredients',
    (_, p) => {
      const sim = labWorld(`brew-${p.id}`, true);
      if (p.recipe.includes('ess_moon')) sim.send({ type: 'set_time', hour: 23 });
      sim.step();
      const log = record(sim);
      putIn(
        sim,
        p.recipe.map((e) => ESSENCE_ITEM[e]),
      );
      const bottle = stir(sim);
      expect(named(log, 'potion_brewed')[0]!.potion).toBe(p.id);
      expect(bottle.brew?.potion).toBe(p.id);
      expect(sim.content.items.get(bottle.defId).potion).toBe(p.id);
      expect(sim.secrets).toContain('secret_first_potion');
      if (p.recipe.length === 3) expect(sim.secrets).toContain('secret_triple_potion');
    },
  );

  it('stirring nothing makes clear water, and a half stir makes nothing yet', () => {
    const sim = labWorld('water', true);
    const log = record(sim);
    sim.send({ type: 'stir', radians: Math.PI });
    sim.run(BUBBLE_TICKS + 5);
    expect(named(log, 'potion_brewed')).toHaveLength(0);
    const bottle = stir(sim);
    expect(bottle.brew?.potion).toBe('potion_water');
  });

  it('takes three things; a fourth bounces back out', () => {
    const sim = labWorld('full', true);
    const log = record(sim);
    putIn(sim, ['item_pebble', 'item_pebble', 'item_pebble']);
    expect(sim.cauldron.state.contents).toHaveLength(MAX_INGREDIENTS);
    const m = mouth(sim);
    const extra = sim.spawn('item', 'item_feather', m.x, m.y - 0.6);
    sim.send({ type: 'grab', x: m.x, y: m.y - 0.6 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(40);
    expect(sim.entities.has(extra.id)).toBe(true);
    expect(named(log, 'cauldron_full').length).toBeGreaterThan(0);
  });

  it('catches things tossed in from above', () => {
    const sim = labWorld('toss', true);
    const m = mouth(sim);
    const pepper = sim.spawn('item', 'item_pepper_hot', m.x - 0.3, m.y - 2.5);
    sim.run(60);
    expect(sim.entities.has(pepper.id)).toBe(false);
    expect(sim.cauldron.state.contents.map((p) => p.defId)).toEqual(['item_pepper_hot']);
  });

  it('a click tips it over and gives everything back', () => {
    const sim = labWorld('tip', true);
    const log = record(sim);
    const before = new Set(sim.entities.ofKind('item').map((e) => e.id));
    putIn(sim, ['item_feather', 'item_ice_cube']);
    const m = mouth(sim);
    sim.send({ type: 'poke', x: m.x, y: m.y });
    sim.run(30);
    expect(named(log, 'cauldron_tipped')[0]!.count).toBe(2);
    expect(sim.cauldron.state.contents).toHaveLength(0);
    const back = sim.entities.ofKind('item').filter((e) => !before.has(e.id));
    expect(back.map((e) => e.defId).sort()).toEqual(['item_feather', 'item_ice_cube']);
  });

  it('bugs close by cheer when it bubbles', () => {
    const sim = labWorld('cheer');
    const m = mouth(sim);
    const dot = bug(sim, 'bug_ladybug_dot');
    sim.physics.place(dot.id, m.x + 2, GROUND_Y - 0.6, 0);
    sim.run(30);
    const log = record(sim);
    putIn(sim, ['item_feather']);
    stir(sim);
    expect(named(log, 'cauldron_bubbled')[0]!.cheer).toContain(dot.id);
  });

  it('keeps what is in it and the stirring through a save', () => {
    const sim = labWorld('save', true);
    putIn(sim, ['item_feather', 'item_pebble']);
    sim.send({ type: 'stir', radians: Math.PI });
    sim.step();
    const loaded = reloaded(sim);
    expect(loaded.cauldron.state.contents.map((p) => p.defId)).toEqual(['item_feather', 'item_pebble']);
    expect(loaded.cauldron.state.stir).toBeCloseTo(Math.PI);
  });
});

const bug = (sim: Sim, defId: string): Entity => sim.entities.ofKind('bug').find((b) => b.defId === defId)!;

function reloaded(sim: Sim): Sim {
  const text = JSON.stringify({
    version: SAVE_VERSION,
    savedAt: 'x',
    world: sim.serialize(),
    view: { cameraX: PLAZA_X },
    meta: { createdAt: 'x', thumb: null },
  });
  return Sim.load(loadSaveFile(text).world);
}

/** A quiet plaza with Dot standing still in the open. */
function dotWorld(seed: string): { sim: Sim; dot: Entity } {
  const sim = Sim.create({ seed });
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  const dot = bug(sim, 'bug_ladybug_dot');
  sim.physics.place(dot.id, PLAZA_X + 28, GROUND_Y - 0.6, 0);
  sim.run(30);
  return { sim, dot };
}

const effectsOf = (sim: Sim, id: number): PotionEffect[] =>
  (sim.view(id)!.effects ?? []).map((e) => e.effect);

describe('drinking and shattering', () => {
  it('a potion let go at a bug’s mouth is drunk, and its effect starts', () => {
    const { sim, dot } = dotWorld('drink');
    const log = record(sim);
    const m = sim.mouthAnchor(dot.id)!;
    const bottle = sim.spawn('item', 'item_potion_glow', m.x, m.y - 0.1);
    sim.send({ type: 'grab', x: m.x, y: m.y - 0.1 });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(80);
    expect(sim.entities.has(bottle.id)).toBe(false);
    expect(named(log, 'potion_drunk')[0]).toMatchObject({ id: dot.id, potion: 'potion_glow' });
    expect(effectsOf(sim, dot.id)).toEqual(['glow']);
    expect(sim.hasTag(dot.id, 'tag_glowing')).toBe(true);
    // A drink does not fill the belly, and gets a gulp.
    expect(named(log, 'bug_reacted').some((r) => r.reaction === 'drink')).toBe(true);
  });

  it('a bottle flung at a bug breaks and splashes it for half the time', () => {
    const { sim, dot } = dotWorld('splash');
    const log = record(sim);
    const d = sim.view(dot.id)!;
    const bottle = sim.spawn('item', 'item_potion_tiny', d.x - 2, d.y - 0.1);
    sim.physics.setVelocity(bottle.id, 12, 0);
    sim.run(30);
    expect(sim.entities.has(bottle.id)).toBe(false);
    const smash = named(log, 'potion_shattered')[0]!;
    expect(smash).toMatchObject({ targetId: dot.id, applied: true });
    const fx = sim.view(dot.id)!.effects![0]!;
    expect(fx.effect).toBe('tiny');
    expect(fx.left).toBeLessThanOrEqual(POTIONS.get('potion_tiny').durationTicks / 2);
  });

  it('a bottle smashed on a thing works if it makes sense, and fizzles if not', () => {
    const sim = Sim.empty({ seed: 'things' });
    const log = record(sim);
    const marble = sim.spawn('item', 'item_marble_blue', PLAZA_X + 10, GROUND_Y - 0.2);
    sim.run(30);
    sim.potions.give(marble, sim.brewOf('potion_giant'), 'splash');
    sim.run(5);
    expect(sim.view(marble.id)!.scale).toBe(2);
    const cork = sim.spawn('item', 'item_cork', PLAZA_X + 14, GROUND_Y - 0.2);
    expect(sim.potions.give(cork, sim.brewOf('potion_opera'), 'splash')).toBe(false);
    expect(named(log, 'potion_fizzled')).toHaveLength(1);
    expect(sim.potions.give(cork, sim.brewOf('potion_glow'), 'splash')).toBe(true);
    expect(sim.hasTag(cork.id, 'tag_glowing')).toBe(false);
    sim.run(15);
    expect(sim.hasTag(cork.id, 'tag_glowing')).toBe(true);
  });
});

void ITEMS;
