// The WebAudio side of the background music (docs/05-music-brief.md section
// 7.11): fetch and decode a track's layers, play them as looping buffer
// sources started together, and ramp layer and track gains. `MusicEngine`
// decides what plays; this only does as it is told. `NullMusicSink` does
// nothing and keeps time with the wall clock, for tests and when WebAudio
// is missing.

import type { MusicLayer } from '../../../shared/music';
import { MUSIC_SAMPLE_RATE } from '../../../shared/music';

export type LayerName = MusicLayer | 'full';

export interface LoopSpec {
  /** Where the loop body starts in each file, in samples. */
  start: number;
  /** The loop body's length in samples. */
  samples: number;
}

export type FadeCurve = 'in' | 'out' | 'linear';

/** Where the music goes. The engine talks to this, so tests can watch it without WebAudio. */
export interface MusicSink {
  /** The audio clock, seconds. */
  now(): number;
  /** Fetch and decode a track's layer files. Resolves when they are ready; rejects if one fails. */
  load(id: string, files: Partial<Record<LayerName, string>>): Promise<void>;
  isLoaded(id: string): boolean;
  /** Forget a decoded track (it can be loaded again). */
  unload(id: string): void;
  /**
   * Start a loaded track's layers together at `when`, `offset` seconds into
   * the loop body, at the given gains. Returns a voice handle.
   */
  start(
    id: string,
    loop: LoopSpec,
    when: number,
    offset: number,
    gains: Partial<Record<LayerName, number>>,
    track: number,
  ): number;
  /** Ramp one layer of a voice to `gain`, starting at `at`, over `seconds`. */
  setLayer(voice: number, layer: LayerName, gain: number, at: number, seconds: number): void;
  /** Ramp a voice's track gain, with an equal-power curve for crossfades. */
  setTrack(voice: number, gain: number, at: number, seconds: number, curve?: FadeCurve): void;
  stop(voice: number, at: number): void;
  /** The music bus low-pass, or null to open it up, over `seconds`. */
  setLowpass(hz: number | null, seconds: number): void;
}

/** Plays nothing; tracks are always "loaded". Time runs on the wall clock. */
export class NullMusicSink implements MusicSink {
  private voices = 0;
  private readonly loaded = new Set<string>();
  constructor(private readonly clock: () => number = () => performance.now() / 1000) {}
  now(): number {
    return this.clock();
  }
  load(id: string): Promise<void> {
    this.loaded.add(id);
    return Promise.resolve();
  }
  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }
  unload(id: string): void {
    this.loaded.delete(id);
  }
  start(): number {
    return ++this.voices;
  }
  setLayer(): void {}
  setTrack(): void {}
  stop(): void {}
  setLowpass(): void {}
}

/** Fetch a file's bytes by URL. Electron's `file://` pages may refuse fetch, so fall back to XHR. */
export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.arrayBuffer();
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (typeof XMLHttpRequest === 'undefined') throw err;
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () =>
        // file:// answers with status 0.
        xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)
          ? resolve(xhr.response as ArrayBuffer)
          : reject(new Error(`HTTP ${xhr.status}`));
      xhr.onerror = () => reject(new Error(`could not load ${url}`));
      xhr.send();
    });
  }
}

/** Fetch and parse a JSON file by URL. */
export async function fetchJson(url: string): Promise<unknown> {
  const bytes = await fetchBytes(url);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

interface Voice {
  sources: AudioBufferSourceNode[];
  layers: Map<LayerName, GainNode>;
  track: GainNode;
}

/** Equal-power fade curves, 32 points. */
function curve(kind: 'in' | 'out', from: number, to: number): Float32Array {
  const n = 32;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const w = kind === 'in' ? Math.sin((p * Math.PI) / 2) : Math.cos((p * Math.PI) / 2);
    out[i] = kind === 'in' ? from + (to - from) * w : to + (from - to) * w;
  }
  return out;
}

/**
 * WebAudio playback into the music bus. One `AudioBufferSourceNode` per
 * layer with `loop` on and `loopStart`/`loopEnd` from the manifest (never the
 * decoded length: Opus pads), all started at the same `when`. Layer gains
 * feed a track gain, which feeds a low-pass, then the music bus.
 */
export class WebAudioMusicSink implements MusicSink {
  private readonly decoded = new Map<string, Map<LayerName, AudioBuffer>>();
  private readonly voices = new Map<number, Voice>();
  private next = 0;
  private readonly filter: BiquadFilterNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    bus: AudioNode,
    private readonly base = 'music/',
  ) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.5;
    this.filter.connect(bus);
  }

  now(): number {
    return this.ctx.currentTime;
  }

  async load(id: string, files: Partial<Record<LayerName, string>>): Promise<void> {
    if (this.decoded.has(id)) return;
    const entries = Object.entries(files) as [LayerName, string][];
    const buffers = await Promise.all(
      entries.map(async ([layer, file]) => {
        const bytes = await fetchBytes(this.base + file);
        return [layer, await this.ctx.decodeAudioData(bytes)] as const;
      }),
    );
    this.decoded.set(id, new Map(buffers));
  }

  isLoaded(id: string): boolean {
    return this.decoded.has(id);
  }

  unload(id: string): void {
    this.decoded.delete(id);
  }

  start(
    id: string,
    loop: LoopSpec,
    when: number,
    offset: number,
    gains: Partial<Record<LayerName, number>>,
    trackGain: number,
  ): number {
    const buffers = this.decoded.get(id);
    const handle = ++this.next;
    const track = this.ctx.createGain();
    track.gain.setValueAtTime(trackGain, Math.max(this.ctx.currentTime, 0));
    track.connect(this.filter);
    const voice: Voice = { sources: [], layers: new Map(), track };
    const rate = MUSIC_SAMPLE_RATE;
    const loopStart = loop.start / rate;
    const loopEnd = (loop.start + loop.samples) / rate;
    const into =
      loopStart + (((offset % (loop.samples / rate)) + loop.samples / rate) % (loop.samples / rate));
    for (const [layer, buffer] of buffers ?? []) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = loopStart;
      src.loopEnd = Math.min(loopEnd, buffer.duration);
      const g = this.ctx.createGain();
      g.gain.value = gains[layer] ?? 0;
      src.connect(g);
      g.connect(track);
      src.start(Math.max(when, this.ctx.currentTime), into);
      voice.sources.push(src);
      voice.layers.set(layer, g);
    }
    this.voices.set(handle, voice);
    return handle;
  }

  setLayer(handle: number, layer: LayerName, gain: number, at: number, seconds: number): void {
    const g = this.voices.get(handle)?.layers.get(layer);
    if (g) this.ramp(g.gain, gain, at, seconds, 'linear');
  }

  setTrack(handle: number, gain: number, at: number, seconds: number, kind: FadeCurve = 'linear'): void {
    const g = this.voices.get(handle)?.track;
    if (g) this.ramp(g.gain, gain, at, seconds, kind);
  }

  stop(handle: number, at: number): void {
    const v = this.voices.get(handle);
    if (!v) return;
    this.voices.delete(handle);
    const t = Math.max(at, this.ctx.currentTime);
    for (const s of v.sources) {
      s.onended = () => s.disconnect();
      s.stop(t);
    }
    // Let go of the gains once the sources have stopped.
    const first = v.sources[0];
    if (first) first.addEventListener('ended', () => v.track.disconnect());
    else v.track.disconnect();
  }

  setLowpass(hz: number | null, seconds: number): void {
    this.ramp(this.filter.frequency, hz ?? 20000, this.ctx.currentTime, Math.max(0.02, seconds), 'exp');
  }

  /**
   * Ramp a parameter from where it is at `at` to `to`. Anything scheduled
   * after `at` is dropped first (held where it had got to), so a new ramp
   * never overlaps an old fade curve.
   */
  private ramp(p: AudioParam, to: number, at: number, seconds: number, kind: FadeCurve | 'exp'): void {
    const t = Math.max(at, this.ctx.currentTime);
    const len = Math.max(0.01, seconds);
    try {
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
      }
      const from = p.value;
      if (kind === 'in' || kind === 'out') p.setValueCurveAtTime(curve(kind, from, to), t + 0.001, len);
      else if (kind === 'exp') p.exponentialRampToValueAtTime(Math.max(1, to), t + len);
      else p.linearRampToValueAtTime(to, t + len);
    } catch {
      // A clash in the automation timeline: jump there rather than break the music.
      p.cancelScheduledValues(0);
      p.value = to;
    }
  }
}
