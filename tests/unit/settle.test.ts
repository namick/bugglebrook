import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim, SIM_DT } from '../../src/game';
import type { EntityId } from '../../src/game';
import { PLAZA_X } from './world';

/**
 * R12 of the post-M8 review: things that have come to rest settle (turn
 * static in the physics) so a crowded plaza costs little, and wake again
 * whenever something should move them.
 */

const X = PLAZA_X + 7;
const CUBE = 0.3;
const GAP = 0.15;

/** Three sugar cubes in a row on flat ground and one on top of the middle one, left to settle. */
function pile(sim: Sim): { row: EntityId[]; top: EntityId } {
  const row = [0, 1, 2].map(
    (i) => sim.spawn('item', 'item_sugar_cube', X + i * (CUBE + GAP), GROUND_Y - CUBE / 2).id,
  );
  const top = sim.spawn('item', 'item_sugar_cube', X + CUBE + GAP, GROUND_Y - CUBE * 1.5).id;
  sim.run(180);
  return { row, top };
}

function poses(sim: Sim, ids: EntityId[]): { x: number; y: number; angle: number }[] {
  return ids.map((id) => {
    const v = sim.view(id)!;
    return { x: v.x, y: v.y, angle: v.angle };
  });
}

function moved(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('settling (R12)', () => {
  it('settles a pile that has come to rest', () => {
    const sim = Sim.empty();
    const { row, top } = pile(sim);
    for (const id of [...row, top]) {
      expect(sim.physics.isSettled(id)).toBe(true);
      expect(sim.physics.isAwake(id)).toBe(false);
    }
    // Settled things still touch: the setup rule and the property rules see the stack.
    const pairs = sim.physics.restingPairs();
    expect(pairs).toContainEqual([row[1]!, top].sort((a, b) => a - b));
    expect(sim.physics.supportBody(top)).toBe(row[1]);
    expect(sim.physics.isSupported(top)).toBe(true);
    // And keep their mass for whoever weighs them.
    expect(sim.physics.mass(top)).toBeGreaterThan(0);
  });

  it('keeps a resting pile settled and in place while a bug walks through it', () => {
    const sim = Sim.empty();
    const { row, top } = pile(sim);
    const ids = [...row, top];
    const before = poses(sim, ids);
    const bug = sim.spawn('bug', 'bug_ladybug_dot', X - 1.5, GROUND_Y - 0.4);
    const physics = sim.physics;
    // Walk it straight through, the way the AI drives a walk: a velocity every step.
    for (let i = 0; i < 240; i++) {
      physics.setVelocity(bug.id, 1.2, physics.velocity(bug.id).y);
      physics.step(SIM_DT);
      for (const id of ids) expect(physics.isSettled(id)).toBe(true);
    }
    expect(physics.position(bug.id).x).toBeGreaterThan(X + (CUBE + GAP) * 3);
    poses(sim, ids).forEach((p, i) => expect(moved(p, before[i]!)).toBeLessThan(1e-6));
  });

  it('lets a walking bug slip past things at rest without pushing them or counting them as contacts', () => {
    const sim = Sim.empty();
    const { row, top } = pile(sim);
    const ids = [...row, top];
    const bug = sim.spawn('bug', 'bug_ladybug_dot', X - 1.5, GROUND_Y - 0.4);
    const physics = sim.physics;
    let overlapped = false;
    for (let i = 0; i < 240; i++) {
      physics.setVelocity(bug.id, 1.2, physics.velocity(bug.id).y);
      physics.step(SIM_DT);
      const x = physics.position(bug.id).x;
      overlapped ||= x > X && x < X + (CUBE + GAP) * 2;
      // No force passes between them, so nothing that asks what the bug pushes (the setup rule) sees them.
      for (const c of physics.contactsOf(bug.id)) expect(ids).not.toContain(c.other);
    }
    expect(overlapped).toBe(true);
  });

  it('keeps a bug slipping past a thing when the thing wakes under it', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', X + 0.6, GROUND_Y - 0.2);
    sim.run(120);
    expect(sim.physics.isSettled(pebble.id)).toBe(true);
    const bug = sim.spawn('bug', 'bug_ladybug_dot', X - 0.6, GROUND_Y - 0.4);
    const physics = sim.physics;
    const walk = (): void => {
      physics.setVelocity(bug.id, 0.6, physics.velocity(bug.id).y);
      physics.step(SIM_DT);
    };
    // Walk in until the bug is halfway over the pebble.
    for (let i = 0; i < 240 && physics.position(bug.id).x < X + 0.3; i++) walk();
    const bugAt = physics.position(bug.id).y;
    const pebbleAt = sim.view(pebble.id)!;
    // Something wakes the pebble: it gets new contacts, and the pair keeps slipping instead of popping apart.
    physics.setFriction(pebble.id, 0.1);
    expect(physics.isSettled(pebble.id)).toBe(false);
    for (let i = 0; i < 10; i++) walk();
    expect(Math.abs(physics.position(bug.id).y - bugAt)).toBeLessThan(0.02);
    expect(moved(sim.view(pebble.id)!, pebbleAt)).toBeLessThan(0.02);
  });

  it('stops slipping when a bug stops in a thing: it ends up standing on it, not inside it (PM-02)', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', X + 0.6, GROUND_Y - 0.2);
    sim.run(120);
    const bug = sim.spawn('bug', 'bug_ladybug_dot', X - 0.6, GROUND_Y - 0.4);
    const physics = sim.physics;
    for (let i = 0; i < 120 && physics.position(bug.id).x < X + 0.6; i++) {
      physics.setVelocity(bug.id, 1.2, physics.velocity(bug.id).y);
      physics.step(SIM_DT);
    }
    const r = sim.content.bugs.get('bug_ladybug_dot').radius;
    const p = sim.view(pebble.id)!;
    // Walking, it is right over the pebble.
    expect(Math.abs(physics.position(bug.id).x - p.x)).toBeLessThan(r * 0.3);
    expect(physics.position(bug.id).y - p.y).toBeGreaterThan(-r);
    // It stops: the pebble pushes it out.
    for (let i = 0; i < 30; i++) {
      physics.setVelocity(bug.id, 0, physics.velocity(bug.id).y);
      physics.step(SIM_DT);
    }
    const b = physics.position(bug.id);
    const q = sim.view(pebble.id)!;
    expect(Math.hypot(b.x - q.x, b.y - q.y)).toBeGreaterThan(r);
  });

  it('never leaves a bug resting inside a settled heap it was dropped on (PM-02)', () => {
    const KINDS = [
      'item_pebble',
      'item_cork',
      'item_sugar_cube',
      'item_blueberry',
      'item_berry_red',
      'item_button',
    ];
    for (const [bugId, dx] of [
      ['bug_pillbug_rollo', -0.2],
      ['bug_ladybug_dot', -0.2],
      ['bug_pillbug_rollo', 0.8],
      ['bug_ladybug_dot', 1.2],
    ] as const) {
      const sim = Sim.empty({ seed: 'heap' });
      sim.step();
      const heap: EntityId[] = [];
      for (let i = 0; i < 24; i++) {
        const col = i % 6;
        const row = Math.floor(i / 6);
        const x = X + col * 0.3 + (row % 2) * 0.15;
        heap.push(sim.spawn('item', KINDS[i % KINDS.length]!, x, GROUND_Y - 0.3 - row * 0.35).id);
      }
      sim.run(300);
      expect(heap.filter((id) => sim.physics.isSettled(id)).length).toBeGreaterThan(12);
      // A hungry bug let go over the heap, its favorite food on the far side.
      const bug = sim.spawn('bug', bugId, X + dx, GROUND_Y - 1.6);
      sim.send({ type: 'set_need', id: bug.id, need: 'need_hunger', value: 10 });
      sim.spawn('item', 'item_rotten_banana_bit', X + 4, GROUND_Y - 0.3);
      const r = sim.content.bugs.get(bugId).radius;
      // How long it stays still with a heap thing's middle well inside it.
      let run = 0;
      let longest = 0;
      for (let t = 0; t < 900; t++) {
        sim.step();
        const b = sim.view(bug.id)!;
        const inside = heap.some((id) => {
          const v = sim.view(id);
          return v && Math.hypot(v.x - b.x, v.y - b.y) < 0.75 * r;
        });
        run = inside && Math.hypot(b.vx, b.vy) < 0.05 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      expect(longest, `${bugId} at ${dx}`).toBeLessThan(10);
    }
  });

  it('wakes a settled thing in the hand, and what rests on it', () => {
    const sim = Sim.empty();
    const { row, top } = pile(sim);
    const under = sim.view(row[1]!)!;
    const before = sim.view(top)!;
    sim.send({ type: 'grab', x: under.x, y: under.y });
    sim.step();
    expect(sim.physics.grabbed).toBe(row[1]);
    expect(sim.physics.isSettled(row[1]!)).toBe(false);
    expect(sim.physics.isSettled(top)).toBe(false);
    // Lift it: the top one comes up with it, as it would have before it settled.
    for (let i = 1; i <= 30; i++) {
      sim.send({ type: 'drag', x: under.x, y: under.y - (i / 30) * 0.8 });
      sim.step();
    }
    expect(sim.view(row[1]!)!.y).toBeLessThan(under.y - 0.5);
    expect(sim.view(top)!.y).toBeLessThan(before.y - 0.4);
  });

  it('wakes a settled pile when something is thrown into it', () => {
    const sim = Sim.empty();
    const { row, top } = pile(sim);
    const ids = [...row, top];
    const before = poses(sim, ids);
    const pebble = sim.spawn('item', 'item_pebble', X - 1.2, GROUND_Y - 0.2);
    sim.physics.setVelocity(pebble.id, 7, 0);
    sim.run(60);
    const shift = Math.max(...poses(sim, ids).map((p, i) => moved(p, before[i]!)));
    expect(shift).toBeGreaterThan(0.05);
  });

  it('wakes a settled thing a bug picks up and carries', () => {
    const sim = Sim.empty();
    const pebble = sim.spawn('item', 'item_pebble', X + 0.6, GROUND_Y - 0.2);
    sim.run(120);
    expect(sim.physics.isSettled(pebble.id)).toBe(true);
    const before = sim.view(pebble.id)!;
    const dot = sim.spawn('bug', 'bug_ladybug_dot', X, GROUND_Y - 0.4);
    // As if Dot had picked it up: in her front legs.
    dot.bug!.carrying = pebble.id;
    sim.carried.set(pebble.id, dot.id);
    sim.step();
    expect(sim.physics.isSettled(pebble.id)).toBe(false);
    expect(moved(sim.view(pebble.id)!, before)).toBeGreaterThan(0.05);
  });

  it('wakes a settled thing when a system pushes it', () => {
    const sim = Sim.empty();
    const cube = sim.spawn('item', 'item_sugar_cube', X, GROUND_Y - CUBE / 2);
    sim.run(120);
    expect(sim.physics.isSettled(cube.id)).toBe(true);
    // Asking it to keep still changes nothing.
    sim.physics.setVelocity(cube.id, 0, 0);
    expect(sim.physics.isSettled(cube.id)).toBe(true);
    sim.physics.applyImpulse(cube.id, 0, -sim.physics.mass(cube.id) * 4);
    expect(sim.physics.isSettled(cube.id)).toBe(false);
    sim.run(10);
    expect(sim.view(cube.id)!.y).toBeLessThan(GROUND_Y - CUBE);
  });

  it('wakes what rests on a settled thing when it is eaten, pocketed, or removed', () => {
    for (const how of ['remove', 'inactive'] as const) {
      const sim = Sim.empty();
      const { row, top } = pile(sim);
      const y = sim.view(top)!.y;
      if (how === 'remove') sim.remove(row[1]!);
      else sim.physics.setActive(row[1]!, false);
      expect(sim.physics.isSettled(top)).toBe(false);
      sim.run(60);
      // It drops into the gap between the other two.
      expect(sim.view(top)!.y).toBeGreaterThan(y + CUBE * 0.8);
    }
  });

  it('wakes a settled thing when what holds it up moves away', () => {
    const sim = Sim.empty();
    const cube = sim.spawn('item', 'item_sugar_cube', X, GROUND_Y - CUBE / 2);
    sim.run(60);
    // Something lands on it and settles there before the cube under it does.
    const top = sim.spawn('item', 'item_sugar_cube', X, GROUND_Y - CUBE * 1.5);
    sim.run(120);
    expect(sim.physics.isSettled(top.id)).toBe(true);
    const y = sim.view(top.id)!.y;
    // The one underneath is shoved out by something heavy and slow: no wake for the top one on its way in.
    sim.physics.setPosition(cube.id, X + 1, GROUND_Y - CUBE / 2);
    sim.run(60);
    expect(sim.view(top.id)!.y).toBeGreaterThan(y + CUBE * 0.8);
  });

  it('settles and wakes the same way in two runs', () => {
    const run = (): string => {
      const sim = Sim.empty({ seed: 'settle' });
      const { row } = pile(sim);
      const pebble = sim.spawn('item', 'item_pebble', X - 1.2, GROUND_Y - 0.2);
      sim.physics.setVelocity(pebble.id, 7, 0);
      sim.run(240);
      return JSON.stringify([...row, pebble.id].map((id) => [sim.view(id), sim.physics.isSettled(id)]));
    };
    expect(run()).toBe(run());
  });
});
