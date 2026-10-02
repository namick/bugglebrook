// Plays game sounds from recorded samples when the manifest has them
// (docs/08-sound-brief.md, part 1.2): resolve the folder, pick a take from
// its shuffle bag, vary pitch and gain, pan by the screen position, and keep
// to the voice limits. Anything it can't play (no folder, not decoded yet, a
// failed decode) goes back to the synth, so a build with no samples is the
// game as it was.

import type { Material } from './sfx';
import { SfxLibrary, type Resolved } from './sfxManifest';
import { STEAL_FADE, type VoiceClip } from './sfxCatalog';
import { ShuffleBag, dbToGain, panFor, vary } from './samplePick';
import { VoicePool } from './sampleVoices';
import type { SamplePlay, SampleSink } from './samplePlayer';
import { fetchJson } from './musicPlayer';

/** One sound the game asked for, as the test hook reports it. */
export interface SoundPlay {
  name: string;
  /** The sample folder, or null for the synth. */
  folder: string | null;
  take: number;
  rate: number;
  /** dB. */
  gain: number;
  pan: number;
  source: 'sample' | 'synth' | 'skipped';
}

export interface WorldPoint {
  x: number;
  y?: number;
}

export class SampleEngine {
  library = new SfxLibrary(null);
  /** Where world x sits across the screen: 0 at the left edge, 1 at the right. Null outside a world. */
  screen: ((x: number) => number) | null = null;
  /** The sfx bus's level (0 to 1): at 0 nothing plays, as with the synth. */
  sfxVolume = 1;
  private bags = new Map<string, ShuffleBag>();
  private pool = new VoicePool();
  private ready = new Set<string>();
  private warned = new Set<string>();
  private generation = 0;

  constructor(
    readonly sink: SampleSink,
    private readonly random: () => number = Math.random,
  ) {}

  /** Fetch the manifest; without one, everything stays synthesized. */
  async load(url = 'sfx/manifest.json'): Promise<void> {
    try {
      this.setLibrary(new SfxLibrary(await fetchJson(url)));
    } catch (err) {
      console.warn('No sfx manifest', err);
      this.setLibrary(new SfxLibrary(null));
    }
    if (this.library.errors.length) console.warn('Bad sfx manifest', this.library.errors);
  }

  /** Use a manifest, and start decoding its one-shots (part 6.5). Resolves once they are tried. */
  setLibrary(library: SfxLibrary): Promise<void> {
    this.library = library;
    this.bags.clear();
    this.ready.clear();
    const gen = ++this.generation;
    const jobs = Object.entries(library.manifest.sounds)
      .filter(([, s]) => s.kind === 'oneshot')
      .map(async ([folder, s]) => {
        try {
          await Promise.all(s.takes.map((t) => this.sink.load(t.file)));
          if (gen === this.generation) this.ready.add(folder);
        } catch (err) {
          this.warn(folder, err);
        }
      });
    // Her voice clips (part 4), if she recorded: small, so they load with the one-shots.
    const clips = Object.entries(library.manifest.voices).map(async ([emotion, list]) => {
      try {
        await Promise.all(list.map((c) => this.sink.load(c.file)));
      } catch (err) {
        this.warn(`voices/${emotion}`, err);
      }
    });
    return Promise.all([...jobs, ...clips]).then(() => undefined);
  }

  /** Her decoded clips for an emotion, or none (that emotion stays synthesized). */
  voiceClips(emotion: string): VoiceClip[] {
    return this.library.voiceClips(emotion).filter((c) => this.sink.ready(c.file));
  }

  /** One console warning per folder, never an error. */
  warn(folder: string, err: unknown): void {
    if (this.warned.has(folder)) return;
    this.warned.add(folder);
    console.warn(`Sound ${folder} falls back to the synth`, err);
  }

  isReady(folder: string): boolean {
    return this.ready.has(folder);
  }

  /** The folder a sound would play now, or null for the synth. */
  resolve(name: string, material: Material = 'wood'): Resolved | null {
    const r = this.library.resolve(name, material);
    return r && this.ready.has(r.folder) ? r : null;
  }

  /**
   * Play a sound from samples. Returns what played (or was skipped, off
   * screen or with the bus silent), or null to use the synth.
   */
  play(name: string, intensity = 1, material: Material = 'wood', at?: WorldPoint | null): SoundPlay | null {
    const r = this.resolve(name, material);
    if (!r) return null;
    const { folder, sound, entry, alias } = r;
    const place = at && this.screen ? panFor(this.screen(at.x)) : { pan: 0, gainDb: 0 };
    const skipped: SoundPlay = {
      name,
      folder,
      take: -1,
      rate: 1,
      gain: -Infinity,
      pan: 0,
      source: 'skipped',
    };
    if (!place || this.sfxVolume <= 0) return skipped;
    let bag = this.bags.get(folder);
    if (!bag) this.bags.set(folder, (bag = new ShuffleBag(sound.takes.length, this.random)));
    const shortest = (): number =>
      sound.takes.reduce((best, t, i) => (t.dur < sound.takes[best]!.dur ? i : best), 0);
    const count = alias?.repeat?.count ?? 1;
    let first: SoundPlay | null = null;
    for (let k = 0; k < count; k++) {
      const take = alias?.shortest ? shortest() : bag.next();
      const t = sound.takes[take]!;
      const v = vary(this.random, entry.pitch, intensity, alias?.semis ?? 0);
      const gainDb = v.gainDb + (alias?.gainDb ?? 0) + place.gainDb - k * (alias?.repeat?.fallDb ?? 0);
      const delay = (k * (alias?.repeat?.gapMs ?? 0)) / 1000;
      const tail = alias?.tail;
      const offset = tail ? t.dur * (1 - tail) : 0;
      const lowpass =
        v.lowpass !== null && alias?.lowpass
          ? Math.min(v.lowpass, alias.lowpass)
          : (v.lowpass ?? alias?.lowpass ?? null);
      const play: SamplePlay = {
        file: t.file,
        bus: 'sfx',
        delay,
        rate: v.rate,
        gain: dbToGain(gainDb),
        pan: place.pan,
        lowpass,
        bandpass: alias?.bandpass ?? null,
        ...(tail ? { offset, duration: t.dur * tail } : {}),
      };
      const now = this.sink.now();
      const handle = this.sink.start(play);
      const end = now + delay + (t.dur - offset) / v.rate;
      for (const old of this.pool.admit(handle, folder, entry.limit, now, end))
        this.sink.stop(old, STEAL_FADE);
      first ??= { name, folder, take, rate: v.rate, gain: gainDb, pan: place.pan, source: 'sample' };
    }
    return first;
  }
}
