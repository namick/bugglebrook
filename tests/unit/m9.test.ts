import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUND_Y, SAVE_VERSION, Sim, loadSaveFile } from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { CONTENT } from '../../src/game/data';
import { MIGRATIONS } from '../../src/game/save/migrations';
import { BEAT_TICKS, PLAY_BEATS, PLAY_FUN } from '../../src/game/systems/bugMusic';
import {
  CLEAR_WINDOW,
  SEQ_COLS,
  SEQ_ROWS,
  THEME,
  cellCenter,
  emptyRows,
  isTheme,
  newSequencerState,
  playingRows,
  seqHit,
  seqLayout,
  sequencerProblems,
  setCell,
  themeRows,
} from '../../src/game/systems/sequencer';
import { PLAZA_X } from './world';

// M9 (game design doc, sections 7.6, 10, and 19): the mushroom sequencer,
// instruments in the world, bugs playing them and hopping on the caps, the
// band, the theme secret, and save version 13.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown>; tick: number };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) =>
    log.push({ name, payload: payload as Record<string, unknown>, tick: sim.tick }),
  );
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const FLOWERBED = CONTENT.areas.get('area_flowerbed_stage');
const OPEN = PLAZA_X + 28;

function world(seed: string): Sim {
  const sim = Sim.empty({ seed });
  sim.send({ type: 'unlock', area: 'area_flowerbed_stage' });
  sim.send({ type: 'focus', x0: 10, x1: 30 });
  sim.step();
  return sim;
}

function put(sim: Sim, defId: string, x: number): Entity {
  const half = sim.halfHeightOfDef(defId);
  return sim.spawn('item', defId, x, sim.surfaceY(x) - half - 0.02);
}

function bugAt(sim: Sim, defId: string, x: number, fun = 100): Entity {
  const b = sim.spawn('bug', defId, x, sim.surfaceY(x) - 0.6);
  for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
    sim.send({ type: 'set_need', id: b.id, need, value: need === 'need_fun' ? fun : 100 });
  return b;
}

const layout = (sim: Sim) => sim.places.sequencerLayout()!;
const touch = (sim: Sim, p: { x: number; y: number }, start = true): void => {
  sim.send({ type: 'seq_touch', x: p.x, y: p.y, start });
  sim.step();
};

describe('the sequencer grid (pure)', () => {
  it('lays out 8 by 6 caps with a tuft per row and its three controls, and hits each', () => {
    const l = seqLayout(10, 6);
    for (let row = 0; row < SEQ_ROWS; row++)
      for (let col = 0; col < SEQ_COLS; col++) {
        const c = cellCenter(l, row, col);
        expect(seqHit(l, c.x, c.y)).toEqual({ kind: 'cap', row, col });
      }
    expect(seqHit(l, l.tuftX, cellCenter(l, 3, 0).y)).toEqual({ kind: 'tuft', row: 3 });
    expect(seqHit(l, l.stone.x, l.stone.y)).toEqual({ kind: 'stone' });
    expect(seqHit(l, l.knob.x, l.knob.y)).toEqual({ kind: 'knob' });
    expect(seqHit(l, l.seed.x, l.seed.y)).toEqual({ kind: 'seed' });
    expect(seqHit(l, 0, 0)).toBeNull();
  });

  it('knows the theme, and plays a bug pattern only on an empty grid', () => {
    expect(isTheme(themeRows())).toBe(true);
    const rows = themeRows();
    setCell(rows, 5, 3, true);
    // Drums and bass may do anything.
    expect(isTheme(rows)).toBe(true);
    setCell(rows, 0, 2, true);
    expect(isTheme(rows)).toBe(false);
    expect(THEME.flat().length).toBe(8);
    const s = newSequencerState();
    s.bug = { id: 9, rows: themeRows() };
    expect(playingRows(s)).toEqual(themeRows());
    setCell(s.patterns[0], 4, 0, true);
    expect(playingRows(s)).toEqual(s.patterns[0]);
  });

  it('checks a saved sequencer', () => {
    expect(sequencerProblems(newSequencerState())).toEqual([]);
    expect(sequencerProblems({ ...newSequencerState(), patterns: [[1, 2], emptyRows()] })).not.toEqual([]);
    expect(sequencerProblems({ ...newSequencerState(), bug: { id: 'x' } })).not.toEqual([]);
  });
});

describe('the mushroom sequencer in the flowerbed', () => {
  it('toggles caps with a click, and paints a drag like the first cap', () => {
    const sim = world('seq-paint');
    const log = record(sim);
    const l = layout(sim);
    touch(sim, cellCenter(l, 0, 0));
    expect(sim.places.sequencer.patterns[0][0]).toBe(0b1);
    // A drag from an off cap paints caps on; from an on cap, off.
    touch(sim, cellCenter(l, 2, 1));
    for (const col of [2, 3, 4]) touch(sim, cellCenter(l, 2, col), false);
    expect(sim.places.sequencer.patterns[0][2]).toBe(0b11110);
    touch(sim, cellCenter(l, 2, 4));
    touch(sim, cellCenter(l, 2, 3), false);
    expect(sim.places.sequencer.patterns[0][2]).toBe(0b00110);
    expect(named(log, 'sequencer_changed').every((e) => e.action === 'cap' && e.by === null)).toBe(true);
  });

  it('mutes rows with their tufts, clears on the stone’s second click, doubles speed, and swaps A and B', () => {
    const sim = world('seq-controls');
    const log = record(sim);
    const l = layout(sim);
    touch(sim, cellCenter(l, 1, 1));
    touch(sim, { x: l.tuftX, y: cellCenter(l, 1, 0).y });
    expect(sim.places.sequencer.mutes[1]).toBe(true);
    // One click on the stone only wobbles it.
    touch(sim, l.stone);
    expect(sim.places.sequencer.patterns[0][1]).toBe(0b10);
    expect(named(log, 'sequencer_changed').at(-1)!.action).toBe('wobbled');
    touch(sim, l.stone);
    expect(sim.places.sequencer.patterns[0]).toEqual(emptyRows());
    // Too slow a second click wobbles again.
    touch(sim, cellCenter(l, 3, 3));
    touch(sim, l.stone);
    sim.run(CLEAR_WINDOW + 10);
    touch(sim, l.stone);
    expect(sim.places.sequencer.patterns[0][3]).toBe(0b1000);
    touch(sim, l.knob);
    expect(sim.places.sequencer.fast).toBe(true);
    touch(sim, l.seed);
    expect(sim.places.sequencer.current).toBe(1);
    touch(sim, cellCenter(l, 0, 7));
    expect(sim.places.sequencer.patterns[1][0]).toBe(0b10000000);
    expect(sim.places.sequencer.patterns[0][3]).toBe(0b1000);
  });

  it('answers the hand only when the flowerbed is open', () => {
    const sim = Sim.empty({ seed: 'seq-locked' });
    sim.step();
    expect(sim.places.sequencerLayout()).toBeNull();
    const f = FLOWERBED.fixtures!.find((q) => q.kind === 'sequencer')!;
    const l = seqLayout(FLOWERBED.xStart + f.x, f.y);
    sim.send({ type: 'seq_touch', ...cellCenter(l, 0, 0), start: true });
    sim.step();
    expect(sim.places.sequencer.patterns[0]).toEqual(emptyRows());
  });

  it('the theme on the melody rows finds secret_sequencer_song, and every bug cheers', () => {
    const sim = world('seq-theme');
    const dot = bugAt(sim, 'bug_ladybug_dot', OPEN);
    const log = record(sim);
    const l = layout(sim);
    THEME.forEach((cols, row) => cols.forEach((col) => touch(sim, cellCenter(l, row, col))));
    expect(sim.secrets).toContain('secret_sequencer_song');
    expect(named(log, 'secret_found').map((e) => e.id)).toEqual(['secret_sequencer_song']);
    expect(named(log, 'bug_reacted').some((e) => e.id === dot.id && e.reaction === 'cheer')).toBe(true);
  });

  it('keeps its patterns, mutes, and speed through a save and load', () => {
    const sim = world('seq-save');
    const l = layout(sim);
    touch(sim, cellCenter(l, 0, 0));
    touch(sim, cellCenter(l, 5, 4));
    touch(sim, { x: l.tuftX, y: cellCenter(l, 2, 0).y });
    touch(sim, l.knob);
    const file = loadSaveFile({
      version: SAVE_VERSION,
      savedAt: 'now',
      world: JSON.parse(JSON.stringify(sim.serialize())),
      view: { cameraX: 3 },
      meta: { createdAt: 'now', thumb: null },
    });
    const back = Sim.load(file.world);
    expect(back.places.sequencer).toEqual(sim.places.sequencer);
  });
});

describe('bugs hop on the caps of an empty grid only (M9 acceptance)', () => {
  it('a bored bug by an empty grid taps out a pattern of its own, which goes when it leaves', () => {
    const sim = world('seq-bug');
    const l = layout(sim);
    const boing = bugAt(sim, 'bug_grasshopper_boing', l.x0 + 1.4, 10);
    const log = record(sim);
    let tapped = false;
    for (let t = 0; t < 4 * 60 * 60 && !tapped; t++) {
      sim.step();
      tapped = sim.places.sequencer.bug !== null;
    }
    expect(tapped).toBe(true);
    expect(sim.places.sequencer.bug!.id).toBe(boing.id);
    expect(sim.places.sequencer.patterns[0]).toEqual(emptyRows());
    expect(named(log, 'sequencer_changed').some((e) => e.by === boing.id)).toBe(true);
    sim.run(20 * 60);
    expect(sim.places.sequencer.bug).toBeNull();
  });

  it('bugs never change a grid the player started, in 10 minutes with bored bugs about', () => {
    const sim = world('seq-keep');
    const l = layout(sim);
    touch(sim, cellCenter(l, 1, 2));
    touch(sim, cellCenter(l, 4, 6));
    const before = JSON.stringify(sim.places.sequencer.patterns);
    for (const [d, dx] of [
      ['bug_grasshopper_boing', 0.5],
      ['bug_ladybug_dot', 2],
      ['bug_pillbug_rollo', 3.5],
    ] as const)
      bugAt(sim, d, l.x0 + dx, 0);
    const log = record(sim);
    for (let t = 0; t < 10 * 60 * 60; t++) {
      sim.step();
      if (t % 600 === 0)
        for (const b of sim.entities.ofKind('bug'))
          sim.send({ type: 'set_need', id: b.id, need: 'need_fun', value: 0 });
    }
    expect(JSON.stringify(sim.places.sequencer.patterns)).toBe(before);
    expect(sim.places.sequencer.bug).toBeNull();
    expect(named(log, 'sequencer_changed').filter((e) => e.by !== null)).toEqual([]);
  });

  it('a bug on the caps hops off when the player starts a pattern', () => {
    const sim = world('seq-handover');
    const l = layout(sim);
    const boing = bugAt(sim, 'bug_grasshopper_boing', l.x0 + 1.4, 10);
    for (let t = 0; t < 4 * 60 * 60 && sim.places.sequencer.bug === null; t++) sim.step();
    expect(sim.places.sequencer.bug).not.toBeNull();
    touch(sim, cellCenter(l, 0, 3));
    expect(sim.places.sequencer.bug).toBeNull();
    sim.run(60);
    expect(sim.entities.get(boing.id)!.bug!.action).not.toBe('tap');
    expect(sim.places.sequencer.patterns[0][0]).toBe(0b1000);
  });
});

describe('instruments', () => {
  it('lie about in the flowerbed, the pond, and the treehouse, and play when poked or shaken', () => {
    const sim = Sim.create({ seed: 'instruments' });
    const defs = sim.entities.ofKind('item').map((e) => e.defId);
    for (const d of [
      'item_inst_seedpod_maraca',
      'item_inst_acorn_castanets',
      'item_inst_thimble_drum',
      'item_inst_bottle_flute',
      'item_inst_leaf_xylophone',
    ])
      expect(defs, d).toContain(d);
    const open = world('instrument-poke');
    open.send({ type: 'focus', x0: OPEN - 10, x1: OPEN + 10 });
    const log = record(open);
    const kazoo = put(open, 'item_inst_comb_kazoo', OPEN);
    open.run(30);
    const s = open.view(kazoo.id)!;
    open.send({ type: 'poke', x: s.x, y: s.y });
    open.step();
    expect(named(log, 'note_played').at(-1)).toMatchObject({ id: kazoo.id, poked: true });
    const maraca = put(open, 'item_inst_seedpod_maraca', OPEN + 3);
    open.run(30);
    const m = open.view(maraca.id)!;
    open.send({ type: 'grab', x: m.x, y: m.y });
    open.step();
    open.run(10);
    open.send({ type: 'shake' });
    open.step();
    expect(named(log, 'note_played').at(-1)).toMatchObject({ id: maraca.id, poked: true });
  });

  it('a bored bug walks to an instrument and plays it where it lies for 8 to 24 beats', () => {
    const sim = world('bug-plays');
    const drum = put(sim, 'item_inst_thimble_drum', OPEN + 1.5);
    const dot = bugAt(sim, 'bug_ladybug_dot', OPEN - 1, 10);
    sim.send({ type: 'focus', x0: OPEN - 10, x1: OPEN + 10 });
    sim.run(30);
    const at = sim.view(drum.id)!;
    const log = record(sim);
    let started = -1;
    for (let t = 0; t < 3 * 60 * 60 && started < 0; t++) {
      sim.step();
      if (named(log, 'instrument_played').length > 0) started = sim.tick;
    }
    expect(started).toBeGreaterThan(0);
    const e = named(log, 'instrument_played')[0]!;
    expect(e).toMatchObject({ id: dot.id, itemId: drum.id, defId: 'item_inst_thimble_drum' });
    expect(e.beats as number).toBeGreaterThanOrEqual(PLAY_BEATS[0]);
    expect(e.beats as number).toBeLessThanOrEqual(PLAY_BEATS[1]);
    const fun = sim.entities.get(dot.id)!.bug!.needs.need_fun;
    sim.run((e.beats as number) * BEAT_TICKS + 30);
    expect(named(log, 'bug_used').some((u) => u.id === dot.id && u.action === 'play')).toBe(true);
    expect(sim.entities.get(dot.id)!.bug!.needs.need_fun).toBeGreaterThan(fun + PLAY_FUN / 2);
    // Played where it lay: the drum never moved.
    const after = sim.view(drum.id)!;
    expect(Math.hypot(after.x - at.x, after.y - at.y)).toBeLessThan(0.05);
  });

  it('bugs leave the player’s instruments alone (the setup rule)', () => {
    const sim = world('bug-setup');
    const drum = put(sim, 'item_inst_thimble_drum', OPEN + 1.5);
    sim.run(30);
    const s = sim.view(drum.id)!;
    sim.send({ type: 'grab', x: s.x, y: s.y });
    sim.step();
    sim.send({ type: 'release', vx: 0, vy: 0 });
    sim.step();
    bugAt(sim, 'bug_ladybug_dot', OPEN - 1, 10);
    const log = record(sim);
    sim.run(2 * 60 * 60);
    expect(named(log, 'instrument_played')).toEqual([]);
  });

  it('three bugs playing on the stage make a band and find secret_band_of_three', () => {
    const sim = world('band');
    const stage = sim.places.stage()!;
    const log = record(sim);
    const xs = [stage.x0 + 1.2, stage.x0 + 3.2, stage.x0 + 5.2];
    const bugs = (['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_grasshopper_boing'] as const).map((d, i) => {
      const b = sim.spawn('bug', d, xs[i]!, stage.y - 0.6);
      // Content, so none of them hops off to chat or eat while the drums are set out.
      for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
        sim.send({ type: 'set_need', id: b.id, need, value: 100 });
      return b;
    });
    const drums = xs.map((x) => sim.spawn('item', 'item_inst_thimble_drum', x + 0.75, stage.y - 0.4));
    sim.run(60);
    bugs.forEach((b, i) => {
      // Each one playing the drum beside it, as if it had walked up to it.
      const brain = b.bug!;
      brain.mode = 'st_use';
      brain.action = 'play';
      brain.timer = 600;
      brain.targetId = drums[i]!.id;
    });
    sim.run(30);
    expect(named(log, 'band_played').length).toBeGreaterThan(0);
    expect(sim.secrets).toContain('secret_band_of_three');
  });
});

describe('save version 13', () => {
  it('migrates version 12 by bumping the version', () => {
    const raw = { version: 12, world: { places: { stageLights: 0 } } };
    expect(MIGRATIONS[12]!(structuredClone(raw))).toEqual({ ...raw, version: 13 });
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(13);
  });

  it('a world from before M9 loads with an empty sequencer and gets the new instruments', () => {
    const raw = readFileSync(join(import.meta.dirname, 'fixtures', 'save-v12.json'), 'utf8');
    const save = loadSaveFile(raw);
    expect(save.version).toBe(SAVE_VERSION);
    const sim = Sim.load(save.world);
    expect(sim.places.sequencer).toEqual(newSequencerState());
    const defs = sim.entities.ofKind('item').map((e) => e.defId);
    expect(defs).toContain('item_inst_seedpod_maraca');
    expect(defs).toContain('item_inst_leaf_xylophone');
    // A second load adds nothing more.
    const again = Sim.load(JSON.parse(JSON.stringify(sim.serialize())));
    expect(again.entities.ofKind('item').filter((e) => e.defId === 'item_inst_seedpod_maraca')).toHaveLength(
      1,
    );
    void GROUND_Y;
  });
});
