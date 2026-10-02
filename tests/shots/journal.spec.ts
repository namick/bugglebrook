import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PageId } from '../../src/game';
import { clickSlot, clickUi, launchApp, uiAt, waitForScene } from '../e2e/app';
import type { JournalStage } from '../../src/renderer/src/debug/testHook';
import { sharpShots } from './clip';

// The M10 journal tour (`pnpm shots -g "journal"`, files journal-*): the
// button with its badge and a stamp landing, the book opening, every page
// empty and then partly filled, a reveal mid-animation, a sparkle, the
// mysteries, the map, the photos page, and the menu sign's jar.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: join(DIR, `${name}.png`) });

const journal = async (page: Page) => (await page.evaluate(() => window.__bb!.journal()))!;

async function settled(page: Page): Promise<void> {
  await expect.poll(async () => (await journal(page)).busy, { timeout: 20_000 }).toBe(false);
  await page.waitForTimeout(150);
}

/** Open the book on a tab and wait for it to settle. */
async function openOn(page: Page, tab: PageId | null): Promise<void> {
  if (!(await journal(page)).open) {
    await clickUi(page, 'journal');
    await settled(page);
  }
  if (!tab && (await journal(page)).spread !== 0) {
    await clickUi(page, 'journal_home');
    await settled(page);
  }
  if (tab) {
    await clickUi(page, `journal_tab_${tab}`);
    await settled(page);
  }
  // The hand off the pages.
  await page.mouse.move(1260, 40);
}

const stage = (page: Page, s: JournalStage): Promise<void> =>
  page.evaluate((st) => window.__bb!.stageJournal(st), s);

const TABS: PageId[] = [
  'page_bugs',
  'page_items',
  'page_recipes',
  'page_potions',
  'page_secrets',
  'page_mysteries',
  'page_photos',
  'page_map',
];

async function launch1080(): Promise<Awaited<ReturnType<typeof launchApp>>> {
  const bb = await launchApp();
  sharpShots(bb.page);
  await bb.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
  await bb.page.waitForTimeout(500);
  return bb;
}

test('journal tour: empty, the button, a reveal, and a filled book', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launch1080();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await page.waitForTimeout(1500);
    // Every page of a brand new book.
    await openOn(page, null);
    await shot(page, 'journal-01-home-empty');
    for (const [i, tab] of TABS.entries()) {
      await openOn(page, tab);
      await shot(page, `journal-0${2 + i}-${tab.slice(5)}-empty`.replace('-010', '-10'));
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // A find: the stamp slams onto the button, then the badge counts it.
    await stage(page, { secrets: ['secret_sun_shades'] });
    await page.waitForTimeout(700);
    await shot(page, 'journal-11-stamp-landing');
    await page.waitForTimeout(1600);
    const btn = await uiAt(page, 'journal');
    await page.mouse.move(btn.x - 200, btn.y + 120);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(DIR, 'journal-12-button-badge.png'),
      clip: { x: btn.x - 260, y: Math.max(0, btn.y - 80), width: 340, height: 200 },
    });
    await shot(page, 'journal-13-button-in-world');

    // Opening, slowed down to catch it: the book flies out and the cover flips.
    await page.evaluate(() => window.__bb!.journalSpeed(0.08));
    await page.mouse.move(btn.x, btn.y, { steps: 3 });
    await page.mouse.click(btn.x, btn.y);
    await page.mouse.move(1260, 40);
    await page.waitForTimeout(2000);
    await shot(page, 'journal-14-opening-fly');
    await page.waitForTimeout(4500);
    await shot(page, 'journal-15-opening-flip');
    await page.evaluate(() => window.__bb!.journalSpeed(1));
    await settled(page);

    // The page turn and the reveal, slowed, on the secrets page.
    await page.evaluate(() => window.__bb!.journalSpeed(0.08));
    await clickUi(page, 'journal_tab_page_secrets');
    await page.mouse.move(1260, 40);
    await expect.poll(async () => (await journal(page)).page).toBe('page_secrets');
    await page.waitForTimeout(2500);
    await shot(page, 'journal-16-turning');
    await page.waitForTimeout(8500);
    await shot(page, 'journal-17-reveal-mid');
    await page.waitForTimeout(6000);
    await shot(page, 'journal-18-reveal-stamp');
    await page.evaluate(() => window.__bb!.journalSpeed(1));
    await settled(page);
    await shot(page, 'journal-19-revealed');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  } finally {
    await bb.close();
  }
});

test('journal tour: a filled book', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launch1080();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await page.waitForTimeout(1500);
    await stage(page, { secrets: ['secret_sun_shades'] });
    // A book well under way.
    await stage(page, {
      bugs: ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp', 'bug_grasshopper_boing'],
      items: [
        'item_berry_red',
        'item_blueberry',
        'item_apple_core',
        'item_cheese_puff',
        'item_jelly_bean',
        'item_bottle_cap',
        'item_button',
        'item_feather',
        'item_twig',
        'item_rubber_band',
        'item_slingshot_twig',
        'item_spring_coil',
      ],
      recipes: ['recipe_slingshot', 'recipe_spring_launcher'],
      hinted: ['recipe_matchbox_racer'],
      potions: ['potion_giant', 'potion_tiny', 'potion_glow', 'potion_rainbow'],
      secrets: ['secret_stump_eyes', 'secret_twig_blinks', 'secret_frog_blink', 'secret_skip_stone'],
      areas: ['area_puddle_pond', 'area_flowerbed_stage'],
      noticed: ['gnome_sniffle', 'moss_squeak'],
      obs: {
        bug_ladybug_dot: {
          loved: ['item_berry_red', 'item_jelly_bean'],
          disliked: ['item_cheese_puff'],
          toy: 'item_spring_coil',
          place: 'area_stump_plaza',
          photo: true,
        },
        bug_pillbug_rollo: { loved: ['item_apple_core'], place: 'area_stump_plaza' },
      },
      day: 3,
      night: true,
      seen: true,
      sparkle: 'secret:secret_sundial_midnight',
    });
    await page.waitForTimeout(800);
    await openOn(page, null);
    await shot(page, 'journal-20-home-filled');
    for (const [i, tab] of TABS.entries()) {
      await openOn(page, tab);
      await shot(page, `journal-${21 + i}-${tab.slice(5)}-filled`);
    }
    // More of each tab.
    for (const tab of ['page_items', 'page_potions', 'page_secrets', 'page_mysteries'] as const) {
      await openOn(page, tab);
      if (tab === 'page_items') await page.evaluate(() => window.__bb!.journalSpeed(0.08));
      await clickUi(page, 'journal_next');
      await page.mouse.move(1260, 40);
      if (tab === 'page_items') {
        await page.waitForTimeout(3500);
        await shot(page, 'journal-30-page-turn');
        await page.evaluate(() => window.__bb!.journalSpeed(1));
      }
      await settled(page);
      await shot(page, `journal-31-${tab.slice(5)}-next`);
    }
    // The sparkle, opened.
    await openOn(page, 'page_secrets');
    // The plaza's secrets are on the second spread.
    await clickUi(page, 'journal_next');
    await settled(page);
    await clickUi(page, 'journal_entry_secret:secret_sundial_midnight');
    await page.mouse.move(1260, 40);
    await page.waitForTimeout(500);
    await shot(page, 'journal-32-sparkle-opened');
    await page.evaluate(() => window.__bb!.journalSpeed(0.08));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);
    await shot(page, 'journal-33-closing');
    await page.evaluate(() => window.__bb!.journalSpeed(1));
    await page.waitForTimeout(800);

    // Everything found: the gold ladybug on the cover and by the jar.
    await stage(page, { all: true, seen: true });
    await page.waitForTimeout(800);
    const b2 = await uiAt(page, 'journal');
    await page.mouse.move(b2.x - 200, b2.y + 120);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(DIR, 'journal-34-button-complete.png'),
      clip: { x: b2.x - 260, y: Math.max(0, b2.y - 80), width: 340, height: 200 },
    });
    await openOn(page, null);
    await shot(page, 'journal-35-home-complete');
    await openOn(page, 'page_map');
    await shot(page, 'journal-36-map-complete');
    await openOn(page, 'page_mysteries');
    await shot(page, 'journal-37-mysteries-complete');
  } finally {
    await bb.close();
  }
});

test('journal tour: photos and the menu jar', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launch1080();
  const { page } = bb;
  try {
    await clickSlot(page, 1);
    await page.waitForTimeout(1200);
    for (let i = 0; i < 4; i++) {
      await clickUi(page, 'camera');
      await page.waitForTimeout(1300);
      await clickUi(page, 'shutter');
      await page.waitForTimeout(i === 0 ? 700 : 1600);
      if (i === 0) {
        await shot(page, 'journal-40-polaroid-to-journal');
        await page.waitForTimeout(900);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
    }
    await openOn(page, 'page_photos');
    await shot(page, 'journal-41-photos');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await stage(page, {
      secrets: [
        'secret_sun_shades',
        'secret_stump_eyes',
        'secret_twig_blinks',
        'secret_frog_blink',
        'secret_skip_stone',
      ],
    });
    await page.evaluate(() => window.__bb!.saveNow());
    await clickUi(page, 'pause');
    await clickUi(page, 'to_menu');
    await waitForScene(page, 'menu');
    await page.waitForTimeout(2500);
    await shot(page, 'journal-42-menu-jar');
    const sign = await page.evaluate(() => window.__bb!.slotButtonClient(1));
    if (sign)
      await page.screenshot({
        path: join(DIR, 'journal-43-menu-jar-close.png'),
        clip: { x: sign.x - 200, y: sign.y - 150, width: 400, height: 300 },
      });
  } finally {
    await bb.close();
  }
});
