// The music importer's analysis, pure: stem names and the keyword table,
// silence and vocal checks, tempo, beats, downbeats, key, loop search, and
// loop baking. No ffmpeg and no files, so Vitest runs it on synthetic
// signals. See docs/05-music-brief.md section 7. Audio here is interleaved
// stereo Float32Array at 48 kHz unless a function says mono.

import type { MusicKey, MusicLayer } from '../../src/shared/music.ts';
import { PITCH_NAMES, sameNotes } from '../../src/shared/music.ts';

export const SR = 48000;

// --- Stem names and the keyword table (brief 7.4) -------------------------------

/**
 * A stem's name, cleaned for matching: no extension, no `[id]` or `(id)`,
 * no leading track number, no song title prefix, lowercase, and `_`, `-`,
 * and runs of spaces turned into single spaces.
 */
export function normalizeStemName(file: string, title?: string): string {
  let s = file.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '');
  // IDs Suno adds: `Drums [a1b2c3d4]`, `Bass (3f9e)`. Only bracketed runs of letters and digits with a digit in them.
  s = s.replace(/\s*[[(][a-z0-9-]*\d[a-z0-9-]*[\])]\s*/gi, ' ');
  s = s
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (title) {
    const t = title
      .toLowerCase()
      .replace(/[_\-.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Suno Studio numbers the full mix too: `0 puddle_pond_night`.
    const u = s.replace(/^\d+\s+/, '');
    if (t && u === t) return '';
    if (t && s.startsWith(t + ' ')) s = s.slice(t.length + 1).trim();
    else if (t && u.startsWith(t + ' ')) s = u.slice(t.length + 1).trim();
  }
  // Leading track numbers: `10 drums`, `01 bass`.
  s = s.replace(/^\d+\s+/, '');
  return s;
}

/** Where a stem goes: a layer, dropped as a vocal, or not a stem at all (the full mix). */
export type StemTarget = MusicLayer | 'vocal' | 'full';

interface KeywordRow {
  target: StemTarget;
  words: readonly string[];
}

/** The brief's table, in order. The first row only counts when nothing else matches. */
export const KEYWORD_TABLE: readonly KeywordRow[] = [
  { target: 'full', words: ['full', 'mix', 'master', 'original', 'instrumental'] },
  { target: 'vocal', words: ['backing vocal', 'vocal', 'voice', 'choir', 'vox'] },
  {
    target: 'drums',
    words: ['drum', 'percussion', 'perc', 'kick', 'snare', 'hat', 'hihat', 'cymbal', 'beat', 'tom'],
  },
  { target: 'bass', words: ['bass', 'sub', '808', 'tuba'] },
  {
    target: 'lead',
    words: [
      'melody',
      'lead',
      'woodwind',
      'brass',
      'bassoon',
      'bass clarinet',
      'trumpet',
      'kazoo',
      'whistle',
      'flute',
      'clarinet',
      'musical saw',
      'theremin',
    ],
  },
  {
    target: 'harmony',
    words: [
      'key',
      'keyboard',
      'piano',
      'guitar',
      'string',
      'synth',
      'pad',
      'organ',
      'chord',
      'fx',
      'effect',
      'ambience',
      'other',
      'banjo',
      'ukulele',
      'harp',
    ],
  },
];

export interface StemMapping {
  target: StemTarget;
  /** The keyword that decided it, or null when nothing matched (harmony, with a warning). */
  keyword: string | null;
}

/** Does `word` start a word in `name` (so `key` matches `keyboard` but not `turkey`)? */
function startsWord(name: string, word: string): boolean {
  let i = name.indexOf(word);
  while (i >= 0) {
    if (i === 0 || name[i - 1] === ' ') return true;
    i = name.indexOf(word, i + 1);
  }
  return false;
}

/** Map a normalized stem name by the keyword table: the longest match wins, then the earlier row. */
export function mapStemName(name: string): StemMapping {
  let best: { target: StemTarget; keyword: string; row: number } | null = null;
  for (let r = 1; r < KEYWORD_TABLE.length; r++) {
    const row = KEYWORD_TABLE[r]!;
    for (const w of row.words) {
      if (!startsWord(name, w)) continue;
      if (!best || w.length > best.keyword.length || (w.length === best.keyword.length && r < best.row))
        best = { target: row.target, keyword: w, row: r };
    }
  }
  if (best) return { target: best.target, keyword: best.keyword };
  for (const w of KEYWORD_TABLE[0]!.words) if (startsWord(name, w)) return { target: 'full', keyword: w };
  return { target: 'harmony', keyword: null };
}

export interface TrackOverride {
  /** Normalized stem name to a layer or `drop`. */
  layers?: Record<string, MusicLayer | 'drop'>;
  key?: string;
  bpm?: number;
  downbeat?: number;
  loop?: [number, number];
}

/** The keyword mapping with a track's override applied. */
export function mapStem(
  name: string,
  override?: TrackOverride,
): StemMapping | { target: 'drop'; keyword: 'override' } {
  const o = override?.layers?.[name];
  if (o === 'drop') return { target: 'drop', keyword: 'override' };
  if (o) return { target: o, keyword: 'override' };
  return mapStemName(name);
}

/** Is this file the full mix rather than a stem (brief 7.3 step 2)? */
export function isFullMixName(file: string, title?: string): boolean {
  const n = normalizeStemName(file, title);
  if (n === '' || n === 'full') return true;
  return mapStemName(n).target === 'full';
}

// --- Levels -----------------------------------------------------------------------

export const dB = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -200);
export const fromDb = (d: number): number => 10 ** (d / 20);

/** Interleaved stereo to mono (the mean of the channels). */
export function toMono(stereo: Float32Array): Float32Array {
  const n = stereo.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (stereo[2 * i]! + stereo[2 * i + 1]!) * 0.5;
  return out;
}

export function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return to > from ? Math.sqrt(s / (to - from)) : 0;
}

export function peak(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

/** RMS of consecutive blocks of a mono signal, in dBFS. */
export function blockDb(mono: Float32Array, sr: number, seconds: number): Float64Array {
  const size = Math.max(1, Math.round(sr * seconds));
  const n = Math.floor(mono.length / size);
  const out = new Float64Array(n);
  for (let b = 0; b < n; b++) out[b] = dB(rms(mono, b * size, (b + 1) * size));
  return out;
}

function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length === 0) return -200;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))]!;
}

export interface Activity {
  /** RMS over the whole stem, dBFS. */
  rmsDb: number;
  /**
   * The loud end of the stem: the 99th percentile of 400 ms blocks, dBFS.
   * High enough that a part that plays only now and then still counts.
   */
  loudDb: number;
  /** Sample peak, dBFS. */
  peakDb: number;
  /** Share of 400 ms blocks within 30 dB of the mix's loud end. */
  active: number;
}

/** How much is in a stem, measured against the full mix's loud end (`mixLoudDb`). */
export function activity(stereo: Float32Array, sr: number, mixLoudDb?: number): Activity {
  const mono = toMono(stereo);
  const blocks = blockDb(mono, sr, 0.4);
  const loudDb = percentile(blocks, 99);
  const ref = mixLoudDb ?? loudDb;
  let active = 0;
  for (const b of blocks) if (b > ref - 30) active++;
  return {
    rmsDb: dB(rms(mono)),
    loudDb,
    peakDb: dB(peak(stereo)),
    active: blocks.length ? active / blocks.length : 0,
  };
}

/**
 * Silence thresholds (playtest F5: Suno makes stems for instruments that
 * aren't in the song). A stem is silent when its loud end sits more than
 * 40 dB under the mix's, or it is under -60 dBFS outright, or less than
 * 1 percent of it is within 30 dB of the mix.
 */
export const SILENCE = { belowMixDb: 40, floorDb: -60, minActive: 0.01 } as const;

export function isSilent(a: Activity, mixLoudDb: number): boolean {
  return (
    a.loudDb < mixLoudDb - SILENCE.belowMixDb || a.loudDb < SILENCE.floorDb || a.active < SILENCE.minActive
  );
}

/** Add `b` times `gain` into `a` (same length or shorter). */
export function mixInto(a: Float32Array, b: Float32Array, gain = 1): void {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) a[i]! += b[i]! * gain;
}

export interface VocalCheck {
  /** RMS of mix minus the instrumental stems, relative to the mix, dB. */
  residualDb: number;
  /** The same with the vocal stems also taken out. */
  residualWithVocalsDb: number;
  /** The vocal stems' loud end relative to the mix's loud end, dB. */
  vocalsDb: number;
  /** Does the full mix carry singing you would hear? */
  audible: boolean;
}

/**
 * Does the full mix have audible vocals? Compare it with the sum of the
 * instrumental stems, with and without the vocal stems added. If adding
 * the vocals brings the sum noticeably closer to the mix, and they are
 * within 30 dB of it, the mix sings.
 */
export function vocalCheck(
  mix: Float32Array,
  instrumental: Float32Array,
  vocals: Float32Array | null,
): VocalCheck {
  const n = mix.length;
  let m = 0;
  let r1 = 0;
  let r2 = 0;
  for (let i = 0; i < n; i++) {
    const x = mix[i]!;
    const d = x - (instrumental[i] ?? 0);
    const v = vocals ? (vocals[i] ?? 0) : 0;
    m += x * x;
    r1 += d * d;
    r2 += (d - v) * (d - v);
  }
  const residualDb = 10 * Math.log10((r1 + 1e-20) / (m + 1e-20));
  const residualWithVocalsDb = 10 * Math.log10((r2 + 1e-20) / (m + 1e-20));
  const mixLoud = percentile(blockDb(toMono(mix), SR, 0.4), 99);
  const vocalsDb = vocals ? percentile(blockDb(toMono(vocals), SR, 0.4), 99) - mixLoud : -200;
  const audible = vocalsDb > -30 && residualDb - residualWithVocalsDb > 1;
  return { residualDb, residualWithVocalsDb, vocalsDb, audible };
}

// --- Spectra ----------------------------------------------------------------------

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();

function plan(n: number): { cos: Float64Array; sin: Float64Array; rev: Uint32Array } {
  let p = twiddles.get(n);
  if (p) return p;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  p = { cos, sin, rev };
  twiddles.set(n, p);
  return p;
}

/** In-place radix-2 FFT. `re` and `im` have a power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i]!;
    if (j > i) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < half; k++) {
        const c = cos[k * step]!;
        const s = sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const tr = re[b]! * c - im[b]! * s;
        const ti = re[b]! * s + im[b]! * c;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
      }
  }
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/**
 * Magnitude spectra of a mono signal, frame by frame. Frame `t` covers
 * samples `[t * hop, t * hop + size)`; its time is the middle of that.
 * Only bins below `maxHz` are kept.
 */
export function stft(mono: Float32Array, size: number, hop: number, maxHz = SR / 2): Float32Array[] {
  const w = hann(size);
  const bins = Math.min(size / 2, Math.ceil((maxHz / SR) * size) + 1);
  const frames: Float32Array[] = [];
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start + size <= mono.length; start += hop) {
    for (let i = 0; i < size; i++) {
      re[i] = mono[start + i]! * w[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(bins);
    for (let k = 0; k < bins; k++) mag[k] = Math.hypot(re[k]!, im[k]!);
    frames.push(mag);
  }
  return frames;
}

/**
 * Onset strength: half-wave rectified log spectral flux between `loHz` and
 * `hiHz`, one value per frame, with its slow average taken off.
 */
export function onsetEnvelope(
  mono: Float32Array,
  hop: number,
  size = 1024,
  loHz = 30,
  hiHz = 8000,
): Float64Array {
  const frames = stft(mono, size, hop, hiHz);
  const k0 = Math.max(1, Math.floor((loHz / SR) * size));
  const n = frames.length;
  const env = new Float64Array(n);
  let prev: Float64Array | null = null;
  for (let t = 0; t < n; t++) {
    const f = frames[t]!;
    const cur = new Float64Array(f.length);
    for (let k = 0; k < f.length; k++) cur[k] = Math.log1p(1000 * f[k]!);
    if (prev) {
      let s = 0;
      for (let k = k0; k < f.length; k++) s += Math.max(0, cur[k]! - prev[k]!);
      env[t] = s;
    }
    prev = cur;
  }
  return detrend(env, Math.round((0.5 * SR) / hop));
}

/** Take a moving average (half-width `w` frames) off, and clamp at zero. */
function detrend(x: Float64Array, w: number): Float64Array {
  const n = x.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + x[i]!;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n, i + w + 1);
    out[i] = Math.max(0, x[i]! - (cum[b]! - cum[a]!) / (b - a));
  }
  return out;
}

/** The time (seconds) of frame `t` of an STFT with this hop and size. */
export const frameTime = (t: number, hop: number, size: number): number => (t * hop + size / 2) / SR;

// --- Tempo and beats (brief 7.5) ----------------------------------------------------

/** Autocorrelation of `x` for lags `[0, maxLag]`. */
function autocorr(x: Float64Array, maxLag: number): Float64Array {
  const out = new Float64Array(maxLag + 1);
  const n = x.length;
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i]! * x[i - lag]!;
    out[lag] = s / (n - lag);
  }
  return out;
}

/** The strength of a beat period (in frames, fractional) in an autocorrelation, with its multiples. */
function periodScore(ac: Float64Array, period: number): number {
  let s = 0;
  for (const [m, w] of [
    [1, 1],
    [2, 0.5],
    [4, 0.25],
  ] as const) {
    const lag = period * m;
    const i = Math.floor(lag);
    if (i + 1 >= ac.length) continue;
    const f = lag - i;
    s += w * (ac[i]! * (1 - f) + ac[i + 1]! * f);
  }
  return s;
}

/**
 * The tempo of an onset envelope by autocorrelation, between 50 and 210
 * BPM, with octave errors corrected toward `target`: a tempo near half,
 * double, two thirds or three halves of the target becomes the target's
 * multiple when that scores at least half as well.
 */
export function estimateTempo(env: Float64Array, hopSec: number, target?: number): number {
  const minBpm = 50;
  const maxBpm = 210;
  const maxLag = Math.ceil((60 / minBpm / hopSec) * 4) + 2;
  const ac = autocorr(env, Math.min(maxLag, env.length - 1));
  let best = 0;
  let bestBpm = 120;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.05) {
    const s = periodScore(ac, 60 / bpm / hopSec);
    if (s > best) {
      best = s;
      bestBpm = bpm;
    }
  }
  if (!target) return bestBpm;
  for (const ratio of [1, 0.5, 2, 2 / 3, 1.5]) {
    const cand = bestBpm * ratio;
    if (Math.abs(cand - target) / target > 0.08) continue;
    // Search near the matching multiple for its own peak.
    let localBest = 0;
    let localBpm = cand;
    for (let bpm = cand * 0.97; bpm <= cand * 1.03; bpm += 0.01) {
      const s = periodScore(ac, 60 / bpm / hopSec);
      if (s > localBest) {
        localBest = s;
        localBpm = bpm;
      }
    }
    if (localBest >= best * 0.5) return localBpm;
  }
  return bestBpm;
}

export interface BeatGrid {
  bpm: number;
  /** The time of a beat near the start of the song, seconds. */
  first: number;
  /** Seconds per beat. */
  period: number;
  /** Grid beat times through the song, seconds. */
  beats: number[];
  /** How far the music strays from the straight grid in the steady middle, ms. */
  driftMs: number;
  /**
   * How much more low end lands on the beats than halfway between them.
   * Near 1, the grid could as well sit on the off-beats.
   */
  phaseClarity: number;
}

/** Tempo and a straight beat grid for a mono signal. */
export function beatGrid(mono: Float32Array, target?: number, fixedBpm?: number): BeatGrid {
  const hop = 256;
  const size = 1024;
  const env = onsetEnvelope(mono, hop, size);
  const hopSec = hop / SR;
  const bpm0 = fixedBpm ?? estimateTempo(env, hopSec, target);
  const fit = combFit(env, hopSec, bpm0, fixedBpm ? 0 : 0.02);
  const offset = size / 2 / SR;
  const period = fit.period;
  let phase = fit.phase;
  // Hats and shakers on the off-beats can pull the grid half a beat off.
  // Beats are where the low end hits: keep whichever half has more of it.
  const lowAt = lowOnsets(mono, 30, 200);
  const lowScore = (ph: number): number => {
    let s = 0;
    for (let t = ph + offset; t < mono.length / SR; t += period) s += lowAt(t);
    return s;
  };
  const onBeat = lowScore(phase);
  const offBeat = lowScore(phase + period / 2);
  if (offBeat > onBeat * 1.2) phase += period / 2;
  const phaseClarity = Math.max(onBeat, offBeat) / Math.max(1e-9, Math.min(onBeat, offBeat));
  const first = (((phase + offset) % period) + period) % period;
  const duration = mono.length / SR;
  const beats: number[] = [];
  for (let t = first; t < duration; t += period) beats.push(t);
  return {
    bpm: 60 / period,
    first,
    period,
    beats,
    driftMs: localDrift(env, hopSec, phase, period) * 1000,
    phaseClarity,
  };
}

/**
 * Low-band onsets (kicks, bass notes) as a lookup by time: the strongest
 * onset from 40 ms before to 15 ms after. A long window's flux rises before
 * the hit, hence the lopsided search.
 */
function lowOnsets(mono: Float32Array, lo: number, hi: number): (t: number) => number {
  const hop = 256;
  const size = 2048;
  const env = onsetEnvelope(mono, hop, size, lo, hi);
  return (t) => {
    const f = Math.round((t * SR - size / 2) / hop);
    let m = 0;
    for (let d = -8; d <= 3; d++) m = Math.max(m, env[f + d] ?? 0);
    return m;
  };
}

/** Onset strength at a (fractional) frame, linearly interpolated. */
function envAt(env: Float64Array, f: number): number {
  const i = Math.floor(f);
  if (i < 0 || i + 1 >= env.length) return 0;
  const u = f - i;
  return env[i]! * (1 - u) + env[i + 1]! * u;
}

/**
 * The straight beat grid that best fits an onset envelope: the period
 * (within `spread` of `bpm`, as a fraction) and phase whose beats land on
 * the most onset strength. Songs from Suno keep a steady tempo, so one grid
 * for the whole song beats tracking each beat.
 */
export function combFit(
  env: Float64Array,
  hopSec: number,
  bpm: number,
  spread = 0.02,
): { period: number; phase: number } {
  const score = (periodF: number, phaseF: number): number => {
    let s = 0;
    let n = 0;
    for (let f = phaseF; f < env.length - 1; f += periodF) {
      s += envAt(env, f);
      n++;
    }
    return n ? s / n : 0;
  };
  let best = -1;
  let bestB = bpm;
  let bestPh = 0;
  // Coarse: 0.04 percent tempo steps and two-frame phase steps; then fine around the winner.
  const search = (
    lo: number,
    hi: number,
    bStep: number,
    phAt: (p: number) => [number, number, number],
  ): void => {
    for (let b = lo; b <= hi + 1e-9; b += bStep) {
      const p = 60 / b / hopSec;
      const [ph0, ph1, phStep] = phAt(p);
      for (let ph = ph0; ph < ph1; ph += phStep) {
        const s = score(p, ph);
        if (s > best) {
          best = s;
          bestB = b;
          bestPh = ph;
        }
      }
      if (bStep <= 0) break;
    }
  };
  const coarse = bpm * 0.0004;
  if (spread > 0) search(bpm * (1 - spread), bpm * (1 + spread), coarse, (p) => [0, p, 2]);
  else search(bpm, bpm, 0, (p) => [0, p, 1]);
  const centerPh = bestPh;
  if (spread > 0)
    search(bestB - 2 * coarse, bestB + 2 * coarse, coarse / 20, () => [centerPh - 3, centerPh + 3, 0.5]);
  const bestP = 60 / bestB / hopSec;
  // Refine the phase to a tenth of a frame.
  let refined = bestPh;
  for (let ph = bestPh - 1; ph <= bestPh + 1; ph += 0.1) {
    const s = score(bestP, ph);
    if (s > best) {
      best = s;
      refined = ph;
    }
  }
  return { period: bestP * hopSec, phase: refined * hopSec };
}

/**
 * How far the music strays from a straight grid: in each 16-beat window
 * of the steady middle (10 to 90 percent), the shift within a quarter beat
 * that best fits the onsets; returns the 90th percentile of those shifts,
 * in seconds.
 */
function localDrift(env: Float64Array, hopSec: number, phase: number, period: number): number {
  const pF = period / hopSec;
  const n = Math.floor((env.length - phase / hopSec) / pF);
  const shifts: number[] = [];
  for (let w = Math.floor(n * 0.1); w + 16 <= Math.ceil(n * 0.9); w += 8) {
    let best = -1;
    let arg = 0;
    for (let d = -pF / 4; d <= pF / 4; d += 0.5) {
      let s = 0;
      for (let k = w; k < w + 16; k++) s += envAt(env, phase / hopSec + k * pF + d);
      if (s > best) {
        best = s;
        arg = d;
      }
    }
    shifts.push(Math.abs(arg) * hopSec);
  }
  return percentile(shifts, 90);
}

/**
 * Pick which beat of four starts the bar: the phase whose beats line up
 * with the strongest kick-band (40 to 120 Hz) onsets in `rhythm` (the
 * drums, or the bass), as the brief asks. Kicks on 1 and 3 tie, so when
 * phases come within 5 percent of each other, the one where the harmony in
 * `tonal` (bass and harmony) changes most wins: chords change on bar lines.
 * Returns the time of the first downbeat.
 */
export function findDownbeat(
  rhythm: Float32Array,
  grid: { first: number; period: number },
  beatsPerBar = 4,
  tonal?: Float32Array,
): number {
  const kickAt = lowOnsets(rhythm, 40, 120);
  const at = (t: number): number => kickAt(t);
  const duration = rhythm.length / SR;
  const kick = new Array<number>(beatsPerBar).fill(0);
  for (let i = 0; grid.first + i * grid.period < duration; i++)
    kick[i % beatsPerBar]! += at(grid.first + i * grid.period);
  // The kick decides; harmony only breaks near-ties (within 5 percent), such as kicks on 1 and 3.
  const top = Math.max(...kick);
  const candidates = kick.map((v, i) => (v >= top * 0.95 ? i : -1)).filter((i) => i >= 0);
  let best = kick.indexOf(top);
  if (tonal && candidates.length > 1) {
    const chop = 2048;
    const chroma = stft(tonal, 8192, chop, 5200).map((m) => chromaOf(m, 8192));
    const beatChroma = (t0: number, t1: number): Float64Array => {
      const c = new Float64Array(12);
      const a = Math.max(0, Math.round((t0 * SR - 4096) / chop));
      const b = Math.min(chroma.length, Math.round((t1 * SR - 4096) / chop));
      for (let f = a; f < b; f++) for (let k = 0; k < 12; k++) c[k]! += chroma[f]![k]!;
      return c;
    };
    const change = new Array<number>(beatsPerBar).fill(0);
    let prev: Float64Array | null = null;
    for (let i = 0; grid.first + (i + 1) * grid.period < duration; i++) {
      const c = beatChroma(grid.first + i * grid.period, grid.first + (i + 1) * grid.period);
      if (prev) change[i % beatsPerBar]! += 1 - cosine(prev, c);
      prev = c;
    }
    best = candidates.reduce((a, b) => (change[b]! > change[a]! ? b : a));
  }
  return grid.first + best * grid.period;
}

// --- Key (brief 7.5) -----------------------------------------------------------------

/** 12-bin chroma (C first) of one magnitude spectrum, from `lo` to `hi` Hz. */
export function chromaOf(mag: Float32Array, size: number, lo = 80, hi = 5000): Float64Array {
  const c = new Float64Array(12);
  const k0 = Math.max(1, Math.floor((lo / SR) * size));
  const k1 = Math.min(mag.length - 1, Math.ceil((hi / SR) * size));
  for (let k = k0; k <= k1; k++) {
    const f = (k * SR) / size;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    // Bins far from a semitone center count less.
    const off = Math.abs(midi - Math.round(midi));
    c[pc]! += mag[k]! * mag[k]! * (1 - off);
  }
  return c;
}

/** Chroma frames of a mono signal (frame size 8192, the given hop). */
export function chromagram(mono: Float32Array, hop: number, size = 8192): Float64Array[] {
  return stft(mono, size, hop, 5200).map((m) => chromaOf(m, size));
}

// Key profiles: Krumhansl and Kessler's, and Temperley's.
const PROFILES: Record<string, { major: number[]; minor: number[] }> = {
  krumhansl: {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  },
  temperley: {
    major: [5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4],
    minor: [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 1.5, 4],
  },
};

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

export interface KeyResult extends MusicKey {
  /** The profile's correlation with the song's chroma, 0 to 1. */
  confidence: number;
  profile: string;
  /** The runner-up that doesn't share its notes, for the report. */
  runnerUp: MusicKey & { confidence: number };
}

/** Each chroma frame scaled to unit sum, then summed: every moment counts the same. */
export function chromaSum(frames: readonly Float64Array[]): Float64Array {
  const total = new Float64Array(12);
  for (const f of frames) {
    let s = 0;
    for (const v of f) s += v;
    if (s <= 0) continue;
    for (let i = 0; i < 12; i++) total[i]! += f[i]! / s;
  }
  return total;
}

/** The key whose profile best matches a chroma vector. Tries both profiles and keeps the more confident. */
export function detectKey(chroma: ArrayLike<number>): KeyResult {
  let best: KeyResult | null = null;
  for (const [profile, p] of Object.entries(PROFILES)) {
    const scored: (MusicKey & { confidence: number })[] = [];
    for (const mode of ['major', 'minor'] as const)
      for (let t = 0; t < 12; t++) {
        const rotated = Array.from({ length: 12 }, (_, i) => p[mode][(i - t + 12) % 12]!);
        scored.push({ tonic: PITCH_NAMES[t]!, mode, confidence: pearson(chroma, rotated) });
      }
    scored.sort((a, b) => b.confidence - a.confidence);
    const top = scored[0]!;
    const runnerUp = scored.find((s) => !sameNotes(s, top)) ?? scored[1]!;
    if (!best || top.confidence > best.confidence) best = { ...top, profile, runnerUp };
  }
  return best!;
}

export interface KeyDecision {
  key: MusicKey;
  confidence: number;
  source: 'detected' | 'target' | 'override';
  warning: string | null;
}

/** Brief 7.5: accept the target or its relative, else trust a confident detection, else the target. */
export function decideKey(
  detected: KeyResult,
  target: MusicKey | null,
  override: MusicKey | null,
): KeyDecision {
  const c = round(detected.confidence, 2);
  if (override) return { key: override, confidence: c, source: 'override', warning: null };
  const name = (k: MusicKey): string => `${k.tonic} ${k.mode}`;
  if (!target)
    return {
      key: { tonic: detected.tonic, mode: detected.mode },
      confidence: c,
      source: 'detected',
      warning: null,
    };
  if (sameNotes(detected, target)) {
    // Same notes: keep the brief's name for it (its tonic is the one the track was asked for).
    const exact = detected.tonic === target.tonic && detected.mode === target.mode;
    return {
      key: target,
      confidence: c,
      source: exact ? 'detected' : 'target',
      warning: exact
        ? null
        : `key detected as ${name(detected)}, the relative of the target ${name(target)}: same notes, kept the target`,
    };
  }
  if (detected.confidence < 0.6)
    return {
      key: target,
      confidence: c,
      source: 'target',
      warning: `key detected as ${name(detected)} (confidence ${c}), not the target ${name(target)}; low confidence, used the target`,
    };
  return {
    key: { tonic: detected.tonic, mode: detected.mode },
    confidence: c,
    source: 'detected',
    warning: `key detected as ${name(detected)} (confidence ${c}), not the target ${name(target)}; neighbors may clash`,
  };
}

/** Pitchiness of a stem: the mean peak-to-mean ratio of its chroma frames where it is loud. */
export function pitchiness(frames: readonly Float64Array[]): number {
  const energies = frames.map((f) => f.reduce((a, b) => a + b, 0));
  const loud = percentile(energies, 75) * 0.1;
  let sum = 0;
  let n = 0;
  frames.forEach((f, i) => {
    if (energies[i]! <= loud || energies[i]! <= 0) return;
    let max = 0;
    for (const v of f) max = Math.max(max, v);
    sum += max / (energies[i]! / 12);
    n++;
  });
  return n ? sum / n : 0;
}

/**
 * The register of a stem's main line: the mean MIDI note of the strongest
 * spectral peak between 150 Hz and 3 kHz, over the frames where it plays.
 */
export function register(mono: Float32Array): number {
  const size = 8192;
  const frames = stft(mono, size, 4096, 3100);
  const energies = frames.map((f) => f.reduce((a, v) => a + v * v, 0));
  const floor = percentile(energies, 75) * 0.05;
  const k0 = Math.floor((150 / SR) * size);
  let sum = 0;
  let n = 0;
  frames.forEach((f, t) => {
    if (energies[t]! <= floor || energies[t]! <= 0) return;
    let mk = 0;
    let mv = 0;
    for (let k = k0; k < f.length; k++)
      if (f[k]! > mv) {
        mv = f[k]!;
        mk = k;
      }
    if (mk === 0) return;
    sum += 69 + 12 * Math.log2((mk * SR) / size / 440);
    n++;
  });
  return n ? sum / n : 0;
}

export interface LeadCandidate {
  name: string;
  /** Share of the song it plays in (Activity.active). */
  active: number;
  /** register() of the stem. */
  register: number;
}

/**
 * A track whose stems gave no lead (no woodwinds, brass, and so on: the
 * marimba of a plaza track hides in keys) needs one for the melody dip.
 * Pick from the harmony stems the one that plays through most of the song
 * (within three quarters of the busiest) and sits highest. Null if there
 * are fewer than two harmony stems, so harmony is never left empty.
 */
export function pickLead(harmony: readonly LeadCandidate[]): string | null {
  if (harmony.length < 2) return null;
  const busiest = Math.max(...harmony.map((h) => h.active));
  const busy = harmony.filter((h) => h.active >= busiest * 0.75);
  busy.sort((a, b) => b.register - a.register);
  return busy[0]?.name ?? null;
}

/** A stem mapped to drums above this pitchiness gets "pitched percussion, check whether this is the melody". */
export const PITCHED_PERCUSSION = 4;

// --- Loop search (brief 7.6) -------------------------------------------------------

export interface LoopFeatures {
  /** Seconds per feature frame. */
  hopSec: number;
  chroma: Float64Array[];
  rmsEnv: Float64Array;
  onset: Float64Array;
}

/** Per-20 ms features of the reference mix for loop scoring. */
export function loopFeatures(mono: Float32Array): LoopFeatures {
  const hop = 960;
  const chroma = stft(mono, 4096, hop, 5200).map((m) => chromaOf(m, 4096));
  const n = chroma.length;
  const rmsEnv = new Float64Array(n);
  for (let t = 0; t < n; t++) rmsEnv[t] = rms(mono, t * hop, Math.min(mono.length, t * hop + 4096));
  const onsetRaw = onsetEnvelope(mono, hop, 2048);
  const onset = new Float64Array(n);
  for (let t = 0; t < n; t++) onset[t] = onsetRaw[t] ?? 0;
  return { hopSec: hop / SR, chroma, rmsEnv, onset };
}

function cosine(a: Float64Array, b: Float64Array): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i]! * b[i]!;
    aa += a[i]! * a[i]!;
    bb += b[i]! * b[i]!;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/** How alike the bar after `s` and the bar after `e` are (seconds), 0 to 1. */
export function seamScore(f: LoopFeatures, s: number, e: number, barSec: number): number {
  const a = Math.round(s / f.hopSec);
  const b = Math.round(e / f.hopSec);
  const len = Math.round(barSec / f.hopSec);
  if (b + len > f.chroma.length || a < 0) return -1;
  let cos = 0;
  for (let i = 0; i < len; i++) cos += cosine(f.chroma[a + i]!, f.chroma[b + i]!);
  cos /= len;
  const r = pearson(f.rmsEnv.subarray(a, a + len), f.rmsEnv.subarray(b, b + len));
  const o = pearson(f.onset.subarray(a, a + len), f.onset.subarray(b, b + len));
  return 0.5 * cos + 0.3 * r + 0.2 * o;
}

export interface LoopChoice {
  start: number;
  end: number;
  bars: number;
  score: number;
  warning: string | null;
}

/**
 * Brief 7.6, with the loop length steered toward `preferSec` (about 64 s):
 * candidate starts are downbeats from 4 bars after the first beat up to
 * 60 s in; lengths are multiples of 4 bars inside 48 to 96 s ending before
 * the last 10 s. Among candidates scoring within 0.05 of the best, take the
 * one nearest `preferSec` (then the longer). Candidates with a bar more than
 * 9 dB under the median bar (a breakdown or a fade) are skipped.
 */
export function findLoop(
  f: LoopFeatures,
  grid: { downbeat: number; period: number; beatsPerBar: number },
  duration: number,
  preferSec = 64,
): LoopChoice {
  const barSec = grid.period * grid.beatsPerBar;
  const nBars = Math.floor((duration - grid.downbeat) / barSec);
  const barDb: number[] = [];
  for (let i = 0; i < nBars; i++) {
    const a = Math.round((grid.downbeat + i * barSec) / f.hopSec);
    const b = Math.round((grid.downbeat + (i + 1) * barSec) / f.hopSec);
    let s = 0;
    for (let t = a; t < b && t < f.rmsEnv.length; t++) s += f.rmsEnv[t]! ** 2;
    barDb.push(10 * Math.log10(s / Math.max(1, b - a) + 1e-20));
  }
  const median = percentile(barDb, 50);
  type Cand = { start: number; end: number; bars: number; score: number; quiet: boolean };
  const cands: Cand[] = [];
  for (let i = 4; grid.downbeat + i * barSec <= 60; i++) {
    const start = grid.downbeat + i * barSec;
    for (let bars = 4; ; bars += 4) {
      const len = bars * barSec;
      const end = start + len;
      if (len > 96) break;
      if (len < 48) continue;
      if (end > duration - 10) break;
      const quiet = barDb.slice(i, i + bars).some((d) => d < median - 9);
      cands.push({ start, end, bars, score: seamScore(f, start, end, barSec), quiet });
    }
  }
  if (cands.length === 0) {
    // A short song: the longest whole-bar span that fits.
    const bars = Math.max(1, Math.floor((duration - grid.downbeat) / barSec));
    return {
      start: grid.downbeat,
      end: grid.downbeat + bars * barSec,
      bars,
      score: 0,
      warning: 'song too short for a 48 s loop; looped the whole song',
    };
  }
  const passing = cands.filter((c) => !c.quiet);
  const pool = passing.length ? passing : cands;
  const best = Math.max(...pool.map((c) => c.score));
  const near = pool.filter((c) => c.score >= best - 0.05);
  near.sort((a, b) => {
    const da = Math.abs(a.end - a.start - preferSec);
    const db = Math.abs(b.end - b.start - preferSec);
    if (Math.abs(da - db) > 1e-6) return da - db;
    if (b.bars !== a.bars) return b.bars - a.bars;
    return b.score - a.score;
  });
  const c = near[0]!;
  return {
    start: c.start,
    end: c.end,
    bars: c.bars,
    score: round(c.score, 3),
    warning: passing.length
      ? null
      : 'every loop candidate has a quiet bar (a breakdown or fade); took the best anyway',
  };
}

// --- Baking (brief 7.8) -------------------------------------------------------------

export type Curve = 'equal_power' | 'linear';

/** The crossfade curve for each layer: equal power for drums and lead, linear for sustained bass and harmony. */
export function curveFor(layer: MusicLayer | 'full'): Curve {
  return layer === 'bass' || layer === 'harmony' ? 'linear' : 'equal_power';
}

/**
 * Bake a seamless loop from interleaved audio with `channels` channels:
 * take `[s, e + x)` (sample frames), crossfade the tail `[e, e + x)` into
 * the head, and return exactly `e - s` frames that loop with no seam.
 */
export function bakeLoop(
  audio: Float32Array,
  channels: number,
  s: number,
  e: number,
  x: number,
  curve: Curve,
): Float32Array {
  const len = e - s;
  const out = new Float32Array(len * channels);
  for (let i = 0; i < len * channels; i++) out[i] = audio[s * channels + i] ?? 0;
  const fade = Math.min(x, len);
  for (let i = 0; i < fade; i++) {
    const p = (i + 0.5) / fade;
    const fin = curve === 'linear' ? p : Math.sin((p * Math.PI) / 2);
    const fout = curve === 'linear' ? 1 - p : Math.cos((p * Math.PI) / 2);
    for (let c = 0; c < channels; c++) {
      const head = audio[(s + i) * channels + c] ?? 0;
      const tail = audio[(e + i) * channels + c] ?? 0;
      out[i * channels + c] = head * fin + tail * fout;
    }
  }
  return out;
}

/**
 * Wrap a baked loop with `pad` frames of itself on each side (its end
 * before, its start after), so a codec's warm-up and padding never touch
 * the seam. The player loops from `pad` to `pad + body`.
 */
export function padLoop(body: Float32Array, channels: number, pad: number): Float32Array {
  const len = body.length / channels;
  const out = new Float32Array((len + 2 * pad) * channels);
  for (let i = 0; i < len + 2 * pad; i++) {
    const src = (((i - pad) % len) + len) % len;
    for (let c = 0; c < channels; c++) out[i * channels + c] = body[src * channels + c]!;
  }
  return out;
}

/** The biggest jump across a loop's wrap (last frame to first), relative to the signal's typical step. */
export function seamError(body: Float32Array, channels: number): number {
  const len = body.length / channels;
  let typical = 0;
  for (let i = 1; i < len; i++)
    for (let c = 0; c < channels; c++)
      typical += Math.abs(body[i * channels + c]! - body[(i - 1) * channels + c]!);
  typical /= Math.max(1, (len - 1) * channels);
  let jump = 0;
  for (let c = 0; c < channels; c++)
    jump = Math.max(jump, Math.abs(body[c]! - body[(len - 1) * channels + c]!));
  return typical > 0 ? jump / typical : jump;
}

/** Stereo interleaved to mono, or mono kept: for the bass layer, which ships mono. */
export function downmix(stereo: Float32Array): Float32Array {
  return toMono(stereo);
}

// --- Misc ---------------------------------------------------------------------------

export function round(x: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(x * m) / m;
}

/** Brief 7.5 step 2 and 3: correct octave errors, then decide whether to conform onto the target. */
export function conformTempo(
  detected: number,
  target: number,
): { bpm: number; stretch: number | null; warning: string | null } {
  let d = detected;
  for (const r of [0.5, 2])
    if (Math.abs(detected * r - target) / target < Math.abs(d - target) / target) d = detected * r;
  const miss = Math.abs(d - target) / target;
  if (miss <= 0.04) {
    const stretch = target / d;
    // Closer than 0.05 percent: no stretch needed (under 2 ms of drift per minute... and a bit).
    return { bpm: target, stretch: Math.abs(stretch - 1) < 0.0005 ? null : stretch, warning: null };
  }
  return {
    bpm: round(d, 2),
    stretch: null,
    warning: `tempo ${round(d, 1)} BPM is ${round(miss * 100, 1)}% off the target ${target}; kept it, so crossfades from this track won't be beat-locked`,
  };
}
