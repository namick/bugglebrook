// `pnpm music:lab`: open the game in developer mode with the Music Lab
// panel showing, to hear the music's changes without playing the game. The
// lab opens areas and moves the clock, so it keeps its own saves folder and
// never touches the real ones. Set BUGGLEBROOK_USER_DATA to choose the folder.

import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VITE_BB_MUSIC_LAB: '1',
  BUGGLEBROOK_USER_DATA: process.env.BUGGLEBROOK_USER_DATA ?? join(tmpdir(), 'bugglebrook-music-lab'),
};
delete env.ELECTRON_RUN_AS_NODE;
console.log('Starting the game with the Music Lab. Pick a row and press Play.');
console.log(`The lab's saves are kept apart, in ${env.BUGGLEBROOK_USER_DATA}.`);
console.log('Close the game window, or press Ctrl+C here, to stop.\n');
const r = spawnSync('pnpm', ['exec', 'electron-vite', 'dev'], {
  cwd: ROOT,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 0);
