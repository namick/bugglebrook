import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 240_000 });
import { GROUND_Y, Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { SETUP_SECONDS } from '../../src/game/systems/setup';
import { PLAZA_X } from './world';

// M4 acceptance (game design doc, section 19): a 30-minute soak of the
// plaza, in its own file so it runs beside the rest of M4's tests.

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

describe('soak', () => {
  it('30 minutes of a seeded world: no NaN, needs in range, nobody stuck, setups untouched', () => {
    const sim = Sim.create({ seed: 'soak' });
    lookAtPlaza(sim);
    const caps = buildStack(sim, PLAZA_X + 6.3);
    const berry = sim.entities
      .ofKind('item')
      .find((e) => e.defId === 'item_berry_red' && sim.view(e.id)!.x > PLAZA_X + 3)!.id;
    touch(sim, berry);
    // The stack must not move. (A lone berry rolls at a breath, so it is only checked for being left alone.)
    const start = new Map(caps.map((id) => [id, sim.view(id)!]));
    const log = record(sim);
    const uniques = (): number[] =>
      sim.entities
        .all()
        .filter((e) => sim.content.items.tryGet(e.defId)?.unique)
        .map((e) => e.id)
        .sort((a, b) => a - b);
    const uniquesAtStart = uniques();
    const history = new Map<number, string[]>();
    for (let minute = 0; minute < 30; minute++) {
      sim.send({ type: 'set_tag', id: berry, tag: 'tag_player_setup', on: true, seconds: SETUP_SECONDS });
      for (let s = 0; s < 60; s++) {
        sim.run(60);
        for (const v of sim.views()) {
          for (const k of ['x', 'y', 'vx', 'vy', 'angle'] as const) expect(Number.isFinite(v[k])).toBe(true);
          if (!v.bug) continue;
          for (const n of Object.values(v.bug.needs)) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(100);
          }
          // Hidden bugs waiting to be found keep still on purpose (M7).
          if (v.bug.pending) continue;
          const h = history.get(v.id) ?? [];
          // Sleeping through the night is what bugs do (M6): that is never "stuck".
          const def = sim.content.bugs.get(v.defId);
          const night = v.bug.mode === 'st_sleep' && sim.weather.bedtime(def, v.id);
          h.push(night ? `night:${h.length}` : `${v.bug.mode}:${Math.round(v.x * 2)}`);
          history.set(v.id, h);
        }
      }
    }
    // Every bug does something different at least every 3 minutes (a nap can be long, but not that long).
    for (const [id, h] of history) {
      for (let i = 0; i + 180 <= h.length; i += 60) {
        const window = new Set(h.slice(i, i + 180));
        expect(window.size, `bug ${id} stuck at ${i} s`).toBeGreaterThan(1);
      }
    }
    for (const [id, a] of start) {
      const b = sim.view(id)!;
      expect(Math.hypot(b.x - a.x, b.y - a.y), `setup ${a.defId}`).toBeLessThan(0.05);
    }
    const mine = new Set([...caps, berry]);
    expect(find(log, 'bug_picked_up').filter((e) => mine.has(e.itemId))).toEqual([]);
    expect(find(log, 'bug_fed').filter((e) => mine.has(e.itemId))).toEqual([]);
    // Nothing is lost for good. The safety nets may catch something now and
    // then: physics with Math.sin and friends is not bit-identical across
    // platforms (macOS rescued one thing where Linux rescued none), and a
    // save is a snapshot, not a replay, so that is allowed. What must hold
    // is where everything ends up (docs/04-architecture.md, "The simulation").
    expect(sim.rescues).toBeLessThanOrEqual(3);
    for (const v of sim.views()) {
      if (v.pocket !== undefined || v.inMouthOf !== undefined || v.carriedBy !== undefined) continue;
      expect(v.y, `${v.defId} under the ground`).toBeLessThan(sim.surfaceY(v.x) + 0.3);
      expect(v.y, `${v.defId} above the sky`).toBeGreaterThan(-30);
    }
    for (const id of mine) expect(sim.entities.has(id), `setup piece ${id}`).toBe(true);
    expect(uniques()).toEqual(uniquesAtStart);
    // A lively half hour.
    const kinds = new Set(find(log, 'bug_socialized').map((e) => e.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(find(log, 'bug_slept').length).toBeGreaterThan(0);
  }, 180_000);
});
