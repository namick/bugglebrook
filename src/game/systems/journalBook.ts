import type { Content } from '../data';
import { HIDDEN_AREA_IDS } from '../data';
import type { BugDef, HintGlyph, ItemDef } from '../data/types';
import type { BugObservations, JournalState } from './journal';
import { BUTTERFLY_KEY } from './journal';
import { DAY, phaseAt } from './sky';

/**
 * The journal as pages of entries (game design doc, section 13), worked out
 * from saved state. Pure: the renderer draws what this returns, and tests
 * check the counts and states.
 */

export type PageId =
  | 'page_bugs'
  | 'page_items'
  | 'page_recipes'
  | 'page_potions'
  | 'page_secrets'
  | 'page_mysteries'
  | 'page_photos'
  | 'page_map';

export const PAGE_IDS: readonly PageId[] = [
  'page_bugs',
  'page_items',
  'page_recipes',
  'page_potions',
  'page_secrets',
  'page_mysteries',
  'page_photos',
  'page_map',
];

export type EntryKind = 'bug' | 'item' | 'recipe' | 'potion' | 'secret' | 'area';
export type EntryState = 'unknown' | 'hinted' | 'discovered';

/** When an entry was found: sun or moon, and which day (1 is the first). */
export interface DateStamp {
  night: boolean;
  day: number;
}

export interface JournalEntry {
  key: string;
  kind: EntryKind;
  /** The content ID (for Munch's butterfly, the caterpillar's). */
  id: string;
  state: EntryState;
  /** A 1 to 3 word label, shown only once found. */
  label: string;
  /** The silhouette's pictograms (where or when, never how). */
  hint: readonly HintGlyph[];
  /** One more pictogram, revealed by opening a sparkling entry. */
  extra: HintGlyph | null;
  /** Found but not yet looked at in the journal. */
  isNew: boolean;
  sparkle: boolean;
  stamp: DateStamp | null;
  /** The page section it sits in: an area for secrets, a category for items. */
  group: string;
}

export interface BugCard {
  entry: JournalEntry;
  /** Munch's butterfly card. */
  form: 'butterfly' | null;
  loved: (string | null)[];
  disliked: (string | null)[];
  /** The weird favorite slot (a food most other bugs hate), if the bug has one: filled or not. */
  weird: { food: string; seen: boolean } | null;
  toy: string | null;
  place: string | null;
  photo: boolean;
}

export interface MysteryPanel {
  /** Done, the next one to do (its hint shows), or still hidden. */
  state: 'done' | 'next' | 'hidden';
  hint: readonly HintGlyph[];
  secret: string | null;
}

export interface MysteryPage {
  id: string;
  name: string;
  areas: readonly string[];
  panels: MysteryPanel[];
  started: boolean;
  solved: boolean;
}

export interface AreaCount {
  found: number;
  total: number;
}

export interface JournalBook {
  bugs: BugCard[];
  items: JournalEntry[];
  recipes: JournalEntry[];
  potions: JournalEntry[];
  secrets: JournalEntry[];
  areas: JournalEntry[];
  mysteries: MysteryPage[];
  /** Secrets found and countable per area, for the map and the secrets page. */
  areaCounts: Record<string, AreaCount>;
  /** Discovered over all countable entries (photos and mysteries do not count). */
  completion: { found: number; total: number; percent: number };
  /** Found entries not yet looked at, per page and in all. */
  fresh: Record<PageId, number>;
  newCount: number;
  /** The page of the sparkling entry, if one sparkles. */
  sparklePage: PageId | null;
}

export interface BookInput {
  content: Content;
  secrets: readonly string[];
  journal: JournalState;
  made: readonly string[];
  hinted: readonly string[];
}

/** The order areas appear on the map: the strip left to right, then the two hidden ones. */
export const MAP_AREAS: readonly string[] = [
  'area_flowerbed_stage',
  'area_puddle_pond',
  'area_stump_plaza',
  'area_under_porch',
  'area_compost_lab',
  'area_treehouse_arcade',
  ...HIDDEN_AREA_IDS,
];

const AREA_LABELS: Record<string, string> = {
  area_ant_hill_depths: 'Ant Hill Depths',
  area_gnome_hollow: 'Gnome Hollow',
};

/** Item groups on the items page, in order. */
export const ITEM_GROUPS = ['food', 'toys', 'music', 'hats', 'paints', 'treasures', 'stuff'] as const;
export type ItemGroup = (typeof ITEM_GROUPS)[number];

/** Which group an item sits in on the items page. */
export function itemGroup(def: ItemDef, edible: boolean): ItemGroup {
  if (def.unique) return 'treasures';
  if (def.wear) return 'hats';
  if (def.toy === 'instrument' || def.note !== undefined) return 'music';
  if (def.paint || def.art === 'paint_rainbow') return 'paints';
  if (edible) return 'food';
  if (def.toy || def.blueprint) return 'toys';
  return 'stuff';
}

/**
 * Items the journal counts: everything a player can hold, except potion
 * bottles (the potions page has those), the cauldron's unnamed mix, and the
 * lattice panel (part of the porch's wall).
 */
export function journalItems(content: Content): ItemDef[] {
  return content.items.all.filter(
    (d) => !d.potion && d.id !== 'item_potion_mix' && d.id !== 'item_lattice_panel',
  );
}

/** Potions the journal counts: all but plain water. */
export function journalPotions(content: Content): string[] {
  return content.potions.all.filter((p) => p.id !== 'potion_water').map((p) => p.id);
}

export function dateStamp(clock: number): DateStamp {
  const phase = phaseAt(clock);
  return { night: phase === 'phase_night' || phase === 'phase_dusk', day: Math.floor(clock / DAY) + 1 };
}

/**
 * A food this bug loves or likes that most of the others dislike: its weird
 * favorite (section 13), or null.
 */
export function weirdFavorite(bug: BugDef, all: readonly BugDef[]): string | null {
  const others = all.filter((b) => b.id !== bug.id);
  for (const food of [...bug.loves, ...bug.likes]) {
    const haters = others.filter((b) => b.dislikes.includes(food)).length;
    if (others.length > 0 && haters * 2 >= others.length) return food;
  }
  return null;
}

/** The whole journal. */
export function journalBook(input: BookInput): JournalBook {
  const { content, journal: j } = input;
  const viewed = new Set(j.viewed);
  const found = new Set(input.secrets);
  const hintedKeys = new Set(j.hinted);
  const entry = (
    kind: EntryKind,
    id: string,
    label: string,
    discovered: boolean,
    hinted: boolean,
    hint: readonly HintGlyph[],
    group: string,
    key = `${kind}:${id}`,
  ): JournalEntry => {
    const when = j.when[key];
    return {
      key,
      kind,
      id,
      state: discovered ? 'discovered' : hinted || hintedKeys.has(key) ? 'hinted' : 'unknown',
      label,
      hint,
      extra: j.extra[key] ?? null,
      isNew: discovered && !viewed.has(key),
      sparkle: !discovered && j.sparkle === key,
      stamp: discovered && when !== undefined ? dateStamp(when) : null,
      group,
    };
  };

  // Bugs: the cast, plus Munch's butterfly form after Munch.
  const bugs: BugCard[] = [];
  for (const def of content.bugs.all) {
    const met = j.bugs.includes(def.id);
    const hint = [def.home];
    const obs: BugObservations = j.obs[def.id] ?? {
      loved: [],
      disliked: [],
      toys: {},
      place: null,
      photo: false,
    };
    const card = (e: JournalEntry, form: BugCard['form']): BugCard => {
      const weird = weirdFavorite(def, content.bugs.all);
      const toy =
        Object.entries(obs.toys).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
      return {
        entry: e,
        form,
        loved: pad(
          obs.loved.filter((f) => f !== weird),
          3,
        ),
        disliked: pad(obs.disliked, 2),
        weird: weird ? { food: weird, seen: obs.loved.includes(weird) } : null,
        toy,
        place: obs.place,
        photo: obs.photo,
      };
    };
    bugs.push(card(entry('bug', def.id, def.name, met, false, hint, def.home), null));
    if (def.id === 'bug_caterpillar_munch') {
      const flown = j.when[BUTTERFLY_KEY] !== undefined;
      bugs.push(
        card(
          entry('bug', def.id, 'Butterfly', flown, false, ['cocoon'], def.home, BUTTERFLY_KEY),
          'butterfly',
        ),
      );
    }
  }

  const items = journalItems(content).map((d) =>
    entry(
      'item',
      d.id,
      d.name,
      j.items.includes(d.id),
      false,
      [],
      itemGroup(
        d,
        d.tags.includes('tag_edible') || content.items.get(d.id).adverts.some((a) => a.action === 'eat'),
      ),
    ),
  );

  const recipes = content.recipes.all.map((r) => {
    const out = content.items.tryGet(r.output);
    return entry(
      'recipe',
      r.id,
      out?.name ?? r.id,
      input.made.includes(r.id),
      input.hinted.includes(r.id),
      [],
      'bench',
    );
  });

  const potions = journalPotions(content).map((id) => {
    const p = content.potions.get(id);
    return entry(
      'potion',
      id,
      p.name,
      j.potions.includes(id),
      false,
      [],
      p.recipe.length > 1 ? 'special' : 'base',
    );
  });

  const secrets: JournalEntry[] = [];
  const areaCounts: Record<string, AreaCount> = {};
  for (const area of MAP_AREAS) areaCounts[area] = { found: 0, total: 0 };
  for (const def of content.secrets.all) {
    if (def.blocked) continue;
    const area = def.trigger.type === 'scripted' ? def.trigger.area : 'area_stump_plaza';
    const done = found.has(def.id);
    secrets.push(entry('secret', def.id, def.name, done, false, def.hint, area));
    const count = (areaCounts[area] ??= { found: 0, total: 0 });
    count.total++;
    if (done) count.found++;
  }

  const areas = MAP_AREAS.map((id) => {
    const def = content.areas.tryGet(id);
    const label = def?.name ?? AREA_LABELS[id] ?? id;
    return entry('area', id, label, j.areas.includes(id), false, [id], 'map');
  });

  const mysteries: MysteryPage[] = content.mysteries.all.map((m) => {
    let nextShown = false;
    const panels: MysteryPanel[] = m.steps.map((step) => {
      const done =
        (step.secret !== undefined && found.has(step.secret)) ||
        (step.noticed !== undefined && j.noticed.includes(step.noticed)) ||
        (step.item !== undefined && j.items.includes(step.item));
      if (done) return { state: 'done', hint: step.hint, secret: step.secret ?? null };
      if (!nextShown) {
        nextShown = true;
        return { state: 'next', hint: step.hint, secret: step.secret ?? null };
      }
      return { state: 'hidden', hint: [], secret: step.secret ?? null };
    });
    // Later panels can be done before earlier ones (a scrap found out of
    // order): only the first unfinished panel shows its hint.
    return {
      id: m.id,
      name: m.name,
      areas: m.areas,
      panels,
      started: panels.some((p) => p.state === 'done'),
      solved: panels.every((p) => p.state === 'done'),
    };
  });

  const counted = [...bugs.map((b) => b.entry), ...items, ...recipes, ...potions, ...secrets, ...areas];
  const done = counted.filter((e) => e.state === 'discovered').length;
  const total = counted.length;
  const fresh: Record<PageId, number> = {
    page_bugs: bugs.filter((b) => b.entry.isNew).length,
    page_items: items.filter((e) => e.isNew).length,
    page_recipes: recipes.filter((e) => e.isNew).length,
    page_potions: potions.filter((e) => e.isNew).length,
    page_secrets: secrets.filter((e) => e.isNew).length,
    page_mysteries: 0,
    page_photos: 0,
    page_map: areas.filter((e) => e.isNew).length,
  };
  const sparklePage: PageId | null = j.sparkle
    ? j.sparkle.startsWith('secret:')
      ? 'page_secrets'
      : j.sparkle.startsWith('item:')
        ? 'page_items'
        : j.sparkle.startsWith('bug:')
          ? 'page_bugs'
          : null
    : null;
  return {
    bugs,
    items,
    recipes,
    potions,
    secrets,
    areas,
    mysteries,
    areaCounts,
    completion: { found: done, total, percent: total === 0 ? 0 : (100 * done) / total },
    fresh,
    newCount: Object.values(fresh).reduce((a, b) => a + b, 0),
    sparklePage,
  };
}

function pad<T>(list: readonly T[], n: number): (T | null)[] {
  const out: (T | null)[] = list.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}
