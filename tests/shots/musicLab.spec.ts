import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, waitForScene } from '../e2e/app';
import { sharpShots } from './clip';

// The Music Lab panel, for checking its layout by eye: `pnpm shots -g "music lab"`.
// Writes /tmp/bb-shots/musiclab-*.png: the panel over the menu, a border
// demo under way, a muted and a soloed layer, and each tab's list.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: join(DIR, `musiclab-${name}.png`) });

async function press(page: Page, name: string): Promise<void> {
  const p = await page.evaluate((n) => window.__bb!.musicLabButton(n), name);
  expect(p, name).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
  await page.waitForTimeout(250);
}

test('music lab tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { page } = bb;
  sharpShots(page);
  try {
    await bb.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
    );
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.musicLab(true));
    await page.waitForTimeout(1200);
    await shot(page, '01-menu');
    await press(page, 'play:border:area_stump_plaza>area_puddle_pond:day');
    await waitForScene(page, 'world');
    await expect
      .poll(() => page.evaluate(() => window.__bb!.musicLabState()!.step?.step), { timeout: 20_000 })
      .toBe(3);
    await shot(page, '02-border-waiting');
    await expect.poll(() => page.evaluate(() => window.__bb!.music().fading), { timeout: 20_000 }).toBe(true);
    await page.waitForTimeout(1500);
    await shot(page, '03-border-crossing');
    await press(page, 'mute:drums');
    await press(page, 'solo:lead');
    await shot(page, '04-mute-and-solo');
    await press(page, 'stop');
    for (const [i, tab] of ['phases', 'loops', 'rain', 'notes'].entries()) {
      await press(page, `tab:${tab}`);
      await shot(page, `0${5 + i}-tab-${tab}`);
    }
    await press(page, 'tab:rain');
    await press(page, 'page:next');
    await press(page, 'play:rain:area_treehouse_arcade:night:on');
    await expect
      .poll(() => page.evaluate(() => window.__bb!.music().state.raining), { timeout: 30_000 })
      .toBe(true);
    await page.waitForTimeout(4000);
    await shot(page, '09-rain-page-2-pad-at-night');
  } finally {
    await bb.close();
  }
});
