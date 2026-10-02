import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  entities,
  entity,
  frames,
  framesUntil,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  spawnFrozen,
  toClient,
} from './app';
import type { TestHook } from './app';

// P-04 and P-05 of the pre-release review with the real mouse: a balloon
// pushed onto a toothpick pops and leaves its scrap, and a flick of the
// tulip shakes a petal loose. Both were journal entries nobody could get.

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);

const eventNames = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__bb!.events().map((e) => e.name));

const count = async (page: Page, defId: string): Promise<number> =>
  (await entities(page)).filter((e) => e.defId === defId).length;

test('a balloon pushed onto a toothpick pops with a bang and leaves a scrap (P-04)', async () => {
  const { app, page } = await launchApp();
  try {
    await openFrozen(page, 0);
    const x0 = PLAZA_X + 22;
    await jumpTo(page, x0 - 9.6);
    const pick = await spawnFrozen(page, 'item_toothpick', x0);
    const p = (await entity(page, pick))!;
    // A balloon a little way off, caught before it floats away.
    const before = new Set((await entities(page)).map((e) => e.id));
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_balloon_red', x: p.x - 3, y: p.y - 2.5 });
    await frames(page, 2);
    const balloon = (await entities(page)).find((e) => !before.has(e.id) && e.defId === 'item_balloon_red')!;
    const from = await pressFrozen(page, balloon.id);
    // Over the toothpick, then down onto it.
    const above = await toClient(page, p.x, p.y - 2.5);
    const on = await toClient(page, p.x, p.y);
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(from.x + ((above.x - from.x) * i) / 10, from.y + ((above.y - from.y) * i) / 10);
      await frames(page, 2);
    }
    const popped = await framesUntil(
      page,
      async () => {
        const names = await eventNames(page);
        if (names.includes('balloon_popped')) return true;
        const b = await entity(page, balloon.id);
        if (b) await page.mouse.move(on.x, on.y);
        return false;
      },
      240,
      4,
    );
    await page.mouse.up();
    expect(popped).toBe(true);
    expect(await entity(page, balloon.id)).toBeNull();
    expect(await count(page, 'item_balloon_scrap')).toBe(1);
    expect(await page.evaluate(() => window.__bb!.sfxLog())).toContain('balloon_bang');
  } finally {
    await app.close();
  }
});

test('a click on the tulip shakes a petal loose (P-05)', async () => {
  const { app, page } = await launchApp();
  try {
    await openFrozen(page, 0);
    await send(page, { type: 'unlock', area: 'area_flowerbed_stage' });
    await frames(page, 2);
    const tulip = (await page.evaluate(() => window.__bb!.fixture('fix_tulip')))!;
    await jumpTo(page, Math.max(0, tulip.x - 9.6));
    expect(await count(page, 'item_petal')).toBe(0);
    const at = await toClient(page, tulip.x, tulip.y - 0.2);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 30);
    expect(await eventNames(page)).toContain('petal_shed');
    expect(await count(page, 'item_petal')).toBe(1);
  } finally {
    await app.close();
  }
});
