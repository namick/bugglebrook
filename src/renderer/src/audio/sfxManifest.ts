// The built sample manifest (docs/08-sound-brief.md, part 6.4): which sounds
// have samples, and which folder (with what tweaks) a game sound plays. Pure:
// the engine fetches the JSON and hands it in.

import type { Material } from './sfx';
import {
  SFX_ALIASES,
  SFX_CATALOG,
  type CatalogEntry,
  type SfxAlias,
  type SfxManifest,
  type SfxSound,
} from './sfxCatalog';
import { emptySfxManifest, sfxManifestErrors } from '../../../shared/sfx';

export interface Resolved {
  folder: string;
  sound: SfxSound;
  entry: CatalogEntry;
  /** The alias's tweaks, or none when the sound has its own folder. */
  alias: SfxAlias | null;
}

export class SfxLibrary {
  readonly manifest: SfxManifest;
  /** Why the manifest was refused, if it was. */
  readonly errors: string[];

  constructor(data: unknown) {
    this.errors = data === null ? [] : sfxManifestErrors(data);
    this.manifest = data !== null && this.errors.length === 0 ? (data as SfxManifest) : emptySfxManifest();
  }

  get empty(): boolean {
    return Object.keys(this.manifest.sounds).length === 0 && Object.keys(this.manifest.voices).length === 0;
  }

  sound(folder: string): SfxSound | null {
    return this.manifest.sounds[folder] ?? null;
  }

  /**
   * The folder a game sound plays, or null for the synth. A folder of its own
   * wins over an alias (part 2.10). `drop` borrows the material's impact.
   * Beds never play as one-shots (`board_patter` is both a synth tick and a bed).
   */
  resolve(name: string, material: Material = 'wood'): Resolved | null {
    const own = this.manifest.sounds[name];
    if (own?.kind === 'oneshot' && SFX_CATALOG[name])
      return { folder: name, sound: own, entry: SFX_CATALOG[name], alias: null };
    const alias = SFX_ALIASES[name];
    if (!alias) return null;
    const folder = alias.folder === 'impact_*' ? `impact_${material}` : alias.folder;
    const sound = this.manifest.sounds[folder];
    const entry = SFX_CATALOG[folder];
    if (sound?.kind !== 'oneshot' || !entry) return null;
    return { folder, sound, entry, alias: alias.folder === 'impact_*' ? null : alias };
  }

  /** Every one-shot file, for loading at slot open. */
  oneShotFiles(): string[] {
    return Object.values(this.manifest.sounds)
      .filter((s) => s.kind === 'oneshot')
      .flatMap((s) => s.takes.map((t) => t.file));
  }

  /** Her voice clips for an emotion (part 4), or none. */
  voiceClips(emotion: string): SfxManifest['voices'][string] {
    return this.manifest.voices[emotion] ?? [];
  }

  get hasVoices(): boolean {
    return Object.values(this.manifest.voices).some((c) => c.length > 0);
  }
}
