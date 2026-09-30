import { expect, test } from '@playwright/test';
import { launchApp, waitForScene } from './app';

test('launches to the menu with three slot buttons and a locked-down renderer', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await expect(page).toHaveTitle('Bugglebrook');
    await waitForScene(page, 'menu');

    for (const slot of [0, 1, 2]) {
      const pos = await page.evaluate((s) => window.__bb!.slotButtonClient(s), slot);
      expect(pos, `slot ${slot}`).not.toBeNull();
    }
    expect(await page.evaluate((s) => window.__bb!.slotButtonClient(s), 3)).toBeNull();

    // A fresh profile has no saves.
    const slots = await page.evaluate(() => window.__bb!.listSlots());
    expect(slots.map((s) => s.exists)).toEqual([false, false, false]);

    // The renderer has no Node access; only the narrow preload API.
    const surface = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      api: Object.keys(window.bugglebrook ?? {}).sort(),
    }));
    expect(surface.require).toBe('undefined');
    expect(surface.process).toBe('undefined');
    expect(surface.api).toEqual(['onFlushRequest', 'platform', 'quit', 'saves', 'settings', 'testMode']);

    const canvas = await page.locator('canvas#game').boundingBox();
    expect(canvas).not.toBeNull();
    expect(canvas!.width / canvas!.height).toBeCloseTo(16 / 9, 1);

    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
