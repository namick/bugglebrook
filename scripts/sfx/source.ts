// `source.txt`, where every sound file came from (docs/08-sound-brief.md,
// part 3.2), and the license rules of part 5. Pure.

import type { SfxLicense } from '../../src/shared/sfx.ts';
import { LICENSES, NEEDS_CREDIT, NEEDS_TITLE, REPO_SAFE } from '../../src/shared/sfx.ts';

export interface SourceBlock {
  /** The file name or glob (`*` matches anything); absent when one block covers the folder. */
  file?: string;
  url?: string;
  license?: string;
  author?: string;
  title?: string;
  /** Keep only this part, seconds. */
  trim?: [number, number];
  /** `split: no` keeps the file whole. */
  split: boolean;
  downloaded?: string;
  /** Line number of the block's first line, for messages. */
  line: number;
}

const KEYS = ['file', 'url', 'license', 'author', 'title', 'trim', 'split', 'downloaded'] as const;

/** `m:ss.s` or `ss.s` to seconds, or NaN. */
export function parseTime(t: string): number {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t.trim());
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

/** Read `source.txt`: blocks separated by blank lines. Unknown lines are ignored; bad values are errors. */
export function parseSource(text: string): { blocks: SourceBlock[]; errors: string[] } {
  const blocks: SourceBlock[] = [];
  const errors: string[] = [];
  let cur: SourceBlock | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      cur = null;
      return;
    }
    const m = /^([a-z]+)\s*:\s*(.*)$/i.exec(line);
    const key = m?.[1]!.toLowerCase();
    if (!m || !(KEYS as readonly string[]).includes(key!)) return;
    if (!cur) {
      cur = { split: true, line: i + 1 };
      blocks.push(cur);
    }
    const value = m[2]!.trim();
    const block: SourceBlock = cur;
    switch (key) {
      case 'trim': {
        const [a, b] = value.split('-').map(parseTime);
        if (a === undefined || b === undefined || !(b! > a!))
          errors.push(`line ${i + 1}: bad trim "${value}"`);
        else block.trim = [a, b];
        break;
      }
      case 'split':
        block.split = !/^(no|false|off)$/i.test(value);
        break;
      case 'license':
        block.license = value.toLowerCase();
        break;
      default:
        block[key as 'file' | 'url' | 'author' | 'title' | 'downloaded'] = value;
    }
  });
  return { blocks, errors };
}

/** Does a `file:` pattern (with `*`) match a file name? */
export function globMatch(pattern: string, name: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split('*')
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i',
  );
  return re.test(name);
}

/** The block for a file: the first whose pattern matches, or the folder's only block if it has no `file:`. */
export function blockFor(blocks: readonly SourceBlock[], file: string): SourceBlock | null {
  const named = blocks.find((b) => b.file !== undefined && globMatch(b.file, file));
  if (named) return named;
  const open = blocks.filter((b) => b.file === undefined);
  return open.length === 1 && blocks.length === 1 ? open[0]! : null;
}

/** Why a license word is refused, or null if it is fine (part 5.1 and 5.3). */
export function licenseProblem(license: string | undefined, publicRepo: boolean): string | null {
  if (!license) return 'no license';
  if (/(^|-)nc(-|$)|noncommercial/i.test(license)) return `"${license}" is NonCommercial: never usable`;
  if (/remarc|bbc/i.test(license)) return `"${license}" (BBC RemArc) is not for commercial use`;
  if (!(LICENSES as readonly string[]).includes(license))
    return `"${license}" is not on the list (${LICENSES.join(', ')})`;
  if (publicRepo && !REPO_SAFE.includes(license as SfxLicense))
    return `"${license}" files may not sit in a public repo (set "publicRepo": false in assets/sfx/config.json once it is private)`;
  return null;
}

/** Everything wrong with one file's block. */
export function blockProblems(b: SourceBlock | null, file: string, publicRepo: boolean): string[] {
  if (!b) return [`${file}: no block in source.txt`];
  const out: string[] = [];
  const lic = licenseProblem(b.license, publicRepo);
  if (lic) out.push(`${file}: ${lic}`);
  if (!b.url) out.push(`${file}: no url`);
  if (!b.author) out.push(`${file}: no author`);
  if (b.license && NEEDS_TITLE.includes(b.license as SfxLicense) && !b.title)
    out.push(`${file}: ${b.license} needs a title for the credits`);
  return out;
}

export const needsCredit = (license: string): boolean => NEEDS_CREDIT.includes(license as SfxLicense);
