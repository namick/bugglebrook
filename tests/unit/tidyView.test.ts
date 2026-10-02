import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/game';
import type { GameEvents } from '../../src/game';
import { REACTION_TYPES } from '../../src/game/events';
import { BUGS } from '../../src/game/data/bugs';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { TIDY_SFX, tidyTones } from '../../src/renderer/src/audio/tidySfx';
import {
  chooseDemo,
  demoDoneBy,
  demosDoneIn,
  ghostAt,
  scriptLength,
  trashDemo,
  whistleDemo,
} from '../../src/renderer/src/app/ghost';
import { reactionLook } from '../../src/renderer/src/render/reactions';
import {
  LID,
  LidSpring,
  SWOOSH_SECONDS,
  lidTarget,
  pupil,
  rummagePose,
  swoosh,
} from '../../src/renderer/src/render/trashLook';

// Playtest F1 and F2 in the renderer: the trash can's lid and eyes, the
// whistle's swoosh, the rummaging pose, the ghost-hand demos, the sounds,
// and the `trashed` reaction.

const idle = { held: null, over: false, rummaging: false, hint: 0, time: 0 };

describe('the trash can’s lid', () => {
  it('stays shut alone, lifts as something it would eat comes near, and gapes over its mouth', () => {
    expect(lidTarget(idle)).toBe(0);
    const far = lidTarget({ ...idle, held: 3.5 });
    const near = lidTarget({ ...idle, held: 1 });
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThan(LID.hungry);
    expect(lidTarget({ ...idle, held: 0.3, over: true })).toBe(LID.hungry);
    // Held far away, it does not notice.
    expect(lidTarget({ ...idle, held: LID.near + 1 })).toBe(0);
    // The hint lifts it a little; a rummaging bug bangs it about.
    expect(lidTarget({ ...idle, hint: 1 })).toBeCloseTo(LID.hint);
    expect(lidTarget({ ...idle, rummaging: true })).toBeGreaterThanOrEqual(LID.rummage);
  });

  it('springs open, and slammed shut it clangs once on the rim', () => {
    const lid = new LidSpring();
    for (let i = 0; i < 60; i++) lid.update(1 / 60, LID.hungry);
    expect(lid.open).toBeGreaterThan(0.8);
    lid.vel = -16;
    let clangs = 0;
    for (let i = 0; i < 60; i++) if (lid.update(1 / 60, 0)) clangs++;
    expect(clangs).toBe(1);
    expect(lid.open).toBeLessThan(0.05);
  });

  it('its googly eyes look toward what is held, and wander when nothing is', () => {
    const eye = { x: 0, y: 0 };
    const right = pupil(eye, { x: 200, y: 0 }, 9, 0);
    expect(right.x).toBeCloseTo(9);
    const up = pupil(eye, { x: 0, y: -200 }, 9, 0);
    expect(up.y).toBeCloseTo(-9);
    const idleLook = pupil(eye, null, 9, 3);
    expect(Math.hypot(idleLook.x, idleLook.y)).toBeLessThanOrEqual(9);
  });
});

describe('the whistle’s swoosh', () => {
  it('starts where the thing was, hops up, and ends where it lands, fading out', () => {
    const from = { x: 100, y: 800 };
    const to = { x: 1500, y: -50 };
    expect(swoosh(from, to, 0)).toMatchObject({ x: 100, y: 800, alpha: 1 });
    const end = swoosh(from, to, 1);
    expect(end.x).toBeCloseTo(1500);
    expect(end.y).toBeCloseTo(-50);
    expect(end.alpha).toBeCloseTo(0);
    // Midway it is above the straight line: a hop, not a slide.
    const mid = swoosh(from, to, 0.5);
    expect(mid.y).toBeLessThan((from.y + to.y) / 2);
    expect(mid.scale).toBeGreaterThan(1);
    expect(SWOOSH_SECONDS).toBeGreaterThan(0.3);
  });

  it('a rummaging bug tips head first toward the can, legs kicking', () => {
    const base = { tilt: 0, bob: 0, flail: false, legPhase: 0, stride: 0, sx: 1, sy: 1 };
    const right = rummagePose(base, 1, 1, 40);
    const left = rummagePose(base, 1, -1, 40);
    expect(right.tilt).toBeGreaterThan(0.8);
    expect(left.tilt).toBeLessThan(-0.8);
    expect(right.flail).toBe(true);
    expect(right.bob).toBeLessThan(0);
    expect(right.sx).toBe(1);
  });
});

describe('ghost-hand demos for the can and the whistle', () => {
  it('carries a thing over the can’s mouth and lets go, and taps the whistle', () => {
    const t = trashDemo({ x: 400, y: 800 }, { x: 900, y: 700 }, 'item_pebble');
    expect(t.kind).toBe('trash');
    const carrying = ghostAt(t, 2)!;
    expect(carrying.carry).toBe('item_pebble');
    const end = ghostAt(t, scriptLength(t) - 0.1)!;
    expect(end.carry).toBeNull();
    expect(Math.abs(end.x - 900)).toBeLessThan(60);
    const w = whistleDemo({ x: 500, y: 850 });
    expect(w.keys.some((k) => k.pose === 'grab')).toBe(true);
    expect(scriptLength(w)).toBeLessThan(3);
  });

  it('counts as found once the player trashes something or blows the whistle', () => {
    expect(demoDoneBy('trash_chomped', { by: 'player' })).toBe('trash');
    expect(demoDoneBy('trash_chomped', { by: 'tidy' })).toBeNull();
    expect(demoDoneBy('whistle_blown', {})).toBe('whistle');
    const done = demosDoneIn({
      open: [],
      pocketUsed: false,
      brewed: 0,
      benchUsed: false,
      secrets: [],
      eaten: 2,
      blown: 1,
    });
    expect(done).toEqual(expect.arrayContaining(['trash', 'whistle']));
    expect(chooseDemo(['trash', 'whistle'], ['whistle', 'trash'], new Map())).toBe('trash');
  });
});

describe('sounds', () => {
  it('every tidy sound has tones', () => {
    for (const name of TIDY_SFX) expect(tidyTones(name, 1, 1, () => 0.5).length, name).toBeGreaterThan(0);
  });

  it('every trash and tidy event makes a sound', () => {
    const sim = Sim.empty();
    const backend = new NullAudioBackend();
    let t = 0;
    const sfx = new Sfx(
      backend,
      () => 0.5,
      () => t,
    );
    sfx.attach(sim.events);
    const p = { x: 0, y: 0 };
    const emits: [keyof GameEvents, unknown, string][] = [
      [
        'trash_chomped',
        { id: 1, defId: 'item_pebble', fate: 'home', parts: 1, by: 'player', ...p },
        'trash_chomp',
      ],
      ['trash_burped', { size: 2, ...p }, 'trash_burp'],
      ['trash_spat', { id: 1, kind: 'bug', defId: 'bug_ladybug_dot', why: 'bug', ...p }, 'trash_spit'],
      ['trash_spat', { id: 1, kind: 'item', defId: 'item_pebble', why: 'hiccup', ...p }, 'trash_hiccup'],
      ['trash_poked', p, 'trash_clack'],
      ['trash_rummaged', { bugId: 1, itemId: null, defId: null, ...p }, 'trash_rummage'],
      ['item_came_home', { id: 1, defId: 'item_pebble', ...p }, 'came_home'],
      ['whistle_blown', { id: 1, count: 3, ...p }, 'whistle_toot'],
      [
        'item_tidied',
        { id: 1, defId: 'item_pebble', to: 'home', cause: 'whistle', fromX: 0, fromY: 0, ...p },
        'tidy_swoosh',
      ],
      ['litter_nudged', { id: 1, dir: 1, cause: 'rain', ...p }, 'litter_skitter'],
    ];
    for (const [name, payload, sound] of emits) {
      t += 1000;
      sim.events.emit(name, payload as never);
      expect(sfx.log[sfx.log.length - 1], name).toBe(sound);
    }
    // Things drifting home while nobody looks make no sound.
    const before = sfx.log.length;
    t += 1000;
    sim.events.emit('item_tidied', {
      id: 1,
      defId: 'item_pebble',
      to: 'home',
      cause: 'drift',
      fromX: 0,
      fromY: 0,
      x: 0,
      y: 0,
    });
    expect(sfx.log.length).toBe(before);
  });
});

describe('the trashed reaction', () => {
  it('is in the reaction list, with three cross, smelly variants for every bug', () => {
    expect(REACTION_TYPES).toContain('trashed');
    for (const bug of BUGS.all) {
      const looks = [0, 1, 2].map((v) => reactionLook(bug.art, 'trashed', v));
      expect(new Set(looks.map((l) => `${l.eyes}/${l.mouth}`)).size).toBe(3);
      expect(looks.every((l) => l.seconds > 1)).toBe(true);
    }
  });
});
