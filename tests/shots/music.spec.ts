import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, launchApp } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// M9's music toys, for reviewing their art by eye: `pnpm shots -g "music"`.
// Writes /tmp/bb-shots/music-*.png: the mushroom sequencer empty, with a
// pattern (the theme), muted and fast, at night, and the new instruments.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string, box?: [number, number, number, number]): Promise<void> {
  const clip = box ? await worldClip(page, ...box) : undefined;
  await page.screenshot({ path: join(DIR, `music-${name}.png`), ...(clip ? { clip } : {}) });
}

test('music toys tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { page } = bb;
  sharpShots(page);
  try {
    await bb.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
    );
    await page.waitForTimeout(500);
    await clickSlot(page, 0);
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const bb = window.__bb!;
      bb.setPaused(true);
      bb.send({ type: 'unlock', area: 'area_flowerbed_stage' });
      bb.frames(2);
    });
    // The camera's limits take the opened flowerbed on the next screen frame.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__bb!.cameraTo(17);
      window.__bb!.frames(2);
    });
    await page.mouse.move(4, 1070);
    await page.waitForTimeout(400);
    const seq = (await page.evaluate(() => window.__bb!.sequencer()))!;
    const box: [number, number, number, number] = [
      seq.stone.x - 0.8,
      seq.seed.y - 0.8,
      seq.knob.x + 0.8,
      9.2,
    ];
    await shot(page, '00-flowerbed');
    await shot(page, '01-sequencer-empty', box);
    // The theme on the melody rows, a bass note and drums.
    const theme: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [3, 4],
      [2, 5],
      [1, 6],
      [0, 7],
      [4, 0],
      [4, 4],
      [5, 0],
      [5, 2],
      [5, 4],
      [5, 6],
    ];
    for (const [row, col] of theme)
      await page.evaluate(
        ([p]) => {
          window.__bb!.send({ type: 'seq_touch', x: p!.x, y: p!.y, start: true });
          window.__bb!.frames(1);
        },
        [seq.caps[row]![col]!],
      );
    await page.waitForTimeout(300);
    await shot(page, '02-sequencer-theme', box);
    await page.evaluate(
      ([t, k]) => {
        window.__bb!.send({ type: 'seq_touch', x: t!.x, y: t!.y, start: true });
        window.__bb!.send({ type: 'seq_touch', x: k!.x, y: k!.y, start: true });
        window.__bb!.frames(2);
      },
      [seq.tufts[1]!, seq.knob],
    );
    await shot(page, '03-sequencer-muted-fast', box);
    await page.evaluate(() => {
      window.__bb!.send({ type: 'set_time', hour: 22 });
      window.__bb!.frames(2);
    });
    await page.waitForTimeout(300);
    await shot(page, '04-sequencer-night', box);
    await page.evaluate(() => {
      window.__bb!.send({ type: 'set_time', hour: 12 });
      window.__bb!.frames(2);
    });
    // The new instruments, side by side in the sky above the stage.
    const defs = [
      'item_inst_seedpod_maraca',
      'item_inst_acorn_castanets',
      'item_inst_bottle_flute',
      'item_inst_leaf_xylophone',
      'item_inst_thimble_drum',
      'item_inst_comb_kazoo',
    ];
    await page.evaluate((list) => {
      list.forEach((d, i) =>
        window.__bb!.send({ type: 'spawn', kind: 'item', defId: d, x: 19.5 + i * 1.6, y: 3.2 }),
      );
      window.__bb!.frames(1);
    }, defs);
    await shot(page, '05-instruments', [18.5, 2.4, 29, 4]);
  } finally {
    await bb.close();
  }
});
