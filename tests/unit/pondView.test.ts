import { describe, expect, it } from 'vitest';
import { Sim, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../src/game';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { PointerController } from '../../src/renderer/src/input/pointerController';
import { bugFace } from '../../src/renderer/src/render/bugFace';
import type { BugFaceInput } from '../../src/renderer/src/render/bugFace';
import { bugPose } from '../../src/renderer/src/render/bugPose';
import { Camera } from '../../src/renderer/src/render/camera';
import { movePose, reactionLook, reactionShowing } from '../../src/renderer/src/render/reactions';
import { FROZEN_TINT, HOT_TINT, NO_LOOK, WET_TINT, tagLook } from '../../src/renderer/src/render/tagLooks';
import { WaveSurface, swell } from '../../src/renderer/src/render/waveSurface';
import { cursorPose } from '../../src/renderer/src/ui/cursor';
import { POND_X } from './world';

describe('tag looks: every rule shows', () => {
  it('shows nothing for plain things', () => {
    expect(tagLook([])).toEqual(NO_LOOK);
    expect(tagLook(['tag_edible', 'tag_heavy'])).toEqual(NO_LOOK);
  });

  it('wet things look darker and drip, except in the water; sponges drip more', () => {
    const wet = tagLook(['tag_wet']);
    expect(wet.tint).toBe(WET_TINT);
    expect(wet.drip).not.toBeNull();
    expect(tagLook(['tag_wet'], 0.5).drip).toBeNull();
    expect(tagLook(['tag_wet', 'tag_absorbent']).dripEvery).toBeLessThan(wet.dripEvery);
  });

  it('hot glows, frozen sits in ice and beats wet, cold frosts', () => {
    expect(tagLook(['tag_hot'])).toMatchObject({ hot: true, tint: HOT_TINT });
    expect(tagLook(['tag_wet', 'tag_frozen'])).toMatchObject({
      ice: true,
      tint: FROZEN_TINT,
      drip: null,
      frost: true,
    });
    expect(tagLook(['tag_cold']).frost).toBe(true);
  });

  it('stink, soap, sticky, slime, and fuzz each have a look', () => {
    expect(tagLook(['tag_smelly']).stink).toBe(true);
    expect(tagLook(['tag_soapy']).foam).toBe(true);
    expect(tagLook(['tag_sticky']).gloss).toBe(true);
    expect(tagLook(['tag_slimy'])).toMatchObject({ slime: true });
    expect(tagLook(['tag_slimy']).drip).not.toBeNull();
    expect(tagLook(['tag_fuzzy']).fuzz).toBe(true);
  });
});

describe('the wobbly water surface', () => {
  it('ripples spread from a splash and settle back to flat', () => {
    const w = new WaveSurface(0, 1000);
    w.disturb(500, 200, 30);
    w.step(0.1);
    expect(Math.abs(w.heightAt(500))).toBeGreaterThan(1);
    const far0 = Math.abs(w.heightAt(700));
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    expect(Math.abs(w.heightAt(700))).toBeGreaterThan(far0);
    const e = w.energy();
    for (let i = 0; i < 600; i++) w.step(1 / 60);
    expect(w.energy()).toBeLessThan(e * 0.05);
  });

  it('never heaps or dips past its limit, even for a huge splash', () => {
    const w = new WaveSurface(0, 500);
    for (let i = 0; i < 20; i++) w.disturb(250, 5000, 40);
    for (let i = 0; i < 30; i++) {
      w.step(1 / 60);
      for (let x = 0; x <= 500; x += 10) expect(Math.abs(w.heightAt(x))).toBeLessThanOrEqual(w.limit + 1e-9);
    }
  });

  it('has a gentle swell and a slope for rocking floaters', () => {
    expect(Math.abs(swell(100, 1))).toBeLessThan(4);
    const w = new WaveSurface(0, 300);
    w.disturb(150, 100, 20);
    w.step(0.05);
    expect(Number.isFinite(w.slopeAt(140))).toBe(true);
  });
});

describe('faces, poses, and moves in and out of the water', () => {
  const base: BugFaceInput = {
    art: 'ladybug',
    mode: 'st_idle',
    needs: { need_hunger: 80, need_fun: 80, need_energy: 80, need_social: 80, need_clean: 90 },
    time: 0,
    likesFlinging: true,
  };

  it('Rollo holds his breath, Glorp floats in his shell, Dot sputters', () => {
    expect(bugFace({ ...base, art: 'pillbug', mode: 'st_swim' }).mouth).toBe('puff');
    expect(bugFace({ ...base, art: 'snail', mode: 'st_swim' }).form).toBe('in_shell');
    const dot = [0, 0.3, 0.6, 0.9].map((time) => bugFace({ ...base, mode: 'st_swim', time }).eyes);
    expect(new Set(dot).size).toBeGreaterThan(1);
  });

  it('a frozen bug stares wide-eyed out of its ice', () => {
    expect(bugFace({ ...base, frozen: true, reaction: null })).toMatchObject({ eyes: 'wide', mouth: 'o' });
  });

  it('Skeet is cool: half-closed eyes when content, and wide when flung', () => {
    expect(bugFace({ ...base, art: 'strider', likesFlinging: false, mood: 'mood_content' }).eyes).toBe(
      'sleepy',
    );
    expect(bugFace({ ...base, art: 'strider', likesFlinging: false, mode: 'st_airborne' }).eyes).toBe('wide');
  });

  it('swimmers paddle and bob', () => {
    const a = bugPose({ mode: 'st_swim', vx: 0, vy: 0, time: 0.2, phase: 0 });
    const b = bugPose({ mode: 'st_swim', vx: 0, vy: 0, time: 0.6, phase: 0 });
    expect(a.flail).toBe(true);
    expect(a.bob).not.toBe(b.bob);
  });

  it('the wet-dog shake starts and ends at rest', () => {
    expect(movePose('shake_off', 0, 1.2)).toMatchObject({ tilt: 0 });
    expect(movePose('shake_off', 1.2, 1.2)).toEqual({ bob: 0, tilt: 0, sx: 1, sy: 1, flip: 1 });
    expect(Math.abs(movePose('shake_off', 0.3, 1.2).tilt)).toBeGreaterThan(0.05);
  });

  it('water reactions show in the right modes, and Rollo loves a stink', () => {
    expect(reactionShowing('splash', 1.5, 'st_swim', 0.5)).toBe(true);
    expect(reactionShowing('splash', 1.5, 'st_idle', 0.5)).toBe(false);
    expect(reactionShowing('stink', 1.2, 'st_wander', 0.5)).toBe(true);
    expect(reactionLook('pillbug', 'stink', 0).emotion).toBe('love');
    expect(reactionLook('ladybug', 'stink', 0).tint).toBe('green');
    for (const art of ['ladybug', 'pillbug', 'snail', 'strider'] as const)
      for (const v of [0, 1, 2]) expect(reactionLook(art, 'shake_dry', v).move).toBe('shake_off');
  });
});

describe('clicking fixtures', () => {
  const setup = () => {
    const sim = Sim.empty();
    const camera = new Camera(sim.worldWidth, VIEW_WIDTH_M);
    camera.set(POND_X + 14);
    const clock = { t: 1000 };
    const input = new PointerController(sim, camera, VIEW_WIDTH_PX, () => clock.t);
    const tap = sim.environment.fixtureAt(POND_X + 25.1, 7.95)!;
    return { sim, camera, clock, input, tap };
  };

  it('hovering the hose tap shows the poking hand', () => {
    const { camera, input, tap } = setup();
    input.move(camera.worldToView(tap));
    expect(input.hoverFixture).toBe('fix_hose_tap');
    expect(
      cursorPose({
        mode: 'none',
        holding: false,
        overGrabbable: false,
        overButton: false,
        overFixture: true,
      }),
    ).toBe('hover_poke');
  });

  it('a quick click on empty space pokes it, so the tap turns on; a drag still pans', () => {
    const { sim, camera, clock, input, tap } = setup();
    const at = camera.worldToView(tap);
    input.down(at, 1000);
    clock.t = 1080;
    input.up(1080, at);
    sim.step();
    expect(sim.environment.state.hoseOn).toBe(true);
    const x0 = camera.x;
    input.down({ x: 900, y: 150 }, 2000);
    input.move({ x: 700, y: 150 }, 1 / 60, 2050);
    input.up(2100, { x: 700, y: 150 });
    sim.step();
    expect(camera.x).toBeGreaterThan(x0);
    expect(sim.environment.state.hoseOn).toBe(true);
  });
});

describe('water and property sounds', () => {
  it('every new rule and fixture makes a sound', () => {
    const sim = Sim.empty();
    const backend = new NullAudioBackend();
    const sfx = new Sfx(
      backend,
      () => 0.5,
      () => 0,
    );
    sfx.attach(sim.events);
    const ev = sim.events;
    ev.emit('splashed', { id: 1, kind: 'item', defId: 'item_pebble', x: 0, y: 0, speed: 6, size: 0.2 });
    ev.emit('splashed', { id: 1, kind: 'item', defId: 'item_cork', x: 0, y: 0, speed: 0.5, size: 0.1 });
    ev.emit('skipped', { id: 1, x: 0, y: 0, count: 1 });
    ev.emit('steamed', { id: 1, otherId: null, x: 0, y: 0 });
    ev.emit('froze', { id: 1, x: 0, y: 0 });
    ev.emit('thawed', { id: 1, x: 0, y: 0 });
    ev.emit('stuck', { a: 1, b: 2, x: 0, y: 0 });
    ev.emit('unstuck', { a: 1, b: 2, x: 0, y: 0 });
    ev.emit('magnet_snapped', { id: 1, magnetId: 2, x: 0, y: 0 });
    ev.emit('bubbles_blown', { id: 1, x: 0, y: 0, count: 2 });
    ev.emit('bug_smelled', { id: 1, defId: 'bug_ladybug_dot', sourceId: 2, liked: false });
    ev.emit('bug_shook_dry', { id: 1, defId: 'bug_ladybug_dot', x: 0, y: 0 });
    ev.emit('hose_toggled', { on: true, x: 0, y: 0 });
    ev.emit('hose_toggled', { on: false, x: 0, y: 0 });
    ev.emit('boot_bubbled', { x: 0, y: 0 });
    ev.emit('wrung_out', { id: 1, tag: 'tag_wet', x: 0, y: 0 });
    ev.emit('water_zapped', { x: 0, y: 0 });
    expect(sfx.log).toEqual([
      'splash',
      'plop',
      'plip',
      'tsss',
      'freeze',
      'thaw',
      'squelch',
      'pop',
      'clink',
      'bubble',
      'stink',
      'shake_dry',
      'click_on',
      'click_off',
      'blub',
      'squish',
      'bzzt',
    ]);
    expect(backend.played.length).toBeGreaterThan(30);
  });
});
