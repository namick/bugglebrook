import type { Settings } from './settings';

/** IPC channel names. The preload and main process import these. */
export const IPC = {
  savesList: 'saves:list',
  savesRead: 'saves:read',
  savesWrite: 'saves:write',
  savesRemove: 'saves:remove',
  savesReadBackup: 'saves:read-backup',
  savesRecover: 'saves:recover',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  /** renderer -> main: write a photo (a PNG data URL) to the Pictures folder. Resolves to its path. */
  photosSave: 'photos:save',
  /** renderer -> main: the quit door on the menu. */
  quit: 'app:quit',
  /** main -> renderer: save now, the app is closing. */
  flushRequest: 'app:flush-request',
  /** renderer -> main: flush finished. */
  flushDone: 'app:flush-done',
  /** renderer -> main: an uncaught error, for the log file in userData. */
  logError: 'app:log-error',
  /** main -> renderer: an update is downloaded (its version). */
  updateReady: 'app:update-ready',
  /** renderer -> main: the update toast's restart button. */
  updateRestart: 'app:update-restart',
} as const;

export const SLOT_COUNT = 3;
/** Largest save payload main will accept, in bytes of UTF-16 text length. */
export const MAX_SAVE_CHARS = 5_000_000;

export interface SlotInfo {
  slot: number;
  exists: boolean;
  /** Last write time in ms since epoch, if the slot exists. */
  modifiedMs: number | null;
}

/** The API the preload exposes as `window.bugglebrook`. Keep it narrow. */
export interface BugglebrookApi {
  /** True when launched with BUGGLEBROOK_TEST=1. Enables window.__bb. */
  readonly testMode: boolean;
  readonly platform: string;
  readonly saves: {
    list(): Promise<SlotInfo[]>;
    read(slot: number): Promise<string | null>;
    write(slot: number, data: string): Promise<void>;
    remove(slot: number): Promise<void>;
    /** The save as it was before the last write, or null. */
    readBackup(slot: number): Promise<string | null>;
    /** Set an unloadable save aside and put its backup back. Returns the backup, or null. */
    recover(slot: number): Promise<string | null>;
  };
  /** Per-machine settings (volumes, fullscreen, reduce motion, edge scroll). */
  readonly settings: {
    get(): Promise<Settings>;
    /** Store a change and apply what main controls (fullscreen). Returns the stored settings. */
    set(settings: Partial<Settings>): Promise<Settings>;
  };
  /** Photo mode (game design doc, section 14). */
  readonly photos: {
    /** Write a 1920x1080 PNG (as a data URL) to `<Pictures>/Bugglebrook/`. Resolves to the file's path. */
    save(png: string): Promise<string>;
  };
  /** Close the app (saving first, like any close). */
  quit(): void;
  /** Register the handler main calls before quitting so the game can save. */
  onFlushRequest(handler: () => Promise<void>): void;
  /** Write an uncaught renderer error to the log file (`<userData>/logs/main.log`). */
  logError(text: string): void;
  /** Auto-updates (off in dev, tests, and Steam builds). */
  readonly updates: {
    /** Called with the version when an update has downloaded and waits for a restart. */
    onReady(handler: (version: string) => void): void;
    /** Quit and install the waiting update. Main ignores it when none is waiting. */
    restart(): void;
  };
}
