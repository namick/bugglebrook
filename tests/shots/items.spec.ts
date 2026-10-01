import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, entities, launchApp, PLAZA_X } from '../e2e/app';

// The M7 items, for reviewing their art by eye: `pnpm exec playwright test -c
// playwright.shots.config.ts tests/shots/items.spec.ts`. Writes /tmp/bb-shots/items-*.png.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

const ITEMS = [
  'item_pollen_puff',
  'item_seed_sunflower',
  'item_lavender_sprig',
  'item_honey_drop',
  'item_bluebell_bloom',
  'item_petal',
  'item_paperclip',
  'item_rubber_band',
  'item_popsicle_stick',
  'item_thread_spool',
  'item_button',
  'item_matchbox',
  'item_straw',
  'item_toothpick',
  'item_foil_ball',
  'item_tissue',
  'item_paper_scrap',
  'item_eggshell',
  'item_battery_toy',
  'item_tin_can',
  'item_cheese_puff',
  'item_crumb_cookie',
  'item_old_coin',
  'item_apple_core',
  'item_dung_ball',
  'item_jar_glass',
  'item_mushroom_cap',
  'item_ice_cube',
  'item_coffee_bean',
  'item_onion_ring',
  'item_fizz_candy',
  'item_compost_goo',
  'item_marble_green',
  'item_marble_track_straight',
  'item_marble_track_curve',
  'item_marble_funnel',
  'item_domino',
  'item_spinning_top',
  'item_yo_yo',
];

/** Leafy things with bites and painted things, for the last row. */
const LOOKS: { defId: string; bites?: number; paint?: string[] }[] = [
  { defId: 'item_leaf', bites: 1 },
  { defId: 'item_leaf', bites: 2 },
  { defId: 'item_mint_leaf', bites: 2 },
  { defId: 'item_lavender_sprig', bites: 1 },
  { defId: 'item_cork', paint: ['paint_red'] },
  { defId: 'item_cork', paint: ['paint_blue'] },
  { defId: 'item_tissue', paint: ['paint_yellow'] },
  { defId: 'item_battery_toy', paint: ['paint_white'] },
  { defId: 'item_rubber_ball', paint: ['paint_black'] },
];

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `items-${name}.png`) });
}

/** A close-up around a world point, `w` by `h` meters. */
async function closeUp(page: Page, name: string, x: number, y: number, w = 1.8, h = 1.3): Promise<void> {
  const a = await page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x - w / 2, y - h / 2]);
  const b = await page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x + w / 2, y + h / 2]);
  const size = page.viewportSize() ?? { width: 1920, height: 1080 };
  const x0 = Math.max(0, Math.min(size.width - 40, a.x));
  const y0 = Math.max(0, Math.min(size.height - 40, a.y));
  const x1 = Math.max(x0 + 40, Math.min(size.width, b.x));
  const y1 = Math.max(y0 + 40, Math.min(size.height, b.y));
  await page.screenshot({
    path: join(DIR, `items-${name}.png`),
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  });
}

/** Spawn an item and return its new ID. */
async function spawn(page: Page, defId: string, x: number, y: number): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([d, px, py]) =>
      window.__bb!.send({
        type: 'spawn',
        kind: 'item',
        defId: d as string,
        x: px as number,
        y: py as number,
      }),
    [defId, x, y] as const,
  );
  await page.evaluate(() => window.__bb!.frames(1));
  const found = (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId);
  if (!found) throw new Error(`${defId} did not spawn`);
  return found.id;
}

async function open(): Promise<Awaited<ReturnType<typeof launchApp>>> {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  await bb.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
  await bb.page.waitForTimeout(500);
  await clickSlot(bb.page, 0);
  await bb.page.waitForTimeout(800);
  await bb.page.evaluate(() => window.__bb!.setPaused(true));
  // Park the hand in a corner so it covers nothing.
  await bb.page.mouse.move(4, 1070);
  return bb;
}

const ALL = [...ITEMS.map((defId) => ({ defId }) as (typeof LOOKS)[number]), ...LOOKS];
/** Two sheets: three rows of nine fit in the sky above the stump. */
const PER_SHEET = 27;

for (const sheet of [0, 1])
  test(`M7 item sheet ${sheet + 1}`, async () => {
    const bb = await open();
    const { page } = bb;
    try {
      const left = await page.evaluate(() => window.__bb!.camera().x);
      const cols = 9;
      const first = sheet * PER_SHEET;
      const spots = ALL.slice(first, first + PER_SHEET).map((look, i) => ({
        look,
        n: first + i,
        x: left + 1.2 + (i % cols) * 2.1,
        y: 1.4 + Math.floor(i / cols) * 1.05,
      }));
      // Spawn them all before a single step, so they hang where they were put.
      const before = new Set((await entities(page)).map((e) => e.id));
      await page.evaluate((list) => {
        for (const s of list)
          window.__bb!.send({ type: 'spawn', kind: 'item', defId: s.look.defId, x: s.x, y: s.y });
        window.__bb!.frames(1);
      }, spots);
      const fresh = (await entities(page)).filter((e) => !before.has(e.id)).sort((a, b) => a.id - b.id);
      for (const [i, s] of spots.entries())
        if (s.look.bites !== undefined || s.look.paint !== undefined)
          await page.evaluate(([e, f]) => window.__bb!.debugEntity(e as number, f as never), [
            fresh[i]!.id,
            s.look,
          ] as const);
      await page.evaluate(() => window.__bb!.frames(1));
      await page.waitForTimeout(300);
      await shot(page, `sheet${sheet + 1}`);
      for (const s of spots)
        await closeUp(page, `close-${String(s.n).padStart(2, '0')}-${s.look.defId.slice(5)}`, s.x, s.y);
      // The same at night, then all dropped onto the ground.
      await page.evaluate(() => {
        window.__bb!.send({ type: 'set_time', hour: 22 });
        window.__bb!.frames(2);
      });
      await page.waitForTimeout(400);
      await shot(page, `sheet${sheet + 1}-night`);
      await page.evaluate(() => window.__bb!.frames(150));
      await page.waitForTimeout(300);
      await shot(page, `sheet${sheet + 1}-ground-night`);
    } finally {
      await bb.close();
    }
  });

test('M7 lattice, track pieces, and marbles', async () => {
  const bb = await open();
  const { page } = bb;
  try {
    const left = await page.evaluate(() => window.__bb!.camera().x);
    // The lattice on the flat by the plaza's left edge, standing on the ground.
    const lx = Math.max(left + 3, PLAZA_X + 3.6);
    const tx = lx + 5;
    const pieces: [string, number, number][] = [
      ['item_lattice_panel', lx, 5.9],
      ['item_marble_track_straight', tx, 3],
      ['item_marble_track_curve', tx + 3, 3],
      ['item_marble_funnel', tx + 6, 3],
      ['item_marble_track_straight', tx, 7.5],
      ['item_marble_track_curve', tx + 3, 7.5],
      ['item_marble_funnel', tx + 6, 7.5],
    ];
    await page.evaluate((list) => {
      for (const [defId, x, y] of list) window.__bb!.send({ type: 'spawn', kind: 'item', defId, x, y });
    }, pieces);
    await page.evaluate(() => window.__bb!.frames(1));
    await page.waitForTimeout(300);
    await shot(page, 'pieces');
    await closeUp(page, 'close-lattice', lx, 6, 5.4, 6.6);
    await closeUp(page, 'close-tracks', tx + 3, 3, 8, 1.6);
    // Marbles resting on the lower pieces (they fall with them, so they stay put relative to each other).
    for (const [dx, y] of [
      [0.3, 6.6],
      [3.1, 6.6],
      [6, 6.4],
    ] as const)
      await spawn(page, 'item_marble_green', tx + dx, y);
    await page.evaluate(() => window.__bb!.frames(60));
    await page.waitForTimeout(300);
    await closeUp(page, 'close-tracks-marbles', tx + 3, 7.6, 8, 2.4);
    await page.evaluate(() => window.__bb!.frames(140));
    await page.waitForTimeout(300);
    await shot(page, 'pieces-ground');
  } finally {
    await bb.close();
  }
});
