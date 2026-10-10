// `pnpm art:backdrop-templates --set <id> [strip ...] [--scale 1|2] [--refresh-guides] [--out <dir>]`
//
// Writes blank templates for a set's painted parallax strips, with the
// code-drawn layer as a guide. A strip is `<area_id>_far` or `<area_id>_mid`;
// an area ID alone means both, and no names means every strip.
//
// Builds the game, opens it on a virtual display (scripts/display.mjs), and
// asks it to draw each template's guides (tests/art/backdropTemplate.spec.ts).
// Templates go to art/src/sets/<id>/backdrop/. An existing source is never
// overwritten: a fresh copy goes to art/templates/, or with --refresh-guides
// only the guides and strip.json are replaced. --out writes everything into
// another folder instead and leaves the repo alone. Starter sky.json and
// world.json (the game's own look) are written next to the templates when
// they are missing. `--no-build` reuses the app already built in out/.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './build.ts';
import { checkSetId } from './sets.ts';

const args = process.argv.slice(2);
const take = (flag: string): string | null => {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${flag} needs a value.`);
    process.exit(2);
  }
  args.splice(i, 2);
  return value;
};
const setId = take('--set');
const out = take('--out');
const scale = take('--scale') ?? '2';
if (!setId && !out) {
  console.error('Say which set the templates are for (--set <id>), or where to write them (--out <dir>).');
  process.exit(2);
}
if (setId) checkSetId(setId);
if (scale !== '1' && scale !== '2') {
  console.error('--scale is 1 or 2 (template pixels per game pixel).');
  process.exit(2);
}
// A new set needs its name and credit, as `pnpm art:templates --set` gives it.
if (setId && setId !== 'reference' && !out) {
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
const build = !args.includes('--no-build');
const only = args.filter((a) => !a.startsWith('--'));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  BB_BACKDROP_TEMPLATES: '1',
  BB_BACKDROP_SET: setId ?? '',
  BB_BACKDROP_OUT: out ? resolve(out) : '',
  BB_BACKDROP_ONLY: only.join(','),
  BB_BACKDROP_REFRESH: refresh ? '1' : '',
  BB_BACKDROP_SCALE: scale,
  // Guides are drawn at full size, not the tiny test resolution.
  BB_FULL_RENDER: '1',
};
delete env.ELECTRON_RUN_AS_NODE;

const run = (cmd: string, argv: string[]): void => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (build) run('pnpm', ['exec', 'electron-vite', 'build']);
run('node', [
  'scripts/display.mjs',
  'pnpm',
  'exec',
  'playwright',
  'test',
  '-c',
  'playwright.art.config.ts',
  'backdropTemplate',
]);
