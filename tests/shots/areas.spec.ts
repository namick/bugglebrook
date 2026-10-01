import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, launchApp, scrollTo } from '../e2e/app';

// The M7 areas tour (`pnpm shots -g "areas"`): every area by day, by night,
// in rain and at dusk, the locked previews, and the barriers. Files 130- to 179-.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}.png`) });
}

const AREAS: readonly [string, string, number][] = [
  ['area_flowerbed_stage', 'flowerbed', 0],
  ['area_puddle_pond', 'pond', 32],
  ['area_stump_plaza', 'plaza', 64],
  ['area_under_porch', 'porch', 102.4],
  ['area_compost_lab', 'compost', 134.4],
  ['area_treehouse_arcade', 'treehouse', 163.2],
];

const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);

test('areas tour', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  try {
    // A tiling window manager may resize the window mid-tour; put it back before each area.
    const fit = async (): Promise<void> => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
      await page.waitForTimeout(400);
    };
    await fit();
    await clickSlot(page, 0);
    await page.mouse.move(960, 60);
    // Locked: the barriers, and a peek past each one.
    await scrollTo(page, 32);
    await page.waitForTimeout(600);
    await shot(page, '130-locked-sunflower');
    await scrollTo(page, 88);
    await page.waitForTimeout(600);
    await shot(page, '131-locked-lattice');
    // Everything open for the rest of the tour.
    for (const [id] of AREAS) await send(page, { type: 'unlock', area: id });
    await page.waitForTimeout(300);
    let n = 140;
    for (const [, name, x] of AREAS) {
      await fit();
      for (const [hour, when] of [
        [12, 'day'],
        [19, 'dusk'],
        [23, 'night'],
      ] as const) {
        await send(page, { type: 'set_time', hour });
        await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
        for (const part of [0, 1]) {
          await scrollTo(page, x + part * 12.8);
          await page.waitForTimeout(700);
          await shot(page, `${n}-${name}-${when}-${part}`);
        }
      }
      await send(page, { type: 'set_time', hour: 12 });
      await send(page, { type: 'set_weather', wind: 0, rain: true });
      await scrollTo(page, x + 6);
      await page.waitForTimeout(1500);
      await shot(page, `${n}-${name}-rain`);
      n += 5;
    }
    await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
  } finally {
    await bb.close();
  }
});
