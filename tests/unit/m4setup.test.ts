import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 240_000 });
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { CONTENT } from '../../src/game/data';
import { createRegistry } from '../../src/game/data/registry';
import { SETUP_SECONDS } from '../../src/game/systems/setup';
import { PLAZA_X } from './world';

// M4 acceptance (game design doc, section 19): the setup rule held over 10
// minutes, in its own file so it runs beside the rest of M4's tests.

type Logged = { name: keyof GameEvents; payload: unknown; tick: number };

function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload, tick: sim.tick }));
  return log;
}

const find = <K extends keyof GameEvents>(log: Logged[], name: K): GameEvents[K][] =>
  log.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);

/** Pick an item up and put it down where it is, the way the player's hand would. */
function touch(sim: Sim, id: number): void {
  const s = sim.view(id)!;
  sim.send({ type: 'grab', x: s.x, y: s.y });
  sim.step();
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
}

/** Clear a stretch of the starting plaza, and stack three bottle caps there, each touched by the hand. */
function buildStack(sim: Sim, x: number): number[] {
  for (const e of sim.entities.ofKind('item')) if (Math.abs(sim.view(e.id)!.x - x) < 1.3) sim.remove(e.id);
  const h = 0.17;
  const caps = [0, 1, 2].map(
    (i) => sim.spawn('item', 'item_bottle_cap', x, GROUND_Y - h / 2 - i * h - 0.005).id,
  );
  sim.run(60);
  for (const c of [...caps].reverse()) touch(sim, c);
  sim.run(60);
  return caps;
}

/**
 * The camera on the plaza, as a player would have it: areas a screen away
 * sleep (the pond stays awake). Far quicker than running the whole garden.
 */
function lookAtPlaza(sim: Sim): void {
  sim.send({ type: 'focus', x0: PLAZA_X + 4, x1: PLAZA_X + 23.2 });
}

describe('the setup rule over 10 minutes (M4 acceptance)', () => {
  it('bugs never eat, carry, pack, or push a player setup in 10 minutes', () => {
    const sim = Sim.create({ seed: 'setup' });
    lookAtPlaza(sim);
    sim.run(30);
    // The player picks up and puts down food, a pebble, and toys around the bugs.
    const picks = ['item_berry_red', 'item_jelly_bean', 'item_pebble', 'item_sugar_cube', 'item_rubber_ball'];
    // Things out in the plaza, away from where stuff rolls down the pond bank.
    const mine = picks.map(
      (d) => sim.entities.ofKind('item').find((e) => e.defId === d && sim.view(e.id)!.x > PLAZA_X + 3)!.id,
    );
    for (const id of mine) touch(sim, id);
    sim.run(3 * 60);
    const log = record(sim);
    // Every step, no bug may be shoving a tagged thing along.
    const pushes: string[] = [];
    let last = new Map(mine.map((id) => [id, sim.view(id)!]));
    for (let t = 0; t < 10 * 60 * 60; t++) {
      // Keep the timers running, the way a player who keeps fiddling would.
      if (t % 3600 === 0)
        for (const id of mine)
          sim.send({ type: 'set_tag', id, tag: 'tag_player_setup', on: true, seconds: SETUP_SECONDS });
      sim.step();
      const pairs = sim.physics.touchingPairs();
      const now = new Map(mine.map((id) => [id, sim.view(id)!]));
      for (const id of mine) {
        const a = last.get(id)!;
        const b = now.get(id)!;
        // The doc allows a nudge by accident (a bug walking by, or falling nearby), never a push.
        if (Math.hypot(b.x - a.x, b.y - a.y) < 0.02) continue;
        for (const [p, q] of pairs) {
          const other = p === id ? q : q === id ? p : null;
          const bug = other === null ? undefined : sim.entities.get(other)?.bug;
          // A hidden bug waiting to be found (Twig as a twig) lies still: things only roll against it.
          if (bug && !bug.pending && !(bug.mode === 'st_airborne' && !bug.selfLaunched))
            pushes.push(`${sim.tick}: ${b.defId} by ${sim.entities.get(other!)!.defId} (${bug.mode})`);
        }
      }
      last = now;
    }
    const ids = new Set(mine);
    expect(pushes).toEqual([]);
    expect(find(log, 'bug_fed').filter((e) => ids.has(e.itemId) && !e.byPlayer)).toEqual([]);
    expect(find(log, 'bug_picked_up').filter((e) => ids.has(e.itemId))).toEqual([]);
    // They did sniff the new things, in place.
    expect(find(log, 'bug_inspected').some((e) => ids.has(e.itemId))).toBe(true);
  });

  it('a stack of three player-placed things stays standing for 10 minutes with four bugs about', () => {
    // No snacks dropping from the sky: one bouncing off the spring into the stack is not a bug's doing.
    const content = {
      ...CONTENT,
      areas: createRegistry(
        'area',
        CONTENT.areas.all.map((a) => ({ ...a, respawn: [] })),
      ),
    };
    const sim = Sim.create({ seed: 'tower', content });
    lookAtPlaza(sim);
    const caps = buildStack(sim, PLAZA_X + 6.3);
    const before = caps.map((c) => sim.view(c)!);
    expect(before[2]!.y).toBeLessThan(before[1]!.y);
    expect(before[1]!.y).toBeLessThan(before[0]!.y);
    const plaza = sim.entities.ofKind('bug').filter((b) => sim.view(b.id)!.x > PLAZA_X);
    expect(plaza.length).toBeGreaterThanOrEqual(4);
    let nearby = 0;
    for (let t = 0; t < 10 * 60 * 60; t += 60) {
      sim.run(60);
      if (plaza.some((b) => Math.abs(sim.view(b.id)!.x - before[0]!.x) < 3)) nearby++;
    }
    // Bugs were around the stack a good part of the time.
    expect(nearby).toBeGreaterThan(20);
    caps.forEach((c, i) => {
      const a = before[i]!;
      const b = sim.view(c)!;
      expect(Math.hypot(b.x - a.x, b.y - a.y), `cap ${i}`).toBeLessThan(0.05);
      expect(Math.abs(Math.sin(b.angle - a.angle))).toBeLessThan(0.05);
    });
    expect(sim.rescues).toBe(0);
  });
});

describe('the setup rule against things flying', () => {
  it('a bug a spring threw mid-chase drops past a player stack instead of landing on it', () => {
    const sim = Sim.empty({ seed: 'spring-thrown' });
    const x = PLAZA_X + 6.3;
    const caps = buildStack(sim, x);
    const start = caps.map((id) => sim.view(id)!);
    const log = record(sim);
    // Boing, thrown by a spring in the middle of a game of tag, comes down hard on the stack.
    const boing = sim.spawn('bug', 'bug_grasshopper_boing', x - 0.25, GROUND_Y - 1.6);
    boing.bug!.mode = 'st_airborne';
    boing.bug!.selfLaunched = true;
    sim.physics.setVelocity(boing.id, 2, 11);
    sim.run(90);
    caps.forEach((id, i) => {
      const b = sim.view(id)!;
      expect(Math.hypot(b.x - start[i]!.x, b.y - start[i]!.y)).toBeLessThan(0.05);
    });
    expect(find(log, 'bonked').filter((e) => caps.includes(e.id))).toEqual([]);
  });
});
