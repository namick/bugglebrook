/**
 * Saving before the app closes, as a small state machine kept apart from
 * Electron so Vitest can drive it (P-12).
 *
 * Two things can start a close. Closing the window (its X, Alt+F4, the
 * menu's door) emits `close` on the window. Quitting the app (Cmd+Q, the
 * dock's Quit, an update's restart, `app.quit()`) emits `before-quit` on the
 * app first and then `close` on each window. If either handler cancels,
 * Electron forgets the quit, and on macOS closing the last window does not
 * quit by itself. So the quit has to be remembered here and asked for
 * again once the game has saved.
 *
 * - running: a close or quit is held back while the renderer saves.
 * - flushing: waiting for the renderer (or the deadline). Further closes
 *   and quits are held back too, and a quit is remembered.
 * - done: the save is finished; everything goes through.
 */

export type QuitPhase = 'running' | 'flushing' | 'done';

/** The longest the game waits for the last save before closing anyway. */
export const FLUSH_DEADLINE_MS = 5000;

export interface QuitEffects {
  /** Ask the renderer to save. False if there is no live renderer to ask. */
  requestFlush(): boolean;
  /** Close the window again (the flush is done). */
  closeWindow(): void;
  /** Quit the app again (the flush is done). */
  quit(): void;
  /** Call `fn` after `ms`. */
  later(fn: () => void, ms: number): void;
  log?(message: string): void;
}

export class QuitFlow {
  phase: QuitPhase = 'running';
  /** A quit (not just a window close) is waiting on the flush. */
  quitting = false;

  constructor(
    private readonly fx: QuitEffects,
    readonly deadlineMs = FLUSH_DEADLINE_MS,
  ) {}

  /** The app is about to quit. True if the quit must be held back (call `preventDefault`). */
  beforeQuit(): boolean {
    if (this.phase === 'done') return false;
    this.quitting = true;
    return this.hold('quit');
  }

  /** The window is about to close. True if the close must be held back. */
  close(): boolean {
    if (this.phase === 'done') return false;
    return this.hold('close');
  }

  /** The renderer finished saving. */
  flushed(): void {
    this.finish('saved');
  }

  /** Skip the save (the renderer already saved, as before an update's restart). */
  skip(): void {
    this.phase = 'done';
  }

  private hold(what: 'quit' | 'close'): boolean {
    if (this.phase === 'flushing') return true;
    if (!this.fx.requestFlush()) {
      // Nothing to save (no window, or its page is gone): let it through.
      this.phase = 'done';
      return false;
    }
    this.phase = 'flushing';
    this.fx.log?.(`Saving before ${what}`);
    this.fx.later(() => this.finish('deadline'), this.deadlineMs);
    return true;
  }

  private finish(why: 'saved' | 'deadline'): void {
    if (this.phase !== 'flushing') return;
    this.phase = 'done';
    if (why === 'deadline') this.fx.log?.(`The last save took over ${this.deadlineMs} ms; closing anyway`);
    if (this.quitting) this.fx.quit();
    else this.fx.closeWindow();
  }
}
