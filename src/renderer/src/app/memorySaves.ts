import { SLOT_COUNT } from '../../../shared/ipc';
import type { BugglebrookApi } from '../../../shared/ipc';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../shared/settings';
import type { Settings } from '../../../shared/settings';

/**
 * In-memory stand-in for the preload API, used when the renderer runs in a
 * plain browser (for example `vite preview`) and by unit tests. Saves keep
 * one backup like the real store. Everything vanishes on reload.
 */
export function memoryApi(): BugglebrookApi {
  const slots = new Map<number, { data: string; at: number }>();
  const backups = new Map<number, string>();
  let settings: Settings = { ...DEFAULT_SETTINGS, fullscreen: false };
  const check = (slot: number): void => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw new Error('bad slot');
  };
  return {
    testMode: false,
    platform: 'browser',
    saves: {
      list: async () =>
        Array.from({ length: SLOT_COUNT }, (_, slot) => {
          const s = slots.get(slot);
          return { slot, exists: !!s, modifiedMs: s?.at ?? null };
        }),
      read: async (slot) => (check(slot), slots.get(slot)?.data ?? null),
      readBackup: async (slot) => (check(slot), backups.get(slot) ?? null),
      write: async (slot, data) => {
        check(slot);
        const old = slots.get(slot);
        if (old) backups.set(slot, old.data);
        slots.set(slot, { data, at: Date.now() });
      },
      remove: async (slot) => {
        slots.delete(slot);
        backups.delete(slot);
      },
      recover: async (slot) => {
        check(slot);
        const backup = backups.get(slot) ?? null;
        if (backup === null) slots.delete(slot);
        else slots.set(slot, { data: backup, at: Date.now() });
        return backup;
      },
    },
    settings: {
      get: async () => ({ ...settings }),
      set: async (next) => {
        settings = normalizeSettings({ ...settings, ...next });
        return { ...settings };
      },
    },
    // No disk in the browser: the photo is saved nowhere, and the polaroid shows its red x.
    photos: { save: () => Promise.reject(new Error('No Pictures folder in the browser')) },
    quit: () => window.close(),
    onFlushRequest: () => undefined,
    logError: (text) => console.error(text),
    updates: { onReady: () => undefined, restart: () => undefined },
  };
}
