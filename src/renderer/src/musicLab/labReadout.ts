// The Music Lab's readout: what the music engine reports, in plain words. Pure.

import type { MusicLayer } from '../../../shared/music';
import { keyName } from '../../../shared/music';
import type { MusicReport } from '../audio/musicEngine';
import type { MusicLibrary } from '../audio/musicManifest';
import type { MixState } from '../audio/musicMix';
import type { LabArea } from './labPlan';
import { clockWords, trackTitle } from './labPlan';

/** The four layers by the names the owner knows them by. */
export const LAYER_WORDS: Record<MusicLayer, string> = {
  drums: 'Drums',
  bass: 'Bass',
  harmony: 'Harmony',
  lead: 'Lead (tune)',
};

/** `85%` for a gain of 0.85. */
export const percent = (gain: number): string => `${Math.round(gain * 100)}%`;

/** Why the layers are where they are: the mix rules in force. */
export function mixReasons(s: MixState): string[] {
  const out: string[] = [];
  if (s.thinning) out.push('dusk or dawn is close, so the drums and the tune thin out');
  if (s.raining)
    out.push(s.sheltered ? 'rain outside, tune a little softer' : 'rain: drums off, tune softer');
  if (s.playerMusic) out.push('the player is making music, so the tune dips');
  if (s.seqDrums) out.push('the mushroom drums are playing, so the drums halve');
  if (s.bugPlaying) out.push('a bug is playing an instrument, so the tune halves');
  if (s.antHillNight) out.push('the ants are asleep');
  if (s.busy) out.push('a busy scene, so the tune is at full');
  else if (s.idle >= 45) out.push('nobody has touched anything for a while, so the tune is softer');
  if (s.paused) out.push('paused');
  if (s.stinger) out.push('an area just opened');
  return out;
}

/** The lines of the readout, top to bottom. */
export function readoutLines(r: MusicReport, library: MusicLibrary, areas: readonly LabArea[]): string[] {
  if (r.playing === '') return ['Playing: nothing yet (the music is loading).'];
  const pad = r.playing.startsWith('pad:');
  // The track's own key and tempo: the music clock takes them up half way through a crossfade.
  const track = library.track(r.playing);
  const lines = [
    pad
      ? `Playing: pad, standing in for ${r.playing.slice(4)}`
      : `Playing: ${trackTitle(r.playing, library, areas)} (${r.playing})`,
    `Key: ${track ? keyName(track.key) : r.key}.  Speed: ${track?.bpm ?? r.bpm} beats a minute.  Mix: ${r.state.rules} rules.`,
  ];
  if (r.position !== null && r.loopSeconds !== null) {
    const bars = track?.loop.bars ?? 1;
    const barSeconds = r.loopSeconds / bars;
    const bar = Math.min(bars, Math.floor(r.position / barSeconds) + 1);
    lines.push(
      `Loop: ${clockWords(Math.floor(r.position))} of ${clockWords(r.loopSeconds)}, bar ${bar} of ${bars}.`,
    );
  } else lines.push('The pad has no loop and no layers to mute.');
  if (r.fading && r.target === r.playing) lines.push('Crossfading into this now.');
  else if (r.target !== r.playing)
    lines.push(`Next: ${r.target.startsWith('pad:') ? 'pad' : trackTitle(r.target, library, areas)}.`);
  const why = mixReasons(r.state);
  lines.push(why.length > 0 ? `Mix notes: ${why.join('; ')}.` : 'Mix notes: the plain mix.');
  return lines;
}
