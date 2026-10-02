// pnpm music:check [track_id ...] [--out <dir>]
//
// An offline listen-check of the built music (docs/05-music-brief.md
// section 7): decodes each track's committed layers, mixes the layer
// combinations the game uses (day, night, idle, rain, the player playing,
// each layer alone), and renders each across the loop's seam (the last 4 s
// of the loop, then the first 4 s) to WAV files you can listen to, by
// default in /tmp/bb-music-check. It prints each mix's loudness and peaks,
// and how big a jump the seam makes next to the rest of the loop.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestTrack, MusicLayer, MusicManifest } from '../../src/shared/music.ts';
import { MUSIC_LAYERS } from '../../src/shared/music.ts';
import { SR, dB, onsetEnvelope, peak, rms, toMono } from './analysis.ts';
import { decode, loudness, run } from './ffmpeg.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MUSIC = join(ROOT, 'src/renderer/public/music');
const SIDE = 4;

type Gains = Record<MusicLayer, number>;

/** The mixes to check: the rules of section 7.12 the game reaches most. */
const MIXES: Record<string, Gains & { lowpass?: number }> = {
  all: { drums: 1, bass: 1, harmony: 1, lead: 1 },
  day: { drums: 1, bass: 1, harmony: 1, lead: 0.85 },
  night: { drums: 0.6, bass: 0.9, harmony: 1, lead: 0.7 },
  idle: { drums: 0.6, bass: 1, harmony: 1, lead: 0.34 },
  rain: { drums: 0, bass: 1, harmony: 1, lead: 0.51, lowpass: 2000 },
  player: { drums: 1, bass: 1, harmony: 0.85, lead: 0.2125 },
  drums_only: { drums: 1, bass: 0, harmony: 0, lead: 0 },
  bass_only: { drums: 0, bass: 1, harmony: 0, lead: 0 },
  harmony_only: { drums: 0, bass: 0, harmony: 1, lead: 0 },
  lead_only: { drums: 0, bass: 0, harmony: 0, lead: 1 },
};

/** A decoded layer as stereo, its loop body cut out. */
async function body(file: string, t: ManifestTrack): Promise<Float32Array> {
  const all = await decode(file);
  return all.slice(t.loop.start * 2, (t.loop.start + t.loop.samples) * 2);
}

/** The end of the loop, then its start: what the player hears at the seam. */
function aroundSeam(b: Float32Array): Float32Array {
  const n = SIDE * SR * 2;
  const out = new Float32Array(n * 2);
  out.set(b.subarray(b.length - n), 0);
  out.set(b.subarray(0, n), n);
  return out;
}

/**
 * How much the seam stands out: onset strength in the 100 ms around the
 * seam, over the 99th percentile of onset strength in the rest of the
 * stretch. Under about 1 means the seam is no bigger a bump than the
 * music's own beats.
 */
function seamBump(stretch: Float32Array): number {
  const mono = toMono(stretch);
  const hop = 480;
  const env = onsetEnvelope(mono, hop, 2048);
  const seam = Math.round((SIDE * SR - 1024) / hop);
  let at = 0;
  for (let d = -5; d <= 5; d++) at = Math.max(at, env[seam + d] ?? 0);
  const rest = [...env].filter((_v, i) => Math.abs(i - seam) > 8).sort((a, b) => a - b);
  const p99 = rest[Math.floor(rest.length * 0.99)] ?? 1;
  return p99 > 0 ? at / p99 : 0;
}

async function writeWav(file: string, audio: Float32Array, lowpass?: number): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  await run(
    [
      '-f',
      'f32le',
      '-ar',
      String(SR),
      '-ac',
      '2',
      '-i',
      'pipe:0',
      ...(lowpass ? ['-af', `lowpass=f=${lowpass}`] : []),
      '-c:a',
      'pcm_s16le',
      '-y',
      file,
    ],
    audio,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let out = '/tmp/bb-music-check';
  const ids: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = resolve(args[++i]!);
    else ids.push(args[i]!);
  }
  const manifest = JSON.parse(readFileSync(join(MUSIC, 'manifest.json'), 'utf8')) as MusicManifest;
  for (const [id, t] of Object.entries(manifest.tracks)) {
    if (t.kind === 'stinger' || (ids.length && !ids.includes(id))) continue;
    console.log(
      `\n== ${id}: ${t.bpm} BPM, ${t.key.tonic} ${t.key.mode}, ${t.loop.bars} bars (${(t.loop.samples / SR).toFixed(1)} s)`,
    );
    const layers = new Map<MusicLayer, Float32Array>();
    for (const l of MUSIC_LAYERS) if (t.layers[l]) layers.set(l, await body(join(MUSIC, t.layers[l]), t));
    if (t.layers.full) layers.set('harmony', await body(join(MUSIC, t.layers.full), t));
    const len = Math.min(...[...layers.values()].map((b) => b.length));
    console.log('  mix            LUFS   true peak  sample peak    RMS   seam bump');
    for (const [name, mix] of Object.entries(MIXES)) {
      const sum = new Float32Array(len);
      let any = false;
      for (const [l, b] of layers) {
        const g = mix[l];
        if (g <= 0) continue;
        any = true;
        for (let i = 0; i < len; i++) sum[i]! += b[i]! * g;
      }
      if (!any) continue;
      const ld = await loudness(sum);
      const seam = aroundSeam(sum);
      await writeWav(join(out, id, `${name}.wav`), seam, mix.lowpass);
      console.log(
        `  ${name.padEnd(13)} ${ld.lufs.toFixed(1).padStart(6)} ${ld.truePeak.toFixed(1).padStart(9)} ${dB(peak(sum)).toFixed(1).padStart(11)} ${dB(rms(sum)).toFixed(1).padStart(8)} ${seamBump(seam).toFixed(2).padStart(9)}`,
      );
    }
  }
  console.log(`\nWAVs across each loop's seam are in ${out}/<track>/<mix>.wav`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
