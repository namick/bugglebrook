// Run a command (Playwright against Electron) on its own virtual X display
// when xvfb-run is available, so test windows never open on the desktop and
// parallel runs don't fight over one screen. Falls back to running the
// command as is (macOS, Windows, no Xvfb, or already on a virtual display).
// Set BB_REAL_DISPLAY=1 to watch a run on the real screen.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/display.mjs <command> [args...]');
  process.exit(2);
}

const onPath = (name) =>
  (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, name)));
// xvfb-run points XAUTHORITY at its own temp file; BB_VIRTUAL_DISPLAY marks a nested run.
const virtual = process.env.BB_VIRTUAL_DISPLAY === '1' || /xvfb-run|Xvfb/i.test(process.env.XAUTHORITY ?? '');
const useXvfb =
  process.platform === 'linux' && process.env.BB_REAL_DISPLAY !== '1' && !virtual && onPath('xvfb-run');

const env = { ...process.env };
let argv = [cmd, ...args];
if (useXvfb) {
  // Electron prefers Wayland when it can see it; make it use Xvfb's DISPLAY.
  delete env.WAYLAND_DISPLAY;
  env.XDG_SESSION_TYPE = 'x11';
  env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
  env.BB_VIRTUAL_DISPLAY = '1';
  argv = ['xvfb-run', '-a', '--server-args=-screen 0 1920x1080x24', ...argv];
}
const r = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
