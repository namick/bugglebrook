// Voice limits for sample playback (docs/08-sound-brief.md, part 6.4): a cap
// per folder and 24 sample voices in all. Over a limit, the oldest voice of
// that folder (or, for the total, the oldest of all) is stolen. Pure.

import { MAX_SAMPLE_VOICES } from './sfxCatalog';

interface Voice {
  id: number;
  folder: string;
  start: number;
  end: number;
}

export class VoicePool {
  private voices: Voice[] = [];

  constructor(private readonly total = MAX_SAMPLE_VOICES) {}

  /** Voices still sounding at `now` (seconds). */
  active(now: number): number {
    this.expire(now);
    return this.voices.length;
  }

  count(folder: string, now: number): number {
    this.expire(now);
    return this.voices.filter((v) => v.folder === folder).length;
  }

  /**
   * Add voice `id` of `folder`, lasting until `end`, keeping at most `limit`
   * of that folder. Returns the IDs of the voices to stop.
   */
  admit(id: number, folder: string, limit: number, now: number, end: number): number[] {
    this.expire(now);
    const steal: number[] = [];
    const take = (v: Voice): void => {
      steal.push(v.id);
      this.voices.splice(this.voices.indexOf(v), 1);
    };
    const mine = this.voices.filter((v) => v.folder === folder);
    for (let i = 0; i <= mine.length - Math.max(1, limit); i++) take(mine[i]!);
    while (this.voices.length >= this.total) take(this.voices[0]!);
    this.voices.push({ id, folder, start: now, end });
    return steal;
  }

  private expire(now: number): void {
    if (this.voices.some((v) => v.end <= now)) this.voices = this.voices.filter((v) => v.end > now);
  }
}
