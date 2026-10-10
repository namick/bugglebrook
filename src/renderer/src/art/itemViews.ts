import { CONTENT } from '../../../game/data';
import type { ItemDef } from '../../../game/data/types';
import type { ItemArt } from '../render/draw/item';
import { ItemSprite } from '../render/draw/item';
import type { ArtStore } from './artStore';
import { artStore } from './artStore';
import type { ItemArtBook, ItemFrame } from './itemArt';
import { itemArtBook } from './itemArt';
import type { ItemArtChoice } from './itemSheets';
import { chooseItemArt } from './itemSheets';
import { SpriteBugView } from './spriteBug';

/** Twig, whose `stick` drawing is every twig item's drawing too (docs/06-art-guide.md, B7). */
const twigDef = (): (typeof CONTENT.bugs.all)[number] | undefined =>
  CONTENT.bugs.all.find((b) => b.art === 'stickinsect');

/** Where an item's picture comes from right now: the set's painting, Twig's stick, or code. */
export function itemArtChoice(
  def: ItemDef,
  store: ArtStore = artStore,
  book: ItemArtBook = itemArtBook,
): ItemArtChoice {
  const twig = def.art === 'twig' ? twigDef() : undefined;
  return chooseItemArt(def, {
    mode: store.mode,
    painted: (id) => book.get(store.selection, id) !== null,
    twigDrawn: !!twig && store.status(twig).drawn,
  });
}

/** The pages to draw from: 2x on a sharp screen, else 1x (or whatever the art has). */
function pick<T>(scales: Partial<Record<1 | 2, T>>): { scale: 1 | 2; value: T } | null {
  const want = SpriteBugView.forceScale ?? (SpriteBugView.resolution > 1.25 ? 2 : 1);
  for (const scale of [want, 1, 2] as const) {
    const value = scales[scale];
    if (value) return { scale, value };
  }
  return null;
}

/**
 * Hand-drawn art for an item, or null to draw it in code. The selected set's
 * own painting of the item when it has one; and when Twig is drawn from art,
 * the twig item uses his `stick`, so his disguise still matches.
 */
export function itemArt(
  def: ItemDef,
  store: ArtStore = artStore,
  book: ItemArtBook = itemArtBook,
): ItemArt | null {
  const choice = itemArtChoice(def, store, book);
  if (choice === 'code') return null;
  if (choice === 'sheet') {
    const got = pick<ItemFrame>(book.get(store.selection, def.id)!.scales);
    // No rim of its own: a painted item keeps the code-drawn shape, so the code-drawn rim fits it.
    return got && { ...got.value, k: 1 / got.scale, rim: null };
  }
  const art = store.get(twigDef()!.id)!;
  const set = pick(art.scales)?.value;
  const texture = set?.frames.get('stick');
  if (!set || !texture) return null;
  const rim = set.frames.get('stick@rim');
  return {
    texture,
    anchor: set.anchors.get('stick')!,
    k: 1 / set.scale,
    rim: rim ? { texture: rim, anchor: set.anchors.get('stick@rim')! } : null,
  };
}

/** Item views alive now, so a change of art reaches every one of them, wherever it is shown. */
const live = new Set<WeakRef<ItemSprite>>();
let sweepAt = 256;
let seenVersion = artStore.version;

/**
 * A view for an item: the selected set's painting when it has one, else
 * code-drawn. Every place that shows an item makes it here, so the world,
 * the pocket, the journal, and the speech bubbles agree.
 */
export function makeItemView(def: ItemDef, seed = 0): ItemSprite {
  const item = new ItemSprite(def, seed);
  item.useArt(itemArt(def));
  const ref = new WeakRef(item);
  live.add(ref);
  item.once('destroyed', () => live.delete(ref));
  // Views dropped without being destroyed leave dead entries: clear them out now and then.
  if (live.size > sweepAt) {
    for (const r of live) if (!r.deref()) live.delete(r);
    sweepAt = Math.max(256, live.size * 2);
  }
  return item;
}

/**
 * Call once a frame. When the art changed (another set chosen, art switched
 * off, a sheet reloaded), every item view alive swaps its drawing in place.
 */
export function syncItemViews(): void {
  if (seenVersion === artStore.version) return;
  seenVersion = artStore.version;
  for (const ref of live) {
    const item = ref.deref();
    if (!item || item.destroyed) live.delete(ref);
    else item.useArt(itemArt(item.def));
  }
}

/** How many item views are being kept in step with the art (tests). */
export const liveItemViews = (): number => live.size;
