// A bug's `.lights.json`: the night lights an art set puts on it. The format
// and its checks are in src/renderer/src/art/setLights.ts (docs/06-art-guide.md, B20).

import { existsSync, readFileSync } from 'node:fs';

/** The text of the `.lights.json` beside an .ora, or undefined when the bug has none. */
export function readBugLights(ora: string): string | undefined {
  const file = ora.replace(/\.ora$/, '.lights.json');
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}
