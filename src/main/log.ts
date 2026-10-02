import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

/** Longest single message kept, in characters. Anything longer is cut. */
export const MAX_LOG_MESSAGE = 8000;

/**
 * A small rotating log file in userData (`logs/main.log`). It never leaves
 * the machine: there is no telemetry. When the file passes `maxBytes` it
 * becomes `main.1.log`, the old `main.1.log` becomes `main.2.log`, and so on,
 * keeping `keep` old files. Writes are synchronous so the last line before a
 * crash still lands, and a write that fails is dropped rather than thrown.
 */
export class RotatingLog {
  constructor(
    readonly path: string,
    readonly maxBytes = 1_000_000,
    readonly keep = 3,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The path of the nth old file (1 is the newest). */
  rotated(n: number): string {
    return this.path.replace(/(\.log)?$/, `.${n}$1`);
  }

  info(message: string): void {
    this.write('info', message);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
  }

  write(level: LogLevel, message: string): void {
    const text = message.length > MAX_LOG_MESSAGE ? `${message.slice(0, MAX_LOG_MESSAGE)}...` : message;
    const line = `${this.now().toISOString()} [${level}] ${text.replace(/\r?\n/g, '\n    ')}\n`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      if (this.size() + Buffer.byteLength(line) > this.maxBytes) this.rotate();
      appendFileSync(this.path, line);
    } catch {
      // A full or read-only disk must never take the game down with it.
    }
  }

  private size(): number {
    try {
      return statSync(this.path).size;
    } catch {
      return 0;
    }
  }

  private rotate(): void {
    rmSync(this.rotated(this.keep), { force: true });
    for (let n = this.keep - 1; n >= 1; n--) {
      try {
        renameSync(this.rotated(n), this.rotated(n + 1));
      } catch {
        // That one did not exist yet.
      }
    }
    if (this.keep > 0) renameSync(this.path, this.rotated(1));
    else rmSync(this.path, { force: true });
  }
}

/** A readable one-line-plus-stack description of anything thrown. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}
