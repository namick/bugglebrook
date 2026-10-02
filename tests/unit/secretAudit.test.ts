import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/game';

// M10's audit (game design doc, section 12): every secret in the data has a
// trigger in the sim, or says why it is blocked.

const GAME = join(__dirname, '../../src/game');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** The sim's code, without the data files that only list secrets. */
const CODE = sources(GAME)
  .filter((p) => !p.includes(join('src', 'game', 'data')))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

/**
 * How a secret is found: named in the sim's code, or found through its def
 * (an area's barrier finds the secret that unlocks it; `Cast` finds a bug's
 * `foundBy`).
 */
function triggerOf(id: string): string | null {
  if (CODE.includes(`'${id}'`)) return 'code';
  const def = CONTENT.secrets.get(id);
  if (def.unlocks.some((u) => u.kind === 'area' && CONTENT.areas.has(u.id))) return 'barrier';
  if (CONTENT.bugs.all.some((b) => b.foundBy === id)) return 'cast';
  return null;
}

describe('secret audit', () => {
  it('lists all 67 secrets of section 12', () => {
    expect(CONTENT.secrets.all).toHaveLength(67);
  });

  it('every secret has a trigger in the sim, or is blocked with a reason', () => {
    const missing = CONTENT.secrets.all
      .filter((s) => !s.blocked && triggerOf(s.id) === null)
      .map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('a blocked secret has no trigger yet', () => {
    const early = CONTENT.secrets.all.filter((s) => s.blocked && triggerOf(s.id) !== null).map((s) => s.id);
    expect(early).toEqual([]);
  });
});
