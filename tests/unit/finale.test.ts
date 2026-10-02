import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import { FINALE_TICKS } from '../../src/game/systems/hollow';
import { hourOf } from '../../src/game/systems/sky';
import { HOLLOW_X, PLAZA_X } from './world';

// The finale (game design doc, section 12, `secret_golden_marble_home`):
// the golden marble on Gnome Hollow's moon pedestal.

const HOLLOW = 'area_gnome_hollow';

function hollowWorld(found: readonly string[]): Sim {
  const sim = Sim.create({ seed: 'finale' });
  sim.step();
  sim.barriers.state.open.push(HOLLOW);
  sim.barriers.restore(sim.barriers.state);
  sim.secrets.push(...found);
  sim.send({ type: 'focus', x0: HOLLOW_X, x1: HOLLOW_X + 19.2 });
  sim.step();
  return sim;
}

const CHAIN = [
  'secret_treasure_map',
  'secret_sundial_midnight',
  'secret_golden_marble',
  'secret_ant_sugar',
  'secret_root_pull',
  'secret_gnome_inside',
];

describe('secret_golden_marble_home', () => {
  it('the golden marble on the moon pedestal: a night of bug-shaped fireworks over the stump', () => {
    const sim = hollowWorld(CHAIN);
    const fireworks: string[] = [];
    sim.events.on('firework_burst', (e) => fireworks.push(e.defId));
    const cup = sim.hidden.hollow.cup()!;
    sim.spawn('item', 'item_marble_gold', cup.x + 0.1, cup.y - 0.4);
    sim.run(60);
    expect(sim.secrets).toContain('secret_golden_marble_home');
    expect(sim.book().secrets.find((e) => e.id === 'secret_golden_marble_home')?.state).toBe('discovered');
    expect(sim.hidden.hollow.finaleAge).toBeGreaterThanOrEqual(0);
    const hour = hourOf(sim.weather.clock);
    expect(hour).toBeGreaterThan(19);
    expect(hour).toBeLessThan(20);
    // The camera goes out to the plaza for the show.
    sim.send({ type: 'focus', x0: PLAZA_X + 10, x1: PLAZA_X + 29.2 });
    sim.run(FINALE_TICKS);
    expect(fireworks.length).toBeGreaterThanOrEqual(8);
    expect(new Set(fireworks).size).toBeGreaterThan(3);
    expect(sim.hidden.hollow.state.finale).toBe(-2);
    // Every bug in the world came to the plaza.
    for (const bug of sim.entities.ofKind('bug')) {
      if (bug.bug?.pending) continue;
      const x = sim.physics.getState(bug.id).x;
      expect(x, bug.defId).toBeGreaterThan(PLAZA_X);
      expect(x, bug.defId).toBeLessThan(PLAZA_X + 38.4);
    }
    void GROUND_Y;
  });

  it('cannot fire before secret_golden_marble', () => {
    const sim = hollowWorld(CHAIN.filter((s) => s !== 'secret_golden_marble'));
    const cup = sim.hidden.hollow.cup()!;
    sim.spawn('item', 'item_marble_gold', cup.x + 0.1, cup.y - 0.4);
    sim.run(60);
    expect(sim.secrets).not.toContain('secret_golden_marble_home');
    expect(sim.hidden.hollow.finaleAge).toBe(-1);
  });
});
