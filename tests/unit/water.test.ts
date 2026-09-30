import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim, VIEW_WIDTH_M } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { ITEMS } from '../../src/game/data/items';
import { AREAS } from '../../src/game/data/areas';
import { Terrain } from '../../src/game/world/terrain';
import { skipVelocity, sprayArc, submergedFraction, waterEdges } from '../../src/game/systems/water';
import { PLAZA_X, POND, POND_X } from './world';

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

/** Open water between the middle and east lily pads. */
const OPEN_X = POND_X + 14.9;

describe('water math', () => {
  it('measures how much of a circle or a box is under the surface', () => {
    const c = { type: 'circle' as const, radius: 1 };
    expect(submergedFraction(c, 0, 0, 5)).toBe(0);
    expect(submergedFraction(c, 0, 10, 5)).toBe(1);
    expect(submergedFraction(c, 0, 5, 5)).toBeCloseTo(0.5, 5);
    expect(submergedFraction(c, 0, 4.5, 5)).toBeLessThan(0.5);
    const b = { type: 'box' as const, width: 2, height: 1 };
    expect(submergedFraction(b, 0, 5, 5)).toBeCloseTo(0.5);
    expect(submergedFraction(b, 0, 5.25, 5)).toBeCloseTo(0.75);
    // Standing on end it reaches deeper.
    expect(submergedFraction(b, Math.PI / 2, 5.25, 5)).toBeCloseTo(0.625);
  });

  it('finds where the pond surface meets its banks', () => {
    const t = Terrain.fromAreas(AREAS.all);
    const edges = waterEdges(t.points, POND.level, POND.middle, POND.x0, POND.x1)!;
    expect(t.surfaceY(edges.left)).toBeCloseTo(POND.level, 3);
    expect(t.surfaceY(edges.right)).toBeCloseTo(POND.level, 3);
    expect(edges.right - edges.left).toBeGreaterThan(16);
    // No water where the ground is above the level (the reedy bank).
    expect(waterEdges(t.points, POND.level, POND_X + 25, POND_X + 24, POND_X + 28)).toBeNull();
  });

  it('skips low, fast throws and swallows steep or slow ones', () => {
    expect(skipVelocity(14, 2)).toMatchObject({ vx: expect.closeTo(11.48) });
    expect(skipVelocity(14, 2)!.vy).toBeLessThan(0);
    expect(skipVelocity(14, 9)).toBeNull();
    expect(skipVelocity(5, 0.5)).toBeNull();
    expect(skipVelocity(14, -2)).toBeNull();
  });

  it('traces the hose spray down to the water', () => {
    const arc = sprayArc(24, 8.2, -6, -3.4, 12, 8.72);
    expect(arc[0]).toEqual([24, 8.2]);
    expect(arc[arc.length - 1]![1]).toBeGreaterThanOrEqual(8.72);
    expect(Math.min(...arc.map((p) => p[1]))).toBeLessThan(8);
  });
});

/** Drop an item into the open pond and step. */
function dropIn(defId: string, seconds: number, x = OPEN_X): { sim: Sim; id: number; log: Logged[] } {
  const sim = Sim.empty({ seed: `water-${defId}` });
  const log = record(sim);
  const item = sim.spawn('item', defId, x, POND.level - 1.2);
  sim.run(seconds * 60);
  return { sim, id: item.id, log };
}

const effectiveDensity = (id: string): number => {
  const d = ITEMS.get(id);
  return d.density / (d.hull ?? 1);
};

describe('buoyancy (M3 acceptance)', () => {
  // Cold things freeze the surface instead (rule R5, tested with the rules).
  const floaters = ITEMS.all
    // The lattice panel is taller than the pond is deep.
    .filter(
      (d) => effectiveDensity(d.id) < 1 && !d.tags.includes('tag_cold') && d.id !== 'item_lattice_panel',
    )
    .map((d) => d.id);
  const sinkers = ITEMS.all.filter((d) => d.density > 1).map((d) => d.id);

  it('covers plenty of things either way', () => {
    expect(floaters).toEqual(
      expect.arrayContaining(['item_cork', 'item_leaf_raft', 'item_paper_boat', 'item_sponge']),
    );
    expect(sinkers).toEqual(expect.arrayContaining(['item_pebble', 'item_marble_blue', 'item_bottle_cap']));
  });

  it.each(floaters)('%s floats and comes to rest at the surface within 5 s', (defId) => {
    // East of the last lily pad there is room for the long ruler too.
    const { sim, id } = dropIn(defId, 5, POND_X + 20.1);
    const v = sim.view(id)!;
    expect(v.submerged, 'partly under').toBeGreaterThan(0);
    expect(v.submerged, 'partly above').toBeLessThan(1);
    expect(Math.abs(v.vy), 'at rest').toBeLessThan(0.08);
    expect(Math.abs(v.y - POND.level)).toBeLessThan(0.5);
  });

  it.each(sinkers)('%s sinks to the pond bottom', (defId) => {
    const { sim, id } = dropIn(defId, 8);
    const v = sim.view(id)!;
    const def = ITEMS.get(defId);
    const half =
      def.shape.type === 'circle' ? def.shape.radius : Math.max(def.shape.width, def.shape.height) / 2;
    expect(v.submerged).toBe(1);
    expect(sim.surfaceY(v.x) - v.y).toBeLessThan(half + 0.08);
    expect(sim.rescues).toBe(0);
  });

  it('things with the density of water hang in it', () => {
    const { sim, id } = dropIn('item_berry_red', 6);
    const v = sim.view(id)!;
    expect(v.submerged).toBeGreaterThan(0.5);
  });

  it('the current drifts floaters slowly to the right', () => {
    const { sim, id } = dropIn('item_cork', 4, POND_X + 6.5);
    const x0 = sim.view(id)!.x;
    sim.run(10 * 60);
    const x1 = sim.view(id)!.x;
    expect(x1 - x0).toBeGreaterThan(0.4);
    expect(x1 - x0).toBeLessThan(1.6);
  });

  it('soggy paper sinks after 40 s in the water, and not before', () => {
    const { sim, id } = dropIn('item_paper_boat', 30, POND_X + 20.3);
    expect(sim.view(id)!.submerged).toBeLessThan(0.9);
    expect(sim.view(id)!.soggy).toBeGreaterThan(0.6);
    sim.run(25 * 60);
    expect(sim.view(id)!.soggy).toBe(1);
    expect(sim.view(id)!.submerged).toBe(1);
  });
});

describe('splashes', () => {
  it('announce things hitting the water, harder for faster falls', () => {
    const { log, id } = dropIn('item_pebble', 2);
    const [splash] = find(log, 'splashed');
    expect(splash).toMatchObject({ id, kind: 'item' });
    expect(splash!.y).toBeCloseTo(POND.level, 3);
    const high = Sim.empty();
    const hl = record(high);
    high.spawn('item', 'item_pebble', OPEN_X, POND.level - 5);
    high.run(120);
    expect(find(hl, 'splashed')[0]!.speed).toBeGreaterThan(splash!.speed);
  });

  it('a flat, fast throw skips across the water before it sinks', () => {
    const sim = Sim.empty();
    const log = record(sim);
    const pebble = sim.spawn('item', 'item_pebble', POND_X + 7, POND.level - 0.6);
    sim.physics.setVelocity(pebble.id, 16, 0);
    sim.run(120);
    const skips = find(log, 'skipped');
    expect(skips.length).toBeGreaterThanOrEqual(2);
    expect(skips.map((s) => s.count)).toEqual(skips.map((_, i) => i + 1));
  });
});

describe('the hose tap and the water level', () => {
  const tap = (sim: Sim) => {
    const f = sim.environment.fixtureAt(POND_X + 25.1, 7.95)!;
    expect(f.kind).toBe('hose_tap');
    return f;
  };

  it('clicking the tap turns the hose on and off; it fills the pond, which drains back', () => {
    const sim = Sim.empty();
    const log = record(sim);
    const f = tap(sim);
    sim.send({ type: 'poke', x: f.x, y: f.y });
    sim.step();
    expect(find(log, 'hose_toggled')).toMatchObject([{ on: true }]);
    expect(sim.environment.spray().length).toBeGreaterThan(5);
    const level0 = sim.environment.surfaces()[0]!.level;
    sim.run(20 * 60);
    const level1 = sim.environment.surfaces()[0]!.level;
    expect(level0 - level1).toBeCloseTo(0.18, 2); // risen to its cap
    sim.send({ type: 'poke', x: f.x, y: f.y });
    sim.run(10 * 60);
    expect(find(log, 'hose_toggled')[1]).toMatchObject({ on: false });
    expect(sim.environment.spray()).toEqual([]);
    const level2 = sim.environment.surfaces()[0]!.level;
    expect(level2 - level1).toBeCloseTo(0.05, 2); // 1 px per 2 s
  });

  it('the spray wets what it hits and pushes light things along', () => {
    const sim = Sim.empty();
    const f = tap(sim);
    sim.send({ type: 'poke', x: f.x, y: f.y });
    sim.step();
    const arc = sim.environment.spray();
    const [mx, my] = arc[Math.floor(arc.length * 0.45)]!;
    const feather = sim.spawn('item', 'item_feather', mx, my);
    sim.run(20);
    expect(sim.view(feather.id)!.tags).toContain('tag_wet');
    expect(sim.view(feather.id)!.vx).toBeLessThan(-0.5);
  });

  it('the sunken boot burps bubbles when clicked', () => {
    const sim = Sim.empty();
    const log = record(sim);
    const boot = sim.content.areas.get('area_puddle_pond').fixtures!.find((f) => f.kind === 'rubber_boot')!;
    sim.send({ type: 'poke', x: POND_X + boot.x, y: boot.y });
    sim.step();
    expect(find(log, 'boot_bubbled')).toHaveLength(1);
  });
});

describe('lily pads', () => {
  it('float at the surface, dip under weight, and carry a bug', () => {
    const sim = Sim.empty({ seed: 'pads' });
    sim.step();
    const pads = sim.environment.pads();
    expect(pads).toHaveLength(3);
    const pad = pads[1]!;
    expect(Math.abs(pad.y - POND.level)).toBeLessThan(0.1);
    const bug = sim.spawn('bug', 'bug_ladybug_dot', pad.x, pad.y - 1.5);
    sim.entities.get(bug.id)!.bug!.needs = {
      need_hunger: 100,
      need_fun: 100,
      need_energy: 100,
      need_social: 80,
      need_clean: 90,
    };
    sim.run(90);
    const after = sim.environment.pads()[1]!;
    expect(after.y).toBeGreaterThan(pad.y); // pushed down a little
    const v = sim.view(bug.id)!;
    expect(v.bug!.mode).not.toBe('st_swim');
    expect(v.y).toBeLessThan(after.y);
    expect(sim.environment.overOpenWater(pad.x)).toBe(false);
  });
});

describe('Skeet walks on water', () => {
  it('stands and skates on the surface without ever swimming', () => {
    const sim = Sim.create({ seed: 'skeet' });
    const skeet = sim.entities.all().find((e) => e.defId === 'bug_waterstrider_skeet')!;
    const xs = new Set<number>();
    for (let t = 0; t < 30 * 60; t++) {
      sim.step();
      const v = sim.view(skeet.id)!;
      expect(v.bug!.mode).not.toBe('st_swim');
      if (sim.environment.overOpenWater(v.x)) expect(v.submerged).toBeLessThan(0.05);
      xs.add(Math.round(v.x));
    }
    expect(xs.size).toBeGreaterThan(2);
  });

  it('lands on the water standing up when dropped, and never dizzy', () => {
    const sim = Sim.empty({ seed: 'skeet-drop' });
    const log = record(sim);
    const skeet = sim.spawn('bug', 'bug_waterstrider_skeet', OPEN_X, POND.level - 4);
    sim.physics.setVelocity(skeet.id, 0, 14);
    sim.run(120);
    const v = sim.view(skeet.id)!;
    expect(v.y + 0.5).toBeCloseTo(POND.level, 1);
    expect(find(log, 'bug_landed')).toHaveLength(1);
    expect(find(log, 'bug_dizzy')).toHaveLength(0);
  });

  it('parachutes down when flung', () => {
    const sim = Sim.empty({ seed: 'chute' });
    const skeet = sim.spawn('bug', 'bug_waterstrider_skeet', PLAZA_X + 8, GROUND_Y - 0.6);
    sim.run(20);
    const at = sim.view(skeet.id)!;
    sim.send({ type: 'grab', x: at.x, y: at.y });
    sim.send({ type: 'drag', x: at.x, y: 2 });
    sim.run(40);
    sim.send({ type: 'release', vx: 3, vy: -3 });
    let fastest = 0;
    for (let t = 0; t < 180; t++) {
      sim.step();
      const v = sim.view(skeet.id)!;
      if (v.bug!.mode === 'st_airborne') fastest = Math.max(fastest, v.vy);
    }
    expect(fastest).toBeGreaterThan(1);
    expect(fastest).toBeLessThan(4.5);
  });
});

describe('swimming and shaking dry', () => {
  const dunk = (defId: string, seed: string) => {
    const sim = Sim.empty({ seed });
    const log = record(sim);
    const bug = sim.spawn('bug', defId, OPEN_X, POND.level - 2);
    const brain = sim.entities.get(bug.id)!.bug!;
    brain.needs = { need_hunger: 100, need_fun: 100, need_energy: 100, need_social: 80, need_clean: 90 };
    return { sim, log, id: bug.id };
  };

  it.each(['bug_ladybug_dot', 'bug_snail_glorp', 'bug_pillbug_rollo'])(
    '%s falls in, swims to shore, and shakes itself dry',
    (defId) => {
      const { sim, log, id } = dunk(defId, `swim-${defId}`);
      let swam = false;
      let deepest = 0;
      for (let t = 0; t < 40 * 60 && find(log, 'bug_shook_dry').length === 0; t++) {
        sim.step();
        const v = sim.view(id)!;
        if (v.bug!.mode === 'st_swim') swam = true;
        // After the first plunge: floaters bob back up, Rollo stays down.
        if (t > 150 && v.bug!.mode === 'st_swim') deepest = Math.max(deepest, v.y);
      }
      expect(swam).toBe(true);
      expect(find(log, 'bug_swam')).toHaveLength(1);
      expect(find(log, 'bug_reacted').some((r) => r.id === id && r.reaction === 'splash')).toBe(true);
      expect(find(log, 'bug_shook_dry')).toHaveLength(1);
      expect(find(log, 'bug_reacted').some((r) => r.id === id && r.reaction === 'shake_dry')).toBe(true);
      const v = sim.view(id)!;
      expect(v.tags).not.toContain('tag_wet');
      expect(v.submerged).toBeLessThan(0.1);
      // Rollo sinks and walks the bottom; the others stay up.
      if (defId === 'bug_pillbug_rollo') expect(deepest).toBeGreaterThan(POND.level + 0.8);
      else expect(deepest).toBeLessThan(POND.level + 0.5);
    },
  );

  it('a bug that fell in is wet while it swims and drips out', () => {
    const { sim, id } = dunk('bug_ladybug_dot', 'wet');
    sim.run(90);
    expect(sim.view(id)!.tags).toContain('tag_wet');
    expect(sim.view(id)!.bug!.mode).toBe('st_swim');
  });

  it('bugs never wander into the water on their own', () => {
    const sim = Sim.empty({ seed: 'banks' });
    const dot = sim.spawn('bug', 'bug_ladybug_dot', POND_X + 2, GROUND_Y - 0.6);
    const b = sim.entities.get(dot.id)!.bug!;
    for (let t = 0; t < 90 * 60; t++) {
      b.needs = { need_hunger: 90, need_fun: 90, need_energy: 90, need_social: 80, need_clean: 90 };
      sim.step();
      expect(sim.view(dot.id)!.bug!.mode).not.toBe('st_swim');
    }
  });
});

describe('area sleep (M3 acceptance)', () => {
  it('the pond sleeps when the camera is far off in the plaza, and wakes when it comes back', () => {
    const sim = Sim.create({ seed: 'sleep' });
    const log = record(sim);
    sim.run(60);
    const pondItems = sim.views().filter((v) => v.x >= POND_X && v.x < PLAZA_X && v.kind === 'item');
    const skeet = sim.views().find((v) => v.defId === 'bug_waterstrider_skeet')!;
    // The camera at the plaza's far right: the pond is a whole screen away.
    sim.send({ type: 'focus', x0: PLAZA_X + 38.4 - VIEW_WIDTH_M, x1: PLAZA_X + 38.4 });
    sim.step();
    expect(sim.isAreaAsleep('area_puddle_pond')).toBe(true);
    expect(sim.isAreaAsleep('area_stump_plaza')).toBe(false);
    expect(find(log, 'area_slept')).toContainEqual({ areaId: 'area_puddle_pond' });
    expect(find(log, 'area_slept')).not.toContainEqual({ areaId: 'area_under_porch' });
    const before = pondItems.map((v) => sim.view(v.id)!);
    const skeetBefore = sim.view(skeet.id)!;
    sim.run(10 * 60);
    for (const b of before) {
      const a = sim.view(b.id)!;
      expect(a.asleep).toBe(true);
      expect([a.x, a.y]).toEqual([b.x, b.y]);
    }
    // Skeet runs the coarse off-screen model: he may have moved, but only
    // along the pond, standing on the water or the bank.
    const skeetAsleep = sim.view(skeet.id)!;
    expect(skeetAsleep.asleep).toBe(true);
    expect(skeetAsleep.x).toBeLessThan(PLAZA_X);
    expect(skeetAsleep.x).toBeGreaterThan(POND_X);
    expect(skeetBefore.asleep).toBe(true);
    sim.send({ type: 'focus', x0: PLAZA_X, x1: PLAZA_X + VIEW_WIDTH_M });
    sim.step();
    expect(sim.isAreaAsleep('area_puddle_pond')).toBe(false);
    expect(sim.view(before[0]!.id)!.asleep).toBeUndefined();
    const woke = sim.view(skeet.id)!.x;
    sim.run(5 * 60);
    expect(sim.view(skeet.id)!.x).not.toBe(woke);
  });

  it('nothing sleeps while the camera is on the pond or next to it', () => {
    const sim = Sim.create({ seed: 'awake' });
    sim.send({ type: 'focus', x0: PLAZA_X + 3, x1: PLAZA_X + 3 + VIEW_WIDTH_M });
    sim.run(30);
    expect(sim.isAreaAsleep('area_puddle_pond')).toBe(false);
    expect(sim.isAreaAsleep('area_stump_plaza')).toBe(false);
  });
});
