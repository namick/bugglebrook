import { test } from '@playwright/test';
import { join } from 'node:path';
import { BACKDROP_DIR } from '../../scripts/art/backdrop.ts';
import { placeStarterJson, placeStripTemplate, stripGuides } from '../../scripts/art/backdropTemplate.ts';
import { ROOT } from '../../scripts/art/build.ts';
import { setSource } from '../../scripts/art/sets.ts';
import { launchApp } from '../e2e/app';

// Draws every strip template's guides in the real game and writes the .ora files.
// Run it with `node scripts/art/backdropTemplates.ts`, not directly: on its own
// (as part of `pnpm art:templates`, which makes the bug templates) it does nothing.

test('backdrop templates', async () => {
  if (process.env.BB_BACKDROP_TEMPLATES !== '1') return;
  test.setTimeout(900_000);
  const { page, close } = await launchApp();
  try {
    await page.evaluate(() => window.__bb!.liteRender(false));
    const ids = await page.evaluate(() => window.__bb!.backdropIds());
    const asked = (process.env.BB_BACKDROP_ONLY ?? '').split(',').filter(Boolean);
    const refresh = process.env.BB_BACKDROP_REFRESH === '1';
    const setId = process.env.BB_BACKDROP_SET || undefined;
    const out = process.env.BB_BACKDROP_OUT || undefined;
    const scale = process.env.BB_BACKDROP_SCALE === '1' ? 1 : 2;
    // An area ID alone means both of its strips.
    const only = asked.flatMap((a) => (ids.includes(a) ? [a] : [`${a}_far`, `${a}_mid`]));
    for (const id of only)
      if (!ids.includes(id)) throw new Error(`No strip named ${id}. Try one of: ${ids.join(', ')}`);
    for (const id of only.length ? only : ids) {
      const g = await page.evaluate(([i, s]) => window.__bb!.backdropTemplate(i, s), [id, scale] as const);
      const placed = placeStripTemplate(stripGuides(g), { refresh, setId, out });
      const s = g.strip;
      console.log(
        `${placed.action}: ${placed.ora} (${s.canvas.w} x ${s.canvas.h}; seen down to y ${s.cover * s.scale}` +
          `${s.hidden.length ? `; never seen: ${s.hidden.map(([a, b]) => `x ${(a - s.x) * s.scale} to ${(b - s.x) * s.scale}`).join(', ')}` : ''})`,
      );
    }
    const dir = out ?? join(setSource(join(ROOT, 'art/src'), setId ?? 'reference'), BACKDROP_DIR);
    for (const file of placeStarterJson(dir)) console.log(`created: ${file}`);
  } finally {
    await close();
  }
});
