import type { BugglebrookApi } from '../../../shared/ipc';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../shared/settings';
import type { Settings } from '../../../shared/settings';

/**
 * The renderer's copy of the player's settings. Changes apply at once
 * (listeners run synchronously) and are written through to main, which
 * stores them in `settings.json`. Slider drags send many changes; writes
 * are chained so they land in order.
 */
export class SettingsService {
  private current: Settings = { ...DEFAULT_SETTINGS, fullscreen: false };
  private readonly listeners: ((s: Settings) => void)[] = [];
  private writing: Promise<unknown> = Promise.resolve();

  constructor(private readonly api: BugglebrookApi['settings']) {}

  async load(): Promise<Settings> {
    try {
      this.current = normalizeSettings(await this.api.get());
    } catch (err) {
      console.warn('Settings are unreadable; using defaults', err);
    }
    this.emit();
    return this.get();
  }

  get(): Settings {
    return { ...this.current };
  }

  /** Change some settings now, and store them. Resolves once main has them. */
  set(change: Partial<Settings>): Promise<void> {
    this.current = normalizeSettings({ ...this.current, ...change });
    this.emit();
    const snapshot = this.get();
    const write = this.writing.then(() => this.api.set(snapshot));
    this.writing = write.catch((err: unknown) => console.error('Could not store settings', err));
    return this.writing.then(() => undefined);
  }

  /** Wait for every pending write. */
  flush(): Promise<void> {
    return this.writing.then(() => undefined);
  }

  onChange(listener: (s: Settings) => void): void {
    this.listeners.push(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.get());
  }
}
