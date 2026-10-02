import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import { PLAZA_X } from './world';

/** R12 of the post-M8 review: what keeps a busy step cheap. The benchmark itself is `stepBench.test.ts`. */
describe('step cost (R12)', () => {
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
