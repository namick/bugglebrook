export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

/** One synthesized note: a pitch glide with a quick attack and decay. */
export interface Tone {
  freq: number;
  /** Glide to this frequency over the duration. */
  to?: number;
  /** Seconds. */
  dur: number;
  wave?: Wave;
  /** 0 to 1. */
  gain?: number;
  /** Seconds from now. */
  delay?: number;
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

/** WebAudio synth: an oscillator and a gain envelope per note. */
export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  private context(): { ctx: AudioContext; master: GainNode } | null {
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return null;
      this.ctx = new AudioContext();
      const compressor = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
    }
    return this.master ? { ctx: this.ctx, master: this.master } : null;
  }

  play(tone: Tone): void {
    const c = this.context();
    if (!c || this.muted) return;
    const { ctx, master } = c;
    const start = ctx.currentTime + (tone.delay ?? 0);
    const end = start + tone.dur;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = tone.wave ?? 'sine';
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to), end);
    const peak = Math.min(1, tone.gain ?? 0.3);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.01, tone.dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
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
