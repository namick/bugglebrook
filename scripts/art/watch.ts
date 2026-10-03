// Watching the artist's files for `pnpm art:watch`. Krita writes an .ora in
// steps, so a change counts only once the file has stopped changing size.

import type { FSWatcher } from 'node:fs';
import { existsSync, statSync, watch } from 'node:fs';
import { basename } from 'node:path';

/** Quiet time after the last change before rebuilding. */
export const DEBOUNCE_MS = 300;

/**
 * Call `onChange` with the IDs of .ora files that changed under `dir`, once
 * each file has been quiet for `DEBOUNCE_MS` and its size has stopped moving.
 * Returns a function that stops watching.
 */
export function watchArt(dir: string, onChange: (ids: string[]) => void, debounce = DEBOUNCE_MS): () => void {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sizes = new Map<string, number>();
  const flush = (): void => {
    timer = null;
    const ready: string[] = [];
    for (const [id, path] of pending) {
      const size = existsSync(path) ? statSync(path).size : -1;
      // Still being written: look again shortly.
      if (size <= 0 || sizes.get(path) !== size) {
        sizes.set(path, size);
        continue;
      }
      ready.push(id);
      pending.delete(id);
    }
    if (ready.length) onChange(ready.sort());
    if (pending.size) timer = setTimeout(flush, debounce);
  };
  const watcher: FSWatcher = watch(dir, { recursive: true }, (_event, name) => {
    if (!name || !String(name).endsWith('.ora')) return;
    const file = String(name);
    if (file.split(/[\\/]/)[0] === 'sets') return;
    const path = `${dir}/${file}`;
    pending.set(basename(file, '.ora'), path);
    sizes.delete(path);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounce);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
