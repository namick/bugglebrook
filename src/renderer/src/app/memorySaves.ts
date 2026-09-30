import { SLOT_COUNT } from '../../../shared/ipc';
import type { BugglebrookApi } from '../../../shared/ipc';

/**
 * In-memory stand-in for the preload API, used when the renderer runs in a
 * plain browser (for example `vite preview`). Saves vanish on reload.
 */
export function memoryApi(): BugglebrookApi {
  const slots = new Map<number, { data: string; at: number }>();
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
      write: async (slot, data) => {
        check(slot);
        slots.set(slot, { data, at: Date.now() });
      },
      remove: async (slot) => {
        slots.delete(slot);
      },
    },
    onFlushRequest: () => undefined,
  };
}
