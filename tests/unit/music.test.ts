import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS } from '../../src/game/data/areas';
import { Rng } from '../../src/game';
import type { ManifestTrack, MusicManifest } from '../../src/shared/music';
import {
  TRACK_SPECS,
  manifestErrors,
  parseKey,
  pentatonic,
  sameNotes,
  scalePitchClasses,
} from '../../src/shared/music';
import { MusicClock, degreeMidi, inScale } from '../../src/renderer/src/audio/musicClock';
import { MusicEngine } from '../../src/renderer/src/audio/musicEngine';
import { MusicLibrary, padChords } from '../../src/renderer/src/audio/musicManifest';
import { IDLE_DEEP, IDLE_SOFT, QUIET_MIX, fullGain, mixTargets } from '../../src/renderer/src/audio/musicMix';
import type { MixState } from '../../src/renderer/src/audio/musicMix';
import {
  DEAD_ZONE,
  MusicPicker,
  fadeSeconds,
  musicPhase,
  thinning,
} from '../../src/renderer/src/audio/musicPick';
import type { LayerName, MusicSink } from '../../src/renderer/src/audio/musicPlayer';
import { MOTIF, MusicToys, bugPart, motifDegree, toyTimbre } from '../../src/renderer/src/audio/musicToys';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { capLook } from '../../src/renderer/src/render/areaArt/sequencerArt';
import { M9_ARTS, drawItemArt9 } from '../../src/renderer/src/render/draw/itemArt9';
import { M9_ITEMS } from '../../src/game/data/items9';
import { Graphics } from 'pixi.js';

// M9's background music and music toys, without WebAudio
// (docs/05-music-brief.md section 7.14).

const MUSIC_DIR = join(import.meta.dirname, '../../src/renderer/public/music');
const committed = JSON.parse(readFileSync(join(MUSIC_DIR, 'manifest.json'), 'utf8')) as MusicManifest;
const HOUR = 3600;

describe('the committed manifest', () => {
  it('passes its check, and every layer file it names is there', () => {
    expect(manifestErrors(committed)).toEqual([]);
    for (const [id, t] of Object.entries(committed.tracks)) {
      const files = t.kind === 'stinger' ? [t.file] : Object.values(t.layers);
      for (const f of files) {
        expect(existsSync(join(MUSIC_DIR, f!)), `${id}: ${f}`).toBe(true);
        expect(statSync(join(MUSIC_DIR, f!)).size).toBeGreaterThan(10_000);
      }
    }
  });

  it('has the owner’s first two tracks, conformed to 96 BPM in C major, with every layer', () => {
    for (const id of ['main_menu', 'stump_plaza_day']) {
      const t = committed.tracks[id] as ManifestTrack;
      expect(t.bpm).toBe(96);
      expect(t.key.tonic + ' ' + t.key.mode).toBe('C major');
      expect(Object.keys(t.layers).sort()).toEqual(['bass', 'drums', 'harmony', 'lead']);
      // Loops are whole bars long.
      expect(t.loop.samples % ((48000 * 60 * 4) / t.bpm)).toBe(0);
      // Suno's silent stems and the (silent) vocals were dropped (playtest F5).
      expect(Object.values(t.stems).some((v) => v.startsWith('dropped'))).toBe(true);
      expect(t.stems['12 Vocals.wav']).toMatch(/^dropped/);
    }
  });

  it('finds a track or a fallback for every area, by day and by night', () => {
    const lib = new MusicLibrary(committed);
    expect(lib.ok).toBe(true);
    for (const area of AREAS.all)
      for (const phase of ['day', 'night'] as const) {
        const c = lib.forArea(area.id, phase);
        expect(c.bpm, area.id).toBeGreaterThan(0);
        expect(c.scale).toHaveLength(5);
        expect(c.rules).toBe(phase);
      }
    expect(lib.forMenu().id).toBe('main_menu');
    expect(lib.forArea('area_stump_plaza', 'day').id).toBe('stump_plaza_day');
    expect(lib.forArea('area_stump_plaza', 'night')).toMatchObject({
      id: 'stump_plaza_night',
      rules: 'night',
    });
    expect(lib.forArea('area_puddle_pond', 'day')).toMatchObject({ id: 'puddle_pond_day', bpm: 96 });
    expect(lib.forArea('area_puddle_pond', 'night')).toMatchObject({ id: 'puddle_pond_night', bpm: 72 });
    // No porch tracks yet: the pad in the brief's key and tempo.
    expect(lib.forArea('area_under_porch', 'day')).toMatchObject({
      id: 'pad:under_porch_day',
      bpm: 96,
      track: null,
    });
    expect(lib.forArea('area_under_porch', 'night').key).toEqual({ tonic: 'A', mode: 'minor' });
    expect(lib.forArea('area_ant_hill_depths', 'night')).toMatchObject({
      id: 'pad:ant_hill_depths',
      key: { tonic: 'D', mode: 'minor' },
    });
    expect(lib.forArea('area_nowhere', 'day').key).toEqual({ tonic: 'C', mode: 'major' });
  });
});

describe('the library and its fallbacks (brief 7.13)', () => {
  const track = (area: string, phase: 'day' | 'night', key = 'E minor', bpm = 72): ManifestTrack => ({
    area,
    phase,
    bpm,
    bpmDetected: bpm,
    beatsPerBar: 4,
    key: { ...parseKey(key)!, confidence: 0.8, source: 'detected' },
    scale: pentatonic(parseKey(key)!.mode),
    loop: { samples: 48000 * 60, start: 4800, bars: 18, sourceStart: 10, score: 0.9 },
    layers: { drums: 'x/drums.ogg' },
    stems: {},
    warnings: [],
    source: { hash: 'sha1:0', importedAt: '2026-10-02' },
  });

  it('plays a track the owner adds later, by its area and phase alone', () => {
    const m: MusicManifest = {
      version: 1,
      sampleRate: 48000,
      lufs: -18,
      tracks: { puddle_pond_night: track('area_puddle_pond', 'night') },
    };
    const lib = new MusicLibrary(m);
    expect(lib.forArea('area_puddle_pond', 'night').id).toBe('puddle_pond_night');
    // The day borrows it, by the day rules.
    expect(lib.forArea('area_puddle_pond', 'day')).toMatchObject({ id: 'puddle_pond_night', rules: 'day' });
    // No menu theme, no plaza: the pad.
    expect(lib.forMenu().id).toBe('pad:main_menu');
  });

  it('plays the pad everywhere when the manifest is missing or broken', () => {
    for (const raw of [null, { version: 99 }, { ...committed, tracks: { bad: { phase: 'noon' } } }]) {
      const lib = new MusicLibrary(raw);
      expect(lib.ok).toBe(false);
      expect(lib.forArea('area_stump_plaza', 'day').track).toBeNull();
      expect(lib.forMenu().track).toBeNull();
    }
  });

  it('catches a scale that does not match its key, unknown layers, and a bad loop', () => {
    const t = track('area_puddle_pond', 'night');
    const bad = (patch: Partial<ManifestTrack>): string[] =>
      manifestErrors({ version: 1, sampleRate: 48000, lufs: -18, tracks: { x: { ...t, ...patch } } });
    expect(bad({})).toEqual([]);
    expect(bad({ scale: [0, 2, 4, 7, 9] }).join()).toMatch(/scale/);
    expect(bad({ layers: { kazoo: 'a.ogg' } as never }).join()).toMatch(/unknown layer/);
    expect(bad({ loop: { ...t.loop, samples: 0 } }).join()).toMatch(/loop samples/);
  });

  it('the brief’s keys put neighbors one step apart and night in the relative minor of day', () => {
    for (const spec of TRACK_SPECS.filter((s) => s.phase === 'night')) {
      const day = TRACK_SPECS.find((s) => s.area === spec.area && s.phase === 'day')!;
      expect(sameNotes(spec.key, day.key), spec.id).toBe(true);
    }
    expect(scalePitchClasses({ tonic: 'A', mode: 'minor' })).toEqual(
      scalePitchClasses({ tonic: 'C', mode: 'major' }),
    );
  });
});

describe('picking the music (brief 7.11)', () => {
  const areas = AREAS.all.map((a) => ({ id: a.id, x0: a.xStart, x1: a.xEnd }));
  const plaza = AREAS.get('area_stump_plaza');
  const noon = 12 * HOUR;
  const at = (p: MusicPicker, x: number, dt = 1 / 60, clock = noon) =>
    p.update({ menu: false, centerX: x, areas, clock }, dt);

  it('follows the camera’s center, with a dead zone at borders', () => {
    const p = new MusicPicker();
    expect(at(p, plaza.xStart + 10)).toMatchObject({ area: 'area_stump_plaza', fade: 'menu' });
    // Just over the border into the pond: not yet.
    expect(at(p, plaza.xStart - 0.2).area).toBe('area_stump_plaza');
    expect(at(p, plaza.xStart - 0.2, 0.5).area).toBe('area_stump_plaza');
    // A second over it: now.
    expect(at(p, plaza.xStart - 0.2, 0.6)).toMatchObject({ area: 'area_puddle_pond', fade: 'area' });
    // Far past a border: at once.
    const q = new MusicPicker();
    at(q, plaza.xStart + 10);
    expect(at(q, plaza.xStart - DEAD_ZONE - 0.1)).toMatchObject({ area: 'area_puddle_pond', fade: 'area' });
    // Wobbling back and forth on the border: no flapping.
    const r = new MusicPicker();
    at(r, plaza.xStart + 0.1);
    for (let i = 0; i < 20; i++)
      expect(at(r, plaza.xStart + (i % 2 ? 0.1 : -0.1), 0.04).area).toBe('area_stump_plaza');
  });

  it('crosses to the night track at 19:00 and back at 06:00, thinning the hour before', () => {
    expect(musicPhase(18.5 * HOUR)).toBe('day');
    expect(thinning(18.5 * HOUR)).toBe(true);
    expect(musicPhase(19 * HOUR)).toBe('night');
    expect(thinning(19.5 * HOUR)).toBe(false);
    expect(musicPhase(5.5 * HOUR)).toBe('night');
    expect(thinning(5.5 * HOUR)).toBe(true);
    expect(musicPhase(6 * HOUR + 24 * 24 * HOUR)).toBe('day');
    const p = new MusicPicker();
    at(p, 80, 1 / 60, 18.99 * HOUR);
    expect(at(p, 80, 1 / 60, 19 * HOUR).fade).toBe('phase');
    // The sundial skipping hours ahead: a quick crossfade.
    expect(at(p, 80, 1 / 60, 30 * HOUR).fade).toBe('skip');
  });

  it('plays the menu theme on the menu, and fades for two bars between areas', () => {
    const p = new MusicPicker();
    expect(p.update({ menu: true, centerX: 0, areas, clock: 0 }, 0.1)).toMatchObject({
      area: null,
      fade: 'menu',
    });
    expect(fadeSeconds('area', 96)).toBeCloseTo(5, 5);
    expect(fadeSeconds('phase', 96)).toBe(12);
    expect(fadeSeconds('skip', 72)).toBe(4);
  });
});

describe('the layer rules (brief 7.12)', () => {
  const mix = (patch: Partial<MixState>) => mixTargets({ ...QUIET_MIX, ...patch });

  it('applies every row, multiplying and clamping', () => {
    expect(mix({}).gains).toEqual({ drums: 1, bass: 1, harmony: 1, lead: 0.85 });
    expect(mix({ rules: 'night' }).gains).toEqual({ drums: 0.6, bass: 0.9, harmony: 1, lead: 0.7 });
    expect(mix({ thinning: true }).gains).toMatchObject({ drums: 0.3, lead: 0.85 * 0.6 });
    expect(mix({ idle: IDLE_SOFT }).gains).toMatchObject({ drums: 1, lead: 0.85 * 0.6 });
    // 120 s replaces the 45 s row.
    expect(mix({ idle: IDLE_DEEP }).gains).toMatchObject({ drums: 0.6, lead: 0.85 * 0.4 });
    // Busy brings the lead to full and cancels idle.
    expect(mix({ idle: IDLE_DEEP, busy: true }).gains).toEqual({ drums: 1, bass: 1, harmony: 1, lead: 1 });
    expect(mix({ playerMusic: true }).gains).toMatchObject({ harmony: 0.85, lead: 0.85 * 0.25 });
    expect(mix({ seqDrums: true }).gains.drums).toBe(0.5);
    expect(mix({ bugPlaying: true }).gains.lead).toBeCloseTo(0.425, 5);
    expect(mix({ antHillNight: true, rules: 'night' }).gains.drums).toBeCloseTo(0.18, 5);
  });

  it('drops the drums in the rain outdoors with a low-pass, and keeps them under shelter', () => {
    expect(mix({ raining: true })).toMatchObject({ gains: { drums: 0, lead: 0.85 * 0.6 }, lowpass: 2000 });
    expect(mix({ raining: true, sheltered: true })).toMatchObject({
      gains: { drums: 1, lead: 0.85 * 0.8 },
      lowpass: null,
    });
  });

  it('ducks the whole track for the pause board and the stinger', () => {
    expect(mix({ paused: true }).track).toBeCloseTo(10 ** (-6 / 20), 5);
    expect(mix({ paused: true }).lowpass).toBe(900);
    expect(mix({ stinger: true }).track).toBeCloseTo(10 ** (-9 / 20), 5);
    // A stem-less track follows through one gain: the mean of the four.
    expect(fullGain({ drums: 0, bass: 1, harmony: 1, lead: 0.6 })).toBeCloseTo(0.65, 5);
  });
});

describe('the music clock', () => {
  it('quantizes to the next 16th of the track’s beat, never more than a 16th late', () => {
    const c = new MusicClock();
    c.follow({ bpm: 96, beatsPerBar: 4, key: { tonic: 'C', mode: 'major' } }, 10);
    const sixteenth = 60 / 96 / 4;
    const rng = new Rng('quantize');
    for (let i = 0; i < 500; i++) {
      const t = 10 + rng.range(0, 120);
      const n = c.next(t);
      expect(n.time).toBeGreaterThanOrEqual(t - 1e-9);
      expect(n.time - t).toBeLessThanOrEqual(sixteenth + 1e-9);
      const beats = c.beatAt(n.time) * 4;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6);
    }
    expect(c.nextBar(10.1)).toBeCloseTo(10 + 4 * (60 / 96), 6);
  });

  it('keeps counting bars across a change of track, with the new track’s bar 1 on a bar line', () => {
    const c = new MusicClock();
    c.follow({ bpm: 96, beatsPerBar: 4, key: { tonic: 'C', mode: 'major' } }, 0);
    const bar = c.nextBar(7);
    c.follow({ bpm: 72, beatsPerBar: 4, key: { tonic: 'A', mode: 'minor' } }, bar);
    expect(c.beatInBar(bar)).toBeCloseTo(0, 6);
    expect(c.beatInBar(bar + 60 / 72)).toBeCloseTo(1, 6);
    expect(c.key).toEqual({ tonic: 'A', mode: 'minor' });
  });

  it('turns scale degrees into notes of the key', () => {
    const c = { tonic: 'C', mode: 'major' } as const;
    expect([0, 1, 2, 3, 4, 5].map((d) => degreeMidi(c, d))).toEqual([60, 62, 64, 67, 69, 72]);
    expect(degreeMidi(c, -1)).toBe(57);
    expect(degreeMidi({ tonic: 'E', mode: 'minor' }, 0, 5)).toBe(76);
    for (let d = -10; d < 15; d++)
      expect(inScale({ tonic: 'B', mode: 'minor' }, degreeMidi({ tonic: 'B', mode: 'minor' }, d))).toBe(true);
    expect(inScale(c, 61)).toBe(false);
    // The pad's chords keep to the pentatonic too.
    for (const mode of ['major', 'minor'] as const)
      for (const chord of padChords(mode))
        for (const s of chord) expect(pentatonic(mode)).toContain(((s % 12) + 12) % 12);
  });
});

describe('music toys', () => {
  it('walks a motif on repeated pokes, and gives each instrument its part', () => {
    expect(MOTIF.map((_m, i) => motifDegree(2, i))).toEqual([2, 3, 4, 6, 5, 4, 3, 1]);
    expect(toyTimbre('item_inst_comb_kazoo')).toBe('kazoo');
    expect(toyTimbre('item_inst_seedpod_maraca')).toBe('maraca');
    expect(toyTimbre('item_marble_red')).toBe('tine');
    // Drums on 1 and 3; bass root on 1, fifth on 3; castanets on the off-beats.
    expect(bugPart('drum', 0, 1)).toBe('hit');
    expect(bugPart('drum', 8, 1)).toBe('hit');
    expect(bugPart('drum', 4, 1)).toBeNull();
    expect(bugPart('bass', 0, 1)).toEqual({ degree: 0, velocity: 1 });
    expect(bugPart('bass', 8, 1)).toMatchObject({ degree: 3 });
    expect([0, 2, 4, 6].map((s) => bugPart('castanets', s, 1))).toEqual([null, 'hit', null, 'hit']);
  });

  it('every note in five minutes of random play is on the 16th grid and in the playing key (M9 acceptance)', () => {
    let now = 0;
    const clock = new MusicClock();
    const keys = ['C major', 'G major', 'E minor', 'B minor', 'D minor'].map((k) => parseKey(k)!);
    const backend = new NullAudioBackend();
    const toys = new MusicToys(
      backend,
      clock,
      () => now,
      () => 'area',
    );
    const rng = new Rng('five-minutes');
    const defs = [
      ...M9_ITEMS.map((d) => d.id),
      'item_inst_comb_kazoo',
      'item_inst_rubber_band_harp',
      'item_inst_can_bass',
      'item_marble_blue',
    ];
    let key = keys[0]!;
    clock.follow({ bpm: 96, beatsPerBar: 4, key }, 0);
    for (now = 0; now < 300; now += 1 / 60) {
      // The camera wanders into another area now and then.
      if (rng.chance(1 / 1200)) {
        key = rng.pick(keys);
        clock.follow({ bpm: rng.pick([72, 96]), beatsPerBar: 4, key }, clock.nextBar(now));
      }
      if (rng.chance(0.03)) {
        const defId = rng.pick(defs);
        toys.note({ id: rng.int(1, 9), defId, note: rng.int(0, 4), x: 0, y: 0, poked: rng.chance(0.7) });
      }
      toys.part('bug:1', 0.15, (step, time) => toys.bugStep(1, 'item_inst_leaf_xylophone', step, time, 1));
      toys.part('bug:2', 0.15, (step, time) => toys.bugStep(2, 'item_inst_can_bass', step, time, 1));
      if (rng.chance(0.001)) toys.band();
      toys.updateBand(1);
    }
    expect(toys.log.length).toBeGreaterThan(300);
    for (const n of toys.log) {
      expect(Math.abs(n.beat * 4 - Math.round(n.beat * 4))).toBeLessThan(1e-6);
      if (n.midi !== null)
        expect(inScale(parseKey(n.key)!, n.midi), `${n.defId} ${n.midi} ${n.key}`).toBe(true);
    }
    expect(toys.log.some((n) => n.source === 'band')).toBe(true);
    expect(backend.played.every((t) => t.bus === 'sfx')).toBe(true);
  });
});

/** A sink that records what it was told, on a clock the test moves. */
class FakeSink implements MusicSink {
  t = 0;
  readonly calls: string[] = [];
  readonly loaded = new Set<string>();
  readonly layerGains: { voice: number; layer: LayerName; gain: number; at: number }[] = [];
  private voices = 0;
  now(): number {
    return this.t;
  }
  load(id: string): Promise<void> {
    this.loaded.add(id);
    this.calls.push(`load ${id}`);
    return Promise.resolve();
  }
  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }
  unload(id: string): void {
    this.loaded.delete(id);
  }
  start(id: string, _loop: unknown, when: number, offset: number): number {
    this.calls.push(`start ${id} at ${when.toFixed(3)} +${offset.toFixed(2)}`);
    return ++this.voices;
  }
  setLayer(voice: number, layer: LayerName, gain: number, at: number): void {
    this.layerGains.push({ voice, layer, gain, at });
  }
  setTrack(voice: number, gain: number, at: number, seconds: number, curve = 'linear'): void {
    this.calls.push(
      `track ${voice} -> ${gain.toFixed(2)} at ${at.toFixed(2)} over ${seconds.toFixed(2)} ${curve}`,
    );
  }
  stop(voice: number, at: number): void {
    this.calls.push(`stop ${voice} at ${at.toFixed(2)}`);
  }
  setLowpass(hz: number | null): void {
    this.calls.push(`lowpass ${hz}`);
  }
}

describe('the music engine', () => {
  const areas = AREAS.all.map((a) => ({ id: a.id, x0: a.xStart, x1: a.xEnd }));
  const plaza = AREAS.get('area_stump_plaza');
  const input = (x: number, patch: Partial<Parameters<MusicEngine['update']>[0]> = {}) => ({
    menu: false,
    centerX: x,
    areas,
    clock: 12 * HOUR,
    raining: false,
    idle: 0,
    busy: false,
    bugPlaying: false,
    paused: false,
    ...patch,
  });
  const run = async (
    e: MusicEngine,
    sink: FakeSink,
    seconds: number,
    x: number,
    patch = {},
  ): Promise<void> => {
    for (let i = 0; i < seconds * 30; i++) {
      sink.t += 1 / 30;
      e.update(input(x, patch), 1 / 30);
      await Promise.resolve();
    }
  };

  it('starts the plaza, crossfades to the pond’s pad on the next bar, and resumes the plaza where it left off', async () => {
    const sink = new FakeSink();
    const backend = new NullAudioBackend();
    const e = new MusicEngine(sink, backend);
    // The pond as it was before its tracks came in: no music of its own.
    const { main_menu, stump_plaza_day } = committed.tracks;
    e.setLibrary(
      new MusicLibrary({
        ...committed,
        tracks: { main_menu: main_menu!, stump_plaza_day: stump_plaza_day! },
      }),
    );
    await run(e, sink, 1, plaza.xStart + 10);
    await run(e, sink, 1, plaza.xStart + 10);
    expect(e.report().playing).toBe('stump_plaza_day');
    await run(e, sink, 20, plaza.xStart + 10);
    // Over to the pond.
    await run(e, sink, 8, plaza.xStart - 5);
    const r = e.report();
    expect(r.playing).toBe('pad:puddle_pond_day');
    expect(r.key).toBe('G major');
    expect(sink.calls.some((c) => /^track 1 -> 0.00 .* out$/.test(c))).toBe(true);
    // The pad plays on the music bus, in G major.
    const pad = backend.played.filter((t) => t.bus === 'music');
    expect(pad.length).toBeGreaterThan(0);
    for (const t of pad) {
      const midi = Math.round(69 + 12 * Math.log2(t.freq / 440));
      expect(inScale({ tonic: 'G', mode: 'major' }, midi)).toBe(true);
    }
    // Back: the plaza picks up near where it was, not from the top.
    await run(e, sink, 8, plaza.xStart + 10);
    const restart = sink.calls.filter((c) => c.startsWith('start stump_plaza_day')).at(-1)!;
    expect(Number(restart.split('+')[1])).toBeGreaterThan(10);
  });

  it('crossfades from the plaza to the pond’s own track, and to each one’s night track after dark', async () => {
    const sink = new FakeSink();
    const e = new MusicEngine(sink, new NullAudioBackend());
    e.setLibrary(new MusicLibrary(committed));
    await run(e, sink, 4, plaza.xStart + 10);
    expect(e.report().playing).toBe('stump_plaza_day');
    await run(e, sink, 8, plaza.xStart - 5);
    expect(e.report().playing).toBe('puddle_pond_day');
    expect(e.report().key).toBe('E major');
    expect(e.clock.bpm).toBe(96);
    await run(e, sink, 20, plaza.xStart - 5, { clock: 22 * HOUR });
    expect(e.report().playing).toBe('puddle_pond_night');
    expect(e.clock.bpm).toBe(72);
    await run(e, sink, 8, plaza.xStart + 10, { clock: 22 * HOUR });
    expect(e.report().playing).toBe('stump_plaza_night');
  });

  it('drops the drums in the rain on the next bar line, and opens back up after', async () => {
    const sink = new FakeSink();
    const e = new MusicEngine(sink, new NullAudioBackend());
    e.setLibrary(new MusicLibrary(committed));
    await run(e, sink, 3, plaza.xStart + 10);
    await run(e, sink, 1, plaza.xStart + 10, { raining: true });
    const drums = sink.layerGains.filter((g) => g.layer === 'drums').at(-1)!;
    expect(drums.gain).toBe(0);
    const bars = e.clock.beatAt(drums.at) / 4;
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-6);
    expect(sink.calls).toContain('lowpass 2000');
    expect(e.report().layers.drums).toBe(0);
  });

  it('plays the pad everywhere when the manifest fails, in each area’s key', async () => {
    const sink = new FakeSink();
    const backend = new NullAudioBackend();
    const e = new MusicEngine(sink, backend);
    e.setLibrary(new MusicLibrary(null));
    await run(e, sink, 6, plaza.xStart + 10);
    expect(e.report().playing).toBe('pad:stump_plaza_day');
    expect(e.report().manifest).toBe(false);
    expect(backend.played.filter((t) => t.bus === 'music').length).toBeGreaterThan(3);
    expect(sink.calls.filter((c) => c.startsWith('start'))).toEqual([]);
  });
});

describe('M9 art', () => {
  it('draws each new instrument, and caps that grow and squash when they play', () => {
    for (const art of M9_ARTS) {
      const def = M9_ITEMS.find((d) => d.art === art)!;
      expect(drawItemArt9(new Graphics(), def, 60, 40)).toBe(true);
    }
    expect(capLook(false, 0).r).toBeLessThan(capLook(true, 0).r);
    expect(capLook(true, 1).squash).toBeLessThan(capLook(true, 0).squash);
  });
});
