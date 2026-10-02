/**
 * Pure decisions for the main process, kept apart from Electron so Vitest can
 * test them: whether the auto-updater may run, and whether a crashed renderer
 * should be reloaded again.
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
}

export type UpdateBlock = 'build' | 'dev' | 'test' | 'env' | null;

/** Why updates are off, or null when the updater may run. */
export function updateBlock(gate: UpdateGate): UpdateBlock {
  if (!gate.builtWithUpdater) return 'build';
  if (gate.testMode) return 'test';
  if (!gate.packaged) return 'dev';
  if (gate.env.BUGGLEBROOK_NO_UPDATES === '1') return 'env';
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
