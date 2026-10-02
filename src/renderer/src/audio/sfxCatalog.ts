// The renderer's view of the sample catalog (docs/08-sound-brief.md, part
// 6.4): the shared table plus the runtime limits. Pure.

export {
  AREA_BEDS,
  SFX_ALIASES,
  SFX_CATALOG,
  SYNTH_ONLY,
  WEATHER_BEDS,
  type CatalogEntry,
  type SfxAlias,
  type SfxManifest,
  type SfxSound,
  type SfxTake,
  type VoiceClip,
} from '../../../shared/sfx';

/** Sample voices sounding at once, across every folder (the synth keeps its own 32). */
export const MAX_SAMPLE_VOICES = 24;

/** Random gain either way, dB. */
export const GAIN_JITTER_DB = 1.5;

/** Intensity 0 plays this much quieter (dB) and through this low-pass (Hz); 1 is full and open. */
export const QUIET_DB = -18;
export const DARK_HZ = 1500;
export const OPEN_HZ = 20000;

/** How long a stolen voice takes to fade, seconds. */
export const STEAL_FADE = 0.015;
