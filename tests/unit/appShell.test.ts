import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_LOG_MESSAGE, RotatingLog, describeError } from '../../src/main/log';
import {
  MAX_RENDERER_ERROR,
  ReloadBudget,
  isGameUrl,
  parseGpuFlag,
  rendererErrorText,
  updateBlock,
  useSoftwareGl,
} from '../../src/main/policy';
import type { UpdateGate } from '../../src/main/policy';
import {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  WindowStateStore,
  normalizeWindowState,
  placeWindow,
} from '../../src/main/windowState';
import type { DisplayArea, WindowState } from '../../src/main/windowState';
import { describeThrown } from '../../src/renderer/src/ui/oops';
import { TOAST_AT, toastX } from '../../src/renderer/src/ui/updateToast';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bb-shell-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the log file', () => {
  const clock = () => new Date(Date.UTC(2026, 9, 2, 12, 0, 0));

  it('appends timestamped lines and indents multi-line messages', () => {
    const log = new RotatingLog(join(dir, 'logs', 'main.log'), 10_000, 3, clock);
    log.info('hello');
    log.error('boom\nat line 2');
    const text = readFileSync(log.path, 'utf8');
    expect(text).toBe(
      '2026-10-02T12:00:00.000Z [info] hello\n2026-10-02T12:00:00.000Z [error] boom\n    at line 2\n',
    );
  });

  it('rotates past the size limit and keeps only the newest old files', () => {
    const log = new RotatingLog(join(dir, 'main.log'), 200, 2, clock);
    for (let i = 0; i < 40; i++) log.info(`line ${i}`);
    expect(readFileSync(log.path, 'utf8').length).toBeLessThanOrEqual(200);
    expect(log.rotated(1)).toBe(join(dir, 'main.1.log'));
    expect(existsSync(log.rotated(1))).toBe(true);
    expect(existsSync(log.rotated(2))).toBe(true);
    expect(existsSync(log.rotated(3))).toBe(false);
    // The newest line is in main.log; main.1.log holds the lines just before it.
    expect(readFileSync(log.path, 'utf8')).toContain('line 39');
    const all = [log.rotated(2), log.rotated(1), log.path].map((p) => readFileSync(p, 'utf8')).join('');
    const numbers = [...all.matchAll(/line (\d+)/g)].map((m) => Number(m[1]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers.at(-1)).toBe(39);
  });

  it('cuts huge messages and never throws when it cannot write', () => {
    const log = new RotatingLog(join(dir, 'main.log'), 1_000_000, 1, clock);
    log.info('x'.repeat(MAX_LOG_MESSAGE * 2));
    expect(readFileSync(log.path, 'utf8').length).toBeLessThan(MAX_LOG_MESSAGE + 100);
    // A file where its folder should be: every write fails, quietly.
    writeFileSync(join(dir, 'blocked'), '');
    const broken = new RotatingLog(join(dir, 'blocked', 'main.log'));
    expect(() => broken.error('lost')).not.toThrow();
  });

  it('describes anything thrown', () => {
    expect(describeError(new Error('bad'))).toContain('Error: bad');
    expect(describeError('plain')).toBe('plain');
    expect(describeError({ code: 7 })).toBe('{"code":7}');
    expect(describeThrown(new Error('loose'), 'frame')).toMatch(/Error: loose[\s\S]*at frame$/);
    expect(describeThrown(undefined)).toBe('undefined');
  });
});

describe('window placement', () => {
  const primary: DisplayArea = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const right: DisplayArea = { id: 2, workArea: { x: 1920, y: 0, width: 2560, height: 1400 } };
  const saved = (
    x: number,
    y: number,
    width = 1280,
    height = 720,
    displayId: number | null = 1,
  ): WindowState => ({
    bounds: { x, y, width, height },
    maximized: false,
    displayId,
  });

  it('opens the default size centered on the primary display the first time', () => {
    const p = placeWindow(null, [primary], primary);
    expect(p.bounds).toEqual({ x: 320, y: 160, ...DEFAULT_WINDOW_SIZE });
    expect(p.displayId).toBe(1);
  });

  it('keeps a saved spot that is still on screen, on the display that holds it', () => {
    expect(placeWindow(saved(100, 50), [primary, right], primary).bounds).toEqual({
      x: 100,
      y: 50,
      width: 1280,
      height: 720,
    });
    const p = placeWindow(saved(2200, 300, 1600, 900, 2), [primary, right], primary);
    expect(p.displayId).toBe(2);
    expect(p.bounds).toEqual({ x: 2200, y: 300, width: 1600, height: 900 });
  });

  it('nudges a window hanging off an edge back inside', () => {
    const p = placeWindow(saved(1500, 600), [primary], primary);
    expect(p.bounds).toEqual({ x: 640, y: 320, width: 1280, height: 720 });
  });

  it('recenters on the primary display when the saved monitor is unplugged', () => {
    const p = placeWindow(saved(2400, 200, 1600, 900, 2), [primary], primary);
    expect(p.displayId).toBe(1);
    expect(p.bounds).toEqual({ x: 160, y: 70, width: 1600, height: 900 });
  });

  it('recenters on its own display when the saved spot is off every screen', () => {
    const p = placeWindow(saved(9000, 9000, 1280, 720, 2), [primary, right], primary);
    expect(p.displayId).toBe(2);
    expect(p.bounds).toEqual({ x: 1920 + 640, y: 340, width: 1280, height: 720 });
  });

  it('shrinks a window bigger than a smaller new screen, but never below the minimum', () => {
    const small: DisplayArea = { id: 3, workArea: { x: 0, y: 0, width: 1280, height: 760 } };
    const p = placeWindow(saved(0, 0, 2400, 1300, 3), [small], small);
    expect(p.bounds).toEqual({ x: 0, y: 0, width: 1280, height: 760 });
    const tiny = placeWindow(saved(10, 10, 200, 100, 3), [small], small);
    expect(tiny.bounds.width).toBe(MIN_WINDOW_SIZE.width);
    expect(tiny.bounds.height).toBe(MIN_WINDOW_SIZE.height);
  });

  it('keeps maximized and reads only well-formed state', () => {
    expect(placeWindow({ ...saved(0, 0), maximized: true }, [primary], primary).maximized).toBe(true);
    expect(normalizeWindowState(null)).toBeNull();
    expect(normalizeWindowState({ bounds: { x: 0, y: 0, width: -5, height: 10 } })).toBeNull();
    expect(normalizeWindowState({ bounds: { x: 'a', y: 0, width: 5, height: 10 } })).toBeNull();
    expect(normalizeWindowState({ bounds: { x: 1.4, y: 2, width: 900, height: 500 } })).toEqual({
      bounds: { x: 1, y: 2, width: 900, height: 500 },
      maximized: false,
      displayId: null,
    });
  });

  it('stores state in a file and survives a corrupt one', () => {
    const store = new WindowStateStore(join(dir, 'window-state.json'));
    expect(store.read()).toBeNull();
    const state = saved(10, 20, 1000, 600, 2);
    store.write(state);
    expect(store.read()).toEqual(state);
    writeFileSync(store.path, '{ nope');
    expect(store.read()).toBeNull();
  });
});

describe('the updater gate', () => {
  const gate = (over: Partial<UpdateGate>): UpdateGate => ({
    packaged: true,
    testMode: false,
    env: {},
    builtWithUpdater: true,
    platform: 'win32',
    ...over,
  });

  it('runs only in a packaged player build', () => {
    expect(updateBlock(gate({}))).toBeNull();
    expect(updateBlock(gate({ packaged: false }))).toBe('dev');
    expect(updateBlock(gate({ testMode: true }))).toBe('test');
    expect(updateBlock(gate({ env: { BUGGLEBROOK_NO_UPDATES: '1' } }))).toBe('env');
  });

  it('is off in builds made without it (Steam), whatever else holds', () => {
    expect(updateBlock(gate({ builtWithUpdater: false }))).toBe('build');
    expect(updateBlock(gate({ builtWithUpdater: false, testMode: true, packaged: false }))).toBe('build');
  });

  it('on Linux updates only the AppImage; a .deb belongs to the package manager (P-21)', () => {
    expect(
      updateBlock(gate({ platform: 'linux', env: { APPIMAGE: '/home/kid/Bugglebrook.AppImage' } })),
    ).toBeNull();
    expect(updateBlock(gate({ platform: 'linux' }))).toBe('package');
  });

  it('is off on macOS while Mac builds are unsigned (P-09)', () => {
    expect(updateBlock(gate({ platform: 'darwin' }))).toBe('unsigned');
  });

  it('never posts an OS notification: it checks quietly and the game shows its own toast', () => {
    const source = readFileSync(join(import.meta.dirname, '../../src/main/updater.ts'), 'utf8');
    expect(source).not.toMatch(/checkForUpdatesAndNotify/);
    expect(source).toMatch(/checkForUpdates\(\)/);
  });
});

describe('who may use IPC (P-29)', () => {
  it('only the bundled game page, or the dev server in a dev run', () => {
    const page = 'file:///opt/Bugglebrook/resources/app.asar/out/renderer/index.html';
    expect(isGameUrl(page, null)).toBe(true);
    expect(isGameUrl(`${page}#menu`, null)).toBe(true);
    expect(isGameUrl('file:///home/kid/Downloads/evil.html', null)).toBe(false);
    expect(isGameUrl('https://example.com/out/renderer/index.html', null)).toBe(false);
    expect(isGameUrl('about:blank', null)).toBe(false);
    expect(isGameUrl('not a url', null)).toBe(false);
    expect(isGameUrl('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
    expect(isGameUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
    expect(isGameUrl('http://localhost:5173/', null)).toBe(false);
    expect(isGameUrl('http://localhost:5173/', 'nonsense')).toBe(false);
  });
});

describe('software WebGL only as a fallback (P-29)', () => {
  it('is on for tests, when asked for, or after a run found no WebGL; off for a player with a GPU', () => {
    expect(useSoftwareGl({ testMode: false, env: {}, flagged: false })).toBe(false);
    expect(useSoftwareGl({ testMode: true, env: {}, flagged: false })).toBe(true);
    expect(useSoftwareGl({ testMode: false, env: { BUGGLEBROOK_SOFTWARE_GL: '1' }, flagged: false })).toBe(
      true,
    );
    expect(useSoftwareGl({ testMode: false, env: {}, flagged: true })).toBe(true);
    expect(useSoftwareGl({ testMode: true, env: { BUGGLEBROOK_SOFTWARE_GL: '0' }, flagged: true })).toBe(
      false,
    );
  });

  it('reads the flag file strictly', () => {
    expect(parseGpuFlag(null)).toBe(false);
    expect(parseGpuFlag('{ nope')).toBe(false);
    expect(parseGpuFlag('{"software": "yes"}')).toBe(false);
    expect(parseGpuFlag('null')).toBe(false);
    expect(parseGpuFlag('{"software": true}')).toBe(true);
  });
});

describe('crash recovery', () => {
  it('reloads a crashed renderer a few times a minute, then gives up', () => {
    const budget = new ReloadBudget(3, 60_000);
    expect([0, 1000, 2000, 3000].map((t) => budget.take(t))).toEqual([true, true, true, false]);
    // A minute after the first crash, one more reload is allowed.
    expect(budget.take(61_000)).toBe(true);
    expect(budget.take(61_000)).toBe(false);
  });

  it('accepts only text error reports from the renderer, cut to size', () => {
    expect(rendererErrorText(42)).toBeNull();
    expect(rendererErrorText({ message: 'x' })).toBeNull();
    expect(rendererErrorText('   ')).toBeNull();
    expect(rendererErrorText(' boom ')).toBe('boom');
    expect(rendererErrorText('y'.repeat(MAX_RENDERER_ERROR + 50))).toHaveLength(MAX_RENDERER_ERROR);
  });
});

describe('the update toast', () => {
  it('slides in from off screen and settles at its spot', () => {
    expect(toastX(0)).toBeLessThan(-100);
    expect(toastX(1)).toBeCloseTo(TOAST_AT.x);
    expect(toastX(5)).toBeCloseTo(TOAST_AT.x);
    // It overshoots a little before settling.
    const xs = Array.from({ length: 21 }, (_, i) => toastX(i / 20));
    expect(Math.max(...xs)).toBeGreaterThan(TOAST_AT.x);
  });
});
