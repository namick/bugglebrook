// A small stand-in sample manifest for tests (docs/08-sound-brief.md, part
// 6.8): CI has none of the owner's sounds, so tests install this one and
// watch which takes play. Its "files" are short generated tones (`fixtureTone`)
// wherever something really decodes them. Pure.

import { SFX_CATALOG, VOICE_FILES, emptySfxManifest, type SfxManifest } from '../../../shared/sfx';

/** Every one-shot folder and bed by default, three takes each; voices only when asked. */
export function fixtureManifest(
  folders: readonly string[] = Object.keys(SFX_CATALOG),
  takes = 3,
  voices = false,
): SfxManifest {
  const m = emptySfxManifest();
  for (const folder of folders) {
    const entry = SFX_CATALOG[folder];
    if (!entry) continue;
    m.sounds[folder] =
      entry.kind === 'bed'
        ? {
            kind: 'bed',
            category: entry.category,
            takes: [{ file: `${folder}/0.ogg`, dur: 4, loopStart: 0.1 }],
          }
        : {
            kind: 'oneshot',
            category: entry.category,
            takes: Array.from({ length: takes }, (_, i) => ({
              file: `${folder}/${i}.ogg`,
              dur: 0.2 + 0.05 * i,
            })),
          };
  }
  if (voices)
    for (const emotion of VOICE_FILES.slice(0, 14))
      m.voices[emotion] = [0, 1, 2].map((i) => ({
        file: `voices/${emotion}/${i}.ogg`,
        dur: 0.3,
        pitchHz: 260 + 20 * i,
      }));
  return m;
}

/** A take's samples: a decaying tone, pitched by its file name so takes differ. Mono, 48 kHz. */
export function fixtureTone(file: string, seconds: number): Float32Array<ArrayBuffer> {
  let h = 0;
  for (const c of file) h = (h * 31 + c.charCodeAt(0)) % 997;
  const hz = 300 + h;
  const n = Math.round(seconds * 48000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / 48000) * Math.exp((-3 * i) / n);
  return out;
}
