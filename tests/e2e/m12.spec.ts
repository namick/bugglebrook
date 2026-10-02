import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, clickUi, launchApp, waitForScene } from './app';

const logText = (userData: string): string => {
  try {
    return readFileSync(join(userData, 'logs', 'main.log'), 'utf8');
  } catch {
    return '';
  }
};

test('a crash shows the oops screen, logs the error, and the reload button brings the game back', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await waitForScene(page, 'world');
    expect(await page.evaluate(() => window.__bb!.oops().shown)).toBe(false);
    // The main process starts the log on launch.
    expect(logText(bb.userData)).toContain('[info] Bugglebrook');

    await page.evaluate(() => window.__bb!.crash());
    await expect.poll(() => page.evaluate(() => window.__bb!.oops().shown)).toBe(true);
    await expect(page.locator('#bb-oops')).toBeVisible();
    await expect
      .poll(() => logText(bb.userData))
      .toMatch(/\[error\] Renderer: Error: Test crash: bugs got loose/);

    // The real mouse presses the big reload button.
    const at = (await page.evaluate(() => window.__bb!.oops().reload))!;
    expect(at).not.toBeNull();
    await page.mouse.move(at.x, at.y, { steps: 3 });
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => window.__bb !== undefined && !document.getElementById('bb-oops'), null, {
      timeout: 60_000,
    });
    await waitForScene(page, 'menu');
    expect(await page.evaluate(() => window.__bb!.oops().shown)).toBe(false);
    // The autosaved world is still in its slot.
    const slots = await page.evaluate(() => window.__bb!.listSlots());
    expect(slots[0]!.exists).toBe(true);
  } finally {
    await bb.close();
  }
});

test('the update toast slides in and its button asks main to restart', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await waitForScene(page, 'menu');
    expect(await page.evaluate(() => window.__bb!.updateToast().shown)).toBe(false);
    await page.evaluate(() => window.__bb!.fakeUpdateReady('9.9.9'));
    // A loaded machine draws few frames a second; the slide takes a handful of them.
    await expect
      .poll(() => page.evaluate(() => window.__bb!.updateToast().settled), { timeout: 30_000 })
      .toBe(true);
    expect(await page.evaluate(() => window.__bb!.updateToast().version)).toBe('9.9.9');

    // The hand points at it, and a click presses it (main ignores it: tests never update).
    await clickUi(page, 'update_restart');
    await expect.poll(() => page.evaluate(() => window.__bb!.updateToast().restartAsked)).toBe(true);
    await expect
      .poll(() => logText(bb.userData))
      .toContain('Restart for update asked, but no update is waiting');
    // Tests never turn the updater on.
    expect(logText(bb.userData)).toContain('Auto-update off (test)');
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
