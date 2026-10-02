// pnpm music:import [track_id ...] [--force] [--src <dir>] [--out <dir>]
//
// Turns the owner's Suno tracks (assets/music/<track_id>/full.wav plus
// stems) into looping Ogg Opus layers and a manifest the game plays
// (docs/05-music-brief.md section 7). A developer tool: CI never runs it,
// and its outputs in src/renderer/public/music/ are committed.
//
// Needs ffmpeg with libopus (and ideally rubberband) on the PATH, or set
// FFMPEG to its path. `--src` reads the raw tracks from another folder
// (for example the main checkout when you work in a git worktree).

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestStinger, ManifestTrack, MusicLayer, MusicManifest } from '../../src/shared/music.ts';
import {
  MUSIC_LAYERS,
  emptyManifest,
  keyName,
  manifestErrors,
  parseKey,
  pentatonic,
  trackSpec,
} from '../../src/shared/music.ts';
import type { Activity, StemMapping, TrackOverride } from './analysis.ts';
import {
  PITCHED_PERCUSSION,
  SR,
  activity,
  bakeLoop,
  beatGrid,
  chromaSum,
  chromagram,
  conformTempo,
  curveFor,
  dB,
  decideKey,
  detectKey,
  findDownbeat,
  findLoop,
  fromDb,
  isFullMixName,
  isSilent,
  loopFeatures,
  mapStem,
  mixInto,
  normalizeStemName,
  padLoop,
  peak,
  pickLead,
  pitchiness,
  register,
  rms,
  round,
  seamError,
  toMono,
  vocalCheck,
} from './analysis.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const AUDIO_EXT = /\.(wav|mp3|flac)$/i;
/** Loudness target (brief 7.7), and the true-peak ceiling. */
const TARGET_LUFS = -18;
const STINGER_LUFS = -16;
const PEAK_CEILING = -1.5;
/** Frames of the loop's own audio kept on each side of the body in every file. */
const PAD = 4800;
const BITRATE: Record<MusicLayer | 'full', number> = {
  drums: 80,
  bass: 48,
  harmony: 96,
  lead: 96,
  full: 128,
};

// --- Arguments -------------------------------------------------------------------

interface Options {
  ids: string[];
  force: boolean;
  src: string;
  out: string;
  report: string;
  overrides: string;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    ids: [],
    force: false,
    src: process.env.BB_MUSIC_SRC ?? join(ROOT, 'assets/music'),
    out: join(ROOT, 'src/renderer/public/music'),
    report: join(ROOT, 'assets/music/import-report.txt'),
    overrides: join(ROOT, 'assets/music/overrides.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--force') o.force = true;
    else if (a === '--src') o.src = resolve(argv[++i]!);
    else if (a === '--out') o.out = resolve(argv[++i]!);
    else if (a === '--report') o.report = resolve(argv[++i]!);
    else if (a === '--overrides') o.overrides = resolve(argv[++i]!);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.ids.push(a);
  }
  return o;
}

// --- ffmpeg ----------------------------------------------------------------------

function run(args: string[], input?: Float32Array): Promise<{ out: Buffer; err: string }> {
  return new Promise((ok, fail) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'info', ...args], {
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let err = '';
    p.stdout!.on('data', (c: Buffer) => chunks.push(c));
    p.stderr!.on('data', (c: Buffer) => (err += c.toString()));
    p.on('error', fail);
    p.on('close', (code) => {
      if (code === 0) ok({ out: Buffer.concat(chunks), err });
      else fail(new Error(`ffmpeg ${args.join(' ')} failed (${code}):\n${err.slice(-2000)}`));
    });
    if (input && p.stdin) {
      p.stdin.on('error', () => undefined);
      p.stdin.end(Buffer.from(input.buffer, input.byteOffset, input.byteLength));
    }
  });
}

function floats(buf: Buffer): Float32Array {
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer, 0, copy.byteLength >> 2);
}

/** Decode any audio file to 48 kHz interleaved stereo float. */
async function decode(file: string): Promise<Float32Array> {
  const { out } = await run(['-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1']);
  return floats(out);
}

const RAW_IN = (channels: number): string[] => [
  '-f',
  'f32le',
  '-ar',
  String(SR),
  '-ac',
  String(channels),
  '-i',
  'pipe:0',
];

/** Time-stretch stereo audio by `tempo` (above 1 is faster) with rubberband, or atempo without it. */
async function stretch(audio: Float32Array, tempo: number, rubberband: boolean): Promise<Float32Array> {
  const filter = rubberband
    ? `rubberband=tempo=${tempo}:pitchq=quality:channels=together:transients=mixed`
    : `atempo=${tempo}`;
  const { out } = await run(
    [...RAW_IN(2), '-af', filter, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'],
    audio,
  );
  return floats(out);
}

/** Integrated loudness (LUFS) and true peak (dBTP) of stereo audio. */
async function loudness(audio: Float32Array): Promise<{ lufs: number; truePeak: number }> {
  const res = await run([...RAW_IN(2), '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], audio);
  const summary = res.err.slice(res.err.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)?.[1] ?? NaN);
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1] ?? NaN);
  return { lufs: Number.isFinite(lufs) ? lufs : -70, truePeak: Number.isFinite(truePeak) ? truePeak : -70 };
}

async function encode(audio: Float32Array, channels: number, kbps: number, file: string): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  await run(
    [
      ...RAW_IN(channels),
      '-c:a',
      'libopus',
      '-b:a',
      `${kbps}k`,
      '-vbr',
      'on',
      '-application',
      'audio',
      '-frame_duration',
      '20',
      '-map_metadata',
      '-1',
      '-y',
      file,
    ],
    audio,
  );
}

async function hasFilter(name: string): Promise<boolean> {
  const { out } = await run(['-filters']);
  return new RegExp(`\\s${name}\\s`).test(out.toString());
}

// --- Discovery -------------------------------------------------------------------

function audioFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      for (const sub of readdirSync(p).sort())
        if (!sub.startsWith('.') && AUDIO_EXT.test(sub)) out.push(join(p, sub));
    } else if (AUDIO_EXT.test(name)) out.push(p);
  }
  return out;
}

function readNotes(dir: string): Record<string, string> {
  const f = join(dir, 'notes.txt');
  if (!existsSync(f)) return {};
  const notes: Record<string, string> = {};
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^(link|downloaded|plan|trim):\s*(.+)$/i.exec(line.trim());
    if (m) notes[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  return notes;
}

function sourceHash(files: string[]): string {
  const h = createHash('sha1');
  for (const f of files) {
    h.update(relative(dirname(dirname(f)), f));
    h.update(readFileSync(f));
  }
  return `sha1:${h.digest('hex')}`;
}

// --- Per track -------------------------------------------------------------------

interface Report {
  lines: string[];
  warnings: string[];
}

const warn = (r: Report, w: string): void => {
  r.warnings.push(w);
};

/** Trim leading digital silence (below -70 dBFS) by the same amount from every file. */
function leadingSilence(mix: Float32Array): number {
  const floor = fromDb(-70);
  for (let i = 0; i < mix.length; i++) if (Math.abs(mix[i]!) > floor) return Math.max(0, (i >> 1) - 480);
  return 0;
}

/** Shift (frames) of `b` against `a` that lines them up best, within ±200 ms, over the first 30 s. */
function alignment(a: Float32Array, b: Float32Array): number {
  const dec = 10;
  const len = Math.min(a.length, b.length, 30 * SR * 2) >> 1;
  const n = Math.floor(len / dec);
  const ma = new Float64Array(n);
  const mb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sa = 0;
    let sb = 0;
    for (let j = 0; j < dec; j++) {
      const k = (i * dec + j) * 2;
      sa += a[k]! + a[k + 1]!;
      sb += b[k]! + b[k + 1]!;
    }
    ma[i] = sa;
    mb[i] = sb;
  }
  const maxLag = Math.round((0.2 * SR) / dec);
  let best = -Infinity;
  let arg = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = Math.max(0, -lag); i < n && i + lag < n; i++) s += ma[i]! * mb[i + lag]!;
    if (s > best) {
      best = s;
      arg = lag;
    }
  }
  return arg * dec;
}

function shift(audio: Float32Array, frames: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = audio[i + frames * 2] ?? 0;
  return out;
}

const fmtDb = (d: number): string => `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`;

async function importTrack(
  id: string,
  dir: string,
  opts: Options,
  override: TrackOverride | undefined,
  hash: string,
  rubberband: boolean,
): Promise<{ entry: ManifestTrack | ManifestStinger; report: Report }> {
  const r: Report = { lines: [], warnings: [] };
  const spec = trackSpec(id);
  if (!spec)
    warn(r, `${id} is not in the brief's track list; it plays only if a later version of the game knows it`);
  const notes = readNotes(dir);
  const files = audioFiles(dir);
  const fullFile =
    files.find((f) => /^full\.[a-z0-9]+$/i.test(f.replace(/^.*[\\/]/, ''))) ??
    files.find((f) => isFullMixName(f.replace(/^.*[\\/]/, '')));
  const stemFiles = files.filter((f) => f !== fullFile);
  r.lines.push(`source: ${dir}`);
  r.lines.push(`files: ${files.map((f) => relative(dir, f)).join(', ')}`);
  if (!fullFile) warn(r, 'no full mix (full.wav); summed the stems instead');

  // Decode the mix and trim leading digital silence.
  let mix = fullFile ? await decode(fullFile) : null;
  const trim = mix ? leadingSilence(mix) : 0;
  if (mix && trim) mix = mix.subarray(trim * 2);
  const today = new Date().toISOString().slice(0, 10);

  if (spec?.kind === 'stinger') return stinger(id, dir, mix, notes, hash, opts, r, today);

  // Stems: measure, map, and sum into layers.
  const mixAct = mix ? activity(mix, SR) : null;
  const length = mix ? mix.length : 0;
  const layers = new Map<MusicLayer, Float32Array>();
  const stems: Record<string, string> = {};
  let vocals: Float32Array | null = null;
  let total = length;
  const stemRows: string[] = [];
  const drumsPitch: { name: string; p: number }[] = [];
  const kept: {
    base: string;
    name: string;
    layer: MusicLayer;
    audio: Float32Array;
    active: number;
    override: boolean;
  }[] = [];
  for (const f of stemFiles) {
    const base = relative(dir, f);
    const name = normalizeStemName(f, spec ? undefined : undefined);
    const mapping: StemMapping | { target: 'drop'; keyword: 'override' } = mapStem(name, override);
    let audio = await decode(f);
    if (trim) audio = audio.subarray(trim * 2);
    if (!total) total = audio.length;
    if (mix && Math.abs(audio.length - mix.length) > 0.05 * SR * 2)
      warn(
        r,
        `${base} is ${round((audio.length - mix.length) / 2 / SR, 2)} s longer than the mix; padded or cut to fit`,
      );
    const act: Activity = activity(audio, SR, mixAct?.loudDb);
    const rel = mixAct ? act.loudDb - mixAct.loudDb : 0;
    const level = `loud end ${act.loudDb.toFixed(1)} dBFS (${fmtDb(rel)} vs mix), peak ${act.peakDb.toFixed(1)}, active ${Math.round(act.active * 100)}%`;
    if (mapping.target === 'full') {
      stems[base] = 'ignored: full mix';
      stemRows.push(`  ${base.padEnd(28)} ignored (looks like a full mix)`);
      continue;
    }
    if (mapping.target === 'drop') {
      stems[base] = 'dropped: override';
      stemRows.push(`  ${base.padEnd(28)} dropped by overrides.json; ${level}`);
      continue;
    }
    if (mixAct && isSilent(act, mixAct.loudDb)) {
      stems[base] = 'dropped: silent';
      stemRows.push(`  ${base.padEnd(28)} dropped, silent; ${level}`);
      continue;
    }
    const fitted = shift(audio, 0, length || audio.length);
    if (mapping.target === 'vocal') {
      stems[base] = 'dropped: vocal';
      stemRows.push(`  ${base.padEnd(28)} dropped, vocal; ${level}`);
      warn(
        r,
        `vocal stem ${base} has sound in it (${level}); listen to it, and pick another take if it sings`,
      );
      if (!vocals) vocals = new Float32Array(fitted.length);
      mixInto(vocals, fitted);
      continue;
    }
    const layer = mapping.target;
    if (!mapping.keyword) warn(r, `${base} matched no keyword; put it in harmony, check it`);
    stems[base] = layer;
    let extra = '';
    if (layer === 'drums') {
      const p = pitchiness(chromagram(toMono(fitted), 8192));
      drumsPitch.push({ name: base, p });
      extra = `, pitchiness ${p.toFixed(1)}`;
    }
    stemRows.push(
      `  ${base.padEnd(28)} -> ${layer}${mapping.keyword ? ` (${mapping.keyword})` : ''}; ${level}${extra}`,
    );
    kept.push({
      base,
      name,
      layer,
      audio: fitted,
      active: act.active,
      override: mapping.keyword === 'override',
    });
  }
  r.lines.push('stems:', ...stemRows);
  for (const d of drumsPitch)
    if (d.p > PITCHED_PERCUSSION)
      warn(
        r,
        `pitched percussion in ${d.name} (pitchiness ${d.p.toFixed(1)}), check whether this is the melody`,
      );
  // No lead from the keywords: promote the harmony stem that carries a line through the song.
  if (kept.length && !kept.some((k) => k.layer === 'lead')) {
    const harmony = kept.filter((k) => k.layer === 'harmony' && !k.override);
    const pick = pickLead(
      harmony.map((h) => ({ name: h.base, active: h.active, register: register(toMono(h.audio)) })),
    );
    const chosen = kept.find((k) => k.base === pick);
    if (chosen) {
      chosen.layer = 'lead';
      stems[chosen.base] = 'lead';
      warn(
        r,
        `no stem is a lead by name; made ${chosen.base} the lead (it plays most of the song and sits highest). ` +
          `Check by ear and pin it in overrides.json ("${chosen.name}": "lead" or "harmony")`,
      );
    } else warn(r, 'no lead layer: nothing carries the tune, so the melody dip does nothing');
  }
  for (const k of kept) {
    const sum = layers.get(k.layer) ?? new Float32Array(k.audio.length);
    mixInto(sum, k.audio);
    layers.set(k.layer, sum);
  }
  kept.length = 0;

  // The instrumental sum, aligned with the mix.
  let inst: Float32Array | null = null;
  if (layers.size) {
    inst = new Float32Array(total);
    for (const l of layers.values()) mixInto(inst, l);
  }
  if (mix && inst) {
    const lag = alignment(mix, inst);
    if (Math.abs(lag) > SR / 1000) {
      for (const [k, v] of layers) layers.set(k, shift(v, lag, mix.length));
      if (vocals) vocals = shift(vocals, lag, mix.length);
      inst = shift(inst, lag, mix.length);
      (Math.abs(lag) > 0.02 * SR ? (w: string) => warn(r, w) : (w: string) => r.lines.push(w))(
        `stems shifted ${round((lag / SR) * 1000, 1)} ms to line up with the mix`,
      );
    }
  }

  // Sum check and vocals (brief 7.4, playtest F5).
  let reference: Float32Array;
  if (mix && inst) {
    const vc = vocalCheck(mix, inst, vocals);
    r.lines.push(
      `sum check: mix minus stems ${fmtDb(vc.residualDb)}` +
        (vocals
          ? `, ${fmtDb(vc.residualWithVocalsDb)} with the vocal stems; vocals ${fmtDb(vc.vocalsDb)} vs mix`
          : ''),
    );
    if (vc.residualDb > -6)
      warn(r, `sum check ${fmtDb(vc.residualDb)}: a stem is probably missing or from another take`);
    else if (vc.residualDb > -12)
      warn(r, `sum check ${fmtDb(vc.residualDb)}: stems don't quite add up to the mix`);
    const envCorr = envelopeCorrelation(mix, inst);
    r.lines.push(`envelope correlation ${envCorr.toFixed(3)}`);
    if (envCorr < 0.95)
      warn(r, `envelope correlation ${envCorr.toFixed(2)}: a stem may come from a different take`);
    if (vc.audible) {
      warn(
        r,
        'the full mix has audible vocals: built the layers and measured loudness from the instrumental stems only',
      );
      reference = inst;
    } else {
      r.lines.push('vocals: none audible in the full mix');
      reference = mix;
    }
  } else if (inst) reference = inst;
  else if (mix) reference = mix;
  else throw new Error(`${id}: no audio files`);

  // Tempo (brief 7.5): beat-track the drums, else the mix.
  const target = override?.bpm ?? spec?.bpm;
  const drums = layers.get('drums');
  const tempoSource = drums ?? reference;
  const g0 = beatGrid(toMono(tempoSource), target);
  const tempo = target
    ? conformTempo(g0.bpm, target)
    : { bpm: round(g0.bpm, 2), stretch: null, warning: null };
  r.lines.push(
    `tempo: detected ${g0.bpm.toFixed(2)} BPM from the ${drums ? 'drums' : 'mix'}${target ? `, target ${target}` : ''}`,
  );
  if (tempo.warning) warn(r, tempo.warning);
  if (tempo.stretch) {
    if (!rubberband)
      warn(r, 'ffmpeg has no rubberband filter; stretched with atempo, which smears drums a little');
    r.lines.push(`conformed to ${tempo.bpm} BPM (time-stretch x${tempo.stretch.toFixed(4)})`);
    for (const [k, v] of layers) layers.set(k, await stretch(v, tempo.stretch, rubberband));
    reference = await stretch(reference, tempo.stretch, rubberband);
  }
  // The final beat grid on the stretched audio.
  const gridSource = layers.get('drums') ?? reference;
  const grid = beatGrid(toMono(gridSource), tempo.bpm, tempo.bpm);
  if (g0.driftMs > 30)
    warn(r, `tempo drift: beats stray up to ${Math.round(g0.driftMs)} ms from a steady grid`);
  if (grid.phaseClarity < 1.2)
    warn(
      r,
      `beat phase is unclear (as much low end on the off-beats as on the beats, ${grid.phaseClarity.toFixed(2)}x); ` +
        'if bug drums sound off the beat, set "downbeat" in overrides.json',
    );
  const bpb = 4;
  const downbeatSource = layers.get('drums') ?? layers.get('bass') ?? reference;
  const tonal = new Float32Array(reference.length);
  for (const l of ['bass', 'harmony', 'lead'] as const) {
    const v = layers.get(l);
    if (v && (l !== 'lead' || !layers.has('harmony'))) mixInto(tonal, v);
  }
  const hasTonal = layers.has('bass') || layers.has('harmony');
  const downbeat =
    override?.downbeat ??
    findDownbeat(toMono(downbeatSource), grid, bpb, hasTonal ? toMono(tonal) : undefined);
  r.lines.push(
    `beat grid: ${tempo.bpm} BPM, first downbeat at ${downbeat.toFixed(3)} s, drift ${Math.round(g0.driftMs)} ms`,
  );

  // Key: bass plus harmony, without drums.
  const keySource = hasTonal ? tonal : reference;
  const detected = detectKey(chromaSum(chromagram(toMono(keySource), 4096)));
  const overrideKey = override?.key ? parseKey(override.key) : null;
  const key = decideKey(detected, spec?.key ?? null, overrideKey);
  r.lines.push(
    `key: detected ${keyName(detected)} (confidence ${detected.confidence.toFixed(2)}, ${detected.profile}; runner-up ${keyName(detected.runnerUp)} ${detected.runnerUp.confidence.toFixed(2)})` +
      (spec ? `, target ${keyName(spec.key)}` : '') +
      ` -> ${keyName(key.key)} (${key.source})`,
  );
  if (key.warning) warn(r, key.warning);

  // Loop (brief 7.6).
  const duration = reference.length / 2 / SR;
  let loopStart: number;
  let bars: number;
  let score: number;
  const barSec = (60 / tempo.bpm) * bpb;
  if (override?.loop) {
    loopStart = override.loop[0];
    bars = Math.round((override.loop[1] - loopStart) / barSec);
    score = 1;
  } else {
    const loop = findLoop(
      loopFeatures(toMono(reference)),
      { downbeat, period: 60 / tempo.bpm, beatsPerBar: bpb },
      duration,
    );
    ({ start: loopStart, bars, score } = loop);
    if (loop.warning) warn(r, loop.warning);
  }
  const s = Math.round(loopStart * SR);
  const e = s + Math.round(bars * barSec * SR);
  const x = Math.round((60 / tempo.bpm) * SR);
  r.lines.push(
    `loop: ${loopStart.toFixed(2)} s to ${(e / SR).toFixed(2)} s, ${bars} bars (${((e - s) / SR).toFixed(2)} s), seam score ${score.toFixed(3)}`,
  );

  // Loudness (brief 7.7): one gain for every layer, from the mix over the loop.
  const region = reference.subarray(s * 2, e * 2);
  const ld = await loudness(region);
  let gainDb = TARGET_LUFS - ld.lufs;
  const names = layers.size ? [...layers.keys()] : (['full'] as const);
  const sources = new Map<MusicLayer | 'full', Float32Array>(layers.size ? layers : [['full', reference]]);
  const baked = new Map<MusicLayer | 'full', Float32Array>();
  for (const n of names) baked.set(n, bakeLoop(sources.get(n)!, 2, s, e, x, curveFor(n)));
  const sum = new Float32Array((e - s) * 2);
  for (const b of baked.values()) mixInto(sum, b);
  const sumLd = await loudness(sum.map((v) => v * fromDb(gainDb)));
  if (sumLd.truePeak > PEAK_CEILING) {
    const cut = sumLd.truePeak - PEAK_CEILING;
    gainDb -= cut;
    r.lines.push(`gain lowered ${cut.toFixed(1)} dB to keep the true peak under ${PEAK_CEILING} dBTP`);
  }
  r.lines.push(
    `loudness: mix ${ld.lufs.toFixed(1)} LUFS over the loop, gain ${fmtDb(gainDb)} for every layer -> ${TARGET_LUFS} LUFS`,
  );

  // Bake and encode (brief 7.8, 7.9).
  const outDir = join(opts.out, id);
  rmSync(outDir, { recursive: true, force: true });
  const layerFiles: ManifestTrack['layers'] = {};
  const g = fromDb(gainDb);
  for (const n of names) {
    const body = baked.get(n)!;
    for (let i = 0; i < body.length; i++) body[i]! *= g;
    const seam = seamError(body, 2);
    const mono = n === 'bass';
    const data = mono ? toMono(body) : body;
    const padded = padLoop(data, mono ? 1 : 2, PAD);
    const file = join(outDir, `${n}.ogg`);
    await encode(padded, mono ? 1 : 2, BITRATE[n], file);
    layerFiles[n] = `${id}/${n}.ogg`;
    const layerLd = await loudness(body);
    r.lines.push(
      `  ${n.padEnd(8)} ${String(BITRATE[n]).padStart(3)} kb/s ${mono ? 'mono  ' : 'stereo'} ${Math.round(statSync(file).size / 1024)} KB, ` +
        `${layerLd.lufs.toFixed(1)} LUFS, true peak ${layerLd.truePeak.toFixed(1)} dBTP, sample peak ${dB(peak(body)).toFixed(1)}, rms ${dB(rms(body)).toFixed(1)}, seam ${seam.toFixed(2)}`,
    );
  }
  const entry: ManifestTrack = {
    ...(spec?.area ? { area: spec.area } : {}),
    phase: spec?.phase ?? 'always',
    bpm: tempo.bpm,
    bpmDetected: round(g0.bpm, 2),
    beatsPerBar: bpb,
    key: { tonic: key.key.tonic, mode: key.key.mode, confidence: key.confidence, source: key.source },
    scale: pentatonic(key.key.mode),
    loop: {
      samples: e - s,
      start: PAD,
      bars,
      sourceStart: round((s + (trim ?? 0)) / SR, 3),
      score: round(score, 3),
    },
    layers: layerFiles,
    stems,
    warnings: r.warnings,
    source: { hash, ...(notes.link ? { link: notes.link } : {}), importedAt: today },
  };
  return { entry, report: r };
}

/** Correlation of 1-second RMS envelopes of two stereo signals. */
function envelopeCorrelation(a: Float32Array, b: Float32Array): number {
  const n = Math.floor(Math.min(a.length, b.length) / 2 / SR);
  const ea: number[] = [];
  const eb: number[] = [];
  for (let i = 0; i < n; i++) {
    ea.push(rms(a, i * SR * 2, (i + 1) * SR * 2));
    eb.push(rms(b, i * SR * 2, (i + 1) * SR * 2));
  }
  const ma = ea.reduce((x, y) => x + y, 0) / n;
  const mb = eb.reduce((x, y) => x + y, 0) / n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    ab += (ea[i]! - ma) * (eb[i]! - mb);
    aa += (ea[i]! - ma) ** 2;
    bb += (eb[i]! - mb) ** 2;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/** The stinger's short path (brief 7.3): trim, fade out, normalize, encode. No loop or layers. */
async function stinger(
  id: string,
  _dir: string,
  mix: Float32Array | null,
  notes: Record<string, string>,
  _hash: string,
  opts: Options,
  r: Report,
  _today: string,
): Promise<{ entry: ManifestStinger; report: Report }> {
  if (!mix) throw new Error(`${id}: the stinger needs a full mix`);
  let audio = mix;
  const t = notes.trim ? /^(\d+):([\d.]+)-(\d+):([\d.]+)$/.exec(notes.trim) : null;
  if (t) {
    const a = Math.round((Number(t[1]) * 60 + Number(t[2])) * SR);
    const b = Math.round((Number(t[3]) * 60 + Number(t[4])) * SR);
    audio = audio.slice(a * 2, b * 2);
  }
  const floor = fromDb(-60);
  let first = 0;
  while (first < audio.length && Math.abs(audio[first]!) < floor) first++;
  let last = audio.length - 1;
  while (last > first && Math.abs(audio[last]!) < floor) last--;
  audio = audio.slice(first & ~1, (last | 1) + 1);
  const fade = Math.round(0.05 * SR);
  const frames = audio.length / 2;
  for (let i = 0; i < fade && i < frames; i++) {
    const g = i / fade;
    audio[(frames - 1 - i) * 2]! *= g;
    audio[(frames - 1 - i) * 2 + 1]! *= g;
  }
  const ld = await loudness(audio);
  let gainDb = STINGER_LUFS - ld.lufs;
  if (ld.truePeak + gainDb > PEAK_CEILING) gainDb = PEAK_CEILING - ld.truePeak;
  const g = fromDb(gainDb);
  for (let i = 0; i < audio.length; i++) audio[i]! *= g;
  const file = join(opts.out, id, 'full.ogg');
  rmSync(dirname(file), { recursive: true, force: true });
  await encode(audio, 2, 128, file);
  r.lines.push(`stinger: ${(frames / SR).toFixed(2)} s, gain ${fmtDb(gainDb)}`);
  return { entry: { kind: 'stinger', file: `${id}/full.ogg`, samples: frames }, report: r };
}

// --- Main ------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const manifestFile = join(opts.out, 'manifest.json');
  const manifest: MusicManifest = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as MusicManifest)
    : emptyManifest();
  const overrides: Record<string, TrackOverride> = existsSync(opts.overrides)
    ? (JSON.parse(readFileSync(opts.overrides, 'utf8')) as Record<string, TrackOverride>)
    : {};
  if (!existsSync(opts.src)) throw new Error(`no music folder at ${opts.src}`);
  const folders = readdirSync(opts.src)
    .filter((n) => !n.startsWith('.') && statSync(join(opts.src, n)).isDirectory() && /^[a-z0-9_]+$/.test(n))
    .sort();
  const ids = opts.ids.length ? opts.ids : folders;
  const rubberband = await hasFilter('rubberband');
  const report: string[] = [
    `Bugglebrook music import, ${new Date().toISOString()}`,
    `source ${opts.src}`,
    `output ${opts.out}`,
    `ffmpeg ${FFMPEG}${rubberband ? ' (with rubberband)' : ' (no rubberband: atempo)'}`,
    '',
  ];
  for (const id of ids) {
    const dir = join(opts.src, id);
    if (!existsSync(dir)) {
      report.push(`== ${id}`, `  no folder at ${dir}`, '');
      continue;
    }
    const files = audioFiles(dir);
    if (files.length === 0) {
      report.push(`== ${id}`, '  no audio files', '');
      continue;
    }
    const hash = sourceHash(files);
    const old = manifest.tracks[id];
    if (!opts.force && old && old.kind !== 'stinger' && old.source.hash === hash) {
      report.push(`== ${id}`, '  unchanged, skipped (use --force to reimport)', '');
      console.log(`${id}: unchanged`);
      continue;
    }
    console.log(`${id}: importing...`);
    const started = Date.now();
    const { entry, report: r } = await importTrack(id, dir, opts, overrides[id], hash, rubberband);
    manifest.tracks[id] = entry;
    report.push(`== ${id} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    for (const l of r.lines) report.push(`  ${l}`);
    report.push(r.warnings.length ? '  warnings:' : '  warnings: none');
    for (const w of r.warnings) report.push(`    - ${w}`);
    report.push('');
  }
  // Keep the manifest's track order stable.
  manifest.tracks = Object.fromEntries(
    Object.entries(manifest.tracks).sort(([a], [b]) => a.localeCompare(b)),
  );
  const errors = manifestErrors(manifest);
  if (errors.length) throw new Error(`the manifest failed its check:\n${errors.join('\n')}`);
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  let bytes = 0;
  for (const id of Object.keys(manifest.tracks)) {
    const d = join(opts.out, id);
    if (existsSync(d)) for (const f of readdirSync(d)) bytes += statSync(join(d, f)).size;
  }
  report.push(
    `total built music: ${(bytes / 1024 / 1024).toFixed(2)} MB in ${Object.keys(manifest.tracks).length} tracks`,
  );
  const text = report.join('\n') + '\n';
  mkdirSync(dirname(opts.report), { recursive: true });
  writeFileSync(opts.report, text);
  console.log('\n' + text);
  void MUSIC_LAYERS;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
