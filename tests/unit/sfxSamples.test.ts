import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUND_Y, Rng, Sim } from '../../src/game';
import { CONTENT } from '../../src/game';
import { POND_X, PLAZA_X } from './world';
import type { AmbienceArea } from '../../src/renderer/src/audio/ambience';
import {
  ambienceBus,
  areaWeights,
  bedTargets,
  equalPower,
  nightMix,
} from '../../src/renderer/src/audio/ambience';
import { AmbiencePlayer } from '../../src/renderer/src/audio/ambiencePlayer';
import { SampleEngine } from '../../src/renderer/src/audio/sampleEngine';
import { ShuffleBag, panFor, semisToRate, vary } from '../../src/renderer/src/audio/samplePick';
import { NullSampleSink } from '../../src/renderer/src/audio/samplePlayer';
import { VoicePool } from '../../src/renderer/src/audio/sampleVoices';
import { Sfx } from '../../src/renderer/src/audio/sfx';
import { fixtureManifest } from '../../src/renderer/src/audio/sfxFixture';
import { SfxLibrary } from '../../src/renderer/src/audio/sfxManifest';
import { NullAudioBackend } from '../../src/renderer/src/audio/synth';
import { BugVoices, voiceLine } from '../../src/renderer/src/audio/voices';
import { recordedLine } from '../../src/renderer/src/audio/voiceSamples';
import { sfxManifestErrors, soundCreditErrors } from '../../src/shared/sfx';

// The sample player (docs/08-sound-brief.md, parts 6.4 to 6.6), with the
// null sink: nothing decodes, every play is recorded.

const ROOT = resolve(import.meta.dirname, '../..');
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function engineWith(folders?: string[]): Promise<{ engine: SampleEngine; sink: NullSampleSink }> {
  const sink = new NullSampleSink(true);
  let s = 1;
  const engine = new SampleEngine(sink, () => (s = (s * 16807) % 2147483647) / 2147483647);
  await engine.setLibrary(new SfxLibrary(fixtureManifest(folders)));
  return { engine, sink };
}

describe('the committed sample manifest', () => {
  it('validates, and so do its credits', () => {
    const dir = join(ROOT, 'src/renderer/public/sfx');
    expect(sfxManifestErrors(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')))).toEqual([]);
    expect(soundCreditErrors(JSON.parse(readFileSync(join(dir, 'credits.json'), 'utf8')))).toEqual([]);
  });

  it('keeps the built sounds under the 15 MB cap', () => {
    const size = (d: string): number =>
      readdirSync(d).reduce((n, f) => {
        const p = join(d, f);
        return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
      }, 0);
    expect(size(join(ROOT, 'src/renderer/public/sfx'))).toBeLessThan(15 * 1024 * 1024);
  });

  it('refuses a manifest with unknown folders or bad takes', () => {
    expect(
      sfxManifestErrors({ version: 1, sounds: { boom: { kind: 'oneshot', takes: [] } }, voices: {} }),
    ).toEqual(['boom: not in the catalog']);
    const bad = fixtureManifest(['splash']);
    bad.sounds.splash!.takes[0]!.file = '../escape.ogg';
    expect(sfxManifestErrors(bad)).toEqual(['splash: a bad take']);
    expect(new SfxLibrary(bad).empty).toBe(true);
  });
});

describe('resolving a sound', () => {
  const lib = new SfxLibrary(fixtureManifest(['splash', 'plop', 'impact_metal', 'burp', 'board_patter']));

  it('plays a folder of its own, borrows through an alias, and falls back to the synth', () => {
    expect(lib.resolve('splash')).toMatchObject({ folder: 'splash', alias: null });
    expect(lib.resolve('plip')).toMatchObject({ folder: 'plop', alias: { semis: 7, gainDb: -6 } });
    expect(lib.resolve('trash_burp')?.alias?.bandpass).toBeGreaterThan(0);
    expect(lib.resolve('drop', 'metal')).toMatchObject({ folder: 'impact_metal', alias: null });
    expect(lib.resolve('drop', 'wood')).toBeNull();
    expect(lib.resolve('sparkle')).toBeNull();
    // A bed never plays as a one-shot.
    expect(lib.resolve('board_patter')).toBeNull();
  });
});

describe('sample variation', () => {
  it('never deals the same take twice in a row, and uses every take before a repeat', () => {
    let s = 7;
    const bag = new ShuffleBag(5, () => (s = (s * 16807) % 2147483647) / 2147483647);
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const t = bag.next();
      expect(t).not.toBe(last);
      last = t;
      seen.add(t);
      if (i % 5 === 4) {
        expect(seen.size).toBe(5);
        seen.clear();
      }
    }
  });

  it('keeps pitch and gain in range, and maps intensity to loudness and darkness', () => {
    for (let i = 0; i < 1000; i++) {
      const r = (i * 0.6180339) % 1;
      const v = vary(() => r, 1.5, 1);
      expect(v.rate).toBeGreaterThanOrEqual(semisToRate(-1.5) - 1e-9);
      expect(v.rate).toBeLessThanOrEqual(semisToRate(1.5) + 1e-9);
      expect(Math.abs(v.gainDb)).toBeLessThanOrEqual(1.5);
      expect(v.lowpass).toBeNull();
    }
    const soft = vary(() => 0.5, 1.5, 0);
    expect(soft.gainDb).toBeCloseTo(-18);
    expect(soft.lowpass).toBeCloseTo(1500);
    expect(vary(() => 0.5, 0, 1, 7).rate).toBeCloseTo(semisToRate(7));
  });

  it('pans by screen position, quietly just off screen, and skips further away', () => {
    expect(panFor(0)!.pan).toBeCloseTo(-0.6);
    expect(panFor(1)!.pan).toBeCloseTo(0.6);
    expect(panFor(0.5)!.pan).toBeCloseTo(0);
    expect(panFor(1.05)).toEqual({ pan: 1, gainDb: -9 });
    expect(panFor(-0.05)).toEqual({ pan: -1, gainDb: -9 });
    expect(panFor(1.2)).toBeNull();
    expect(panFor(-0.2)).toBeNull();
  });

  it('steals the oldest voice of a folder over its limit, and the oldest of all over 24', () => {
    const pool = new VoicePool();
    expect(pool.admit(1, 'splash', 3, 0, 5)).toEqual([]);
    pool.admit(2, 'splash', 3, 0.1, 5);
    pool.admit(3, 'splash', 3, 0.2, 5);
    expect(pool.admit(4, 'splash', 3, 0.3, 5)).toEqual([1]);
    expect(pool.count('splash', 0.3)).toBe(3);
    // Spots and the whistle play one at a time.
    pool.admit(5, 'birdsong', 1, 0.4, 5);
    expect(pool.admit(6, 'birdsong', 1, 0.5, 5)).toEqual([5]);
    // Voices that ended are gone.
    expect(pool.count('splash', 6)).toBe(0);
    const big = new VoicePool();
    for (let i = 1; i <= 24; i++) big.admit(i, `f${i}`, 4, 0, 10);
    expect(big.admit(25, 'f25', 4, 1, 10)).toEqual([1]);
  });
});

describe('Sfx with samples', () => {
  const setup = async (folders?: string[]) => {
    const sim = Sim.empty();
    const backend = new NullAudioBackend();
    const { engine, sink } = await engineWith(folders);
    const sfx = new Sfx(
      backend,
      () => 0.5,
      () => 0,
      engine,
    );
    sfx.attach(sim.events, undefined, undefined, (id) => {
      const v = sim.view(id);
      return v ? { x: v.x, y: v.y } : null;
    });
    // The screen shows the plaza's first 20 m.
    engine.screen = (x) => (x - PLAZA_X) / 20;
    return { sim, backend, sfx, engine, sink };
  };

  it('plays a sample where the manifest has one, from the synth where not, and logs both', async () => {
    const { backend, sfx, sink } = await setup(['splash']);
    sfx.play('splash');
    expect(sink.played).toHaveLength(1);
    expect(backend.played).toHaveLength(0);
    sfx.play('sparkle');
    expect(backend.played.length).toBeGreaterThan(0);
    expect(sfx.log).toEqual(['splash', 'sparkle']);
    expect(sfx.plays.map((p) => p.source)).toEqual(['sample', 'synth']);
  });

  it('with no manifest at all, sounds exactly as before', async () => {
    const sim = Sim.empty();
    const a = new NullAudioBackend();
    const b = new NullAudioBackend();
    const plain = new Sfx(
      a,
      () => 0.5,
      () => 0,
    );
    const empty = new Sfx(
      b,
      () => 0.5,
      () => 0,
      new SampleEngine(new NullSampleSink(true)),
    );
    plain.attach(sim.events);
    empty.attach(sim.events);
    for (const name of ['splash', 'drop', 'burp', 'impact_glass', 'page_flip'] as const) {
      plain.play(name);
      empty.play(name);
    }
    expect(b.played).toEqual(a.played);
  });

  it('pans an event by where it happened, and skips one far off screen', async () => {
    const { sim, sfx, sink } = await setup(['impact_wood']);
    const left = sim.spawn('item', 'item_pebble', PLAZA_X + 2, GROUND_Y - 0.21);
    sim.events.emit('item_poked', { id: left.id, defId: 'item_pebble', x: PLAZA_X + 2, y: GROUND_Y - 0.21 });
    expect(sink.played.at(-1)!.pan).toBeLessThan(-0.4);
    sim.events.emit('item_poked', { id: left.id, defId: 'item_pebble', x: PLAZA_X + 18, y: GROUND_Y - 0.21 });
    expect(sink.played.at(-1)!.pan).toBeGreaterThan(0.4);
    const before = sink.played.length;
    sim.events.emit('item_poked', { id: left.id, defId: 'item_pebble', x: POND_X, y: GROUND_Y - 0.21 });
    expect(sink.played.length).toBe(before);
    expect(sfx.plays.at(-1)!.source).toBe('skipped');
  });

  it('pans an event that names only its entity by the entity', async () => {
    const { sim, sink } = await setup(['burp']);
    const bug = sim.spawn('bug', 'bug_snail_glorp', PLAZA_X + 19, GROUND_Y - 0.4);
    sim.events.emit('bug_tickled', { id: bug.id, defId: 'bug_snail_glorp', level: 1 }); // synth: tickle
    sim.events.emit('potion_burped', { id: bug.id, kind: 'bubble' } as never);
    expect(sink.played.at(-1)!.pan).toBeGreaterThan(0.4);
  });

  it('plays two different takes for two drops, and a material impact for drop', async () => {
    const { sfx, sink } = await setup(['impact_wood']);
    sfx.play('drop', 1, 'wood');
    sfx.play('drop', 1, 'wood');
    const [a, b] = sink.played.slice(-2);
    expect(a!.file).not.toBe(b!.file);
    expect(a!.file).toMatch(/^impact_wood\//);
  });

  it('applies alias tweaks: repeats, pitch, the tail of a take', async () => {
    const { sfx, sink } = await setup(['impact_wood', 'plop', 'slurp']);
    sfx.play('crash');
    const crash = sink.played.slice(-3);
    expect(crash.map((p) => p.delay)).toEqual([0, 0.07, 0.14]);
    expect(crash[2]!.gain).toBeLessThan(crash[0]!.gain);
    sfx.play('plip');
    expect(sink.played.at(-1)!.rate).toBeGreaterThan(semisToRate(5));
    sfx.play('gulp');
    const gulp = sink.played.at(-1)!;
    expect(gulp.offset).toBeGreaterThan(0);
    expect(gulp.duration).toBeGreaterThan(0);
  });

  it('keeps the voice limit per folder by fading the oldest', async () => {
    const { sfx, sink } = await setup(['birdsong']);
    sfx.play('birdsong');
    sfx.play('birdsong');
    expect(sink.stopped).toEqual([sink.played[0]!.handle]);
  });

  it('plays nothing while the SFX slider is at zero', async () => {
    const { sfx, sink, engine, backend } = await setup(['splash']);
    engine.sfxVolume = 0;
    sfx.play('splash');
    expect(sink.played).toHaveLength(0);
    expect(backend.played).toHaveLength(0);
  });

  it('stops the synth rain and wind ticks once their beds play', async () => {
    const { sfx, backend } = await setup(['splash']);
    sfx.covered = (name) => name === 'rain';
    sfx.ambient('rain', 1);
    expect(backend.played).toHaveLength(0);
    sfx.ambient('wind', 1);
    expect(backend.played.length).toBeGreaterThan(0);
  });

  it('falls back to the synth for a folder that fails to decode, with one warning', async () => {
    const sink = new NullSampleSink(false);
    const engine = new SampleEngine(sink);
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...a: unknown[]) => void warnings.push(a);
    try {
      await engine.setLibrary(new SfxLibrary(fixtureManifest(['splash'])));
    } finally {
      console.warn = warn;
    }
    expect(warnings).toHaveLength(1);
    const backend = new NullAudioBackend();
    new Sfx(
      backend,
      () => 0.5,
      () => 0,
      engine,
    ).play('splash');
    expect(backend.played.length).toBeGreaterThan(0);
  });
});

const AREAS: AmbienceArea[] = CONTENT.areas.all
  .map((a) => ({ mood: a.mood, x0: a.xStart, x1: a.xEnd, open: true, hidden: !!a.hidden }))
  .sort((a, b) => a.x0 - b.x0);
const area = (mood: string): AmbienceArea => AREAS.find((a) => a.mood === mood)!;
const mid = (mood: string): number => (area(mood).x0 + area(mood).x1) / 2;
const base = { areas: AREAS, night: 0, rain: 0, wind: 0 };

describe('ambience beds', () => {
  it("plays the camera's area bed for the phase", () => {
    expect(bedTargets({ ...base, x: mid('plaza') })).toEqual({ amb_plaza_day: 1 });
    expect(bedTargets({ ...base, x: mid('pond'), night: 1 })).toEqual({ amb_pond_night: 1 });
    expect(bedTargets({ ...base, x: mid('depths'), night: 1 })).toEqual({ amb_ant_hill: 1 });
  });

  it('crossfades into the neighbor near a border, at equal power, half and half on it', () => {
    const border = area('plaza').x0;
    const at = (x: number) => bedTargets({ ...base, x });
    const edge = at(border + 0.001);
    expect(edge.amb_plaza_day).toBeCloseTo(Math.SQRT1_2, 2);
    expect(edge.amb_pond_day).toBeCloseTo(Math.SQRT1_2, 2);
    for (const d of [0.5, 1, 2, 3, 3.9]) {
      const t = at(border + d);
      expect(t.amb_plaza_day! ** 2 + (t.amb_pond_day ?? 0) ** 2).toBeCloseTo(1, 5);
      expect(t.amb_plaza_day!).toBeGreaterThan(t.amb_pond_day!);
    }
    expect(at(border + 4.1)).toEqual({ amb_plaza_day: 1 });
    // Hidden areas are sealed: no neighbor bleeds in.
    expect(Object.keys(bedTargets({ ...base, x: area('depths').x0 + 0.5 }))).toEqual(['amb_ant_hill']);
  });

  it('crossfades day and night across dusk and dawn, 50/50 at the middle', () => {
    expect(nightMix(12)).toBe(0);
    expect(nightMix(19)).toBeCloseTo(0.5);
    expect(nightMix(6)).toBeCloseTo(0.5);
    expect(nightMix(23)).toBe(1);
    const dusk = bedTargets({ ...base, x: mid('plaza'), night: nightMix(19) });
    expect(dusk.amb_plaza_day).toBeCloseTo(dusk.amb_plaza_night!, 5);
    expect(equalPower(0.5)[0]).toBeCloseTo(Math.SQRT1_2);
  });

  it('brings in rain outdoors, the board patter under the porch, and none in the hidden areas', () => {
    const plaza = bedTargets({ ...base, x: mid('plaza'), rain: 1 });
    expect(plaza.rain_bed).toBeCloseTo(1);
    expect(plaza.amb_plaza_day).toBeCloseTo(0.4);
    const porch = bedTargets({ ...base, x: mid('porch'), rain: 1 });
    expect(porch.board_patter).toBeCloseTo(1);
    expect(porch.rain_bed).toBeUndefined();
    expect(porch.amb_porch_day).toBeCloseTo(0.8);
    const deep = bedTargets({ ...base, x: mid('hollow'), rain: 1, wind: 1 });
    expect(deep).toEqual({ amb_gnome_hollow: 1 });
  });

  it('follows the wind: louder up the tree, faint under the porch', () => {
    expect(bedTargets({ ...base, x: mid('plaza'), wind: 1 }).wind_bed).toBeCloseTo(0.8);
    expect(bedTargets({ ...base, x: mid('arcade'), wind: 1 }).wind_bed).toBeCloseTo(0.96);
    expect(bedTargets({ ...base, x: mid('porch'), wind: 1 }).wind_bed).toBeCloseTo(0.24);
  });

  it('plays a locked area quietly from its preview', () => {
    const locked = AREAS.map((a) => (a.mood === 'porch' ? { ...a, open: false } : a));
    expect(bedTargets({ ...base, areas: locked, x: mid('porch') }).amb_porch_day).toBeCloseTo(0.35);
  });

  it('ducks under voices and stingers, and dips and muffles under the pause board', () => {
    expect(ambienceBus({ voice: false, stinger: false, paused: false })).toEqual({
      gainDb: 0,
      lowpass: null,
    });
    expect(ambienceBus({ voice: true, stinger: false, paused: false }).gainDb).toBe(-4);
    expect(ambienceBus({ voice: true, stinger: true, paused: false }).gainDb).toBe(-8);
    expect(ambienceBus({ voice: false, stinger: false, paused: true })).toEqual({
      gainDb: -10,
      lowpass: 900,
    });
  });

  it('weights one area away from borders', () => {
    expect(areaWeights(AREAS, mid('plaza'))).toHaveLength(1);
  });
});

describe('the ambience player', () => {
  const frame = { areas: AREAS, x: mid('plaza'), hour: 12, rain: 0, wind: 0, paused: false };

  it('loads and loops the beds it needs, and reports targets even without samples', async () => {
    const { engine, sink } = await engineWith(['amb_plaza_day', 'amb_plaza_night', 'rain_bed']);
    const player = new AmbiencePlayer(engine);
    player.update(0.016, frame);
    await flush();
    player.update(0.016, { ...frame, rain: 0.5 });
    expect(sink.beds.get('amb_plaza_day')!.gain).toBeCloseTo(0.7);
    expect(sink.beds.get('rain_bed')!.gain).toBeCloseTo(0.5);
    expect(player.covers('rain')).toBe(true);
    expect(player.covers('wind')).toBe(false);
    // No wind bed in this manifest: the rules still say what it would be.
    player.update(0.016, { ...frame, wind: 1 });
    expect(player.report.targets.wind_bed).toBeCloseTo(0.8);
    expect(player.report.playing.wind_bed).toBeUndefined();
  });

  it('crossfades a sundial skip over three seconds, and ducks under the pause board', async () => {
    const { engine, sink } = await engineWith(['amb_plaza_day', 'amb_plaza_night']);
    const player = new AmbiencePlayer(engine);
    player.update(0.016, frame);
    await flush();
    player.update(1, { ...frame, hour: 22 });
    expect(player.report.night).toBeCloseTo(1 / 3);
    player.update(1, { ...frame, hour: 22 });
    player.update(1.1, { ...frame, hour: 22 });
    expect(player.report.night).toBe(1);
    expect(sink.beds.get('amb_plaza_night')!.gain).toBeCloseTo(1);
    player.update(0.016, { ...frame, hour: 22, paused: true });
    expect(sink.bus).toEqual({ gainDb: -10, lowpass: 900 });
    player.duck('voice', 1);
    player.update(0.016, { ...frame, hour: 22 });
    expect(sink.bus.gainDb).toBe(-4);
  });

  it('keeps at most four beds decoded', async () => {
    const { engine, sink } = await engineWith();
    const player = new AmbiencePlayer(engine);
    for (const mood of ['garden', 'pond', 'plaza', 'porch', 'compost', 'arcade']) {
      player.update(0.016, { ...frame, x: mid(mood) });
      await flush();
      player.update(0.016, { ...frame, x: mid(mood) });
    }
    const decoded = Object.keys(fixtureManifest().sounds).filter(
      (f) => sink.ready(`${f}/0.ogg`) && f.startsWith('amb_'),
    );
    expect(decoded.length).toBeLessThanOrEqual(4);
    expect(sink.ready('amb_treehouse_day/0.ogg')).toBe(true);
  });
});

describe('her recorded voice (optional)', () => {
  const dot = CONTENT.bugs.get('bug_ladybug_dot');

  it('turns each syllable into a clip pitched into the bug range, and keeps the synth underneath', () => {
    const tones = voiceLine(dot.voice, 'happy', new Rng('x'));
    const clips = [{ file: 'voices/happy/0.ogg', dur: 0.3, pitchHz: 300 }];
    const line = recordedLine(tones, clips, dot.voice.wave, new Rng('y'));
    const syllables = tones.filter((t) => t.formants);
    expect(line.plays).toHaveLength(syllables.length);
    for (const [i, p] of line.plays.entries()) {
      expect(p.bus).toBe('voice');
      expect(p.rate).toBeCloseTo(Math.max(0.5, Math.min(2, syllables[i]!.freq / 300)));
      expect(p.formants).toEqual(syllables[i]!.formants);
    }
    expect(line.tones).toHaveLength(tones.length);
  });

  it('stays synthesized by default, and uses her clips when switched on', async () => {
    const backend = new NullAudioBackend();
    const sink = new NullSampleSink(true);
    const engine = new SampleEngine(sink);
    await engine.setLibrary(new SfxLibrary(fixtureManifest([], 3, true)));
    const voices = new BugVoices(backend, CONTENT.bugs, () => 0);
    voices.samples = engine;
    voices.say(1, 'bug_ladybug_dot', 'happy');
    expect(sink.played).toHaveLength(0);
    voices.recorded = true;
    voices.say(2, 'bug_ladybug_dot', 'happy');
    expect(sink.played.length).toBeGreaterThan(0);
    expect(voices.log.at(-1)).toEqual({ defId: 'bug_ladybug_dot', emotion: 'happy', recorded: true });
    // An emotion she didn't record stays synthesized.
    const m = fixtureManifest([], 3, true);
    delete m.voices.grumpy;
    await engine.setLibrary(new SfxLibrary(m));
    const n = sink.played.length;
    voices.say(3, 'bug_ladybug_dot', 'grumpy');
    expect(sink.played.length).toBe(n);
  });
});
