import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, launchApp, toClient, uiAt } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// The discoverability tour (`pnpm shots -g "hints"`): the sunflower's clue
// at the camera's resting point, barrier and sundial wobbles and glints, the
// pocket tab peeking, each ghost-hand demo mid-gesture, the cauldron's stir
// invitation and stir hand, the discovery stamps, and the home stump's hold
// ring. Files hints-01- to hints-30-.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
const POND_X = 32;
const PORCH_X = 102.4;
const COMPOST_X = 134.4;

const send = (page: Page, command: Record<string, unknown>): Promise<void> =>
  page.evaluate((c) => window.__bb!.send(c as never), command);
const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: join(DIR, `${name}.png`) });

async function jump(page: Page, x: number): Promise<void> {
  await page.evaluate((v) => window.__bb!.cameraTo(v), x);
  await page.waitForTimeout(300);
}

/** Show the ghost's demo of `kind` held `t` seconds in, and take a picture. */
async function ghostShot(page: Page, kind: string, name: string, t: number): Promise<void> {
  expect(await page.evaluate(([k, at]) => window.__bb!.pinGhost(k as string, at as number), [kind, t])).toBe(
    true,
  );
  await page.waitForTimeout(900);
  await shot(page, name);
  await page.evaluate(() => window.__bb!.pinGhost(null));
}

test('hints tour', async () => {
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  sharpShots(bb.page);
  const { page } = bb;
  try {
    await clickSlot(page, 0);
    await page.evaluate(() => window.__bb!.setGhostIdle(9999, 0));
    // The sunflower at the camera's resting point: the drooping head and its pictogram on screen.
    await page.mouse.move(900, 100);
    await jump(page, 0);
    await page.waitForTimeout(1500);
    await shot(page, 'hints-01-sunflower-rest');
    // Hover the edge of the locked flowerbed: the sunflower wobbles and twinkles.
    const edge = await toClient(page, POND_X + 0.8, 2.5);
    await page.mouse.move(edge.x, edge.y, { steps: 3 });
    await page.waitForTimeout(250);
    await shot(page, 'hints-02-sunflower-wobble');
    // The plaza: the sundial's notches glint under the hand.
    await jump(page, 64 + 3);
    const dial = (await page.evaluate(() => window.__bb!.fixture('fix_sundial')))!;
    const rim = await toClient(page, dial.x - 0.75, dial.y + 0.05);
    await page.mouse.move(rim.x, rim.y, { steps: 3 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(DIR, 'hints-04-sundial-glint.png'),
      clip: await worldClip(page, dial.x - 2, dial.y - 1.6, dial.x + 2, dial.y + 1.4),
    });
    await ghostShot(page, 'dial', 'hints-05-ghost-dial', 2.0);
    await ghostShot(page, 'pocket', 'hints-06-ghost-pocket', 2.2);
    // The pocket's tab peeks up when the hand rests near the bottom.
    await page.mouse.move(640, 640, { steps: 3 });
    await page.waitForTimeout(1600);
    await shot(page, 'hints-07-pocket-peek');
    // Back at the pond: the ghost waters the sunflower with the sponge.
    await jump(page, 0);
    await ghostShot(page, 'sunflower', 'hints-03-ghost-sponge', 2.2);
    // The lattice before the porch opens: it leans and rattles, and the ghost drags it.
    await jump(page, PORCH_X - 12);
    const lattice = (await page.evaluate(() => window.__bb!.entities())).find(
      (e) => e.defId === 'item_lattice_panel',
    )!;
    const lat = await toClient(page, lattice.x, lattice.y);
    await page.mouse.move(lat.x - 40, lat.y, { steps: 3 });
    await page.waitForTimeout(250);
    await shot(page, 'hints-08-lattice-wobble');
    await ghostShot(page, 'lattice', 'hints-09-ghost-lattice', 2.4);
    // The porch open: the bench's lever.
    await send(page, { type: 'unlock', area: 'area_under_porch' });
    const pts = (await page.evaluate(() => window.__bb!.m8Points()))!;
    await jump(page, pts.lever.x - 9.6);
    const knob = await toClient(page, pts.lever.x + 0.6, pts.lever.y - 0.3);
    await page.mouse.move(knob.x, knob.y, { steps: 3 });
    await page.waitForTimeout(1500);
    await shot(page, 'hints-10-lever-glint');
    await ghostShot(page, 'lever', 'hints-11-ghost-lever', 1.7);
    // The tin can wall rattles at the edge of the locked compost lab.
    await jump(page, PORCH_X + 30.5 - 19.2);
    const wall = await toClient(page, PORCH_X + 30.5 - 0.8, 2.5);
    await page.mouse.move(wall.x, wall.y, { steps: 3 });
    await page.waitForTimeout(250);
    await shot(page, 'hints-12-can-wall-wobble');
    // The compost lab: the cauldron demo, then a real ingredient and the stir invitation.
    await send(page, { type: 'unlock', area: 'area_compost_lab' });
    await jump(page, COMPOST_X - 1);
    await ghostShot(page, 'cauldron', 'hints-13-ghost-cauldron-drop', 2.0);
    await ghostShot(page, 'cauldron', 'hints-14-ghost-cauldron-stir', 5.2);
    await send(page, { type: 'spawn', kind: 'item', defId: 'item_mushroom_cap', x: pts.cauldron.x, y: 5.6 });
    await page.waitForTimeout(1600);
    await shot(page, 'hints-15-ladle-invite');
    const pot = await toClient(page, pts.cauldron.x + 0.4, pts.cauldron.y);
    await page.mouse.move(pot.x, pot.y, { steps: 3 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(DIR, 'hints-16-stir-hand.png'),
      clip: await worldClip(
        page,
        pts.cauldron.x - 3,
        pts.cauldron.y - 3,
        pts.cauldron.x + 3,
        pts.cauldron.y + 2,
      ),
    });
    // The bucket lift wobbles at the edge of the locked treehouse.
    await jump(page, COMPOST_X + 26.5 - 19.2);
    const lift = await toClient(page, COMPOST_X + 26.5 - 0.8, 2.5);
    await page.mouse.move(lift.x, lift.y, { steps: 3 });
    await page.waitForTimeout(250);
    await shot(page, 'hints-17-lift-wobble');
    // Stamps: five clicks on the painted sun, then some secrets from the debug command.
    await jump(page, 64 + 3);
    const sun = await toClient(page, dial.x - 0.5, dial.y);
    await page.mouse.move(sun.x, sun.y, { steps: 3 });
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(sun.x, sun.y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(560);
    await page.screenshot({
      path: join(DIR, 'hints-18-stamp-landing.png'),
      clip: { x: 640, y: 0, width: 640, height: 140 },
    });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: join(DIR, 'hints-19-stamps.png'),
      clip: { x: 640, y: 0, width: 640, height: 140 },
    });
    await page.mouse.move(300, 500, { steps: 3 });
    await page.waitForTimeout(6500);
    await page.screenshot({
      path: join(DIR, 'hints-20-stamps-faded.png'),
      clip: { x: 640, y: 0, width: 640, height: 140 },
    });
    // The home stump, held halfway: the ring fills.
    await jump(page, POND_X + 14);
    const home = await uiAt(page, 'home');
    await page.mouse.move(home.x, home.y, { steps: 3 });
    await page.mouse.down();
    await page.waitForTimeout(220);
    await page.screenshot({
      path: join(DIR, 'hints-21-home-hold.png'),
      clip: { x: home.x - 200, y: home.y - 160, width: 260, height: 220 },
    });
    await page.mouse.up();
  } finally {
    await bb.close();
  }
});
