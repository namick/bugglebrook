import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, clickUi, launchApp } from '../e2e/app';
import { sharpShots } from './clip';

// M11 photo mode tour (files 250- to 279-): the camera moment, the frozen
// world, every frame and filter, stickers in the hand and placed, zoom, the
// shutter and its polaroid, and the album.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}.png`) });
}

test('photo mode tour', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  sharpShots(bb.page);
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await clickSlot(page, 0);
    await page.waitForTimeout(1200);
    await page.mouse.move(960, 300);
    await shot(page, '250-before-camera');
    await clickUi(page, 'camera');
    await page.waitForTimeout(350);
    await page.mouse.move(960, 400);
    await shot(page, '251-camera-moment');
    await page.waitForTimeout(1200);
    await shot(page, '252-frozen-viewfinder');
    // Every frame.
    for (const id of ['polaroid', 'leaf', 'stamp', 'comic', 'wanted', 'bottle_cap', 'slime']) {
      await clickUi(page, `frame_${id}`);
      await page.mouse.move(960, 400);
      await page.waitForTimeout(150);
      await shot(page, `253-frame-${id}`);
    }
    await clickUi(page, 'frame_none');
    // Every filter.
    for (const id of ['warm', 'cool', 'night_vision', 'old_photo', 'comic']) {
      await clickUi(page, `filter_${id}`);
      await page.mouse.move(960, 400);
      await page.waitForTimeout(150);
      await shot(page, `254-filter-${id}`);
    }
    await clickUi(page, 'filter_none');
    // Stickers: a few placed, one in the hand, one selected with its handle.
    await page.evaluate(() => {
      window.__bb!.placeSticker('sticker_crown', 700, 420, 1.1, -0.2);
      window.__bb!.placeSticker('sticker_bubble_star', 1180, 380, 1.2, 0.1);
      window.__bb!.placeSticker('sticker_sunglasses', 900, 560, 0.9, 0);
    });
    await page.waitForTimeout(200);
    await shot(page, '255-stickers-placed');
    const tray = (await page.evaluate(() => window.__bb!.uiClient('sticker_googly_eyes')))!;
    await page.mouse.move(tray.x, tray.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(tray.x + ((1300 - tray.x) * i) / 10, tray.y + ((600 - tray.y) * i) / 10);
      await page.waitForTimeout(30);
    }
    await shot(page, '256-sticker-in-hand');
    await page.mouse.up();
    await page.waitForTimeout(300);
    await shot(page, '257-sticker-dropped');
    // Zoom in on the stump with the wheel.
    await page.mouse.move(1000, 600);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(200);
    await shot(page, '258-zoomed');
    await clickUi(page, 'frame_polaroid');
    await clickUi(page, 'filter_warm');
    await page.mouse.move(960, 400);
    await page.waitForTimeout(150);
    await shot(page, '259-framed-warm-zoomed');
    // The shutter: the flash, then the polaroid on its way.
    await clickUi(page, 'shutter');
    await page.waitForTimeout(60);
    await shot(page, '260-flash');
    await page.waitForTimeout(400);
    await shot(page, '261-polaroid');
    await page.waitForTimeout(1200);
    await shot(page, '262-after-photo');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot(page, '263-camera-away');
    await clickUi(page, 'album');
    await page.waitForTimeout(900);
    await shot(page, '264-album');
  } finally {
    await bb.close();
  }
});
