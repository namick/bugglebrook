import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings';
import type { Settings } from '../shared/settings';
import { writeAtomic } from './saveStore';

/**
 * Per-machine settings in `settings.json` (game design doc, sections 17
 * and 18). Main process only. A missing or unreadable file gives the
 * defaults; anything from IPC is normalized before it is stored.
 */
export class SettingsStore {
  private cache: Settings | null = null;

  constructor(
    readonly path: string,
    readonly defaults: Readonly<Settings> = DEFAULT_SETTINGS,
  ) {}

  async get(): Promise<Settings> {
    if (this.cache) return { ...this.cache };
    let raw: unknown = null;
    try {
      raw = JSON.parse(await readFile(this.path, 'utf8'));
    } catch {
      // Missing or corrupt: start from the defaults.
    }
    this.cache = normalizeSettings(raw, this.defaults);
    return { ...this.cache };
  }

  /** Store new settings. Returns what was stored. */
  async set(raw: unknown): Promise<Settings> {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new Error('Settings must be an object');
    const next = normalizeSettings({ ...(await this.get()), ...raw }, this.defaults);
    await mkdir(dirname(this.path), { recursive: true });
    await writeAtomic(this.path, JSON.stringify(next, null, 2));
    this.cache = next;
    return { ...next };
  }
}
