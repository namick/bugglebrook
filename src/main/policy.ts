/**
 * Pure decisions for the main process, kept apart from Electron so Vitest can
 * test them: whether the auto-updater may run, whether a crashed renderer
 * should be reloaded again, which pages may use IPC, and when WebGL may run
 * in software.
 */

export interface UpdateGate {
  /** `app.isPackaged`: dev runs never update. */
  packaged: boolean;
  /** `BUGGLEBROOK_TEST=1`: tests never update. */
  testMode: boolean;
  /** The process environment (`BUGGLEBROOK_NO_UPDATES=1` turns updates off for one run). */
  env: Record<string, string | undefined>;
  /** The build-time flag. False in builds made for a store that updates games itself (Steam). */
  builtWithUpdater: boolean;
  /** `process.platform`. */
  platform: string;
}

export type UpdateBlock = 'build' | 'dev' | 'test' | 'env' | 'package' | 'unsigned' | null;

/** Why updates are off, or null when the updater may run. */
export function updateBlock(gate: UpdateGate): UpdateBlock {
  if (!gate.builtWithUpdater) return 'build';
  if (gate.testMode) return 'test';
  if (!gate.packaged) return 'dev';
  if (gate.env.BUGGLEBROOK_NO_UPDATES === '1') return 'env';
  // On Linux only the AppImage updates itself. A .deb belongs to the package
  // manager: updating it would ask for a sudo password when the game quits.
  if (gate.platform === 'linux' && !gate.env.APPIMAGE) return 'package';
  // Mac builds are unsigned for now (P-09), and Squirrel.Mac refuses to
  // install an unsigned update. Mac players update by downloading again.
  if (gate.platform === 'darwin') return 'unsigned';
  return null;
}

/** How often a long session checks again, after the check at launch. */
export const UPDATE_CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/**
 * Should a renderer that crashed be reloaded? Reloads are free until there
 * have been `limit` of them inside `windowMs`; then the app stops trying, so
 * a crash at startup cannot loop forever.
 */
export class ReloadBudget {
  private readonly times: number[] = [];

  constructor(
    readonly limit = 3,
    readonly windowMs = 60_000,
  ) {}

  /** Record a crash at `now`. True if the window should be reloaded. */
  take(now: number): boolean {
    while (this.times.length > 0 && now - this.times[0]! > this.windowMs) this.times.shift();
    if (this.times.length >= this.limit) return false;
    this.times.push(now);
    return true;
  }
}

/** Longest renderer error main writes to the log, in characters. */
export const MAX_RENDERER_ERROR = 8000;

/** Validate an error report from the renderer: a non-empty string, cut to size. */
export function rendererErrorText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  return text.length > MAX_RENDERER_ERROR ? text.slice(0, MAX_RENDERER_ERROR) : text;
}

/**
 * May a page with this URL use the game's IPC? Only the game's own page:
 * the bundled `renderer/index.html` (a file URL), or the dev server's page
 * in a dev run. Anything else (a frame that navigated away, an injected
 * iframe) is refused.
 */
export function isGameUrl(url: string, devUrl: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (devUrl) {
    try {
      if (parsed.origin === new URL(devUrl).origin && parsed.protocol.startsWith('http')) return true;
    } catch {
      // A malformed dev URL allows nothing.
    }
  }
  return parsed.protocol === 'file:' && /\/renderer\/index\.html$/.test(parsed.pathname);
}

export interface SoftwareGlGate {
  testMode: boolean;
  env: Record<string, string | undefined>;
  /** The last run found no WebGL at all and asked for software (`gpu.json` in userData). */
  flagged: boolean;
}

/**
 * Should Chromium's software WebGL (SwiftShader, `--enable-unsafe-swiftshader`)
 * be allowed? Only as a fallback: on CI and in tests (no GPU under xvfb),
 * when asked for with `BUGGLEBROOK_SOFTWARE_GL=1`, or after a run found no
 * WebGL at all and relaunched. A player with a working GPU never gets it.
 */
export function useSoftwareGl(gate: SoftwareGlGate): boolean {
  if (gate.env.BUGGLEBROOK_SOFTWARE_GL === '0') return false;
  return gate.testMode || gate.env.BUGGLEBROOK_SOFTWARE_GL === '1' || gate.flagged;
}

/** Read `gpu.json`: true only for a well-formed `{ "software": true }`. */
export function parseGpuFlag(text: string | null): boolean {
  if (text === null) return false;
  try {
    const data = JSON.parse(text) as unknown;
    return typeof data === 'object' && data !== null && (data as { software?: unknown }).software === true;
  } catch {
    return false;
  }
}
