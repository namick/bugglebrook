// Keeps the ambience beds playing (docs/08-sound-brief.md, parts 6.5 and
// 6.6): each frame it asks `bedTargets` what every bed's gain should be,
// decodes the beds it needs (at most four kept, the least recently heard
// evicted), ramps their gains, and ducks the ambience bus under bug voices,
// stingers, and the pause board. Beds with no sample stay silent, and the
// synth's rain and wind ticks carry on (`covers`).

import type { AmbienceArea } from './ambience';
import { ambienceBus, bedTargets, nightMix } from './ambience';
import { AREA_BEDS } from './sfxCatalog';
import type { SampleSink } from './samplePlayer';
import type { SampleEngine } from './sampleEngine';

export interface AmbienceFrame {
  areas: readonly AmbienceArea[];
  x: number;
  /** Hours since midnight, 0 to 24. */
  hour: number;
  rain: number;
  wind: number;
  paused: boolean;
}

export interface AmbienceReport {
  /** Every bed's target gain from the rules, whether or not it has a sample. */
  targets: Record<string, number>;
  /** Beds actually sounding, with the gain they were sent. */
  playing: Record<string, number>;
  /** 0 day to 1 night, eased. */
  night: number;
  bus: { gainDb: number; lowpass: number | null };
}

/** Beds kept decoded at once. */
export const MAX_BEDS = 4;
/** The day/night mix moves at most this fast (per second): a sundial skip crossfades over 3 s. */
const NIGHT_SPEED = 1 / 3;
const RAMP = 0.4;

const COVERS: Readonly<Record<string, string>> = {
  rain: 'rain_bed',
  wind: 'wind_bed',
  board_patter: 'board_patter',
};

export class AmbiencePlayer {
  report: AmbienceReport = { targets: {}, playing: {}, night: 0, bus: { gainDb: 0, lowpass: null } };
  private night: number | null = null;
  private sent = new Map<string, number>();
  private heard = new Map<string, number>();
  private failed = new Set<string>();
  private voiceUntil = -Infinity;
  private stingerUntil = -Infinity;
  private bus = { gainDb: 0, lowpass: null as number | null };

  constructor(private readonly engine: SampleEngine) {}

  private get sink(): SampleSink {
    return this.engine.sink;
  }

  /** Dip under a bug's line or a stinger for `seconds`. */
  duck(kind: 'voice' | 'stinger', seconds: number): void {
    const until = this.sink.now() + seconds;
    if (kind === 'voice') this.voiceUntil = Math.max(this.voiceUntil, until);
    else this.stingerUntil = Math.max(this.stingerUntil, until);
  }

  /** Does a bed now play what this synth tick would (rain, wind, the porch's patter)? */
  covers(name: string): boolean {
    const bed = COVERS[name];
    return bed !== undefined && this.fileOf(bed) !== null && this.sink.ready(this.fileOf(bed)!);
  }

  private fileOf(bed: string): string | null {
    const s = this.engine.library.sound(bed);
    return s?.kind === 'bed' ? (s.takes[0]?.file ?? null) : null;
  }

  update(dt: number, f: AmbienceFrame): void {
    const want = nightMix(f.hour);
    this.night =
      this.night === null
        ? want
        : this.night + Math.max(-NIGHT_SPEED * dt, Math.min(NIGHT_SPEED * dt, want - this.night));
    const targets = bedTargets({ areas: f.areas, x: f.x, night: this.night, rain: f.rain, wind: f.wind });
    const now = this.sink.now();
    // Keep the area's beds for both phases ready, so dusk never waits on a decode.
    const here = f.areas.find((a) => f.x >= a.x0 && f.x < a.x1);
    const soon = new Set(Object.keys(targets));
    const beds = here ? AREA_BEDS[here.mood] : undefined;
    if (beds) [beds.day, beds.night].forEach((b) => soon.add(b));
    for (const id of soon) this.need(id, now);
    const playing: Record<string, number> = {};
    for (const id of new Set([...this.sent.keys(), ...Object.keys(targets)])) {
      const file = this.fileOf(id);
      const ready = file !== null && this.sink.ready(file);
      const g = ready ? (targets[id] ?? 0) : 0;
      if (g > 0) {
        playing[id] = g;
        this.heard.set(file!, now);
      }
      const last = this.sent.get(id) ?? 0;
      if (Math.abs(g - last) < 0.01 && !(g === 0 && last > 0)) continue;
      const take = file ? this.engine.library.sound(id)!.takes[0]! : null;
      this.sink.setBed(
        id,
        take ? { file: take.file, loopStart: take.loopStart ?? 0, loopDur: take.dur } : null,
        g,
        RAMP,
      );
      if (g > 0) this.sent.set(id, g);
      else this.sent.delete(id);
    }
    this.evict(soon);
    const bus = ambienceBus({
      voice: now < this.voiceUntil,
      stinger: now < this.stingerUntil,
      paused: f.paused,
    });
    if (bus.gainDb !== this.bus.gainDb || bus.lowpass !== this.bus.lowpass) {
      // Fast down (50 ms), slow back up (600 ms).
      this.sink.setAmbienceBus(bus.gainDb, bus.lowpass, bus.gainDb < this.bus.gainDb ? 0.05 : 0.6);
      this.bus = bus;
    }
    this.report = { targets, playing, night: this.night, bus };
  }

  /** Silence every bed (leaving a world). */
  stop(): void {
    for (const id of this.sent.keys()) this.sink.setBed(id, null, 0, RAMP);
    this.sent.clear();
    this.night = null;
    this.report = { targets: {}, playing: {}, night: 0, bus: this.bus };
  }

  private need(id: string, now: number): void {
    const file = this.fileOf(id);
    if (!file || this.failed.has(file) || this.sink.ready(file)) return;
    if (!this.heard.has(file)) this.heard.set(file, now);
    this.sink.load(file).catch((err: unknown) => {
      this.failed.add(file);
      this.engine.warn(id, err);
    });
  }

  /** Keep at most four beds decoded: drop the least recently heard that isn't wanted now. */
  private evict(wanted: Set<string>): void {
    const keep = new Set([...wanted].map((id) => this.fileOf(id)).filter((f): f is string => f !== null));
    const loaded = [...this.heard.entries()].filter(([file]) => this.sink.ready(file));
    if (loaded.length <= MAX_BEDS) return;
    loaded.sort((a, b) => a[1] - b[1]);
    for (const [file] of loaded.slice(0, loaded.length - MAX_BEDS)) {
      if (keep.has(file)) continue;
      this.sink.evict(file);
      this.heard.delete(file);
    }
  }
}
