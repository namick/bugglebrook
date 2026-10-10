// A set's colors.json: the set's own colors for what the game tints on a bug
// or draws beside it. The format and its checks are in
// src/renderer/src/art/setColors.ts (docs/06-art-guide.md, B19).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BugColors } from '../../src/renderer/src/art/rigFile.ts';
import type { LanternRig } from '../../src/renderer/src/art/setColors.ts';
import { parseSetColors } from '../../src/renderer/src/art/setColors.ts';

/**
 * Each bug's colors from the colors.json in a set's source folder, or none
 * when the set has no such file. Throws, naming the file and every problem,
 * if the file is wrong or names a bug the set has no .ora for.
 */
export function readSetColors(srcDir: string): Record<string, BugColors> {
  const file = join(srcDir, 'colors.json');
  if (!existsSync(file)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
  // A lantern's place is given on the bug's template, so it is read against that bug's rig.
  const rigOf = (id: string): LanternRig | undefined => {
    const rig = join(srcDir, 'bugs', `${id}.rig.json`);
    try {
      return existsSync(rig) ? (JSON.parse(readFileSync(rig, 'utf8')) as LanternRig) : undefined;
    } catch {
      return undefined;
    }
  };
  const { bugs, problems } = parseSetColors(raw, rigOf);
  for (const id of Object.keys(bugs))
    if (!existsSync(join(srcDir, 'bugs', `${id}.ora`)))
      problems.push(`${id}: this set has no bugs/${id}.ora. Check the ID.`);
  if (problems.length) throw new Error(`${file} has problems:\n  ${problems.join('\n  ')}`);
  return bugs;
}
