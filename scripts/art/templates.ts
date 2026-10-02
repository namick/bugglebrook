// `pnpm art:templates [bug_id|face_kit ...] [--refresh-guides]`
//
// Builds the game, opens it on a virtual display (scripts/display.mjs), and
// asks it to draw each template's guides (tests/art/template.spec.ts). New
// bugs' templates go to art/src/; existing sources are never overwritten:
// fresh copies go to art/templates/, or with --refresh-guides only the guides
// group and rig.json are replaced, keeping every drawn layer as it is.

import { spawnSync } from 'node:child_process';
import { ROOT } from './build.ts';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh-guides');
const only = args.filter((a) => !a.startsWith('--'));
const env: NodeJS.ProcessEnv = {
  ...process.env,
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
