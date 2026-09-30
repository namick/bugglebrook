import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, entities, launchApp } from '../e2e/app';

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}.png`) });
}

/** A close-up around a world point, `w` by `h` meters. */
async function closeUp(page: Page, name: string, x: number, y: number, w = 4, h = 2.6): Promise<void> {
  const a = await page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x - w / 2, y - h / 2]);
  const b = await page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x + w / 2, y + h / 2]);
  await page.screenshot({
    path: join(DIR, `${name}.png`),
    clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
  });
}

async function bug(page: Page, defId: string) {
  return (await entities(page)).find((e) => e.defId === defId)!;
}

async function holdBug(page: Page, defId: string, dx: number, dy: number): Promise<void> {
  const b = await bug(page, defId);
  const p = await page.evaluate(([x, y]) => window.__bb!.worldToClient(x!, y!), [b.x, b.y]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(p.x + (dx * i) / 15, p.y + (dy * i) / 15);
    await page.waitForTimeout(16);
  }
}

test('screenshot tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await shot(page, '01-menu');
    await clickSlot(page, 0);
    await page.waitForTimeout(1200);
    await shot(page, '02-world-start');
    for (const id of ['bug_ladybug_dot', 'bug_pillbug_rollo', 'bug_snail_glorp']) {
      const b = await bug(page, id);
      await closeUp(page, `03-closeup-${id}`, b.x, b.y - 0.3, 3, 2);
    }
    // Hover near Dot so the eyes follow the cursor.
    const dot = await bug(page, 'bug_ladybug_dot');
    const near = await page.evaluate(
      ([x, y]) => window.__bb!.worldToClient(x!, y!),
      [dot.x + 1.2, dot.y - 1.2],
    );
    await page.mouse.move(near.x, near.y);
    await page.waitForTimeout(400);
    await closeUp(page, '04-dot-looks-at-cursor', dot.x + 0.5, dot.y - 0.6, 4, 2.6);

    await holdBug(page, 'bug_ladybug_dot', 150, -300);
    await page.waitForTimeout(250);
    await shot(page, '05-holding-dot');
    // Fling her up and right.
    const held = await bug(page, 'bug_ladybug_dot');
    const hp = await page.evaluate(([x, y]) => window.__bb!.worldToClient(x!, y!), [held.x, held.y]);
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(hp.x + i * 40, hp.y - i * 30);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(120);
    await shot(page, '06-dot-flung');
    await page.waitForTimeout(1500);
    await shot(page, '07-after-landing');

    // Slam Rollo into the ground for a dizzy spell.
    await holdBug(page, 'bug_pillbug_rollo', 60, -380);
    await page.waitForTimeout(300);
    const r = await bug(page, 'bug_pillbug_rollo');
    const rp = await page.evaluate(([x, y]) => window.__bb!.worldToClient(x!, y!), [r.x, r.y]);
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(rp.x + i * 20, rp.y + i * 60);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(100);
    await shot(page, '08-rollo-curled');
    await page.waitForTimeout(1600);
    const rr = await bug(page, 'bug_pillbug_rollo');
    await closeUp(page, '09-rollo-after', rr.x, rr.y - 0.5, 4, 2.6);

    // Glorp in his shell.
    await holdBug(page, 'bug_snail_glorp', -100, -200);
    await page.waitForTimeout(300);
    const g = await bug(page, 'bug_snail_glorp');
    await closeUp(page, '10-glorp-held', g.x, g.y, 3, 2.4);
    const gp = await page.evaluate(([x, y]) => window.__bb!.worldToClient(x!, y!), [g.x, g.y]);
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(gp.x + i * 50, gp.y - i * 20);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);
    const g2 = await bug(page, 'bug_snail_glorp');
    await closeUp(page, '11-glorp-flying', g2.x, g2.y, 3, 2.4);
    await page.waitForTimeout(2500);
    await shot(page, '12-world-later');

    // Pan to the toy pile.
    await page.mouse.move(900, 300);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(600);
    await shot(page, '13-toy-pile');
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);
    await shot(page, '14-far-right');
    await page.waitForTimeout(8000);
    await shot(page, '15-far-right-later');
  } finally {
    await bb.close();
  }
});
