import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { clickUi, launchApp, uiAt, waitForScene } from './app';

// The credits board: the heart on the main menu opens a board with the
// makers' names from art/CREDITS.json; the play button or a click outside
// puts it away.

const CREDITS = JSON.parse(
  readFileSync(join(resolve(import.meta.dirname, '../..'), 'art/CREDITS.json'), 'utf8'),
) as Record<string, string>;

test('the heart on the menu shows who made the game', async () => {
  const { page, close } = await launchApp();
  try {
    await waitForScene(page, 'menu');
    expect(await page.evaluate(() => window.__bb!.credits())).toBeNull();
    await clickUi(page, 'credits');
    await expect.poll(() => page.evaluate(() => window.__bb!.credits())).not.toBeNull();
    const lines = (await page.evaluate(() => window.__bb!.credits()))!;
    expect(lines.map((l) => l.role)).toEqual(
      ['art', 'music', 'sound', 'voices', 'code'].filter((r) => CREDITS[r]?.trim()),
    );
    for (const l of lines) expect(l.name).toBe(CREDITS[l.role]!.trim());
    // The play button puts it away.
    await clickUi(page, 'credits_close');
    await expect.poll(() => page.evaluate(() => window.__bb!.credits())).toBeNull();
    // Open again, and a click on the dim outside the board closes it too.
    await clickUi(page, 'credits');
    await expect.poll(() => page.evaluate(() => window.__bb!.credits())).not.toBeNull();
    // (Once the board has settled, so the click lands on the dim above it.)
    const settled = await uiAt(page, 'credits_close');
    await page.mouse.click(settled.x, 12);
    await expect.poll(() => page.evaluate(() => window.__bb!.credits())).toBeNull();
    // No recorded sounds yet: no second page.
    await clickUi(page, 'credits');
    await expect.poll(() => page.evaluate(() => window.__bb!.creditsPage())).toEqual({ page: 0, sounds: [] });
    expect(await page.evaluate(() => window.__bb!.uiClient('credits_sounds'))).toBeNull();
    await clickUi(page, 'credits_close');
    await expect.poll(() => page.evaluate(() => window.__bb!.credits())).toBeNull();
    // With credited sounds, the speaker button turns to their page and back.
    const line = '"Small splash" by someone (CC BY 4.0) https://freesound.org/s/1/';
    await page.evaluate((l) => window.__bb!.setSoundCredits([l]), line);
    await clickUi(page, 'credits');
    await clickUi(page, 'credits_sounds');
    await expect
      .poll(() => page.evaluate(() => window.__bb!.creditsPage()))
      .toEqual({ page: 1, sounds: [line] });
    await clickUi(page, 'credits_sounds');
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.creditsPage()))?.page).toBe(0);
    await clickUi(page, 'credits_close');
    await expect.poll(() => page.evaluate(() => window.__bb!.credits())).toBeNull();
    // The menu still works: the gear opens settings.
    await clickUi(page, 'gear');
    await expect.poll(() => page.evaluate(() => window.__bb!.panelOpen())).toBe(true);
  } finally {
    await close();
  }
});
