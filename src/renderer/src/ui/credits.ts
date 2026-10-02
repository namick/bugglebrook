import raw from '../../../../art/CREDITS.json';
import type { SoundCredits } from '../../../shared/sfx';
import { creditText, soundCreditErrors } from '../../../shared/sfx';

/**
 * Who made the game, for the credits board. The names live in one place,
 * `art/CREDITS.json`, so the artist (and the owner) can change them without
 * touching code. Pure.
 */

export type CreditRole = 'art' | 'music' | 'sound' | 'voices' | 'code';

export const CREDIT_ROLES: readonly CreditRole[] = ['art', 'music', 'sound', 'voices', 'code'];

/**
 * The attribution lines for recorded sounds (docs/08-sound-brief.md, part
 * 5.2), from the importer's `credits.json`: one per credited sound, then a
 * thank-you to the CC0 authors. Empty while every sound is synthesized.
 */
export function soundCreditLines(data: unknown): string[] {
  if (soundCreditErrors(data).length) return [];
  const c = data as SoundCredits;
  const out = c.credits.map(creditText);
  if (c.thanks.length) out.push(`With thanks for their CC0 sounds: ${c.thanks.join(', ')}.`);
  return out;
}

export interface CreditLine {
  role: CreditRole;
  name: string;
}

/** The longest name the board has room for. */
export const MAX_CREDIT = 40;

/** The board's lines from the credits file: one per role with a name, trimmed and kept short. */
export function creditLines(data: unknown): CreditLine[] {
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const out: CreditLine[] = [];
  for (const role of CREDIT_ROLES) {
    const v = obj[role];
    if (typeof v !== 'string') continue;
    const name = v.trim().replace(/\s+/g, ' ').slice(0, MAX_CREDIT);
    if (name) out.push({ role, name });
  }
  return out;
}

/** The game's credits. */
export const CREDITS: readonly CreditLine[] = creditLines(raw);
