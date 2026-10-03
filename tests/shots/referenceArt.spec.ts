import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUGS } from '../../src/game/data';
import { clickSlot, clickUi, launchApp, waitForScene } from '../e2e/app';
import { sharpShots } from './clip';

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const ONLY = (process.env.BB_ART_ONLY ?? '').split(',').filter(Boolean);
const COMMON = new Set(['run', 'hop', 'thrown', 'dizzy', 'asleep', 'eat', 'carry']);

test('Krita reference settings selector', async () => {
  mkdirSync(DIR, { recursive: true });
  const { page, close, errors } = await launchApp();
  sharpShots(page);
  try {
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.sfxFixture('all', true));
    await clickSlot(page, 0);
    await clickUi(page, 'pause');
    await clickUi(page, 'art_next');
    await expect.poll(() => page.evaluate(() => window.__bb!.settings().artSet)).toBe('reference');
    await page.mouse.move(5, 5);
    await page.screenshot({ path: join(DIR, 'reference-settings.png') });
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test('Krita reference cast poses and expressions', async () => {
  test.setTimeout(1_800_000);
  mkdirSync(DIR, { recursive: true });
  const { page, close, errors } = await launchApp();
  sharpShots(page);
  try {
    await waitForScene(page, 'menu');
    await page.mouse.move(5, 5);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    for (const def of ONLY.length ? ONLY.map((id) => BUGS.get(id)) : BUGS.all) {
      const name = def.id.split('_').at(-1)!;
      await page.evaluate((id) => window.__bb!.artLab(id), def.id);
      await expect
        .poll(async () => (await page.evaluate(() => window.__bb!.artLabState()))?.drawn)
        .toBe(true);
      for (const scale of [1, 2] as const) {
        await page.evaluate((s) => window.__bb!.artScale(s), scale);
        await page.evaluate(() => window.__bb!.artLabSet({ zoom: 1, look: 'plain' }));
        await page.evaluate(() => window.__bb!.artLabFrames(24));
        const state = await page.evaluate(() => window.__bb!.artLabState());
        expect(state?.drawnCells, def.id).toBe(state?.cells);
        await page.screenshot({ path: join(DIR, `reference-${name}-${scale}x-grid.png`) });
      }
      const poses = await page.evaluate(() => window.__bb!.artLabPoses());
      for (const [focus, pose] of poses.entries()) {
        if (COMMON.has(pose)) continue;
        await page.evaluate((f) => window.__bb!.artLabSet({ zoom: 4, focus: f }), focus);
        await page.evaluate(() => window.__bb!.artLabFrames(17));
        await page.screenshot({ path: join(DIR, `reference-${name}-${pose}.png`) });
      }
      for (const look of ['paint', 'night'] as const) {
        await page.evaluate((l) => window.__bb!.artLabSet({ zoom: 4, focus: 0, look: l }), look);
        await page.evaluate(() => window.__bb!.artLabFrames(10));
        await page.screenshot({ path: join(DIR, `reference-${name}-${look}.png`) });
      }
      console.log(`Reviewed ${def.name}: both atlases, expressions, poses, paint, and night.`);
    }
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
