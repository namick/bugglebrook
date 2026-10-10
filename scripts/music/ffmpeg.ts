// ffmpeg for the music scripts: decode anything to 48 kHz stereo float,
// time-stretch, measure loudness, and encode Ogg Opus. Set FFMPEG to use a
// particular build.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SR } from './analysis.ts';

export const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

export function run(args: string[], input?: Float32Array): Promise<{ out: Buffer; err: string }> {
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

export function floats(buf: Buffer): Float32Array {
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer, 0, copy.byteLength >> 2);
}

/** Decode any audio file to 48 kHz interleaved stereo float. */
export async function decode(file: string): Promise<Float32Array> {
  const { out } = await run(['-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1']);
  return floats(out);
}

export const RAW_IN = (channels: number): string[] => [
  '-f',
  'f32le',
  '-ar',
  String(SR),
  '-ac',
  String(channels),
  '-i',
  'pipe:0',
];

/**
 * Time-stretch stereo audio by `tempo` (above 1 is faster) with rubberband, or atempo without it.
 * `crisp` is for drums: the default smears each hit, even at a 2 percent stretch.
 */
export async function stretch(
  audio: Float32Array,
  tempo: number,
  rubberband: boolean,
  crisp = false,
): Promise<Float32Array> {
  const filter = rubberband
    ? `rubberband=tempo=${tempo}:pitchq=quality:channels=together:transients=${crisp ? 'crisp' : 'mixed'}`
    : `atempo=${tempo}`;
  const { out } = await run(
    [...RAW_IN(2), '-af', filter, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1'],
    audio,
  );
  return floats(out);
}

/** Integrated loudness (LUFS) and true peak (dBTP) of stereo audio. */
export async function loudness(audio: Float32Array): Promise<{ lufs: number; truePeak: number }> {
  const res = await run([...RAW_IN(2), '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], audio);
  const summary = res.err.slice(res.err.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)?.[1] ?? NaN);
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1] ?? NaN);
  return { lufs: Number.isFinite(lufs) ? lufs : -70, truePeak: Number.isFinite(truePeak) ? truePeak : -70 };
}

export async function encode(
  audio: Float32Array,
  channels: number,
  kbps: number,
  file: string,
): Promise<void> {
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

export async function hasFilter(name: string): Promise<boolean> {
  const { out } = await run(['-filters']);
  return new RegExp(`\\s${name}\\s`).test(out.toString());
}
