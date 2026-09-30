import { SAVE_VERSION } from './schema';
import type { SaveFile } from './schema';
import { validateSaveFile } from './validate';

/**
 * A migration upgrades a save from version N to N + 1. The map key is N.
 * Migrations take and return untyped JSON because old shapes no longer have
 * types. Never edit a shipped migration; add a new one.
 */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

const V1_MODES: Readonly<Record<string, string>> = {
  idle: 'st_idle',
  walk: 'st_wander',
  held: 'st_airborne',
  tumble: 'st_airborne',
  dizzy: 'st_dizzy',
};

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 1 -> 2: M1 bug brains. Modes take their design-doc names, and bugs gain
  // needs and the bookkeeping for seeking, using, and dizzy spells.
  1: (save) => {
    const world = save.world as Record<string, unknown>;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      if (e.kind !== 'bug') return e;
      const old = e.bug as Record<string, unknown>;
      const targetX = typeof old.targetX === 'number' ? old.targetX : 0;
      return {
        ...e,
        bug: {
          mode: V1_MODES[old.mode as string] ?? 'st_idle',
          timer: old.timer,
          targetX,
          targetId: null,
          action: null,
          facing: old.facing,
          needs: { need_hunger: 70, need_fun: 70, need_energy: 80 },
          decideIn: 30,
          airPeak: 0,
          selfLaunched: false,
          lastHardLanding: -1,
          dizzyStreak: 0,
          dizzyTicks: old.mode === 'dizzy' ? old.timer : 0,
          used: [],
          stuck: 0,
          tries: 0,
          done: false,
          lastX: targetX,
        },
      };
    });
    return { ...save, version: 2, world: { ...world, entities } };
  },
  // 2 -> 3: M2 feeding and reactions. Bugs gain a mouth, reaction history,
  // grumpiness, burps, tickles, and wooziness, all starting empty.
  2: (save) => {
    const world = save.world as Record<string, unknown>;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      if (e.kind !== 'bug') return e;
      const bug = e.bug as Record<string, unknown>;
      // M1 bugs ate food where it lay; now food goes in the mouth first.
      const eating = bug.mode === 'st_eat';
      return {
        ...e,
        bug: {
          ...bug,
          mode: eating ? 'st_idle' : bug.mode,
          targetId: eating ? null : bug.targetId,
          action: eating ? null : bug.action,
          mouthful: null,
          reaction: null,
          variants: {},
          grumpyUntil: -1,
          burpAt: -1,
          tickle: 0,
          woozyUntil: -1,
        },
      };
    });
    return { ...save, version: 3, world: { ...world, entities } };
  },
  // 3 -> 4: M3 puts Puddle Pond (32 m wide) left of the plaza, so everything
  // saved moves right by 32 m, camera included. Bugs gain smell and hop
  // timers. Tags and the pond's state start from their defaults.
  3: (save) => {
    const POND_WIDTH = 32;
    const shift = (v: unknown): unknown => (typeof v === 'number' ? v + POND_WIDTH : v);
    const world = save.world as Record<string, unknown>;
    const view = save.view as Record<string, unknown>;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      const body = e.body as Record<string, unknown>;
      const moved: Record<string, unknown> = { ...e, body: { ...body, x: shift(body.x) } };
      if (e.kind === 'bug') {
        const bug = e.bug as Record<string, unknown>;
        moved.bug = {
          ...bug,
          targetX: shift(bug.targetX),
          lastX: shift(bug.lastX),
          smelledAt: -1,
          hopAt: -1,
        };
      }
      return moved;
    });
    return {
      ...save,
      version: 4,
      view: { ...view, cameraX: shift(view.cameraX) },
      world: { ...world, entities },
    };
  },
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
