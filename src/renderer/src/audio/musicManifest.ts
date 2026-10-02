// Which background track plays for an area and phase, with the fallbacks of
// docs/05-music-brief.md section 7.13. Pure: the player fetches the manifest
// and hands it in, so Vitest can test the choices without WebAudio.

import type {
  ManifestStinger,
  ManifestTrack,
  MusicKey,
  MusicManifest,
  TrackPhase,
} from '../../../shared/music';
import { TRACK_SPECS, manifestErrors, pentatonic } from '../../../shared/music';

/** Whose rules a track follows: day tracks standing in at night follow the night rules. */
export type RulesPhase = 'day' | 'night';

export interface MusicChoice {
  /** The track ID, or `pad:<what it stands in for>` for the procedural pad. */
  id: string;
  /** The manifest entry, or null for the pad. */
  track: ManifestTrack | null;
  key: MusicKey;
  /** Pentatonic steps above the tonic. */
  scale: number[];
  bpm: number;
  beatsPerBar: number;
  /** The rules the mix follows (section 7.12). */
  rules: RulesPhase;
}

/** The pad's key and tempo for something with no track: the brief's target. */
function padChoice(standsFor: string, key: MusicKey, bpm: number, rules: RulesPhase): MusicChoice {
  return {
    id: `pad:${standsFor}`,
    track: null,
    key,
    scale: pentatonic(key.mode),
    bpm,
    beatsPerBar: 4,
    rules,
  };
}

function choice(id: string, track: ManifestTrack, rules: RulesPhase): MusicChoice {
  return {
    id,
    track,
    key: { tonic: track.key.tonic, mode: track.key.mode },
    scale: [...track.scale],
    bpm: track.bpm,
    beatsPerBar: track.beatsPerBar,
    rules,
  };
}

const C_MAJOR: MusicKey = { tonic: 'C', mode: 'major' };

export class MusicLibrary {
  /** Why the manifest was refused, if it was. */
  readonly errors: string[];
  private readonly tracks: Record<string, ManifestTrack | ManifestStinger>;

  constructor(raw: unknown) {
    this.errors = raw === null ? ['no manifest'] : manifestErrors(raw);
    this.tracks = this.errors.length === 0 ? (raw as MusicManifest).tracks : {};
  }

  static empty(): MusicLibrary {
    return new MusicLibrary(null);
  }

  /** Did a usable manifest load? */
  get ok(): boolean {
    return this.errors.length === 0;
  }

  /** A looping track by ID. */
  track(id: string): ManifestTrack | null {
    const t = this.tracks[id];
    return t && t.kind !== 'stinger' ? t : null;
  }

  ids(): string[] {
    return Object.keys(this.tracks);
  }

  /** The track the manifest has for this area and phase, by its own `area` and `phase` fields. */
  private find(area: string, phase: TrackPhase): [string, ManifestTrack] | null {
    for (const [id, t] of Object.entries(this.tracks))
      if (t.kind !== 'stinger' && t.area === area && t.phase === phase) return [id, t];
    return null;
  }

  /**
   * The track for an area at a time of day. A missing night track borrows the
   * day track with the night rules, and the other way round; an area with
   * neither gets the pad in the brief's key and tempo for it.
   */
  forArea(area: string, phase: RulesPhase): MusicChoice {
    const always = this.find(area, 'always');
    if (always) return choice(always[0], always[1], phase);
    const own = this.find(area, phase);
    if (own) return choice(own[0], own[1], phase);
    const other = this.find(area, phase === 'day' ? 'night' : 'day');
    if (other) return choice(other[0], other[1], phase);
    const spec =
      TRACK_SPECS.find((s) => s.area === area && s.phase === phase) ??
      TRACK_SPECS.find((s) => s.area === area);
    return spec
      ? padChoice(spec.id, spec.key, spec.bpm, phase)
      : padChoice(area, C_MAJOR, phase === 'day' ? 96 : 72, phase);
  }

  /** The menu: its own theme, else the plaza by day, else the pad. */
  forMenu(): MusicChoice {
    const menu = this.track('main_menu');
    if (menu) return choice('main_menu', menu, 'day');
    const plaza = this.forArea('area_stump_plaza', 'day');
    return plaza.track ? plaza : padChoice('main_menu', C_MAJOR, 96, 'day');
  }

  /** The unlock stinger, if the owner made one. Otherwise the synthesized fanfare plays. */
  stinger(): ManifestStinger | null {
    const s = this.tracks.stinger_unlock;
    return s && s.kind === 'stinger' ? s : null;
  }
}

/**
 * The pad's four chords, one a bar, as semitones above the tonic. They
 * stand for I, vi, IV, V (minor: i, III, iv, v) but use only the key's
 * pentatonic notes, so nothing the toys play can clash with them.
 */
export function padChords(mode: MusicKey['mode']): number[][] {
  return mode === 'major'
    ? [
        [0, 4, 7],
        [-3, 0, 4],
        [-3, 2, 7],
        [-5, 2, 4],
      ]
    : [
        [0, 3, 7],
        [3, 7, 10],
        [-2, 3, 5],
        [-5, 0, 3],
      ];
}
