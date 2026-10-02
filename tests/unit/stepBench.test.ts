import { describe, expect, it } from 'vitest';
import { Rng, Sim } from '../../src/game';
import { PLAZA_X } from './world';

/**
 * R12 of the post-M8 review and P-08 of the pre-release review: M12 asks
 * for 16 bugs and 150 items at 60 fps. This is that scene, crowded into the
 * plaza with the camera on it, and a step must stay well inside a frame.
 * It times this process's CPU, not the clock. It runs on its own
 * (`pnpm test:perf`, its own CI step), because beside other test files on
 * CI's runner, cores shared with them make the same work cost more CPU time.
 * The bars are about 1.5 times what CI's runner measures (P-28).
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
    // CI's runner, alone: 2.4 to 2.9 ms, and 7.4 to 9.5 ms at p99 (October 2026).
    expect(avg).toBeLessThan(4.5);
    expect(p99).toBeLessThan(14);
  }, 60_000);
});
