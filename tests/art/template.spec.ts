import { test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/art/build.ts';
import { setSource } from '../../scripts/art/sets.ts';
import type { Guides } from '../../scripts/art/template.ts';
import { fromDataUrl, placeTemplate } from '../../scripts/art/template.ts';
import type { RigFile } from '../../src/renderer/src/art/rigFile';
import { launchApp } from '../e2e/app';

// Draws every art template's guides in the real game and writes the .ora files.
// Run it with `pnpm art:templates` (scripts/art/templates.ts), not directly.

test('art templates', async () => {
  const { page, close } = await launchApp();
  try {
    await page.evaluate(() => window.__bb!.liteRender(false));
    const ids = await page.evaluate(() => window.__bb!.artIds());
    const only = (process.env.BB_ART_ONLY ?? '').split(',').filter(Boolean);
    const refresh = process.env.BB_ART_REFRESH === '1';
    const setId = process.env.BB_ART_SET ?? 'reference';
    for (const id of only.length ? only : ids) {
      if (!ids.includes(id)) throw new Error(`No bug or kit named ${id}. Try one of: ${ids.join(', ')}`);
      // Refreshing keeps the canvas and origin the artist has been drawing on.
      const sub = id === 'face_kit' ? 'faces' : 'bugs';
      const rigPath = join(setSource(join(ROOT, 'art/src'), setId), sub, `${id}.rig.json`);
      const old =
        refresh && existsSync(rigPath) ? (JSON.parse(readFileSync(rigPath, 'utf8')) as RigFile) : null;
      const keep = old ? { canvas: old.canvas, origin: old.origin } : null;
      const g = await page.evaluate(([i, k]) => window.__bb!.artTemplate(i as string, k as never), [
        id,
        keep,
      ] as const);
      const guides: Guides = {
        rig: g.rig,
        current: fromDataUrl(g.current),
        pivots: fromDataUrl(g.pivots),
        safe: fromDataUrl(g.safe),
        notes: fromDataUrl(g.notes),
      };
      const placed = placeTemplate(guides, { refresh, setId });
      console.log(`${placed.action}: ${placed.ora} (${g.rig.canvas.w} x ${g.rig.canvas.h})`);
    }
  } finally {
    await close();
  }
});
