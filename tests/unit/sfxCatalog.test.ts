import { describe, expect, it } from 'vitest';
import { SFX_NAMES } from '../../src/renderer/src/audio/sfx';
import {
  AREA_BEDS,
  SFX_ALIASES,
  SFX_CATALOG,
  SYNTH_ONLY,
  WEATHER_BEDS,
  nearestFolder,
} from '../../src/shared/sfx';

// The sample catalog (docs/08-sound-brief.md, part 6.2): a rename in sfx.ts
// must not silently orphan a folder, and a new sound has to choose between a
// folder, an alias, and the synth.

const names = new Set<string>(SFX_NAMES);
const beds = new Set<string>([...WEATHER_BEDS, ...Object.values(AREA_BEDS).flatMap((b) => [b.day, b.night])]);

describe('sfx catalog', () => {
  it('names a real sound, a bed, or an alias target for every folder', () => {
    const targets = new Set(Object.values(SFX_ALIASES).map((a) => a.folder));
    for (const folder of Object.keys(SFX_CATALOG))
      expect(names.has(folder) || beds.has(folder) || targets.has(folder), folder).toBe(true);
  });

  it('borrows only folders that exist, for sounds that exist', () => {
    for (const [name, alias] of Object.entries(SFX_ALIASES)) {
      expect(names.has(name), name).toBe(true);
      if (alias.folder !== 'impact_*') expect(SFX_CATALOG[alias.folder], name).toBeDefined();
      expect(SFX_CATALOG[name], `${name} is both a folder and an alias`).toBeUndefined();
    }
  });

  it('makes every sound choose: a folder, an alias, or the synth', () => {
    const missing = [...names].filter((n) => !SFX_CATALOG[n] && !SFX_ALIASES[n] && !SYNTH_ONLY.includes(n));
    expect(missing).toEqual([]);
    const stray = SYNTH_ONLY.filter((n) => !names.has(n) || SFX_CATALOG[n] || SFX_ALIASES[n]);
    expect(stray).toEqual([]);
  });

  it('has 36 one-shot folders and a bed for every area and the weather', () => {
    const entries = Object.entries(SFX_CATALOG);
    expect(entries.filter(([, e]) => e.kind === 'oneshot')).toHaveLength(36);
    for (const b of beds) expect(SFX_CATALOG[b]?.kind, b).toBe('bed');
  });

  it('suggests the nearest folder for a typo', () => {
    expect(nearestFolder('splosh')).toBe('splash');
    expect(nearestFolder('impact_woood')).toBe('impact_wood');
  });
});
