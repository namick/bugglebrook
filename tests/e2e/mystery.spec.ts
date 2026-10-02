import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  entities,
  entity,
  frames,
  framesUntil,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  toClient,
} from './app';
import type { TestHook } from './app';

// M10: one whole mystery with the real mouse, mystery_tiny_squeak (game
// design doc, section 12): the moss jar squeaks at night, the flashlight
// shows a shadow puppet under the porch, the bug scope shows something tiny
// in the moss, and a giant potion broken on the moss grows Wubbo. The sim is
// frozen and stepped frame by frame.

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const secrets = (page: Page): Promise<string[]> => page.evaluate(() => window.__bb!.secrets());
const PORCH_X = 102.4;

async function fixture(page: Page, id: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate((f) => window.__bb!.fixture(f), id))!;
}

/** Drop a new thing at world (x, y) and step until it lies still. */
async function stage(page: Page, defId: string, x: number, y: number): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await send(page, { type: 'spawn', kind: 'item', defId, x, y });
  await frames(page, 40);
  return (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)!.id;
}

test('the tiny squeak: from a squeak in the moss jar to Wubbo', async () => {
  const bb = await launchApp();
  const { page } = bb;
  try {
    await openFrozen(page, 0);
    for (const area of ['area_flowerbed_stage', 'area_under_porch', 'area_compost_lab'])
      await send(page, { type: 'unlock', area });
    await send(page, { type: 'set_time', hour: 23 });
    await frames(page, 4);

    // 1. At night the hand over the moss jar hears a tiny squeak.
    const jar = await fixture(page, 'fix_jar_moss');
    await jumpTo(page, jar.x - 6);
    const over = await toClient(page, jar.x, jar.y);
    await page.mouse.move(over.x - 40, over.y - 40);
    await frames(page, 2);
    await page.mouse.move(over.x, over.y, { steps: 3 });
    expect(
      await framesUntil(
        page,
        () => page.evaluate(() => window.__bb!.events().some((e) => e.name === 'moss_squeaked')),
        120,
        15,
      ),
    ).toBe(true);

    // 2. The flashlight pen, switched on with a click under the porch at night: a shadow puppet.
    const lamp = await fixture(page, 'fix_porch_lamp');
    await jumpTo(page, Math.max(PORCH_X, lamp.x - 6));
    const pen = await stage(page, 'item_flashlight_pen', lamp.x + 1.5, 8.4);
    const p = (await entity(page, pen))!;
    const at = await toClient(page, p.x, p.y);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 2);
    expect(
      await framesUntil(
        page,
        async () => (await secrets(page)).includes('secret_flashlight_shadow'),
        400,
        30,
      ),
    ).toBe(true);

    // 3. The moss on the bug scope's dish at night: a click on the eyepiece shows something tiny.
    const scope = (await page.evaluate(() => window.__bb!.m8Points()))!.scope;
    await jumpTo(page, scope.x - 6);
    const moss = await stage(page, 'item_moss_tuft', scope.x + 1.1, 8);
    const eye = await toClient(page, scope.x, scope.y);
    await page.mouse.move(eye.x, eye.y);
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 4);
    expect(await secrets(page)).toContain('secret_scope_wubbo');

    // 4. A giant potion, flung down onto the moss: it breaks, and Wubbo grows to bug size.
    const m = (await entity(page, moss))!;
    const bottle = await stage(page, 'item_potion_giant', m.x + 2.2, 8);
    const from = await pressFrozen(page, bottle);
    const above = await toClient(page, m.x, m.y - 2.6);
    const lifted = await glideFrames(page, from, above.x - from.x, above.y - from.y, 6, 2);
    const onto = await toClient(page, m.x, m.y);
    await glideFrames(page, lifted, onto.x - lifted.x, (onto.y - lifted.y) * 0.8, 2, 1);
    await page.mouse.up();
    expect(
      await framesUntil(page, async () => (await secrets(page)).includes('secret_wubbo_found'), 240, 10),
    ).toBe(true);
    const wubbo = (await entities(page)).find((e) => e.defId === 'bug_tardigrade_wubbo');
    expect(wubbo?.bug?.pending).toBeUndefined();
  } finally {
    await bb.close();
  }
});
