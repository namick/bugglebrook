// pnpm sfx:import [folder ...] [--force] [--voices] [--src <dir>] [--out <dir>]
//
// Turns the owner's downloaded sound effects (assets/sfx/<folder>/ plus
// source.txt) into trimmed, loudness-matched Ogg Opus takes, a manifest,
// and the credits the game plays and shows (docs/08-sound-brief.md, part 6).
// With `--voices`, also builds the artist's voice bank from
// assets/voices/her/. A developer tool: CI never runs it, and its outputs
// in src/renderer/public/sfx/ are committed.
//
// Needs ffmpeg with libopus on the PATH, or set FFMPEG to its path. `--src`
// reads the raw files from another folder (for example the main checkout
// when you work in a git worktree).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode as encodeOpus, floats, run } from '../music/ffmpeg.ts';
import type { Audio } from './analysis.ts';
import { SR } from './analysis.ts';
import type { ImportOptions } from './pipeline.ts';
import { importSfx, writeReport } from './pipeline.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv: string[]): ImportOptions & { report: string } {
  const src = process.env.BB_SFX_SRC ?? join(ROOT, 'assets/sfx');
  const o = {
    src,
    out: join(ROOT, 'src/renderer/public/sfx'),
    report: join(ROOT, 'assets/sfx/import-report.txt'),
    folders: [] as string[],
    force: false,
    voices: null as string | null,
    publicRepo: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--force') o.force = true;
    else if (a === '--voices') o.voices = join(ROOT, 'assets/voices/her');
    else if (a === '--src') o.src = resolve(argv[++i]!);
    else if (a === '--out') o.out = resolve(argv[++i]!);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.folders.push(a);
  }
  // The repo's privacy decides which licenses are allowed (part 5.3).
  const config = join(ROOT, 'assets/sfx/config.json');
  if (existsSync(config))
    o.publicRepo =
      (JSON.parse(readFileSync(config, 'utf8')) as { publicRepo?: boolean }).publicRepo !== false;
  return o;
}

/** Decode to 48 kHz float, keeping mono files mono. */
async function decode(file: string): Promise<Audio> {
  const probe = await run(['-i', file, '-f', 'null', '-t', '0', '-']).catch((e: unknown) => ({
    out: Buffer.alloc(0),
    err: String(e),
  }));
  const channels = /Audio:.*\b(mono)\b/.test(probe.err) ? 1 : 2;
  const { out } = await run([
    '-i',
    file,
    '-f',
    'f32le',
    '-ac',
    String(channels),
    '-ar',
    String(SR),
    'pipe:1',
  ]);
  return { data: floats(out), channels };
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  console.log(
    `Importing sounds from ${o.src}${o.publicRepo ? ' (public repo: repo-safe licenses only)' : ''}`,
  );
  const result = await importSfx(o, {
    decode,
    encode: (audio, kbps, file) => encodeOpus(audio.data, audio.channels, kbps, file),
  });
  writeReport(o.report, result.report);
  for (const line of result.report) console.log(line);
  console.log(`\nReport: ${o.report}`);
  if (Object.keys(result.failed).length) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
