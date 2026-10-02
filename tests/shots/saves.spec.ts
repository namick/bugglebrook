import { expect, test } from '@playwright/test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, launchApp, waitForScene } from '../e2e/app';
import { sharpShots } from './clip';

// Save trouble, for reviewing by eye: `pnpm shots -g "save trouble"`.
// Writes /tmp/bb-shots/saves-*.png: the menu with a padlocked newer save and
// a padlocked broken one, and the cloud that shows while saving fails.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

test('save trouble tour', async () => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const first = await launchApp();
  const userData = first.userData;
  await first.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
  );
  await clickSlot(first.page, 0);
  await first.page.evaluate(() => window.__bb!.saveNow());
  await first.close({ keepUserData: true });
  writeFileSync(join(userData, 'saves', 'slot-2.json'), '{"version": 999}');
  writeFileSync(join(userData, 'saves', 'slot-3.json'), 'garbage');

  const { app, page, close } = await launchApp(userData);
  sharpShots(page);
  const saves = join(userData, 'saves');
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await waitForScene(page, 'menu');
    await expect.poll(() => page.evaluate(() => window.__bb!.menuSettled()), { timeout: 30_000 }).toBe(true);
    await page.mouse.move(1900, 1060);
    await page.screenshot({ path: join(DIR, 'saves-menu-locked.png') });
    // The shake, part way through.
    await page.evaluate(() => window.__bb!.freezeMenu(true));
    const at = (await page.evaluate(() => window.__bb!.slotButtonClient(1)))!;
    await page.mouse.click(at.x, at.y);
    await page.evaluate(() => window.__bb!.menuFrames(6));
    await page.mouse.move(1900, 1060);
    await page.screenshot({ path: join(DIR, 'saves-menu-shake.png') });
    await page.evaluate(() => window.__bb!.freezeMenu(false));

    await clickSlot(page, 0);
    chmodSync(saves, 0o500);
    await page.evaluate(() => window.__bb!.saveNow());
    await expect.poll(() => page.evaluate(() => window.__bb!.saveTrouble().visible)).toBe(true);
    await page.mouse.move(960, 600);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(DIR, 'saves-cloud.png') });
    await page.screenshot({
      path: join(DIR, 'saves-cloud-zoom.png'),
      clip: { x: 0, y: 0, width: 480, height: 270 },
    });
  } finally {
    chmodSync(saves, 0o755);
    await close();
  }
});
