import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAsset, toArtPack } from '../../scripts/art/build.ts';
import type { ArtPack, RigFile } from '../../src/renderer/src/art/rigFile';
import type { LabLook } from '../../src/renderer/src/art/artLab';
import { bugNamed, clickSlot, content, frames, freeze, launchApp } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// The art pipeline tour: `pnpm shots -g "art"`. The crude test Dot in the world
// before and after, and the Art Lab through every pose, look, and zoom at 1x
// and 2x. Writes art-*.png to /tmp/bb-shots (or $BB_SHOTS_DIR).

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const FIXTURES = join(import.meta.dirname, '../e2e/fixtures/art');

function testPack(): ArtPack {
  const built = ['bug_ladybug_dot', 'face_kit'].map((id) =>
    buildAsset(
      new Uint8Array(readFileSync(join(FIXTURES, `${id}.ora`))),
      JSON.parse(readFileSync(join(FIXTURES, `${id}.rig.json`), 'utf8')) as RigFile,
    ),
  );
  return toArtPack(built);
}

const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: join(DIR, `art-${name}.png`) });

async function closeUp(page: Page, name: string, x: number, y: number, w = 3.2, h = 2.2): Promise<void> {
  const clip = await worldClip(page, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  await page.screenshot({ path: join(DIR, `art-${name}.png`), clip });
}

test('art pipeline tour', async () => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const { page, close } = await launchApp();
  sharpShots(page);
  try {
    await page.mouse.move(960, 40);
    await page.evaluate(() => window.__bb!.freezeNextWorld(true));
    await clickSlot(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    await content(page, dot.id);
    await frames(page, 2);
    await page.evaluate((x) => window.__bb!.cameraTo(x), dot.x - 9);
    await page.waitForTimeout(400);
    await closeUp(page, '01-world-dot-before', dot.x, dot.y - 0.3);
    await shot(page, '02-world-before');

    await page.evaluate((p) => window.__bb!.loadArtPack(p as ArtPack), testPack() as never);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await page.waitForTimeout(400);
    await closeUp(page, '03-world-dot-after', dot.x, dot.y - 0.3);
    await shot(page, '04-world-after');
    // Paint and a potion-like tint still work on the drawn bug.
    await page.evaluate(
      (id) => window.__bb!.debugEntity(id, { paint: ['paint_blue', 'paint_yellow'] }),
      dot.id,
    );
    await page.waitForTimeout(300);
    await closeUp(page, '05-world-dot-painted', dot.x, dot.y - 0.3);
    await freeze(page, false);

    await page.evaluate(() => window.__bb!.artLab('bug_ladybug_dot'));
    await page.evaluate(() => window.__bb!.artLabFrames(30));
    for (const scale of [1, 2] as const) {
      await page.evaluate((s) => window.__bb!.artScale(s), scale);
      await page.evaluate(() => window.__bb!.artLabSet({ zoom: 1, look: 'plain' }));
      await page.evaluate(() => window.__bb!.artLabFrames(20));
      await shot(page, `10-lab-${scale}x`);
      for (const [i, pose] of [
        [0, 'idle'],
        [1, 'walk'],
        [4, 'fly'],
        [5, 'held'],
        [7, 'dizzy'],
        [8, 'asleep'],
      ] as const) {
        await page.evaluate((f) => window.__bb!.artLabSet({ zoom: 4, focus: f }), i);
        await page.evaluate(() => window.__bb!.artLabFrames(17));
        await shot(page, `20-lab-${scale}x-${pose}`);
      }
    }
    await page.evaluate(() => window.__bb!.artScale(null));
    for (const look of ['paint', 'rainbow', 'ghost', 'frozen', 'night'] as LabLook[]) {
      await page.evaluate((l) => window.__bb!.artLabSet({ zoom: 1, look: l }), look);
      await page.evaluate(() => window.__bb!.artLabFrames(10));
      await shot(page, `30-lab-look-${look}`);
    }
  } finally {
    await close();
  }
});

/** The whole crude pack: every bug and the face kit. */
function fullPack(): ArtPack {
  const ids = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.ora'))
    .map((f) => f.replace('.ora', ''));
  return toArtPack(
    ids.map((id) =>
      buildAsset(
        new Uint8Array(readFileSync(join(FIXTURES, `${id}.ora`))),
        JSON.parse(readFileSync(join(FIXTURES, `${id}.rig.json`), 'utf8')) as RigFile,
      ),
    ),
  );
}

// `pnpm shots -g "art every bug"`: the Art Lab on each of the twelve bugs with
// the crude pack. The grid (every pose and expression; code on the left of each
// cell, cutout on the right) from 1x and 2x pages, then walking, held, and each
// of the bug's own poses and forms big. Files art-bug-<id>-*.png.

/** Poses every bug has; the rest are a bug's own (forms, karate, skating...). */
const COMMON = new Set(['idle', 'run', 'hop', 'thrown', 'dizzy', 'asleep', 'eat', 'carry']);
test('art every bug', async () => {
  test.setTimeout(1_800_000);
  mkdirSync(DIR, { recursive: true });
  const { page, close } = await launchApp();
  sharpShots(page);
  try {
    await page.mouse.move(960, 1070);
    await page.evaluate((p) => window.__bb!.loadArtPack(p as ArtPack), fullPack() as never);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    for (const id of await page.evaluate(() => window.__bb!.artIds())) {
      if (!id.startsWith('bug_')) continue;
      await page.evaluate((b) => window.__bb!.artLab(b), id);
      await page.evaluate(() => window.__bb!.artLabSet({ zoom: 1, look: 'plain' }));
      await page.evaluate(() => window.__bb!.artLabFrames(24));
      const st = await page.evaluate(() => window.__bb!.artLabState());
      if (!st?.drawn || st.drawnCells !== st.cells) throw new Error(`${id} is not drawn: ${st?.reason}`);
      await page.screenshot({ path: join(DIR, `art-bug-${id}-00-grid.png`) });
      await page.evaluate(() => window.__bb!.artScale(2));
      await page.evaluate(() => window.__bb!.artLabFrames(4));
      await page.screenshot({ path: join(DIR, `art-bug-${id}-00-grid-2x.png`) });
      await page.evaluate(() => window.__bb!.artScale(null));
      const poses = await page.evaluate(() => window.__bb!.artLabPoses());
      for (const [i, pose] of poses.entries()) {
        if (COMMON.has(pose)) continue;
        await page.evaluate((f) => window.__bb!.artLabSet({ zoom: 4, focus: f }), i);
        await page.evaluate(() => window.__bb!.artLabFrames(17));
        const n = String(i + 1).padStart(2, '0');
        await page.screenshot({ path: join(DIR, `art-bug-${id}-${n}-${pose}.png`) });
      }
    }
  } finally {
    await close();
  }
});
