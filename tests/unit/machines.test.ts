import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { CONTENT } from '../../src/game/data';
import { addTreehouseRun } from '../../src/game/save/treehouseRun';
import { shiftBrain } from '../../src/game/systems/bugAi';
import { CAULDRON_GAP, DIAL_GAP, DIAL_MINUTES } from '../../src/game/systems/bugMachines';
import { BUG_SPACE, SLEEPER_SPACE } from '../../src/game/systems/bugStates';
import { MINUTE } from '../../src/game/systems/sky';
import { PLAZA_X } from './world';

// Bugs use the newer areas' machines on their own (review R20, R06, R10,
// R16), make room for each other (R15), roam (R04), and answer food held out
// while they are busy (R21).

type Logged = { name: keyof GameEvents; payload: Record<string, unknown>; tick: number };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) =>
    log.push({ name, payload: payload as Record<string, unknown>, tick: sim.tick }),
  );
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const areaX = (id: string): number => CONTENT.areas.get(id).xStart;
const PORCH_X = areaX('area_under_porch');
const LAB_X = areaX('area_compost_lab');
const TREE_X = areaX('area_treehouse_arcade');

/** An empty world with every area open (no starting things, no bugs). */
function openEmpty(seed: string): Sim {
  const sim = Sim.empty({ seed });
  for (const a of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
    sim.send({ type: 'unlock', area: a });
  sim.step();
  return sim;
}

/** A bug standing on the ground at x, content except for fun. */
function bugAt(sim: Sim, defId: string, x: number, fun = 100): Entity {
  const r = CONTENT.bugs.get(defId).radius;
  const b = sim.spawn('bug', defId, x, sim.surfaceY(x) - r - 0.05);
  b.bug!.needs = { need_hunger: 100, need_fun: fun, need_energy: 100, need_social: 100, need_clean: 100 };
  return b;
}

function put(sim: Sim, defId: string, x: number): Entity {
  return sim.spawn('item', defId, x, sim.surfaceY(x) - sim.halfHeightOfDef(defId) - 0.02);
}

/** Pick an item up and put it down where it is, the way the player's hand would. */
function touch(sim: Sim, id: number): void {
  const s = sim.view(id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

describe('the sundial (R06)', () => {
  it('a bored bug near the dial pushes its rim a notch: the world fast-forwards and it looks up', () => {
    const sim = openEmpty('dial');
    const dot = bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 12, 20);
    const log = record(sim);
    const before = sim.weather.state.clock;
    sim.run(60 * 60);
    const turned = named(log, 'bug_turned_dial');
    expect(turned).toHaveLength(1);
    expect(turned[0]).toMatchObject({ id: dot.id, minutes: DIAL_MINUTES });
    // The same path as the player's hand: the sky sweeps ahead and the time is skipped.
    const skipped = named(log, 'time_skipped')[0]!;
    expect((skipped.to as number) - (skipped.from as number)).toBe(DIAL_MINUTES * MINUTE);
    expect(sim.weather.state.clock - before).toBeGreaterThanOrEqual(DIAL_MINUTES * MINUTE + 60 * 60 - 120);
    const at = log.find((e) => e.name === 'bug_turned_dial')!.tick;
    expect(
      log.some(
        (e) =>
          e.name === 'bug_reacted' &&
          e.payload.id === dot.id &&
          e.payload.reaction === 'wonder' &&
          e.tick > at,
      ),
    ).toBe(true);
  });

  it('is rare: nobody pushes it again within five minutes', () => {
    const sim = openEmpty('dial-rare');
    bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 12, 20);
    bugAt(sim, 'bug_pillbug_rollo', PLAZA_X + 6, 20);
    const log = record(sim);
    // Keep them bored the whole time.
    for (let t = 0; t < 7 * 60; t++) {
      for (const b of sim.entities.ofKind('bug')) b.bug!.needs.need_fun = 20;
      sim.run(60);
    }
    const ticks = log.filter((e) => e.name === 'bug_turned_dial').map((e) => e.tick);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(DIAL_GAP);
  });

  it('never in the late afternoon or at night, so bedtime stays where it is', () => {
    for (const hour of [16, 23, 3]) {
      const sim = openEmpty(`dial-${hour}`);
      sim.send({ type: 'set_time', hour });
      bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 12, 20);
      const log = record(sim);
      sim.run(45 * 60);
      expect(named(log, 'bug_turned_dial')).toHaveLength(0);
    }
  });

  it('never where nobody can see it', () => {
    const sim = openEmpty('dial-away');
    sim.send({ type: 'focus', x0: PLAZA_X + 20, x1: PLAZA_X + 39 });
    bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 12, 20);
    const log = record(sim);
    sim.run(45 * 60);
    expect(named(log, 'bug_turned_dial')).toHaveLength(0);
  });
});

describe('the Tinker Bench (R10)', () => {
  /** Junk on the porch floor beside the bench, and a bug that wishes for a disco ball. */
  function bench(seed: string): { sim: Sim; dot: Entity; foil: Entity; log: Logged[] } {
    const sim = openEmpty(seed);
    const dot = bugAt(sim, 'bug_ladybug_dot', PORCH_X + 14, 100);
    for (const [d, x] of [
      ['item_button', 12],
      ['item_popsicle_stick', 21],
      ['item_rubber_band', 22],
    ] as const)
      put(sim, d, PORCH_X + x);
    const foil = put(sim, 'item_foil_ball', PORCH_X + 10);
    sim.run(30);
    // Sniffed already, so nothing new pulls it away.
    dot.bug!.inspected = sim.entities.ofKind('item').map((e) => e.id);
    dot.bug!.wish = { recipe: 'recipe_disco_ball', until: sim.tick + 40 * 60 };
    return { sim, dot, foil, log: record(sim) };
  }

  it('a wishing bug carries one ingredient of its wish to an empty tray and tosses it in', () => {
    const { sim, dot, foil, log } = bench('tray');
    sim.run(30 * 60);
    expect(named(log, 'bug_picked_up')).toContainEqual(
      expect.objectContaining({ id: dot.id, itemId: foil.id }),
    );
    expect(named(log, 'tray_filled')).toContainEqual(expect.objectContaining({ id: foil.id }));
    expect(sim.bench.state.trays).toContain(foil.id);
    // The wish is spent, and the toss is counted.
    expect(dot.bug!.wish).toBeUndefined();
    expect(dot.bug!.machines?.tray).toBeGreaterThan(0);
  });

  it("never takes the player's things (the setup rule)", () => {
    const { sim, foil, log } = bench('tray-setup');
    touch(sim, foil.id);
    sim.run(30 * 60);
    expect(named(log, 'bug_picked_up').filter((e) => e.itemId === foil.id)).toEqual([]);
    expect(sim.bench.state.trays).not.toContain(foil.id);
  });

  it('a bored bug idling by the bench keeps its wish in mind', () => {
    const sim = openEmpty('wish');
    const dot = bugAt(sim, 'bug_ladybug_dot', PORCH_X + 16, 30);
    const log = record(sim);
    for (let t = 0; t < 60 && named(log, 'bug_wished').length === 0; t++) {
      dot.bug!.needs.need_fun = 30;
      dot.bug!.mode = 'st_idle';
      dot.bug!.decideIn = 600;
      sim.run(60);
    }
    const wish = named(log, 'bug_wished')[0]!;
    expect(wish).toBeDefined();
    expect(dot.bug!.wish?.recipe).toBe(wish.recipe);
  });
});

describe('the cauldron (R20)', () => {
  it('a bug drops something into the empty cauldron and stirs it until a potion pops out', () => {
    const sim = openEmpty('pot');
    const rollo = bugAt(sim, 'bug_pillbug_rollo', LAB_X + 8, 40);
    put(sim, 'item_moss_tuft', LAB_X + 9);
    const log = record(sim);
    sim.run(30 * 60);
    expect(named(log, 'bug_threw').some((e) => e.id === rollo.id)).toBe(true);
    expect(named(log, 'cauldron_added')).toHaveLength(1);
    expect(named(log, 'cauldron_stirred').length).toBeGreaterThanOrEqual(4);
    expect(named(log, 'potion_brewed')).toHaveLength(1);
    expect(named(log, 'bug_used')).toContainEqual(expect.objectContaining({ id: rollo.id, action: 'brew' }));
  });

  it('leaves a brew the player started alone, and brews at most once in four minutes', () => {
    const sim = openEmpty('pot-player');
    bugAt(sim, 'bug_pillbug_rollo', LAB_X + 8, 40);
    put(sim, 'item_moss_tuft', LAB_X + 9);
    // The player's pepper is in the pot already.
    sim.cauldron.add(put(sim, 'item_pepper_hot', LAB_X + 12));
    const log = record(sim);
    sim.run(20 * 60);
    expect(named(log, 'bug_threw')).toEqual([]);
    expect(named(log, 'cauldron_stirred')).toEqual([]);
    // Tipped out, a bug brews once, then not again for a good while.
    sim.cauldron.tip();
    for (const e of sim.entities.ofKind('item')) if (e.defId === 'item_pepper_hot') sim.remove(e.id);
    put(sim, 'item_moss_tuft', LAB_X + 7);
    put(sim, 'item_moss_tuft', LAB_X + 10);
    for (let t = 0; t < 5 * 60; t++) {
      for (const b of sim.entities.ofKind('bug')) b.bug!.needs.need_fun = 40;
      sim.run(60);
    }
    const brewed = log.filter((e) => e.name === 'potion_brewed').map((e) => e.tick);
    expect(brewed.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < brewed.length; i++)
      expect(brewed[i]! - brewed[i - 1]!).toBeGreaterThan(CAULDRON_GAP - 600);
  });
});

describe('the treehouse (R16)', () => {
  it('a bug climbs the leaf slide and rides it down', () => {
    const sim = openEmpty('slide');
    const dot = bugAt(sim, 'bug_ladybug_dot', TREE_X + 27.5, 50);
    const log = record(sim);
    let top = Infinity;
    for (let t = 0; t < 40 * 60 && !named(log, 'bug_used').some((e) => e.action === 'slide'); t++) {
      sim.step();
      top = Math.min(top, sim.view(dot.id)!.y);
    }
    expect(named(log, 'bug_chose_action')).toContainEqual(expect.objectContaining({ action: 'slide' }));
    expect(named(log, 'bug_reacted')).toContainEqual(expect.objectContaining({ reaction: 'whee' }));
    expect(named(log, 'bug_used')).toContainEqual(expect.objectContaining({ id: dot.id, action: 'slide' }));
    // Up near the perch, then all the way down to the floor.
    expect(top).toBeLessThan(3.6);
    sim.run(60);
    expect(sim.view(dot.id)!.y).toBeGreaterThan(5.5);
  });

  it('a bug wades through the bead pit and hops out', () => {
    const sim = openEmpty('beads');
    const rollo = bugAt(sim, 'bug_pillbug_rollo', TREE_X + 12, 30);
    const log = record(sim);
    let deepest = 0;
    for (let t = 0; t < 40 * 60 && !named(log, 'bug_used').some((e) => e.action === 'wade'); t++) {
      sim.step();
      deepest = Math.max(deepest, sim.view(rollo.id)!.y);
    }
    expect(named(log, 'bug_used')).toContainEqual(expect.objectContaining({ id: rollo.id, action: 'wade' }));
    expect(deepest).toBeGreaterThan(6.8);
    sim.run(3 * 60);
    expect(sim.view(rollo.id)!.y).toBeLessThan(6.3);
  });

  it('starts with a short marble run on the pegboard that carries a marble across the board', () => {
    const sim = Sim.create({ seed: 'run' });
    for (const a of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
      sim.send({ type: 'unlock', area: a });
    sim.step();
    const pinned = sim.entities.ofKind('item').filter((e) => e.pinned);
    expect(pinned.map((e) => e.defId).sort()).toEqual([
      'item_marble_track_curve',
      'item_marble_track_straight',
      'item_marble_track_straight',
      'item_marble_track_straight',
    ]);
    // Dropped on the top piece, a marble runs the whole way and rolls off the curve onto the floor.
    for (const [x, y] of [
      [6.1, 2.2],
      [6.35, 2.3],
      [6.8, 2.6],
    ]) {
      const marble = sim.spawn('item', 'item_marble_green', TREE_X + x!, y!);
      let lowest = 0;
      for (let t = 0; t < 5 * 60; t++) {
        sim.step();
        lowest = Math.max(lowest, sim.view(marble.id)!.y);
      }
      const v = sim.view(marble.id)!;
      expect(v.x).toBeGreaterThan(TREE_X + 11.5);
      expect(lowest).toBeGreaterThan(6);
      sim.remove(marble.id);
    }
  });

  it("addTreehouseRun brings an older save up to the new run, and leaves a player's track alone", () => {
    const sim = Sim.create({ seed: 'old-run' });
    for (const a of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab', 'area_treehouse_arcade'])
      sim.send({ type: 'unlock', area: a });
    sim.step();
    const save = loadSaveFile(
      JSON.stringify({
        version: SAVE_VERSION,
        savedAt: 'now',
        world: sim.serialize(),
        view: { cameraX: 0 },
        meta: { createdAt: 'then', thumb: null },
      }),
    );
    // Make it look like a save from before: the curve where it was, and no middle pieces.
    const world = save.world;
    world.entities = world.entities.filter(
      (e) => !(e.pinned && e.defId === 'item_marble_track_straight' && e.body.x > TREE_X + 7),
    );
    const curve = world.entities.find((e) => e.pinned && e.defId === 'item_marble_track_curve')!;
    curve.body.x = TREE_X + 8;
    curve.body.y = 4.4;
    curve.body.angle = 0;
    const fixed = addTreehouseRun(save);
    expect(fixed).not.toBe(save);
    expect(curve.body.x).toBe(TREE_X + 8);
    const pins = fixed.world.entities.filter((e) => e.pinned);
    expect(pins).toHaveLength(4);
    expect(pins.find((e) => e.defId === 'item_marble_track_curve')!.body.x).toBeCloseTo(TREE_X + 11.6);
    expect(fixed.world.nextId).toBe(save.world.nextId + 2);
    expect(new Set(fixed.world.entities.map((e) => e.id)).size).toBe(fixed.world.entities.length);
    expect(() => Sim.load(fixed.world)).not.toThrow();
    // Run twice, nothing more happens; a moved curve is the player's own track.
    expect(addTreehouseRun(fixed)).toBe(fixed);
    curve.body.x = TREE_X + 10;
    expect(addTreehouseRun(save)).toBe(save);
  });
});

describe('room to stand (R15)', () => {
  it('two bugs standing still inside each other shuffle apart', () => {
    const sim = Sim.empty({ seed: 'space' });
    const a = bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 28);
    const b = bugAt(sim, 'bug_pillbug_rollo', PLAZA_X + 28.9);
    for (const e of [a, b]) {
      e.bug!.decideIn = 100000;
      e.bug!.timer = 100000;
    }
    sim.run(4 * 60);
    const gap = Math.abs(sim.view(a.id)!.x - sim.view(b.id)!.x) - 0.5 - 0.46;
    expect(gap).toBeGreaterThanOrEqual(BUG_SPACE - 0.03);
  });

  it('keeps clear of Dot asleep on her bottle cap in the first scene', () => {
    const sim = Sim.create({ seed: 'intro' });
    sim.send({ type: 'stage_intro' });
    sim.step();
    const dot = sim.entities.ofKind('bug').find((e) => e.defId === 'bug_ladybug_dot')!;
    expect(dot.bug!.mode).toBe('st_sleep');
    let closest = Infinity;
    for (let t = 0; t < 60 * 60 && dot.bug!.mode === 'st_sleep'; t++) {
      sim.step();
      const d = sim.view(dot.id)!;
      for (const o of sim.entities.ofKind('bug')) {
        if (o.id === dot.id || o.bug!.pending || o.bug!.mode !== 'st_idle') continue;
        const v = sim.view(o.id)!;
        if (Math.abs(v.y - d.y) > 1) continue;
        closest = Math.min(closest, Math.abs(v.x - d.x) - 0.5 - CONTENT.bugs.get(o.defId).radius);
      }
    }
    expect(closest).toBeGreaterThan(SLEEPER_SPACE * 0.5);
  });
});

describe('a busy bug and food held out (R21)', () => {
  it('glances at it and says "later", then comes over to be fed once it is free', () => {
    const sim = Sim.empty({ seed: 'later' });
    const dot = bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 26, 100);
    dot.bug!.needs.need_hunger = 60;
    const puff = put(sim, 'item_cheese_puff', PLAZA_X + 31);
    dot.bug!.inspected = [puff.id];
    sim.run(30);
    // Busy: dancing (st_perform).
    dot.bug!.mode = 'st_perform';
    dot.bug!.action = 'dance';
    dot.bug!.timer = 200;
    const log = record(sim);
    const at = sim.view(puff.id)!;
    sim.send({ type: 'grab', x: at.x, y: at.y });
    const d = sim.view(dot.id)!;
    sim.send({ type: 'drag', x: d.x + 1.2, y: d.y - 0.6 });
    sim.run(20);
    const later = named(log, 'bug_reacted').filter((e) => e.id === dot.id && e.reaction === 'later');
    expect(later).toHaveLength(1);
    expect(dot.bug!.mode).toBe('st_perform');
    // Held out a while longer, and a bit further off: no nagging, one "later" is enough.
    sim.send({ type: 'drag', x: d.x + 4, y: d.y - 0.6 });
    sim.run(60);
    expect(named(log, 'bug_reacted').filter((e) => e.reaction === 'later')).toHaveLength(1);
    // Done dancing, it comes over to the food and waits to be fed.
    sim.run(5 * 60);
    expect(dot.bug!.mode).not.toBe('st_perform');
    const near = sim.view(dot.id)!;
    expect(Math.abs(near.x - (d.x + 4))).toBeLessThan(2.5);
    for (let i = 0; i < 60; i++) {
      const mouth = sim.mouthAnchor(dot.id)!;
      sim.send({ type: 'drag', x: mouth.x, y: mouth.y - 0.1 });
      sim.step();
    }
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(10);
    expect(named(log, 'bug_fed')).toContainEqual(expect.objectContaining({ id: dot.id, itemId: puff.id }));
  });

  it('a "later" carries over a trip to the pocket', () => {
    const sim = Sim.empty({ seed: 'shift' });
    const dot = bugAt(sim, 'bug_ladybug_dot', PLAZA_X + 26);
    dot.bug!.later = 500;
    dot.bug!.wish = { recipe: 'recipe_kazoo', until: 700 };
    dot.bug!.machines = { slide: 100 };
    shiftBrain(dot.bug!, 50);
    expect(dot.bug!.later).toBe(550);
    expect(dot.bug!.wish!.until).toBe(750);
    expect(dot.bug!.machines).toEqual({ slide: 150 });
  });
});

describe('found bugs roam (R04)', () => {
  it('Whiff, Munch, and Prim wander their home areas once found', () => {
    for (const [defId, area] of [
      ['bug_stinkbug_whiff', 'area_under_porch'],
      ['bug_caterpillar_munch', 'area_flowerbed_stage'],
      ['bug_mantis_prim', 'area_treehouse_arcade'],
    ] as const) {
      const sim = openEmpty(`roam-${defId}`);
      const home = CONTENT.areas.get(area);
      const x = home.xStart + (defId === 'bug_mantis_prim' ? 8 : 16);
      const bug = bugAt(sim, defId, x, 90);
      const xs: number[] = [];
      for (let t = 0; t < 150; t++) {
        bug.bug!.needs.need_hunger = 100;
        bug.bug!.needs.need_energy = 100;
        sim.run(60);
        xs.push(sim.view(bug.id)!.x);
      }
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3);
      // Mostly at home.
      const inside = xs.filter((v) => v >= home.xStart && v <= home.xEnd).length;
      expect(inside / xs.length).toBeGreaterThan(0.7);
    }
  }, 120_000);

  it('a lively plaza bug sometimes pops over into the next open area and comes back', () => {
    const sim = openEmpty('outing');
    const plaza = CONTENT.areas.get('area_stump_plaza');
    const rollo = bugAt(sim, 'bug_pillbug_rollo', plaza.xEnd - 6, 60);
    let away = 0;
    let home = 0;
    for (let t = 0; t < 10 * 60; t++) {
      rollo.bug!.needs.need_hunger = 100;
      rollo.bug!.needs.need_energy = 100;
      rollo.bug!.needs.need_fun = 60;
      sim.run(60);
      const v = sim.view(rollo.id)!.x;
      if (v > plaza.xEnd + 0.5) away++;
      else if (away > 0) home++;
    }
    expect(away).toBeGreaterThan(0);
    expect(home).toBeGreaterThan(0);
  }, 120_000);

  it('Moose, stuck on his back, heaves and looks round for help now and then', () => {
    const sim = Sim.create({ seed: 'moose' });
    sim.send({ type: 'unlock', area: 'area_under_porch' });
    sim.send({ type: 'unlock', area: 'area_compost_lab' });
    sim.step();
    const moose = sim.entities.ofKind('bug').find((e) => e.defId === 'bug_stagbeetle_moose')!;
    expect(moose.bug!.pending).toBe('stuck');
    const log = record(sim);
    sim.run(30 * 60);
    const huhs = named(log, 'bug_reacted').filter((e) => e.id === moose.id && e.reaction === 'huh');
    expect(huhs.length).toBeGreaterThanOrEqual(2);
    expect(huhs.length).toBeLessThanOrEqual(5);
    expect(moose.bug!.pending).toBe('stuck');
  });
});
