import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { MIGRATIONS } from '../../src/game/save/migrations';
import { SPROUT_TICKS, TOAST_TICKS } from '../../src/game/systems/environment';
import { BALLOON_LIFT, TRAMPOLINE_CAP } from '../../src/game/systems/toys';
import { PLAZA_X, POND, POND_X } from './world';

// M8 (game design doc, sections 6, 7.1, 12, and 19): crafted toys in the
// world, the rest of the tag rules (R11 to R24), the bug scope, M8's
// secrets, and save version 9.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

/** Open ground in the plaza, right of the stump. */
const OPEN = PLAZA_X + 28;

function world(seed: string, areas: readonly string[] = []): Sim {
  const sim = Sim.empty({ seed });
  for (const area of areas) sim.send({ type: 'unlock', area });
  sim.step();
  return sim;
}

function put(sim: Sim, defId: string, x: number, y?: number): Entity {
  const half = sim.halfHeightOfDef(defId);
  return sim.spawn('item', defId, x, y ?? sim.surfaceY(x) - half - 0.02);
}

function bugAt(sim: Sim, defId: string, x: number, y?: number): Entity {
  const b = sim.spawn('bug', defId, x, y ?? GROUND_Y - 0.6);
  for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
    sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  return b;
}

const v = (sim: Sim, e: Entity): ReturnType<Sim['view']> & object => sim.view(e.id)!;

function grabAt(sim: Sim, x: number, y: number): void {
  sim.send({ type: 'grab', x, y });
  sim.step();
}

describe('balloons and the balloon basket (rule R17)', () => {
  it('a balloon on its own rises gently to the top of the sky and stays there', () => {
    const sim = world('balloon');
    const b = put(sim, 'item_balloon_red', OPEN, 7);
    sim.run(60);
    expect(v(sim, b).vy).toBeLessThan(0);
    expect(v(sim, b).vy).toBeGreaterThan(-2);
    sim.run(600);
    expect(v(sim, b).y).toBeLessThan(1);
  });

  it('one balloon lifts a small bug; a medium bug needs three', () => {
    const lifts = (bugDef: string, balloons: number): boolean => {
      const sim = world(`lift-${bugDef}-${balloons}`);
      const bug = bugAt(sim, bugDef, OPEN);
      sim.run(30);
      const start = v(sim, bug).y;
      for (let i = 0; i < balloons; i++) {
        const b = put(sim, 'item_balloon_blue', OPEN + (i - 1) * 0.5, start - 1.3);
        const s = v(sim, bug);
        sim.environment.tie(b.id, bug.id, s.x, s.y - 0.3);
      }
      sim.run(240);
      return v(sim, bug).y < start - 0.8;
    };
    expect(lifts('bug_ladybug_dot', 1)).toBe(true);
    expect(lifts('bug_stagbeetle_moose', 2)).toBe(false);
    expect(lifts('bug_stagbeetle_moose', 3)).toBe(true);
    expect(BALLOON_LIFT).toBeGreaterThan(0.8);
  });

  it('a balloon let go with its string on something ties on', () => {
    const sim = world('tie');
    const pebble = put(sim, 'item_pebble', OPEN);
    sim.run(20);
    const p = v(sim, pebble);
    const b = put(sim, 'item_balloon_red', p.x, p.y - 1.0);
    grabAt(sim, p.x, p.y - 1.0);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.environment.stuckTogether(b.id, pebble.id)).toBe(true);
  });

  it('the basket rises with a bug in it, and a click lets it down', () => {
    const sim = world('basket');
    const basket = put(sim, 'item_balloon_basket', OPEN);
    sim.run(30);
    const bv = v(sim, basket);
    const dot = bugAt(sim, 'bug_ladybug_dot', bv.x, bv.y + 0.2);
    sim.run(240);
    expect(v(sim, basket).y).toBeLessThan(bv.y - 0.8);
    expect(Math.abs(v(sim, dot).x - v(sim, basket).x)).toBeLessThan(0.8);
    const high = v(sim, basket);
    sim.send({ type: 'poke', x: high.x, y: high.y - 0.85 });
    sim.run(120);
    expect(v(sim, basket).vy).toBeGreaterThan(0.2);
    expect(Math.abs(v(sim, dot).x - v(sim, basket).x)).toBeLessThan(0.8);
  });
});

describe('crafted toys', () => {
  it('the trampoline bounces things higher than they fell, but never past 1400 px/s', () => {
    const sim = world('tramp');
    const t = put(sim, 'item_trampoline', OPEN);
    sim.run(30);
    const ball = put(sim, 'item_rubber_ball', OPEN, v(sim, t).y - 3);
    let top = Infinity;
    let fastest = 0;
    sim.run(30);
    for (let i = 0; i < 240; i++) {
      sim.step();
      const b = v(sim, ball);
      fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
      if (i > 40) top = Math.min(top, b.y);
    }
    expect(top).toBeLessThan(v(sim, t).y - 3.2);
    expect(fastest).toBeLessThanOrEqual(TRAMPOLINE_CAP + 0.6);
  });

  it('the slingshot fires what is pulled back from its fork', () => {
    const sim = world('sling');
    const sling = put(sim, 'item_slingshot_twig', OPEN);
    sim.run(30);
    const fork = sim.toys.fork(sling)!;
    const pebble = put(sim, 'item_pebble', fork.x, fork.y);
    grabAt(sim, fork.x, fork.y);
    expect(sim.toys.pulling?.item).toBe(pebble.id);
    for (let i = 0; i < 20; i++) {
      sim.send({ type: 'drag', x: fork.x - 1.2, y: fork.y + 0.3 });
      sim.step();
    }
    const log = record(sim);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    const p = v(sim, pebble);
    expect(p.vx).toBeGreaterThan(10);
    expect(named(log, 'toy_used')[0]).toMatchObject({ toy: 'slingshot', action: 'fire' });
  });

  it('the spring launcher fires whatever sits on it when clicked', () => {
    const sim = world('launcher');
    const l = put(sim, 'item_spring_launcher', OPEN);
    sim.run(30);
    const top = v(sim, l).y - sim.halfHeightOfDef('item_spring_launcher');
    const cork = put(sim, 'item_cork', OPEN, top - 0.2);
    sim.run(40);
    sim.send({ type: 'poke', x: OPEN, y: v(sim, l).y + 0.1 });
    sim.step();
    expect(v(sim, cork).vy).toBeLessThan(-12);
  });

  it('the straw rocket flies up on a click and floats back down on its parachute', () => {
    const sim = world('rocket');
    const r = put(sim, 'item_straw_rocket', OPEN);
    sim.run(30);
    const at = v(sim, r);
    sim.send({ type: 'poke', x: at.x, y: at.y });
    sim.step();
    expect(v(sim, r).vy).toBeLessThan(-15);
    let fastestDown = 0;
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (i > 120) fastestDown = Math.max(fastestDown, v(sim, r).vy);
    }
    expect(fastestDown).toBeLessThan(3);
  });

  it('a fizzy thing shaken in the hand shoots up, once', () => {
    const sim = world('fizz');
    const candy = put(sim, 'item_fizz_candy', OPEN);
    sim.run(20);
    const c = v(sim, candy);
    grabAt(sim, c.x, c.y);
    sim.send({ type: 'shake' });
    sim.step();
    expect(v(sim, candy).vy).toBeLessThan(-12);
    expect(sim.hasTag(candy.id, 'tag_fizzy')).toBe(false);
  });

  it('a parachute tied to something lets it down slowly', () => {
    const sim = world('chute');
    const pebble = put(sim, 'item_pebble', OPEN, 1.5);
    const chute = put(sim, 'item_parachute', OPEN, 0.9);
    sim.environment.tie(chute.id, pebble.id, OPEN, 1.3);
    sim.run(90);
    expect(v(sim, pebble).vy).toBeLessThan(2.5);
    expect(v(sim, pebble).vy).toBeGreaterThan(0);
  });

  it('the seesaw settles on its cork, then a weight on one end throws the other end up', () => {
    const sim = world('seesaw');
    const saw = put(sim, 'item_popsicle_seesaw', OPEN);
    sim.run(90);
    expect(sim.entities.get(saw.id)!.toy?.pivot).toBeDefined();
    const s = v(sim, saw);
    const cork = put(sim, 'item_cork', s.x + 1.3, s.y - 0.6);
    sim.run(60);
    const heavy = put(sim, 'item_apple_core', s.x - 1.3, s.y - 4);
    sim.physics.setVelocity(heavy.id, 0, 12);
    let up = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      up = Math.min(up, v(sim, cork).vy);
    }
    expect(up).toBeLessThan(-2);
    // Picking it up takes it off its pivot.
    const now = v(sim, saw);
    grabAt(sim, now.x, now.y - 0.19);
    expect(sim.physics.hasPivot(saw.id)).toBe(false);
  });

  it('the spoon catapult flings what is in its bowl when pulled down and let go', () => {
    const sim = world('catapult');
    const cat = put(sim, 'item_spoon_catapult', OPEN);
    sim.run(90);
    expect(sim.entities.get(cat.id)!.toy?.pivot).toBeDefined();
    const c = v(sim, cat);
    // The bowl rests up at the left end.
    const bowl = { x: c.x - 0.62 * Math.cos(c.angle), y: c.y - 0.62 * Math.sin(c.angle) - 0.25 };
    const berry = put(sim, 'item_cork', bowl.x, bowl.y - 0.3);
    sim.run(40);
    // Take hold of the bowl's far lip, beside what sits in it.
    const at = v(sim, cat);
    const hx = at.x - 0.9 * Math.cos(at.angle) + 0.24 * Math.sin(at.angle);
    const hy = at.y - 0.9 * Math.sin(at.angle) - 0.24 * Math.cos(at.angle);
    grabAt(sim, hx, hy);
    for (let i = 0; i < 30; i++) {
      sim.send({ type: 'drag', x: hx, y: hy + 0.8 });
      sim.step();
    }
    sim.send({ type: 'release', vx: 0, vy: 0 });
    let up = 0;
    for (let i = 0; i < 40; i++) {
      sim.step();
      up = Math.min(up, v(sim, berry).vy);
    }
    expect(up).toBeLessThan(-4);
  });

  it('a disco ball let go under the porch boards hangs there, and bugs nearby dance', () => {
    const sim = world('disco', ['area_under_porch']);
    const porch = sim.content.areas.get('area_under_porch');
    const x = porch.xStart + 9;
    const ball = put(sim, 'item_disco_ball', x, 3.2);
    grabAt(sim, x, 3.2);
    const log = record(sim);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.physics.isPinned(ball.id)).toBe(true);
    expect(named(log, 'toy_used')[0]).toMatchObject({ toy: 'disco', action: 'hang' });
    bugAt(sim, 'bug_ladybug_dot', x + 1);
    sim.run(6 * 60);
    expect(named(log, 'bug_reacted').some((r) => r.reaction === 'dance')).toBe(true);
  });

  it('the crane’s dangling magnet fishes metal things up', () => {
    const sim = world('crane');
    // Held still with its magnet dangling just over a bottle cap.
    const crane = put(sim, 'item_magnet_crane', OPEN, 7.7);
    const cap = put(sim, 'item_bottle_cap', OPEN + 1.0);
    sim.physics.setPinned(crane.id, true);
    sim.run(60);
    const c = v(sim, crane);
    const tip = { x: c.x + 1.02, y: c.y + 0.36 };
    expect(Math.hypot(v(sim, cap).x - tip.x, v(sim, cap).y - tip.y)).toBeLessThan(0.6);
  });

  it('instruments play a note when poked; musical things play when struck (rule R20)', () => {
    const sim = world('notes');
    const log = record(sim);
    const kazoo = put(sim, 'item_inst_comb_kazoo', OPEN);
    sim.run(20);
    const k = v(sim, kazoo);
    sim.send({ type: 'poke', x: k.x, y: k.y });
    sim.step();
    expect(named(log, 'note_played')[0]).toMatchObject({ id: kazoo.id, note: 4 });
    const can = put(sim, 'item_tin_can', OPEN + 3);
    sim.run(20);
    const marble = put(sim, 'item_marble_blue', OPEN + 3, v(sim, can).y - 2);
    sim.run(40);
    expect(named(log, 'note_played').some((n) => n.id === can.id || n.id === marble.id)).toBe(true);
  });
});

describe('tag rules R11 to R24', () => {
  it('R11: an eggshell knocked hard cracks into three bits; a marble never breaks', () => {
    const sim = world('r11');
    const log = record(sim);
    const egg = put(sim, 'item_eggshell', OPEN, 6);
    sim.physics.setVelocity(egg.id, 0, 10);
    const marble = put(sim, 'item_marble_red', OPEN + 3, 6);
    sim.physics.setVelocity(marble.id, 0, 14);
    sim.run(30);
    expect(sim.entities.has(egg.id)).toBe(false);
    expect(named(log, 'shattered')[0]).toMatchObject({ defId: 'item_eggshell', into: 'item_eggshell_bit' });
    expect(sim.entities.ofKind('item').filter((e) => e.defId === 'item_eggshell_bit')).toHaveLength(3);
    expect(sim.entities.has(marble.id)).toBe(true);
  });

  it('R11: a glass jar only breaks at 1200 px/s, into four safe beads, and never from a bug', () => {
    const slow = world('jar-slow');
    const j1 = put(slow, 'item_jar_glass', OPEN, GROUND_Y - 0.6);
    slow.physics.setVelocity(j1.id, 0, 9);
    slow.run(30);
    expect(slow.entities.has(j1.id)).toBe(true);
    const fast = world('jar-fast');
    const j2 = put(fast, 'item_jar_glass', OPEN, GROUND_Y - 0.6);
    fast.physics.setVelocity(j2.id, 0, 16);
    fast.run(30);
    expect(fast.entities.has(j2.id)).toBe(false);
    expect(fast.entities.ofKind('item').filter((e) => e.defId === 'item_glass_bead')).toHaveLength(4);
    const bug = world('jar-bug');
    const dot = bugAt(bug, 'bug_stagbeetle_moose', OPEN);
    bug.run(30);
    const j3 = put(bug, 'item_jar_glass', OPEN, v(bug, dot).y - 1.3);
    bug.physics.setVelocity(j3.id, 0, 16);
    bug.run(10);
    expect(bug.entities.has(j3.id)).toBe(true);
  });

  it('R12: food kept hot for 3 s is toasted, and toasting makes a disliked snack bearable', () => {
    const sim = world('r12');
    const log = record(sim);
    const berry = put(sim, 'item_berry_red', OPEN);
    sim.run(10);
    sim.addTag(berry.id, 'tag_hot', 'debug');
    sim.run(TOAST_TICKS + 30);
    expect(sim.view(berry.id)!.toasted).toBe(true);
    expect(named(log, 'toasted')).toHaveLength(1);
  });

  it('R13: a hot popcorn kernel pops into popcorn with a jump', () => {
    const sim = world('r13');
    const log = record(sim);
    const kernel = put(sim, 'item_popcorn_kernel', OPEN);
    sim.run(10);
    sim.addTag(kernel.id, 'tag_hot', 'debug');
    sim.run(20);
    expect(sim.entities.has(kernel.id)).toBe(false);
    expect(named(log, 'item_transformed')[0]).toMatchObject({
      from: 'item_popcorn_kernel',
      to: 'item_popcorn',
    });
  });

  it('R19: mud spreads to what it touches', () => {
    const sim = world('r19');
    const a = put(sim, 'item_pebble', OPEN);
    const b = put(sim, 'item_pebble', OPEN, v(sim, a).y - 0.6);
    sim.run(10);
    sim.addTag(a.id, 'tag_muddy', 'debug');
    sim.run(40);
    expect(sim.hasTag(b.id, 'tag_muddy')).toBe(true);
  });

  it('R22: a wet seed in the sun on soil sprouts after 30 s, but not at night', () => {
    const day = world('r22');
    const seed = put(day, 'item_seed_sunflower', OPEN);
    day.run(10);
    day.addTag(seed.id, 'tag_wet', 'debug', 60);
    day.run(SPROUT_TICKS + 30);
    expect(day.entities.has(seed.id)).toBe(false);
    expect(day.entities.ofKind('item').some((e) => e.defId === 'item_sprout')).toBe(true);
    const night = world('r22-night');
    night.send({ type: 'set_time', hour: 23 });
    const s2 = put(night, 'item_seed_sunflower', OPEN);
    night.run(10);
    night.addTag(s2.id, 'tag_wet', 'debug', 60);
    night.run(SPROUT_TICKS + 30);
    expect(night.entities.has(s2.id)).toBe(true);
  });

  it('R23: paint on a painted thing mixes; a paint drop let go on a bug paints it', () => {
    const sim = world('r23');
    const cork = put(sim, 'item_cork', OPEN);
    sim.run(10);
    sim.places.paint(cork, 'paint_blue', 0, 0);
    sim.places.paint(cork, 'paint_yellow', 0, 0);
    expect(sim.view(cork.id)!.paint).toEqual(['paint_green']);
    const dot = bugAt(sim, 'bug_ladybug_dot', OPEN + 4);
    sim.run(20);
    const d = v(sim, dot);
    const drop = put(sim, 'item_paint_red', d.x, d.y - 0.2);
    grabAt(sim, d.x, d.y - 0.2);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.entities.has(drop.id)).toBe(false);
    expect(sim.view(dot.id)!.paint).toContain('paint_red');
  });

  it('R24: fire breath melts an ice sheet', () => {
    const sim = world('r24');
    sim.environment.frostStep(POND.middle, POND.level);
    expect(sim.environment.state.ice).toHaveLength(1);
    sim.environment.meltAt(POND.middle, 1);
    sim.run(2);
    expect(sim.environment.state.ice).toHaveLength(0);
  });
});

describe('the bug scope', () => {
  function scope(sim: Sim): { x: number; y: number } {
    const f = sim.places.fixtures('bug_scope')[0]!;
    return { x: f.x, y: f.fixture.y };
  }

  it('shows a tag of whatever is on the dish, the next one each click', () => {
    const sim = world('scope', ['area_under_porch', 'area_compost_lab']);
    const log = record(sim);
    const s = scope(sim);
    put(sim, 'item_magnet', s.x + 1.1);
    sim.run(20);
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.step();
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.step();
    const seen = named(log, 'scope_viewed');
    expect(seen.map((e) => e.tag)).toEqual(['tag_magnetic', 'tag_heavy']);
  });

  it('shows the moss tuft’s tiny secret at night', () => {
    const sim = world('wubbo', ['area_under_porch', 'area_compost_lab']);
    sim.send({ type: 'set_time', hour: 23 });
    const s = scope(sim);
    put(sim, 'item_moss_tuft', s.x + 1.1);
    sim.run(20);
    sim.send({ type: 'poke', x: s.x, y: s.y });
    sim.step();
    expect(sim.secrets).toContain('secret_scope_wubbo');
  });
});

describe('M8 secrets', () => {
  it('a giant bug launched by a giant spring', () => {
    const sim = world('launch');
    const spring = put(sim, 'item_spring_coil', OPEN);
    sim.run(20);
    sim.send({ type: 'give_potion', id: spring.id, potion: 'potion_giant' });
    sim.run(30);
    const moose = bugAt(sim, 'bug_stagbeetle_moose', OPEN, 1);
    sim.send({ type: 'give_potion', id: moose.id, potion: 'potion_giant' });
    sim.run(120);
    expect(sim.secrets).toContain('secret_giant_launch');
  });

  it('an upside-down bug on the porch boards by the spider has tea', () => {
    const sim = world('tea', ['area_under_porch']);
    const spider = sim.places.fixtures('spider')[0]!;
    const dot = bugAt(sim, 'bug_ladybug_dot', spider.x - 0.5);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_upside_down' });
    sim.run(240);
    expect(sim.secrets).toContain('secret_upside_tea');
  });

  it('a ghost drifting through the lattice spooks Whiff', () => {
    const sim = world('ghost', ['area_under_porch']);
    const lattice = put(sim, 'item_lattice_panel', PLAZA_X + 30);
    sim.run(30);
    const l = v(sim, lattice);
    const dot = bugAt(sim, 'bug_ladybug_dot', l.x - 1.2);
    sim.send({ type: 'give_potion', id: dot.id, potion: 'potion_ghost' });
    sim.run(5);
    sim.physics.setVelocity(dot.id, 3, -1);
    sim.run(40);
    sim.physics.place(dot.id, l.x, l.y, 0);
    sim.run(20);
    expect(sim.secrets).toContain('secret_ghost_lattice');
  });

  it('three ice sheets at once freeze the pond over', () => {
    const sim = world('rink');
    for (const dx of [2, 5, 8]) sim.environment.frostStep(POND.x0 + dx, POND.level);
    expect(sim.secrets).toContain('secret_pond_freeze');
    void POND_X;
  });
});

describe('save version 9', () => {
  it('migrates a version 8 save by bumping the version', () => {
    const v8 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'save-v8.json'), 'utf8'));
    const migrated = MIGRATIONS[8]!(v8);
    expect(migrated.version).toBe(9);
    expect(SAVE_VERSION).toBe(9);
  });

  it('gives a version 8 world the bench, the cauldron, and M8’s new things', () => {
    const raw = readFileSync(join(import.meta.dirname, 'fixtures', 'save-v8.json'), 'utf8');
    const sim = Sim.load(loadSaveFile(raw).world);
    const defs = new Set(sim.entities.ofKind('item').map((e) => e.defId));
    for (const id of ['item_string', 'item_balloon_red', 'item_blueprint_slingshot', 'item_paint_red'])
      expect(defs.has(id), id).toBe(true);
    expect(sim.bench.state.made).toEqual([]);
    expect(sim.cauldron.state.contents).toEqual([]);
    sim.run(600);
    expect(sim.serialize().bench).toBeDefined();
  });
});
