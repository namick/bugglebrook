import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pngSize } from '../../src/shared/photo';
import { clickSlot, clickUi, entities, frames, launchApp, uiAt } from './app';

// M11, photo mode (game design doc, sections 14 and 19). The camera moment
// and the freeze; frames, filters, zoom, and stickers with the real mouse;
// the shutter writing a 1920x1080 PNG to the Pictures folder (a temp one:
// launchApp points BUGGLEBROOK_PICTURES inside the test's user data); the
// photo in the save; the album; and reduce motion's fade.

const photo = (page: Page) => page.evaluate(() => window.__bb!.photo());
const events = (page: Page) => page.evaluate(() => window.__bb!.events());

/** Client pixels for a point in the game's 1920x1080 view. */
async function viewToClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas#game').boundingBox())!;
  const k = box.width / 1920;
  return { x: box.x + x * k, y: box.y + y * k };
}

/** Take the camera out and wait for the world to hold still. */
async function openCamera(page: Page): Promise<void> {
  await clickUi(page, 'camera');
  await expect.poll(async () => (await photo(page)).open).toBe(true);
  await expect.poll(async () => (await photo(page)).frozen, { timeout: 20_000 }).toBe(true);
}

/** Where the test's photos land: inside its user data, never the real Pictures folder. */
const picturesDir = (userData: string): string => join(userData, 'Pictures', 'Bugglebrook');

test('the camera comes out, bugs in frame react, and the world holds still until it goes away', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.waitForTimeout(500);
    const tickBefore = await page.evaluate(() => window.__bb!.tick());
    await clickUi(page, 'camera');
    await expect.poll(async () => (await photo(page)).open).toBe(true);
    // The camera moment: the bugs in view strike their camera reactions, each its own.
    await expect
      .poll(async () => (await events(page)).filter((e) => e.name === 'photo_mode_opened').length)
      .toBe(1);
    await expect
      .poll(async () => {
        const reacted = (await events(page)).filter(
          (e) => e.name === 'bug_reacted' && (e.payload as { reaction: string }).reaction === 'camera',
        );
        return reacted.length;
      })
      .toBeGreaterThanOrEqual(2);
    // Then it freezes: the clock stops and nothing moves, on screen time and on stepped frames.
    await expect.poll(async () => (await photo(page)).frozen, { timeout: 20_000 }).toBe(true);
    const tick = await page.evaluate(() => window.__bb!.tick());
    expect(tick).toBeGreaterThan(tickBefore);
    const snapshot = JSON.stringify((await entities(page)).map((e) => [e.id, e.x, e.y, e.angle]));
    await page.waitForTimeout(2000);
    await frames(page, 120);
    expect(await page.evaluate(() => window.__bb!.tick())).toBe(tick);
    expect(JSON.stringify((await entities(page)).map((e) => [e.id, e.x, e.y, e.angle]))).toBe(snapshot);
    // The pause button and pocket are away; the camera stays.
    expect(await page.evaluate(() => window.__bb!.uiClient('pause'))).toBeNull();
    expect(await page.evaluate(() => window.__bb!.uiClient('camera'))).not.toBeNull();
    // Escape puts the camera away and the world runs on.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await photo(page)).open).toBe(false);
    await expect
      .poll(async () => (await events(page)).some((e) => e.name === 'photo_mode_closed'))
      .toBe(true);
    await expect.poll(() => page.evaluate(() => window.__bb!.tick())).toBeGreaterThan(tick);
    expect(await page.evaluate(() => window.__bb!.uiClient('pause'))).not.toBeNull();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('framing a shot: a frame, a filter, zoom, and pan with the real mouse', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.waitForTimeout(500);
    await openCamera(page);

    // The trays start closed: the scene is the point. A tab opens one at a time.
    expect((await photo(page)).tray).toBeNull();
    expect(await page.evaluate(() => window.__bb!.uiClient('frame_leaf'))).toBeNull();
    await clickUi(page, 'tab_frames');
    await expect.poll(async () => (await photo(page)).tray).toBe('frames');
    await clickUi(page, 'frame_leaf');
    await expect.poll(async () => (await photo(page)).frame).toBe('frame_leaf');
    // Locked frames do not pick.
    await clickUi(page, 'frame_totem');
    expect((await photo(page)).frame).toBe('frame_leaf');
    await clickUi(page, 'tab_filters');
    await expect.poll(async () => (await photo(page)).tray).toBe('filters');
    expect(await page.evaluate(() => window.__bb!.uiClient('frame_leaf'))).toBeNull();
    await clickUi(page, 'filter_warm');
    await expect.poll(async () => (await photo(page)).filter).toBe('filter_warm');
    // The same tab again closes its tray.
    await clickUi(page, 'tab_filters');
    await expect.poll(async () => (await photo(page)).tray).toBeNull();

    // Zoom with the wheel, centered on the cursor.
    const mid = await viewToClient(page, 1100, 600);
    await page.mouse.move(mid.x, mid.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(60);
    }
    await expect.poll(async () => (await photo(page)).zoom).toBeGreaterThan(1.5);
    const zoomed = await photo(page);
    expect(zoomed.zoom).toBeLessThanOrEqual(3);

    // Drag the photo to pan the window.
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x - 150, mid.y - 60, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await photo(page)).cx).toBeGreaterThan(zoomed.cx + 20);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('stickers: off the tray onto the photo, scaled and turned by the handle, thrown away over the tray', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.waitForTimeout(500);
    await openCamera(page);

    // A sticker from the tray onto the photo.
    await clickUi(page, 'tab_stickers');
    await expect.poll(async () => (await photo(page)).tray).toBe('stickers');
    const card = await uiAt(page, 'sticker_crown');
    const drop = await viewToClient(page, 900, 450);
    await page.mouse.move(card.x, card.y);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await photo(page)).stickers.length).toBe(1);
    let [crown] = (await photo(page)).stickers;
    expect(crown!.id).toBe('sticker_crown');
    expect(crown!.scale).toBeCloseTo(1, 1);
    expect(Math.abs(crown!.x - 900)).toBeLessThan(8);
    expect(Math.abs(crown!.y - 450)).toBeLessThan(8);

    // Its corner handle scales and turns it.
    const handle = (await page.evaluate(() => window.__bb!.stickerHandleClient(0)))!;
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    const k = (await page.locator('canvas#game').boundingBox())!.width / 1920;
    await page.mouse.move(handle.x + 60 * k, handle.y + 110 * k, { steps: 5 });
    await page.mouse.up();
    [crown] = (await photo(page)).stickers;
    expect(crown!.scale).toBeGreaterThan(1.2);
    expect(crown!.rotation).toBeGreaterThan(0.1);

    // Dragging a sticker off onto the tray throws it away.
    const stuck = (await page.evaluate(() => window.__bb!.stickerClient(0)))!;
    const tray = await viewToClient(page, 960, 1040);
    await page.mouse.move(stuck.x, stuck.y);
    await page.mouse.down();
    await page.mouse.move(tray.x, tray.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await photo(page)).stickers.length).toBe(0);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the shutter writes a 1920x1080 PNG to Pictures, keeps the photo in the save, and fills the album', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.waitForTimeout(500);
    await openCamera(page);
    await clickUi(page, 'tab_frames');
    await clickUi(page, 'frame_leaf');
    await clickUi(page, 'tab_filters');
    await clickUi(page, 'filter_warm');
    await clickUi(page, 'tab_filters');
    // Zoom a little, and two stickers for the photo, staged.
    const mid = await viewToClient(page, 1100, 600);
    await page.mouse.move(mid.x, mid.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(60);
    }
    await expect.poll(async () => (await photo(page)).zoom).toBeGreaterThan(1.5);
    await page.evaluate(() => {
      window.__bb!.placeSticker('sticker_googly_eyes', 700, 400);
      window.__bb!.placeSticker('sticker_bubble_star', 1200, 380, 1.2, 0.2);
    });

    // The shutter.
    const bugsInFrame = (await photo(page)).bugs;
    await clickUi(page, 'shutter');
    await expect.poll(async () => (await photo(page)).taken).toBe(1);
    const taken = (await events(page)).find((e) => e.name === 'photo_taken')!;
    expect(taken.payload).toMatchObject({ frame: 'frame_leaf', filter: 'filter_warm', stickers: 2 });
    expect((taken.payload as { zoom: number }).zoom).toBeGreaterThan(1.5);
    expect((taken.payload as { bugs: string[] }).bugs).toEqual(bugsInFrame);
    expect((await photo(page)).flashPeak).toBe(1);
    // The file lands in the (temp) Pictures folder with the timestamp name, 1920x1080.
    await expect.poll(async () => (await photo(page)).last?.file ?? null, { timeout: 30_000 }).not.toBeNull();
    const file = (await photo(page)).last!.file!;
    expect(dirname(file)).toBe(picturesDir(bb.userData));
    expect(basename(file)).toMatch(/^bugglebrook-\d{8}-\d{6}(-\d+)?\.png$/);
    expect(readdirSync(picturesDir(bb.userData))).toEqual([basename(file)]);
    expect(pngSize(readFileSync(file))).toEqual({ width: 1920, height: 1080 });
    await expect
      .poll(async () => (await events(page)).find((e) => e.name === 'photo_saved')?.payload)
      .toEqual({
        ok: true,
      });
    // The photo is in the save, as a small picture, and the album knows it.
    await page.evaluate(() => window.__bb!.saveNow());
    const save = JSON.parse(readFileSync(join(bb.userData, 'saves', 'slot-1.json'), 'utf8'));
    expect(save.version).toBeGreaterThanOrEqual(11);
    expect(save.meta.photos).toHaveLength(1);
    expect(save.meta.photos[0].thumb).toMatch(/^data:image\/jpeg;base64,/);
    expect(save.meta.photos[0]).toMatchObject({ file, frame: 'frame_leaf', filter: 'filter_warm' });
    // Away with the camera, then the album opens over the paused world and closes with Escape.
    await clickUi(page, 'camera');
    await expect.poll(async () => (await photo(page)).open).toBe(false);
    await clickUi(page, 'album');
    await expect.poll(async () => (await photo(page)).albumOpen).toBe(true);
    expect(await page.evaluate(() => window.__bb!.isPaused())).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await photo(page)).albumOpen).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__bb!.isPaused())).toBe(false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('with reduce motion on, the shutter fades instead of flashing', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await clickUi(page, 'pause');
    await clickUi(page, 'toggle_reduceMotion');
    await clickUi(page, 'resume');
    await expect.poll(() => page.evaluate(() => window.__bb!.reduceMotion())).toBe(true);
    await openCamera(page);
    await clickUi(page, 'shutter');
    await expect.poll(async () => (await photo(page)).taken).toBe(1);
    expect((await photo(page)).flashPeak).toBeLessThan(0.5);
    expect((await photo(page)).flashPeak).toBeGreaterThan(0);
    await expect.poll(async () => (await photo(page)).last?.file ?? null, { timeout: 30_000 }).not.toBeNull();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
