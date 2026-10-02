/**
 * What the game does when saving fails (a full disk, no permission, a save
 * too big to write). Pure, so Vitest can test it without Pixi.
 *
 * The first failure turns on a small, wordless sign (a rain cloud in a red ring by the
 * pause button) that stays until a save works again. Meanwhile the game
 * tries again on its own, waiting a little longer each time, instead of
 * hammering a full disk every frame or waiting out the 30-second autosave.
 */

/** Seconds to wait before each retry: the first after 5 s, then doubling, at most a minute apart. */
export const RETRY_SECONDS: readonly number[] = [5, 10, 20, 40, 60];

/** The wait before retry number `failures` (1 is the first failure). */
export function retryDelay(failures: number): number {
  const i = Math.max(1, Math.floor(failures)) - 1;
  return RETRY_SECONDS[Math.min(i, RETRY_SECONDS.length - 1)]!;
}

export interface SaveTroubleState {
  /** The cloud is up: the last save failed. */
  shown: boolean;
  /** Failures in a row. */
  failures: number;
  /** Seconds until the next try, or null when nothing is waiting. */
  retryIn: number | null;
  /** Why the last save failed, or null. */
  reason: string | null;
}

export class SaveTrouble {
  private failures = 0;
  private retryIn: number | null = null;
  private reason: string | null = null;

  /** A save failed. Returns the seconds until the next try. */
  failed(reason: string): number {
    this.failures++;
    this.reason = reason;
    this.retryIn = retryDelay(this.failures);
    return this.retryIn;
  }

  /** A save worked. True if that ended a run of failures. */
  succeeded(): boolean {
    const was = this.failures > 0;
    this.failures = 0;
    this.retryIn = null;
    this.reason = null;
    return was;
  }

  get troubled(): boolean {
    return this.failures > 0;
  }

  /** Count down while the world runs. True when it is time to try again. */
  tick(dt: number): boolean {
    if (this.retryIn === null) return false;
    this.retryIn -= dt;
    if (this.retryIn > 0) return false;
    this.retryIn = null;
    return true;
  }

  state(): SaveTroubleState {
    return { shown: this.troubled, failures: this.failures, retryIn: this.retryIn, reason: this.reason };
  }
}
