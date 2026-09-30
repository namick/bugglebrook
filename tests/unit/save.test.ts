import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, SaveError, Sim, loadSaveFile } from '../../src/game';
import type { SaveFile } from '../../src/game';
import type { Migration } from '../../src/game/save/migrations';

/** Round every number so float noise from rebuilding bodies does not matter. */
function rounded(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (_k, v: unknown) =>
    typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v,
  );
}

function makeSave(sim: Sim, cameraX = 3): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: '2026-01-01T00:00:00.000Z',
    world: sim.serialize(),
    view: { cameraX },
  };
}

describe('serialization', () => {
  it('round-trips a world through JSON exactly', () => {
    const sim = Sim.create({ seed: 'roundtrip' });
    sim.run(300);
    const save = makeSave(sim);
    const text = JSON.stringify(save);
    const loaded = loadSaveFile(text);
    expect(loaded).toEqual(save);
    const restored = Sim.load(loaded.world);
    expect(rounded(restored.serialize())).toEqual(rounded(sim.serialize()));
    expect(restored.tick).toBe(sim.tick);
    expect(restored.entities.size).toBe(sim.entities.size);
  });

  it('restores bug brains and the RNG stream', () => {
    const sim = Sim.create({ seed: 'brains' });
    sim.run(200);
    const restored = Sim.load(loadSaveFile(JSON.stringify(makeSave(sim))).world);
    const bugs = (s: Sim): unknown => s.entities.ofKind('bug').map((e) => e.bug);
    expect(bugs(restored)).toEqual(bugs(sim));
    expect(restored.rng.next()).toBe(sim.rng.next());
  });

  it('keeps entity IDs unique after load', () => {
    const sim = Sim.create();
    const restored = Sim.load(sim.serialize());
    const fresh = restored.spawn('item', 'pebble', 3, GROUND_Y - 1);
    expect(sim.entities.has(fresh.id)).toBe(false);
  });

  it('saves a held item as dropped', () => {
    const sim = Sim.create();
    const pebble = sim.entities.ofKind('item')[0]!;
    const v = sim.view(pebble.id)!;
    sim.send({ type: 'grab', x: v.x, y: v.y });
    sim.step();
    const restored = Sim.load(sim.serialize());
    expect(restored.physics.grabbed).toBeNull();
    restored.run(10);
  });

  it('skips entities whose content no longer exists', () => {
    const sim = Sim.create();
    const world = sim.serialize();
    world.entities[0] = { ...world.entities[0]!, defId: 'removed_thing' };
    const restored = Sim.load(world);
    expect(restored.entities.size).toBe(sim.entities.size - 1);
  });
});

describe('loadSaveFile', () => {
  const valid = (): SaveFile => makeSave(Sim.create());

  it('rejects garbage', () => {
    expect(() => loadSaveFile('{not json')).toThrow(SaveError);
    expect(() => loadSaveFile('[]')).toThrow(/not an object/);
    expect(() => loadSaveFile({ version: 'one' })).toThrow(/invalid version/);
  });

  it('rejects saves from a newer game', () => {
    expect(() => loadSaveFile({ ...valid(), version: SAVE_VERSION + 1 })).toThrow(/newer/);
  });

  it('rejects structurally broken saves', () => {
    const save = valid();
    const bad = { ...save, world: { ...save.world, entities: [{ id: 0, kind: 'rock' }] } };
    expect(() => loadSaveFile(bad)).toThrow(/Invalid save/);
    const dup = {
      ...save,
      world: { ...save.world, entities: [save.world.entities[0], save.world.entities[0]] },
    };
    expect(() => loadSaveFile(dup)).toThrow(/duplicated/);
  });

  it('runs migrations in order up to the current version', () => {
    const current = valid();
    // Pretend the current format is v3 and this file is v1.
    const v1 = { ...current, version: 1, world: { ...current.world }, view: undefined, camera: 7 };
    const migrations: Record<number, Migration> = {
      1: (s) => ({ ...s, version: 2, view: { cameraX: s.camera }, camera: undefined }),
      2: (s) => ({ ...s, version: 3 }),
    };
    const out = loadSaveFile(JSON.parse(JSON.stringify(v1)), migrations, 3);
    expect(out.version).toBe(3);
    expect(out.view.cameraX).toBe(7);
  });

  it('fails clearly when a migration is missing or wrong', () => {
    const v1 = { ...valid(), version: 1 };
    expect(() => loadSaveFile(v1, {}, 2)).toThrow(/No migration from save version 1/);
    expect(() => loadSaveFile(v1, { 1: (s) => ({ ...s, version: 5 }) }, 2)).toThrow(/did not produce/);
  });
});
