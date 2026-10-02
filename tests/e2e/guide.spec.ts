import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clickSlot, clickUi, launchApp, uiAt } from './app';
import type { TestHook } from './app';

// Playtest F3, the guided start, with the real mouse: in a new world, once
// the first scene's camera slide is over, the ghost hand demos feeding,
// flinging, the tickle, and the shake whenever the player pauses. Any move
// stops a demo; the skip button ends the guide.

type Hints = NonNullable<ReturnType<TestHook['hints']>>;
const hints = async (page: Page): Promise<Hints> => (await page.evaluate(() => window.__bb!.hints()))!;

test('a new world guides the core verbs with the ghost hand, and the skip button ends it', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await page.evaluate(() => window.__bb!.enableIntro(true));
    await clickSlot(page, 0);
    // Rest the hand up in the sky, where it wakes nobody.
    await page.mouse.move(640, 60, { steps: 3 });
    await expect
      .poll(async () => (await hints(page)).ghost.guide, { timeout: 10_000 })
      .toEqual(['feed', 'fling', 'tickle', 'shake']);
    // The first guided demo starts after a short pause: something carried to a bug's mouth, or the next one.
    await expect
      .poll(async () => (await hints(page)).ghost.active, { timeout: 30_000 })
      .toMatch(/^(feed|fling|tickle|shake)$/);
    const first = (await hints(page)).ghost.active;
    // Pure show: nothing was fed, flung, tickled, or shaken.
    const evs = await page.evaluate(() => window.__bb!.events());
    const byPlayer = evs.filter(
      (e) => e.name === 'bug_fed' && (e.payload as { byPlayer?: boolean }).byPlayer,
    );
    expect(byPlayer).toEqual([]);
    expect(evs.map((e) => e.name)).not.toContain('bug_tickled');
    // A move stops it; the next pause brings the next one.
    await page.mouse.move(660, 70);
    expect((await hints(page)).ghost.active).toBeNull();
    await expect
      .poll(async () => (await hints(page)).ghost.active, { timeout: 30_000 })
      .toMatch(/^(feed|fling|tickle|shake)$/);
    expect((await hints(page)).ghost.active).not.toBe(first);
    // The skip button ends the guide, and goes away.
    await uiAt(page, 'guide_skip');
    await clickUi(page, 'guide_skip');
    await expect.poll(async () => (await hints(page)).ghost.guide).toBeNull();
    expect((await hints(page)).ghost.active).toBeNull();
    expect(await page.evaluate(() => window.__bb!.uiClient('guide_skip'))).toBeNull();
  } finally {
    await bb.close();
  }
});

test('without the first scene there is no guide', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await page.mouse.move(640, 60, { steps: 3 });
    expect((await hints(page)).ghost.guide).toBeNull();
    expect(await page.evaluate(() => window.__bb!.uiClient('guide_skip'))).toBeNull();
  } finally {
    await bb.close();
  }
});

test('the first scene opens close and pulls back, and a resting hand sees all four demos, the shake too', async () => {
  test.setTimeout(240_000);
  const bb = await launchApp();
  const { page } = bb;
  try {
    await page.evaluate(() => window.__bb!.enableIntro(true));
    await clickSlot(page, 0);
    // P-15: close on the garden floor at first, then the whole view once the camera has arrived.
    expect((await page.evaluate(() => window.__bb!.viewZoom()))!.peak).toBeGreaterThan(1.4);
    await expect
      .poll(async () => (await page.evaluate(() => window.__bb!.viewZoom()))!.now, { timeout: 30_000 })
      .toBe(1);
    // P-34: rest the hand in the sky and every guided demo gets staged in turn, the shake last.
    await page.mouse.move(640, 60, { steps: 3 });
    await expect
      .poll(async () => (await hints(page)).ghost.shown.shake ?? 0, { timeout: 180_000, intervals: [500] })
      .toBeGreaterThan(0);
    const shown = (await hints(page)).ghost.shown;
    for (const k of ['feed', 'fling', 'tickle', 'shake']) expect(shown[k] ?? 0, k).toBeGreaterThan(0);
  } finally {
    await bb.close();
  }
});
