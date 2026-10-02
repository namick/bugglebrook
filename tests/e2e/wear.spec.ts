import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PLAZA_X,
  clickUi,
  content,
  entities,
  entity,
  frames,
  freeze,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  spawnFrozen,
  toClient,
  waitForScene,
  clickSlot,
} from './app';
import type { TestHook } from './app';

// M11: hats and accessories with the real mouse (drop rule 3, the fling,
// the save), pulling a hat off, and finding Buzzby by playing on the stage.

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);

const wearing = async (page: Page, bug: number): Promise<{ slot: string; id: number }[]> =>
  (await entity(page, bug))?.bug?.wearing?.map((w) => ({ slot: w.slot, id: w.id })) ?? [];

/** With the sim frozen: carry the held thing up, over a bug's head, and down onto it, then let go. */
async function dropOnHead(page: Page, from: { x: number; y: number }, bug: number): Promise<void> {
  const head = (await page.evaluate((id) => window.__bb!.wearAnchor(id, 'head'), bug))!;
  const above = await toClient(page, head.x, head.y - 1.6);
  const on = await toClient(page, head.x, head.y - 0.15);
  // Straight up first, so it clears the bug, then across, then down onto the head.
  const up = await glideFrames(page, from, 0, above.y - from.y, 8, 2);
  const over = await glideFrames(page, up, above.x - up.x, 0, 10, 2);
  await glideFrames(page, over, on.x - over.x, on.y - over.y, 8, 2);
  // Hold still a moment over the head (following it if the bug turns), so letting go is a drop.
  for (let i = 0; i < 4; i++) {
    const h = (await page.evaluate((id) => window.__bb!.wearAnchor(id, 'head'), bug))!;
    const p = await toClient(page, h.x, h.y - 0.15);
    await page.mouse.move(p.x, p.y + (i % 2) * 0.5);
    await frames(page, 6);
  }
  await page.mouse.up();
  await frames(page, 4);
}

test('a hat dropped on a head goes on, stays on through a fling, and survives a save and load', async () => {
  test.setTimeout(120_000);
  let bb = await launchApp();
  const userData = bb.userData;
  try {
    await openFrozen(bb.page, 0);
    const page = bb.page;
    // A big beetle of our own on flat ground, napping so he stays put while the hat goes on.
    const at0 = PLAZA_X + 20;
    await send(page, { type: 'spawn', kind: 'bug', defId: 'bug_stagbeetle_moose', x: at0, y: 7 });
    await frames(page, 2);
    const moose = (await entities(page)).find((e) => e.defId === 'bug_stagbeetle_moose' && !e.bug?.pending)!;
    await content(page, moose.id);
    await send(page, { type: 'set_need', id: moose.id, need: 'need_energy', value: 3 });
    await frames(page, 120);
    await jumpTo(page, at0 - 8);
    const hat = await spawnFrozen(page, 'item_hat_tiny_top_hat', at0 - 3);
    const from = await pressFrozen(page, hat);
    await dropOnHead(page, from, moose.id);
    expect(await wearing(page, moose.id)).toEqual([{ slot: 'head', id: hat }]);
    expect((await entity(page, hat))!.worn).toEqual({ by: moose.id, slot: 'head' });
    // Drawn on his head.
    await frames(page, 2);
    await page.waitForTimeout(100);
    const drawn = (await page.evaluate(() => window.__bb!.worn())).find((w) => w.id === hat)!;
    const g = (await entity(page, moose.id))!;
    expect(drawn.shown).toBe(true);
    expect(drawn.y).toBeLessThan(g.y);
    // Fling him.
    const grip = await pressFrozen(page, moose.id);
    await glideFrames(page, grip, 260, -200, 6, 1);
    await page.mouse.up();
    await frames(page, 300);
    expect(await wearing(page, moose.id)).toEqual([{ slot: 'head', id: hat }]);
    // Save, quit to the menu, and come back.
    await freeze(page, false);
    await page.evaluate(() => window.__bb!.saveNow());
    await clickUi(page, 'pause');
    await clickUi(page, 'to_menu');
    await waitForScene(page, 'menu');
    await bb.close({ keepUserData: true });
    bb = await launchApp(userData);
    await waitForScene(bb.page, 'menu');
    await clickSlot(bb.page, 0);
    expect(await wearing(bb.page, moose.id)).toEqual([{ slot: 'head', id: hat }]);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a hat let go over the middle of Glorp goes on his head (P-24)', async () => {
  const bb = await launchApp();
  try {
    await openFrozen(bb.page, 0);
    const page = bb.page;
    const at0 = PLAZA_X + 20;
    const before = new Set((await entities(page)).map((e) => e.id));
    await send(page, { type: 'spawn', kind: 'bug', defId: 'bug_snail_glorp', x: at0, y: 7 });
    await frames(page, 2);
    const glorp = (await entities(page)).find((e) => !before.has(e.id) && e.defId === 'bug_snail_glorp')!;
    await content(page, glorp.id);
    await send(page, { type: 'set_need', id: glorp.id, need: 'need_energy', value: 3 });
    await frames(page, 120);
    await jumpTo(page, at0 - 8);
    const hat = await spawnFrozen(page, 'item_hat_acorn_cap', at0 - 3);
    const from = await pressFrozen(page, hat);
    // Over the top of his shell, well away from his head.
    const g = (await entity(page, glorp.id))!;
    const head = (await page.evaluate((id) => window.__bb!.wearAnchor(id, 'head'), glorp.id))!;
    const x = g.x - Math.sign(head.x - g.x) * 0.2;
    const above = await toClient(page, x, g.y - 2);
    const shell = await toClient(page, x, g.y - 0.56 - 0.35);
    const up = await glideFrames(page, from, 0, above.y - from.y, 8, 2);
    const over = await glideFrames(page, up, above.x - up.x, 0, 10, 2);
    await glideFrames(page, over, shell.x - over.x, shell.y - over.y, 8, 2);
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(shell.x, shell.y + (i % 2) * 0.5);
      await frames(page, 6);
    }
    await page.mouse.up();
    await frames(page, 4);
    expect(await wearing(page, glorp.id)).toEqual([{ slot: 'head', id: hat }]);
  } finally {
    await bb.close();
  }
});

test('the hand pulls a hat off a bug, and a second hat pops the first', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    // A big beetle of our own on flat ground, sleepy, so he naps where he is (and wears hats in his sleep).
    const at0 = PLAZA_X + 20;
    await send(page, { type: 'spawn', kind: 'bug', defId: 'bug_stagbeetle_moose', x: at0, y: 7 });
    await frames(page, 2);
    const moose = (await entities(page)).find((e) => e.defId === 'bug_stagbeetle_moose' && !e.bug?.pending)!;
    await content(page, moose.id);
    await send(page, { type: 'set_need', id: moose.id, need: 'need_energy', value: 3 });
    await frames(page, 120);
    await jumpTo(page, at0 - 8);
    const cap = await spawnFrozen(page, 'item_hat_acorn_cap', at0 - 3);
    await dropOnHead(page, await pressFrozen(page, cap), moose.id);
    const cone = await spawnFrozen(page, 'item_hat_party_cone', at0 - 3);
    await dropOnHead(page, await pressFrozen(page, cone), moose.id);
    expect(await wearing(page, moose.id)).toEqual([{ slot: 'head', id: cone }]);
    expect((await entity(page, cap))!.worn).toBeUndefined();
    // Press on the cone on his head and pull it away.
    await frames(page, 10);
    // The hat as drawn, and where the sim keeps it, agree.
    await page.waitForTimeout(100);
    const drawn = (await page.evaluate(() => window.__bb!.worn())).find((w) => w.id === cone)!;
    const top = (await entity(page, cone))!;
    expect(Math.abs(drawn.x - top.x)).toBeLessThan(0.3);
    const at = await toClient(page, top.x, top.y - 0.08);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(page, 2);
    expect((await entity(page, cone))!.held).toBe(true);
    await glideFrames(page, at, -150, -60, 8, 2);
    await page.mouse.up();
    await frames(page, 30);
    expect(await wearing(page, moose.id)).toEqual([]);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('playing an instrument on the stage by day brings Buzzby out of the tulip', async () => {
  test.setTimeout(90_000);
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    await send(page, { type: 'unlock', area: 'area_flowerbed_stage' });
    await send(page, { type: 'set_time', hour: 11 });
    await frames(page, 2);
    // The flowerpot stage is at flowerbed x 18.7.
    await jumpTo(page, 18.7 - 8);
    await page.evaluate(() =>
      window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_inst_seedpod_maraca', x: 18.7, y: 5.5 }),
    );
    await frames(page, 90);
    const maraca = (await entities(page)).find((e) => e.defId === 'item_inst_seedpod_maraca' && e.x > 16)!;
    expect((await entities(page)).some((e) => e.defId === 'bug_bee_buzzby')).toBe(false);
    const at = await toClient(page, maraca.x, maraca.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 30);
    expect(await page.evaluate(() => window.__bb!.secrets())).toContain('secret_buzzby_found');
    const bee = (await entities(page)).find((e) => e.defId === 'bug_bee_buzzby');
    expect(bee?.bug?.pending).toBeUndefined();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
