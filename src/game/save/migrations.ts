import { SAVE_VERSION } from './schema';
import type { SaveFile } from './schema';
import { relayPorch } from './relayPorch';
import { addTreehouseRun } from './treehouseRun';
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
  // 4 -> 5: M4's needs AI. Bugs gain the social and cleanliness needs, and
  // the bookkeeping for carrying, playing together, memory, sleep, signature
  // behaviors, and the off-screen plan. The world gains pair affinity and
  // Glorp's slime trail. (Boing, new in M4, joins old worlds on load.)
  4: (save) => {
    const world = save.world as Record<string, unknown>;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      if (e.kind !== 'bug') return e;
      const bug = e.bug as Record<string, unknown>;
      const needs = bug.needs as Record<string, unknown>;
      const x = typeof bug.lastX === 'number' ? bug.lastX : 0;
      return {
        ...e,
        bug: {
          ...bug,
          needs: { ...needs, need_social: 70, need_clean: 90 },
          carrying: null,
          social: null,
          memory: [],
          inspected: [],
          groggyUntil: -1,
          napAt: -1,
          pokes: [],
          gliding: false,
          fidgetAt: 0,
          slippedAt: -1,
          restX: x,
          plan: null,
          resume: null,
          hopReady: 0,
          touchedAt: -1,
          airTop: 0,
          audience: 0,
        },
      };
    });
    const env = world.env as Record<string, unknown> | undefined;
    return {
      ...save,
      version: 5,
      world: {
        ...world,
        entities,
        ...(env ? { env: { ...env, slime: [] } } : {}),
        social: { affinity: {} },
      },
    };
  },
  // 5 -> 6: M5's pocket tray and menu. The world gains an empty pocket and
  // the fed counts behind the slot badge; the file gains menu meta (its
  // creation time, taken from the last save, and no thumbnail until the
  // next save). No slot holds a bug yet, so any bug marked pocketed drops
  // back into the world.
  5: (save) => {
    const world = save.world as Record<string, unknown>;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      if (e.kind !== 'bug') return e;
      const bug = e.bug as Record<string, unknown>;
      return bug.mode === 'st_pocketed' ? { ...e, bug: { ...bug, mode: 'st_airborne' } } : e;
    });
    return {
      ...save,
      version: 6,
      meta: { createdAt: typeof save.savedAt === 'string' ? save.savedAt : '', thumb: null },
      world: {
        ...world,
        entities,
        pocket: { slots: [[], [], [], [], [], []], at: {} },
        counters: { fed: {} },
      },
    };
  },
  // 6 -> 7: M6's day, night, and weather. The world gains a list of found
  // secrets. It has no clock yet: loading starts it at 09:00 in clear
  // weather (and brings the flashlight pen, new with M6).
  6: (save) => {
    const world = save.world as Record<string, unknown>;
    return { ...save, version: 7, world: { ...world, secrets: [] } };
  },
  // 7 -> 8: M7 puts the Flowerbed Stage (32 m wide) left of the pond, so
  // everything saved moves right by 32 m: bodies, bug targets and resting
  // spots, off-screen plans, ice, welds, slime, and the camera. The world
  // records which areas it has built (the pond and the plaza); loading adds
  // the new areas' starting things, and they all start locked.
  7: (save) => {
    const FLOWERBED_WIDTH = 32;
    const shift = (v: unknown): unknown => (typeof v === 'number' ? v + FLOWERBED_WIDTH : v);
    const world = save.world as Record<string, unknown>;
    const view = save.view as Record<string, unknown>;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      const body = e.body as Record<string, unknown>;
      const moved: Record<string, unknown> = { ...e, body: { ...body, x: shift(body.x) } };
      if (e.kind === 'bug') {
        const bug = e.bug as Record<string, unknown>;
        const plan = bug.plan as Record<string, unknown> | null;
        moved.bug = {
          ...bug,
          targetX: shift(bug.targetX),
          lastX: shift(bug.lastX),
          restX: shift(bug.restX),
          plan: plan ? { ...plan, at: shift(plan.at), x: shift(plan.x) } : null,
        };
      }
      return moved;
    });
    const env = world.env as Record<string, unknown> | undefined;
    const movedEnv = env
      ? {
          ...env,
          ice: (env.ice as Record<string, unknown>[]).map((i) => ({
            ...i,
            x0: shift(i.x0),
            x1: shift(i.x1),
          })),
          sticks: (env.sticks as Record<string, unknown>[]).map((k) => ({ ...k, x: shift(k.x) })),
          slime: ((env.slime as Record<string, unknown>[] | undefined) ?? []).map((t) => ({
            ...t,
            x0: shift(t.x0),
            x1: shift(t.x1),
          })),
        }
      : undefined;
    return {
      ...save,
      version: 8,
      view: { ...view, cameraX: shift(view.cameraX) },
      world: {
        ...world,
        entities,
        ...(movedEnv ? { env: movedEnv } : {}),
        built: ['area_puddle_pond', 'area_stump_plaza'],
      },
    };
  },
  /**
   * Version 9 (M8, crafting and potions) adds `world.bench` and
   * `world.cauldron`, and entity `parts`, `brew`, `effects`, `toasted`, and
   * `toy`, all optional. Loading gives an older world the bench, the
   * cauldron, and M8's new things in their areas.
   */
  8: (save) => ({ ...save, version: 9 }),
  /**
   * Version 10 (the post-M8 fixes) closes the world: a speed limit, solid
   * end walls, and a lid, and nothing in a save is outside it. Before, a
   * fast drag could launch things over the end walls for good. This brings
   * anything outside version 9's world (195.2 m wide, a lid at -30, the
   * lowest ground at 10.4) back to the plaza, which is always open: a row
   * of drops from the sky at plaza x 7 onward. Loading then lets them fall.
   */
  9: (save) => {
    const WIDTH = 195.2;
    const LID = -30;
    const BELOW = 10.4 + 1.2;
    const DROP_X = 64 + 7;
    const world = save.world as Record<string, unknown>;
    let k = 0;
    const entities = (world.entities as Record<string, unknown>[]).map((e) => {
      const body = e.body as Record<string, unknown>;
      const x = body.x as number;
      const y = body.y as number;
      const inside =
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= WIDTH && y >= LID && y <= BELOW;
      if (inside) return e;
      const back: Record<string, unknown> = {
        ...e,
        body: {
          ...body,
          x: DROP_X + 0.7 * (k % 20),
          y: -1 - 0.8 * Math.floor(k / 20),
          angle: 0,
          vx: 0,
          vy: 0,
          av: 0,
        },
      };
      k++;
      delete back.pinned;
      if (back.toy) {
        const { pivot: _pivot, ...toy } = back.toy as Record<string, unknown>;
        back.toy = toy;
      }
      if (e.kind === 'bug') back.bug = { ...(e.bug as Record<string, unknown>), mode: 'st_airborne' };
      return back;
    });
    return { ...save, version: 10, world: { ...world, entities } };
  },
  /**
   * Version 11 (the post-M8 content pass) re-lays two areas a player may
   * not have reached. A porch still behind its lattice gets the new junk
   * piles and shelves (R02): its items go and `Sim.load` lays it out
   * afresh. A treehouse pegboard still holding its two starting pieces gets
   * the full marble run (R16). Areas the player has played in stay as they
   * are.
   */
  10: (save) => {
    const typed = save as unknown as SaveFile;
    const relaid = addTreehouseRun({ ...typed, world: relayPorch(typed.world) });
    return { ...(relaid as unknown as Record<string, unknown>), version: 11 };
  },
  /**
   * Version 12 (M11, photo mode) adds `meta.photos`, the player's last
   * photos. A world without any has none to add: the version moves on.
   */
  11: (save) => ({ ...save, version: 12 }),
  /**
   * Version 13 (M9) adds the mushroom sequencer as `world.places.sequencer`
   * and new instruments in the flowerbed, the pond, and the treehouse. The
   * migration only bumps the version: loading a world without a sequencer
   * gives it an empty one and the new instruments (`Sim.load`).
   */
  12: (save) => ({ ...save, version: 13 }),
  /**
   * Version 14 (playtest F1 and F2) adds `world.trash` (what the trash can
   * holds until it goes home) and `world.tidy` (the whistle's queue and its
   * dice). A world without them has an empty can; loading gives it the tidy
   * whistle.
   */
  13: (save) => ({ ...save, version: 14 }),
  /**
   * Version 15 (M10) adds `world.journal`, `world.clues`, and
   * `world.hidden`, and entity `home`. A world without a journal starts one
   * on load, with the bugs, items, and areas its secrets and bench already
   * prove the player found, and gets the two hidden areas built, still shut.
   */
  14: (save) => ({ ...save, version: 15 }),
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
