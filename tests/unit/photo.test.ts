import { describe, expect, it } from 'vitest';
import {
  GROUND_Y,
  PHOTO_MOMENT_TICKS,
  SAVE_VERSION,
  Sim,
  TOTEM_TICKS,
  findTotem,
  loadSaveFile,
} from '../../src/game';
import type { GameEvents } from '../../src/game';
import type { Entity } from '../../src/game/core/entities';
import { BUGS } from '../../src/game/data/bugs';
import { MIGRATIONS } from '../../src/game/save/migrations';
import { validateSaveFile } from '../../src/game/save/validate';
import { reactionLook } from '../../src/renderer/src/render/reactions';
import { PLAZA_X } from './world';

// M11, photo mode (game design doc, sections 12, 14, and 19): the camera
// moment, the freeze, the totem secret, and save version 11.

type Logged = { name: keyof GameEvents; payload: Record<string, unknown> };
function record(sim: Sim): Logged[] {
  const log: Logged[] = [];
  sim.events.onAny((name, payload) => log.push({ name, payload: payload as Record<string, unknown> }));
  return log;
}
const named = (log: Logged[], name: keyof GameEvents): Record<string, unknown>[] =>
  log.filter((e) => e.name === name).map((e) => e.payload);

const OPEN = PLAZA_X + 28;

function world(seed: string): Sim {
  const sim = Sim.empty({ seed });
  sim.step();
  return sim;
}

function bugAt(sim: Sim, defId: string, x: number, y?: number): Entity {
  const b = sim.spawn('bug', defId, x, y ?? GROUND_Y - 0.6);
  for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
    sim.send({ type: 'set_need', id: b.id, need, value: 100 });
  return b;
}

const positions = (sim: Sim): string => JSON.stringify(sim.views().map((v) => [v.id, v.x, v.y, v.angle]));

describe('the camera moment and the freeze', () => {
  it('bugs in frame react to the camera by personality, then the world holds still', () => {
    const sim = world('photo');
    const dot = bugAt(sim, 'bug_ladybug_dot', OPEN);
    const boing = bugAt(sim, 'bug_grasshopper_boing', OPEN + 2);
    const far = bugAt(sim, 'bug_snail_glorp', PLAZA_X - 20);
    sim.send({ type: 'focus', x0: OPEN - 9.6, x1: OPEN + 9.6 });
    sim.run(30);
    const log = record(sim);
    sim.send({ type: 'photo_mode', open: true });
    sim.step();
    expect(named(log, 'photo_mode_opened')).toHaveLength(1);
    const reacted = named(log, 'bug_reacted').filter((e) => e.reaction === 'camera');
    expect(reacted.map((e) => e.id).sort()).toEqual([dot.id, boing.id].sort());
    expect(reacted.map((e) => e.id)).not.toContain(far.id);
    expect(sim.photo).toMatchObject({ frozen: false });
    // The camera moment: the world runs on for 0.8 s.
    const before = positions(sim);
    sim.run(PHOTO_MOMENT_TICKS);
    expect(sim.photo).toMatchObject({ frozen: true });
    // Then nothing moves and the clock stops.
    const tick = sim.tick;
    const frozen = positions(sim);
    sim.run(120);
    expect(sim.tick).toBe(tick);
    expect(positions(sim)).toBe(frozen);
    expect(frozen).not.toBe(before);
    // Commands still land while frozen: the shutter.
    sim.send({
      type: 'photo_taken',
      frame: 'frame_leaf',
      filter: 'filter_warm',
      stickers: 2,
      zoom: 1.5,
      bugs: ['bug_ladybug_dot'],
    });
    sim.send({ type: 'photo_saved', ok: true });
    sim.step();
    expect(named(log, 'photo_taken')).toEqual([
      { frame: 'frame_leaf', filter: 'filter_warm', stickers: 2, zoom: 1.5, bugs: ['bug_ladybug_dot'] },
    ]);
    expect(named(log, 'photo_saved')).toEqual([{ ok: true }]);
    // The camera goes away: the world runs again.
    sim.send({ type: 'photo_mode', open: false });
    sim.step();
    expect(sim.photo).toBeNull();
    expect(named(log, 'photo_mode_closed')).toHaveLength(1);
    sim.run(60);
    expect(sim.tick).toBe(tick + 61);
  });

  it('opening twice or closing an idle camera does nothing', () => {
    const sim = world('photo-twice');
    const log = record(sim);
    sim.send({ type: 'photo_mode', open: false });
    sim.step();
    sim.send({ type: 'photo_mode', open: true });
    sim.send({ type: 'photo_mode', open: true });
    sim.step();
    expect(named(log, 'photo_mode_opened')).toHaveLength(1);
    expect(named(log, 'photo_mode_closed')).toHaveLength(0);
  });

  it('runs the same with and without a freeze in between (determinism)', () => {
    const run = (freeze: boolean): string => {
      const sim = world('photo-same');
      bugAt(sim, 'bug_ladybug_dot', OPEN);
      sim.run(60);
      if (freeze) {
        sim.send({ type: 'photo_mode', open: true });
        sim.run(PHOTO_MOMENT_TICKS + 1);
        sim.run(200);
        sim.send({ type: 'photo_mode', open: false });
        sim.step();
      } else {
        // The same ticks without the freeze: the camera moment plus the close step.
        sim.run(PHOTO_MOMENT_TICKS + 1);
      }
      sim.run(300);
      return `${sim.tick}:${sim.views().length}`;
    };
    // The frozen run stops its clock, so both reach the same tick count.
    expect(run(true)).toBe(run(false));
  });

  it('every bug has three camera faces of its own', () => {
    for (const def of BUGS.all) {
      const looks = [0, 1, 2].map((v) => reactionLook(def.art, 'camera', v));
      expect(new Set(looks.map((l) => `${l.eyes}/${l.mouth}/${l.move}`)).size, def.id).toBe(3);
    }
    // Dot, Skeet, and Prim pose; Boing hops into frame; Whiff and Twig keep still or hide.
    for (const art of ['ladybug', 'strider', 'mantis'] as const)
      expect(reactionLook(art, 'camera', 0).move).toBe('pose');
    expect(reactionLook('grasshopper', 'camera', 0).move).toBe('hop');
    expect(['cower', 'shiver', 'none']).toContain(reactionLook('stinkbug', 'camera', 0).move);
    expect(reactionLook('stickinsect', 'camera', 0).move).toBe('none');
    expect(reactionLook('snail', 'camera', 0).seconds).toBeGreaterThan(2.4);
  });
});

describe('the bug totem (secret_bug_totem)', () => {
  const still = (id: number, x: number, y: number) => ({ id, x, y, vx: 0, vy: 0, held: false });

  it('finds four bugs resting in a stack, bottom first', () => {
    const stack = [
      still(1, 10, 9),
      still(2, 10.1, 8.2),
      still(3, 9.9, 7.3),
      still(4, 10.2, 6.5),
      still(9, 20, 9),
    ];
    expect(findTotem(stack)).toEqual([1, 2, 3, 4]);
    expect(findTotem([...stack].reverse())).toEqual([1, 2, 3, 4]);
  });

  it('needs four, still, in the hand of nobody, and close to one line', () => {
    expect(findTotem([still(1, 10, 9), still(2, 10, 8.2), still(3, 10, 7.3)])).toBeNull();
    expect(
      findTotem([still(1, 10, 9), still(2, 10, 8.2), still(3, 10, 7.3), { ...still(4, 10, 6.5), vx: 2 }]),
    ).toBeNull();
    expect(
      findTotem([
        still(1, 10, 9),
        still(2, 10, 8.2),
        still(3, 10, 7.3),
        { ...still(4, 10, 6.5), held: true },
      ]),
    ).toBeNull();
    expect(
      findTotem([still(1, 10, 9), still(2, 10, 8.2), still(3, 10, 7.3), still(4, 11.5, 6.5)]),
    ).toBeNull();
    // A gap too big is not a stack (a bug on the stump over one on the ground).
    expect(findTotem([still(1, 10, 9), still(2, 10, 8.2), still(3, 10, 7.3), still(4, 10, 4)])).toBeNull();
  });

  it('four frozen bugs stacked in the plaza strike a pose and find the secret after two seconds', () => {
    const sim = world('totem');
    const ids: number[] = [];
    let y = sim.surfaceY(OPEN) - 0.5;
    for (const def of ['bug_stagbeetle_moose', 'bug_pillbug_rollo', 'bug_ladybug_dot', 'bug_firefly_flick']) {
      const b = bugAt(sim, def, OPEN, y);
      ids.push(b.id);
      y -= 1.1;
    }
    // Frozen solid (rule R12): they hold still like a stack of resting bugs would.
    for (const id of ids) sim.send({ type: 'set_tag', id, tag: 'tag_frozen', on: true, seconds: 60 });
    const log = record(sim);
    sim.run(TOTEM_TICKS + 60);
    expect(sim.secrets).toContain('secret_bug_totem');
    const made = named(log, 'totem_made');
    expect(made).toHaveLength(1);
    expect((made[0]!.ids as number[]).sort()).toEqual([...ids].sort());
    expect(named(log, 'secret_found').map((e) => e.id)).toContain('secret_bug_totem');
    // It is found once, and the stack does not re-fire every two seconds.
    sim.run(TOTEM_TICKS * 2);
    expect(named(log, 'totem_made')).toHaveLength(1);
  });
});

describe('save version 12: photos in the save', () => {
  it('bumps a version 11 save without touching anything else', () => {
    const sim = world('save11');
    const file = JSON.parse(
      JSON.stringify({
        version: 11,
        savedAt: 't',
        world: sim.serialize(),
        view: { cameraX: 1 },
        meta: { createdAt: 't', thumb: null },
      }),
    );
    const next = MIGRATIONS[11]!(structuredClone(file));
    expect(next).toEqual({ ...file, version: 12 });
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(12);
    expect(loadSaveFile(JSON.stringify(file)).meta).toEqual({ createdAt: 't', thumb: null });
  });

  it('keeps photos through a load, and refuses malformed ones', () => {
    const sim = world('save11-photos');
    const photo = {
      at: '2026-01-01T00:00:00.000Z',
      thumb: 'data:image/jpeg;base64,AAAA',
      file: null,
      frame: 'frame_none',
      filter: 'filter_none',
    };
    const file = {
      version: 12,
      savedAt: 't',
      world: sim.serialize(),
      view: { cameraX: 1 },
      meta: { createdAt: 't', thumb: null, photos: [photo, { ...photo, file: '/tmp/x.png' }] },
    };
    expect(loadSaveFile(JSON.stringify(file)).meta.photos).toHaveLength(2);
    const bad = (photos: unknown): string[] =>
      validateSaveFile(JSON.parse(JSON.stringify({ ...file, meta: { ...file.meta, photos } })));
    expect(bad(undefined)).toEqual([]);
    expect(bad([])).toEqual([]);
    expect(bad('nope')).toEqual(['meta.photos is invalid']);
    expect(bad([{ ...photo, thumb: 3 }])).toEqual(['meta.photos is invalid']);
    expect(bad([{ ...photo, file: 7 }])).toEqual(['meta.photos is invalid']);
  });
});
