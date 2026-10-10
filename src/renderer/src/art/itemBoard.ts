import { Container, Graphics, Text } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { CONTENT } from '../../../game/data';
import type { ItemDef } from '../../../game/data/types';
import { ItemSprite } from '../render/draw/item';
import { OUTLINE } from '../render/palette';
import { artStore } from './artStore';
import { ITEM_SCALE } from './itemSheet';
import { GUIDE_SEED, itemSheetFile } from './itemTemplate';
import { itemArtChoice, makeItemView } from './itemViews';

/**
 * The item board: one sheet's items in a row each, the code-drawn item
 * beside the selected set's painting, then that painting with paint on it,
 * with bites out of it (food), and under the night tint. For reviewing a
 * set's items by eye (`pnpm shots -g "item art"`); tests open it with
 * `__bb.itemBoard(sheet)`. Built on the real views, so what it shows is what
 * the game shows.
 */

/** The columns, left to right. */
export const BOARD_LOOKS = ['code', 'art', 'paint', 'bites', 'night'] as const;
export type BoardLook = (typeof BOARD_LOOKS)[number];

const PAPER = 0x9ccf7a;
const NIGHT = 0x6a74b8;
const HEAD = 64;
const LABEL = 26;
const GAP = 14;
const ZOOMS = [3, 2.5, 2, 1.5, 1.25, 1, 0.75, 0.5];

export interface BoardRow {
  id: string;
  /** Where the `art` column's picture comes from. */
  art: 'sheet' | 'twig' | 'code';
  /** Size of one picture's slot, in game pixels. */
  w: number;
  h: number;
}

/** Where one row goes, in screen pixels, and how big it is drawn. */
export interface BoardSpot {
  x: number;
  y: number;
  zoom: number;
  /** One slot's width. */
  slot: number;
}

export interface BoardPlan {
  /** The zoom small things are drawn at. Wide things get less, so each still fits across the screen. */
  zoom: number;
  at: BoardSpot[];
}

/**
 * Fit the rows on the screen: each row is one item's pictures side by side,
 * and rows flow like words on a page, at the biggest zoom that fits them
 * all. A row too wide for that zoom is drawn smaller, on a line of its own. Pure.
 */
export function planBoard(rows: readonly { w: number; h: number }[], looks: number): BoardPlan {
  const W = VIEW_WIDTH_PX - GAP * 2;
  const H = VIEW_HEIGHT_PX - HEAD - GAP;
  const widthAt = (w: number, z: number): number => (w * z + GAP) * looks + GAP * 2;
  const last = ZOOMS[ZOOMS.length - 1]!;
  for (const zoom of ZOOMS) {
    const at: BoardSpot[] = [];
    let x = 0;
    let y = 0;
    let lineH = 0;
    for (const r of rows) {
      const z = ZOOMS.find((k) => k <= zoom && widthAt(r.w, k) <= W) ?? last;
      const w = widthAt(r.w, z);
      if (x > 0 && x + w > W) {
        x = 0;
        y += lineH;
        lineH = 0;
      }
      at.push({ x: GAP + x, y: HEAD + y, zoom: z, slot: r.w * z + GAP });
      x += w;
      lineH = Math.max(lineH, r.h * z + LABEL + GAP);
    }
    if (y + lineH <= H || zoom === last) return { zoom, at };
  }
  throw new Error('unreachable');
}

const font = (size: number, bold = false) => ({
  fontFamily: 'sans-serif',
  fontSize: size,
  fontWeight: bold ? ('bold' as const) : ('normal' as const),
  fill: OUTLINE,
});

export class ItemBoard extends Container {
  readonly rows: BoardRow[];
  readonly plan: BoardPlan;
  private readonly views: ItemSprite[] = [];

  constructor(readonly sheetId: string) {
    super();
    const sheet = itemSheetFile(sheetId);
    this.rows = sheet.items.map((i) => ({
      id: i.id,
      art: itemArtChoice(CONTENT.items.get(i.id)),
      w: i.cell.w / ITEM_SCALE,
      h: i.cell.h / ITEM_SCALE,
    }));
    this.plan = planBoard(this.rows, BOARD_LOOKS.length);
    this.addChild(new Graphics().rect(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX).fill(PAPER));
    const option = artStore.options.find((o) => o.id === artStore.selection);
    const painted = this.rows.filter((r) => r.art === 'sheet').length;
    const title = new Text({
      text: `${sheetId}   set: ${option?.name ?? artStore.selection}   painted ${painted}/${this.rows.length}   zoom ${this.plan.zoom}x   columns: ${BOARD_LOOKS.join(', ')}`,
      style: font(24, true),
    });
    title.position.set(GAP, 16);
    this.addChild(title);
    sheet.items.forEach((item, i) => {
      const def = CONTENT.items.get(item.id);
      const row = this.rows[i]!;
      const at = this.plan.at[i]!;
      const z = at.zoom;
      const label = new Text({
        text: `${item.id}${z === this.plan.zoom ? '' : `   ${z}x`}${row.art === 'sheet' ? '' : '   (not painted: code-drawn)'}`,
        style: font(16, row.art !== 'sheet'),
      });
      label.position.set(at.x, at.y);
      this.addChild(label);
      BOARD_LOOKS.forEach((look, k) => {
        const view = this.view(def, look);
        if (!view) return;
        // The slot's corner is the item's box corner: put the body's center where the sheet has it.
        view.position.set(
          at.x + k * at.slot + ((item.anchor.x - item.cell.x) / ITEM_SCALE) * z,
          at.y + LABEL + ((item.anchor.y - item.cell.y) / ITEM_SCALE) * z,
        );
        view.scale.set(z);
        this.views.push(view);
        this.addChild(view);
      });
    });
  }

  private view(def: ItemDef, look: BoardLook): ItemSprite | null {
    if (look === 'code') return new ItemSprite(def, GUIDE_SEED);
    const food = def.adverts.some((a) => a.action === 'eat');
    if (look === 'bites' && !food) return null;
    const view = makeItemView(def, GUIDE_SEED);
    if (look === 'paint') view.setPaint(['paint_blue']);
    if (look === 'bites') view.setBites(2);
    if (look === 'night') view.tint = NIGHT;
    return view;
  }

  /** How many pictures on the board come from a set's painting (test hook). */
  paintedViews(): number {
    return this.views.filter((v) => v.artTexture).length;
  }

  override destroy(): void {
    super.destroy({ children: true });
  }
}
