// Music data shared by the importer (scripts/music) and the renderer's music
// player: the track list from docs/05-music-brief.md section 2.1, keys and
// pentatonic scales, and the manifest the importer writes. Pure, no imports,
// so Node can run it as is (type stripping) and Vite can bundle it.

/** The four game layers a track is split into (brief section 1). */
export const MUSIC_LAYERS = ['drums', 'bass', 'harmony', 'lead'] as const;
export type MusicLayer = (typeof MUSIC_LAYERS)[number];

export type KeyMode = 'major' | 'minor';
export type TrackPhase = 'day' | 'night' | 'always';

export interface MusicKey {
  /** Pitch class name: C, C#, D, ... B (sharps only). */
  tonic: string;
  mode: KeyMode;
}

/** What the brief asks Suno for: the target key and tempo of each track. */
export interface TrackSpec {
  id: string;
  /** The area the track plays in; absent for the menu and the stinger. */
  area?: string;
  phase: TrackPhase;
  key: MusicKey;
  bpm: number;
  kind?: 'stinger';
}

const k = (tonic: string, mode: KeyMode): MusicKey => ({ tonic, mode });

/** The sixteen cues of brief section 2.1. */
export const TRACK_SPECS: readonly TrackSpec[] = [
  { id: 'main_menu', phase: 'always', key: k('C', 'major'), bpm: 96 },
  { id: 'stump_plaza_day', area: 'area_stump_plaza', phase: 'day', key: k('C', 'major'), bpm: 96 },
  { id: 'stump_plaza_night', area: 'area_stump_plaza', phase: 'night', key: k('A', 'minor'), bpm: 72 },
  { id: 'puddle_pond_day', area: 'area_puddle_pond', phase: 'day', key: k('G', 'major'), bpm: 96 },
  { id: 'puddle_pond_night', area: 'area_puddle_pond', phase: 'night', key: k('E', 'minor'), bpm: 72 },
  { id: 'flowerbed_stage_day', area: 'area_flowerbed_stage', phase: 'day', key: k('D', 'major'), bpm: 96 },
  {
    id: 'flowerbed_stage_night',
    area: 'area_flowerbed_stage',
    phase: 'night',
    key: k('B', 'minor'),
    bpm: 72,
  },
  { id: 'under_porch_day', area: 'area_under_porch', phase: 'day', key: k('A', 'minor'), bpm: 96 },
  { id: 'under_porch_night', area: 'area_under_porch', phase: 'night', key: k('A', 'minor'), bpm: 72 },
  { id: 'compost_lab_day', area: 'area_compost_lab', phase: 'day', key: k('E', 'minor'), bpm: 96 },
  { id: 'compost_lab_night', area: 'area_compost_lab', phase: 'night', key: k('E', 'minor'), bpm: 72 },
  {
    id: 'treehouse_arcade_day',
    area: 'area_treehouse_arcade',
    phase: 'day',
    key: k('D', 'major'),
    bpm: 96,
  },
  {
    id: 'treehouse_arcade_night',
    area: 'area_treehouse_arcade',
    phase: 'night',
    key: k('B', 'minor'),
    bpm: 72,
  },
  { id: 'ant_hill_depths', area: 'area_ant_hill_depths', phase: 'always', key: k('D', 'minor'), bpm: 96 },
  { id: 'gnome_hollow', area: 'area_gnome_hollow', phase: 'always', key: k('G', 'major'), bpm: 72 },
  { id: 'stinger_unlock', phase: 'always', key: k('C', 'major'), bpm: 96, kind: 'stinger' },
];

export function trackSpec(id: string): TrackSpec | undefined {
  return TRACK_SPECS.find((t) => t.id === id);
}

// --- Pitch --------------------------------------------------------------------

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const FLATS: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

/** A pitch class (0 is C) from a name like `C`, `F#`, `Bb`, or -1. */
export function pitchClass(name: string): number {
  const n = FLATS[name] ?? name;
  return PITCH_NAMES.indexOf(n as (typeof PITCH_NAMES)[number]);
}

/** Pentatonic steps above the tonic: major `[0, 2, 4, 7, 9]`, minor `[0, 3, 5, 7, 10]`. */
export function pentatonic(mode: KeyMode): number[] {
  return mode === 'major' ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
}

/** The pitch classes of a key's pentatonic scale, sorted. */
export function scalePitchClasses(key: MusicKey): number[] {
  const t = pitchClass(key.tonic);
  return pentatonic(key.mode)
    .map((s) => (t + s) % 12)
    .sort((a, b) => a - b);
}

/** Do two keys share the same pentatonic notes (the same key, or relative major and minor)? */
export function sameNotes(a: MusicKey, b: MusicKey): boolean {
  const x = scalePitchClasses(a);
  const y = scalePitchClasses(b);
  return x.every((p, i) => p === y[i]);
}

/** `C major`, `A minor`. */
export function keyName(key: MusicKey): string {
  return `${key.tonic} ${key.mode}`;
}

/** Parse `C major`, `F# minor`, `Bb major`; null if it isn't one. */
export function parseKey(text: string): MusicKey | null {
  const m = /^\s*([A-G](?:#|b)?)\s+(major|minor)\s*$/i.exec(text);
  if (!m) return null;
  const raw = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  const tonic = FLATS[raw] ?? raw;
  if (pitchClass(tonic) < 0) return null;
  return { tonic, mode: m[2]!.toLowerCase() as KeyMode };
}

// --- Manifest -----------------------------------------------------------------

export const MANIFEST_VERSION = 1;
export const MUSIC_SAMPLE_RATE = 48000;

export interface ManifestKey extends MusicKey {
  confidence: number;
  /** Where the key came from: the detector, the brief's target, or overrides.json. */
  source: 'detected' | 'target' | 'override';
}

export interface ManifestLoop {
  /** The loop body's exact length in samples at 48 kHz (E - S). */
  samples: number;
  /**
   * Where the body starts in each layer file, in samples. The file holds a
   * little of the body's end before it and of its start after it, so the
   * codec's warm-up never lands on the seam: loop from `start` to
   * `start + samples`.
   */
  start: number;
  bars: number;
  /** Where the body starts in the source song, in seconds. */
  sourceStart: number;
  score: number;
}

export interface ManifestTrack {
  kind?: undefined;
  area?: string;
  phase: TrackPhase;
  /** The tempo the layers play at (conformed onto the target when close). */
  bpm: number;
  bpmDetected: number;
  beatsPerBar: number;
  key: ManifestKey;
  /** Pitch classes relative to the tonic. */
  scale: number[];
  loop: ManifestLoop;
  /** Layer name to file, relative to the manifest. A track without stems has only `full`. */
  layers: Partial<Record<MusicLayer | 'full', string>>;
  /** Each source stem and where it went: a layer, or why it was dropped. */
  stems: Record<string, string>;
  warnings: string[];
  source: { hash: string; link?: string; importedAt: string };
}

export interface ManifestStinger {
  kind: 'stinger';
  file: string;
  samples: number;
}

export interface MusicManifest {
  version: number;
  sampleRate: number;
  lufs: number;
  tracks: Record<string, ManifestTrack | ManifestStinger>;
}

export function emptyManifest(): MusicManifest {
  return { version: MANIFEST_VERSION, sampleRate: MUSIC_SAMPLE_RATE, lufs: -18, tracks: {} };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * Check a manifest's shape. Returns the problems found (empty when it is
 * good). The renderer runs this on load and plays the fallback pad for a
 * manifest that fails; a unit test runs it on the committed one.
 */
export function manifestErrors(raw: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(raw)) return ['manifest is not an object'];
  if (raw.version !== MANIFEST_VERSION) errors.push(`version is ${String(raw.version)}`);
  if (raw.sampleRate !== MUSIC_SAMPLE_RATE) errors.push('sampleRate must be 48000');
  if (!isNum(raw.lufs)) errors.push('lufs is missing');
  if (!isObj(raw.tracks)) return [...errors, 'tracks is missing'];
  for (const [id, t] of Object.entries(raw.tracks)) {
    const bad = (why: string): void => void errors.push(`${id}: ${why}`);
    if (!/^[a-z0-9_]+$/.test(id)) bad('track ID must be lowercase snake_case');
    if (!isObj(t)) {
      bad('not an object');
      continue;
    }
    if (t.kind === 'stinger') {
      if (!isStr(t.file)) bad('stinger file missing');
      if (!isNum(t.samples) || t.samples <= 0) bad('stinger samples missing');
      continue;
    }
    if (t.kind !== undefined) bad(`unknown kind ${String(t.kind)}`);
    if (t.area !== undefined && !isStr(t.area)) bad('area must be a string');
    if (t.phase !== 'day' && t.phase !== 'night' && t.phase !== 'always')
      bad('phase must be day, night, or always');
    if (!isNum(t.bpm) || t.bpm < 40 || t.bpm > 220) bad('bpm out of range');
    if (!isNum(t.bpmDetected)) bad('bpmDetected missing');
    if (t.beatsPerBar !== 3 && t.beatsPerBar !== 4) bad('beatsPerBar must be 3 or 4');
    const key = t.key;
    if (!isObj(key) || !isStr(key.tonic) || pitchClass(key.tonic) < 0) bad('key tonic is not a pitch name');
    else if (key.mode !== 'major' && key.mode !== 'minor') bad('key mode must be major or minor');
    else if (!isNum(key.confidence)) bad('key confidence missing');
    else if (key.source !== 'detected' && key.source !== 'target' && key.source !== 'override')
      bad('key source must be detected, target, or override');
    if (
      !Array.isArray(t.scale) ||
      t.scale.length !== 5 ||
      !t.scale.every((s) => Number.isInteger(s) && (s as number) >= 0 && (s as number) < 12)
    )
      bad('scale must hold five pitch classes');
    else if (isObj(key) && (key.mode === 'major' || key.mode === 'minor')) {
      const want = pentatonic(key.mode);
      if (!want.every((s, i) => s === (t.scale as number[])[i])) bad('scale does not match the key mode');
    }
    const loop = t.loop;
    if (!isObj(loop)) bad('loop missing');
    else {
      if (!Number.isInteger(loop.samples) || (loop.samples as number) <= 0)
        bad('loop samples must be positive');
      if (!Number.isInteger(loop.start) || (loop.start as number) < 0) bad('loop start must be 0 or more');
      if (!Number.isInteger(loop.bars) || (loop.bars as number) <= 0) bad('loop bars must be positive');
      if (!isNum(loop.sourceStart) || !isNum(loop.score)) bad('loop sourceStart and score missing');
    }
    const layers = t.layers;
    if (!isObj(layers) || Object.keys(layers).length === 0) bad('no layers');
    else
      for (const [name, file] of Object.entries(layers)) {
        if (name !== 'full' && !(MUSIC_LAYERS as readonly string[]).includes(name))
          bad(`unknown layer ${name}`);
        if (!isStr(file) || !file.endsWith('.ogg')) bad(`layer ${name} file must be an .ogg path`);
      }
    if (!isObj(t.stems)) bad('stems missing');
    if (!Array.isArray(t.warnings) || !t.warnings.every(isStr)) bad('warnings must be strings');
    if (!isObj(t.source) || !isStr(t.source.hash)) bad('source hash missing');
  }
  return errors;
}
