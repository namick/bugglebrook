import raw from '../../../../art/CREDITS.json';

/**
 * Who made the game, for the credits board. The names live in one place,
 * `art/CREDITS.json`, so the artist (and the owner) can change them without
 * touching code. Pure.
 */

export type CreditRole = 'art' | 'music' | 'code';

export const CREDIT_ROLES: readonly CreditRole[] = ['art', 'music', 'code'];

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
