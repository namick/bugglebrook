import { describe, expect, it } from 'vitest';
import {
  DIZZY_SPEED,
  GROUND_Y,
  MAX_FLING_SPEED,
  RESPAWN_TICKS,
  Rng,
  Sim,
  dizzySeconds,
} from '../../src/game';
import type { GameEvents } from '../../src/game';
import { PLAZA_X } from './world';

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

/** Flat ground well away from the stump. */
const FLAT_X = PLAZA_X + 7;
/** The middle of the stump's flat top. */
const STUMP_X = PLAZA_X + 19.5;

describe('Sim physics', () => {
  it('drops a spawned item onto the ground and lets it settle', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', FLAT_X, 3);
    sim.run(180);
    const v = sim.view(pebble.id)!;
    const shape = sim.content.items.get('item_pebble').shape;
    expect(v.y).toBeCloseTo(GROUND_Y - (shape.type === 'circle' ? shape.radius : 0), 1);
    expect(Math.abs(v.vy)).toBeLessThan(0.1);
  });

  it('builds the stump from the area terrain, with a flat top to stack on', () => {
    const sim = Sim.empty();
    expect(sim.surfaceY(FLAT_X)).toBe(GROUND_Y);
    expect(sim.surfaceY(STUMP_X)).toBe(4);
    const cap = sim.spawn('item', 'item_bottle_cap', STUMP_X, 1);
    const pebble = sim.spawn('item', 'item_pebble', STUMP_X, 0);
    sim.run(240);
    expect(sim.view(cap.id)!.y).toBeCloseTo(4 - 0.085, 1);
    expect(sim.view(pebble.id)!.y).toBeLessThan(sim.view(cap.id)!.y - 0.2);
  });

  it('grabs an item under the pointer, drags it, and flings it on release', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', FLAT_X, GROUND_Y - 0.21);
    sim.run(30);
    const start = sim.view(pebble.id)!;
    const log = record(sim);

    sim.send({ type: 'grab', x: start.x, y: start.y });
    sim.step();
    expect(sim.view(pebble.id)!.held).toBe(true);
    for (let i = 1; i <= 20; i++) {
      sim.send({ type: 'drag', x: start.x + i * 0.1, y: start.y - i * 0.1 });
      sim.step();
    }
    expect(sim.view(pebble.id)!.y).toBeLessThan(start.y - 1);

    sim.send({ type: 'release', vx: 8, vy: -3 });
    sim.step();
    expect(sim.view(pebble.id)!.held).toBe(false);
    const [dropped] = find(log, 'item_dropped');
    expect(dropped).toMatchObject({ id: pebble.id, vx: 8, vy: -3, flung: true });
    expect(find(log, 'item_grabbed')).toHaveLength(1);
  });

  it('caps fling speed at 2600 px/s', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', FLAT_X, GROUND_Y - 0.21);
    const log = record(sim);
    sim.send({ type: 'grab', x: FLAT_X, y: GROUND_Y - 0.21 });
    sim.send({ type: 'release', vx: 300, vy: -400 });
    sim.step();
    const [dropped] = find(log, 'item_dropped');
    expect(dropped!.speed).toBeCloseTo(MAX_FLING_SPEED);
    expect(dropped!.vx / dropped!.vy).toBeCloseTo(300 / -400);
    expect(sim.view(pebble.id)!.held).toBe(false);
  });

  it('treats a slow release as a drop, not a fling', () => {
    const sim = Sim.empty();
    sim.spawn('item', 'item_pebble', FLAT_X, GROUND_Y - 0.21);
    const log = record(sim);
    sim.send({ type: 'grab', x: FLAT_X, y: GROUND_Y - 0.21 });
    sim.send({ type: 'release', vx: 1, vy: -1 });
    sim.step();
    expect(find(log, 'item_dropped')[0]!.flung).toBe(false);
  });

  it('ignores grabs on empty space and on the ground', () => {
    const sim = Sim.empty();
    sim.spawn('item', 'item_pebble', FLAT_X, GROUND_Y - 0.21);
    const log = record(sim);
    sim.send({ type: 'grab', x: PLAZA_X + 20, y: 2 });
    sim.send({ type: 'grab', x: STUMP_X, y: 6 }); // inside the stump
    sim.step();
    expect(sim.physics.grabbed).toBeNull();
    expect(find(log, 'item_grabbed')).toHaveLength(0);
  });

  it('keeps flung things inside the world walls', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', 1, GROUND_Y - 1);
    sim.physics.setVelocity(pebble.id, -25, -5);
    sim.run(240);
    const v = sim.view(pebble.id)!;
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(sim.worldWidth);
    expect(v.y).toBeLessThan(sim.surfaceY(v.x));
  });

  it('emits a bonk when something lands hard', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', FLAT_X, 0);
    const log = record(sim);
    sim.run(120);
    const bonk = find(log, 'bonked')[0];
    expect(bonk?.id).toBe(pebble.id);
  });

  it('never lets items tunnel through the ground at full fling speed (1000 seeded flings)', () => {
    const sim = Sim.empty({ seed: 'tunnel' });
    const rng = new Rng('tunnel-flings');
    const kinds = ['item_marble_blue', 'item_pebble', 'item_bottle_cap', 'item_berry_red', 'item_twig'];
    let lowest = -Infinity;
    for (let i = 0; i < 1000; i++) {
      const defId = kinds[i % kinds.length]!;
      const x = rng.range(1.5, sim.worldWidth - 1.5);
      const y = sim.surfaceY(x) - rng.range(0.6, 6);
      const item = sim.spawn('item', defId, x, y);
      // Anywhere from straight down to 70 degrees off, at 2600 px/s.
      const angle = rng.range(-1.2, 1.2);
      sim.physics.setVelocity(item.id, Math.sin(angle) * MAX_FLING_SPEED, Math.cos(angle) * MAX_FLING_SPEED);
      for (let t = 0; t < 30; t++) {
        sim.step();
        const v = sim.view(item.id);
        // Gone into the compost lab's cauldron: that is a catch, not a tunnel.
        if (!v) break;
        lowest = Math.max(lowest, v.y - sim.surfaceY(v.x));
      }
      if (sim.view(item.id)) sim.remove(item.id);
    }
    expect(sim.rescues).toBe(0);
    expect(lowest).toBeLessThan(0.05);
  });

  it('launches things that land on a spring straight up its axis', () => {
    const sim = Sim.empty();
    const spring = sim.spawn('item', 'item_spring_coil', FLAT_X, GROUND_Y - 0.31);
    sim.run(30);
    const log = record(sim);
    const ball = sim.spawn('item', 'item_marble_red', FLAT_X, GROUND_Y - 2.5);
    let peak = Infinity;
    for (let t = 0; t < 120; t++) {
      sim.step();
      peak = Math.min(peak, sim.view(ball.id)!.y);
    }
    const [bounce] = find(log, 'spring_bounced');
    expect(bounce).toMatchObject({ id: spring.id, targetId: ball.id });
    // Dropped from 2.5 m, it flies far higher than it fell.
    expect(peak).toBeLessThan(GROUND_Y - 3.5);
  });

  it('pokes: a quick click makes items hop and bugs react', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', FLAT_X, GROUND_Y - 0.21);
    const bug = sim.spawn('bug', 'bug_pillbug_rollo', FLAT_X + 3, GROUND_Y - 0.47);
    sim.run(30);
    const log = record(sim);

    sim.send({ type: 'grab', x: FLAT_X, y: GROUND_Y - 0.21 });
    sim.send({ type: 'poke', x: FLAT_X, y: GROUND_Y - 0.21 });
    sim.step();
    expect(sim.physics.grabbed).toBeNull();
    expect(sim.view(pebble.id)!.vy).toBeLessThan(-2);
    expect(find(log, 'item_poked')[0]?.id).toBe(pebble.id);
    expect(find(log, 'item_dropped')).toHaveLength(0);

    const b = sim.view(bug.id)!;
    sim.send({ type: 'poke', x: b.x, y: b.y });
    sim.step();
    expect(sim.view(bug.id)!.bug!.mode).toBe('st_react');
    expect(find(log, 'bug_poked')[0]?.id).toBe(bug.id);
    sim.run(90);
    expect(['st_idle', 'st_wander', 'st_seek']).toContain(sim.view(bug.id)!.bug!.mode);
  });

  it('drops berries and leaves back in when the plaza runs low', () => {
    const sim = Sim.create({ seed: 'respawn' });
    for (const e of sim.entities.ofKind('item').filter((e) => e.defId === 'item_berry_red')) sim.remove(e.id);
    const log = record(sim);
    sim.run(RESPAWN_TICKS + 1);
    const back = find(log, 'item_respawned');
    expect(back.some((b) => b.defId === 'item_berry_red')).toBe(true);
  });
});

describe('bugs', () => {
  const spawnBug = (sim: Sim, defId: string, x = FLAT_X) => {
    const bug = sim.spawn('bug', defId, x, GROUND_Y - 0.6);
    sim.run(20);
    return bug;
  };

  it('wander on their own and stay in the world', () => {
    const sim = Sim.empty({ seed: 'wander' });
    const bug = spawnBug(sim, 'bug_ladybug_dot');
    const xs = new Set<number>();
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 30; i++) {
      sim.step();
      const v = sim.view(bug.id)!;
      xs.add(Math.round(v.x));
      modes.add(v.bug!.mode);
    }
    expect(modes).toContain('st_wander');
    expect(modes).toContain('st_idle');
    expect(xs.size).toBeGreaterThan(2);
    const v = sim.view(bug.id)!;
    expect(v.x).toBeGreaterThan(0);
    expect(v.x).toBeLessThan(sim.worldWidth);
  });

  it('climb the stump roots to reach its top', () => {
    const sim = Sim.empty({ seed: 'climb' });
    const bug = spawnBug(sim, 'bug_ladybug_dot', PLAZA_X + 9);
    const brain = sim.entities.get(bug.id)!.bug!;
    for (let i = 0; i < 60 * 15; i++) {
      // Keep it walking toward the middle of the stump.
      if (brain.mode === 'st_idle' || brain.mode === 'st_wander') {
        brain.mode = 'st_wander';
        brain.timer = 999;
        brain.targetX = STUMP_X;
        brain.decideIn = 999;
      }
      sim.step();
    }
    const v = sim.view(bug.id)!;
    expect(v.x).toBeCloseTo(STUMP_X, 0);
    expect(v.y).toBeCloseTo(4 - 0.5, 1);
  });

  it('hop over a pebble in the way instead of bulldozing it', () => {
    const sim = Sim.empty({ seed: 'step' });
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 8, GROUND_Y - 0.21);
    const bug = spawnBug(sim, 'bug_pillbug_rollo', PLAZA_X + 6);
    const brain = sim.entities.get(bug.id)!.bug!;
    const log = record(sim);
    for (let i = 0; i < 60 * 8; i++) {
      if (brain.mode === 'st_idle' || brain.mode === 'st_wander') {
        brain.mode = 'st_wander';
        brain.timer = 999;
        brain.targetX = PLAZA_X + 10;
        brain.decideIn = 999;
      }
      sim.step();
    }
    expect(find(log, 'bug_hopped').length).toBeGreaterThan(0);
    expect(sim.view(bug.id)!.x).toBeGreaterThan(PLAZA_X + 9);
    expect(Math.abs(sim.view(pebble.id)!.x - (PLAZA_X + 8))).toBeLessThan(0.8);
  });

  it('go limp when held (st_held), fly when flung (st_airborne), and land on their feet', () => {
    const sim = Sim.empty({ seed: 'fling' });
    const bug = spawnBug(sim, 'bug_snail_glorp');
    const at = sim.view(bug.id)!;
    const log = record(sim);
    sim.send({ type: 'grab', x: at.x, y: at.y });
    sim.step();
    expect(sim.view(bug.id)!.bug!.mode).toBe('st_held');
    sim.send({ type: 'drag', x: at.x, y: at.y - 1 });
    sim.run(20);
    sim.send({ type: 'release', vx: 4, vy: -2 });
    sim.step();
    const flying = sim.view(bug.id)!;
    expect(flying.bug!.mode).toBe('st_airborne');
    expect(find(log, 'item_dropped')[0]).toMatchObject({ vx: 4, vy: -2, flung: true });
    sim.run(120);
    expect(find(log, 'bug_landed')).toHaveLength(1);
    expect(find(log, 'bug_dizzy')).toHaveLength(0);
  });

  it('get dizzy after a hard landing, for the design-doc duration', () => {
    for (const speed of [10, 14, 22]) {
      const sim = Sim.empty({ seed: `dizzy-${speed}` });
      const bug = spawnBug(sim, 'bug_ladybug_dot');
      const log = record(sim);
      const at = sim.view(bug.id)!;
      sim.send({ type: 'grab', x: at.x, y: at.y });
      sim.send({ type: 'drag', x: at.x, y: GROUND_Y - 1.5 });
      sim.run(40);
      // Aim so it hits the ground at `speed`.
      const drop = GROUND_Y - 0.5 - sim.view(bug.id)!.y;
      const down = Math.sqrt(Math.max(0, speed * speed - 2 * 20 * drop));
      sim.send({ type: 'release', vx: 0, vy: down });
      let dizzyTicks = 0;
      for (let t = 0; t < 60 * 12; t++) {
        sim.step();
        if (sim.view(bug.id)!.bug!.mode === 'st_dizzy') dizzyTicks++;
      }
      const [dizzy] = find(log, 'bug_dizzy');
      expect(dizzy, `landing at ${speed}`).toBeDefined();
      expect(dizzy!.speed).toBeGreaterThanOrEqual(DIZZY_SPEED);
      expect(dizzy!.speed).toBeCloseTo(speed, 0);
      const expected = dizzySeconds(dizzy!.speed);
      expect(Math.abs(dizzyTicks / 60 - expected)).toBeLessThanOrEqual(0.1);
      expect(find(log, 'bug_recovered')).toHaveLength(1);
    }
  });

  it('stay on their feet after a soft landing', () => {
    const sim = Sim.empty({ seed: 'soft' });
    const bug = spawnBug(sim, 'bug_ladybug_dot');
    const at = sim.view(bug.id)!;
    const log = record(sim);
    sim.send({ type: 'grab', x: at.x, y: at.y });
    sim.send({ type: 'drag', x: at.x, y: at.y - 1 });
    sim.run(30);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(90);
    expect(find(log, 'bug_landed')).toHaveLength(1);
    expect(find(log, 'bug_landed')[0]!.speed).toBeLessThan(DIZZY_SPEED);
    expect(find(log, 'bug_dizzy')).toHaveLength(0);
  });

  it('Rollo curls into a rolling ball when flung, then stands back up', () => {
    const sim = Sim.empty({ seed: 'rollo' });
    const bug = spawnBug(sim, 'bug_pillbug_rollo');
    const at = sim.view(bug.id)!;
    sim.send({ type: 'grab', x: at.x, y: at.y });
    sim.send({ type: 'drag', x: at.x, y: at.y - 2 });
    sim.run(30);
    sim.send({ type: 'release', vx: 7, vy: -3 });
    sim.step();
    expect(sim.isRolling(bug.id)).toBe(true);
    let spun = 0;
    for (let t = 0; t < 60 * 10 && sim.view(bug.id)!.bug!.mode === 'st_airborne'; t++) {
      sim.step();
      spun = Math.max(spun, Math.abs(sim.view(bug.id)!.av));
    }
    expect(spun).toBeGreaterThan(1);
    sim.run(60 * 8);
    expect(sim.isRolling(bug.id)).toBe(false);
    expect(sim.view(bug.id)!.angle).toBeCloseTo(0);
  });

  it('eat a berry within 20 s when hungry (hunger 10, berry in range)', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      for (const defId of ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp']) {
        const sim = Sim.empty({ seed });
        const bug = sim.spawn('bug', defId, PLAZA_X + 5, GROUND_Y - 0.6);
        const berry = sim.spawn('item', 'item_berry_red', PLAZA_X + 8.5, GROUND_Y - 0.18);
        sim.entities.get(bug.id)!.bug!.needs.need_hunger = 10;
        const log = record(sim);
        let ateAt = -1;
        for (let t = 0; t < 60 * 20 && ateAt < 0; t++) {
          sim.step();
          if (find(log, 'bug_ate').length > 0) ateAt = t;
        }
        expect(ateAt, `${defId} seed ${seed}`).toBeGreaterThan(0);
        expect(sim.entities.has(berry.id)).toBe(false);
        const [ate] = find(log, 'bug_ate');
        expect(ate).toMatchObject({ id: bug.id, itemId: berry.id, itemDefId: 'item_berry_red' });
        expect(sim.view(bug.id)!.bug!.needs.need_hunger).toBeGreaterThan(25);
      }
    }
  });

  it('two bugs never go for the same berry', () => {
    const sim = Sim.empty({ seed: 'share' });
    const a = sim.spawn('bug', 'bug_ladybug_dot', PLAZA_X + 5, GROUND_Y - 0.6);
    const b = sim.spawn('bug', 'bug_pillbug_rollo', PLAZA_X + 10, GROUND_Y - 0.6);
    sim.spawn('item', 'item_berry_red', PLAZA_X + 7.5, GROUND_Y - 0.18);
    for (const id of [a.id, b.id]) sim.entities.get(id)!.bug!.needs.need_hunger = 5;
    for (let t = 0; t < 60 * 10; t++) {
      sim.step();
      const targets = [a.id, b.id]
        .map((id) => sim.entities.get(id)!.bug!)
        .filter((brain) => brain.mode === 'st_seek' || brain.mode === 'st_eat')
        .map((brain) => brain.targetId);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('bounce on the spring for fun when bored, and never get dizzy from it', () => {
    const sim = Sim.empty({ seed: 'boing' });
    const spring = sim.spawn('item', 'item_spring_coil', PLAZA_X + 9, GROUND_Y - 0.31);
    const bug = sim.spawn('bug', 'bug_ladybug_dot', PLAZA_X + 6, GROUND_Y - 0.6);
    const brain = sim.entities.get(bug.id)!.bug!;
    brain.needs.need_fun = 5;
    brain.needs.need_hunger = 100;
    const log = record(sim);
    sim.run(60 * 20);
    const used = find(log, 'bug_used').filter((u) => u.action === 'bounce');
    expect(used.length).toBeGreaterThan(0);
    expect(used[0]).toMatchObject({ id: bug.id, targetId: spring.id, action: 'bounce' });
    expect(find(log, 'spring_bounced').some((e) => e.targetId === bug.id)).toBe(true);
    expect(find(log, 'bug_dizzy')).toHaveLength(0);
    expect(brain.needs.need_fun).toBeGreaterThan(20);
  });

  it('get hungrier over time', () => {
    const sim = Sim.empty({ seed: 'decay' });
    const bug = spawnBug(sim, 'bug_snail_glorp');
    const before = { ...sim.view(bug.id)!.bug!.needs };
    sim.run(60 * 10);
    const after = sim.view(bug.id)!.bug!.needs;
    // Glorp's hunger weight is 1.2: 0.25/s * 1.2 * 10 s = 3.
    expect(before.need_hunger - after.need_hunger).toBeCloseTo(3, 0);
    expect(after.need_fun).toBeLessThan(before.need_fun);
  });

  it('never end up inside the ground in a busy starting world', () => {
    const sim = Sim.create({ seed: 'busy' });
    sim.run(60 * 60);
    expect(sim.rescues).toBe(0);
    for (const v of sim.views()) expect(v.y).toBeLessThan(sim.surfaceY(v.x));
  });
});

describe('determinism', () => {
  const script = (sim: Sim): void => {
    for (let t = 0; t < 900; t++) {
      if (t === 100) sim.send({ type: 'grab', x: PLAZA_X + 7, y: GROUND_Y - 0.1 });
      if (t > 100 && t < 130) sim.send({ type: 'drag', x: PLAZA_X + 7 + (t - 100) * 0.1, y: 5 });
      if (t === 130) sim.send({ type: 'release', vx: 6, vy: -4 });
      if (t === 200) sim.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x: PLAZA_X + 12, y: 2 });
      if (t === 300) sim.send({ type: 'poke', x: PLAZA_X + 7, y: GROUND_Y - 0.3 });
      sim.step();
    }
  };

  it('same seed and commands give an identical world', () => {
    const a = Sim.create({ seed: 'same' });
    const b = Sim.create({ seed: 'same' });
    script(a);
    script(b);
    expect(a.serialize()).toEqual(b.serialize());
  });

  it('different seeds diverge', () => {
    const a = Sim.create({ seed: 'one' });
    const b = Sim.create({ seed: 'two' });
    script(a);
    script(b);
    expect(a.serialize()).not.toEqual(b.serialize());
  });
});

describe('debug commands', () => {
  it('drops a spawn with an unknown def or a bad spot instead of throwing (R33)', () => {
    const sim = Sim.empty();
    const before = sim.entities.size;
    sim.send({ type: 'spawn', kind: 'item', defId: 'item_no_such_thing', x: PLAZA_X + 7, y: 3 });
    sim.send({ type: 'spawn', kind: 'bug', defId: 'bug_nobody', x: PLAZA_X + 7, y: 3 });
    sim.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x: Number.NaN, y: 3 });
    expect(() => sim.step()).not.toThrow();
    expect(sim.entities.size).toBe(before);
    sim.send({ type: 'spawn', kind: 'item', defId: 'item_pebble', x: PLAZA_X + 7, y: 3 });
    sim.step();
    expect(sim.entities.size).toBe(before + 1);
  });
});

describe('grab targeting', () => {
  it('grabs the thing whose shape is under the hand, not a newer neighbor whose padded edge reaches it (R02)', () => {
    const sim = Sim.empty();
    const button = sim.spawn('item', 'item_button', PLAZA_X + 7, GROUND_Y - 0.14);
    // Newer (drawn on top), lying 5 cm to the right of the button's edge: within the 0.2 m grab pad of its center.
    const clip = sim.spawn('item', 'item_paperclip', PLAZA_X + 7 + 0.13 + 0.05 + 0.22, GROUND_Y - 0.06);
    sim.run(60);
    const b = sim.view(button.id)!;
    expect(sim.physics.bodyAt(b.x, b.y, 0.2)).toBe(button.id);
    // Between the two, nearer the clip: the clip.
    const c = sim.view(clip.id)!;
    expect(sim.physics.bodyAt(c.x - 0.22 - 0.01, c.y, 0.2)).toBe(clip.id);
    // Off both but within the pad of the button only: the button.
    expect(sim.physics.bodyAt(b.x - 0.13 - 0.1, b.y, 0.2)).toBe(button.id);
    // Where one lies on another, the one on top (the newer) wins, as drawn.
    const pebble = sim.spawn('item', 'item_pebble', b.x, b.y - 0.5);
    sim.run(60);
    const p = sim.view(pebble.id)!;
    expect(sim.physics.bodyAt(p.x, p.y, 0.2)).toBe(pebble.id);
  });
});

describe('letting go', () => {
  it('a thing picked up and let go at the bottom of a stack stays on the ground, not in it', () => {
    const sim = Sim.empty();
    const x = PLAZA_X + 6.3;
    const caps = [0, 1, 2].map((i) => sim.spawn('item', 'item_bottle_cap', x, GROUND_Y - 0.09 - i * 0.17).id);
    sim.run(60);
    const before = caps.map((id) => sim.view(id)!.y);
    const s = sim.view(caps[0]!)!;
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    expect(sim.physics.grabbed).toBe(caps[0]);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.run(120);
    caps.forEach((id, i) => expect(sim.view(id)!.y).toBeCloseTo(before[i]!, 1));
    expect(sim.rescues).toBe(0);
  });
});
