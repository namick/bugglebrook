import type { Sim } from '../sim';
import type { GameEvents } from '../events';
import { SIM_HZ } from '../core/loop';
import type { SecretDef } from '../data/types';

/**
 * The journal's memory (game design doc, section 13): what the player has
 * met, found, and watched happen, saved as `world.journal`. Secrets, recipes,
 * and blueprints already live elsewhere (`sim.secrets`, the bench); this
 * keeps the rest. It listens to the sim's events, but only writes them down
 * in a buffer; `update` (once per step, inside `sim.step`) turns them into
 * entries, so no event handler changes the world.
 *
 * Entry keys are `kind:id`: `bug:bug_ladybug_dot`, `item:item_pebble`,
 * `potion:potion_giant`, `recipe:recipe_slingshot`, `secret:secret_boot_key`,
 * `area:area_puddle_pond`, and `bug:bug_caterpillar_munch@butterfly` for
 * Munch's other form.
 */

/** What the player has seen one bug do (the bug card's slots). */
export interface BugObservations {
  /** Loved or liked foods the player saw it eat (up to 3). */
  loved: string[];
  /** Foods the player saw it spit out (up to 2). */
  disliked: string[];
  /** Times the player saw it play with each toy. */
  toys: Record<string, number>;
  /** Where the player saw it fall asleep last. */
  place: string | null;
  /** In a photo the player took. */
  photo: boolean;
}

/** The area every new game starts in. */
const START_AREA = 'area_stump_plaza';

export interface JournalState {
  /** Bugs met (touched, fed, or found), in order. */
  bugs: string[];
  /** Item kinds found (picked up, poked, pocketed, made, or given by a secret), in order. */
  items: string[];
  /** Potions brewed or tasted, in order. */
  potions: string[];
  /** Areas visited while open, in order. */
  areas: string[];
  obs: Record<string, BugObservations>;
  /** Clues noticed that are not secrets (the gnome's sniffle, the moss's squeak). */
  noticed: string[];
  /** Entries hinted (the window telescope), as keys. */
  hinted: string[];
  /** Entries the player has looked at in the journal, as keys: the rest found are "new!". */
  viewed: string[];
  /** Item kinds that flew out of the world and came back, newest last (Gnome Hollow's shelf). */
  lost: string[];
  /** The clock when each entry was found, for its date stamp (sun or moon, and the day). */
  when: Record<string, number>;
  /** The tick of the last discovery. */
  last: number;
  /** The entry that sparkles after a long time with no discovery, if any. */
  sparkle: string | null;
  /** Extra pictograms that opened sparkles revealed, by entry key. */
  extra: Record<string, string>;
}

export function newJournalState(): JournalState {
  return {
    bugs: [],
    items: [],
    potions: [],
    areas: [],
    obs: {},
    noticed: [],
    hinted: [],
    viewed: [],
    lost: [],
    when: {},
    last: 0,
    sparkle: null,
    extra: {},
  };
}

/** Bug card slots (section 13). */
export const OBS_SLOTS = { loved: 3, disliked: 2 } as const;
/** Fifteen minutes of play with no discovery, and one entry sparkles. */
export const SPARKLE_AFTER = 15 * 60 * SIM_HZ;
/** Gnome Hollow's lost-toy shelf keeps this many. */
export const LOST_SHELF = 24;
/** Things the renderer may tell the sim the player noticed (hover clues). */
export const NOTICES = [
  'gnome_sniffle',
  'moss_squeak',
  'nose_carried',
  'rain_seen',
  'cloud_jar_used',
] as const;
export type Notice = (typeof NOTICES)[number];

/** Munch's butterfly form has its own card. */
export const BUTTERFLY_KEY = 'bug:bug_caterpillar_munch@butterfly';

type Seen =
  | { k: 'bug'; defId: string }
  | { k: 'item'; defId: string }
  | { k: 'potion'; potion: string }
  | { k: 'secret'; id: string }
  | { k: 'recipe'; id: string }
  | { k: 'ate'; bug: string; food: string; liking: string; x: number }
  | { k: 'spat'; bug: string; food: string; x: number }
  | { k: 'toy'; bug: string; toy: string; x: number }
  | { k: 'slept'; bug: string; x: number }
  | { k: 'photo'; bugs: string[] }
  | { k: 'lost'; defId: string }
  | { k: 'form'; form: string }
  | { k: 'notice'; what: string };

export class Journal {
  state: JournalState = newJournalState();
  private seen: Seen[] = [];

  constructor(private readonly sim: Sim) {
    const on = <K extends keyof GameEvents>(name: K, fn: (e: GameEvents[K]) => void): void => {
      sim.events.on(name, fn);
    };
    const push = (s: Seen): void => {
      this.seen.push(s);
    };
    on('item_grabbed', (e) =>
      push(e.kind === 'bug' ? { k: 'bug', defId: e.defId } : { k: 'item', defId: e.defId }),
    );
    on('item_poked', (e) => push({ k: 'item', defId: e.defId }));
    on('bug_poked', (e) => push({ k: 'bug', defId: e.defId }));
    on('bug_tickled', (e) => push({ k: 'bug', defId: e.defId }));
    on('bug_fed', (e) => {
      if (e.byPlayer) push({ k: 'bug', defId: e.defId });
      if (e.byPlayer) push({ k: 'item', defId: e.itemDefId });
    });
    on('bug_joined', (e) => push({ k: 'bug', defId: e.defId }));
    on('pocketed', (e) =>
      push(e.kind === 'bug' ? { k: 'bug', defId: e.defId } : { k: 'item', defId: e.defId }),
    );
    on('crafted', (e) => {
      push({ k: 'item', defId: e.defId });
      push({ k: 'recipe', id: e.recipe });
    });
    on('potion_brewed', (e) => {
      if (e.potion) push({ k: 'potion', potion: e.potion });
    });
    on('potion_drunk', (e) => {
      if (e.potion) push({ k: 'potion', potion: e.potion });
    });
    on('potion_shattered', (e) => {
      if (e.potion) push({ k: 'potion', potion: e.potion });
    });
    on('secret_found', (e) => push({ k: 'secret', id: e.id }));
    on('bug_ate', (e) => push({ k: 'ate', bug: e.defId, food: e.itemDefId, liking: e.liking, x: e.x }));
    on('bug_spat', (e) => push({ k: 'spat', bug: e.defId, food: e.itemDefId, x: e.x }));
    on('bug_used', (e) => {
      if (e.targetId === null || e.action === 'eat') return;
      const target = sim.entities.get(e.targetId);
      if (!target || target.kind !== 'item') return;
      push({ k: 'toy', bug: e.defId, toy: target.defId, x: sim.physics.getState(e.id).x });
    });
    on('bug_slept', (e) => push({ k: 'slept', bug: e.defId, x: e.x }));
    on('photo_taken', (e) => push({ k: 'photo', bugs: e.bugs }));
    on('entity_returned', (e) => {
      if (e.kind === 'item') push({ k: 'lost', defId: e.defId });
    });
    on('bug_changed', (e) => push({ k: 'form', form: e.form }));
  }

  restore(state: JournalState): void {
    this.state = { ...newJournalState(), ...state };
  }

  serialize(): JournalState {
    return JSON.parse(JSON.stringify(this.state)) as JournalState;
  }

  /**
   * A world saved before the journal (version 13 and older) starts one with
   * what it already proves: the bugs out and about, what its secrets gave,
   * what the bench made, and the open areas. None of it shows as new.
   */
  seed(): void {
    const sim = this.sim;
    const s = this.state;
    const keys: string[] = [];
    const add = (list: string[], id: string, key: string): void => {
      if (!list.includes(id)) list.push(id);
      s.when[key] ??= sim.weather.clock;
      keys.push(key);
    };
    for (const e of sim.entities.ofKind('bug')) if (!e.bug?.pending) add(s.bugs, e.defId, `bug:${e.defId}`);
    for (const id of sim.secrets) {
      s.when[`secret:${id}`] ??= sim.weather.clock;
      keys.push(`secret:${id}`);
      for (const u of sim.content.secrets.tryGet(id)?.unlocks ?? [])
        if (u.kind === 'item') add(s.items, u.id, `item:${u.id}`);
    }
    for (const r of sim.bench.state.made) {
      const out = sim.content.recipes.tryGet(r)?.output;
      if (out) add(s.items, out, `item:${out}`);
      s.when[`recipe:${r}`] ??= sim.weather.clock;
      keys.push(`recipe:${r}`);
    }
    for (const a of sim.content.areas.all) if (sim.barriers.isOpen(a.id)) add(s.areas, a.id, `area:${a.id}`);
    s.last = sim.tick;
    this.viewed(keys);
  }

  /** The renderer saw the player notice a clue (a hover), through the `notice` command. */
  notice(what: string): void {
    if ((NOTICES as readonly string[]).includes(what)) this.seen.push({ k: 'notice', what });
  }

  /** The player looked at these entries in the journal: they are no longer new. */
  viewed(keys: readonly string[]): void {
    const s = this.state;
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 80) continue;
      if (!s.viewed.includes(key)) s.viewed.push(key);
      // Opening a sparkling entry reveals one more pictogram (section 13).
      if (s.sparkle === key && s.extra[key] === undefined) {
        const extra = this.extraFor(key);
        if (extra) s.extra[key] = extra;
      }
    }
  }

  /** Mark an entry hinted (the window telescope pointed at it). */
  hint(key: string): void {
    if (!this.state.hinted.includes(key)) this.state.hinted.push(key);
  }

  /** Once per step: write down what happened, then check the sparkle. */
  update(): void {
    const seen = this.seen;
    if (seen.length > 0) {
      this.seen = [];
      for (const s of seen) this.record(s);
    }
    if (this.sim.tick % 60 === 0) {
      this.visit();
      this.checkSparkle();
    }
  }

  /** Is the event at world x where the player could see it? (Everywhere, with no camera.) */
  private watched(x: number): boolean {
    const f = this.sim.focus;
    return !f || (x >= f.x0 - 1 && x <= f.x1 + 1);
  }

  private found(key: string): void {
    const s = this.state;
    if (s.when[key] !== undefined) return;
    s.when[key] = this.sim.weather.clock;
    s.last = this.sim.tick;
    if (s.sparkle === key) s.sparkle = null;
  }

  private addTo(list: string[], id: string, key: string): void {
    if (!list.includes(id)) list.push(id);
    this.found(key);
  }

  private obsOf(bug: string): BugObservations {
    return (this.state.obs[bug] ??= { loved: [], disliked: [], toys: {}, place: null, photo: false });
  }

  private record(s: Seen): void {
    const st = this.state;
    const content = this.sim.content;
    switch (s.k) {
      case 'bug':
        if (content.bugs.has(s.defId)) this.addTo(st.bugs, s.defId, `bug:${s.defId}`);
        return;
      case 'item':
        if (content.items.has(s.defId)) this.addTo(st.items, s.defId, `item:${s.defId}`);
        return;
      case 'potion':
        if (content.potions.has(s.potion)) this.addTo(st.potions, s.potion, `potion:${s.potion}`);
        return;
      case 'recipe':
        this.found(`recipe:${s.id}`);
        return;
      case 'secret': {
        this.found(`secret:${s.id}`);
        const def = content.secrets.tryGet(s.id);
        for (const u of def?.unlocks ?? []) {
          if (u.kind === 'item') this.addTo(st.items, u.id, `item:${u.id}`);
          if (u.kind === 'bug') this.addTo(st.bugs, u.id, `bug:${u.id}`);
        }
        if (s.id === 'secret_munch_butterfly') this.found(BUTTERFLY_KEY);
        return;
      }
      case 'form':
        if (s.form === 'butterfly') this.found(BUTTERFLY_KEY);
        return;
      case 'ate': {
        if (!this.watched(s.x) || (s.liking !== 'loved' && s.liking !== 'liked')) return;
        const o = this.obsOf(s.bug);
        if (!o.loved.includes(s.food) && o.loved.length < OBS_SLOTS.loved) o.loved.push(s.food);
        return;
      }
      case 'spat': {
        if (!this.watched(s.x) || !content.bugs.tryGet(s.bug)?.dislikes.includes(s.food)) return;
        const o = this.obsOf(s.bug);
        if (!o.disliked.includes(s.food) && o.disliked.length < OBS_SLOTS.disliked) o.disliked.push(s.food);
        return;
      }
      case 'toy': {
        if (!this.watched(s.x)) return;
        const o = this.obsOf(s.bug);
        o.toys[s.toy] = (o.toys[s.toy] ?? 0) + 1;
        return;
      }
      case 'slept':
        if (this.watched(s.x)) this.obsOf(s.bug).place = this.sim.areaOf(s.x).id;
        return;
      case 'photo':
        for (const b of s.bugs) if (content.bugs.has(b)) this.obsOf(b).photo = true;
        return;
      case 'lost': {
        const i = st.lost.indexOf(s.defId);
        if (i >= 0) st.lost.splice(i, 1);
        st.lost.push(s.defId);
        if (st.lost.length > LOST_SHELF) st.lost.shift();
        return;
      }
      case 'notice':
        if (!st.noticed.includes(s.what)) st.noticed.push(s.what);
        return;
    }
  }

  /** The area the camera looks at is visited once it is open. */
  private visit(): void {
    const f = this.sim.focus;
    const x = f ? (f.x0 + f.x1) / 2 : null;
    const areas = this.sim.content.areas.all;
    // With no camera (tests, a fresh world), the plaza counts as visited.
    const area = x === null ? this.sim.content.areas.tryGet(START_AREA) : this.sim.areaOf(x);
    if (!area || areas.length === 0) return;
    if (!this.sim.barriers.isOpen(area.id)) return;
    if (this.state.areas.includes(area.id)) return;
    this.addTo(this.state.areas, area.id, `area:${area.id}`);
    // Every game starts here: it is on the map from the first frame, never a "new!" find (PM-05).
    if (area.id === START_AREA) this.viewed([`area:${area.id}`]);
  }

  /**
   * After 15 minutes of play with no discovery, one secret the player could
   * find next sparkles: its prerequisites met, its area open, the area being
   * looked at first, then the easiest.
   */
  private checkSparkle(): void {
    const s = this.state;
    if (s.sparkle !== null || this.sim.tick - s.last < SPARKLE_AFTER) return;
    const pick = nextSecret(
      this.sim.content.secrets.all,
      this.sim.secrets,
      (a) => this.areaOpen(a),
      this.lookingAt(),
    );
    if (pick) s.sparkle = `secret:${pick.id}`;
  }

  private lookingAt(): string | null {
    const f = this.sim.focus;
    return f ? this.sim.areaOf((f.x0 + f.x1) / 2).id : null;
  }

  private areaOpen(id: string): boolean {
    return this.sim.barriers.isOpen(id);
  }

  /** One extra pictogram for a sparkling secret: its area, if the hint does not show it. */
  private extraFor(key: string): string | null {
    const [kind, id] = key.split(':');
    if (kind !== 'secret' || !id) return null;
    const def = this.sim.content.secrets.tryGet(id);
    if (!def || def.trigger.type !== 'scripted') return null;
    const area = def.trigger.area;
    return def.hint.includes(area) ? null : area;
  }
}

/**
 * The secret the player is closest to: not found, not blocked, its
 * prerequisites found, its area open; in the area being looked at if one
 * fits, then the lowest tier, then the doc's order. Pure.
 */
export function nextSecret(
  all: readonly SecretDef[],
  found: readonly string[],
  open: (areaId: string) => boolean,
  lookingAt: string | null,
): SecretDef | null {
  const ready = all.filter(
    (d) =>
      !d.blocked &&
      !found.includes(d.id) &&
      (d.requires ?? []).every((r) => found.includes(r)) &&
      d.trigger.type === 'scripted' &&
      open(d.trigger.area),
  );
  const here = ready.filter((d) => d.trigger.type === 'scripted' && d.trigger.area === lookingAt);
  const pool = here.length > 0 ? here : ready;
  let best: SecretDef | null = null;
  for (const d of pool) if (!best || d.tier < best.tier) best = d;
  return best;
}
