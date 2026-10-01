import { describe, expect, it } from 'vitest';
import { GROUND_Y, Rng, Sim } from '../../src/game';
import { PLAZA_X } from './world';

/**
 * R12 of the post-M8 review: M12 asks for 16 bugs and 150 items at 60 fps.
 * This is that scene, crowded into the plaza with the camera on it, and a
 * step must stay well inside a frame. On a quiet desktop it averages about
 * 2.5 ms with a 99th percentile near 5 ms. CI runners are slower and
 * shared, so the bar here is generous; it catches a step that has become
 * several times slower, not a few percent. It times this process's CPU,
 * not the clock, so other test files running beside it do not count.
 */
function crowdedPlaza(): Sim {
  const sim = Sim.create({ seed: 'bench' });
  sim.send({ type: 'focus', x0: PLAZA_X + 5, x1: PLAZA_X + 24.2 });
  const r = new Rng('stuff');
  const items = sim.content.items.all.filter(
    (d) => (!d.unpocketable && d.adverts.length > 0) || d.tags.includes('tag_edible'),
  );
  const bugs = sim.content.bugs.all;
  for (let i = 0; i < 150; i++) {
    const d = items[Math.floor(r.next() * items.length)]!;
    sim.spawn('item', d.id, PLAZA_X + 2 + r.next() * 34, 1 + r.next() * 3);
  }
  for (let i = 0; i < 16; i++) {
    const e = sim.spawn('bug', bugs[i % bugs.length]!.id, PLAZA_X + 2 + r.next() * 34, 2);
    if (e.bug) delete e.bug.pending;
  }
  return sim;
}

describe('step cost (R12)', () => {
  it('steps a plaza of 150 extra things and 16 extra bugs well inside a frame', () => {
    const sim = crowdedPlaza();
    sim.run(300);
    const times: number[] = [];
    for (let i = 0; i < 600; i++) {
      const t = process.cpuUsage();
      sim.step();
      const used = process.cpuUsage(t);
      times.push((used.user + used.system) / 1000);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p99 = times[Math.floor(times.length * 0.99)]!;
    console.log(`crowded plaza step: avg ${avg.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms`);
    expect(avg).toBeLessThan(9);
    expect(p99).toBeLessThan(30);
  }, 60_000);

  it('lets a bug standing still on flat ground fall asleep in the physics, and wakes it to walk', () => {
    const sim = Sim.empty();
    const bug = sim.spawn('bug', 'bug_snail_glorp', PLAZA_X + 7, GROUND_Y - 1);
    for (const need of ['need_hunger', 'need_fun', 'need_energy', 'need_social', 'need_clean'] as const)
      sim.send({ type: 'set_need', id: bug.id, need, value: 100 });
    let slept = false;
    for (let i = 0; i < 600 && !slept; i++) {
      sim.step();
      slept = bug.bug!.mode === 'st_idle' && !sim.physics.isAwake(bug.id);
    }
    expect(slept).toBe(true);
    // Asleep in the physics is not asleep in the AI: it still walks off when it decides to.
    const x = sim.view(bug.id)!.x;
    sim.send({ type: 'set_need', id: bug.id, need: 'need_fun', value: 0 });
    sim.run(1200);
    expect(Math.abs(sim.view(bug.id)!.x - x)).toBeGreaterThan(0.2);
  });

  it('skips the time-of-impact pass when nothing moves fast, and still stops a fast thing at the ground', () => {
    const sim = Sim.empty();
    const petal = sim.spawn('item', 'item_petal', PLAZA_X + 7, GROUND_Y - 0.3);
    sim.run(120);
    expect(sim.physics.isAwake(petal.id)).toBe(false);
    // Thin and fast, straight down: only continuous collision keeps it above ground.
    sim.physics.place(petal.id, PLAZA_X + 7, GROUND_Y - 2, 0);
    sim.physics.setVelocity(petal.id, 0, 30);
    sim.run(30);
    expect(sim.view(petal.id)!.y).toBeLessThan(GROUND_Y);
    expect(sim.rescues).toBe(0);
  });
});
