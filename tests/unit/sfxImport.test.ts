import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Audio } from '../../scripts/sfx/analysis';
import {
  SR,
  bakeBed,
  foldMono,
  frames,
  integrated,
  maxMomentary,
  medianPitch,
  normalize,
  pickTakes,
  seamJump,
  slice,
  splitAtSilence,
  steadiest,
  syllables,
  trimSilence,
  truePeak,
} from '../../scripts/sfx/analysis';
import { importSfx } from '../../scripts/sfx/pipeline';
import { blockFor, blockProblems, globMatch, licenseProblem, parseSource } from '../../scripts/sfx/source';
import { CATEGORY_LUFS, sfxManifestErrors } from '../../src/shared/sfx';

// The sound importer (docs/08-sound-brief.md, part 6.3) on small synthetic
// signals: CI has no real samples and no ffmpeg.

const tone = (sec: number, hz: number, amp = 0.5): Float32Array =>
  Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const silence = (sec: number): Float32Array => new Float32Array(Math.round(sec * SR));
const join1 = (...parts: Float32Array[]): Audio => {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const data = new Float32Array(n);
  let at = 0;
  for (const p of parts) {
    data.set(p, at);
    at += p.length;
  }
  return { data, channels: 1 };
};
const stereo = (l: Float32Array, r: Float32Array): Audio => {
  const data = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) {
    data[2 * i] = l[i]!;
    data[2 * i + 1] = r[i]!;
  }
  return { data, channels: 2 };
};
/** Seeded noise. */
function noise(sec: number, amp: number, seed = 1): Float32Array {
  let s = seed;
  return Float32Array.from({ length: Math.round(sec * SR) }, () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return amp * ((s / 0x7fffffff) * 2 - 1);
  });
}

describe('source.txt', () => {
  const text = [
    'file: small-splash-01.wav',
    'url: https://freesound.org/people/someone/sounds/123456/',
    'license: CC0',
    'author: someone',
    'title: Small splash in a bucket',
    'downloaded: 2026-10-04',
    '',
    'file: impactWood_*',
    'url: https://kenney.nl/assets/impact-sounds',
    'license: cc0',
    'author: Kenney',
    'split: no',
    'trim: 0:03.2-0:04.1',
    'a stray note the importer ignores',
  ].join('\n');

  it('reads blocks, globs, trims, and split', () => {
    const { blocks, errors } = parseSource(text);
    expect(errors).toEqual([]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.license).toBe('cc0');
    expect(blocks[1]!.split).toBe(false);
    expect(blocks[1]!.trim![0]).toBeCloseTo(3.2);
    expect(blocks[1]!.trim![1]).toBeCloseTo(4.1);
    expect(globMatch('impactWood_*', 'impactWood_light_000.ogg')).toBe(true);
    expect(blockFor(blocks, 'impactWood_heavy_001.ogg')).toBe(blocks[1]);
    expect(blockFor(blocks, 'other.wav')).toBeNull();
  });

  it('lets one block without a file line cover the folder', () => {
    const { blocks } = parseSource('url: https://kenney.nl\nlicense: cc0\nauthor: Kenney');
    expect(blockFor(blocks, 'anything.wav')).toBe(blocks[0]);
  });

  it('flags missing fields and a bad trim', () => {
    expect(parseSource('file: a.wav\ntrim: 0:04-0:03').errors).toHaveLength(1);
    const { blocks } = parseSource('file: a.wav\nlicense: cc-by-4.0');
    expect(blockProblems(blocks[0]!, 'a.wav', true)).toEqual([
      'a.wav: no url',
      'a.wav: no author',
      'a.wav: cc-by-4.0 needs a title for the credits',
    ]);
    expect(blockProblems(null, 'b.wav', true)).toEqual(['b.wav: no block in source.txt']);
  });

  it('allows only the listed licenses, and only repo-safe ones while the repo is public', () => {
    for (const ok of ['cc0', 'cc-by-4.0', 'cc-by-3.0', 'oga-by', 'suno', 'own'])
      expect(licenseProblem(ok, true), ok).toBeNull();
    for (const bundle of ['sonniss-gdc', 'pixabay', 'zapsplat']) {
      expect(licenseProblem(bundle, true), bundle).toMatch(/public repo/);
      expect(licenseProblem(bundle, false), bundle).toBeNull();
    }
    expect(licenseProblem('cc-by-nc-4.0', false)).toMatch(/NonCommercial/);
    expect(licenseProblem('bbc-remarc', false)).toMatch(/RemArc/);
    expect(licenseProblem('cc-by-sa-4.0', false)).toMatch(/not on the list/);
    expect(licenseProblem(undefined, false)).toBe('no license');
  });
});

describe('importer analysis', () => {
  it('splits three tone bursts into three takes and trims their silence', () => {
    const a = join1(
      silence(0.2),
      tone(0.2, 440),
      silence(0.5),
      tone(0.15, 660),
      silence(0.4),
      tone(0.3, 330),
      silence(0.6),
    );
    const cuts = splitAtSilence(a);
    expect(cuts).toHaveLength(3);
    const lengths = cuts.map(([s, e]) => frames(trimSilence(slice(a, s, e))) / SR);
    expect(lengths[0]).toBeGreaterThan(0.19);
    expect(lengths[0]).toBeLessThan(0.26);
    expect(lengths[2]).toBeGreaterThan(0.29);
    expect(lengths[2]).toBeLessThan(0.36);
  });

  it('trims a take to start just before its sound and end just after', () => {
    const t = trimSilence(join1(silence(0.3), tone(0.2, 500), silence(0.3)));
    expect(frames(t) / SR).toBeGreaterThan(0.2);
    expect(frames(t) / SR).toBeLessThan(0.25);
  });

  it('drops pieces under 40 ms', () => {
    expect(splitAtSilence(join1(silence(0.4), tone(0.02, 800), silence(0.4)))).toEqual([]);
  });

  it('folds to mono, and uses the louder channel when the channels cancel', () => {
    const l = tone(0.5, 300);
    expect(foldMono(stereo(l, l)).channel).toBe('sum');
    const inverted = l.map((v) => -v * 0.9);
    const folded = foldMono(stereo(l, inverted));
    expect(folded.channel).toBe(0);
    expect(folded.audio.channels).toBe(1);
  });

  it('measures a 1 kHz tone as BS.1770 does, and normalizes within 0.5 LU of the target', () => {
    // A full-scale 1 kHz sine in one channel reads -3.01 LUFS.
    const a = join1(tone(3, 1000, 1));
    expect(integrated(a)).toBeCloseTo(-3.01, 1);
    const target = CATEGORY_LUFS.water;
    const n = normalize(join1(tone(0.6, 700, 0.05)), target, maxMomentary);
    expect(Math.abs(maxMomentary(n.audio) - target)).toBeLessThan(0.5);
    expect(n.short).toBe(false);
  });

  it('stops at the true-peak ceiling and says so', () => {
    // A spiky click can't reach -16 LUFS momentary under -2 dBTP.
    const click = join1(silence(0.1), Float32Array.from([0.9, -0.9, 0.5]), silence(0.3));
    const n = normalize(click, -16, maxMomentary);
    expect(n.short).toBe(true);
    expect(truePeak(n.audio)).toBeLessThanOrEqual(-1.99);
  });

  it('bakes a bed loop whose seam stays under 1.5 LU', () => {
    // 40 s of noise that slowly swells: the steadiest stretch and a 2 s crossfade make it seamless.
    const n = noise(40, 0.2);
    for (let i = 0; i < n.length; i++) n[i]! *= 1 + 0.3 * Math.sin((2 * Math.PI * i) / (SR * 40));
    const a = stereo(n, noise(40, 0.2, 7));
    const [s, e] = steadiest(a);
    expect((e - s) / SR).toBeGreaterThanOrEqual(30);
    const baked = bakeBed(a, s, e);
    const start = Math.round(baked.loopStart * SR);
    const body = slice(baked.audio, start, start + (e - s));
    expect(seamJump(body)).toBeLessThan(1.5);
  });

  it('keeps at most 12 takes, nearest the median length', () => {
    const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 100, 0.01];
    const keep = pickTakes(lengths);
    expect(keep).toHaveLength(12);
    expect(keep).not.toContain(13);
    expect(keep).not.toContain(14);
  });

  it('cuts babble into syllables and finds a clip pitch', () => {
    const parts: Float32Array[] = [];
    for (let i = 0; i < 5; i++) parts.push(tone(0.15, 220 + 20 * i), silence(0.06));
    const cuts = syllables(join1(...parts));
    expect(cuts.length).toBe(5);
    expect(medianPitch(join1(tone(0.3, 250)))).toBeCloseTo(250, -1);
  });
});

/** A 32-bit float WAV, for the decode stub. */
function wav(a: Audio): Buffer {
  const data = Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20);
  h.writeUInt16LE(a.channels, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4 * a.channels, 28);
  h.writeUInt16LE(4 * a.channels, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function unwav(buf: Buffer): Audio {
  const channels = buf.readUInt16LE(22);
  const bytes = buf.subarray(44);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return { data: new Float32Array(copy.buffer), channels };
}

describe('pnpm sfx:import', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const deps = {
    decode: async (file: string) => unwav(readFileSync(file)),
    encode: async (audio: Audio, _kbps: number, file: string) => {
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, wav(audio));
    },
  };

  function setup(): { src: string; out: string } {
    dir = mkdtempSync(join(tmpdir(), 'bb-sfx-'));
    const src = join(dir, 'assets/sfx');
    const out = join(dir, 'public/sfx');
    const put = (folder: string, files: Record<string, Audio>, source: string): void => {
      mkdirSync(join(src, folder), { recursive: true });
      for (const [name, a] of Object.entries(files)) writeFileSync(join(src, folder, name), wav(a));
      writeFileSync(join(src, folder, 'source.txt'), source);
    };
    put(
      'splash',
      { 'three.wav': join1(tone(0.3, 440), silence(0.5), tone(0.25, 520), silence(0.5), tone(0.35, 600)) },
      'file: three.wav\nurl: https://freesound.org/s/1/\nlicense: cc-by-4.0\nauthor: Someone\ntitle: Three splashes',
    );
    put(
      'impact_wood',
      { 'tok.wav': join1(tone(0.2, 900)) },
      'url: https://kenney.nl\nlicense: cc0\nauthor: Kenney',
    );
    put(
      'pop',
      { 'p.wav': join1(tone(0.2, 900)) },
      'file: p.wav\nurl: https://x\nlicense: pixabay\nauthor: X',
    );
    put('splosh', { 'x.wav': join1(tone(0.2, 900)) }, 'url: https://x\nlicense: cc0\nauthor: X');
    put(
      'amb_pond_day',
      { 'pond.wav': stereo(noise(36, 0.1), noise(36, 0.1, 3)) },
      'url: https://x\nlicense: own\nauthor: Nathan',
    );
    return { src, out };
  }

  it('builds takes, a manifest, credits, and a report; refuses bad folders', async () => {
    const { src, out } = setup();
    const res = await importSfx(
      { src, out, folders: [], force: false, voices: null, publicRepo: true },
      deps,
    );
    expect(sfxManifestErrors(res.manifest)).toEqual([]);
    expect(res.manifest.sounds.splash!.takes).toHaveLength(3);
    expect(res.manifest.sounds.impact_wood!.takes).toHaveLength(1);
    const bed = res.manifest.sounds.amb_pond_day!;
    expect(bed.kind).toBe('bed');
    expect(bed.takes[0]!.dur).toBeGreaterThanOrEqual(30);
    expect(bed.takes[0]!.loopStart).toBeGreaterThan(0);
    // A bundle license in a public repo, and a misspelled folder, fail and stay synthesized.
    expect(res.failed.pop![0]).toMatch(/public repo/);
    expect(res.failed.splosh![0]).toMatch(/Did you mean "splash"/);
    expect(res.manifest.sounds.pop).toBeUndefined();
    // The CC BY sound is credited by name; Kenney is thanked.
    expect(res.credits.credits).toEqual([
      {
        title: 'Three splashes',
        author: 'Someone',
        url: 'https://freesound.org/s/1/',
        license: 'cc-by-4.0',
        folder: 'splash',
      },
    ]);
    expect(res.credits.thanks).toEqual(['Kenney']);
    expect(readFileSync(join(out, 'THIRD-PARTY-SOUNDS.txt'), 'utf8')).toContain(
      '"Three splashes" by Someone (CC BY 4.0)',
    );
    expect(res.report.join('\n')).toMatch(/Still synthesized/);
    // Each take is a mono one-shot at its category's loudness.
    const take = unwav(readFileSync(join(out, 'splash/0.ogg')));
    expect(take.channels).toBe(1);
    expect(Math.abs(maxMomentary(take) - CATEGORY_LUFS.water)).toBeLessThan(0.5);
    // Run again: nothing changed, nothing rebuilt.
    const again = await importSfx(
      { src, out, folders: ['splash'], force: false, voices: null, publicRepo: true },
      deps,
    );
    expect(again.report[0]).toBe('splash: unchanged');
    // Delete a folder and it goes back to the synth.
    rmSync(join(src, 'impact_wood'), { recursive: true });
    const gone = await importSfx(
      { src, out, folders: [], force: false, voices: null, publicRepo: true },
      deps,
    );
    expect(gone.manifest.sounds.impact_wood).toBeUndefined();
    expect(gone.manifest.sounds.splash).toBeDefined();
  }, 60_000);

  it('keeps built takes when only source.txt is present (a fresh clone)', async () => {
    const { src, out } = setup();
    await importSfx({ src, out, folders: ['splash'], force: false, voices: null, publicRepo: true }, deps);
    rmSync(join(src, 'splash/three.wav'));
    const res = await importSfx(
      { src, out, folders: ['splash'], force: true, voices: null, publicRepo: true },
      deps,
    );
    expect(res.manifest.sounds.splash!.takes).toHaveLength(3);
    expect(res.credits.credits).toHaveLength(1);
  });

  it('builds her voice bank with each clip pitch', async () => {
    const { src, out } = setup();
    const her = join(dir, 'assets/voices/her');
    mkdirSync(her, { recursive: true });
    const bursts: Float32Array[] = [];
    for (let i = 0; i < 4; i++) bursts.push(tone(0.3, 300), silence(0.6));
    writeFileSync(join(her, 'happy.wav'), wav(join1(...bursts)));
    writeFileSync(join(her, 'source.txt'), 'url: her own\nlicense: own\nauthor: The artist');
    const res = await importSfx(
      { src, out, folders: ['splash'], force: false, voices: her, publicRepo: true },
      deps,
    );
    const clips = res.manifest.voices.happy!;
    expect(clips).toHaveLength(4);
    expect(clips[0]!.pitchHz).toBeGreaterThan(280);
    expect(clips[0]!.pitchHz).toBeLessThan(320);
    expect(sfxManifestErrors(res.manifest)).toEqual([]);
  });
});
