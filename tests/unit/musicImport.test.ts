import { describe, expect, it } from 'vitest';
import {
  SR,
  activity,
  bakeLoop,
  beatGrid,
  chromaSum,
  chromagram,
  conformTempo,
  decideKey,
  detectKey,
  findDownbeat,
  findLoop,
  isFullMixName,
  isSilent,
  loopFeatures,
  mapStem,
  mapStemName,
  normalizeStemName,
  padLoop,
  pickLead,
  pitchiness,
  seamError,
  toMono,
  vocalCheck,
} from '../../scripts/music/analysis';
import { sameNotes } from '../../src/shared/music';

// The music importer's pure analysis (docs/05-music-brief.md section 7), on
// small synthetic signals: CI has no raw Suno files.

/** Interleaved stereo from a mono generator. */
function stereo(seconds: number, f: (t: number) => number): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = f(i / SR);
    out[2 * i] = v;
    out[2 * i + 1] = v;
  }
  return out;
}

/** A seeded noise source, so tests never use Math.random. */
function noise(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

const MIDI = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** A drum loop: a kick (decaying low sine) on every beat, louder on beat 1, with hats between. */
function drums(bpm: number, seconds: number, accent = 1, offset = 0.25): (t: number) => number {
  const beat = 60 / bpm;
  const rnd = noise(7);
  return (t) => {
    const u = t - offset;
    if (u < 0) return 0;
    const i = Math.floor(u / beat);
    const p = u - i * beat;
    const gain = i % 4 === 0 ? accent : 0.6;
    const kick = Math.exp(-p * 30) * Math.sin(2 * Math.PI * 60 * p) * gain;
    const hp = p - beat / 2;
    const hat = hp >= 0 ? Math.exp(-hp * 120) * rnd() * 0.1 : 0;
    return (kick + hat) * 0.5 * (t < seconds ? 1 : 0);
  };
}

describe('stem names (brief 7.4)', () => {
  it('normalizes Suno names: IDs, numbers, titles, separators', () => {
    expect(normalizeStemName('Drums [a1b2c3d4].wav')).toBe('drums');
    expect(normalizeStemName('10 Drums.wav')).toBe('drums');
    expect(normalizeStemName('11 Backing_Vocals.wav')).toBe('backing vocals');
    expect(normalizeStemName('/x/y/Bass (3f9e).mp3')).toBe('bass');
    expect(normalizeStemName('Puddle Song - Bass Clarinet.flac', 'Puddle Song')).toBe('bass clarinet');
    expect(normalizeStemName('Keys__left-hand.wav')).toBe('keys left hand');
  });

  it('maps stems by the longest keyword, then the earlier row', () => {
    const layer = (n: string): string => mapStemName(normalizeStemName(n)).target;
    expect(layer('Bass Clarinet.wav')).toBe('lead');
    expect(layer('Bassoon.wav')).toBe('lead');
    expect(layer('9 Bass.wav')).toBe('bass');
    expect(layer('Tuba.wav')).toBe('bass');
    expect(layer('Drums [a1b2c3d4].wav')).toBe('drums');
    expect(layer('6 Percussion.wav')).toBe('drums');
    expect(layer('1 Woodwinds.wav')).toBe('lead');
    expect(layer('2 Brass.wav')).toBe('lead');
    expect(layer('7 Keyboard.wav')).toBe('harmony');
    expect(layer('8 Guitar.wav')).toBe('harmony');
    expect(layer('4 Synth.wav')).toBe('harmony');
    expect(layer('5 Strings.wav')).toBe('harmony');
    expect(layer('3 FX.wav')).toBe('harmony');
    expect(layer('12 Vocals.wav')).toBe('vocal');
    expect(layer('11 Backing_Vocals.wav')).toBe('vocal');
    expect(layer('Choir.wav')).toBe('vocal');
    // `key` starts `keyboard` but not `turkey`.
    expect(mapStemName('turkey').keyword).toBeNull();
    expect(mapStemName('mystery noises')).toEqual({ target: 'harmony', keyword: null });
  });

  it('treats mix names as the full mix only when nothing else matches', () => {
    expect(mapStemName('instrumental').target).toBe('full');
    expect(mapStemName('drums mix').target).toBe('drums');
    expect(isFullMixName('full.wav')).toBe(true);
    expect(isFullMixName('Song Master.wav')).toBe(true);
    expect(isFullMixName('Drums.wav')).toBe(false);
  });

  it('applies overrides by normalized name', () => {
    const o = { layers: { synth: 'lead', fx: 'drop' } as const };
    expect(mapStem('synth', o)).toEqual({ target: 'lead', keyword: 'override' });
    expect(mapStem('fx', o).target).toBe('drop');
    expect(mapStem('guitar', o).target).toBe('harmony');
  });
});

describe('silent stems and vocals (playtest F5)', () => {
  const mix = stereo(20, (t) => 0.3 * Math.sin(2 * Math.PI * 220 * t));
  const mixLoud = activity(mix, SR).loudDb;

  it('drops stems that are silent or nearly so', () => {
    const silent = stereo(20, () => 0);
    const hiss = stereo(20, (t) => 1e-5 * Math.sin(2 * Math.PI * 1000 * t));
    expect(isSilent(activity(silent, SR, mixLoud), mixLoud)).toBe(true);
    expect(isSilent(activity(hiss, SR, mixLoud), mixLoud)).toBe(true);
    // A click or two (Suno's empty stems peak around -25 dB) is still silent.
    const click = stereo(20, (t) => (Math.abs(t - 5) < 0.0005 ? 0.06 : 0));
    expect(isSilent(activity(click, SR, mixLoud), mixLoud)).toBe(true);
  });

  it('keeps quiet but real parts, and sparse ones', () => {
    const quiet = stereo(20, (t) => 0.02 * Math.sin(2 * Math.PI * 440 * t));
    expect(isSilent(activity(quiet, SR, mixLoud), mixLoud)).toBe(false);
    // A part that plays 1.2 s out of 20: a kazoo answer, an effect.
    const sparse = stereo(20, (t) => (t > 8 && t < 9.2 ? 0.2 * Math.sin(2 * Math.PI * 660 * t) : 0));
    expect(isSilent(activity(sparse, SR, mixLoud), mixLoud)).toBe(false);
  });

  it('hears vocals in the full mix only when the vocal stems explain part of it', () => {
    const inst = stereo(10, (t) => 0.3 * Math.sin(2 * Math.PI * 220 * t));
    const voice = stereo(10, (t) => 0.15 * Math.sin(2 * Math.PI * 523 * t) * (Math.sin(t * 3) > 0 ? 1 : 0));
    const sung = inst.map((v, i) => v + voice[i]!);
    expect(vocalCheck(sung, inst, voice).audible).toBe(true);
    // The owner's tracks: the vocal stems are near silence and the mix has none.
    const ghost = voice.map((v) => v * 0.0005);
    expect(vocalCheck(inst, inst, ghost).audible).toBe(false);
    expect(vocalCheck(inst, inst, null).audible).toBe(false);
  });
});

describe('tempo, beats, and downbeats (brief 7.5)', () => {
  it('finds a steady tempo and its grid', () => {
    const song = toMono(stereo(30, drums(98, 30)));
    const g = beatGrid(song, 96);
    expect(g.bpm).toBeCloseTo(98, 1);
    // The kicks start at 0.25 s; the grid lands on them within 10 ms.
    const offset = (((g.first - 0.25) % g.period) + g.period) % g.period;
    expect(Math.min(offset, g.period - offset)).toBeLessThan(0.01);
    expect(g.driftMs).toBeLessThan(15);
  });

  it('corrects octave errors toward the target, and conforms close tempos', () => {
    expect(conformTempo(98, 96)).toMatchObject({ bpm: 96, warning: null });
    expect(conformTempo(98, 96).stretch).toBeCloseTo(96 / 98, 5);
    expect(conformTempo(49, 96).stretch).toBeCloseTo(96 / 98, 5);
    expect(conformTempo(144.6, 72).stretch).toBeCloseTo(72 / 72.3, 5);
    expect(conformTempo(96.02, 96).stretch).toBeNull();
    const far = conformTempo(110, 96);
    expect(far.stretch).toBeNull();
    expect(far.bpm).toBe(110);
    expect(far.warning).toMatch(/won't be beat-locked/);
  });

  it('picks the accented beat as the downbeat', () => {
    // Bars start at 0.25 s; the first beat of each bar hits twice as hard.
    const song = toMono(stereo(30, drums(96, 30, 2)));
    const g = beatGrid(song, 96, 96);
    const down = findDownbeat(song, g);
    const bar = g.period * 4;
    const phase = (((down - 0.25) % bar) + bar) % bar;
    expect(Math.min(phase, bar - phase)).toBeLessThan(0.02);
  });
});

describe('key (brief 7.5)', () => {
  /** Chords as sine triads, one per bar at 96 BPM. */
  function chords(progression: number[][], seconds: number): Float32Array {
    const bar = 2.5;
    return stereo(seconds, (t) => {
      const c = progression[Math.floor(t / bar) % progression.length]!;
      let v = 0;
      for (const m of c) v += Math.sin(2 * Math.PI * MIDI(m) * t) / c.length;
      return 0.3 * v;
    });
  }

  it('detects C major from C, Am, F, G', () => {
    const song = chords(
      [
        [48, 60, 64, 67],
        [45, 57, 60, 64],
        [41, 57, 60, 65],
        [43, 55, 59, 62],
      ],
      20,
    );
    const k = detectKey(chromaSum(chromagram(toMono(song), 4096)));
    expect(sameNotes(k, { tonic: 'C', mode: 'major' })).toBe(true);
    expect(k.confidence).toBeGreaterThan(0.6);
  });

  it('detects E minor from Em, C, D, Bm', () => {
    const song = chords(
      [
        [40, 55, 59, 64],
        [36, 55, 60, 64],
        [38, 54, 57, 62],
        [35, 54, 59, 62],
      ],
      20,
    );
    const k = detectKey(chromaSum(chromagram(toMono(song), 4096)));
    expect(sameNotes(k, { tonic: 'E', mode: 'minor' })).toBe(true);
  });

  it('accepts the target or its relative, warns on a confident miss, falls back on a weak one', () => {
    const target = { tonic: 'C', mode: 'major' } as const;
    const det = (tonic: string, mode: 'major' | 'minor', confidence: number) => ({
      tonic,
      mode,
      confidence,
      profile: 'test',
      runnerUp: { tonic: 'D', mode: 'major' as const, confidence: 0.1 },
    });
    expect(decideKey(det('C', 'major', 0.9), target, null)).toMatchObject({
      source: 'detected',
      warning: null,
    });
    expect(decideKey(det('A', 'minor', 0.9), target, null)).toMatchObject({ key: target, source: 'target' });
    expect(decideKey(det('D', 'major', 0.4), target, null)).toMatchObject({ key: target, source: 'target' });
    const miss = decideKey(det('D', 'major', 0.8), target, null);
    expect(miss.key).toEqual({ tonic: 'D', mode: 'major' });
    expect(miss.warning).toMatch(/neighbors may clash/);
    expect(decideKey(det('D', 'major', 0.8), target, { tonic: 'G', mode: 'major' }).source).toBe('override');
  });
});

describe('stems that might hold the tune', () => {
  it('scores a pitched mallet above an unpitched shaker', () => {
    const rnd = noise(3);
    const shaker = toMono(stereo(8, () => rnd() * 0.2));
    const marimba = toMono(
      stereo(8, (t) => {
        const p = t % 0.3125;
        return (
          Math.exp(-p * 12) * Math.sin(2 * Math.PI * MIDI(72 + [0, 2, 4, 7][Math.floor(t / 0.3125) % 4]!) * t)
        );
      }),
    );
    expect(pitchiness(chromagram(marimba, 8192))).toBeGreaterThan(pitchiness(chromagram(shaker, 8192)) * 2);
  });

  it('promotes the busy, high harmony stem to lead when no stem is named for it', () => {
    expect(
      pickLead([
        { name: 'guitar', active: 0.83, register: 69.7 },
        { name: 'keyboard', active: 0.81, register: 72.2 },
        { name: 'synth', active: 0.09, register: 77.9 },
      ]),
    ).toBe('keyboard');
    expect(pickLead([{ name: 'keys', active: 0.9, register: 70 }])).toBeNull();
  });
});

describe('loops (brief 7.6, 7.8)', () => {
  it('finds a loop in the repeating body, not the intro, a whole number of 4-bar phrases long', () => {
    // An 8 s intro of noise, then a 4-bar phrase (10 s at 96 BPM) repeating.
    const rnd = noise(11);
    const phrase = [60, 64, 67, 65];
    const body = (t: number): number => {
      const u = t - 8;
      const bar = Math.floor(u / 2.5) % 4;
      const beat = u % 0.625;
      return (
        0.25 * Math.sin(2 * Math.PI * MIDI(phrase[bar]!) * t) +
        0.3 * Math.exp(-beat * 25) * Math.sin(2 * Math.PI * 60 * beat)
      );
    };
    const song = stereo(140, (t) => (t < 8 ? rnd() * 0.05 : body(t)));
    const loop = findLoop(loopFeatures(toMono(song)), { downbeat: 8, period: 0.625, beatsPerBar: 4 }, 140);
    expect(loop.start).toBeGreaterThanOrEqual(8 + 4 * 2.5);
    expect(loop.bars % 4).toBe(0);
    expect(loop.end - loop.start).toBeGreaterThanOrEqual(48);
    expect(loop.end).toBeLessThanOrEqual(130);
    expect(loop.score).toBeGreaterThan(0.9);
    // Steered toward 64 s: 24 bars (60 s) beats 28 (70 s) and the rest.
    expect(loop.bars).toBe(24);
  });

  it('bakes a looped sine with no seam', () => {
    // 100 Hz at 48 kHz: 480 samples a cycle; a 2 s loop holds 200 whole cycles.
    const n = 4 * SR;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 100 * i) / SR);
    const s = 12345;
    const e = s + 2 * SR;
    const linear = bakeLoop(x, 1, s, e, 0.625 * SR, 'linear');
    expect(linear.length).toBe(e - s);
    // Head and tail are the same signal, so a linear crossfade changes nothing.
    let worst = 0;
    for (let i = 0; i < linear.length; i++) worst = Math.max(worst, Math.abs(linear[i]! - x[s + i]!));
    expect(worst).toBeLessThan(1e-5);
    // The wrap from the last sample to the first is no bigger a step than any other.
    expect(seamError(linear, 1)).toBeLessThan(1.6);
    const power = bakeLoop(x, 1, s, e, 0.625 * SR, 'equal_power');
    expect(seamError(power, 1)).toBeLessThan(1.6);
  });

  it('pads a baked loop with itself on both sides', () => {
    const body = new Float32Array([1, 2, 3, 4, 5, 6]); // three stereo frames
    expect(Array.from(padLoop(body, 2, 1))).toEqual([5, 6, 1, 2, 3, 4, 5, 6, 1, 2]);
  });

  it('seams a stereo crossfade on the same sample in both channels', () => {
    const x = new Float32Array(2000);
    for (let i = 0; i < 1000; i++) {
      x[2 * i] = i;
      x[2 * i + 1] = -i;
    }
    const out = bakeLoop(x, 2, 100, 600, 50, 'linear');
    expect(out.length).toBe(1000);
    for (let i = 0; i < 500; i++) expect(out[2 * i + 1]).toBeCloseTo(-out[2 * i]!, 4);
  });
});
