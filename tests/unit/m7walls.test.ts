import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game';

// M7 (game design doc, sections 3 and 19): the locked barriers' walls hold
// for 10 minutes. In its own file so the long run goes beside the rest.

describe('barriers over a long run', () => {
  it(
    'walls stop things flung at a locked barrier, and bugs never cross one (10 minutes)',
    { timeout: 180_000 },
    () => {
      const sim = Sim.create({ seed: 'walls' });
      const span = sim.barriers.span();
      const pebble = sim.spawn('item', 'item_pebble', span.x0 + 3, 7);
      sim.physics.setVelocity(pebble.id, -20, -2);
      const ball = sim.spawn('item', 'item_rubber_ball', span.x1 - 3, 7);
      sim.physics.setVelocity(ball.id, 22, -2);
      for (let t = 0; t < 10 * 60 * 60; t++) {
        sim.step();
        if (t % 30 !== 0) continue;
        for (const b of sim.entities.ofKind('bug')) {
          const v = sim.view(b.id)!;
          if (v.x < span.x0 || v.x > span.x1) {
            // Only the hidden bugs waiting in locked areas live out there.
            expect(v.bug!.pending, `${v.defId} crossed a barrier`).toBeDefined();
          }
        }
      }
      expect(sim.view(pebble.id)!.x).toBeGreaterThan(span.x0);
      expect(sim.view(ball.id)!.x).toBeLessThan(span.x1);
    },
  );
});
