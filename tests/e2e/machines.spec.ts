import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { entities, frames, jumpTo, launchApp, openFrozen } from './app';
import type { TestHook } from './app';

// Bugs use the newer areas' machines on their own (review R20): here a
// bored bug in the compost lab drops something into the empty cauldron and
// stirs it until a potion pops out. Fast-forwarded with `__bb.step`.

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const COMPOST_X = 134.4;

test('a bored bug brews in the cauldron by itself', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    for (const area of ['area_under_porch', 'area_compost_lab'] as const)
      await send(page, { type: 'unlock', area });
    await frames(page, 2);
    await jumpTo(page, COMPOST_X + 6);
    await send(page, { type: 'spawn', kind: 'bug', defId: 'bug_pillbug_rollo', x: COMPOST_X + 8, y: 8 });
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_moss_tuft', x: COMPOST_X + 9.2, y: 8 });
    await frames(page, 2);
    const rollo = (await entities(page)).find((e) => e.defId === 'bug_pillbug_rollo' && e.x > COMPOST_X)!;
    expect(rollo).toBeDefined();
    for (const need of ['need_hunger', 'need_energy', 'need_social', 'need_clean'] as const)
      await send(page, { type: 'set_need', id: rollo.id, need, value: 100 });
    await send(page, { type: 'set_need', id: rollo.id, need: 'need_fun', value: 40 });
    const seen = new Set<string>();
    for (let i = 0; i < 40 && !seen.has('potion_brewed'); i++) {
      await page.evaluate(() => window.__bb!.step(60));
      for (const e of await page.evaluate(() => window.__bb!.events()))
        if (
          e.name === 'potion_brewed' ||
          e.name === 'cauldron_added' ||
          (e.name === 'bug_used' && (e.payload as { id: number; action: string }).id === rollo.id)
        )
          seen.add(e.name === 'bug_used' ? `used:${(e.payload as { action: string }).action}` : e.name);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['used:brew', 'cauldron_added', 'potion_brewed']));
    expect((await entities(page)).some((e) => e.defId.startsWith('item_potion'))).toBe(true);
  } finally {
    await bb.close();
  }
});
