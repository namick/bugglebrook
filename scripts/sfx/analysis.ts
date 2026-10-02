// The sound importer's signal work (docs/08-sound-brief.md, part 6.3): clean,
// split, trim, fold to mono, measure loudness (ITU-R BS.1770, written out
// here so it is testable without ffmpeg), pick a bed's steadiest stretch and
// bake its loop, and cut and pitch her voice clips. Pure: Vitest runs it on
// small synthetic signals.

import { SR, bakeLoop, dB, fromDb, padLoop } from '../music/analysis.ts';

export { SR, dB, fromDb };

/** Interleaved audio at 48 kHz. */
export interface Audio {
  data: Float32Array;
  channels: number;
}

export const frames = (a: Audio): number => a.data.length / a.channels;

export function slice(a: Audio, from: number, to: number): Audio {
  return { data: a.data.slice(from * a.channels, to * a.channels), channels: a.channels };
}

/** One channel's samples, or the mean of all of them. */
export function mono(a: Audio, channel?: number): Float32Array {
  const n = frames(a);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (channel !== undefined) out[i] = a.data[i * a.channels + channel]!;
    else {
      let s = 0;
      for (let c = 0; c < a.channels; c++) s += a.data[i * a.channels + c]!;
      out[i] = s / a.channels;
    }
  }
  return out;
}

function rmsOf(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return to > from ? Math.sqrt(s / (to - from)) : 0;
}

function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

// --- Cleaning (step 5) --------------------------------------------------------------------

interface Biquad {
  b: [number, number, number];
  a: [number, number, number];
}

function runBiquad(a: Audio, f: Biquad): Audio {
  const out = new Float32Array(a.data.length);
  for (let c = 0; c < a.channels; c++) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = c; i < a.data.length; i += a.channels) {
      const x = a.data[i]!;
      const y = f.b[0] * x + f.b[1] * x1 + f.b[2] * x2 - f.a[1] * y1 - f.a[2] * y2;
      out[i] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
  }
  return { data: out, channels: a.channels };
}

/** A second-order Butterworth high-pass. */
export function highpass(a: Audio, hz: number): Audio {
  const w = (2 * Math.PI * hz) / SR;
  const alpha = Math.sin(w) / Math.SQRT2;
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return runBiquad(a, {
    b: [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0],
    a: [1, (-2 * cos) / a0, (1 - alpha) / a0],
  });
}

/** Remove DC (each channel's mean). */
export function removeDc(a: Audio): Audio {
  const out = new Float32Array(a.data);
  for (let c = 0; c < a.channels; c++) {
    let s = 0;
    for (let i = c; i < out.length; i += a.channels) s += out[i]!;
    const mean = s / Math.max(1, out.length / a.channels);
    for (let i = c; i < out.length; i += a.channels) out[i] = out[i]! - mean;
  }
  return { data: out, channels: a.channels };
}

export function clean(a: Audio, bed: boolean): Audio {
  return highpass(removeDc(a), bed ? 25 : 40);
}

// --- Splitting and trimming (steps 4 and 6) ---------------------------------------------

const FRAME = Math.round(SR * 0.01);

/** 10 ms RMS frames of the channel mean, in dB relative to the peak. */
function frameDb(a: Audio): { db: Float64Array; peakDb: number } {
  const m = mono(a);
  const peakDb = dB(peakOf(m));
  const n = Math.ceil(m.length / FRAME);
  const db = new Float64Array(n);
  for (let f = 0; f < n; f++) db[f] = dB(rmsOf(m, f * FRAME, Math.min(m.length, (f + 1) * FRAME))) - peakDb;
  return { db, peakDb };
}

/**
 * Where to cut a file into takes: at every silence of `gapSec` or more
 * below `belowDb` relative to the peak. Pieces under `minSec` are dropped.
 * Returns frame ranges [start, end).
 */
export function splitAtSilence(a: Audio, gapSec = 0.3, belowDb = -45, minSec = 0.04): [number, number][] {
  const { db } = frameDb(a);
  const gap = Math.round(gapSec / 0.01);
  const out: [number, number][] = [];
  let start = -1;
  let quiet = 0;
  for (let f = 0; f < db.length; f++) {
    const loud = db[f]! > belowDb;
    if (loud) {
      if (start < 0) start = f;
      quiet = 0;
    } else if (start >= 0 && ++quiet >= gap) {
      out.push([start, f - quiet + 1]);
      start = -1;
      quiet = 0;
    }
  }
  if (start >= 0) out.push([start, db.length - quiet]);
  const n = frames(a);
  return out
    .map(([s, e]): [number, number] => [s * FRAME, Math.min(n, e * FRAME)])
    .filter(([s, e]) => e - s >= minSec * SR);
}

/**
 * Trim a take's silence: start 5 ms before the first sample above -50 dB
 * (relative to the peak), end where the 10 ms RMS stays under -60 dB, then
 * a 20 ms fade. Returns the trimmed audio.
 */
export function trimSilence(a: Audio): Audio {
  const m = mono(a);
  const p = peakOf(m);
  if (p === 0) return slice(a, 0, 0);
  const on = fromDb(-50) * p;
  let first = 0;
  while (first < m.length && Math.abs(m[first]!) <= on) first++;
  const { db } = frameDb(a);
  let lastFrame = db.length - 1;
  while (lastFrame > 0 && db[lastFrame]! < -60) lastFrame--;
  const start = Math.max(0, first - Math.round(SR * 0.005));
  const end = Math.min(m.length, (lastFrame + 1) * FRAME + Math.round(SR * 0.02));
  return fadeOut(slice(a, start, Math.max(start, end)), 0.02);
}

/** Fade the last `sec` seconds to silence. */
export function fadeOut(a: Audio, sec: number): Audio {
  const n = frames(a);
  const len = Math.min(n, Math.round(sec * SR));
  const out = new Float32Array(a.data);
  for (let i = 0; i < len; i++) {
    const g = 1 - (i + 1) / len;
    for (let c = 0; c < a.channels; c++) out[(n - len + i) * a.channels + c]! *= g;
  }
  return { data: out, channels: a.channels };
}

/** Cut a one-shot to its catalog's longest, with a 50 ms fade there. Says whether it was cut. */
export function capLength(a: Audio, maxSec: number): { audio: Audio; cut: boolean } {
  const max = Math.round(maxSec * SR);
  if (frames(a) <= max) return { audio: a, cut: false };
  return { audio: fadeOut(slice(a, 0, max), 0.05), cut: true };
}

// --- Channels (step 7) --------------------------------------------------------------------

/**
 * Fold to mono. If the sum is more than 3 dB quieter than the louder
 * channel (the channels cancel), use the louder channel instead.
 */
export function foldMono(a: Audio): { audio: Audio; channel: 'sum' | number } {
  if (a.channels === 1) return { audio: a, channel: 'sum' };
  const sum = mono(a);
  let best = 0;
  let bestRms = -1;
  for (let c = 0; c < a.channels; c++) {
    const r = rmsOf(mono(a, c));
    if (r > bestRms) [best, bestRms] = [c, r];
  }
  if (dB(rmsOf(sum)) < dB(bestRms) - 3) return { audio: { data: mono(a, best), channels: 1 }, channel: best };
  return { audio: { data: sum, channels: 1 }, channel: 'sum' };
}

// --- Loudness (step 8): ITU-R BS.1770 ---------------------------------------------------

/** The K-weighting filters at 48 kHz. */
const SHELF: Biquad = {
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [1, -1.69065929318241, 0.73248077421585],
};
const RLB: Biquad = { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] };

/** Mean square of each 400 ms block (K-weighted, summed over channels), every `hop` seconds. */
function blockPowers(a: Audio, hop: number): number[] {
  const k = runBiquad(runBiquad(a, SHELF), RLB);
  const n = frames(k);
  const size = Math.round(SR * 0.4);
  const step = Math.round(SR * hop);
  const out: number[] = [];
  // A take shorter than a block is measured as one block, padded with silence.
  for (let s = 0; s === 0 || s + size <= n; s += step) {
    let sum = 0;
    for (let i = s; i < Math.min(n, s + size); i++)
      for (let c = 0; c < k.channels; c++) sum += k.data[i * k.channels + c]! ** 2;
    out.push(sum / size);
    if (s + size >= n) break;
  }
  return out;
}

const lufsOf = (power: number): number => (power > 0 ? -0.691 + 10 * Math.log10(power) : -200);

/** The loudest momentary loudness (400 ms windows, 100 ms apart), LUFS. For one-shots. */
export function maxMomentary(a: Audio): number {
  return Math.max(...blockPowers(a, 0.1).map(lufsOf));
}

/** Integrated loudness with the absolute (-70) and relative (-10 LU) gates, LUFS. For beds. */
export function integrated(a: Audio): number {
  const blocks = blockPowers(a, 0.1);
  const abs = blocks.filter((p) => lufsOf(p) > -70);
  if (abs.length === 0) return -200;
  const rel = lufsOf(abs.reduce((s, p) => s + p, 0) / abs.length) - 10;
  const gated = abs.filter((p) => lufsOf(p) > rel);
  return lufsOf(gated.reduce((s, p) => s + p, 0) / Math.max(1, gated.length));
}

/** Short-term loudness (3 s windows, 1 s apart), LUFS. */
export function shortTerm(a: Audio): number[] {
  const k = runBiquad(runBiquad(a, SHELF), RLB);
  const n = frames(k);
  const size = SR * 3;
  const out: number[] = [];
  for (let s = 0; s + size <= n; s += SR) {
    let sum = 0;
    for (let i = s; i < s + size; i++)
      for (let c = 0; c < k.channels; c++) sum += k.data[i * k.channels + c]! ** 2;
    out.push(lufsOf(sum / size));
  }
  return out;
}

/**
 * An estimate of the true peak (dBTP): the sample peak, checked between
 * samples with 4x Catmull-Rom interpolation.
 */
export function truePeak(a: Audio): number {
  let p = 0;
  for (let c = 0; c < a.channels; c++) {
    const x = mono(a, c);
    for (let i = 1; i + 2 < x.length; i++) {
      const [y0, y1, y2, y3] = [x[i - 1]!, x[i]!, x[i + 1]!, x[i + 2]!];
      p = Math.max(p, Math.abs(y1));
      for (const t of [0.25, 0.5, 0.75]) {
        const v =
          0.5 *
          (2 * y1 +
            (-y0 + y2) * t +
            (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t +
            (-y0 + 3 * y1 - 3 * y2 + y3) * t * t * t);
        p = Math.max(p, Math.abs(v));
      }
    }
    for (const v of x) p = Math.max(p, Math.abs(v));
  }
  return dB(p);
}

export function gain(a: Audio, db: number): Audio {
  const g = fromDb(db);
  return { data: a.data.map((v) => v * g), channels: a.channels };
}

/**
 * Bring a take to its loudness target without its true peak passing the
 * ceiling. Returns the audio, the gain applied, and whether the ceiling held
 * it under the target.
 */
export function normalize(
  a: Audio,
  target: number,
  measure: (a: Audio) => number,
  ceiling = -2,
): { audio: Audio; gainDb: number; short: boolean; lufs: number } {
  const now = measure(a);
  const want = target - now;
  const room = ceiling - truePeak(a);
  const g = Math.min(want, room);
  const audio = gain(a, g);
  return { audio, gainDb: g, short: room < want - 0.05, lufs: now + g };
}

// --- Beds (step 9) ---------------------------------------------------------------------

/**
 * The steadiest stretch of a long recording, `minSec` to `maxSec` long:
 * lowest variance of short-term loudness, with no 3 s window more than
 * 8 LU over the median. Returns frames [start, end), or the whole file when
 * it is shorter than `minSec`.
 */
export function steadiest(a: Audio, minSec = 30, maxSec = 90, xfadeSec = 2): [number, number] {
  const n = frames(a);
  const usable = n - Math.round(xfadeSec * SR);
  if (usable <= minSec * SR) return [0, Math.max(0, usable)];
  const st = shortTerm(a);
  const median = [...st].sort((x, y) => x - y)[st.length >> 1]!;
  const len = Math.min(maxSec, Math.floor(usable / SR));
  let best = 0;
  let bestScore = Infinity;
  for (let s = 0; s + len <= Math.floor(usable / SR); s++) {
    const win = st.slice(s, Math.max(s + 1, s + len - 2));
    const mean = win.reduce((x, y) => x + y, 0) / win.length;
    const variance = win.reduce((x, y) => x + (y - mean) ** 2, 0) / win.length;
    const spikes = win.some((v) => v > median + 8) ? 1000 : 0;
    if (variance + spikes < bestScore) [best, bestScore] = [s, variance + spikes];
  }
  return [best * SR, (best + len) * SR];
}

/** Frames of a bed's own audio kept on each side of the loop so codec padding never touches the seam. */
export const BED_PAD = 4800;

/**
 * Bake a bed's loop: the stretch [s, e) with a 2 s equal-power crossfade,
 * padded with itself on each side. Returns the padded audio and the loop's
 * start and length in seconds.
 */
export function bakeBed(
  a: Audio,
  s: number,
  e: number,
  xfadeSec = 2,
): { audio: Audio; loopStart: number; dur: number } {
  const x = Math.min(Math.round(xfadeSec * SR), Math.floor((e - s) / 2));
  const body = bakeLoop(a.data, a.channels, s, e, x, 'equal_power');
  const padded = padLoop(body, a.channels, BED_PAD);
  return { audio: { data: padded, channels: a.channels }, loopStart: BED_PAD / SR, dur: (e - s) / SR };
}

/** How much the loudness jumps across a loop's seam: the last 1.5 s against the first, LU. */
export function seamJump(body: Audio): number {
  const n = frames(body);
  const w = Math.min(Math.round(1.5 * SR), n >> 1);
  const head = slice(body, 0, w);
  const tail = slice(body, n - w, n);
  return Math.abs(lufsOf(meanPower(head)) - lufsOf(meanPower(tail)));
}

function meanPower(a: Audio): number {
  const k = runBiquad(runBiquad(a, SHELF), RLB);
  let s = 0;
  for (const v of k.data) s += v * v;
  return s / Math.max(1, frames(k));
}

// --- Choosing takes (step 10) ------------------------------------------------------------

/** Keep at most `max` takes, preferring those closest to the median length. Returns indices in order. */
export function pickTakes(lengths: readonly number[], max = 12): number[] {
  if (lengths.length <= max) return lengths.map((_, i) => i);
  const median = [...lengths].sort((a, b) => a - b)[lengths.length >> 1]!;
  return lengths
    .map((l, i) => ({ i, d: Math.abs(l - median) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, max)
    .map((x) => x.i)
    .sort((a, b) => a - b);
}

// --- Her voice (step 12) -----------------------------------------------------------------

/**
 * Cut babble into syllables: split at dips in the 10 ms energy (onsets),
 * keeping pieces of 80 to 400 ms. Returns frame ranges.
 */
export function syllables(a: Audio, minSec = 0.08, maxSec = 0.4): [number, number][] {
  const { db } = frameDb(a);
  const out: [number, number][] = [];
  const minF = Math.round(minSec / 0.01);
  const maxF = Math.round(maxSec / 0.01);
  let start = -1;
  for (let f = 0; f < db.length; f++) {
    const loud = db[f]! > -30;
    const dip = f > 0 && f + 1 < db.length && db[f]! < db[f - 1]! - 6 && db[f]! < db[f + 1]! - 6;
    if (start < 0) {
      if (loud) start = f;
      continue;
    }
    const len = f - start;
    if (!loud || (dip && len >= minF) || len >= maxF) {
      if (len >= minF) out.push([start * FRAME, f * FRAME]);
      start = loud ? f : -1;
    }
  }
  if (start >= 0 && db.length - start >= minF)
    out.push([start * FRAME, Math.min(frames(a), db.length * FRAME)]);
  return out;
}

/** The fundamental of a voiced stretch with YIN (de Cheveigné and Kawahara), Hz, or 0 if unvoiced. */
export function yin(x: Float32Array, lo = 70, hi = 900, threshold = 0.15): number {
  const maxLag = Math.floor(SR / lo);
  const minLag = Math.floor(SR / hi);
  const w = Math.min(x.length - maxLag, Math.round(SR * 0.03));
  if (w <= 0) return 0;
  const d = new Float64Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const diff = x[i]! - x[i + tau]!;
      s += diff * diff;
    }
    d[tau] = s;
  }
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau]!;
    const cmnd = running > 0 ? (d[tau]! * tau) / running : 1;
    if (tau >= minLag && cmnd < threshold) {
      // Walk down to the dip's bottom, then refine with a parabola.
      let t = tau;
      while (t + 1 <= maxLag && d[t + 1]! < d[t]!) t++;
      const [a, b, c] = [d[t - 1]!, d[t]!, d[t + 1] ?? d[t]!];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return SR / (t + (Number.isFinite(shift) ? shift : 0));
    }
  }
  return 0;
}

/** Median pitch over a clip's voiced 30 ms windows, Hz (0 if none are voiced). */
export function medianPitch(a: Audio): number {
  const m = mono(a);
  const hop = Math.round(SR * 0.02);
  const found: number[] = [];
  for (let s = 0; s + Math.round(SR * 0.045) < m.length; s += hop) {
    const f = yin(m.subarray(s));
    if (f > 0) found.push(f);
  }
  if (found.length === 0) return 0;
  found.sort((a, b) => a - b);
  return found[found.length >> 1]!;
}
