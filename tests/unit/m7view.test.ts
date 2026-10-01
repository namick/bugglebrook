import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/game/core/events';
import type { GameEvents } from '../../src/game';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { standUp } from '../../src/renderer/src/render/areaArt/barrierLive';
import { bloom } from '../../src/renderer/src/render/areaArt/flowerbedLive';
import type { AreaSound } from '../../src/renderer/src/render/areaArt/live';
import { shaftSlant, shaftStrength } from '../../src/renderer/src/render/areaArt/porchLook';

// M7's pure view helpers and sounds.

describe('area looks', () => {
  it('flowers open by day, close into buds at night, and ease between', () => {
    expect(bloom(12)).toBe(1);
    expect(bloom(23)).toBe(0);
    expect(bloom(3)).toBe(0);
    expect(bloom(6.5)).toBeCloseTo(0.5);
    expect(bloom(19.25)).toBeCloseTo(0.5);
    for (let h = 0; h < 24; h += 0.25) {
      expect(Math.abs(bloom(h + 0.25) - bloom(h))).toBeLessThan(0.2);
    }
  });

  it('the sunflower stands up with a wobble and settles upright', () => {
    expect(standUp(-1)).toBe(0);
    expect(standUp(0)).toBe(0);
    expect(standUp(5)).toBe(1);
    const curve = Array.from({ length: 16 }, (_, i) => standUp(i * 0.1));
    expect(Math.max(...curve)).toBeGreaterThan(1);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 1);
  });

  it("the porch's sunbeams swing across the floor through the day and are gone at night", () => {
    // Leaning right in the morning, straight down about one, leaning left by evening.
    expect(shaftSlant(8)).toBeGreaterThan(0);
    expect(shaftSlant(13)).toBeCloseTo(0);
    expect(shaftSlant(18)).toBeLessThan(0);
    for (let h = 7; h < 19; h += 0.5) expect(shaftSlant(h + 0.5)).toBeLessThanOrEqual(shaftSlant(h));
    expect(shaftStrength(12)).toBe(1);
    expect(shaftStrength(23)).toBe(0);
    expect(shaftStrength(3)).toBe(0);
  });
});

describe('M7 sounds', () => {
  it('every new area event makes a sound', () => {
    const bus = new EventBus<GameEvents>();
    const sfx = new Sfx(
      new NullAudioBackend(),
      () => 0.5,
      () => 0,
    );
    sfx.attach(bus);
    const p = { x: 0, y: 0 };
    const emits: [keyof GameEvents, unknown][] = [
      ['sunflower_drank', p],
      ['area_unlocked', { areaId: 'a', barrierId: 'b', ...p }],
      ['tunnel_rolled', { id: 1, fits: true, ...p }],
      ['tunnel_rolled', { id: 1, fits: false, ...p }],
      ['lift_moved', { phase: 'up', count: 1, first: true, ...p }],
      ['stage_lights_changed', { mode: 1, ...p }],
      ['speaker_toggled', { id: 'x', muted: true, ...p }],
      ['painted', { id: 1, paint: 'paint_red', ...p }],
      ['gnome_knocked', { count: 1, ...p }],
      ['gnome_answered', p],
      ['band_played', { count: 3, ...p }],
      ['lamp_toggled', { on: true, ...p }],
      ['spider_waved', p],
      ['track_snapped', { id: 1, on: true, angle: 0, ...p }],
      ['claw_moved', { phase: 'prize', id: 1, ...p }],
      ['dominoes_fell', { count: 12, ...p }],
      ['stink_cloud', { id: 1, ...p }],
      ['bug_freed', { id: 1, defId: 'd', partnerId: 2, ...p }],
      ['bug_changed', { id: 1, defId: 'd', form: 'cocoon', ...p }],
      ['bug_chopped', { id: 1, defId: 'd', itemId: 2, ...p }],
      ['bug_blinked', { id: 1, defId: 'd', ...p }],
    ];
    for (const [name, payload] of emits) {
      const before = sfx.log.length;
      bus.emit(name, payload as never);
      expect(sfx.log.length, name).toBeGreaterThan(before);
    }
  });
});

describe('M7 ambience', () => {
  it("every area's ambient sounds play, quietly, without filling the log", () => {
    const backend = new NullAudioBackend();
    const sfx = new Sfx(
      backend,
      () => 0.5,
      () => 0,
    );
    const sounds: AreaSound[] = [
      'bee_hum',
      'birdsong',
      'creak',
      'drip',
      'board_patter',
      'bubble_blorp',
      'steam_hiss',
      'arcade_blip',
      'leaf_rustle',
      'scratch',
      'tulip_hum',
    ];
    for (const name of sounds) {
      const before = backend.played.length;
      sfx.ambient(name, 0.8);
      expect(backend.played.length, name).toBeGreaterThan(before);
      for (const tone of backend.played.slice(before)) expect(tone.gain ?? 0, name).toBeLessThanOrEqual(0.5);
    }
    expect(sfx.log).toEqual([]);
  });
});
