// The WebAudio side of sound samples (docs/08-sound-brief.md, parts 6.4 and
// 6.5): fetch and decode files, play one-shots through gain, filters, and a
// stereo panner into the sfx or voice bus, and keep the ambience beds
// looping on their own bus (which feeds the sfx bus, so the SFX slider
// covers it). `SampleEngine` and `AmbiencePlayer` decide what plays; this
// only does as it is told. `NullSampleSink` decodes nothing and records.

import { fetchBytes } from './musicPlayer';

/** A recorded voice's texture per bug wave (part 4.3). */
export type Texture = 'clean' | 'soft' | 'grit' | 'buzz';

export interface SamplePlay {
  file: string;
  bus: 'sfx' | 'voice';
  /** Seconds from now. */
  delay: number;
  rate: number;
  /** Linear gain. */
  gain: number;
  /** -1 left to 1 right. */
  pan: number;
  lowpass?: number | null;
  bandpass?: number | null;
  /** Start this far into the file, seconds. */
  offset?: number;
  /** Play only this long, seconds (with a short fade). */
  duration?: number;
  /** Recorded voices: two vowel formants (peaking filters), a texture, vibrato on the rate, and tremolo. */
  formants?: readonly number[];
  texture?: Texture;
  vibrato?: { rate: number; depth: number };
  tremolo?: number;
}

export interface BedPlay {
  file: string;
  /** Where the loop's body starts and how long it is, seconds. */
  loopStart: number;
  loopDur: number;
}

export interface SampleSink {
  /** The audio clock, seconds. */
  now(): number;
  /** Fetch and decode a file. Rejects if it can't. */
  load(file: string): Promise<void>;
  ready(file: string): boolean;
  /** Forget a decoded file (a bed nobody hears). */
  evict(file: string): void;
  /** Start a one-shot; returns a handle for `stop`. */
  start(play: SamplePlay): number;
  /** Fade a playing one-shot out over `fade` seconds. */
  stop(handle: number, fade: number): void;
  /** Keep a bed looping at `gain`, ramping over `ramp` seconds; gain 0 stops it once quiet. */
  setBed(id: string, bed: BedPlay | null, gain: number, ramp: number): void;
  /** The ambience bus: its gain (dB) and a low-pass (Hz, or null for open), for ducking and pause. */
  setAmbienceBus(gainDb: number, lowpass: number | null, ramp: number): void;
}

/** Decodes nothing, plays nothing, and remembers what it was asked. For tests and for no WebAudio. */
export class NullSampleSink implements SampleSink {
  readonly played: (SamplePlay & { handle: number; at: number })[] = [];
  readonly stopped: number[] = [];
  readonly beds = new Map<string, { file: string | null; gain: number }>();
  bus = { gainDb: 0, lowpass: null as number | null };
  private loaded = new Set<string>();
  private handles = 0;
  private start0 = Date.now();

  /** `decodes`: pretend every file loads at once (tests); otherwise every load fails (no WebAudio). */
  constructor(readonly decodes = false) {}

  now(): number {
    return (Date.now() - this.start0) / 1000;
  }
  load(file: string): Promise<void> {
    if (!this.decodes) return Promise.reject(new Error('no audio'));
    this.loaded.add(file);
    return Promise.resolve();
  }
  ready(file: string): boolean {
    return this.loaded.has(file);
  }
  evict(file: string): void {
    this.loaded.delete(file);
  }
  start(play: SamplePlay): number {
    const handle = ++this.handles;
    this.played.push({ ...play, handle, at: this.now() });
    if (this.played.length > 100) this.played.shift();
    return handle;
  }
  stop(handle: number): void {
    this.stopped.push(handle);
    if (this.stopped.length > 100) this.stopped.shift();
  }
  setBed(id: string, bed: BedPlay | null, gain: number): void {
    if (gain <= 0 && !this.beds.has(id)) return;
    this.beds.set(id, { file: bed?.file ?? null, gain });
  }
  setAmbienceBus(gainDb: number, lowpass: number | null): void {
    this.bus = { gainDb, lowpass };
  }
}

interface Playing {
  src: AudioBufferSourceNode;
  env: GainNode;
  nodes: AudioNode[];
}

interface Bed {
  file: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  stopAt: number | null;
}

/** Shapes for the recorded voices' textures (part 4.3): a gentle waveshaper for grit. */
function gritCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  return curve;
}

export class WebAudioSampleSink implements SampleSink {
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private playing = new Map<number, Playing>();
  private handles = 0;
  private beds = new Map<string, Bed>();
  private readonly ambience: GainNode;
  private readonly ambienceFilter: BiquadFilterNode;
  private curve: Float32Array<ArrayBuffer> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly sfx: AudioNode,
    private readonly voice: AudioNode,
    private readonly base = 'sfx/',
  ) {
    this.ambienceFilter = ctx.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.frequency.value = 20000;
    this.ambience = ctx.createGain();
    this.ambience.connect(this.ambienceFilter);
    this.ambienceFilter.connect(sfx);
  }

  now(): number {
    return this.ctx.currentTime;
  }

  load(file: string): Promise<void> {
    if (this.buffers.has(file)) return Promise.resolve();
    let p = this.loading.get(file);
    if (!p) {
      p = (async () => {
        try {
          const bytes = await fetchBytes(this.base + file);
          this.buffers.set(file, await this.ctx.decodeAudioData(bytes));
        } finally {
          this.loading.delete(file);
        }
      })();
      this.loading.set(file, p);
    }
    return p;
  }

  /** Hand in a buffer made some other way (the test hook's generated tones). */
  put(file: string, buffer: AudioBuffer): void {
    this.buffers.set(file, buffer);
  }

  ready(file: string): boolean {
    return this.buffers.has(file);
  }

  evict(file: string): void {
    this.buffers.delete(file);
  }

  start(play: SamplePlay): number {
    const buffer = this.buffers.get(play.file);
    if (!buffer) return 0;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.max(0, play.delay);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = play.rate;
    const nodes: AudioNode[] = [];
    let head: AudioNode = src;
    const chain = (n: AudioNode): void => {
      head.connect(n);
      head = n;
      nodes.push(n);
    };
    if (play.texture === 'grit') {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.curve ??= gritCurve();
      chain(shaper);
    }
    if (play.texture === 'buzz' || play.bandpass) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = play.bandpass ?? 1400;
      bp.Q.value = play.bandpass ? 1.2 : 0.7;
      chain(bp);
    }
    for (const f of play.formants ?? []) {
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = f;
      pk.Q.value = 4;
      pk.gain.value = 6;
      chain(pk);
    }
    const lp = play.lowpass ?? (play.texture === 'soft' ? 5000 : null);
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      chain(f);
    }
    if (play.vibrato && play.vibrato.depth > 0) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = play.vibrato.rate;
      depth.gain.value = play.vibrato.depth;
      lfo.connect(depth);
      depth.connect(src.playbackRate);
      lfo.start(t);
      nodes.push(lfo, depth);
    }
    const env = ctx.createGain();
    const length = (play.duration ?? buffer.duration - (play.offset ?? 0)) / play.rate;
    env.gain.setValueAtTime(play.gain, t);
    if (play.duration !== undefined) {
      env.gain.setValueAtTime(play.gain, t + Math.max(0, length - 0.02));
      env.gain.linearRampToValueAtTime(0, t + length);
    }
    if (play.tremolo) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = play.tremolo;
      depth.gain.value = play.gain * 0.3;
      lfo.connect(depth);
      depth.connect(env.gain);
      lfo.start(t);
      nodes.push(lfo, depth);
    }
    chain(env);
    if (play.pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, play.pan));
      chain(panner);
    }
    head.connect(play.bus === 'voice' ? this.voice : this.sfx);
    const handle = ++this.handles;
    this.playing.set(handle, { src, env, nodes });
    src.start(t, play.offset ?? 0, play.duration);
    src.onended = () => {
      this.playing.delete(handle);
      src.disconnect();
      for (const n of nodes) {
        if (n instanceof OscillatorNode) n.stop();
        n.disconnect();
      }
    };
    return handle;
  }

  stop(handle: number, fade: number): void {
    const p = this.playing.get(handle);
    if (!p) return;
    const t = this.ctx.currentTime;
    p.env.gain.cancelScheduledValues(t);
    p.env.gain.setValueAtTime(p.env.gain.value, t);
    p.env.gain.linearRampToValueAtTime(0, t + fade);
    p.src.stop(t + fade + 0.005);
  }

  setBed(id: string, bed: BedPlay | null, gain: number, ramp: number): void {
    const t = this.ctx.currentTime;
    let b = this.beds.get(id);
    if (b && bed && b.file !== bed.file) {
      this.stopBed(id, b, t, ramp);
      b = undefined;
    }
    if (!b) {
      if (gain <= 0 || !bed) return;
      const buffer = this.buffers.get(bed.file);
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = bed.loopStart;
      src.loopEnd = bed.loopStart + bed.loopDur;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      src.connect(g);
      g.connect(this.ambience);
      src.start(t, bed.loopStart);
      b = { file: bed.file, src, gain: g, stopAt: null };
      this.beds.set(id, b);
    }
    rampTo(b.gain.gain, gain, t, ramp);
    if (gain <= 0) this.stopBed(id, b, t, ramp);
    else b.stopAt = null;
  }

  private stopBed(id: string, b: Bed, t: number, ramp: number): void {
    rampTo(b.gain.gain, 0, t, ramp);
    b.src.stop(t + ramp + 0.05);
    b.src.onended = () => {
      b.src.disconnect();
      b.gain.disconnect();
    };
    if (this.beds.get(id) === b) this.beds.delete(id);
  }

  setAmbienceBus(gainDb: number, lowpass: number | null, ramp: number): void {
    const t = this.ctx.currentTime;
    rampTo(this.ambience.gain, 10 ** (gainDb / 20), t, ramp);
    this.ambienceFilter.frequency.setTargetAtTime(lowpass ?? 20000, t, Math.max(0.01, ramp / 3));
  }
}

/** Ramp a gain smoothly from where it is now. */
function rampTo(p: AudioParam, to: number, t: number, ramp: number): void {
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(to, t + Math.max(0.005, ramp));
}
