import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, clickUi, launchApp } from '../e2e/app';
import { sharpShots } from './clip';

// M11 photo mode tour (files 250- to 269-): the camera moment, the clean
// viewfinder, each tray open, every frame and filter, stickers in the hand
// and placed, zoom, the shutter and its polaroid, and the journal's photos page.

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
    await shot(page, '252-viewfinder');
    // The frames tray, then every frame.
    await clickUi(page, 'tab_frames');
    await page.mouse.move(960, 400);
    await page.waitForTimeout(400);
    await shot(page, '253-tray-frames');
    for (const id of ['polaroid', 'leaf', 'stamp', 'comic', 'wanted', 'bottle_cap', 'slime']) {
      await clickUi(page, `frame_${id}`);
      await page.mouse.move(960, 400);
      await page.waitForTimeout(150);
      await shot(page, `254-frame-${id}`);
    }
    await clickUi(page, 'frame_none');
    // The filters tray, then every filter.
    await clickUi(page, 'tab_filters');
    await page.mouse.move(960, 400);
    await page.waitForTimeout(400);
    await shot(page, '255-tray-filters');
    for (const id of ['warm', 'cool', 'night_vision', 'old_photo', 'comic']) {
      await clickUi(page, `filter_${id}`);
      await page.mouse.move(960, 400);
      await page.waitForTimeout(150);
      await shot(page, `256-filter-${id}`);
    }
    await clickUi(page, 'filter_none');
    // Stickers: the tray, a few placed, one in the hand, one selected with its handle.
    await clickUi(page, 'tab_stickers');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__bb!.placeSticker('sticker_crown', 700, 420, 1.1, -0.2);
      window.__bb!.placeSticker('sticker_bubble_star', 1180, 380, 1.2, 0.1);
      window.__bb!.placeSticker('sticker_sunglasses', 900, 560, 0.9, 0);
    });
    await page.mouse.move(960, 300);
    await page.waitForTimeout(200);
    await shot(page, '257-tray-stickers-placed');
    const tray = (await page.evaluate(() => window.__bb!.uiClient('sticker_googly_eyes')))!;
    await page.mouse.move(tray.x, tray.y);
    await page.mouse.down();
    await page.mouse.move(1300, 600, { steps: 10 });
    await shot(page, '258-sticker-in-hand');
    await page.mouse.up();
    await page.waitForTimeout(300);
    await shot(page, '259-sticker-dropped');
    // Close the tray: the clean viewfinder with stickers on.
    await clickUi(page, 'tab_stickers');
    await page.mouse.move(960, 300);
    await page.waitForTimeout(400);
    await shot(page, '260-stickers-clean');
    // Zoom in on the stump with the wheel, and drag: the chrome fades while dragging.
    await page.mouse.move(1000, 600);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(200);
    await shot(page, '261-zoomed');
    await page.mouse.down();
    await page.mouse.move(900, 560, { steps: 6 });
    await page.waitForTimeout(250);
    await shot(page, '262-dragging-chrome-hidden');
    await page.mouse.up();
    await clickUi(page, 'tab_frames');
    await clickUi(page, 'frame_polaroid');
    await clickUi(page, 'tab_filters');
    await clickUi(page, 'filter_warm');
    await clickUi(page, 'tab_filters');
    await page.mouse.move(960, 400);
    await page.waitForTimeout(400);
    await shot(page, '263-framed-warm-zoomed');
    // The shutter: the flash, then the polaroid on its way.
    await clickUi(page, 'shutter');
    await page.waitForTimeout(30);
    await shot(page, '264-flash');
    await page.waitForTimeout(350);
    await shot(page, '265-polaroid');
    await page.waitForTimeout(1200);
    // Two more photos for the journal, with other looks.
    await clickUi(page, 'tab_filters');
    await clickUi(page, 'filter_comic');
    await clickUi(page, 'tab_filters');
    await clickUi(page, 'shutter');
    await page.waitForTimeout(1600);
    await clickUi(page, 'tab_frames');
    await clickUi(page, 'frame_leaf');
    await clickUi(page, 'tab_frames');
    await clickUi(page, 'shutter');
    await page.waitForTimeout(1600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot(page, '266-camera-away');
    await clickUi(page, 'journal');
    await page.waitForTimeout(900);
    await clickUi(page, 'journal_tab_page_photos');
    await page.waitForTimeout(900);
    await shot(page, '267-album');
  } finally {
    await bb.close();
  }
});

test('photo mode tour: the empty album', async () => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  sharpShots(bb.page);
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await clickSlot(page, 0);
    await page.waitForTimeout(800);
    // The journal's photos page before the first photo.
    await page.evaluate(() => window.__bb!.openJournal('page_photos'));
    await page.waitForTimeout(900);
    await shot(page, '268-album-empty');
  } finally {
    await bb.close();
  }
});
