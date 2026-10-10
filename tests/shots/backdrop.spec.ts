import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BACKDROP_DIR, buildBackdrop, toBackdropPack } from '../../scripts/art/backdrop.ts';
import { formatReport } from '../../scripts/art/build.ts';
import { clickSlot, jumpTo, launchApp } from '../e2e/app';
import { sharpShots } from './clip';

// The backdrop tour (`pnpm shots -g "backdrop tour"`): every area by day, at
// dusk, at night, and in rain, then every seam between two areas, with an
// art set's backdrop on. Files `backdrop-*`.
//
//   BB_BACKDROP_SRC=<folder>  build that set's backdrop from its sources right now and show it
//                             (the set's folder, or its backdrop/ folder). No `pnpm art:build` needed.
//   BB_BACKDROP_SET=<id>      the art set to show. With BB_BACKDROP_SRC it is the set the sources
//                             belong to (its bundled bugs show too); alone, a set built into the game.
//   Neither                   the crude test backdrop (tests/e2e/fixtures/art/backdrop).
//   BB_AREAS=pond,plaza       only those areas (flowerbed, pond, plaza, porch, compost, treehouse).
//   BB_SHOTS_DIR=<folder>     where the pictures go (default /tmp/bb-shots).

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const FIXTURE = join(import.meta.dirname, '../e2e/fixtures/art');

const ALL_AREAS: readonly [string, string, number, number][] = [
  ['area_flowerbed_stage', 'flowerbed', 0, 32],
  ['area_puddle_pond', 'pond', 32, 64],
  ['area_stump_plaza', 'plaza', 64, 102.4],
  ['area_under_porch', 'porch', 102.4, 134.4],
  ['area_compost_lab', 'compost', 134.4, 163.2],
  ['area_treehouse_arcade', 'treehouse', 163.2, 195.2],
];
const ONLY = process.env.BB_AREAS?.split(',') ?? null;
const AREAS = ALL_AREAS.filter(([, name]) => !ONLY || ONLY.includes(name));
/** The view is 19.2 m wide. */
const VIEW = 19.2;

const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(DIR, `backdrop-${name}.png`) });
}

/** The set folder a path names: a set's folder, or the backdrop folder inside one. */
const setFolder = (path: string): string => (basename(path) === BACKDROP_DIR ? dirname(path) : path);

test('backdrop tour', async () => {
  test.setTimeout(1_800_000);
  mkdirSync(DIR, { recursive: true });
  const src = process.env.BB_BACKDROP_SRC ? setFolder(resolve(process.env.BB_BACKDROP_SRC)) : null;
  const bundled = process.env.BB_BACKDROP_SET && !src ? process.env.BB_BACKDROP_SET : null;
  const setId = process.env.BB_BACKDROP_SET ?? (src ? 'backdrop_preview' : 'test_backdrop');
  const bb = await launchApp();
  sharpShots(bb.page);
  const { app, page } = bb;
  try {
    if (!bundled) {
      const folder = src ?? FIXTURE;
      if (!existsSync(join(folder, BACKDROP_DIR)))
        throw new Error(`There is no ${join(folder, BACKDROP_DIR)}.`);
      const built = buildBackdrop(folder);
      for (const [id, messages] of built.messages) console.log(formatReport(id, messages));
      await page.evaluate(([p, id]) => window.__bb!.loadBackdrop(p as never, id as string), [
        toBackdropPack(built),
        setId,
      ] as const);
    }
    const fit = async (): Promise<void> => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
      await page.waitForTimeout(400);
    };
    await fit();
    await clickSlot(page, 0);
    await page.mouse.move(960, 60);
    await page.evaluate((id) => window.__bb!.artSelect(id), setId);
    await expect
      .poll(() => page.evaluate(() => window.__bb!.backdrop()?.ready), { timeout: 30_000 })
      .toBe(true);
    const look = await page.evaluate(() => window.__bb!.backdrop());
    expect(look?.set, `the set "${setId}" has no backdrop in this build`).toBe(setId);
    console.log(
      `backdrop: sky ${look!.sky ? 'yes' : 'no'}, tone rules ${look!.tone} (${look!.toned} colors changed), ` +
        `far strips ${look!.strips.far.has.length}, mid strips ${look!.strips.mid.has.length}`,
    );
    for (const [id] of ALL_AREAS) await send(page, { type: 'unlock', area: id });
    await page.waitForTimeout(300);
    for (const [, name, x0, x1] of AREAS) {
      await fit();
      // Three views across the area, so every part of its strips is seen.
      const stops = [x0, (x0 + x1 - VIEW) / 2, x1 - VIEW];
      for (const [hour, when] of [
        [12, 'day'],
        [18.1, 'dusk'],
        [23, 'night'],
      ] as const) {
        await send(page, { type: 'set_time', hour });
        await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
        for (const [part, x] of (when === 'day' ? stops : [stops[1]!]).entries()) {
          await jumpTo(page, x);
          await shot(page, `${name}-${when}-${part}`);
        }
      }
      await send(page, { type: 'set_time', hour: 12 });
      await send(page, { type: 'set_weather', wind: 0, rain: true });
      await jumpTo(page, stops[1]!);
      await page.waitForTimeout(1500);
      await shot(page, `${name}-rain`);
    }
    // Each seam between two areas, in the middle of the screen, by day.
    await send(page, { type: 'set_time', hour: 12 });
    await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
    for (let i = 1; i < ALL_AREAS.length; i++) {
      const [, a] = ALL_AREAS[i - 1]!;
      const [, b, x] = ALL_AREAS[i]!;
      if (ONLY && !ONLY.includes(a) && !ONLY.includes(b)) continue;
      await jumpTo(page, x - VIEW / 2);
      await shot(page, `seam-${a}-${b}`);
    }
    expect(bb.errors, bb.errors.join('\n')).toEqual([]);
  } finally {
    await bb.close();
  }
});
