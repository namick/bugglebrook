import type { Container } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { CONTENT } from '../../../game/data';
import type { Game } from '../app/game';
import { BugSprite } from '../render/draw/bug';
import { ItemSprite } from '../render/draw/item';
import { artStore } from './artStore';
import { itemArtBook } from './itemArt';
import type { BoardRow } from './itemBoard';
import { ItemBoard } from './itemBoard';
import type { ItemPack } from './itemSheet';
import type { ItemArtChoice } from './itemSheets';
import type { ItemSheetGuides } from './itemTemplate';
import { itemSheetGuides, itemSheetPlans, withMasks } from './itemTemplate';
import { itemArtChoice, syncItemViews } from './itemViews';

/** How one item is drawn. `texture` is the painting's texture ID: two things with the same ID share one picture. */
export interface ItemArtInfo {
  art: ItemArtChoice;
  texture: number | null;
}

/** Item art's part of the test hook (window.__bb). */
export interface ItemArtHook {
  /** Every item sheet a template can be made for, with the items on it. */
  artItemSheets(): { id: string; items: string[] }[];
  /** Draw an item sheet's guides (the generator, `pnpm art:item-templates`). */
  artItemTemplate(id: string): Promise<ItemSheetGuides>;
  /** Install built item sheets (what `pnpm art:build` writes) into a set. Select the set with `artSelect`. */
  loadItemArt(pack: ItemPack, setId: string, name?: string, credit?: string): Promise<void>;
  /** The item IDs the selected set has painted. */
  itemArtPainted(): string[];
  /** How an item entity in the world is drawn right now, or null when it has no view. */
  itemArt(id: number): ItemArtInfo | null;
  /** How the thing in a pocket slot is drawn, or null when the slot holds no item. */
  pocketItemArt(slot: number): ItemArtInfo | null;
  /** How each thing a bug wears is drawn, by item ID. */
  wornItemArt(bugId: number): (ItemArtInfo & { defId: string })[];
  /** How an item would be drawn anywhere it is shown (the journal, a speech bubble), by item ID. */
  itemArtFor(defId: string): ItemArtChoice;
  /**
   * The fill and stroke colors of the shapes an item's view is drawn with in code, in drawing
   * order: an item in the world or the hand by entity ID, the thing in a pocket slot, or a thing
   * a bug wears. Null when there is no such view. A set's backdrop must never change them.
   */
  itemColors(where: { id: number } | { slot: number } | { bug: number; defId: string }): number[] | null;
  /** Open the item board on a sheet, or close it with null. */
  itemBoard(sheetId: string | null): { rows: BoardRow[]; zoom: number; painted: number } | null;
}

export function itemArtHook(game: Game): ItemArtHook {
  let board: ItemBoard | null = null;
  const info = (sprite: unknown): ItemArtInfo | null => {
    if (!(sprite instanceof ItemSprite)) return null;
    // Views swap their drawing at the start of a frame: answer for now, not for the last frame.
    syncItemViews();
    const texture = sprite.artTexture?.uid ?? null;
    const choice = itemArtChoice(sprite.def);
    return { art: texture === null ? 'code' : choice, texture };
  };
  const colors = (sprite: unknown): number[] | null => {
    if (!(sprite instanceof ItemSprite)) return null;
    const out: number[] = [];
    const walk = (c: Container): void => {
      if (c instanceof Graphics)
        for (const ins of c.context.instructions)
          if (ins.action !== 'texture') out.push(ins.data.style.color);
      for (const child of c.children) walk(child as Container);
    };
    walk(sprite);
    return out;
  };
  return {
    artItemSheets: () => itemSheetPlans().map((p) => ({ id: p.id, items: p.items.map((d) => d.id) })),
    artItemTemplate: (id) => withMasks(itemSheetGuides(game.app.renderer, id)),
    loadItemArt: async (pack, setId, name, credit = 'Test artwork') => {
      await itemArtBook.install(pack, setId);
      if (name) artStore.registerSet({ id: setId, name, credit });
    },
    itemArtPainted: () => itemArtBook.painted(artStore.selection).sort(),
    itemArt: (id) => info(game.session?.view.sprites.get(id)),
    pocketItemArt: (slot) => info(game.session?.pocket.spriteAt(slot)),
    wornItemArt: (bugId) => {
      const sprite = game.session?.view.sprites.get(bugId);
      if (!(sprite instanceof BugSprite)) return [];
      return sprite.wornSprites().map((w) => ({ defId: w.def.id, ...info(w.sprite)! }));
    },
    itemArtFor: (defId) => itemArtChoice(CONTENT.items.get(defId)),
    itemColors: (where) => {
      const s = game.session;
      if (!s) return null;
      if ('slot' in where) return colors(s.pocket.spriteAt(where.slot));
      if ('id' in where) return colors(s.view.sprites.get(where.id));
      const bug = s.view.sprites.get(where.bug);
      if (!(bug instanceof BugSprite)) return null;
      return colors(bug.wornSprites().find((w) => w.def.id === where.defId)?.sprite);
    },
    itemBoard: (sheetId) => {
      board?.destroy();
      board = null;
      if (!sheetId) return null;
      board = new ItemBoard(sheetId);
      game.app.stage.addChild(board);
      return { rows: board.rows, zoom: board.plan.zoom, painted: board.paintedViews() };
    },
  };
}
