// `pnpm art:item-templates [--set <id>] [--out <dir>] [--refresh-guides] [sheet_id ...]`
//
// Builds the game, opens it on a virtual display (scripts/display.mjs), and
// asks it to draw each item sheet's guides (tests/art/itemTemplate.spec.ts).
// Sheets go to the set's `items` folder (art/src/sets/<id>/items, or
// art/src/items for the reference set), or to `--out`, a folder of your own.
// A sheet that is already there is never overwritten: with --refresh-guides
// its guides and rig.json are replaced and every painted layer is kept.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './build.ts';
import { setArgs, setSource } from './sets.ts';

const { id: setId, rest } = setArgs(process.argv.slice(2));
const o = rest.indexOf('--out');
if (o >= 0 && !rest[o + 1]) throw new Error('--out needs a folder.');
const out = o >= 0 ? resolve(rest[o + 1]!) : null;
const args = rest.filter((_a, i) => o < 0 || (i !== o && i !== o + 1));
const dir = out ?? join(setSource(join(ROOT, 'art/src'), setId), 'items');
if (!out && setId !== 'reference') {
  // A new set needs its name and credit before `pnpm art:build` will take it.
  const meta = join(ROOT, 'art/src/sets', setId, 'set.json');
  mkdirSync(join(ROOT, 'art/src/sets', setId), { recursive: true });
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
const env: NodeJS.ProcessEnv = {
  ...process.env,
  BB_ART_ITEMS: '1',
  BB_ART_ITEMS_DIR: dir,
  BB_ART_ONLY: args.filter((a) => !a.startsWith('--')).join(','),
  BB_ART_REFRESH: args.includes('--refresh-guides') ? '1' : '',
};
delete env.ELECTRON_RUN_AS_NODE;

const run = (cmd: string, argv: string[]): void => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('pnpm', ['exec', 'electron-vite', 'build']);
run('node', [
  'scripts/display.mjs',
  'pnpm',
  'exec',
  'playwright',
  'test',
  '-c',
  'playwright.art.config.ts',
  'itemTemplate',
]);
