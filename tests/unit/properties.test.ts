import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { MATERIALS } from '../../src/game/data/materials';
import { RULE_TICKS, STICK_BREAK } from '../../src/game/systems/environment';
import {
  PERMANENT,
  SUPPRESSED,
  addTag,
  effectiveTags,
  expireTags,
  removeTag,
  tagOn,
} from '../../src/game/systems/tags';
import { PLAZA_X, POND, POND_X } from './world';

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

const FLAT = PLAZA_X + 7;
const OPEN_X = POND_X + 14.9;

/** An empty world with items resting side by side on flat plaza ground, touching. */
function touching(a: string, b: string): { sim: Sim; a: number; b: number; log: Logged[] } {
  const sim = Sim.empty({ seed: `${a}-${b}` });
  const ea = sim.spawn('item', a, FLAT, GROUND_Y - 0.6);
  sim.run(40);
  const eb = sim.spawn('item', b, FLAT, GROUND_Y - 1.4);
  const log = record(sim);
  return { sim, a: ea.id, b: eb.id, log };
}

const calm = (sim: Sim, id: number): void => {
  const brain = sim.entities.get(id)!.bug!;
  brain.needs = { need_hunger: 100, need_fun: 100, need_energy: 100, need_social: 80, need_clean: 90 };
};

describe('tag state', () => {
  const defaults = ['tag_sticky', 'tag_edible'];

  it('reads defaults, timed tags, and permanent tags', () => {
    const state: Record<string, number> = {};
    expect(tagOn(state, defaults, 'tag_sticky', 0)).toBe(true);
    expect(tagOn(state, defaults, 'tag_wet', 0)).toBe(false);
    expect(addTag(state, defaults, 'tag_wet', 0, 1)).toBe(true);
    expect(tagOn(state, defaults, 'tag_wet', 59)).toBe(true);
    expect(tagOn(state, defaults, 'tag_wet', 60)).toBe(false);
    addTag(state, defaults, 'tag_fuzzy', 0, null);
    expect(state.tag_fuzzy).toBe(PERMANENT);
    expect(effectiveTags(state, defaults, 10)).toEqual(['tag_edible', 'tag_fuzzy', 'tag_sticky', 'tag_wet']);
  });

  it('never shortens a timed tag, and uses each tag its usual time', () => {
    const state: Record<string, number> = {};
    addTag(state, [], 'tag_wet', 0);
    expect(state.tag_wet).toBe(30 * 60);
    addTag(state, [], 'tag_wet', 10, 1);
    expect(state.tag_wet).toBe(30 * 60);
  });

  it('suppresses defaults for good, or for a while, and brings them back', () => {
    const state: Record<string, number> = {};
    expect(removeTag(state, defaults, 'tag_edible', 0)).toBe(true);
    expect(state.tag_edible).toBe(SUPPRESSED);
    removeTag(state, defaults, 'tag_sticky', 0, 2);
    expect(tagOn(state, defaults, 'tag_sticky', 100)).toBe(false);
    const { lost, returned } = expireTags(state, defaults, 120);
    expect(lost).toEqual([]);
    expect(returned).toEqual(['tag_sticky']);
    expect(tagOn(state, defaults, 'tag_sticky', 121)).toBe(true);
    expect(tagOn(state, defaults, 'tag_edible', 121)).toBe(false);
  });

  it('reports tags that wear off', () => {
    const state: Record<string, number> = {};
    addTag(state, [], 'tag_hot', 0, 1);
    expect(expireTags(state, [], 30).lost).toEqual([]);
    expect(expireTags(state, [], 60).lost).toEqual(['tag_hot']);
    expect(state).toEqual({});
  });

  it('items get their material tags, and bugs start with none', () => {
    const sim = Sim.empty();
    const cap = sim.spawn('item', 'item_bottle_cap', FLAT, 7);
    const sponge = sim.spawn('item', 'item_sponge', FLAT + 2, 7);
    const dot = sim.spawn('bug', 'bug_ladybug_dot', FLAT + 4, 7);
    expect(sim.tagsOf(cap.id)).toEqual(expect.arrayContaining([...MATERIALS.mat_metal.tags]));
    expect(sim.tagsOf(sponge.id)).toEqual(expect.arrayContaining(['tag_absorbent', 'tag_light']));
    expect(sim.tagsOf(dot.id)).toEqual([]);
  });
});

describe('R1: water gets things wet and washes them (M3 acceptance)', () => {
  it('anything entering water gains tag_wet and loses painted, smelly, sticky, slimy, and hot', () => {
    const sim = Sim.empty({ seed: 'wash' });
    const log = record(sim);
    const banana = sim.spawn('item', 'item_rotten_banana_bit', OPEN_X - 1.2, POND.level - 1);
    const gum = sim.spawn('item', 'item_gum_blob', OPEN_X, POND.level - 1);
    const cork = sim.spawn('item', 'item_cork', OPEN_X + 1.2, POND.level - 1);
    const pepper = sim.spawn('item', 'item_pepper_hot', POND_X + 20.5, POND.level - 1);
    sim.send({ type: 'set_tag', id: cork.id, tag: 'tag_painted', on: true });
    sim.step();
    expect(sim.hasTag(cork.id, 'tag_painted')).toBe(true);
    sim.run(90);
    for (const id of [banana.id, gum.id, cork.id, pepper.id])
      expect(sim.hasTag(id, 'tag_wet'), `${id}`).toBe(true);
    expect(sim.hasTag(banana.id, 'tag_smelly')).toBe(false);
    expect(sim.hasTag(banana.id, 'tag_slimy')).toBe(false);
    expect(sim.hasTag(gum.id, 'tag_sticky')).toBe(false);
    expect(sim.hasTag(cork.id, 'tag_painted')).toBe(false);
    expect(sim.hasTag(pepper.id, 'tag_hot')).toBe(false);
    expect(find(log, 'steamed').some((s) => s.id === pepper.id)).toBe(true);
    expect(
      find(log, 'tag_lost').some((t) => t.id === banana.id && t.tag === 'tag_smelly' && t.cause === 'water'),
    ).toBe(true);
  });

  it('wet dries 30 s after leaving the water, and washed gum is sticky again once dry', () => {
    const sim = Sim.empty({ seed: 'dry' });
    const gum = sim.spawn('item', 'item_gum_blob', OPEN_X, POND.level - 1);
    sim.run(60);
    expect(sim.hasTag(gum.id, 'tag_wet')).toBe(true);
    sim.physics.place(gum.id, PLAZA_X + 3, GROUND_Y - 0.25, 0);
    sim.run(28 * 60);
    expect(sim.hasTag(gum.id, 'tag_wet')).toBe(true);
    sim.run(3 * 60);
    expect(sim.hasTag(gum.id, 'tag_wet')).toBe(false);
    expect(sim.hasTag(gum.id, 'tag_sticky')).toBe(true);
  });

  it('wet things grip less, and frozen things slide', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', FLAT, GROUND_Y - 0.21);
    const base = sim.physics.friction(pebble.id);
    sim.send({ type: 'set_tag', id: pebble.id, tag: 'tag_wet', on: true });
    sim.step();
    expect(sim.physics.friction(pebble.id)).toBeCloseTo(base * 0.7);
    sim.send({ type: 'set_tag', id: pebble.id, tag: 'tag_frozen', on: true });
    sim.step();
    expect(sim.physics.friction(pebble.id)).toBeCloseTo(base * 0.05);
  });
});

describe('R2: hot meets wet (M3 acceptance)', () => {
  it('tag_wet + tag_hot contact removes both within 250 ms, with steam', () => {
    const { sim, a, b, log } = touching('item_sponge', 'item_pepper_hot');
    sim.send({ type: 'set_tag', id: a, tag: 'tag_wet', on: true });
    // Wait for the pepper to land on the sponge.
    let touchedAt = -1;
    for (let t = 0; t < 120 && touchedAt < 0; t++) {
      sim.step();
      if (sim.physics.touchingPairs().some(([x, y]) => x === a && y === b)) touchedAt = sim.tick;
    }
    expect(touchedAt).toBeGreaterThan(0);
    sim.run(RULE_TICKS);
    expect(sim.hasTag(a, 'tag_wet')).toBe(false);
    expect(sim.hasTag(b, 'tag_hot')).toBe(false);
    const [steam] = find(log, 'steamed');
    expect(steam).toMatchObject({ id: b, otherId: a });
    expect(find(log, 'steamed')[0]).toBeDefined();
    const at = log.find((e) => e.name === 'steamed')!.tick;
    expect(at - touchedAt).toBeLessThanOrEqual(RULE_TICKS);
  });

  it('a hot thing that gets wet steams on its own', () => {
    const sim = Sim.empty();
    const log = record(sim);
    const pepper = sim.spawn('item', 'item_pepper_hot', FLAT, GROUND_Y - 0.2);
    sim.send({ type: 'set_tag', id: pepper.id, tag: 'tag_wet', on: true });
    sim.step();
    expect(sim.tagsOf(pepper.id)).not.toContain('tag_hot');
    expect(sim.tagsOf(pepper.id)).not.toContain('tag_wet');
    expect(find(log, 'steamed')).toHaveLength(1);
  });
});

describe('R3, R4: cold freezes wet things, heat melts them', () => {
  it('a wet thing touching a cold one freezes; heat thaws it back to wet', () => {
    const { sim, a, b, log } = touching('item_sponge', 'item_mint_leaf');
    sim.send({ type: 'set_tag', id: a, tag: 'tag_wet', on: true });
    sim.run(90);
    expect(sim.hasTag(a, 'tag_frozen')).toBe(true);
    expect(sim.hasTag(a, 'tag_wet')).toBe(false);
    expect(sim.hasTag(b, 'tag_cold')).toBe(true);
    expect(find(log, 'froze')).toMatchObject([{ id: a }]);
    sim.send({ type: 'set_tag', id: b, tag: 'tag_hot', on: true });
    sim.run(RULE_TICKS * 2);
    expect(sim.hasTag(a, 'tag_frozen')).toBe(false);
    expect(find(log, 'thawed')).toMatchObject([{ id: a }]);
    // Melted to wet, and the heat right next to it then steams it dry (R2).
    expect(find(log, 'tag_gained').some((t) => t.id === a && t.tag === 'tag_wet' && t.cause === 'thaw')).toBe(
      true,
    );
    expect(find(log, 'steamed').some((e) => e.otherId === a)).toBe(true);
  });

  it('a frozen bug stays put in its ice block for 4 s, then thaws wet', () => {
    const sim = Sim.empty({ seed: 'ice-bug' });
    const dot = sim.spawn('bug', 'bug_ladybug_dot', FLAT, GROUND_Y - 0.6);
    sim.run(30);
    calm(sim, dot.id);
    const log = record(sim);
    sim.send({ type: 'set_tag', id: dot.id, tag: 'tag_wet', on: true });
    sim.step();
    sim.environment.freeze(dot.id);
    const x = sim.view(dot.id)!.x;
    sim.entities.get(dot.id)!.bug!.mode = 'st_wander';
    sim.entities.get(dot.id)!.bug!.targetX = x + 5;
    sim.run(3.5 * 60);
    expect(sim.hasTag(dot.id, 'tag_frozen')).toBe(true);
    expect(Math.abs(sim.view(dot.id)!.x - x)).toBeLessThan(0.2);
    sim.run(60);
    expect(sim.hasTag(dot.id, 'tag_frozen')).toBe(false);
    expect(sim.hasTag(dot.id, 'tag_wet')).toBe(true);
    expect(find(log, 'thawed')).toHaveLength(1);
  });
});

describe('R5: a cold thing freezes the water it touches', () => {
  it('the mint leaf lands in the pond and freezes a 2 m ice sheet that melts after 30 s', () => {
    const sim = Sim.empty({ seed: 'rink' });
    const log = record(sim);
    const mint = sim.spawn('item', 'item_mint_leaf', OPEN_X, POND.level - 1.2);
    sim.run(90);
    const [ice] = find(log, 'ice_formed');
    expect(ice).toBeDefined();
    expect(ice!.x1 - ice!.x0).toBeCloseTo(2, 1);
    expect(sim.environment.overOpenWater(OPEN_X)).toBe(false);
    // The leaf rests on the ice, not in the water.
    expect(sim.view(mint.id)!.submerged).toBe(0);
    // A bug can stand on the ice.
    const dot = sim.spawn('bug', 'bug_ladybug_dot', OPEN_X + 0.6, POND.level - 1.5);
    calm(sim, dot.id);
    sim.run(60);
    expect(sim.view(dot.id)!.bug!.mode).not.toBe('st_swim');
    sim.run(30 * 60);
    expect(find(log, 'ice_melted')).toHaveLength(1);
    expect(sim.environment.state.ice).toEqual([]);
  });
});

describe('R6: sticky things weld on contact (M3 acceptance)', () => {
  const stuckPair = () => {
    const { sim, a, b, log } = touching('item_pebble', 'item_gum_blob');
    sim.run(60);
    expect(sim.environment.stuckTogether(a, b)).toBe(true);
    expect(find(log, 'stuck')).toMatchObject([{ a: b, b: a }]);
    return { sim, pebble: a, gum: b, log };
  };

  const dragAt = (sim: Sim, id: number, speed: number, ticks: number): void => {
    const v = sim.view(id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    let x = v.x;
    for (let i = 0; i < ticks; i++) {
      x += speed / 60;
      sim.send({ type: 'drag', x, y: v.y });
      sim.step();
    }
  };

  it('a weld holds when pulled gently: carry one and the other comes along', () => {
    const { sim, pebble, gum, log } = stuckPair();
    const start = sim.view(pebble)!.x;
    dragAt(sim, gum, 3, 60);
    expect(sim.environment.stuckTogether(pebble, gum)).toBe(true);
    expect(sim.view(pebble)!.x - start).toBeGreaterThan(1.5);
    expect(find(log, 'unstuck')).toEqual([]);
  });

  it('a weld breaks when yanked faster than 900 px/s', () => {
    const { sim, pebble, gum, log } = stuckPair();
    dragAt(sim, gum, STICK_BREAK + 3, 20);
    expect(sim.environment.stuckTogether(pebble, gum)).toBe(false);
    expect(find(log, 'unstuck')).toHaveLength(1);
  });

  it('a hard fling tears a weld too', () => {
    const { sim, pebble, gum } = stuckPair();
    const v = sim.view(gum)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.run(5);
    sim.send({ type: 'release', vx: 18, vy: -6 });
    sim.run(10);
    expect(sim.environment.stuckTogether(pebble, gum)).toBe(false);
  });

  it('welds survive a save and load', () => {
    const { sim, pebble, gum } = stuckPair();
    const loaded = Sim.load(JSON.parse(JSON.stringify(sim.serialize())));
    expect(loaded.environment.stuckTogether(pebble, gum)).toBe(true);
    loaded.run(30);
  });

  it('soap unsticks gum and washes the stink off things it touches', () => {
    const { sim, pebble, gum, log } = stuckPair();
    const soap = sim.spawn('item', 'item_soap_sliver', sim.view(gum)!.x, GROUND_Y - 2);
    sim.run(90);
    expect(sim.hasTag(gum, 'tag_sticky')).toBe(false);
    expect(sim.environment.stuckTogether(pebble, gum)).toBe(false);
    expect(find(log, 'tag_lost').some((t) => t.id === gum && t.cause === 'soap')).toBe(true);
    void soap;
  });

  it('bugs stuck to gum wriggle loose after a while', () => {
    const sim = Sim.empty({ seed: 'bug-gum' });
    const dot = sim.spawn('bug', 'bug_ladybug_dot', FLAT, GROUND_Y - 0.6);
    sim.run(30);
    calm(sim, dot.id);
    const log = record(sim);
    sim.spawn('item', 'item_gum_blob', FLAT, GROUND_Y - 2);
    sim.run(60);
    expect(find(log, 'stuck')).toHaveLength(1);
    sim.run(7 * 60);
    expect(find(log, 'unstuck')).toHaveLength(1);
  });
});

describe('R7: soap and water blow bubbles', () => {
  it('a wet soap sliver blows bubbles every half second', () => {
    const sim = Sim.empty({ seed: 'bubbles' });
    const soap = sim.spawn('item', 'item_soap_sliver', FLAT, GROUND_Y - 0.1);
    sim.run(20);
    const log = record(sim);
    sim.run(120);
    expect(find(log, 'bubbles_blown')).toEqual([]);
    sim.send({ type: 'set_tag', id: soap.id, tag: 'tag_wet', on: true });
    sim.run(121);
    const blown = log.filter((e) => e.name === 'bubbles_blown');
    expect(blown.length).toBe(4);
    expect(blown[1]!.tick - blown[0]!.tick).toBe(RULE_TICKS * 2);
  });

  it('the bubble wand blows a trail when waved wet', () => {
    const sim = Sim.empty({ seed: 'wand' });
    const wand = sim.spawn('item', 'item_bubble_wand', FLAT, GROUND_Y - 0.1);
    sim.run(20);
    const log = record(sim);
    const v = sim.view(wand.id)!;
    sim.send({ type: 'set_tag', id: wand.id, tag: 'tag_wet', on: true });
    sim.send({ type: 'grab', x: v.x, y: v.y });
    for (let i = 0; i < 60; i++) {
      sim.send({ type: 'drag', x: v.x + Math.sin(i / 6) * 2, y: 6 });
      sim.step();
    }
    expect(find(log, 'bubbles_blown').filter((b) => b.id === wand.id).length).toBeGreaterThan(3);
  });
});

describe('R8: stink', () => {
  it('bugs that dislike stink hold their nose and walk away; Rollo sniffs happily', () => {
    const sim = Sim.empty({ seed: 'stink' });
    const dot = sim.spawn('bug', 'bug_ladybug_dot', FLAT, GROUND_Y - 0.6);
    const rollo = sim.spawn('bug', 'bug_pillbug_rollo', FLAT + 2.2, GROUND_Y - 0.6);
    sim.run(30);
    calm(sim, dot.id);
    calm(sim, rollo.id);
    const log = record(sim);
    sim.spawn('item', 'item_rotten_banana_bit', FLAT + 1.1, GROUND_Y - 0.25);
    sim.run(RULE_TICKS * 2);
    const smelled = find(log, 'bug_smelled');
    expect(smelled.find((s) => s.id === dot.id)).toMatchObject({ liked: false });
    expect(smelled.find((s) => s.id === rollo.id)).toMatchObject({ liked: true });
    const reactions = find(log, 'bug_reacted').filter((r) => r.reaction === 'stink');
    expect(reactions.map((r) => r.id).sort()).toEqual([dot.id, rollo.id].sort());
    expect(sim.view(rollo.id)!.bug!.mode).toBe('st_react');
    const x0 = sim.view(dot.id)!.x;
    sim.run(90);
    expect(sim.view(dot.id)!.x).toBeLessThan(x0 - 0.8);
    // Not again right away.
    sim.run(RULE_TICKS * 4);
    expect(find(log, 'bug_smelled').filter((s) => s.id === rollo.id)).toHaveLength(1);
  });

  it('stink soaks into absorbent things it touches', () => {
    const { sim, a, log } = touching('item_moss_tuft', 'item_rotten_banana_bit');
    sim.run(60);
    expect(sim.hasTag(a, 'tag_smelly')).toBe(true);
    expect(
      find(log, 'tag_gained').some((t) => t.id === a && t.tag === 'tag_smelly' && t.cause === 'stink'),
    ).toBe(true);
  });
});

describe('R9: sparky things zap the water', () => {
  it('bugs in electrified water get fuzzy hair', () => {
    const sim = Sim.empty({ seed: 'zap' });
    const dot = sim.spawn('bug', 'bug_ladybug_dot', OPEN_X, POND.level - 1);
    const cork = sim.spawn('item', 'item_cork', POND_X + 20.3, POND.level - 1);
    sim.send({ type: 'set_tag', id: cork.id, tag: 'tag_sparky', on: true });
    const log = record(sim);
    sim.run(60);
    expect(find(log, 'water_zapped').length).toBeGreaterThanOrEqual(1);
    expect(sim.hasTag(dot.id, 'tag_fuzzy')).toBe(true);
  });
});

describe('R10: magnets', () => {
  it('pull magnetic metal within 2.5 m with a clink, and ignore stone', () => {
    const sim = Sim.empty({ seed: 'magnet' });
    const magnet = sim.spawn('item', 'item_magnet', FLAT, GROUND_Y - 0.25);
    const cap = sim.spawn('item', 'item_bottle_cap', FLAT + 1.6, GROUND_Y - 0.1);
    const far = sim.spawn('item', 'item_bottle_cap', FLAT + 3.5, GROUND_Y - 0.1);
    const pebble = sim.spawn('item', 'item_pebble', FLAT - 1.4, GROUND_Y - 0.21);
    sim.run(20);
    const log = record(sim);
    const p0 = sim.view(pebble.id)!.x;
    const f0 = sim.view(far.id)!.x;
    sim.run(120);
    const m = sim.view(magnet.id)!;
    expect(Math.abs(sim.view(cap.id)!.x - m.x)).toBeLessThan(0.6);
    expect(find(log, 'magnet_snapped').some((s) => s.id === cap.id && s.magnetId === magnet.id)).toBe(true);
    expect(sim.view(pebble.id)!.x).toBeCloseTo(p0, 2);
    expect(sim.view(far.id)!.x).toBeCloseTo(f0, 2);
  });
});

describe('R14: wind blows light things', () => {
  it('pushes leaves along and leaves pebbles alone', () => {
    const sim = Sim.empty({ seed: 'wind' });
    const leaf = sim.spawn('item', 'item_leaf', FLAT, GROUND_Y - 0.1);
    const pebble = sim.spawn('item', 'item_pebble', FLAT + 3, GROUND_Y - 0.21);
    sim.run(30);
    const l0 = sim.view(leaf.id)!.x;
    const p0 = sim.view(pebble.id)!.x;
    sim.send({ type: 'set_weather', wind: -2, rain: false });
    sim.run(120);
    expect(sim.view(leaf.id)!.x).toBeLessThan(l0 - 0.5);
    expect(sim.view(pebble.id)!.x).toBeCloseTo(p0, 2);
  });
});

describe('R15: rain', () => {
  it('soaks everything under the sky after 5 s', () => {
    const sim = Sim.empty({ seed: 'rain' });
    const pebble = sim.spawn('item', 'item_pebble', FLAT, GROUND_Y - 0.21);
    const dot = sim.spawn('bug', 'bug_ladybug_dot', FLAT + 3, GROUND_Y - 0.6);
    sim.send({ type: 'set_weather', wind: 0, rain: true });
    sim.run(4 * 60);
    expect(sim.hasTag(pebble.id, 'tag_wet')).toBe(false);
    sim.run(1.5 * 60);
    expect(sim.hasTag(pebble.id, 'tag_wet')).toBe(true);
    expect(sim.hasTag(dot.id, 'tag_wet')).toBe(true);
  });
});

describe('R18: wringing out a sponge', () => {
  it('a shaken wet sponge drips onto what is below and dries out', () => {
    const sim = Sim.empty({ seed: 'wring' });
    const pepper = sim.spawn('item', 'item_pepper_hot', FLAT, GROUND_Y - 0.1);
    const sponge = sim.spawn('item', 'item_sponge', FLAT + 3, GROUND_Y - 0.2);
    sim.run(20);
    sim.send({ type: 'set_tag', id: sponge.id, tag: 'tag_wet', on: true });
    const s = sim.view(sponge.id)!;
    sim.send({ type: 'grab', x: s.x, y: s.y });
    for (let i = 0; i < 40; i++) {
      sim.send({ type: 'drag', x: FLAT, y: GROUND_Y - 2 });
      sim.step();
    }
    const log = record(sim);
    sim.send({ type: 'shake' });
    sim.step();
    expect(find(log, 'wrung_out')).toMatchObject([{ id: sponge.id, tag: 'tag_wet' }]);
    expect(sim.hasTag(sponge.id, 'tag_wet')).toBe(false);
    // Water on the hot pepper: steam.
    expect(find(log, 'steamed').some((e) => e.id === pepper.id)).toBe(true);
    expect(sim.hasTag(pepper.id, 'tag_hot')).toBe(false);
  });

  it('a sponge soaks up soap and spreads it', () => {
    const { sim, a } = touching('item_sponge', 'item_soap_sliver');
    sim.run(60);
    expect(sim.hasTag(a, 'tag_soapy')).toBe(true);
  });
});

describe('eating leaves marks', () => {
  const feed = (bugId: string, food: string) => {
    const sim = Sim.empty({ seed: `eat-${food}` });
    const bug = sim.spawn('bug', bugId, FLAT, GROUND_Y - 0.6);
    sim.run(30);
    const brain = sim.entities.get(bug.id)!.bug!;
    brain.mode = 'st_idle';
    brain.timer = 100000;
    brain.decideIn = 100000;
    brain.facing = 1;
    const m = sim.mouthAnchor(bug.id)!;
    const item = sim.spawn('item', food, m.x, m.y - 0.25);
    sim.send({ type: 'grab', x: m.x, y: m.y - 0.25 });
    for (let i = 0; i < 20; i++) {
      sim.send({ type: 'drag', x: m.x, y: m.y });
      sim.step();
    }
    const log = record(sim);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(find(log, 'bug_fed')).toHaveLength(1);
    return { sim, bug: bug.id, item: item.id, log };
  };

  it('hot food makes the eater hot for a while', () => {
    const { sim, bug } = feed('bug_ladybug_dot', 'item_pepper_hot');
    sim.run(150);
    expect(sim.hasTag(bug, 'tag_hot')).toBe(true);
    sim.run(21 * 60);
    expect(sim.hasTag(bug, 'tag_hot')).toBe(false);
  });

  it('a jelly bean makes the eater hop once, on its own', () => {
    const { sim, bug, log } = feed('bug_ladybug_dot', 'item_jelly_bean');
    sim.run(4 * 60);
    expect(find(log, 'bug_ate')).toHaveLength(1);
    expect(find(log, 'bug_hopped').filter((h) => h.id === bug)).toHaveLength(1);
  });

  it('Glorp loves soap and burps bubbles', () => {
    const { sim, log } = feed('bug_snail_glorp', 'item_soap_sliver');
    sim.run(5 * 60);
    expect(find(log, 'bug_ate')[0]).toMatchObject({ liking: 'loved' });
    expect(find(log, 'bug_burped')).toHaveLength(1);
  });
});

describe('saves', () => {
  it('keep tags, the hose, ice, and soggy paper through a save and load', () => {
    const sim = Sim.create({ seed: 'keep' });
    const cork = sim.entities.all().find((e) => e.defId === 'item_cork')!;
    sim.send({ type: 'set_tag', id: cork.id, tag: 'tag_painted', on: true, seconds: 100 });
    const tap = sim.environment.fixtureAt(POND_X + 25.1, 7.95)!;
    sim.send({ type: 'poke', x: tap.x, y: tap.y });
    sim.spawn('item', 'item_mint_leaf', POND_X + 20.3, POND.level - 1);
    sim.run(120);
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    const file = loadSaveFile({
      version: SAVE_VERSION,
      savedAt: 'now',
      world: save,
      view: { cameraX: 3 },
      meta: { createdAt: 'now', thumb: null },
    });
    const loaded = Sim.load(file.world);
    expect(loaded.tagsOf(cork.id)).toEqual(sim.tagsOf(cork.id));
    expect(loaded.environment.state.hoseOn).toBe(true);
    expect(loaded.environment.state.ice).toEqual(sim.environment.state.ice);
    const boat = sim.entities.all().find((e) => e.defId === 'item_paper_boat')!;
    expect(loaded.entities.get(boat.id)!.soak).toBe(sim.entities.get(boat.id)!.soak);
    loaded.run(60);
  });

  it('rejects bad tags and pond state', () => {
    const sim = Sim.create({ seed: 'bad' });
    const world = JSON.parse(JSON.stringify(sim.serialize()));
    world.entities[0].tags = { tag_wet: 'soon' };
    world.env.ice = [{ x0: 1 }];
    expect(() =>
      loadSaveFile({ version: SAVE_VERSION, savedAt: 'now', world, view: { cameraX: 3 } }),
    ).toThrow(/tags is invalid.*ice is invalid/);
  });

  it('migrates a version 3 save: everything moves right by the pond width', () => {
    const v3 = {
      version: 3,
      savedAt: '2026-06-01T00:00:00.000Z',
      view: { cameraX: 3 },
      world: {
        seed: 'm2',
        tick: 500,
        rng: [1, 2, 3, 4],
        nextId: 3,
        entities: [
          {
            id: 1,
            kind: 'bug',
            defId: 'bug_ladybug_dot',
            body: { x: 7, y: 8.4, angle: 0, vx: 0, vy: 0, av: 0 },
            bug: {
              mode: 'st_wander',
              timer: 50,
              targetX: 9,
              targetId: null,
              action: null,
              facing: 1,
              needs: { need_hunger: 70, need_fun: 70, need_energy: 80, need_social: 80, need_clean: 90 },
              decideIn: 30,
              airPeak: 0,
              selfLaunched: false,
              lastHardLanding: -1,
              dizzyStreak: 0,
              dizzyTicks: 0,
              used: [],
              stuck: 0,
              tries: 0,
              done: false,
              lastX: 7,
              mouthful: null,
              reaction: null,
              variants: {},
              grumpyUntil: -1,
              burpAt: -1,
              tickle: 0,
              woozyUntil: -1,
            },
          },
          {
            id: 2,
            kind: 'item',
            defId: 'item_berry_red',
            body: { x: 19.5, y: 3.8, angle: 0, vx: 0, vy: 0, av: 0 },
          },
        ],
      },
    };
    const save = loadSaveFile(JSON.stringify(v3));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.view.cameraX).toBe(3 + PLAZA_X);
    const [dot, berry] = save.world.entities;
    expect(dot!.body.x).toBe(7 + PLAZA_X);
    expect(dot!.bug).toMatchObject({ targetX: 9 + PLAZA_X, lastX: 7 + PLAZA_X, smelledAt: -1, hopAt: -1 });
    // The berry that was on the stump is still on the stump.
    expect(berry!.body.x).toBe(19.5 + PLAZA_X);
    const sim = Sim.load(save.world);
    sim.run(60);
    expect(sim.view(2)!.y).toBeLessThan(4.2);
  });
});
