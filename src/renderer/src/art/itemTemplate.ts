import type { Renderer } from 'pixi.js';
import { Container } from 'pixi.js';
import { CONTENT } from '../../../game/data';
import type { ItemDef } from '../../../game/data/types';
import { ItemSprite } from '../render/draw/item';
import type { ItemSheetFile, SheetItem } from './itemSheet';
import { ITEM_SCALE, MASK_ALPHA, encodeMask } from './itemSheet';
import type { Bounds, SheetPlan } from './itemSheets';
import { GAP, HEAD_H, layoutSheet, planSheets } from './itemSheets';
import { canvas2d, dot, label, snapshot } from './template';

/**
 * Builds an item sheet's guide pictures in the running game (the generator
 * needs Pixi to draw the code-drawn items). `scripts/art/itemTemplate.ts`
 * turns them into an .ora. Each picture is a PNG data URL the size of the canvas.
 */
export interface ItemSheetGuides {
  sheet: ItemSheetFile;
  /** The items as the code draws them now (the file shows them faint). */
  current: string;
  /** Each item's box, body, and anchor. */
  boxes: string;
  notes: string;
}

/** The seed the guides are drawn with. Lumpy things (pebbles, goo) differ a little from one to the next in the game. */
export const GUIDE_SEED = 0;

/** How far the code-drawn item reaches from its body's center, in game pixels. */
export function measureItem(def: ItemDef): Bounds {
  const sprite = new ItemSprite(def, GUIDE_SEED);
  const b = sprite.getLocalBounds();
  sprite.destroy({ children: true });
  return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
}

/** Every item sheet the game's items make, in file order. */
export function itemSheetPlans(defs: readonly ItemDef[] = CONTENT.items.all): SheetPlan[] {
  return planSheets(defs);
}

/** A sheet's rig.json, without the shape bitmaps (those need a renderer). */
export function itemSheetFile(id: string, defs: readonly ItemDef[] = CONTENT.items.all): ItemSheetFile {
  const plan = itemSheetPlans(defs).find((p) => p.id === id);
  if (!plan) throw new Error(`No item sheet named ${id}`);
  return layoutSheet(plan, measureItem);
}

const BOX = '#3a7bd5';
const BODY = '#3e9e3e';

function traceBody(g: CanvasRenderingContext2D, item: SheetItem): void {
  const { x, y } = item.anchor;
  const b = item.body;
  g.beginPath();
  if (b.type === 'circle') g.arc(x, y, b.r, 0, Math.PI * 2);
  else if (b.parts)
    for (const p of b.parts) {
      const c = Math.cos(p.angle);
      const s = Math.sin(p.angle);
      const corner = (dx: number, dy: number): [number, number] => [
        x + p.x + dx * c - dy * s,
        y + p.y + dx * s + dy * c,
      ];
      const pts = [corner(-p.w / 2, -p.h / 2), corner(p.w / 2, -p.h / 2), corner(p.w / 2, p.h / 2)];
      g.moveTo(...corner(-p.w / 2, p.h / 2));
      for (const pt of pts) g.lineTo(...pt);
      g.closePath();
    }
  else g.rect(x - b.w / 2, y - b.h / 2, b.w, b.h);
}

/** Each item's box (dashed blue), its physics body (green), and a dot on the body's center. */
function boxGuide(sheet: ItemSheetFile): string {
  const { c, g } = canvas2d(sheet.canvas.w, sheet.canvas.h);
  for (const item of sheet.items) {
    g.save();
    g.setLineDash([16, 10]);
    g.lineWidth = 3;
    g.strokeStyle = BOX;
    g.strokeRect(item.cell.x + 1.5, item.cell.y + 1.5, item.cell.w - 3, item.cell.h - 3);
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = BODY;
    traceBody(g, item);
    g.stroke();
    dot(g, item.anchor.x, item.anchor.y, 5);
  }
  return c.toDataURL('image/png');
}

/** The sheet's notes across the top, and each item's ID above its box. */
function notesGuide(sheet: ItemSheetFile): string {
  const { c, g } = canvas2d(sheet.canvas.w, sheet.canvas.h);
  const lines = [
    sheet.title,
    'Paint each item on the layer with its name, inside its dashed blue box. 4 pixels here are 1 in the game.',
    'Keep the faint shape: same outline, same way up. Green is the body the game bumps into; the dot is its center.',
  ];
  lines.forEach((line, i) => {
    g.font = `${i === 0 ? 'bold 24px' : '20px'} sans-serif`;
    g.fillStyle = '#2b1d2e';
    g.fillText(line, GAP, 34 + i * 28, sheet.canvas.w - GAP * 2);
  });
  if (HEAD_H < 34 + lines.length * 28 - 20) throw new Error('The notes do not fit the head band.');
  for (const item of sheet.items) label(g, item.id, item.cell.x + 4, item.cell.y - 12, 20);
  return c.toDataURL('image/png');
}

/** The picture's alpha as a bitmap at game size: a game pixel is on when most of its template pixels are drawn. */
function maskOf(alpha: Uint8ClampedArray, canvasW: number, item: SheetItem): SheetItem['mask'] {
  const S = ITEM_SCALE;
  const w = item.cell.w / S;
  const h = item.cell.h / S;
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++)
          if (alpha[((item.cell.y + y * S + dy) * canvasW + item.cell.x + x * S + dx) * 4 + 3]! > MASK_ALPHA)
            n++;
      bits[y * w + x] = n * 2 >= S * S ? 1 : 0;
    }
  return encodeMask(bits, w, h);
}

/** An item sheet's guides and rig. */
export function itemSheetGuides(renderer: Renderer, id: string): ItemSheetGuides {
  const sheet = itemSheetFile(id);
  const S = ITEM_SCALE;
  const art = new Container();
  for (const item of sheet.items) {
    const sprite = new ItemSprite(CONTENT.items.get(item.id), GUIDE_SEED);
    sprite.position.set(item.anchor.x / S, item.anchor.y / S);
    art.addChild(sprite);
  }
  const current = snapshot(renderer, art, 0, 0, sheet.canvas.w, sheet.canvas.h, S);
  return { sheet, current, boxes: boxGuide(sheet), notes: notesGuide(sheet) };
}

/**
 * Add each item's shape bitmap to a sheet, read from the `current` guide's
 * pixels. Async because the browser decodes the picture.
 */
export async function withMasks(guides: ItemSheetGuides): Promise<ItemSheetGuides> {
  const img = new Image();
  img.src = guides.current;
  await img.decode();
  const { g } = canvas2d(guides.sheet.canvas.w, guides.sheet.canvas.h);
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, guides.sheet.canvas.w, guides.sheet.canvas.h).data;
  const items = guides.sheet.items.map((item) => ({
    ...item,
    mask: maskOf(data, guides.sheet.canvas.w, item),
  }));
  return { ...guides, sheet: { ...guides.sheet, items } };
}
