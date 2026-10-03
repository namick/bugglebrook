import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT } from '../../src/game/data';
import { LAB_LOOKS } from '../../src/renderer/src/art/artLab';
import { posesFor } from '../../src/renderer/src/art/poses';
import { launchApp, waitForScene } from '../e2e/app';
import { sharpShots } from './clip';

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const DOT = 'bug_ladybug_dot';

test('Dot Krita art in every pose and look', async () => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { page, close, errors } = await launchApp();
  sharpShots(page);
  try {
    await waitForScene(page, 'menu');
    await page.mouse.move(5, 5);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await page.evaluate(() => window.__bb!.artLab('bug_ladybug_dot'));
    await expect.poll(async () => (await page.evaluate(() => window.__bb!.artLabState()))?.drawn).toBe(true);
    const poses = posesFor(CONTENT.bugs.get(DOT));
    for (const scale of [1, 2] as const) {
      await page.evaluate((s) => window.__bb!.artScale(s), scale);
      await page.evaluate(() => window.__bb!.artLabSet({ zoom: 1, look: 'plain' }));
      await page.evaluate(() => window.__bb!.artLabFrames(20));
      await page.screenshot({ path: join(DIR, `dot-${scale}x-expressions.png`) });
      for (const [focus, pose] of poses.entries()) {
        await page.evaluate((f) => window.__bb!.artLabSet({ zoom: 4, focus: f }), focus);
        await page.evaluate(() => window.__bb!.artLabFrames(17));
        await page.screenshot({ path: join(DIR, `dot-${scale}x-${pose.id}.png`) });
      }
    }
    for (const look of LAB_LOOKS) {
      await page.evaluate((l) => window.__bb!.artLabSet({ zoom: 4, focus: 0, look: l }), look);
      await page.evaluate(() => window.__bb!.artLabFrames(10));
      await page.screenshot({ path: join(DIR, `dot-look-${look}.png`) });
    }
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
