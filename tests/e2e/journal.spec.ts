import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PageId } from '../../src/game';
import { POND_X, PLAZA_X, clickSlot, clickUi, launchApp, pressOn, spawnItem, toClient, uiAt } from './app';

// M10: the journal (game design doc, section 13) with the real mouse. It
// opens from its button over the paused world, its tabs turn to each page,
// it closes three ways; a secret found by hand raises the badge, comes into
// color as new on its page, and looking clears the badge; the photos page
// shows a photo just taken; and the map takes the camera to a found area.

const journal = async (page: Page) => (await page.evaluate(() => window.__bb!.journal()))!;
const sfx = (page: Page): Promise<string[]> => page.evaluate(() => window.__bb!.sfxLog());

async function settled(page: Page): Promise<void> {
  await expect.poll(async () => (await journal(page)).busy, { timeout: 20_000 }).toBe(false);
}

async function openJournal(page: Page): Promise<void> {
  await clickUi(page, 'journal');
  await expect.poll(async () => (await journal(page)).open).toBe(true);
  await settled(page);
}

async function tab(page: Page, id: PageId): Promise<void> {
  await clickUi(page, `journal_tab_${id}`);
  await expect.poll(async () => (await journal(page)).page).toBe(id);
  await settled(page);
}

/** Client pixels for a point in the game's 1920x1080 view. */
async function viewToClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas#game').boundingBox())!;
  const k = box.width / 1920;
  return { x: box.x + x * k, y: box.y + y * k };
}

test('the journal opens from its button over the paused world, turns to every tab, and closes', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await openJournal(page);
    expect(await page.evaluate(() => window.__bb!.isPaused())).toBe(true);
    // It opens on the jar.
    expect((await journal(page)).page).toBeNull();
    const tick = await page.evaluate(() => window.__bb!.tick());
    for (const id of [
      'page_bugs',
      'page_items',
      'page_recipes',
      'page_potions',
      'page_secrets',
      'page_mysteries',
      'page_photos',
      'page_map',
    ] as const)
      await tab(page, id);
    // The corners turn one spread at a time.
    await tab(page, 'page_items');
    const first = await journal(page);
    expect(first.index).toBe(0);
    expect(first.count).toBeGreaterThan(1);
    await clickUi(page, 'journal_next');
    await expect.poll(async () => (await journal(page)).index).toBe(1);
    await settled(page);
    await clickUi(page, 'journal_prev');
    await expect.poll(async () => (await journal(page)).index).toBe(0);
    await settled(page);
    // The ladybug ribbon goes back to the jar, and the arrow keys turn pages.
    await clickUi(page, 'journal_home');
    await expect.poll(async () => (await journal(page)).spread).toBe(0);
    await settled(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await journal(page)).page).toBe('page_bugs');
    await settled(page);
    await tab(page, 'page_items');
    // The world held still the whole time.
    expect(await page.evaluate(() => window.__bb!.tick())).toBe(tick);
    const sounds = await sfx(page);
    expect(sounds).toContain('book_open');
    expect(sounds).toContain('page_flip');
    // The closed-book icon closes it.
    await clickUi(page, 'journal_close');
    await expect.poll(async () => (await journal(page)).open).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__bb!.isPaused())).toBe(false);
    expect(await sfx(page)).toContain('book_close');
    // So does a click outside the book, and Escape. It opens where it was left.
    await openJournal(page);
    expect((await journal(page)).page).toBe('page_items');
    const outside = await viewToClient(page, 60, 1000);
    await page.mouse.move(outside.x, outside.y, { steps: 3 });
    await page.mouse.click(outside.x, outside.y);
    await expect.poll(async () => (await journal(page)).open).toBe(false);
    await openJournal(page);
    // A click on the book's own cover does not close it.
    const cover = await viewToClient(page, 160, 552);
    await page.mouse.click(cover.x, cover.y);
    await page.waitForTimeout(300);
    expect((await journal(page)).open).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await journal(page)).open).toBe(false);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a secret found by hand raises the badge, comes into color as new on its page, and looking clears it', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 2);
    await expect.poll(async () => (await journal(page)).badge).toBeGreaterThanOrEqual(0);
    const before = await journal(page);
    expect(before.fresh.page_secrets).toBe(0);
    // Five quick clicks on the sun painted on the sundial: the sun puts on shades.
    const dial = (await page.evaluate(() => window.__bb!.fixture('fix_sundial')))!;
    const sun = await toClient(page, dial.x - 0.5, dial.y);
    await page.mouse.move(sun.x, sun.y, { steps: 3 });
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(sun.x, sun.y);
      await page.waitForTimeout(60);
    }
    await expect.poll(() => page.evaluate(() => window.__bb!.secrets())).toContain('secret_sun_shades');
    // The book has it, new, and the button's badge counts it.
    await expect.poll(async () => (await journal(page)).fresh.page_secrets).toBe(1);
    const found = await journal(page);
    await expect.poll(async () => (await journal(page)).badge).toBe(found.newCount);
    expect(found.newCount).toBeGreaterThan(before.newCount);
    expect(found.completion.found).toBeGreaterThan(before.completion.found);
    // The stamp lands on the button.
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.stamps()))!.landed).toBe(1);
    // Open the secrets page: the find is there, found and new, and it reveals.
    await openJournal(page);
    await clickUi(page, 'journal_tab_page_secrets');
    await expect.poll(async () => (await journal(page)).page).toBe('page_secrets');
    await expect
      .poll(async () => (await journal(page)).shown.find((e) => e.key === 'secret:secret_sun_shades'))
      .toMatchObject({ state: 'discovered', isNew: true });
    await settled(page);
    const sounds = await sfx(page);
    expect(sounds).toContain('reveal');
    expect(sounds).toContain('stamp');
    // Seen: the tab and the badge let it go.
    const looked = await journal(page);
    expect(looked.fresh.page_secrets).toBe(0);
    expect(looked.newCount).toBe(found.newCount - 1);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await journal(page)).open).toBe(false);
    await expect.poll(async () => (await journal(page)).badge).toBe(looked.newCount);
    // The world took the command: it stays seen after a save and a reload.
    await page.evaluate(() => window.__bb!.saveNow());
    await clickUi(page, 'pause');
    await clickUi(page, 'to_menu');
    await clickSlot(page, 2);
    await expect.poll(async () => (await journal(page)).fresh.page_secrets).toBe(0);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('picking up a new kind of item marks its tab but leaves the badge alone (P-17)', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 2);
    const feather = await spawnItem(page, 'item_feather', PLAZA_X + 12);
    await expect.poll(async () => (await journal(page)).badge).toBeGreaterThanOrEqual(0);
    const before = await journal(page);
    expect(before.fresh.page_items).toBe(0);
    await pressOn(page, feather);
    await page.mouse.up();
    await expect.poll(async () => (await journal(page)).fresh.page_items).toBe(1);
    const after = await journal(page);
    expect(after.newCount).toBe(before.newCount);
    await page.waitForTimeout(300);
    expect((await journal(page)).badge).toBe(before.badge);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('the button opens the journal from photo mode, and its photos page shows the photo just taken', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 1);
    await page.waitForTimeout(400);
    await openJournal(page);
    await tab(page, 'page_photos');
    expect((await journal(page)).photos).toBe(0);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await journal(page)).open).toBe(false);
    await clickUi(page, 'camera');
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.photo())).frozen, { timeout: 20_000 })
      .toBe(true);
    await clickUi(page, 'shutter');
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.photo())).taken).toBe(1);
    // The camera is still out: the journal button puts it away and opens the book.
    await page.waitForTimeout(1500);
    await openJournal(page);
    expect((await page.evaluate(() => window.__bb!.photo())).open).toBe(false);
    await tab(page, 'page_photos');
    expect((await journal(page)).photos).toBe(1);
    await page.keyboard.press('Escape');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('clicking a found area on the map closes the book and takes the camera there', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    // Visit the pond, then come back to the plaza.
    await page.evaluate((x) => window.__bb!.cameraTo(x), POND_X + 4);
    // The frame loop tells the sim where the camera is; the journal notes the visit within a second.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__bb!.step(130));
    await page.evaluate((x) => window.__bb!.cameraTo(x), PLAZA_X + 3);
    await page.waitForTimeout(400);
    await openJournal(page);
    await tab(page, 'page_map');
    // A locked area is not a way to travel: clicking it leaves the book open.
    await clickUi(page, 'journal_area_area_flowerbed_stage');
    await page.waitForTimeout(300);
    expect((await journal(page)).open).toBe(true);
    // The pond was visited: it is on the map, and a click goes there.
    expect((await journal(page)).shown.find((e) => e.key === 'area:area_puddle_pond')?.state).toBe(
      'discovered',
    );
    const pond = await uiAt(page, 'journal_area_area_puddle_pond');
    await page.mouse.move(pond.x, pond.y, { steps: 3 });
    await page.mouse.click(pond.x, pond.y);
    await expect.poll(async () => (await journal(page)).open).toBe(false);
    await expect
      .poll(async () => {
        const cam = await page.evaluate(() => window.__bb!.camera());
        return cam.x + 9.6;
      })
      .toBeLessThan(PLAZA_X);
    const center = (await page.evaluate(() => window.__bb!.camera())).x + 9.6;
    expect(center).toBeGreaterThan(POND_X);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
