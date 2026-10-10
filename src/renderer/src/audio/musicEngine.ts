// The adaptive background music (docs/05-music-brief.md sections 1 and 7):
// every frame it asks `MusicPicker` what should play, crossfades to it on the
// beat, keeps the layer gains on `mixTargets`, and keeps the `MusicClock` on
// the playing track so the music toys lock to it. Tracks that don't exist
// yet play a soft procedural pad in the brief's key and tempo instead.

import { MUSIC_LAYERS, MUSIC_SAMPLE_RATE, keyName } from '../../../shared/music';
import type { AudioBackend } from './synth';
import { MusicClock, degreeMidi, midiFreq } from './musicClock';
import type { MusicChoice } from './musicManifest';
import { MusicLibrary, padChords } from './musicManifest';
import type { LayerGains, LayerOverride, MixState, MixTargets } from './musicMix';
import { NO_OVERRIDE, QUIET_MIX, fullGain, mixTargets, overrideLayers } from './musicMix';
import type { AreaSpan, FadeKind } from './musicPick';
import { MusicPicker, fadeSeconds } from './musicPick';
import type { LayerName, MusicSink } from './musicPlayer';

/** What the game tells the music each frame. */
export interface MusicInput {
  menu: boolean;
  centerX: number;
  areas: readonly AreaSpan[];
  /** Sky clock, sim ticks. */
  clock: number;
  raining: boolean;
  /** Seconds since the player did anything. */
  idle: number;
  busy: boolean;
  bugPlaying: boolean;
  paused: boolean;
}

/** The porch, the ant hill, and the gnome keep the rain off the music. */
export const SHELTERED: ReadonlySet<string> = new Set([
  'area_under_porch',
  'area_ant_hill_depths',
  'area_gnome_hollow',
]);
/** The pad sits well under the tracks (about -24 LUFS against their -18). */
const PAD_GAIN = 0.05;
/** Bars of quiet after a player note before the melody comes back. */
export const PLAYER_QUIET_BARS = 4;
/** The Music Lab's quick changes: a cut to a staged track, a mute, a jump along the loop. */
const LAB_CUT_SECONDS = 0.3;
const LAB_LAYER_SECONDS = 0.08;

/** A layer gain on its way somewhere: `from` until `at`, then a straight line to `to`. */
interface Ramp {
  from: number;
  to: number;
  at: number;
  seconds: number;
}

function rampValue(r: Ramp, t: number): number {
  const u = Math.max(0, Math.min(1, (t - r.at) / Math.max(0.001, r.seconds)));
  return r.from + (r.to - r.from) * u;
}

interface Playing {
  choice: MusicChoice;
  /** Sink voice, or null for the pad. */
  voice: number | null;
  /** Audio time when the loop body's start would have played (its downbeat). */
  anchor: number;
  /** The gains last sent, to send only changes. */
  sent: Partial<Record<LayerName, number>>;
  /** Each layer's last ramp, to report what is heard right now. */
  ramps: Partial<Record<LayerName, Ramp>>;
  /** When it fades out and stops, if it is on its way out. */
  endsAt: number | null;
  /** Fading in: weight 0 to 1 over [from, to] (for the pad's level). */
  fade: { from: number; to: number; out: boolean } | null;
}

export interface MusicReport {
  /** The manifest loaded and passed its check. */
  manifest: boolean;
  errors: string[];
  /** What should play (track ID or `pad:...`). */
  target: string;
  /** What is playing now (the incoming track during a crossfade). */
  playing: string;
  area: string | null;
  phase: 'day' | 'night';
  /** A crossfade under way. */
  fading: boolean;
  layers: LayerGains;
  /**
   * Where each layer's gain has got to right now on the playing track (the
   * gains move to `layers` over a beat to two bars). The pad has no layers:
   * it reports `layers`.
   */
  heard: LayerGains;
  /** Seconds into the playing track's loop and the loop's length, or null for the pad. */
  position: number | null;
  loopSeconds: number | null;
  /** The Music Lab's mutes and solos (empty outside the lab). */
  override: { mute: string[]; solo: string[] };
  track: number;
  lowpass: number | null;
  bpm: number;
  key: string;
  scale: number[];
  beatsPerBar: number;
  /** Beats on the music clock, and where in the bar. */
  beat: number;
  beatInBar: number;
  /** Audio clock seconds. */
  time: number;
  /** The mix rules that apply right now. */
  state: MixState;
  /** Tracks decoded and ready. */
  loaded: string[];
}

export class MusicEngine {
  readonly clock = new MusicClock();
  library = MusicLibrary.empty();
  /** Waiting for the manifest: nothing plays until it arrives (or fails). */
  private ready = false;
  private readonly picker = new MusicPicker();
  private current: Playing | null = null;
  private incoming: Playing | null = null;
  private readonly old: Playing[] = [];
  /** Where each track was when it faded out (loop seconds), so coming back resumes there. */
  private readonly positions = new Map<string, number>();
  private readonly failed = new Set<string>();
  private readonly loading = new Set<string>();
  /** The clock follows the incoming track from this time. */
  private switchAt: { at: number; choice: MusicChoice; barTime: number } | null = null;
  private target: MusicChoice | null = null;
  private pendingFade: FadeKind = 'menu';
  /** The area the music follows (null on the menu). */
  area: string | null = null;
  private phase: 'day' | 'night' = 'day';
  private thinning = false;
  private lastPlayerNote = -Infinity;
  private seq = { playing: false, drums: false };
  private stingerUntil = -Infinity;
  private targets: MixTargets = mixTargets(QUIET_MIX);
  private mix: MixState = { ...QUIET_MIX };
  private sentLowpass: number | null = null;
  /** Bars of the pad already scheduled, by bar number. */
  private padBar = -Infinity;
  /** Music Lab (dev only): mutes and solos on top of the rules. */
  private override: LayerOverride = NO_OVERRIDE;
  /** Music Lab: the next layer changes happen at once, not on the bar line. */
  private layersNow = false;
  /** Music Lab: changes of track are quick cuts while a scene is being staged. */
  private cutting = false;

  constructor(
    private readonly sink: MusicSink,
    private readonly backend: AudioBackend,
  ) {}

  /** The manifest arrived (or `null`: it failed, and the pad plays everywhere). */
  setLibrary(library: MusicLibrary): void {
    this.library = library;
    this.ready = true;
    if (!library.ok) console.warn('Music manifest unavailable; playing the pad.', library.errors.slice(0, 3));
  }

  now(): number {
    return this.sink.now();
  }

  /** A player note or a toy the player set going (dips the melody). */
  playerNote(at = this.sink.now()): void {
    this.lastPlayerNote = Math.max(this.lastPlayerNote, at);
  }

  /** The sequencer's state where the camera is: playing a player's pattern here, and with drums. */
  setSequencer(playing: boolean, drums: boolean): void {
    this.seq = { playing, drums };
  }

  /** The unlock stinger: duck the music around it. Returns false if the owner made no stinger (play the fanfare). */
  stinger(): boolean {
    const s = this.library.stinger();
    if (!s) return false;
    const now = this.sink.now();
    this.sink
      .load('stinger_unlock', { full: s.file })
      .then(() => {
        const t = this.sink.now() + 0.1;
        const v = this.sink.start('stinger_unlock', { start: 0, samples: s.samples }, t, 0, { full: 1 }, 1);
        this.sink.stop(v, t + s.samples / MUSIC_SAMPLE_RATE);
        this.stingerUntil = t + s.samples / MUSIC_SAMPLE_RATE + 0.5;
      })
      .catch(() => undefined);
    this.stingerUntil = now + 1;
    return true;
  }

  /**
   * Music Lab: mute or solo layers on top of the mix rules. It changes only
   * what this engine sends to its sink, and takes effect at once.
   */
  setOverride(o: LayerOverride): void {
    this.override = { mute: [...o.mute], solo: [...o.solo] };
    this.layersNow = true;
  }

  /** Music Lab: while on, a change of track is a quick cut instead of a crossfade (staging a scene). */
  setCutting(on: boolean): void {
    this.cutting = on;
  }

  /**
   * Music Lab: jump the playing track to `bars` bars before its loop point.
   * Returns false when no track is playing (the pad has no loop).
   */
  seekBeforeLoop(bars: number): boolean {
    const p = this.incoming ?? this.current;
    const t = p?.choice.track;
    if (!p || !t) return false;
    const barSec = (p.choice.beatsPerBar * 60) / p.choice.bpm;
    const loopSec = t.loop.samples / MUSIC_SAMPLE_RATE;
    this.begin(p.choice, 'menu', this.sink.now(), Math.max(0, loopSec - bars * barSec));
    return true;
  }

  update(input: MusicInput, dt: number): void {
    const now = this.sink.now();
    const pick = this.picker.update(input, dt);
    this.area = pick.area;
    this.phase = pick.phase;
    this.thinning = pick.thinning;
    if (pick.fade) this.pendingFade = pick.fade;
    if (!this.ready) return;
    const want = pick.area ? this.library.forArea(pick.area, pick.phase) : this.library.forMenu();
    const target = want.track && this.failed.has(want.id) ? this.padFor(want) : want;
    this.target = target;
    const playingId = (this.incoming ?? this.current)?.choice.id;
    if (playingId !== target.id) this.begin(target, this.pendingFade, now);
    else {
      // The same track standing in for both phases: only the rules change.
      const p = this.incoming ?? this.current;
      if (p && p.choice.rules !== target.rules) p.choice = { ...p.choice, rules: target.rules };
    }
    if (this.switchAt && now >= this.switchAt.at) {
      this.clock.follow(this.switchAt.choice, this.switchAt.barTime);
      this.switchAt = null;
    }
    this.finishFades(now);
    this.applyMix(input, now);
    this.schedulePad(now);
  }

  /** The pad in a track's key and tempo, for a track that failed to load. */
  private padFor(c: MusicChoice): MusicChoice {
    return { ...c, id: `pad:${c.id}`, track: null };
  }

  /**
   * Start the crossfade to `choice`, once it is decoded. `seek` (Music Lab)
   * restarts it that many seconds into its loop with a quick cut.
   */
  private begin(choice: MusicChoice, kind: FadeKind, now: number, seek: number | null = null): void {
    const t = choice.track;
    if (t && !this.sink.isLoaded(choice.id)) {
      if (!this.loading.has(choice.id)) {
        this.loading.add(choice.id);
        this.sink
          .load(choice.id, t.layers)
          .catch((err: unknown) => {
            console.warn(`Music ${choice.id} failed to load; playing the pad.`, err);
            this.failed.add(choice.id);
          })
          .finally(() => this.loading.delete(choice.id));
      }
      // Nothing playing yet (the first track of a session): wait for it.
      return;
    }
    const playing = this.incoming ?? this.current;
    const cut = this.cutting || seek !== null;
    const fade = !playing ? 0.05 : cut ? LAB_CUT_SECONDS : fadeSeconds(kind, choice.bpm, choice.beatsPerBar);
    // Area changes between tracks of one tempo start on the next bar line, in step with the old track.
    const locked = playing && !cut && kind === 'area' && playing.choice.bpm === choice.bpm;
    const when = locked ? Math.max(this.clock.nextBar(now + 0.05), now + 0.05) : now + 0.08;
    const loopSec = t ? t.loop.samples / MUSIC_SAMPLE_RATE : Infinity;
    const barSec = (choice.beatsPerBar * 60) / choice.bpm;
    // Back to a track heard before: carry on from the nearest bar to where it was.
    const remembered = seek ?? this.positions.get(choice.id) ?? 0;
    const offset = t ? (Math.round(remembered / barSec) * barSec) % loopSec : 0;
    const gains = this.layerGains(choice, this.targets);
    const voice = t
      ? this.sink.start(
          choice.id,
          { start: t.loop.start, samples: t.loop.samples },
          when,
          offset,
          gains,
          playing ? 0 : this.targets.track,
        )
      : null;
    if (voice !== null && playing) this.sink.setTrack(voice, this.targets.track, when, fade, 'in');
    const next: Playing = {
      choice,
      voice,
      anchor: when - offset,
      sent: { ...gains },
      ramps: {},
      endsAt: null,
      fade: playing ? { from: when, to: when + fade, out: false } : null,
    };
    // Whatever was on its way in or playing goes out together.
    for (const p of [this.incoming, this.current]) if (p) this.fadeOut(p, when, fade);
    this.current = null;
    this.incoming = next;
    if (playing) this.switchAt = { at: when + fade / 2, choice, barTime: when };
    else {
      this.clock.follow(choice, when);
      this.switchAt = null;
    }
    this.padBar = -Infinity;
  }

  private fadeOut(p: Playing, at: number, seconds: number): void {
    p.endsAt = at + seconds;
    p.fade = { from: at, to: at + seconds, out: true };
    if (p.voice !== null) {
      this.sink.setTrack(p.voice, 0, at, seconds, 'out');
      this.sink.stop(p.voice, at + seconds + 0.05);
    }
    if (p.choice.track) {
      const loopSec = p.choice.track.loop.samples / MUSIC_SAMPLE_RATE;
      this.positions.set(p.choice.id, (((at - p.anchor) % loopSec) + loopSec) % loopSec);
    }
    this.old.push(p);
  }

  private finishFades(now: number): void {
    if (this.incoming && (!this.incoming.fade || now >= this.incoming.fade.to)) {
      this.incoming.fade = null;
      this.current = this.incoming;
      this.incoming = null;
    }
    for (let i = this.old.length - 1; i >= 0; i--)
      if ((this.old[i]!.endsAt ?? 0) <= now) this.old.splice(i, 1);
    // Keep at most the playing track and the one fading in decoded, plus the one just left.
    const keep = new Set([
      this.current?.choice.id,
      this.incoming?.choice.id,
      ...this.old.map((p) => p.choice.id),
    ]);
    for (const id of this.library.ids())
      if (!keep.has(id) && this.sink.isLoaded(id) && this.loadedCount() > 3) this.sink.unload(id);
  }

  private loadedCount(): number {
    return this.library.ids().filter((id) => this.sink.isLoaded(id)).length;
  }

  /** The layer gains a track gets from the rules (a stem-less track plays `full` at their mean). */
  private layerGains(c: MusicChoice, t: MixTargets): Partial<Record<LayerName, number>> {
    const layers = c.track?.layers ?? {};
    const out: Partial<Record<LayerName, number>> = {};
    for (const l of MUSIC_LAYERS) if (layers[l]) out[l] = t.gains[l];
    if (layers.full) out.full = fullGain(t.gains);
    return out;
  }

  private applyMix(input: MusicInput, now: number): void {
    const playing = this.incoming ?? this.current;
    const rules = playing?.choice.rules ?? this.phase;
    const bar = this.clock.period * this.clock.beatsPerBar;
    const playerMusic = this.seq.playing || now - this.lastPlayerNote < PLAYER_QUIET_BARS * bar;
    this.mix = {
      rules,
      thinning: this.thinning,
      idle: input.idle,
      busy: input.busy,
      playerMusic,
      seqDrums: this.seq.drums,
      bugPlaying: input.bugPlaying,
      raining: input.raining && !input.menu,
      sheltered: this.area !== null && SHELTERED.has(this.area),
      antHillNight: this.area === 'area_ant_hill_depths' && this.phase === 'night',
      paused: input.paused,
      stinger: now < this.stingerUntil,
    };
    const was = this.targets;
    const ruled = mixTargets(this.mix);
    this.targets = { ...ruled, gains: overrideLayers(ruled.gains, this.override) };
    const atOnce = this.layersNow;
    this.layersNow = false;
    const beat = this.clock.period;
    // Layers move on bar lines; a dip for the player's notes comes in on the next beat.
    // A lab mute lands on a track that is fading out too, so a long crossfade can be picked apart.
    for (const p of [this.current, this.incoming, ...(atOnce ? this.old : [])]) {
      if (!p || p.voice === null) continue;
      const gains = this.layerGains(p.choice, this.targets);
      for (const [layer, g] of Object.entries(gains) as [LayerName, number][]) {
        const sent = p.sent[layer] ?? -1;
        if (Math.abs(sent - g) < 0.01) continue;
        const dip = g < sent;
        const fast = dip && layer === 'lead' && playerMusic;
        const at = atOnce ? now : fast ? this.clock.next(now, 1).time : this.clock.nextBar(now);
        const seconds = atOnce ? LAB_LAYER_SECONDS : fast ? beat * 0.5 : dip ? bar : 2 * bar;
        this.sink.setLayer(p.voice, layer, g, at, seconds);
        p.ramps[layer] = { from: this.heardGain(p, layer, at), to: g, at, seconds };
        p.sent[layer] = g;
      }
    }
    // Track gain (pause, stinger): quick.
    if (Math.abs(was.track - this.targets.track) > 0.001 && this.current?.voice != null && !this.incoming)
      this.sink.setTrack(this.current.voice, this.targets.track, now, 0.3);
    if (this.targets.lowpass !== this.sentLowpass) {
      this.sink.setLowpass(this.targets.lowpass, input.paused || this.sentLowpass === 900 ? 0.3 : bar);
      this.sentLowpass = this.targets.lowpass;
    }
  }

  /** The pad, a bar at a time, a little ahead: four chords in the key, soft and slow. */
  private schedulePad(now: number): void {
    const pads = [this.current, this.incoming, ...this.old].filter(
      (p): p is Playing => !!p && p.voice === null,
    );
    if (pads.length === 0) return;
    const bpb = this.clock.beatsPerBar;
    const barIndex = Math.floor(this.clock.beatAt(now + 0.25) / bpb);
    if (barIndex <= this.padBar) return;
    this.padBar = barIndex;
    const at = this.clock.timeOfBeat(barIndex * bpb);
    if (at < now - 0.05) return;
    const barSec = this.clock.period * bpb;
    for (const p of pads) {
      const w = this.padWeight(p, at);
      if (w <= 0.01) continue;
      const g = PAD_GAIN * w * this.targets.track * (this.mix.rules === 'night' ? 0.8 : 1);
      const chord = padChords(p.choice.key.mode)[((barIndex % 4) + 4) % 4]!;
      for (const semis of chord) {
        const midi = degreeMidi(p.choice.key, 0, 3) + semis;
        this.backend.play({
          freq: midiFreq(midi),
          dur: barSec * 1.1,
          wave: 'triangle',
          gain: g,
          attack: Math.min(0.6, barSec * 0.25),
          delay: Math.max(0, at - now),
          bus: 'music',
        });
      }
      // The bass on beat 1 and the fifth on beat 3, when there is no idle hush.
      if (this.targets.gains.bass > 0.5) {
        const root = degreeMidi(p.choice.key, 0, 2) + chord[0]!;
        for (const [beat, semis] of [
          [0, 0],
          [2, 7],
        ] as const)
          this.backend.play({
            freq: midiFreq(root + semis),
            dur: this.clock.period * 1.6,
            wave: 'sine',
            gain: g * 1.4 * this.targets.gains.bass,
            attack: 0.02,
            delay: Math.max(0, at + beat * this.clock.period - now),
            bus: 'music',
          });
      }
    }
  }

  /** How loud a pad is at time `t` through its fade. */
  private padWeight(p: Playing, t: number): number {
    if (!p.fade) return 1;
    const u = Math.max(0, Math.min(1, (t - p.fade.from) / Math.max(0.01, p.fade.to - p.fade.from)));
    return p.fade.out ? 1 - u : u;
  }

  /** The music clock's chord this bar: the root's semitones above the tonic (the pad's progression). */
  chordRoot(t: number): number {
    const bar = Math.floor(this.clock.beatAt(t) / this.clock.beatsPerBar);
    return padChords(this.clock.key.mode)[((bar % 4) + 4) % 4]![0]!;
  }

  /** A layer's gain on a playing track at time `t`, part way along its last ramp. */
  private heardGain(p: Playing, layer: LayerName, t: number): number {
    const r = p.ramps[layer];
    return r ? rampValue(r, t) : (p.sent[layer] ?? 0);
  }

  report(): MusicReport {
    const now = this.sink.now();
    const playing = this.incoming ?? this.current;
    const heard = { ...this.targets.gains };
    const layers = playing?.choice.track?.layers;
    if (playing && playing.voice !== null && layers)
      for (const l of MUSIC_LAYERS) if (layers[l]) heard[l] = this.heardGain(playing, l, now);
    const loopSeconds = playing?.choice.track ? playing.choice.track.loop.samples / MUSIC_SAMPLE_RATE : null;
    const position =
      playing && loopSeconds !== null
        ? (((now - playing.anchor) % loopSeconds) + loopSeconds) % loopSeconds
        : null;
    return {
      manifest: this.library.ok,
      errors: [...this.library.errors],
      target: this.target?.id ?? '',
      playing: playing?.choice.id ?? '',
      area: this.area,
      phase: this.phase,
      fading: this.incoming !== null && this.incoming.fade !== null,
      layers: { ...this.targets.gains },
      heard,
      position,
      loopSeconds,
      override: { mute: [...this.override.mute], solo: [...this.override.solo] },
      track: this.targets.track,
      lowpass: this.targets.lowpass,
      bpm: this.clock.bpm,
      beatsPerBar: this.clock.beatsPerBar,
      key: keyName(this.clock.key),
      scale: [...this.clock.scale],
      beat: this.clock.beatAt(now),
      beatInBar: this.clock.beatInBar(now),
      time: now,
      state: { ...this.mix },
      loaded: this.library.ids().filter((id) => this.sink.isLoaded(id)),
    };
  }
}
