import { SAVE_VERSION } from './schema';
import type { SaveFile } from './schema';
import { validateSaveFile } from './validate';

/**
 * A migration upgrades a save from version N to N + 1. The map key is N.
 * Migrations take and return untyped JSON because old shapes no longer have
 * types. Never edit a shipped migration; add a new one.
 */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Example for the first real change:
  // 1: (save) => ({ ...save, version: 2, world: { ...(save.world as object), weather: 'sunny' } }),
};

export class SaveError extends Error {
  override name = 'SaveError';
}

/**
 * Parse raw JSON text or an object into a current-version SaveFile, running
 * any migrations needed. Throws SaveError on anything it cannot read.
 */
export function loadSaveFile(
  raw: string | unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  currentVersion: number = SAVE_VERSION,
): SaveFile {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new SaveError('Save is not valid JSON');
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new SaveError('Save is not an object');

  let save = data as Record<string, unknown>;
  const rawVersion = save.version;
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1)
    throw new SaveError(`Save has an invalid version: ${String(rawVersion)}`);
  let version = rawVersion;
  if (version > currentVersion)
    throw new SaveError(`Save version ${version} is newer than this game (${currentVersion})`);

  while (version < currentVersion) {
    const migrate = migrations[version];
    if (!migrate) throw new SaveError(`No migration from save version ${version}`);
    save = migrate(save);
    if (save.version !== version + 1)
      throw new SaveError(`Migration from ${version} did not produce version ${version + 1}`);
    version += 1;
  }

  const problems = validateSaveFile(save);
  if (problems.length > 0) throw new SaveError(`Invalid save: ${problems.join('; ')}`);
  return save as unknown as SaveFile;
}
