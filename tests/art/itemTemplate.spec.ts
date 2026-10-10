import { test } from '@playwright/test';
import type { ItemGuides } from '../../scripts/art/itemTemplate.ts';
import { placeItemTemplate } from '../../scripts/art/itemTemplate.ts';
import { fromDataUrl } from '../../scripts/art/template.ts';
import { launchApp } from '../e2e/app';

// Draws every item sheet's guides in the real game and writes the .ora files.
// Run it with `pnpm art:item-templates` (scripts/art/itemTemplates.ts), not
// directly: `pnpm art:templates` passes it by.

test('item sheet templates', async () => {
  test.skip(process.env.BB_ART_ITEMS !== '1', 'run by pnpm art:item-templates');
  const dir = process.env.BB_ART_ITEMS_DIR;
  if (!dir) throw new Error('BB_ART_ITEMS_DIR is not set.');
  const { page, close } = await launchApp();
  try {
    await page.evaluate(() => window.__bb!.liteRender(false));
    const ids = (await page.evaluate(() => window.__bb!.artItemSheets())).map((s) => s.id);
    const only = (process.env.BB_ART_ONLY ?? '').split(',').filter(Boolean);
    const refresh = process.env.BB_ART_REFRESH === '1';
    for (const id of only.length ? only : ids) {
      if (!ids.includes(id)) throw new Error(`No item sheet named ${id}. Try one of: ${ids.join(', ')}`);
      const g = await page.evaluate((i) => window.__bb!.artItemTemplate(i), id);
      const guides: ItemGuides = {
        sheet: g.sheet,
        current: fromDataUrl(g.current),
        boxes: fromDataUrl(g.boxes),
        notes: fromDataUrl(g.notes),
      };
      const placed = placeItemTemplate(guides, { dir, refresh });
      console.log(
        `${placed.action}: ${placed.ora} (${g.sheet.canvas.w} x ${g.sheet.canvas.h}, ${g.sheet.items.length} items)`,
      );
    }
  } finally {
    await close();
  }
});
