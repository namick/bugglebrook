import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, SaveError, Sim, loadSaveFile } from '../../src/game';
import type { SaveFile } from '../../src/game';
import { SaveStore } from '../../src/main/saveStore';
import { SettingsStore } from '../../src/main/settingsStore';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/shared/settings';
import { Intro, INTRO, introZoom } from '../../src/renderer/src/app/intro';
import type { IntroInput } from '../../src/renderer/src/app/intro';
import { memoryApi } from '../../src/renderer/src/app/memorySaves';
import { SaveService } from '../../src/renderer/src/app/saveService';
import { SettingsService } from '../../src/renderer/src/app/settingsService';
import { NullAudioBackend, volumesFrom } from '../../src/renderer/src/audio/synth';
import { Camera } from '../../src/renderer/src/render/camera';
import { SquashSpring, shakeOffset } from '../../src/renderer/src/render/juice';
import { BIN_CLOSE_SECONDS, binProgress } from '../../src/renderer/src/ui/compostBin';
import { sliderValueAt } from '../../src/renderer/src/ui/controls';
import {
  POCKET,
  pipCount,
  slideTray,
  slotAt,
  slotRect,
  trayTop,
  trayWantsOpen,
} from '../../src/renderer/src/ui/pocketLayout';
import { slotPicture } from '../../src/renderer/src/ui/slotSign';
import {
  STACK_MAX,
  emptyPocket,
  fits,
  pocketPut,
  pocketTake,
  tidyPocket,
} from '../../src/game/systems/pocket';
import { PLAZA_X, POND_X } from './world';

// M5 (game design doc, section 19): save, load, menu, and pocket.

const quiet = <T>(fn: () => Promise<T>): Promise<T> => {
  const warn = console.warn;
  console.warn = () => undefined;
  return fn().finally(() => (console.warn = warn));
};

function saveOf(sim: Sim, cameraX = 40): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: '2026-09-30T00:00:00.000Z',
    world: sim.serialize(),
    view: { cameraX },
    meta: { createdAt: '2026-09-01T00:00:00.000Z', thumb: null },
  };
}

/** Pick something up with the hand (a grab at its middle). */
function hold(sim: Sim, id: number): void {
  const v = sim.view(id)!;
  sim.send({ type: 'grab', x: v.x, y: v.y });
  sim.step();
  expect(sim.physics.grabbed).toBe(id);
}

/** Hold something and let go over pocket slot `slot`. */
function pocket(sim: Sim, id: number, slot: number): void {
  hold(sim, id);
  sim.send({ type: 'pocket_put', slot });
  sim.step();
}

/** Pull the top thing out of `slot` into the hand at (x, y), carry it a moment, and set it down. */
function takeOut(sim: Sim, slot: number, x: number, y = GROUND_Y - 1): number {
  const before = sim.pocket.slots[slot]!.at(-1)!;
  sim.send({ type: 'pocket_take', slot, x, y });
  sim.step();
  expect(sim.physics.grabbed).toBe(before);
  sim.run(20);
  sim.send({ type: 'release', vx: 0, vy: 0 });
  sim.step();
  return before;
}

/** A calm plaza: bugs full, so they leave staged things alone unless a test wants otherwise. */
function calm(sim: Sim): void {
  for (const b of sim.entities.ofKind('bug'))
    for (const need of ['need_hunger', 'need_fun', 'need_energy', 'need_social', 'need_clean'] as const)
      sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  sim.step();
}

const byDef = (sim: Sim, defId: string): number => sim.entities.all().find((e) => e.defId === defId)!.id;

describe('pocket slots (pure)', () => {
  const pebble = (id: number) => ({ id, defId: 'item_pebble', stackable: true });
  const ball = (id: number) => ({ id, defId: 'item_rubber_ball', stackable: false });

  it('stacks identical stackable things up to nine, and takes anything into an empty slot', () => {
    expect(fits([], ball(1))).toBe(true);
    expect(fits([pebble(1)], pebble(2))).toBe(true);
    expect(fits([pebble(1)], ball(2))).toBe(false);
    expect(fits([ball(1)], ball(2))).toBe(false);
    const nine = Array.from({ length: STACK_MAX }, (_, i) => pebble(i + 1));
    expect(fits(nine.slice(0, 8), pebble(99))).toBe(true);
    expect(fits(nine, pebble(99))).toBe(false);
  });

  it('swaps out what a slot cannot keep, with how long each was inside', () => {
    const state = emptyPocket();
    expect(pocketPut(state, 2, pebble(1), [], 100)).toEqual([]);
    expect(pocketPut(state, 2, pebble(2), [pebble(1)], 130)).toEqual([]);
    expect(state.slots[2]).toEqual([1, 2]);
    const out = pocketPut(state, 2, ball(3), [pebble(1), pebble(2)], 160);
    expect(out).toEqual([
      { id: 1, ticks: 60 },
      { id: 2, ticks: 30 },
    ]);
    expect(state.slots[2]).toEqual([3]);
    expect(state.at).toEqual({ '3': 160 });
    expect(pocketTake(state, 2, 200)).toEqual({ id: 3, ticks: 40 });
    expect(pocketTake(state, 2, 200)).toBeNull();
  });

  it('tidies missing and duplicated IDs', () => {
    const state = { slots: [[1, 2], [2], [], [9], [], []], at: { '1': 5, '2': 6 } };
    const out = tidyPocket(state, (id) => id !== 9);
    expect(out.slots).toEqual([[1, 2], [], [], [], [], []]);
    expect(out.at).toEqual({ '1': 5, '2': 6 });
  });
});

describe('the pocket in the sim', () => {
  it('takes the held thing out of the world, and brings it back into the hand in another area', () => {
    const sim = Sim.create({ seed: 'pocket' });
    calm(sim);
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 3, GROUND_Y - 0.5).id;
    sim.run(60);
    pocket(sim, pebble, 0);
    expect(sim.pocket.slots[0]).toEqual([pebble]);
    expect(sim.physics.grabbed).toBeNull();
    expect(sim.physics.isActive(pebble)).toBe(false);
    expect(sim.view(pebble)!.pocket).toBe(0);
    expect(sim.isPocketed(pebble)).toBe(true);
    // Over in the pond, it comes out.
    const x = POND_X + 2;
    expect(sim.areaOf(x).id).toBe('area_puddle_pond');
    expect(takeOut(sim, 0, x)).toBe(pebble);
    sim.run(90);
    const v = sim.view(pebble)!;
    expect(v.pocket).toBeUndefined();
    expect(sim.areaOf(v.x).id).toBe('area_puddle_pond');
    expect(Math.abs(v.x - x)).toBeLessThan(1);
    expect(sim.physics.isActive(pebble)).toBe(true);
    expect(sim.rescues).toBe(0);
  });

  it('stacks pebbles with pips, and a tenth swaps the stack out at the hand', () => {
    const sim = Sim.create({ seed: 'stack' });
    calm(sim);
    // Each caught in mid-air as it drops in, so the hand never picks up a neighbor.
    const ids: number[] = [];
    const drop = (i: number): number => {
      const id = sim.spawn('item', 'item_pebble', PLAZA_X + 2 + i * 0.6, 3).id;
      ids.push(id);
      return id;
    };
    for (let i = 0; i < 9; i++) pocket(sim, drop(i), 3);
    expect(sim.pocket.slots[3]).toEqual(ids.slice(0, 9));
    const log: string[] = [];
    sim.events.on('pocket_swapped', (e) => log.push(String(e.id)));
    pocket(sim, drop(9), 3);
    expect(sim.pocket.slots[3]).toEqual([ids[9]]);
    expect(log).toHaveLength(9);
    sim.run(120);
    for (const id of ids.slice(0, 9)) {
      expect(sim.isPocketed(id)).toBe(false);
      expect(sim.physics.isActive(id)).toBe(true);
    }
    // A ball never stacks on a pebble: it swaps.
    const ball = byDef(sim, 'item_rubber_ball');
    expect(sim.pocketFits(3, ball)).toBe(false);
    expect(sim.pocketFits(4, ball)).toBe(true);
  });

  it('freezes a pocketed bug: no needs change, no AI, and nobody plays with it', () => {
    const sim = Sim.create({ seed: 'bug-pocket' });
    const dot = byDef(sim, 'bug_ladybug_dot');
    sim.run(30);
    pocket(sim, dot, 1);
    const brain = sim.entities.get(dot)!.bug!;
    expect(brain.mode).toBe('st_pocketed');
    const needs = { ...brain.needs };
    const partners: number[] = [];
    sim.events.on('bug_socialized', (e) => partners.push(e.partnerId, e.id));
    sim.events.on('bug_chose_action', (e) => partners.push(e.targetId ?? -1, e.id));
    sim.run(60 * 60);
    expect(brain.needs).toEqual(needs);
    expect(brain.mode).toBe('st_pocketed');
    expect(partners).not.toContain(dot);
    expect(sim.dropTargetFor(byDef(sim, 'item_berry_red'))?.entityId).not.toBe(dot);
    // Out again, it is held, then flies and lands like any dropped bug.
    takeOut(sim, 1, PLAZA_X + 12);
    expect(brain.mode).not.toBe('st_pocketed');
    sim.run(120);
    expect(brain.mode).not.toBe('st_held');
    expect(sim.physics.isActive(dot)).toBe(true);
  });

  it('keeps tag timers still while pocketed', () => {
    const sim = Sim.create({ seed: 'tags' });
    calm(sim);
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 3, GROUND_Y - 0.5).id;
    sim.run(30);
    sim.send({ type: 'set_tag', id: pebble, tag: 'tag_wet', on: true, seconds: 10 });
    sim.step();
    pocket(sim, pebble, 0);
    sim.run(30 * 60);
    takeOut(sim, 0, PLAZA_X + 3);
    expect(sim.hasTag(pebble, 'tag_wet')).toBe(true);
    sim.run(11 * 60);
    expect(sim.hasTag(pebble, 'tag_wet')).toBe(false);
  });

  it('survives a save and load, and the things come out in another area after', () => {
    const sim = Sim.create({ seed: 'pocket-save' });
    calm(sim);
    const pebble = sim.spawn('item', 'item_pebble', PLAZA_X + 3, GROUND_Y - 0.5).id;
    sim.run(60);
    pocket(sim, pebble, 0);
    const boing = byDef(sim, 'bug_grasshopper_boing');
    sim.run(30);
    pocket(sim, boing, 5);
    const loaded = Sim.load(loadSaveFile(JSON.stringify(saveOf(sim))).world);
    expect(loaded.pocket).toEqual(sim.pocket);
    expect(loaded.physics.isActive(pebble)).toBe(false);
    expect(loaded.entities.get(boing)!.bug!.mode).toBe('st_pocketed');
    loaded.run(600);
    expect(loaded.pocket.slots[5]).toEqual([boing]);
    takeOut(loaded, 5, POND_X + 2);
    takeOut(loaded, 0, POND_X + 3);
    loaded.run(120);
    expect(loaded.areaOf(loaded.view(boing)!.x).id).toBe('area_puddle_pond');
    expect(loaded.areaOf(loaded.view(pebble)!.x).id).toBe('area_puddle_pond');
  });

  it('drops a bug marked pocketed that no slot holds back into the world on load', () => {
    const sim = Sim.create({ seed: 'orphan' });
    const world = sim.serialize();
    const dot = world.entities.find((e) => e.defId === 'bug_ladybug_dot')!;
    dot.bug!.mode = 'st_pocketed';
    const loaded = Sim.load(world);
    expect(loaded.entities.get(dot.id)!.bug!.mode).toBe('st_airborne');
    loaded.run(120);
    expect(loaded.entities.get(dot.id)!.bug!.mode).not.toBe('st_pocketed');
  });
});

describe('the setup rule with pocketed things', () => {
  it('a pocketed player setup leaves no phantom behind', () => {
    const sim = Sim.create({ seed: 'phantom' });
    calm(sim);
    const cap = sim.spawn('item', 'item_bottle_cap', PLAZA_X + 27.5, GROUND_Y - 0.3).id;
    sim.run(60);
    hold(sim, cap);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.setup.has(cap)).toBe(true);
    const at = sim.view(cap)!.x;
    pocket(sim, cap, 2);
    sim.run(20);
    expect(sim.setupLinked().has(cap)).toBe(false);
    expect(sim.bugWorld().setups.some((s) => s.id === cap)).toBe(false);
    expect(sim.bugWorld().setupNear(at, GROUND_Y - 0.2, 0.5)).toBe(false);
  });

  it("bugs never eat food in the pocket, and it is the player's when it comes back out", () => {
    const sim = Sim.create({ seed: 'no-snacks' });
    const berries = sim.entities
      .ofKind('item')
      .filter((e) => e.defId === 'item_berry_red')
      .map((e) => e.id);
    const berry = berries[0]!;
    pocket(sim, berry, 0);
    for (const b of sim.entities.ofKind('bug'))
      sim.send({ type: 'set_need', id: b.id, need: 'need_hunger', value: 5 });
    sim.run(40 * 60);
    expect(sim.entities.has(berry)).toBe(true);
    expect(sim.pocket.slots[0]).toEqual([berry]);
    // Out, it is a player setup: hungry bugs leave it be. (Set down well away
    // from every mouth, or dropping it there would be the player feeding them.)
    const bugsX = sim
      .views()
      .filter((v) => v.bug)
      .map((v) => v.x);
    let spot = PLAZA_X + 26;
    for (let x = PLAZA_X + 2; x < PLAZA_X + 37; x += 0.5)
      if (Math.min(...bugsX.map((b) => Math.abs(b - x))) > Math.min(...bugsX.map((b) => Math.abs(b - spot))))
        spot = x;
    takeOut(sim, 0, spot);
    expect(sim.setup.has(berry)).toBe(true);
    const eaten: number[] = [];
    sim.events.on('bug_ate', (e) => eaten.push(e.itemId));
    for (let i = 0; i < 6; i++) {
      for (const b of sim.entities.ofKind('bug'))
        sim.send({ type: 'set_need', id: b.id, need: 'need_hunger', value: 5 });
      sim.run(10 * 60);
    }
    expect(eaten).not.toContain(berry);
    expect(sim.entities.has(berry)).toBe(true);
  });
});

describe('save round trip (M5 acceptance)', () => {
  it('reproduces a fully populated world: positions within 1 px, tags and timers within 0.1 s', () => {
    const sim = Sim.create({ seed: 'full' });
    sim.run(90 * 60);
    // Tags, a weld, the pocket (a stack and a bug), fed counts, weather, the hose.
    const pebbles = sim.entities
      .ofKind('item')
      .filter((e) => e.defId === 'item_pebble')
      .map((e) => e.id);
    sim.send({ type: 'set_tag', id: pebbles[0]!, tag: 'tag_wet', on: true, seconds: 25 });
    sim.send({ type: 'set_tag', id: pebbles[1]!, tag: 'tag_smelly', on: true });
    sim.send({ type: 'set_weather', wind: 1.5, rain: false });
    const gumAt = sim.view(pebbles[2]!)!;
    sim.spawn('item', 'item_gum_blob', gumAt.x, gumAt.y - 0.5);
    // A fresh pebble on open ground, so a grab at its middle picks it and nothing else.
    const loose = sim.spawn('item', 'item_pebble', PLAZA_X + 28, 6).id;
    sim.run(60);
    pocket(sim, loose, 0);
    const moreA = sim.spawn('item', 'item_pebble', PLAZA_X + 30, 6).id;
    sim.run(90);
    pocket(sim, moreA, 0);
    const glorp = byDef(sim, 'bug_snail_glorp');
    pocket(sim, glorp, 4);
    sim.counters.fed.bug_ladybug_dot = 3;
    sim.run(200);
    expect(sim.environment.state.sticks.length).toBeGreaterThan(0);

    const text = JSON.stringify(saveOf(sim));
    const loaded = Sim.load(loadSaveFile(text).world);
    expect(loaded.tick).toBe(sim.tick);
    expect(loaded.entities.size).toBe(sim.entities.size);
    for (const a of sim.views()) {
      const b = loaded.view(a.id)!;
      expect(b.defId).toBe(a.defId);
      expect(Math.abs(b.x - a.x) * 100).toBeLessThan(1);
      expect(Math.abs(b.y - a.y) * 100).toBeLessThan(1);
      expect(b.tags).toEqual(a.tags);
      expect(b.pocket).toBe(a.pocket);
      if (a.bug) expect(b.bug!.mode).toBe(a.bug.mode);
    }
    // Timers are ticks: within 0.1 s is 6 ticks.
    for (const e of sim.entities.all()) {
      const t = loaded.entities.get(e.id)!.tags ?? {};
      for (const [tag, v] of Object.entries(e.tags ?? {}))
        expect(Math.abs((t[tag] ?? NaN) - v)).toBeLessThanOrEqual(6);
      if (e.bug) {
        const b = loaded.entities.get(e.id)!.bug!;
        for (const k of ['timer', 'grumpyUntil', 'woozyUntil', 'groggyUntil', 'napAt', 'burpAt'] as const)
          expect(Math.abs(b[k] - e.bug[k])).toBeLessThanOrEqual(6);
        expect(b.needs).toEqual(e.bug.needs);
      }
    }
    expect(loaded.pocket).toEqual(sim.pocket);
    expect(loaded.counters).toEqual(sim.counters);
    expect(loaded.affinity).toEqual(sim.affinity);
    expect(loaded.environment.state.sticks).toEqual(sim.environment.state.sticks);
    expect(loaded.environment.state.wind).toBe(1.5);
    // And it plays on.
    loaded.run(600);
    expect(loaded.rescues).toBe(0);
  });

  it('keeps three slots independent', async () => {
    const service = new SaveService(memoryApi().saves);
    const worlds = [0, 1, 2].map((i) => Sim.create({ seed: `slot-${i}` }));
    for (const [i, w] of worlds.entries()) await service.save(i, w, { cameraX: 40 + i });
    const before = await Promise.all([0, 2].map((i) => service.load(i)));
    worlds[1]!.run(600);
    await service.save(1, worlds[1]!, { cameraX: 50 });
    await service.remove(1);
    const after = await Promise.all([0, 2].map((i) => service.load(i)));
    expect(after).toEqual(before);
    expect(await service.load(1)).toBeNull();
  });
});

describe('save migrations from every shipped version', () => {
  const fixture = (v: number): Record<string, unknown> =>
    JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `save-v${v}.json`), 'utf8'));

  // Every fixture in the folder, so a new one is never left out (P-10).
  const versions = readdirSync(join(import.meta.dirname, 'fixtures'))
    .map((f) => /^save-v(\d+)\.json$/.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number)
    .sort((a, b) => a - b);

  it('has a real save for every shipped version', () => {
    // The newest version may not have shipped yet; every one before it has.
    const upTo = Math.max(SAVE_VERSION - 1, versions.at(-1) ?? 0);
    expect(versions).toEqual(Array.from({ length: upTo }, (_, i) => i + 1));
  });

  for (const v of versions) {
    it(`loads a real version ${v} save and plays on`, () => {
      const raw = fixture(v);
      expect(raw.version).toBe(v);
      const save = loadSaveFile(JSON.stringify(raw));
      expect(save.version).toBe(SAVE_VERSION);
      expect(save.meta).toEqual(raw.meta ?? { createdAt: raw.savedAt, thumb: null });
      expect(save.world.pocket!.slots).toHaveLength(6);
      expect(save.world.counters).toEqual({ fed: {} });
      const sim = Sim.load(save.world);
      // Every starting bug is there, whatever the save predates.
      const bugs = sim.entities.ofKind('bug').map((b) => b.defId);
      for (const b of ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp', 'bug_grasshopper_boing'])
        expect(bugs).toContain(b);
      sim.run(20 * 60);
      for (const view of sim.views()) {
        expect(Number.isFinite(view.x) && Number.isFinite(view.y)).toBe(true);
        for (const n of Object.values(view.bug?.needs ?? {})) expect(n).toBeGreaterThanOrEqual(0);
        // Things the save wrote at their old, smaller sizes come back grown, never inside the ground.
        if (view.pocket === undefined && view.inMouthOf === undefined && view.carriedBy === undefined)
          expect(view.y, view.defId).toBeLessThan(sim.surfaceY(view.x));
      }
      expect(sim.rescues).toBe(0);
      // It saves again as the current version.
      expect(loadSaveFile(JSON.stringify(saveOf(sim))).version).toBe(SAVE_VERSION);
    });
  }

  it('re-lays a version 10 porch that is still locked, and keeps an opened one', () => {
    const raw = fixture(10) as { world: { barriers: { open: string[] }; entities: unknown[] } };
    const opened = loadSaveFile(JSON.stringify(raw));
    expect(opened.world.built).toContain('area_under_porch');
    // The opened porch keeps everything; the treehouse may gain its fuller marble run.
    expect(opened.world.entities.length).toBeGreaterThanOrEqual(raw.world.entities.length);
    raw.world.barriers.open = raw.world.barriers.open.filter((id) => id !== 'area_under_porch');
    const locked = loadSaveFile(JSON.stringify(raw));
    expect(locked.world.built).not.toContain('area_under_porch');
    const sim = Sim.load(locked.world);
    expect(sim.built).toContain('area_under_porch');
    expect(sim.entities.ofKind('item').filter((e) => e.defId === 'item_lattice_panel')).toHaveLength(1);
  });

  it('keeps a version 5 world exactly, apart from the new fields and the flowerbed shift', () => {
    const raw = fixture(5) as {
      world: { entities: { id: number; body: { x: number; y: number } }[]; tick: number };
    };
    const save = loadSaveFile(JSON.stringify(raw));
    // Version 8 moved everything 32 m right for the flowerbed.
    expect(save.world.entities.map((e) => [e.id, e.body.y])).toEqual(
      raw.world.entities.map((e) => [e.id, e.body.y]),
    );
    save.world.entities.forEach((e, i) =>
      expect(e.body.x - 32).toBeCloseTo(raw.world.entities[i]!.body.x, 9),
    );
    expect(save.world.tick).toBe(raw.world.tick);
  });

  it('turns a version 5 bug marked pocketed (no pocket existed) into a falling one', () => {
    const raw = fixture(5) as { world: { entities: { kind: string; bug?: { mode: string } }[] } };
    raw.world.entities.find((e) => e.kind === 'bug')!.bug!.mode = 'st_pocketed';
    const save = loadSaveFile(JSON.stringify(raw));
    expect(save.world.entities.find((e) => e.kind === 'bug')!.bug!.mode).toBe('st_airborne');
  });

  it('rejects a broken pocket or meta', () => {
    const sim = Sim.create();
    const good = saveOf(sim);
    const twice = {
      ...good,
      world: { ...good.world, pocket: { slots: [[1], [1], [], [], [], []], at: {} } },
    };
    expect(() => loadSaveFile(twice)).toThrow(/two slots/);
    const ghost = {
      ...good,
      world: { ...good.world, pocket: { slots: [[9999], [], [], [], [], []], at: {} } },
    };
    expect(() => loadSaveFile(ghost)).toThrow(/does not exist/);
    expect(() => loadSaveFile({ ...good, meta: { createdAt: 1, thumb: null } })).toThrow(SaveError);
    // A strange picture is not worth losing a world over: it loads, and the sign shows no picture.
    const odd = loadSaveFile({ ...good, meta: { createdAt: 'x', thumb: 'javascript:1' } });
    expect(slotPicture(odd).thumb).toBeNull();
    expect(
      loadSaveFile({ ...good, meta: { createdAt: 'x', thumb: 'data:image/jpeg;base64,AAAA' } }),
    ).toBeTruthy();
  });
});

describe('SaveStore backups and recovery (main process)', () => {
  let dir: string;
  let store: SaveStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bb-m5-'));
    store = new SaveStore(join(dir, 'saves'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const files = (): string[] => readdirSync(join(dir, 'saves')).sort();

  it('keeps the previous save as a backup and never leaves temp files', async () => {
    await store.write(0, '{"v":1}');
    expect(files()).toEqual(['slot-1.json']);
    await store.write(0, '{"v":2}');
    await store.write(0, '{"v":3}');
    expect(await store.read(0)).toBe('{"v":3}');
    expect(await store.readBackup(0)).toBe('{"v":2}');
    // The older backup is the save as this session found it.
    expect(await store.readBackup(0, 'old')).toBe('{"v":1}');
    expect(files()).toEqual(['slot-1.bak.json', 'slot-1.json', 'slot-1.old.json']);
  });

  it('leaves the old save loadable when a write dies between the temp file and the rename', async () => {
    const sim = Sim.create({ seed: 'crash' });
    const old = JSON.stringify(saveOf(sim));
    await store.write(1, old);
    sim.run(300);
    store.beforeRename = () => {
      throw new Error('power cut');
    };
    await expect(store.write(1, JSON.stringify(saveOf(sim)))).rejects.toThrow(/power cut/);
    // A fresh start (the process was killed): sweep, then read.
    const restarted = new SaveStore(join(dir, 'saves'));
    await restarted.sweep();
    expect(files().some((f) => f.endsWith('.tmp'))).toBe(false);
    const raw = await restarted.read(1);
    expect(raw).toBe(old);
    expect(Sim.load(loadSaveFile(raw!).world).tick).toBe(0);
    // And the next write goes through.
    await restarted.write(1, JSON.stringify(saveOf(sim)));
    expect(loadSaveFile((await restarted.read(1))!).world.tick).toBe(300);
  });

  it('recovers a corrupt save from its backup and keeps the corrupt file aside', async () => {
    await store.write(2, '{"v":"good"}');
    await store.write(2, '{"v":"newer"}');
    writeFileSync(join(dir, 'saves', 'slot-3.json'), '{"v":"new', 'utf8');
    expect(await store.recover(2)).toBe('{"v":"good"}');
    expect(await store.read(2)).toBe('{"v":"good"}');
    expect(readFileSync(join(dir, 'saves', 'slot-3.corrupt-1.json'), 'utf8')).toBe('{"v":"new');
  });

  it('never lets a corrupt save push out a good backup', async () => {
    await store.write(0, '{"v":1}');
    await store.write(0, '{"v":2}');
    writeFileSync(join(dir, 'saves', 'slot-1.json'), 'garbage', 'utf8');
    await store.write(0, '{"v":3}');
    expect(await store.readBackup(0)).toBe('{"v":1}');
  });

  it('with no backup, recovery changes nothing: the save is never thrown away', async () => {
    mkdirSync(join(dir, 'saves'), { recursive: true });
    writeFileSync(join(dir, 'saves', 'slot-1.json'), '', 'utf8');
    expect(await store.recover(0)).toBeNull();
    expect(await store.read(0)).toBe('');
    expect((await store.list())[0]!.exists).toBe(true);
  });

  it('deleting a slot removes its save and backups, and keeps anything set aside', async () => {
    await store.write(0, '{}');
    await store.write(0, '{}');
    await store.write(1, '{}');
    writeFileSync(join(dir, 'saves', 'slot-1.corrupt.json'), 'x');
    await store.remove(0);
    expect(files()).toEqual(['slot-1.corrupt.json', 'slot-2.json']);
  });
});

describe('SaveService recovery (renderer)', () => {
  it('loads the backup when the save will not load', async () => {
    const api = memoryApi();
    const service = new SaveService(api.saves);
    const sim = Sim.create({ seed: 'svc' });
    await service.save(0, sim, { cameraX: 40 });
    sim.run(60);
    await api.saves.write(0, '{"version": 6, "world": 12}');
    const loaded = await quiet(() => service.loadWithRecovery(0));
    expect(loaded.recovered).toBe(true);
    expect(loaded.save!.world.tick).toBe(0);
    // The backup is now the save.
    expect(await service.load(0)).toEqual(loaded.save);
  });

  it('shows a slot whose save will not open as locked, not empty', async () => {
    const api = memoryApi();
    await api.saves.write(1, '{"version": 999}');
    await api.saves.write(2, 'garbage');
    const service = new SaveService(api.saves);
    const slots = await quiet(() => service.list());
    expect(slots.map((s) => s.exists)).toEqual([false, true, true]);
    expect(slots.map((s) => s.locked)).toEqual([null, 'newer', 'broken']);
    expect(await api.saves.read(1)).toBe('{"version": 999}');
  });

  it("keeps the slot's creation time and picture meta", async () => {
    const service = new SaveService(memoryApi().saves, () => new Date('2026-09-30T10:00:00Z'));
    const sim = Sim.create();
    const first = await service.save(0, sim, { cameraX: 40 }, { thumb: 'data:image/jpeg;base64,AA' });
    expect(first.meta).toEqual({ createdAt: '2026-09-30T10:00:00.000Z', thumb: 'data:image/jpeg;base64,AA' });
    const next = await service.save(0, sim, { cameraX: 40 }, { createdAt: '2026-01-01T00:00:00.000Z' });
    expect(next.meta.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('settings', () => {
  it('normalizes anything into valid settings', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ music: 140, sfx: -3, voices: 55.4, fullscreen: 'yes', hack: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      music: 100,
      sfx: 0,
      voices: 55,
    });
    expect(DEFAULT_SETTINGS).toMatchObject({
      music: 70,
      sfx: 80,
      voices: 80,
      fullscreen: true,
      reduceMotion: false,
      edgeScroll: true,
    });
  });

  it('are stored per machine in settings.json, survive a restart, and shrug off a corrupt file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-settings-'));
    try {
      const path = join(dir, 'settings.json');
      const a = new SettingsStore(path);
      expect(await a.get()).toEqual(DEFAULT_SETTINGS);
      await a.set({ sfx: 20, reduceMotion: true });
      const b = new SettingsStore(path);
      expect(await b.get()).toMatchObject({ sfx: 20, reduceMotion: true, music: 70 });
      await expect(b.set('loud')).rejects.toThrow(/object/);
      writeFileSync(path, '{oops');
      expect(await new SettingsStore(path).get()).toEqual(DEFAULT_SETTINGS);
      expect(readdirSync(dir)).toEqual(['settings.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('apply at once in the renderer and reach main in order', async () => {
    const api = memoryApi();
    const service = new SettingsService(api.settings);
    await service.load();
    const seen: number[] = [];
    service.onChange((s) => seen.push(s.sfx));
    void service.set({ sfx: 10 });
    void service.set({ sfx: 30 });
    expect(service.get().sfx).toBe(30);
    await service.flush();
    expect((await api.settings.get()).sfx).toBe(30);
    expect(seen).toEqual([10, 30]);
  });

  it('turn the sound buses down, and a bus at zero plays nothing', () => {
    expect(volumesFrom({ music: 70, sfx: 80, voices: 0 })).toEqual({ music: 0.7, sfx: 0.8, voice: 0 });
    const audio = new NullAudioBackend();
    audio.setVolumes({ music: 0.7, sfx: 0, voice: 0.8 });
    audio.play({ freq: 440, dur: 0.1 });
    audio.play({ freq: 440, dur: 0.1, bus: 'voice' });
    expect(audio.played).toHaveLength(1);
  });

  it('reduce motion turns screen shake off entirely and softens squash', () => {
    for (let i = 0; i < 100; i++) expect(shakeOffset(6, 0.16, true)).toEqual({ x: 0, y: 0 });
    const on = shakeOffset(6, 0.16, false, () => 1);
    expect(on.x).toBeGreaterThan(0);
    expect(shakeOffset(6, 0, false)).toEqual({ x: 0, y: 0 });
    const soft = new SquashSpring();
    soft.amount = 0.4;
    soft.kick(1.5, 0.5);
    expect(soft.sx).toBeCloseTo(1.2);
    expect(soft.sy).toBeCloseTo(0.8);
  });
});

describe('menu and pocket layout (pure)', () => {
  it('opens the tray while holding or hovering the bottom 60 px, sliding up in 150 ms', () => {
    expect(trayWantsOpen(true, null)).toBe(true);
    expect(trayWantsOpen(false, 1025)).toBe(true);
    expect(trayWantsOpen(false, 1000)).toBe(false);
    let open = 0;
    for (let i = 0; i < 9; i++) open = slideTray(open, true, 1 / 60);
    expect(open).toBe(1);
    expect(trayTop(0, false)).toBeGreaterThan(1080);
    expect(trayTop(0, true)).toBe(1080 - POCKET.tab);
    expect(trayTop(1, true)).toBe(1080 - POCKET.height);
  });

  it('finds the slot under a point, with a 20 px snap, only while open', () => {
    const r = slotRect(2, trayTop(1, false));
    expect(slotAt(r.x + r.w / 2, r.y + r.h / 2, 1, false)).toBe(2);
    expect(slotAt(r.x - 15, r.y + 10, 1, false)).not.toBeNull();
    expect(slotAt(r.x + r.w / 2, r.y - 25, 1, false)).toBeNull();
    expect(slotAt(r.x + r.w / 2, r.y + r.h / 2, 0.2, false)).toBeNull();
    expect(slotAt(960, 300, 1, false)).toBeNull();
    expect([0, 1, 2, 9, 12].map(pipCount)).toEqual([0, 0, 2, 9, 9]);
  });

  it('closes the compost bin over 1.5 s, and a sign pulled out opens it again', () => {
    let p = 0;
    for (let t = 0; t < BIN_CLOSE_SECONDS - 0.1; t += 1 / 60) p = binProgress(p, true, 1 / 60);
    expect(p).toBeLessThan(1);
    const half = p;
    p = binProgress(p, false, 0.5);
    expect(p).toBeLessThan(half);
    for (let t = 0; t <= BIN_CLOSE_SECONDS + 0.05; t += 1 / 60) p = binProgress(p, true, 1 / 60);
    expect(p).toBe(1);
  });

  it('badges a slot with the bug fed most and fills the jar with the secrets found', () => {
    const sim = Sim.create();
    sim.counters.fed = { bug_pillbug_rollo: 4, bug_ladybug_dot: 2 };
    const pic = slotPicture(saveOf(sim));
    expect(pic.badge).toBe('bug_pillbug_rollo');
    expect(pic.bugs).toHaveLength(5);
    expect(pic.fill).toBe(0);
    sim.findSecret('secret_sun_shades', 70, 5);
    expect(slotPicture(saveOf(sim)).fill).toBeGreaterThan(0);
    sim.counters.fed = {};
    expect(slotPicture(saveOf(sim)).badge).toBeNull();
  });

  it('maps slider clicks to 0 to 100, and glides the camera home in time', () => {
    expect([-20, 0, 235, 470, 900].map((x) => sliderValueAt(x, 470))).toEqual([0, 0, 50, 100, 100]);
    const cam = new Camera(70.4, 19.2);
    cam.set(5);
    cam.glideTo(35, 1);
    for (let i = 0; i < 30; i++) cam.update(1 / 60);
    expect(cam.x).toBeGreaterThan(10);
    expect(cam.x).toBeLessThan(30);
    for (let i = 0; i < 31; i++) cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(35);
    expect(cam.gliding).toBe(false);
  });
});

describe('the first two minutes', () => {
  it('opens close on the garden floor and pulls back smoothly as the camera arrives (P-15)', () => {
    expect(introZoom(0)).toBe(INTRO.zoom);
    expect(INTRO.zoom).toBeGreaterThan(1.4);
    let last = introZoom(0);
    for (let t = 0; t <= INTRO.slideSeconds + 1; t += 0.05) {
      const k = introZoom(t);
      expect(k).toBeLessThanOrEqual(last + 1e-9);
      expect(last - k).toBeLessThan(0.06);
      last = k;
    }
    expect(introZoom(INTRO.slideSeconds)).toBe(1);
    expect(introZoom(INTRO.endAt)).toBe(1);
  });

  const input = (over: Partial<IntroInput> = {}): IntroInput => ({
    cursor: null,
    dot: { id: 7, x: 39, y: 8.6, asleep: true },
    grabbedBug: false,
    panned: false,
    cameraX: 29.4,
    ...over,
  });
  const run = (intro: Intro, seconds: number, over: Partial<IntroInput> = {}) => {
    const out = [];
    for (let t = 0; t < seconds; t += 1 / 60) out.push(...intro.update(1 / 60, input(over)));
    return out;
  };

  it('fades in, then wakes Dot when the hand comes near, once', () => {
    const intro = new Intro();
    expect(intro.cover).toBe(1);
    expect(run(intro, 2, { cursor: { x: 39.5, y: 8 } })).toEqual([]);
    expect(intro.cover).toBe(0);
    expect(run(intro, 2, { cursor: { x: 45, y: 8 } })).toEqual([]);
    expect(run(intro, 1, { cursor: { x: 39.5, y: 8 } })).toEqual([{ type: 'wake', id: 7 }]);
    expect(run(intro, 1, { cursor: { x: 39.5, y: 8 } })).toEqual([]);
  });

  it('still wakes Dot if she dozed off only after the first frame', () => {
    const intro = new Intro();
    run(intro, 0.1, { dot: { id: 7, x: 39, y: 8.6, asleep: false } });
    run(intro, 3.5);
    expect(run(intro, 0.5, { cursor: { x: 39.5, y: 8 } })).toEqual([{ type: 'wake', id: 7 }]);
  });

  it('beckons at 0:40 if no bug was grabbed, drifts toward the pond and back at 1:00, and ends at 2:00', () => {
    const intro = new Intro();
    const awake = { dot: { id: 7, x: 39, y: 8.6, asleep: false }, cursor: { x: 44, y: 6 } };
    const early = run(intro, INTRO.beckonAt - 0.5, awake);
    expect(early).toEqual([]);
    expect(run(intro, 1, awake)).toEqual([{ type: 'beckon', id: 7, x: 44 }]);
    const drift = run(intro, INTRO.driftAt - INTRO.beckonAt + 3, awake);
    expect(drift).toEqual([
      { type: 'drift', x: 29.4 - INTRO.drift, seconds: INTRO.driftSeconds },
      { type: 'drift', x: 29.4, seconds: INTRO.driftSeconds },
    ]);
    expect(run(intro, 60, awake)).toEqual([{ type: 'done' }]);
    expect(intro.done).toBe(true);
  });

  it('stays quiet for a player who already grabbed a bug and panned', () => {
    const intro = new Intro();
    const busy = { dot: { id: 7, x: 39, y: 8.6, asleep: false }, grabbedBug: true, panned: true };
    expect(run(intro, 119, busy)).toEqual([]);
  });

  it('stages the scene: Dot asleep on the bottle cap, a berry beside her, peckish', () => {
    const sim = Sim.create({ seed: 'intro' });
    sim.send({ type: 'stage_intro' });
    sim.step();
    const dot = sim.view(byDef(sim, 'bug_ladybug_dot'))!;
    expect(dot.bug!.mode).toBe('st_sleep');
    expect(dot.bug!.needs.need_hunger).toBeLessThan(25);
    const berries = sim.views().filter((v) => v.defId === 'item_berry_red');
    expect(berries.some((b) => Math.abs(b.x - dot.x) < 2)).toBe(true);
    // The hand wakes her gently; the nudge sends her toward it.
    sim.send({ type: 'wake', id: dot.id });
    sim.step();
    expect(sim.view(dot.id)!.bug!.mode).toBe('st_react');
    sim.run(80);
    const log: string[] = [];
    sim.events.on('bug_beckoned', (e) => log.push(e.defId));
    sim.send({ type: 'beckon', id: dot.id, x: dot.x + 5 });
    // She heads for the hand (and may bounce off a toy on the way).
    let furthest = dot.x;
    for (let i = 0; i < 240; i++) {
      sim.step();
      furthest = Math.max(furthest, sim.view(dot.id)!.x);
    }
    expect(log).toEqual(['bug_ladybug_dot']);
    expect(furthest).toBeGreaterThan(dot.x + 2);
  });
});

describe('setup cache', () => {
  it('forgets a removed thing at once, so later systems in the same step never look up its body', () => {
    const sim = Sim.create({ seed: 'cache' });
    const berry = sim.entities.ofKind('item').find((e) => e.defId === 'item_berry_red')!.id;
    hold(sim, berry);
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    expect(sim.setupLinked().has(berry)).toBe(true);
    sim.remove(berry);
    expect(sim.setupLinked().has(berry)).toBe(false);
    sim.run(10);
  });
});
