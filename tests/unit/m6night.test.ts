import { describe, expect, it } from 'vitest';
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { Rng } from '../../src/game/core/rng';
import { BUGS } from '../../src/game/data/bugs';
import { DECAY, NIGHT_ENERGY, decayNeeds } from '../../src/game/systems/needs';
import { newBugBrain } from '../../src/game/systems/bugAi';

// M6 (game design doc, sections 11 and 19): the long runs, night and a
// determinism check, in their own file so they run beside the rest.

type Logged = { name: keyof GameEvents; tick: number; payload: Record<string, unknown> };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) =>
    log.push({ name, tick: sim.tick, payload: payload as Record<string, unknown> }),
  );
  return log;
}

const byDef = (sim: Sim, defId: string): number =>
  sim.entities.ofKind('bug').find((b) => b.defId === defId)!.id;

/** Everyone full, so nobody wanders off to eat what a test stages. */
function calm(sim: Sim): void {
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
}

describe('weather, over a long run', () => {
  it(
    'is deterministic: two worlds with the same seed have the same weather and clock',
    { timeout: 240_000 },
    () => {
      const a = Sim.create({ seed: 'twins' });
      const b = Sim.create({ seed: 'twins' });
      for (const s of [a, b]) {
        s.send({ type: 'dial_turn', minutes: 200 });
        s.run(30 * 60);
        s.send({ type: 'dial_release' });
        s.run(8 * 60 * 60);
      }
      expect(JSON.stringify(a.serialize())).toBe(JSON.stringify(b.serialize()));
    },
  );
});

describe('night', () => {
  const DAY_BUGS = ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp', 'bug_grasshopper_boing'];

  it(
    'day bugs with energy under 50 are asleep within 60 s at night, and the AI never wakes them',
    { timeout: 60_000 },
    () => {
      const sim = Sim.create({ seed: 'night' });
      calm(sim);
      sim.run(30);
      sim.send({ type: 'set_time', hour: 20.5 });
      const ids = DAY_BUGS.map((d) => byDef(sim, d));
      for (const id of ids) sim.send({ type: 'set_need', id, need: 'need_energy', value: 40 });
      const log = record(sim);
      sim.run(60 * 60);
      for (const id of ids) expect(sim.view(id)!.bug!.mode, sim.view(id)!.defId).toBe('st_sleep');
      // They sleep through the night, rested or not.
      sim.run(5 * 60 * 60);
      for (const id of ids) expect(sim.view(id)!.bug!.mode).toBe('st_sleep');
      const woke = log.filter((e) => e.name === 'bug_woke' && ids.includes(e.payload.id as number));
      expect(woke).toEqual([]);
    },
  );

  it('even rested day bugs go to bed at night, and wake at dawn once rested', () => {
    const sim = Sim.create({ seed: 'dawn' });
    calm(sim);
    sim.send({ type: 'set_time', hour: 21 });
    const ids = DAY_BUGS.map((d) => byDef(sim, d));
    for (const id of ids) sim.send({ type: 'set_need', id, need: 'need_energy', value: 90 });
    sim.run(60 * 60);
    for (const id of ids) expect(sim.view(id)!.bug!.mode).toBe('st_sleep');
    sim.send({ type: 'set_time', hour: 6.3 });
    sim.run(20 * 60);
    for (const id of ids) expect(sim.view(id)!.bug!.mode).not.toBe('st_sleep');
  });

  it('a woken bug at night is groggy, stays up a while, then goes back to bed', () => {
    const sim = Sim.create({ seed: 'renap' });
    calm(sim);
    sim.send({ type: 'set_time', hour: 22 });
    sim.run(60 * 60);
    const glorp = byDef(sim, 'bug_snail_glorp');
    expect(sim.view(glorp)!.bug!.mode).toBe('st_sleep');
    const g = sim.view(glorp)!;
    sim.send({ type: 'poke', x: g.x, y: g.y });
    sim.step();
    expect(sim.view(glorp)!.bug!.groggy).toBe(true);
    sim.run(10 * 60);
    expect(sim.view(glorp)!.bug!.mode).not.toBe('st_sleep');
    sim.run(25 * 60);
    expect(sim.view(glorp)!.bug!.mode).toBe('st_sleep');
  });

  it('energy runs down 2.5 times faster up past bedtime', () => {
    const def = BUGS.get('bug_ladybug_dot');
    const a = newBugBrain(0, new Rng('a'));
    const b = newBugBrain(0, new Rng('a'));
    a.mode = b.mode = 'st_wander';
    decayNeeds(a, def, 60);
    decayNeeds(b, def, 60, false, true);
    // One second: the extra night loss is the base rate times (2.5 - 1).
    const extra = a.needs.need_energy - b.needs.need_energy;
    expect(extra).toBeCloseTo(DECAY.need_energy * def.needWeights.need_energy * (NIGHT_ENERGY - 1), 6);
  });

  it('glowing things warm up bugs close by at night (R16)', () => {
    const sim = Sim.create({ seed: 'campfire' });
    const rollo = byDef(sim, 'bug_pillbug_rollo');
    const r = sim.view(rollo)!;
    sim.spawn('item', 'item_moon_pebble', r.x + 0.9, GROUND_Y - 0.3);
    sim.send({ type: 'set_time', hour: 22 });
    sim.send({ type: 'set_need', id: rollo, need: 'need_social', value: 20 });
    sim.send({ type: 'set_need', id: rollo, need: 'need_energy', value: 100 });
    sim.step();
    // Awake (poked), next to the light.
    const v = sim.view(rollo)!;
    sim.send({ type: 'poke', x: v.x, y: v.y });
    sim.run(60);
    expect(sim.view(rollo)!.bug!.needs.need_social).toBeGreaterThan(20);
  });
});
