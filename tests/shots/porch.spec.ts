import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, frames, jumpTo, launchApp, toClient, waitForScene } from '../e2e/app';
import { sharpShots } from './clip';

// The porch tour (`pnpm shots -g "porch tour"`): Under the Porch by day,
// dusk, night with the lamp on, and in rain; then the Tinker Bench working:
// a tray glowing under a held thing, the shake, the hit-stop, the pop, and
// bugs gawking. Files `porch-*`.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const PORCH_X = 102.4;

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `porch-${name}.png`) });
}

const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);

async function spawn(page: Page, defId: string, x: number, y: number): Promise<number> {
  const before = new Set((await page.evaluate(() => window.__bb!.entities())).map((e) => e.id));
  await send(page, { type: 'spawn', kind: 'item', defId, x, y });
  await frames(page, 1);
  const found = (await page.evaluate(() => window.__bb!.entities())).find(
    (e) => !before.has(e.id) && e.defId === defId,
  );
  return found!.id;
}

async function dropAt(page: Page, defId: string, x: number, y: number): Promise<void> {
  await spawn(page, defId, x, y);
  await send(page, { type: 'grab', x, y });
  await frames(page, 1);
  await send(page, { type: 'release', vx: 0, vy: 0 });
  await frames(page, 2);
}

test('porch tour', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  sharpShots(bb.page);
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(400);
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.freezeNextWorld(true));
    // clickSlot clicks again if the first click lands while the menu is still settling.
    await clickSlot(page, 0);
    await page.mouse.move(960, 40);
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    await frames(page, 120);
    for (const [hour, when] of [
      [12, 'day'],
      [8, 'morning'],
      [19.5, 'dusk'],
      [23, 'night'],
    ] as const) {
      await send(page, { type: 'set_time', hour });
      await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
      if (when === 'night') await send(page, { type: 'poke', x: PORCH_X + 20.6, y: 3.3 });
      for (const part of [0, 1]) {
        await jumpTo(page, PORCH_X + part * 12.8);
        await frames(page, 20);
        await page.waitForTimeout(300);
        await shot(page, `${when}-${part}`);
      }
    }
    await send(page, { type: 'poke', x: PORCH_X + 20.6, y: 3.3 });
    await send(page, { type: 'set_time', hour: 12 });
    await send(page, { type: 'set_weather', wind: 0, rain: true });
    await jumpTo(page, PORCH_X + 6);
    await frames(page, 90);
    await page.waitForTimeout(300);
    await shot(page, 'rain');
    await send(page, { type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });

    // The bench.
    const pts = (await page.evaluate(() => window.__bb!.m8Points()))!;
    await jumpTo(page, PORCH_X + 7.6);
    await frames(page, 30);
    await shot(page, 'bench-rest');
    // Held near an empty tray: the tray glows.
    const id = await spawn(page, 'item_matchbox', pts.trays[0]!.x - 1.5, pts.trays[0]!.y - 1.5);
    const e = (await page.evaluate((i) => window.__bb!.entity(i), id))!;
    const at = await toClient(page, e.x, e.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(page, 2);
    const tray = await toClient(page, pts.trays[0]!.x, pts.trays[0]!.y - 0.7);
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(at.x + ((tray.x - at.x) * i) / 8, at.y + ((tray.y - at.y) * i) / 8);
      await frames(page, 2);
    }
    await frames(page, 12);
    await shot(page, 'bench-tray-glow');
    await page.mouse.up();
    await frames(page, 10);
    await page.mouse.move(960, 40);
    await dropAt(page, 'item_button', pts.trays[1]!.x, pts.trays[1]!.y - 0.5);
    await dropAt(page, 'item_button', pts.trays[2]!.x, pts.trays[2]!.y - 0.5);
    await frames(page, 10);
    await send(page, { type: 'pull_lever' });
    await frames(page, 30);
    await shot(page, 'bench-shake');
    await frames(page, 38);
    await shot(page, 'bench-hitstop');
    await frames(page, 6);
    await shot(page, 'bench-pop');
    await frames(page, 10);
    await shot(page, 'bench-tada');
    await frames(page, 60);
    await shot(page, 'bench-after');
  } finally {
    await bb.close();
  }
});
