import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLAZA_X,
  entities,
  frames,
  freeze,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  toClient,
} from '../e2e/app';
import type { TestHook } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// The trash can and the tidy whistle (playtest F1 and F2), for reviewing by
// eye: `pnpm shots -g "tidy"`. Writes /tmp/bb-shots/tidy-*.png.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `tidy-${name}.png`) });
}

/** A close-up around a world point, `w` by `h` meters. */
async function closeUp(page: Page, name: string, x: number, y: number, w = 6, h = 3.6): Promise<void> {
  const clip = await worldClip(page, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  await page.screenshot({ path: join(DIR, `tidy-${name}.png`), clip });
}

async function spawn(page: Page, defId: string, x: number, y = 7.5): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([d, px, py]) =>
      window.__bb!.send({
        type: 'spawn',
        kind: 'item',
        defId: d as string,
        x: px as number,
        y: py as number,
      }),
    [defId, x, y] as const,
  );
  await frames(page, 2);
  return (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)!.id;
}

test('tidy tour', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const { app, page } = await launchApp();
  sharpShots(page);
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await openFrozen(page, 0);
    const can = PLAZA_X + 33;
    await jumpTo(page, can - 9.6);
    await frames(page, 30);
    await shot(page, '00-plaza-can');
    await page.mouse.move(10, 10);
    await closeUp(page, '01-can', can, 7.8);

    // Carry a pebble toward the can: the lid lifts, then gapes over the mouth.
    const pebble = await spawn(page, 'item_pebble', can - 3);
    await frames(page, 60);
    const at = await pressFrozen(page, pebble);
    const mouth = (await page.evaluate(() => window.__bb!.trash()))!.mouth;
    const near = await toClient(page, mouth.x - 1.6, mouth.y - 0.9);
    const p = await glideFrames(page, at, near.x - at.x, near.y - at.y, 10, 2);
    await page.waitForTimeout(400);
    await closeUp(page, '02-lid-peeks', can - 0.6, 7.5);
    const over = await toClient(page, mouth.x, mouth.y - 0.45);
    await glideFrames(page, p, over.x - p.x, over.y - p.y, 6, 2);
    await page.waitForTimeout(500);
    await frames(page, 10);
    await closeUp(page, '03-lid-gapes', can, 7.5);
    await page.mouse.up();
    await frames(page, 2);
    await page.waitForTimeout(60);
    await page.mouse.move(10, 10);
    await closeUp(page, '04-chomp', can, 7.5);
    await frames(page, 38);
    await page.waitForTimeout(250);
    await closeUp(page, '05-burp', can, 7.3);

    // A bug flung in pops back out, smelly and cross.
    // Boing, flung into the can, pops back out, smelly and cross.
    const boing = (await entities(page)).find((e) => e.defId === 'bug_grasshopper_boing')!;
    const send = (c: Parameters<TestHook['send']>[0]) => page.evaluate((cmd) => window.__bb!.send(cmd), c);
    await send({ type: 'grab', x: boing.x, y: boing.y });
    await frames(page, 1);
    for (let i = 1; i <= 20; i++) {
      await send({
        type: 'drag',
        x: boing.x + ((mouth.x - boing.x) * i) / 20,
        y: boing.y + ((mouth.y - 1.6 - boing.y) * i) / 20,
      });
      await frames(page, 2);
    }
    await frames(page, 10);
    await send({ type: 'release', vx: 0, vy: 3 });
    await frames(page, 18);
    await page.waitForTimeout(60);
    await closeUp(page, '06-bug-spat', can, 6.8, 7, 4.4);
    await frames(page, 50);
    await closeUp(page, '07-bug-cross', can, 7.6, 7, 4.4);

    // Clutter, then the whistle.
    for (const [d, dx] of [
      ['item_mint_leaf', -7],
      ['item_flashlight_pen', -5.5],
      ['item_leaf', -4.2],
      ['item_twig', 2.6],
      ['item_sugar_cube', 3.6],
    ] as const)
      await spawn(page, d, can + dx);
    const blob = await spawn(page, 'item_junk_blob', can - 2.4);
    void blob;
    await frames(page, 90);
    await shot(page, '08-clutter');
    const whistle = (await page.evaluate(() => window.__bb!.tidy())).whistle!;
    const w = (await entities(page)).find((e) => e.id === whistle)!;
    const wc = await toClient(page, w.x, w.y);
    await page.mouse.move(wc.x, wc.y);
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 2);
    await page.waitForTimeout(80);
    await shot(page, '09-whistle-toot');
    await frames(page, 19);
    await shot(page, '10-swoosh');
    await frames(page, 10);
    await shot(page, '11-swoosh-more');
    await frames(page, 120);
    await page.mouse.move(10, 10);
    await shot(page, '12-tidied');
    await closeUp(page, '13-whistle', w.x, w.y - 0.2, 2, 1.2);

    // The ghost hand's demos (the whistle's needs clutter in view).
    await spawn(page, 'item_berry_red', can - 3);
    for (const [d, dx] of [
      ['item_mint_leaf', -7],
      ['item_leaf', -4.2],
      ['item_moss_tuft', 2.6],
    ] as const)
      await spawn(page, d, can + dx);
    await frames(page, 60);
    await freeze(page, false);
    for (const [kind, t] of [
      ['trash', 1.6],
      ['trash', 2.6],
      ['whistle', 1.3],
    ] as const) {
      const ok = await page.evaluate(([k, tt]) => window.__bb!.pinGhost(k as string, tt as number), [
        kind,
        t,
      ] as const);
      await page.waitForTimeout(900);
      expect(ok).toBe(true);
      await shot(page, `14-ghost-${kind}-${t}`);
    }
    await page.evaluate(() => window.__bb!.pinGhost(null));
    await freeze(page, true);

    // Rollo dives in to rummage.
    const feed = async (): Promise<void> => {
      const cork = await spawn(page, 'item_cork', can - 1.2);
      await frames(page, 30);
      const c = (await entities(page)).find((e) => e.id === cork)!;
      await send({ type: 'grab', x: c.x, y: c.y });
      await frames(page, 1);
      await send({ type: 'drag', x: mouth.x, y: mouth.y - 0.4 });
      await frames(page, 20);
      await send({ type: 'release', vx: 0, vy: 0 });
      await frames(page, 2);
    };
    // Nothing new lying about to sniff instead.
    for (const e of await entities(page))
      if (
        e.kind === 'item' &&
        Math.abs(e.x - can) < 9 &&
        e.defId !== 'item_tidy_whistle' &&
        e.defId !== 'item_ruler_ramp'
      )
        await send({ type: 'despawn', id: e.id });
    await feed();
    const rollo = (await entities(page)).find((e) => e.defId === 'bug_pillbug_rollo')!;
    await page.evaluate(
      ([id, x]) => {
        const bb = window.__bb!;
        // Everyone else is content, so nothing else tempts Rollo.
        for (const b of bb.entities().filter((e) => e.kind === 'bug'))
          for (const need of ['need_hunger', 'need_energy', 'need_social', 'need_clean', 'need_fun'] as const)
            bb.send({ type: 'set_need', id: b.id, need, value: 100 });
        bb.send({ type: 'set_need', id: id!, need: 'need_fun', value: 30 });
        // Carried over by the hand, the camera's way.
        const r = bb.entities().find((e) => e.id === id)!;
        bb.send({ type: 'grab', x: r.x, y: r.y });
        bb.frames(1);
        bb.send({ type: 'drag', x: x!, y: 7.6 });
        bb.frames(60);
        bb.send({ type: 'release', vx: 0, vy: 0 });
        bb.frames(60);
      },
      [rollo.id, can - 2.5] as const,
    );
    let rummaging = false;
    for (let i = 0; i < 120 && !rummaging; i++) {
      await frames(page, 10);
      const r = (await entities(page)).find((e) => e.id === rollo.id)!;
      rummaging = r.bug?.action === 'rummage' && r.bug.mode === 'st_use';
      if (!rummaging && i % 10 === 9) {
        await page.evaluate(
          (id) => window.__bb!.send({ type: 'set_need', id, need: 'need_fun', value: 30 }),
          rollo.id,
        );
        if ((await page.evaluate(() => window.__bb!.trash()))!.inside.length === 0) await feed();
      }
    }
    await frames(page, 40);
    await closeUp(page, '15-rummage', can - 0.8, 7.8, 6, 3.6);
    await frames(page, 100);
    await closeUp(page, '16-rummage-found', can - 0.8, 7.6, 7, 4.2);
    await freeze(page, false);
  } finally {
    await app.close();
  }
});
