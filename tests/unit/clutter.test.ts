import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game';
import { Rng } from '../../src/game/core/rng';
import { SHARD_CAP } from '../../src/game/simPotions';
import { GOO_CAP, JAR_LOOSE_CAP } from '../../src/game/systems/places';
import { KNOTHOLE_CAP, KNOTHOLE_POOL } from '../../src/game/systems/weather';

// P-19 of the pre-release review: during active play the world grew from
// 158 to 231 things in 24 minutes. The shelf jars refilled every 5 game
// minutes (5 real seconds) however many of their kind lay about, and the
// knothole tossed things out with no limit. These check the caps, and that
// a long stretch of busy play keeps every area's count in bounds.

const LAB = 'area_compost_lab';

function openWorld(seed: string): Sim {
  const sim = Sim.create({ seed });
  for (const a of sim.content.areas.all) if (!a.hidden) sim.send({ type: 'unlock', area: a.id });
  sim.step();
  return sim;
}

function fixture(sim: Sim, id: string): { x: number; y: number } {
  for (const area of sim.content.areas.all)
    for (const f of area.fixtures ?? []) if (f.id === id) return { x: area.xStart + f.x, y: f.y };
  throw new Error(id);
}

function perArea(sim: Sim): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of sim.entities.ofKind('item')) {
    if (sim.isPocketed(e.id)) continue;
    const id = sim.areaOf(sim.physics.getState(e.id).x).id;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

describe('clutter caps (P-19)', () => {
  it(`a shelf jar stops refilling once ${JAR_LOOSE_CAP} of its kind lie about the lab`, () => {
    const sim = openWorld('jar-cap');
    const lab = sim.content.areas.get(LAB);
    sim.send({ type: 'focus', x0: lab.xStart, x1: lab.xStart + 19.2 });
    for (const b of sim.entities.ofKind('bug')) sim.remove(b.id);
    const jar = fixture(sim, 'fix_jar_mushroom');
    // Every time the jar has its mushroom cap back, take it out and put it on the floor.
    for (let i = 0; i < 40; i++) {
      for (const e of sim.entities.ofKind('item')) {
        if (e.defId !== 'item_mushroom_cap') continue;
        const s = sim.physics.getState(e.id);
        if (Math.abs(s.x - jar.x) < 0.45 && Math.abs(s.y - jar.y) < 0.6)
          sim.physics.setPosition(e.id, lab.xStart + 2 + (i % 6) * 0.5, 5);
      }
      sim.run(5 * 60);
    }
    expect(sim.looseIn('item_mushroom_cap', lab)).toBe(JAR_LOOSE_CAP);
  });

  it(`the knothole tosses nothing out while ${KNOTHOLE_CAP} of the picked kind lie about the plaza`, () => {
    const sim = Sim.empty({ seed: 'knot-cap' });
    sim.step();
    const hole = fixture(sim, 'fix_stump_knothole');
    for (let i = 0; i < 40; i++) {
      sim.weather.pokeKnothole(hole);
      sim.run(11 * 60);
    }
    const plaza = sim.content.areas.get('area_stump_plaza');
    for (const id of KNOTHOLE_POOL) expect(sim.looseIn(id, plaza), id).toBeLessThanOrEqual(KNOTHOLE_CAP);
  });

  it('a long stretch of busy play keeps every area in bounds', { timeout: 300_000 }, () => {
    const sim = openWorld('busy');
    const open = sim.content.areas.all.filter((a) => !a.hidden);
    const before = perArea(sim);
    const total = (m: Record<string, number>): number => Object.values(m).reduce((a, b) => a + b, 0);
    const rng = new Rng('busy-hands');
    let half: Record<string, number> = {};
    for (let minute = 0; minute < 12; minute++) {
      if (minute === 6) half = perArea(sim);
      const a = open[minute % open.length]!;
      sim.send({ type: 'focus', x0: a.xStart, x1: a.xStart + 19.2 });
      for (let k = 0; k < 6; k++) {
        // Fling something loose in view, empty a shelf jar, and poke the fixtures.
        const loose = sim.entities.ofKind('item').filter((e) => {
          if (sim.isSleeping(e.id)) return false;
          const x = sim.physics.getState(e.id).x;
          return x > a.xStart + 0.5 && x < a.xStart + 19;
        });
        if (loose.length > 0) {
          const s = sim.physics.getState(rng.pick(loose).id);
          sim.send({ type: 'grab', x: s.x, y: s.y });
          sim.step();
          sim.send({ type: 'drag', x: s.x, y: s.y - 2 });
          sim.step();
          sim.send({ type: 'release', vx: rng.range(-8, 8), vy: -rng.range(3, 9) });
          sim.step();
        }
        for (const f of a.fixtures ?? []) {
          if (f.kind === 'shelf_jar') {
            for (const e of sim.entities.ofKind('item')) {
              if (e.defId !== f.item) continue;
              const s = sim.physics.getState(e.id);
              if (Math.abs(s.x - (a.xStart + f.x)) < 0.45 && Math.abs(s.y - f.y) < 0.6)
                sim.physics.setPosition(e.id, a.xStart + rng.range(1, 18), 4);
            }
          } else if (rng.chance(0.3)) {
            sim.send({ type: 'poke', x: a.xStart + f.x, y: f.y });
            sim.step();
          }
        }
        sim.run(600);
      }
    }
    const after = perArea(sim);
    const lab = sim.content.areas.get(LAB);
    expect(sim.looseIn('item_compost_goo', lab)).toBeLessThanOrEqual(GOO_CAP);
    expect(sim.looseIn('item_glass_bead', lab)).toBeLessThanOrEqual(SHARD_CAP);
    for (const a of open) expect(after[a.id] ?? 0, a.id).toBeLessThanOrEqual((before[a.id] ?? 0) + 18);
    expect(total(after)).toBeLessThanOrEqual(total(before) + 30);
    // Capped pools level off: the second six minutes add little to the first six.
    expect(total(after) - total(half)).toBeLessThanOrEqual(10);
  });
});
