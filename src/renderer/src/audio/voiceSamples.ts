// The artist's own voice for the bugs (docs/08-sound-brief.md, part 4.3),
// optional and off by default. A bug's line is built as always (emotion,
// mood, potions, its `VoiceProfile`); here each syllable becomes one of her
// recorded clips, sped up or slowed down to land on the syllable's pitch,
// colored with the syllable's vowel formants and a texture per bug wave.
// Pure: it turns the synth line into sample plays.

import type { Rng } from '../../../game/core/rng';
import type { VoiceClip } from './sfxCatalog';
import type { SamplePlay, Texture } from './samplePlayer';
import type { Tone, Wave } from './synth';

/** Her clip is pitched at most an octave either way, so it stays charming, not garbled. */
export const MAX_SHIFT = 2;
/** The synth chirp under her clip, so each bug keeps its identity. */
export const CHIRP_UNDER = 0.15;
/** Her clips are mastered near the synth's loudness: this maps a syllable's gain to sample gain. */
const GAIN = 2.4;

export const TEXTURE: Readonly<Record<Wave, Texture>> = {
  sine: 'clean',
  triangle: 'soft',
  square: 'grit',
  sawtooth: 'buzz',
};

export interface RecordedLine {
  plays: SamplePlay[];
  /** The synth's consonants, huffs, and a quiet chirp under each syllable. */
  tones: Tone[];
}

/**
 * Turn a synth line into her clips. Syllables (the tones with formants)
 * become clips; everything else (consonant clicks, huffs) stays synth.
 * `tremble` adds a tremolo (Whiff).
 */
export function recordedLine(
  line: readonly Tone[],
  clips: readonly VoiceClip[],
  wave: Wave,
  rng: Rng,
  tremble = false,
): RecordedLine {
  const plays: SamplePlay[] = [];
  const tones: Tone[] = [];
  for (const tone of line) {
    if (!tone.formants || clips.length === 0) {
      tones.push(tone);
      continue;
    }
    const clip = rng.pick(clips);
    const pitch = clip.pitchHz > 0 ? clip.pitchHz : 220;
    const rate = Math.max(1 / MAX_SHIFT, Math.min(MAX_SHIFT, tone.freq / pitch));
    plays.push({
      file: clip.file,
      bus: 'voice',
      delay: tone.delay ?? 0,
      rate,
      gain: (tone.gain ?? 0.3) * GAIN,
      pan: 0,
      // Long enough for the syllable, never past the clip's end.
      duration: Math.min(clip.dur, Math.max(tone.dur * rate * 1.2, 0.08)),
      formants: tone.formants,
      texture: TEXTURE[wave],
      ...(tone.vibrato
        ? { vibrato: { rate: tone.vibrato.rate, depth: (tone.vibrato.depth / tone.freq) * rate } }
        : {}),
      ...(tremble ? { tremolo: 9 } : {}),
    });
    tones.push({ ...tone, gain: (tone.gain ?? 0.3) * CHIRP_UNDER });
  }
  return { plays, tones };
}
