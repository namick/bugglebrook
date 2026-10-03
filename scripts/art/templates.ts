// `pnpm art:templates [bug_id|face_kit ...] [--refresh-guides]`
//
// Builds the game, opens it on a virtual display (scripts/display.mjs), and
// asks it to draw each template's guides (tests/art/template.spec.ts). New
// bugs' templates go to art/src/; existing sources are never overwritten:
// fresh copies go to art/templates/, or with --refresh-guides only the guides
// group and rig.json are replaced, keeping every drawn layer as it is.

import { spawnSync } from 'node:child_process';
import { ROOT } from './build.ts';
import { setArgs } from './sets.ts';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { id: setId, rest: args } = setArgs(process.argv.slice(2));
if (setId !== 'reference') {
  const dir = join(ROOT, 'art/src/sets', setId);
  mkdirSync(dir, { recursive: true });
  const meta = join(dir, 'set.json');
  if (!existsSync(meta))
    writeFileSync(
      meta,
      JSON.stringify(
        { name: setId.replaceAll('_', ' ').slice(0, 40), credit: 'Add the artist credit here' },
        null,
        2,
      ) + '\n',
    );
}
const refresh = args.includes('--refresh-guides');
const only = args.filter((a) => !a.startsWith('--'));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  BB_ART_SET: setId,
  BB_ART_ONLY: only.join(','),
  BB_ART_REFRESH: refresh ? '1' : '',
};
delete env.ELECTRON_RUN_AS_NODE;

const run = (cmd: string, argv: string[]): void => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('pnpm', ['exec', 'electron-vite', 'build']);
run('node', ['scripts/display.mjs', 'pnpm', 'exec', 'playwright', 'test', '-c', 'playwright.art.config.ts']);
