import type { Content } from '../../../game/data';
import type { ItemGroup, JournalBook, JournalEntry, PageId } from '../../../game';
import { ITEM_GROUPS, MAP_AREAS, PAGE_IDS, badgeCount } from '../../../game';

/**
 * How the journal's pages split into spreads, the jar's glowing dots, the
 * badge, and the map's shape. Pure, so the paging and counts are tested
 * without Pixi; `journalView.ts` draws what this says.
 */

/** Bug cards per side (4 per spread, section 13). */
export const BUGS_PER_SIDE = 2;
/** Items per side (12 per spread). */
export const ITEMS_PER_SIDE = 6;
export const RECIPES_PER_SIDE = 4;
export const POTIONS_PER_SIDE = 5;
/** Secrets per side; an area with more runs onto the next side. */
export const SECRETS_PER_SIDE = 8;
export const PHOTOS_PER_SIDE = 3;
/** The most photos the journal keeps (section 13). */
export const PHOTO_PAGE_KEEP = 60;

/** One page of the open book. */
export type Side =
  | { kind: 'blank' }
  /** The first page: the big jar and the percentage. */
  | { kind: 'jar' }
  /** Beside it: every tab with its count. */
  | { kind: 'contents' }
  | { kind: 'bugs'; cards: number[] }
  | { kind: 'items'; group: ItemGroup; entries: number[]; first: boolean }
  | { kind: 'recipes'; entries: number[] }
  | { kind: 'essences' }
  | { kind: 'potions'; entries: number[] }
  | { kind: 'secrets'; area: string; entries: number[]; first: boolean }
  | { kind: 'mystery'; index: number }
  /** Indexes into the photos, newest first. */
  | { kind: 'photos'; photos: number[] }
  /** The map runs across the whole spread (both sides are `map`). */
  | { kind: 'map' };

export interface Spread {
  /** The tab it belongs to, or null for the first spread. */
  page: PageId | null;
  left: Side;
  right: Side;
  /** Which spread of its tab this is, and how many the tab has. */
  index: number;
  count: number;
}

function chunk<T>(list: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Sides for one tab, in reading order. */
export function sidesOf(book: JournalBook, page: PageId, photos: number): Side[] {
  switch (page) {
    case 'page_bugs':
      return chunk(range(book.bugs.length), BUGS_PER_SIDE).map((cards) => ({ kind: 'bugs', cards }));
    case 'page_items': {
      // Each group starts a new spread, so a spread never mixes groups.
      const sides: Side[] = [];
      for (const group of ITEM_GROUPS) {
        const idx = book.items.flatMap((e, i) => (e.group === group ? [i] : []));
        if (idx.length === 0) continue;
        if (sides.length % 2 === 1) sides.push({ kind: 'blank' });
        chunk(idx, ITEMS_PER_SIDE).forEach((entries, k) =>
          sides.push({ kind: 'items', group, entries, first: k === 0 }),
        );
      }
      return sides;
    }
    case 'page_recipes':
      return chunk(range(book.recipes.length), RECIPES_PER_SIDE).map((entries) => ({
        kind: 'recipes',
        entries,
      }));
    case 'page_potions':
      return [
        { kind: 'essences' },
        ...chunk(range(book.potions.length), POTIONS_PER_SIDE).map((entries): Side => ({
          kind: 'potions',
          entries,
        })),
      ];
    case 'page_secrets': {
      const sides: Side[] = [];
      for (const area of secretAreas(book)) {
        const idx = book.secrets.flatMap((e, i) => (e.group === area ? [i] : []));
        chunk(idx, SECRETS_PER_SIDE).forEach((entries, k) =>
          sides.push({ kind: 'secrets', area, entries, first: k === 0 }),
        );
      }
      return sides;
    }
    case 'page_mysteries':
      return book.mysteries.map((_, index) => ({ kind: 'mystery', index }));
    case 'page_photos': {
      const n = Math.min(photos, PHOTO_PAGE_KEEP);
      // An empty album still has its page (a dotted polaroid waiting).
      if (n === 0) return [{ kind: 'photos', photos: [] }];
      return chunk(range(n), PHOTOS_PER_SIDE).map((p) => ({ kind: 'photos', photos: p }));
    }
    case 'page_map':
      // One map across the spread: each side draws its half.
      return [{ kind: 'map' }, { kind: 'map' }];
  }
}

/** Areas with secrets, map order first, then any others. */
export function secretAreas(book: JournalBook): string[] {
  const groups = [...new Set(book.secrets.map((e) => e.group))];
  const known = MAP_AREAS.filter((a) => groups.includes(a));
  return [...known, ...groups.filter((g) => !MAP_AREAS.includes(g))];
}

/** The whole book as spreads: the jar first, then each tab's spreads. */
export function spreadsOf(book: JournalBook, photos: number): Spread[] {
  const out: Spread[] = [
    { page: null, left: { kind: 'jar' }, right: { kind: 'contents' }, index: 0, count: 1 },
  ];
  for (const page of PAGE_IDS) {
    const sides = sidesOf(book, page, photos);
    if (sides.length % 2 === 1) sides.push({ kind: 'blank' });
    const count = sides.length / 2;
    for (let i = 0; i < count; i++)
      out.push({ page, left: sides[i * 2]!, right: sides[i * 2 + 1]!, index: i, count });
  }
  return out;
}

/** The first spread of a tab. */
export function firstSpreadOf(spreads: readonly Spread[], page: PageId): number {
  const i = spreads.findIndex((s) => s.page === page);
  return i < 0 ? 0 : i;
}

/** The entries one side shows (what it marks seen and reveals). */
export function sideEntries(book: JournalBook, side: Side): JournalEntry[] {
  switch (side.kind) {
    case 'bugs':
      return side.cards.map((i) => book.bugs[i]!.entry);
    case 'items':
      return side.entries.map((i) => book.items[i]!);
    case 'recipes':
      return side.entries.map((i) => book.recipes[i]!);
    case 'potions':
      return side.entries.map((i) => book.potions[i]!);
    case 'secrets':
      return side.entries.map((i) => book.secrets[i]!);
    case 'map':
      return book.areas;
    default:
      return [];
  }
}

export function spreadEntries(book: JournalBook, spread: Spread): JournalEntry[] {
  const all = [...sideEntries(book, spread.left), ...sideEntries(book, spread.right)];
  return [...new Map(all.map((e) => [e.key, e])).values()];
}

/**
 * The book as it looks with `seen` viewed too. The sim takes `journal_seen`
 * on its next step, and the world is paused while the book is open, so the
 * book shows what the player has looked at straight away.
 */
export function withSeen(book: JournalBook, seen: ReadonlySet<string>): JournalBook {
  if (seen.size === 0) return book;
  const fix = (e: JournalEntry): JournalEntry => (e.isNew && seen.has(e.key) ? { ...e, isNew: false } : e);
  const bugs = book.bugs.map((b) => ({ ...b, entry: fix(b.entry) }));
  const items = book.items.map(fix);
  const recipes = book.recipes.map(fix);
  const potions = book.potions.map(fix);
  const secrets = book.secrets.map(fix);
  const areas = book.areas.map(fix);
  const count = (list: readonly JournalEntry[]): number => list.filter((e) => e.isNew).length;
  const fresh: Record<PageId, number> = {
    ...book.fresh,
    page_bugs: count(bugs.map((b) => b.entry)),
    page_items: count(items),
    page_recipes: count(recipes),
    page_potions: count(potions),
    page_secrets: count(secrets),
    page_map: count(areas),
  };
  return {
    ...book,
    bugs,
    items,
    recipes,
    potions,
    secrets,
    areas,
    fresh,
    newCount: badgeCount(fresh),
  };
}

/** Found and total per tab (photos and mysteries have their own counts). */
export function pageCounts(
  book: JournalBook,
  photos: number,
): Record<PageId, { found: number; total: number }> {
  const c = (list: readonly JournalEntry[]): { found: number; total: number } => ({
    found: list.filter((e) => e.state === 'discovered').length,
    total: list.length,
  });
  return {
    page_bugs: c(book.bugs.map((b) => b.entry)),
    page_items: c(book.items),
    page_recipes: c(book.recipes),
    page_potions: c(book.potions),
    page_secrets: c(book.secrets),
    page_mysteries: {
      found: book.mysteries.filter((m) => m.solved).length,
      total: book.mysteries.length,
    },
    page_photos: { found: Math.min(photos, PHOTO_PAGE_KEEP), total: PHOTO_PAGE_KEEP },
    page_map: c(book.areas),
  };
}

/** What the badge on the journal button says, or null when nothing is new. */
export function badgeText(newCount: number): string | null {
  if (newCount <= 0) return null;
  return newCount > 99 ? '99+' : String(newCount);
}

/** The percentage on the first page, as a whole number (100 only when everything is found). */
export function percentText(found: number, total: number): string {
  if (total <= 0) return '0%';
  if (found >= total) return '100%';
  return `${Math.min(99, Math.floor((100 * found) / total))}%`;
}

/** How many glowing dots the jar holds at this completion (out of `max`). */
export function jarDotCount(found: number, total: number, max: number): number {
  if (total <= 0 || found <= 0) return 0;
  if (found >= total) return max;
  // Even one find shows one dot.
  return Math.max(1, Math.min(max - 1, Math.round((max * found) / total)));
}

/**
 * Where the jar's dots sit: packed from the bottom up in staggered rows,
 * inside a jar `w` wide and `h` tall centered on (0, 0), with a little
 * fixed wobble so it looks scooped, not stacked. The same count always
 * gives the same dots.
 */
export function jarDots(n: number, w: number, h: number, r: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const pitch = r * 2.05;
  const perRow = Math.max(1, Math.floor((w - r) / pitch));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const offset = row % 2 === 1 ? pitch / 2 : 0;
    const rowW = (perRow - 1) * pitch + offset;
    const jx = Math.sin(i * 12.9898) * r * 0.35;
    const jy = Math.sin(i * 78.233) * r * 0.25;
    const y = h / 2 - r - row * pitch * 0.88 + jy;
    if (y < -h / 2 + r) break;
    out.push({ x: -rowW / 2 + col * pitch + offset + jx, y });
  }
  return out;
}

/**
 * The menu sign's jar (playtest F4): the share of the secrets a world could
 * find that it has. Blocked secrets do not count, nor do unknown IDs.
 */
export function secretJar(
  content: Pick<Content, 'secrets'>,
  found: readonly string[] | undefined,
): { found: number; total: number; fill: number } {
  const countable = new Set(content.secrets.all.filter((d) => !d.blocked).map((d) => d.id));
  const have = new Set((found ?? []).filter((id) => countable.has(id))).size;
  const total = countable.size;
  return { found: have, total, fill: total === 0 ? 0 : have / total };
}

/** One area on the map page, in map pixels (0 to `width` across). */
export interface MapArea {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Below the garden strip (the hidden places). */
  hidden: boolean;
}

/**
 * The map: the six strip areas side by side in proportion to their widths,
 * and the hidden places as pockets below, each under the strip area it is
 * reached from (the ant hill under the plaza, the hollow inside the
 * flowerbed's gnome), or spaced along the bottom if that area is unknown.
 */
export function mapLayout(
  areaSpan: (id: string) => { x0: number; x1: number } | null,
  width: number,
  stripH: number,
  hiddenH: number,
  gap: number,
): MapArea[] {
  const strip = MAP_AREAS.slice(0, 6);
  const spans = strip.map((id, i) => areaSpan(id) ?? { x0: i * 32, x1: (i + 1) * 32 });
  const x0 = Math.min(...spans.map((s) => s.x0));
  const x1 = Math.max(...spans.map((s) => s.x1));
  const k = width / Math.max(1, x1 - x0);
  const out: MapArea[] = strip.map((id, i) => ({
    id,
    x: (spans[i]!.x0 - x0) * k,
    y: 0,
    w: (spans[i]!.x1 - spans[i]!.x0) * k,
    h: stripH,
    hidden: false,
  }));
  const under: Record<string, string> = {
    area_ant_hill_depths: 'area_stump_plaza',
    area_gnome_hollow: 'area_flowerbed_stage',
  };
  const hidden = MAP_AREAS.slice(6);
  hidden.forEach((id, i) => {
    const parent = out.find((a) => a.id === under[id]);
    const w = Math.min(width / 4, parent ? parent.w * 0.9 : width / 4);
    const cx = parent ? parent.x + parent.w / 2 : ((i + 1) * width) / (hidden.length + 1);
    out.push({ id, x: cx - w / 2, y: stripH + gap, w, h: hiddenH, hidden: true });
  });
  return out;
}
