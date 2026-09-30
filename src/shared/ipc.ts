/** IPC channel names. The preload and main process import these. */
export const IPC = {
  savesList: 'saves:list',
  savesRead: 'saves:read',
  savesWrite: 'saves:write',
  savesRemove: 'saves:remove',
  /** main -> renderer: save now, the app is closing. */
  flushRequest: 'app:flush-request',
  /** renderer -> main: flush finished. */
  flushDone: 'app:flush-done',
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
  };
  /** Register the handler main calls before quitting so the game can save. */
  onFlushRequest(handler: () => Promise<void>): void;
}
