import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, content, entities, entity, launchApp } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// The M11 music bugs (Buzzby, Fiddle, Luma), for judging their art by eye:
// `pnpm shots -g "m11 music bugs"`. On the ground side by side, in the air,
// at night, then each one's Art Lab grid and its own poses (flying,
// fiddling) big. Writes /tmp/bb-shots/newbugs-*.png (or $BB_SHOTS_DIR).

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

const CAST = ['bug_bee_buzzby', 'bug_cricket_fiddle', 'bug_moth_luma'] as const;

test('m11 music bugs', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { page } = bb;
  sharpShots(page);
  const send = (cmd: unknown): Promise<void> =>
    page.evaluate((c) => window.__bb!.send(c as Parameters<NonNullable<typeof window.__bb>['send']>[0]), cmd);
  const steps = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
  const closeUp = async (name: string, x: number, y: number, w: number, h: number): Promise<void> => {
    const clip = await worldClip(page, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    await page.screenshot({ path: join(DIR, `newbugs-${name}.png`), clip });
  };
  const spawnBugs = async (list: { defId: string; x: number; y: number }[]): Promise<number[]> => {
    const before = new Set((await entities(page)).map((e) => e.id));
    for (const s of list) await send({ type: 'spawn', kind: 'bug', defId: s.defId, x: s.x, y: s.y });
    await steps(1);
    const fresh = (await entities(page)).filter((e) => !before.has(e.id));
    return list.map((s) => fresh.find((e) => e.defId === s.defId)!.id);
  };
  try {
    await bb.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080),
    );
    await page.waitForTimeout(500);
    await clickSlot(page, 0);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__bb!.setPaused(true));
    await page.mouse.move(4, 1070);
    const left = await page.evaluate(() => window.__bb!.camera().x);
    const x0 = left + 3;
    // Clear the stretch of toys and bugs.
    for (const e of await entities(page))
      if (e.x > x0 - 1.5 && e.x < x0 + 6 && e.y > 4) await send({ type: 'despawn', id: e.id });
    await steps(1);

    // On the ground, side by side.
    const ground = await spawnBugs(CAST.map((defId, i) => ({ defId, x: x0 + i * 1.9, y: 7.4 })));
    for (const id of ground) await content(page, id);
    await steps(90);
    for (const id of ground) await content(page, id);
    await steps(20);
    await page.waitForTimeout(300);
    const at = await Promise.all(ground.map((id) => entity(page, id)));
    const gy = Math.max(...at.map((e) => e!.y));
    await closeUp('00-lineup', x0 + 1.9, gy - 0.3, 6.4, 2.4);
    for (const [i, e] of at.entries())
      await closeUp(`0${i + 1}-${CAST[i]!.slice(4)}`, e!.x, e!.y - 0.35, 2.4, 1.8);

    // In the air: dropped from high up, a moment into the fall.
    const air = await spawnBugs(CAST.map((defId, i) => ({ defId, x: x0 + 7.5 + i * 1.9, y: 2.5 })));
    await steps(4);
    await page.waitForTimeout(300);
    for (const [i, id] of air.entries()) {
      const e = (await entity(page, id))!;
      await closeUp(`1${i + 1}-${CAST[i]!.slice(4)}-air`, e.x, e.y, 2.4, 2);
    }
    for (const id of air) await send({ type: 'despawn', id });

    // At night.
    await send({ type: 'set_time', hour: 22 });
    await steps(30);
    await page.waitForTimeout(1200);
    await closeUp('20-lineup-night', x0 + 1.9, gy - 0.3, 6.4, 2.4);
    await send({ type: 'set_time', hour: 12 });
    await steps(2);

    // The Art Lab: every pose and expression (code-drawn), then each bug's own poses big.
    const own = new Set(['walk', 'fly', 'fiddle', 'held', 'thrown', 'idle']);
    for (const id of CAST) {
      await page.evaluate((b) => window.__bb!.artLab(b), id);
      await page.evaluate(() => window.__bb!.artLabSet({ zoom: 1, look: 'plain' }));
      await page.evaluate(() => window.__bb!.artLabFrames(24));
      await page.screenshot({ path: join(DIR, `newbugs-lab-${id.slice(4)}-00-grid.png`) });
      const poses = await page.evaluate(() => window.__bb!.artLabPoses());
      for (const [i, pose] of poses.entries()) {
        if (!own.has(pose)) continue;
        await page.evaluate((f) => window.__bb!.artLabSet({ zoom: 4, focus: f }), i);
        await page.evaluate(() => window.__bb!.artLabFrames(17));
        await page.screenshot({ path: join(DIR, `newbugs-lab-${id.slice(4)}-${pose}.png`) });
      }
      await page.evaluate(() => window.__bb!.artLab(null));
    }
  } finally {
    if (bb.errors.length > 0) console.log(bb.errors.join('\n'));
    await bb.close();
  }
});
