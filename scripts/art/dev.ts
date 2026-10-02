// `pnpm art:watch [bug_id]`: open the game in developer mode with the Art Lab
// showing (Dot unless you name another bug). Every time an .ora in art/src is
// saved, the game reloads that drawing within a second or two. Set BB_ART_SRC
// to watch another folder (then the committed atlases are left alone).

import { spawnSync } from 'node:child_process';
import { ROOT } from './build.ts';

const bug = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? '1';
const env: NodeJS.ProcessEnv = { ...process.env, BB_ART_LAB: '1', VITE_BB_ART_LAB: bug };
delete env.ELECTRON_RUN_AS_NODE;
console.log('Starting the game with the Art Lab. Save in Krita (Ctrl+S) and watch it update.');
console.log('Close the game window, or press Ctrl+C here, to stop.\n');
const r = spawnSync('pnpm', ['exec', 'electron-vite', 'dev'], {
  cwd: ROOT,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 0);
