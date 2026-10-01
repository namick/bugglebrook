import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, jumpTo, launchApp } from '../e2e/app';
import { sharpShots } from './clip';

// The critters tour (`pnpm shots -g "critters"`): each area's ambient
// critters by day and by night. Files `life-*`; `life-critters.txt` lists
// what was drawn in each shot and where on the screen (CSS pixels), for
// cropping close-ups.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);

const AREAS: readonly [string, string, number][] = [
  ['area_flowerbed_stage', 'flowerbed', 0],
  ['area_puddle_pond', 'pond', 32],
  ['area_stump_plaza', 'plaza', 64],
  ['area_compost_lab', 'compost', 134.4],
  ['area_treehouse_arcade', 'treehouse', 163.2],
];

for (const [, name, x] of AREAS)
  test(`critters tour: ${name}`, async () => {
    test.setTimeout(600_000);
    mkdirSync(DIR, { recursive: true });
    const bb = await launchApp();
    sharpShots(bb.page);
    const { app, page } = bb;
    try {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
      await clickSlot(page, 0);
      for (const [a] of AREAS) await send(page, { type: 'unlock', area: a });
      await send(page, { type: 'unlock', area: 'area_under_porch' });
      for (const [hour, when] of [
        [12, 'day'],
        [23, 'night'],
      ] as const) {
        await send(page, { type: 'set_time', hour });
        await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
        for (const part of [0, 1]) {
          await jumpTo(page, x + part * 12.8);
          await page.mouse.move(1900, 40);
          await page.waitForTimeout(1200);
          const file = `life-${name}-${when}-${part}`;
          const seen = await page.evaluate(() =>
            window.__bb!.critters().map((c) => ({ ...c, at: window.__bb!.worldToClient(c.x, c.y) })),
          );
          await page.screenshot({ path: join(DIR, `${file}.png`) });
          const list = seen.map((c) => `${c.kind}@${Math.round(c.at.x)},${Math.round(c.at.y)}`).join(' ');
          appendFileSync(join(DIR, 'life-critters.txt'), `${file}: ${list}\n`);
        }
      }
    } finally {
      await bb.close();
    }
  });
