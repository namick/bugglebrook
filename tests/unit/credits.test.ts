import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CREDITS,
  CREDIT_ROLES,
  MAX_CREDIT,
  creditLines,
  soundCreditLines,
} from '../../src/renderer/src/ui/credits';

const FILE = join(resolve(import.meta.dirname, '../..'), 'art/CREDITS.json');

describe('credits', () => {
  it('come from art/CREDITS.json, one line per role with a name', () => {
    const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>;
    expect(CREDITS.map((l) => l.role)).toEqual(CREDIT_ROLES.filter((r) => raw[r]?.trim()));
    for (const l of CREDITS) expect(l.name).toBe(raw[l.role]!.trim());
    expect(CREDITS.find((l) => l.role === 'art')).toBeDefined();
  });

  it('skip empty or missing names, tidy spaces, and keep long names short', () => {
    expect(creditLines({ art: '  Ada   Bee ', music: '', code: 7 })).toEqual([
      { role: 'art', name: 'Ada Bee' },
    ]);
    expect(creditLines(null)).toEqual([]);
    expect(creditLines({ art: 'x'.repeat(90) })[0]!.name).toHaveLength(MAX_CREDIT);
  });

  it('list each credited sound, then thank the CC0 authors', () => {
    expect(
      soundCreditLines({
        credits: [
          { title: 'Splash', author: 'someone', url: 'https://f/1', license: 'cc-by-4.0', folder: 'splash' },
          { title: 'Tok', author: 'other', url: 'https://f/2', license: 'oga-by', folder: 'impact_wood' },
        ],
        thanks: ['Kenney'],
      }),
    ).toEqual([
      '"Splash" by someone (CC BY 4.0) https://f/1',
      '"Tok" by other (OGA-BY 3.0) https://f/2',
      'With thanks for their CC0 sounds: Kenney.',
    ]);
    expect(soundCreditLines({ credits: [], thanks: [] })).toEqual([]);
    expect(soundCreditLines(null)).toEqual([]);
  });
});
