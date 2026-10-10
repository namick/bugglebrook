import type { Game } from '../app/game';
import type { ItemSheetGuides } from './itemTemplate';
import { itemSheetGuides, itemSheetPlans, withMasks } from './itemTemplate';

/** Item art's part of the test hook (window.__bb). */
export interface ItemArtHook {
  /** Every item sheet a template can be made for, with the items on it. */
  artItemSheets(): { id: string; items: string[] }[];
  /** Draw an item sheet's guides (the generator, `pnpm art:item-templates`). */
  artItemTemplate(id: string): Promise<ItemSheetGuides>;
}

export function itemArtHook(game: Game): ItemArtHook {
  return {
    artItemSheets: () => itemSheetPlans().map((p) => ({ id: p.id, items: p.items.map((d) => d.id) })),
    artItemTemplate: (id) => withMasks(itemSheetGuides(game.app.renderer, id)),
  };
}
