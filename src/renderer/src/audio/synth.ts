export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

/** One synthesized note: a pitch glide with a quick attack and decay. */
export interface Tone {
  freq: number;
  /** Glide to this frequency over the duration. */
  to?: number;
  /** Seconds. */
  dur: number;
  /** Oscillator shape, or filtered white noise (freq and to are then the filter sweep). */
  wave?: Wave | 'noise';
  /** 0 to 1. */
  gain?: number;
  /** Seconds from now. */
  delay?: number;
  /** Attack time in seconds. Default 10 ms. */
  attack?: number;
  /** Band-pass resonance for noise. */
  q?: number;
  /** Two vowel formants in Hz: the oscillator runs through band-pass filters (voices). */
  formants?: readonly [number, number];
  /** Pitch wobble. */
  vibrato?: { rate: number; depth: number };
  /** Which mix bus. */
  bus?: 'sfx' | 'voice';
}

/**
 * Where sounds go. The game talks to this interface so tests can swap in
 * NullAudioBackend and assert on what would have played.
 */
export interface AudioBackend {
  play(tone: Tone): void;
  /** Resume after the platform suspended audio. Safe to call often. */
  resume(): void;
  setMuted(muted: boolean): void;
}

/** Plays nothing; remembers what it was asked to play. */
export class NullAudioBackend implements AudioBackend {
  readonly played: Tone[] = [];
  muted = false;
  play(tone: Tone): void {
    if (!this.muted) this.played.push(tone);
  }
  resume(): void {}
  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}

/**
 * WebAudio synth. Each tone is an oscillator (or looping noise) with a gain
 * envelope, optionally through band-pass filters, into an sfx or voice bus,
 * then a master gain and a soft limiter.
 */
export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<'sfx' | 'voice', GainNode> | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private active = 0;

  private context(): AudioContext | null {
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return null;
      const ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 12;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.5;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.gain.value = 0.8;
      const voice = ctx.createGain();
      voice.gain.value = 0.8;
      sfx.connect(master);
      voice.connect(master);
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.buses = { sfx, voice };
      this.noise = noise;
    }
    return this.ctx;
  }

  play(tone: Tone): void {
    const ctx = this.context();
    if (!ctx || this.muted || !this.buses || !this.noise) return;
    // Voice cap: skip rather than pile up (the doc allows 32).
    if (this.active >= 32) return;
    const start = ctx.currentTime + (tone.delay ?? 0);
    const end = start + tone.dur;
    const env = ctx.createGain();
    const peak = Math.min(1, tone.gain ?? 0.3);
    const attack = Math.min(tone.attack ?? 0.01, tone.dur / 3);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(this.buses[tone.bus ?? 'sfx']);

    const nodes: AudioNode[] = [env];
    let source: AudioScheduledSourceNode;
    if (tone.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = tone.q ?? 1.5;
      filter.frequency.setValueAtTime(tone.freq, start);
      if (tone.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to), end);
      src.connect(filter);
      filter.connect(env);
      nodes.push(filter);
      source = src;
    } else {
      const osc = ctx.createOscillator();
      osc.type = tone.wave ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to), end);
      if (tone.vibrato && tone.vibrato.depth > 0) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = tone.vibrato.rate;
        depth.gain.value = tone.vibrato.depth;
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(start);
        lfo.stop(end + 0.02);
        nodes.push(lfo, depth);
      }
      if (tone.formants) {
        // Vowel color: two resonant band-passes plus a little of the dry tone.
        for (const f of tone.formants) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f;
          bp.Q.value = 6;
          const g = ctx.createGain();
          g.gain.value = 2.2;
          osc.connect(bp);
          bp.connect(g);
          g.connect(env);
          nodes.push(bp, g);
        }
        const dry = ctx.createGain();
        dry.gain.value = 0.25;
        osc.connect(dry);
        dry.connect(env);
        nodes.push(dry);
      } else {
        osc.connect(env);
      }
      source = osc;
    }
    this.active++;
    source.start(start);
    source.stop(end + 0.02);
    source.onended = () => {
      this.active--;
      source.disconnect();
      for (const n of nodes) n.disconnect();
    };
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }
}
