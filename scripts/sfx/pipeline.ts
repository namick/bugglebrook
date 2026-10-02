// The sound importer's steps (docs/08-sound-brief.md, part 6.3), with the
// decoder and encoder handed in: the CLI (import.ts) passes ffmpeg, and the
// unit tests pass a WAV reader and a plain writer, so the whole import runs
// in CI without ffmpeg or real samples.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  CatalogEntry,
  SfxManifest,
  SfxSound,
  SoundCredit,
  SoundCredits,
  VoiceClip,
} from '../../src/shared/sfx.ts';
import {
  CATEGORY_LUFS,
  SFX_ALIASES,
  SFX_CATALOG,
  SYNTH_ONLY,
  VOICE_FILES,
  creditText,
  emptySfxManifest,
  nearestFolder,
  sfxManifestErrors,
} from '../../src/shared/sfx.ts';
import type { Audio } from './analysis.ts';
import {
  SR,
  bakeBed,
  capLength,
  clean,
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
} from './analysis.ts';
import type { SourceBlock } from './source.ts';
import { blockFor, blockProblems, needsCredit, parseSource } from './source.ts';

/** Bump when the processing changes, so every folder imports again. */
export const PIPELINE_VERSION = 1;
export const AUDIO_EXT = /\.(wav|flac|mp3|ogg)$/i;
/** Most takes kept per folder, and clips per voice file. */
export const MAX_TAKES = 12;
export const MAX_CLIPS = 24;
export const MAX_BABBLE = 60;
/** The built folder's hard cap (part 6.7). */
export const SIZE_CAP = 15 * 1024 * 1024;

export interface ImportDeps {
  /** Decode any audio file to 48 kHz float, one or two channels. */
  decode(file: string): Promise<Audio>;
  /** Encode Ogg Opus at `kbps` to `file`. */
  encode(audio: Audio, kbps: number, file: string): Promise<void>;
}

export interface ImportOptions {
  /** `assets/sfx`. */
  src: string;
  /** `src/renderer/public/sfx`. */
  out: string;
  /** Only these folders (all changed ones when empty). */
  folders: string[];
  force: boolean;
  /** Also build her voice bank from this folder (`assets/voices/her`), if given. */
  voices: string | null;
  /** The repo is public: only repo-safe licenses (part 5.3). */
  publicRepo: boolean;
}

export interface ImportResult {
  manifest: SfxManifest;
  credits: SoundCredits;
  report: string[];
  /** Folders that failed, with why. */
  failed: Record<string, string[]>;
}

const sha = (parts: (string | Buffer)[]): string => {
  const h = createHash('sha1');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 16);
};

const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;

function readManifest(out: string): SfxManifest {
  const f = join(out, 'manifest.json');
  if (!existsSync(f)) return emptySfxManifest();
  const data = JSON.parse(readFileSync(f, 'utf8')) as unknown;
  return sfxManifestErrors(data).length === 0 ? (data as SfxManifest) : emptySfxManifest();
}

function listAudio(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.') && AUDIO_EXT.test(n) && statSync(join(dir, n)).isFile())
    .sort();
}

function sourceBlocks(dir: string): { blocks: SourceBlock[]; errors: string[] } {
  const f = join(dir, 'source.txt');
  if (!existsSync(f)) return { blocks: [], errors: ['no source.txt'] };
  return parseSource(readFileSync(f, 'utf8'));
}

/** Two identical channels are one. */
function squash(a: Audio): Audio {
  if (a.channels !== 2) return a;
  for (let i = 0; i < a.data.length; i += 2) if (Math.abs(a.data[i]! - a.data[i + 1]!) > 1e-6) return a;
  return { data: a.data.filter((_, i) => i % 2 === 0), channels: 1 };
}

/** Run the import. Writes the built files, `manifest.json`, `credits.json`, and `THIRD-PARTY-SOUNDS.txt`. */
export async function importSfx(o: ImportOptions, deps: ImportDeps): Promise<ImportResult> {
  const manifest = readManifest(o.out);
  const report: string[] = [];
  const failed: Record<string, string[]> = {};
  const present = existsSync(o.src)
    ? readdirSync(o.src).filter((n) => !n.startsWith('.') && statSync(join(o.src, n)).isDirectory())
    : [];
  // A folder deleted from assets/sfx goes back to the synth.
  for (const name of Object.keys(manifest.sounds))
    if (existsSync(o.src) && !present.includes(name)) {
      delete manifest.sounds[name];
      rmSync(join(o.out, name), { recursive: true, force: true });
      report.push(`${name}: folder gone, back to the synth`);
    }
  const wanted = o.folders.length > 0 ? o.folders : present;
  for (const folder of wanted) {
    const lines = await importFolder(folder, o, deps, manifest).catch((err: unknown) => {
      return { errors: [String(err instanceof Error ? err.message : err)], lines: [] as string[] };
    });
    if (lines.errors.length) {
      failed[folder] = lines.errors;
      if (manifest.sounds[folder] && SFX_CATALOG[folder]) {
        delete manifest.sounds[folder];
        rmSync(join(o.out, folder), { recursive: true, force: true });
      }
      report.push(`${folder}: FAILED, stays synthesized`, ...lines.errors.map((e) => `  ${e}`));
    } else report.push(...lines.lines);
  }
  if (o.voices) report.push(...(await importVoices(o.voices, o, deps, manifest)));
  const credits = buildCredits(o.src, manifest);
  mkdirSync(o.out, { recursive: true });
  writeFileSync(join(o.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(o.out, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
  writeFileSync(join(o.out, 'THIRD-PARTY-SOUNDS.txt'), thirdParty(credits));
  report.push('', ...summary(o, manifest));
  return { manifest, credits, report, failed };
}

async function importFolder(
  folder: string,
  o: ImportOptions,
  deps: ImportDeps,
  manifest: SfxManifest,
): Promise<{ errors: string[]; lines: string[] }> {
  const entry = SFX_CATALOG[folder];
  if (!entry)
    return {
      errors: [`"${folder}" is not a sound folder. Did you mean "${nearestFolder(folder)}"?`],
      lines: [],
    };
  const dir = join(o.src, folder);
  const files = listAudio(dir);
  if (files.length === 0) {
    if (readdirSync(dir).some((n) => /\.zip$/i.test(n)))
      return { errors: ['only a ZIP: unzip it into the folder'], lines: [] };
    // A fresh clone has source.txt but not the raw downloads: keep what was built.
    return { errors: [], lines: [`${folder}: no raw files here, kept as built`] };
  }
  const { blocks, errors } = sourceBlocks(dir);
  const problems = [...errors];
  for (const f of files) problems.push(...blockProblems(blockFor(blocks, f), f, o.publicRepo));
  if (problems.length) return { errors: problems, lines: [] };
  const hash = sha([
    String(PIPELINE_VERSION),
    JSON.stringify(entry),
    readFileSync(join(dir, 'source.txt')),
    ...files.flatMap((f) => [f, readFileSync(join(dir, f))]),
  ]);
  if (!o.force && manifest.sounds[folder]?.hash === hash)
    return { errors: [], lines: [`${folder}: unchanged`] };
  const lines: string[] = [];
  const warn = (w: string): number => lines.push(`  warning: ${w}`);
  const pieces: { audio: Audio; from: string }[] = [];
  for (const f of files) {
    const block = blockFor(blocks, f)!;
    let audio = squash(await deps.decode(join(dir, f)));
    if (block.trim)
      audio = slice(
        audio,
        Math.round(block.trim[0] * SR),
        Math.min(frames(audio), Math.round(block.trim[1] * SR)),
      );
    if (entry.kind === 'bed' || !block.split) pieces.push({ audio, from: f });
    else for (const [s, e] of splitAtSilence(audio)) pieces.push({ audio: slice(audio, s, e), from: f });
  }
  const sound: SfxSound =
    entry.kind === 'bed'
      ? await buildBed(folder, entry, pieces, o, deps, warn)
      : await buildOneShots(folder, entry, pieces, o, deps, warn);
  if (sound.takes.length === 0) return { errors: ['no usable takes after trimming'], lines };
  sound.hash = hash;
  manifest.sounds[folder] = sound;
  const lic = [...new Set(files.map((f) => blockFor(blocks, f)!.license))].join(', ');
  return {
    errors: [],
    lines: [
      `${folder}: ${sound.takes.length} take(s), ${sound.takes.map((t) => `${round(t.dur)}s`).join(' ')} [${lic}]`,
      ...lines,
    ],
  };
}

async function buildOneShots(
  folder: string,
  entry: CatalogEntry,
  pieces: { audio: Audio; from: string }[],
  o: ImportOptions,
  deps: ImportDeps,
  warn: (w: string) => void,
): Promise<SfxSound> {
  const target = CATEGORY_LUFS[entry.category];
  const takes: Audio[] = [];
  for (const p of pieces) {
    const trimmed = trimSilence(clean(p.audio, false));
    if (frames(trimmed) < 0.04 * SR) continue;
    const { audio: capped, cut } = capLength(trimmed, entry.maxSec);
    if (cut) warn(`a take from ${p.from} ran past ${entry.maxSec}s and was faded out`);
    const { audio: m, channel } = foldMono(capped);
    if (channel !== 'sum') warn(`a take from ${p.from} cancels when folded to mono: used channel ${channel}`);
    const n = normalize(m, target, maxMomentary);
    if (n.short) warn(`a take from ${p.from} peaks before ${target} LUFS: left at ${round(n.lufs, 1)}`);
    takes.push(n.audio);
  }
  const keep = pickTakes(takes.map(frames), MAX_TAKES);
  if (takes.length > keep.length)
    warn(`${takes.length} takes; kept ${keep.length} nearest the median length`);
  rmSync(join(o.out, folder), { recursive: true, force: true });
  const out: SfxSound = { kind: 'oneshot', category: entry.category, takes: [] };
  for (const [n, i] of keep.entries()) {
    const file = `${folder}/${n}.ogg`;
    await deps.encode(takes[i]!, entry.kbps, join(o.out, file));
    out.takes.push({ file, dur: round(frames(takes[i]!) / SR, 3) });
  }
  return out;
}

async function buildBed(
  folder: string,
  entry: CatalogEntry,
  pieces: { audio: Audio; from: string }[],
  o: ImportOptions,
  deps: ImportDeps,
  warn: (w: string) => void,
): Promise<SfxSound> {
  // The longest recording makes the loop.
  const src = pieces.reduce((a, b) => (frames(b.audio) > frames(a.audio) ? b : a));
  const audio = clean(src.audio, true);
  const [s, e] = steadiest(audio, 30, Math.min(90, entry.maxSec));
  if ((e - s) / SR < 30) warn(`only ${round((e - s) / SR, 1)}s to loop (30 to 90 wanted)`);
  const baked = bakeBed(audio, s, e);
  const body = slice(
    baked.audio,
    Math.round(baked.loopStart * SR),
    Math.round(baked.loopStart * SR) + (e - s),
  );
  const jump = seamJump(body);
  if (jump > 1.5) warn(`the loop's seam jumps ${round(jump, 1)} LU`);
  const target = CATEGORY_LUFS[entry.category] + (entry.lufsOffset ?? 0);
  const n = normalize(baked.audio, target, () => integrated(body));
  if (n.short) warn(`peaks before ${target} LUFS: left at ${round(n.lufs, 1)}`);
  rmSync(join(o.out, folder), { recursive: true, force: true });
  const file = `${folder}/0.ogg`;
  await deps.encode(n.audio, entry.kbps, join(o.out, file));
  return {
    kind: 'bed',
    category: entry.category,
    takes: [{ file, dur: round(baked.dur, 4), loopStart: round(baked.loopStart, 4) }],
  };
}

/** Her voice bank (part 6.3, step 12): bursts per mood, syllables from the babble, each with its pitch. */
async function importVoices(
  dir: string,
  o: ImportOptions,
  deps: ImportDeps,
  manifest: SfxManifest,
): Promise<string[]> {
  const lines: string[] = ['', 'voices:'];
  if (!existsSync(dir)) return [...lines, `  ${dir} not found`];
  const files = listAudio(dir);
  const { blocks, errors } = sourceBlocks(dir);
  const problems = [...errors, ...files.flatMap((f) => blockProblems(blockFor(blocks, f), f, o.publicRepo))];
  if (problems.length)
    return [...lines, '  FAILED, voices stay synthesized', ...problems.map((p) => `  ${p}`)];
  const target = CATEGORY_LUFS.voice;
  for (const f of files) {
    const emotion = f.replace(AUDIO_EXT, '').toLowerCase();
    if (!(VOICE_FILES as readonly string[]).includes(emotion)) {
      lines.push(`  ${f}: not a voice file (${VOICE_FILES.join(', ')})`);
      continue;
    }
    const audio = clean(squash(await deps.decode(join(dir, f))), false);
    const cuts = emotion === 'babble' ? syllables(audio) : splitAtSilence(audio, 0.25, -40, 0.08);
    const max = emotion === 'babble' ? MAX_BABBLE : MAX_CLIPS;
    rmSync(join(o.out, 'voices', emotion), { recursive: true, force: true });
    const clips: VoiceClip[] = [];
    for (const [s, e] of cuts.slice(0, max)) {
      const piece = trimSilence(slice(audio, s, e));
      if (frames(piece) < 0.06 * SR) continue;
      const { audio: m } = foldMono(piece);
      const n = normalize(m, target, maxMomentary);
      const file = `voices/${emotion}/${clips.length}.ogg`;
      await deps.encode(n.audio, 40, join(o.out, file));
      clips.push({ file, dur: round(frames(n.audio) / SR, 3), pitchHz: Math.round(medianPitch(n.audio)) });
    }
    manifest.voices[emotion] = clips;
    lines.push(
      `  ${emotion}: ${clips.length} clip(s)${cuts.length > max ? `, ${cuts.length - max} more dropped` : ''}`,
    );
  }
  return lines;
}

/** Credits from every built folder's `source.txt` (committed, so this works without the raw files). */
export function buildCredits(src: string, manifest: SfxManifest): SoundCredits {
  const credits: SoundCredit[] = [];
  const thanks = new Set<string>();
  for (const folder of Object.keys(manifest.sounds).sort()) {
    const dir = join(src, folder);
    if (!existsSync(join(dir, 'source.txt'))) continue;
    for (const b of sourceBlocks(dir).blocks) {
      if (!b.license || !b.author) continue;
      if (needsCredit(b.license))
        credits.push({
          title: b.title ?? b.file ?? folder,
          author: b.author,
          url: b.url ?? '',
          license: b.license as SoundCredit['license'],
          folder,
        });
      else if (b.license === 'cc0') thanks.add(b.author);
    }
  }
  const order = ['cc-by-4.0', 'cc-by-3.0', 'oga-by', 'zapsplat'];
  credits.sort(
    (a, b) => order.indexOf(a.license) - order.indexOf(b.license) || a.title.localeCompare(b.title),
  );
  return { credits, thanks: [...thanks].sort((a, b) => a.localeCompare(b)) };
}

export function thirdParty(c: SoundCredits): string {
  const lines = ['Bugglebrook: third-party sounds', ''];
  if (c.credits.length === 0 && c.thanks.length === 0)
    lines.push('Every sound in this build is made by the game itself.');
  for (const x of c.credits) lines.push(creditText(x));
  if (c.thanks.length) lines.push('', `With thanks for their CC0 sounds: ${c.thanks.join(', ')}.`);
  return lines.join('\n') + '\n';
}

function folderBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    n += statSync(p).isDirectory() ? folderBytes(p) : statSync(p).size;
  }
  return n;
}

function summary(o: ImportOptions, manifest: SfxManifest): string[] {
  const out: string[] = [];
  const ai: string[] = [];
  for (const folder of Object.keys(manifest.sounds)) {
    const dir = join(o.src, folder);
    if (!existsSync(join(dir, 'source.txt'))) continue;
    for (const b of sourceBlocks(dir).blocks)
      if (b.license === 'suno') ai.push(`${folder}: ${b.file ?? '(all)'}`);
  }
  out.push('AI content (Suno, part 5.4):', ...(ai.length ? ai.map((a) => `  ${a}`) : ['  none']));
  const sampled = (name: string): boolean => {
    const alias = SFX_ALIASES[name];
    if (manifest.sounds[name]) return true;
    if (!alias) return false;
    return alias.folder === 'impact_*'
      ? Object.keys(manifest.sounds).some((f) => f.startsWith('impact_'))
      : !!manifest.sounds[alias.folder];
  };
  const still = [...Object.keys(SFX_CATALOG), ...Object.keys(SFX_ALIASES)].filter((n) => !sampled(n));
  out.push(
    '',
    `Still synthesized: ${still.length} sound(s) that could have samples, plus ${SYNTH_ONLY.length} synth-only:`,
    `  ${still.join(', ')}`,
  );
  const bytes = folderBytes(o.out);
  out.push('', `Size: ${(bytes / 1024 / 1024).toFixed(2)} MB of ${SIZE_CAP / 1024 / 1024} MB.`);
  if (bytes > SIZE_CAP) out.push('  OVER THE CAP: trim beds or takes.');
  return out;
}

export function writeReport(file: string, lines: string[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lines.join('\n') + '\n');
}
