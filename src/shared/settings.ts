/**
 * Player settings (game design doc, section 17). Stored per machine in
 * `settings.json` in the user-data folder, never in a save slot. Main and
 * the renderer both use this module, so it stays free of Node and DOM.
 */
export interface Settings {
  /** Music volume, 0 to 100. */
  music: number;
  /** Sound effects volume, 0 to 100. */
  sfx: number;
  /** Bug voices volume, 0 to 100. */
  voices: number;
  fullscreen: boolean;
  /** Less squash, no screen shake or flashes, half the particles, gentler camera coasting. */
  reduceMotion: boolean;
  /** Pan the camera while carrying something to the screen's edge. */
  edgeScroll: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  music: 70,
  sfx: 80,
  voices: 80,
  fullscreen: true,
  reduceMotion: false,
  edgeScroll: true,
};

const VOLUMES = ['music', 'sfx', 'voices'] as const;
const TOGGLES = ['fullscreen', 'reduceMotion', 'edgeScroll'] as const;

/**
 * Turn anything (a parsed file, an IPC argument) into valid settings.
 * Volumes are rounded and clamped to 0 to 100; anything missing or of the
 * wrong type takes the default; unknown keys are dropped.
 */
export function normalizeSettings(raw: unknown, defaults: Readonly<Settings> = DEFAULT_SETTINGS): Settings {
  const src =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Settings = { ...defaults };
  for (const k of VOLUMES) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(Math.max(0, Math.min(100, v)));
  }
  for (const k of TOGGLES) {
    const v = src[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}
