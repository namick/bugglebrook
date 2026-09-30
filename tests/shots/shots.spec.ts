import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bugNamed,
  clickSlot,
  content,
  entities,
  entity,
  holdNearMouth,
  launchApp,
  scrollTo,
  spawnItem,
  toClient,
} from '../e2e/app';

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `${name}.png`) });
}

/** A close-up around a world point, `w` by `h` meters. */
async function closeUp(page: Page, name: string, x: number, y: number, w = 4, h = 2.6): Promise<void> {
  const a = await page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x - w / 2, y - h / 2]);
  const b = await page.evaluate(([px, py]) => window.__bb!.worldToClient(px!, py!), [x + w / 2, y + h / 2]);
  // Keep the clip on screen, so a bug near the edge still gets its picture.
  const size = page.viewportSize() ?? { width: 1920, height: 1080 };
  const x0 = Math.max(0, Math.min(size.width - 40, a.x));
  const y0 = Math.max(0, Math.min(size.height - 40, a.y));
  const x1 = Math.max(x0 + 40, Math.min(size.width, b.x));
  const y1 = Math.max(y0 + 40, Math.min(size.height, b.y));
  await page.screenshot({
    path: join(DIR, `${name}.png`),
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
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

/** Close-up centered on a bug, a bit above it so bubbles show. */
async function bugShot(page: Page, name: string, id: number, w = 2.8, h = 2.4): Promise<void> {
  const b = (await entity(page, id))!;
  await closeUp(page, name, b.x, b.y - 0.7, w, h);
}

/** Let go and move the hand out of the way, up into the sky. */
async function letGo(page: Page): Promise<void> {
  await page.mouse.up();
  await page.mouse.move(960, 120, { steps: 3 });
}

test('feeding and reactions tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await clickSlot(page, 1);
    await page.waitForTimeout(800);
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const glorp0 = await bugNamed(page, 'bug_snail_glorp');
    for (const b of [rollo, dot, glorp0]) await content(page, b.id);

    // Hover a berry: the hand curls and the berry gets a rim light.
    const berry = await spawnItem(page, 'item_berry_red', rollo.x + 1.8);
    const bv = (await entity(page, berry))!;
    const bp = await toClient(page, bv.x, bv.y);
    await page.mouse.move(bp.x, bp.y);
    await page.waitForTimeout(300);
    await closeUp(page, '20-hover-berry', bv.x, bv.y - 0.3, 2.4, 1.6);

    // Hold it near Rollo: every mouth glows, Rollo opens wide.
    await holdNearMouth(page, berry, rollo.id, 0.05, -0.3);
    await shot(page, '21-holding-berry-glows');
    await bugShot(page, '22-rollo-wants-berry', rollo.id);
    await letGo(page);
    await page.waitForTimeout(450);
    await bugShot(page, '23-rollo-chews-berry', rollo.id);
    await page.waitForTimeout(1300);
    await bugShot(page, '24-rollo-yum', rollo.id);
    await page.waitForTimeout(2000);

    // Pepper for Rollo: yuck, ptoo, and a grumpy face.
    await content(page, rollo.id);
    const pepper = await spawnItem(page, 'item_pepper_hot', rollo.x + 1.8);
    await holdNearMouth(page, pepper, rollo.id, 0.05, -0.3);
    await bugShot(page, '25-rollo-offered-pepper', rollo.id);
    await letGo(page);
    await page.waitForTimeout(450);
    await bugShot(page, '26-rollo-yuck', rollo.id);
    await page.waitForTimeout(420);
    await bugShot(page, '27-rollo-ptoo', rollo.id, 4, 2.8);
    await page.waitForTimeout(500);
    await bugShot(page, '28-rollo-hate', rollo.id);
    await page.waitForTimeout(2000);

    // Banana mush: Rollo's favorite. Heart eyes.
    await page.evaluate(
      (id) => window.__bb!.send({ type: 'set_need', id, need: 'need_hunger', value: 20 }),
      rollo.id,
    );
    const mush = await spawnItem(page, 'item_rotten_banana_bit', rollo.x + 1.8);
    await holdNearMouth(page, mush, rollo.id, 0.05, -0.3);
    await letGo(page);
    await page.waitForTimeout(700);
    await bugShot(page, '29-rollo-loves-mush-chewing', rollo.id);
    await page.waitForTimeout(1200);
    await bugShot(page, '30-rollo-love', rollo.id);
    await page.waitForTimeout(2000);

    // A sleepy Rollo: hover him and he thinks of sleep.
    await page.evaluate(
      (id) => window.__bb!.send({ type: 'set_need', id, need: 'need_energy', value: 8 }),
      rollo.id,
    );
    const r2 = (await entity(page, rollo.id))!;
    const rp = await toClient(page, r2.x - 0.2, r2.y);
    await page.mouse.move(rp.x, rp.y, { steps: 4 });
    await page.waitForTimeout(1300);
    await bugShot(page, '35-rollo-thinks-sleep', rollo.id);
    await content(page, rollo.id);

    // Tickle Dot: press and hold still.
    const d2 = (await entity(page, dot.id))!;
    const dp = await toClient(page, d2.x, d2.y);
    await page.mouse.move(dp.x, dp.y);
    await page.mouse.down();
    await page.waitForTimeout(1900);
    await bugShot(page, '34-dot-tickled', dot.id);
    await page.mouse.up();
    await page.waitForTimeout(1500);

    // Carry Dot off to the quiet right side of the plaza, scrolling as we go.
    const d3 = (await entity(page, dot.id))!;
    const cp = await toClient(page, d3.x, d3.y);
    await page.mouse.move(cp.x, cp.y);
    await page.mouse.down();
    await page.mouse.move(cp.x, cp.y - 150, { steps: 5 });
    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(1800);
    await content(page, dot.id);

    // Dot and the hot pepper: a flame puff, then a burp.
    await page.evaluate(
      (id) => window.__bb!.send({ type: 'set_need', id, need: 'need_hunger', value: 90 }),
      dot.id,
    );
    const pepper2 = await spawnItem(page, 'item_pepper_hot', (await entity(page, dot.id))!.x + 1.8);
    await holdNearMouth(page, pepper2, dot.id, 0.05, -0.3);
    await letGo(page);
    await page.waitForTimeout(1780);
    await bugShot(page, '31-dot-flame', dot.id, 4, 2.8);
    await page.waitForTimeout(1050);
    await bugShot(page, '32-dot-burp', dot.id, 4, 2.8);
    await page.waitForTimeout(2500);

    // Dot and mint: she sneezes it out.
    await content(page, dot.id);
    const mint = await spawnItem(page, 'item_mint_leaf', (await entity(page, dot.id))!.x + 1.8);
    await holdNearMouth(page, mint, dot.id, 0.05, -0.3);
    await bugShot(page, '33a-dot-offered-mint', dot.id);
    await letGo(page);
    await page.waitForTimeout(870);
    await bugShot(page, '33-dot-sneeze', dot.id, 4, 2.8);
    await page.waitForTimeout(2500);

    // Back to the stump.
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(600);

    // Glorp: slam him down; he spins in his shell instead of getting dizzy.
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    await page.evaluate(
      (x) => window.__bb!.send({ type: 'set_need', id: x, need: 'need_hunger', value: 90 }),
      glorp.id,
    );
    const gp = await toClient(page, glorp.x, glorp.y);
    await page.mouse.move(gp.x, gp.y);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(gp.x, gp.y - i * 40);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(250);
    const top = { x: gp.x, y: gp.y - 600 };
    await Promise.all(
      [1, 2, 3, 4].map((i) => page.mouse.move(top.x, top.y + i * 60)).concat(page.mouse.up()),
    );
    await page.waitForTimeout(900);
    await bugShot(page, '36-glorp-shell-spin', glorp.id);
    await page.waitForTimeout(1200);
    await bugShot(page, '37-glorp-after', glorp.id);
  } finally {
    await bb.close();
  }
});

/** Spawn something at a world point and return its ID once it exists. */
async function spawnAt(
  page: Page,
  kind: 'bug' | 'item',
  defId: string,
  x: number,
  y: number,
): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([k, d, px, py]) =>
      window.__bb!.send({
        type: 'spawn',
        kind: k as 'bug',
        defId: d as string,
        x: px as number,
        y: py as number,
      }),
    [kind, defId, x, y] as const,
  );
  await page.waitForTimeout(50);
  return (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)!.id;
}

const setTag = (page: Page, id: number, tag: string, on = true): Promise<void> =>
  page.evaluate(
    ([i, t, o]) =>
      window.__bb!.send({ type: 'set_tag', id: i as number, tag: t as string, on: o as boolean }),
    [id, tag, on] as const,
  );

test('pond and properties tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await clickSlot(page, 2);
    await page.waitForTimeout(600);
    // Scroll left to the pond.
    await page.mouse.move(960, 300);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -110);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1500);
    await shot(page, '40-pond');
    const skeet = await bugNamed(page, 'bug_waterstrider_skeet');
    await bugShot(page, '41-skeet', skeet.id, 3.6, 2.6);
    const w = (await page.evaluate(() => window.__bb!.water())).surfaces[0]!;

    // A pebble plunks in: splash.
    await spawnAt(page, 'item', 'item_pebble', 15.6, 5);
    await page.waitForTimeout(620);
    await closeUp(page, '42-splash', 15.6, w.level - 0.6, 4, 2.6);
    await page.waitForTimeout(1500);
    await closeUp(page, '43-floaters', 11, w.level - 0.2, 6, 3);

    // The hose tap, clicked with the real mouse, after scrolling right a little.
    await page.mouse.move(960, 300);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 110);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300);
    const tap = (await page.evaluate(() => window.__bb!.fixture('fix_hose_tap')))!;
    const tp = await toClient(page, tap.x, tap.y);
    await page.mouse.click(tp.x, tp.y);
    await page.mouse.move(960, 120);
    await page.waitForTimeout(1200);
    await closeUp(page, '44-hose-spray', tap.x - 2, tap.y, 6, 3.4);
    await page.mouse.click(tp.x, tp.y);
    await page.mouse.move(960, 120);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -110);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300);

    // Bugs fall in: Dot paddles, Rollo sinks, Glorp floats like a boat.
    const dot = await spawnAt(page, 'bug', 'bug_ladybug_dot', 7.2, 6);
    const rollo = await spawnAt(page, 'bug', 'bug_pillbug_rollo', 14.6, 6);
    const glorp = await spawnAt(page, 'bug', 'bug_snail_glorp', 19.5, 6);
    for (const id of [dot, rollo, glorp]) await content(page, id);
    await page.waitForTimeout(700);
    await bugShot(page, '45-dot-splash', dot, 3, 2.4);
    await page.waitForTimeout(900);
    await shot(page, '46-swimmers');
    await bugShot(page, '47-rollo-bottom', rollo, 3, 2.4);
    await bugShot(page, '48-glorp-boat', glorp, 3, 2.4);
    // Wait for someone to reach the shore and shake dry.
    await page.waitForTimeout(3500);
    await shot(page, '49-shore');
    for (let i = 0; i < 40; i++) {
      const shook = (await page.evaluate(() => window.__bb!.events())).find(
        (e) => e.name === 'bug_shook_dry',
      );
      if (shook) {
        const p = shook.payload as { id: number };
        await page.waitForTimeout(150);
        await bugShot(page, '50-shake-dry', p.id, 3, 2.4);
        break;
      }
      await page.waitForTimeout(250);
    }

    // Mint leaf into the water: an ice sheet.
    await spawnAt(page, 'item', 'item_mint_leaf', 10.4, 7);
    await page.waitForTimeout(1500);
    await closeUp(page, '51-ice', 10.4, w.level - 0.5, 4, 2.4);

    // Bugs with tags: a hot Dot glows, a frozen Rollo sits in ice.
    const d2 = await spawnAt(page, 'bug', 'bug_ladybug_dot', 3.2, 7);
    const r2 = await spawnAt(page, 'bug', 'bug_pillbug_rollo', 1.8, 7);
    for (const id of [d2, r2]) await content(page, id);
    await page.waitForTimeout(800);
    await setTag(page, d2, 'tag_hot');
    await setTag(page, r2, 'tag_frozen');
    await page.waitForTimeout(600);
    await closeUp(page, '53-bug-tags', 2.6, 8, 4, 2.6);

    await page.mouse.move(960, 300);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 110);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300);
    // Tag looks side by side on the bank: wet, hot, frozen, smelly, soapy, fuzzy.
    const row: [string, string][] = [
      ['item_sponge', 'tag_wet'],
      ['item_pebble', 'tag_hot'],
      ['item_cork', 'tag_frozen'],
      ['item_leaf', 'tag_smelly'],
      ['item_twig', 'tag_soapy'],
    ];
    for (let i = 0; i < row.length; i++) {
      const id = await spawnAt(page, 'item', row[i]![0], 27.4 + i * 0.75, 7.6);
      await setTag(page, id, row[i]![1]);
    }
    await page.waitForTimeout(1200);
    await closeUp(page, '52-tag-looks', 29, 8.1, 5, 2.4);

    // Gum stuck to a pebble, and soap bubbles.
    const gum = await spawnAt(page, 'item', 'item_gum_blob', 31.2, 6.5);
    await spawnAt(page, 'item', 'item_pebble', 31.2, 5.5);
    await page.waitForTimeout(1200);
    const g = (await entity(page, gum))!;
    await closeUp(page, '54-gum', g.x, g.y - 0.3, 2.4, 1.8);
    const soap = await spawnAt(page, 'item', 'item_soap_sliver', 18.5, 6);
    await page.waitForTimeout(2500);
    const sv = (await entity(page, soap))!;
    await closeUp(page, '55-soap-bubbles', sv.x, sv.y - 1, 4, 3);
  } finally {
    await bb.close();
  }
});

/** Wheel the camera until its left edge is near world x. */
async function panTo(page: Page, x: number): Promise<void> {
  await page.mouse.move(960, 200);
  for (let i = 0; i < 60; i++) {
    const cam = (await page.evaluate(() => window.__bb!.camera())).x;
    const d = x - cam;
    if (Math.abs(d) < 0.5) return;
    await page.mouse.wheel(0, Math.max(-600, Math.min(600, (d * 100) / 1.5)));
    await page.waitForTimeout(25);
  }
}

// Files 60- to 89-: leave the plaza alone and watch. Each sample skips ahead
// some seconds of sim time, then lets the real renderer run a moment so
// bubbles, faces, and particles show. The camera follows the busiest spot.
// `idle-log.txt` lists what the bugs got up to between samples.
test('idle watch', async () => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  const log: string[] = [];
  const names = new Map<number, string>();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(500);
    await clickSlot(page, 2);
    await page.waitForTimeout(800);
    await page.mouse.move(960, 60);
    for (const e of await entities(page)) names.set(e.id, e.defId.replace(/^(bug|item)_/, ''));
    const skip = [
      0, 6, 9, 5, 8, 7, 10, 6, 9, 12, 8, 7, 11, 9, 10, 8, 12, 9, 10, 11, 8, 9, 10, 12, 9, 11, 10, 8,
    ];
    for (let i = 0; i < skip.length; i++) {
      await page.evaluate(() => window.__bb!.clearLogs());
      await page.evaluate((n) => window.__bb!.step(n), skip[i]! * 60);
      // Follow the plaza bugs.
      const bugs = (await entities(page)).filter((e) => e.kind === 'bug' && e.x > 32);
      const cx = bugs.reduce((a, b) => a + b.x, 0) / Math.max(1, bugs.length);
      await panTo(page, Math.max(32, Math.min(70.4 - 19.2, cx - 9.6)));
      await page.mouse.move(960, 60);
      await page.waitForTimeout(1700);
      const tick = await page.evaluate(() => window.__bb!.tick());
      const events = await page.evaluate(() => window.__bb!.events());
      for (const e of await entities(page)) names.set(e.id, e.defId.replace(/^(bug|item)_/, ''));
      const keep =
        /bug_(socialized|chatted|tagged|threw|caught|shared|snatched|comforted|gawked|rode|slept|woke|posed|inspected|ate|curled|hid|slipped|dizzy|picked_up|bumped)|stack_fell/;
      for (const ev of events) {
        if (!keep.test(ev.name)) continue;
        const p = ev.payload as Record<string, unknown>;
        const who = names.get(p.id as number) ?? '';
        const other = p.partnerId ?? p.mountId ?? p.itemId;
        const bit = typeof other === 'number' ? (names.get(other) ?? other) : '';
        const extra = p.topic
          ? ` ${String(p.topic)}${p.about ? `:${String(p.about)}` : ''}`
          : p.kind
            ? ` ${String(p.kind)}`
            : '';
        log.push(
          `${(ev.tick / 60).toFixed(1).padStart(7)} ${who} ${ev.name.replace('bug_', '')} ${bit}${extra}`,
        );
      }
      const modes = bugs.map((b) => `${names.get(b.id)}:${b.bug?.mode}`).join(' ');
      log.push(`--- shot ${60 + i} at ${(tick / 60).toFixed(0)} s: ${modes}`);
      await shot(page, `${60 + i}-idle-${String(Math.round(tick / 60)).padStart(4, '0')}s`);
    }
  } finally {
    writeFileSync(join(DIR, 'idle-log.txt'), log.join('\n') + '\n');
    await bb.close();
  }
});

/** Click a named UI control with the real mouse. */
async function clickUi(
  page: Page,
  name: Parameters<NonNullable<typeof window.__bb>['uiClient']>[0],
): Promise<void> {
  const p = await page.evaluate((n) => window.__bb!.uiClient(n), name);
  if (!p) throw new Error(`No ${name} on screen`);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.click(p.x, p.y);
}

/** Carry an entity with the real mouse into pocket slot `slot`, stopping over it before letting go. */
async function carryToPocket(page: Page, id: number, slot: number, shotName?: string): Promise<void> {
  const e = (await entity(page, id))!;
  const at = await toClient(page, e.x, e.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const to = (await page.evaluate((s) => window.__bb!.pocketSlotClient(s), slot))!;
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(at.x + ((to.x - at.x) * i) / 20, at.y + ((to.y - 40 - at.y) * i) / 20);
    await page.waitForTimeout(16);
  }
  const over = (await page.evaluate((s) => window.__bb!.pocketSlotClient(s), slot))!;
  await page.mouse.move(over.x, over.y, { steps: 3 });
  await page.waitForTimeout(350);
  if (shotName) await shot(page, shotName);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test('menu, pause, pocket, and first scene tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await page.waitForTimeout(350);
    await shot(page, '90-menu-letters-drop');
    await page.waitForTimeout(1800);
    await shot(page, '91-menu');
    await clickUi(page, 'gear');
    await page.waitForTimeout(900);
    await shot(page, '92-menu-settings');
    await clickUi(page, 'resume');
    await page.waitForTimeout(600);

    // A new world with the first scene.
    await page.evaluate(() => window.__bb!.enableIntro(true));
    await clickSlot(page, 0);
    await page.waitForTimeout(250);
    await shot(page, '93-intro-fade');
    await page.waitForTimeout(1300);
    await shot(page, '94-intro-slide');
    await page.waitForTimeout(2200);
    await shot(page, '95-intro-dot-asleep');
    const dot = await bug(page, 'bug_ladybug_dot');
    await closeUp(page, '96-intro-dot-closeup', dot.x + 0.4, dot.y - 0.5, 4, 2.6);
    const near = await toClient(page, dot.x + 1.4, dot.y - 1.2);
    await page.mouse.move(near.x, near.y, { steps: 8 });
    await page.waitForTimeout(1600);
    await closeUp(page, '97-intro-dot-wakes', dot.x + 0.4, dot.y - 0.8, 4, 2.6);
    // Skip ahead to the "again!" nudge.
    await page.evaluate(() => {
      const bb = window.__bb!;
      bb.setPaused(true);
    });
    await page.evaluate(() => window.__bb!.setPaused(false));

    // The pause board.
    await clickUi(page, 'pause');
    await page.waitForTimeout(900);
    await shot(page, '98-pause');
    await clickUi(page, 'resume');
    await page.waitForTimeout(700);

    // The pocket: a pebble in, then Rollo.
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    const pebble = await spawnItem(page, 'item_pebble', 40);
    await carryToPocket(page, pebble, 0, '99a-pocket-open-glow');
    const pebble2 = await spawnItem(page, 'item_pebble', 41);
    await carryToPocket(page, pebble2, 0);
    const rollo = await bug(page, 'bug_pillbug_rollo');
    await carryToPocket(page, rollo.id, 1);
    await page.mouse.move(960, 1060, { steps: 6 });
    await page.waitForTimeout(600);
    await shot(page, '99b-pocket-with-things');
    const a = (await page.evaluate(() => window.__bb!.pocketSlotClient(0)))!;
    const b = (await page.evaluate(() => window.__bb!.pocketSlotClient(5)))!;
    const size = page.viewportSize() ?? { width: 1920, height: 1080 };
    const w = b.x - a.x;
    await page.screenshot({
      path: join(DIR, '99c-pocket-closeup.png'),
      clip: {
        x: a.x - w * 0.15,
        y: a.y - w * 0.12,
        width: w * 1.3,
        height: Math.max(20, size.height - (a.y - w * 0.12)),
      },
    });
    await page.mouse.move(960, 500, { steps: 6 });
    await page.waitForTimeout(600);
    await shot(page, '99d-pocket-tab');

    // Back to the menu: the slot now shows its picture.
    await clickUi(page, 'pause');
    await page.waitForTimeout(700);
    await clickUi(page, 'to_menu');
    await page.waitForFunction(() => window.__bb!.scene() === 'menu');
    await page.waitForTimeout(2200);
    await shot(page, '99e-menu-with-save');
    // Drag the sign toward the bin.
    const sign = (await page.evaluate(() => window.__bb!.slotButtonClient(0)))!;
    const bin = (await page.evaluate(() => window.__bb!.uiClient('bin')))!;
    await page.mouse.move(sign.x, sign.y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(sign.x + ((bin.x - sign.x) * i) / 20, sign.y + ((bin.y - 80 - sign.y) * i) / 20);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(500);
    await shot(page, '99f-menu-bin-closing');
    await page.mouse.move(sign.x, sign.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    await shot(page, '99g-menu-bin-cancelled');
  } finally {
    await bb.close();
  }
});

test('day, night, and weather tour', async () => {
  mkdirSync(DIR, { recursive: true });
  const bb = await launchApp();
  const { app, page } = bb;
  const send = (c: Parameters<NonNullable<typeof window.__bb>['send']>[0]): Promise<void> =>
    page.evaluate((cmd) => window.__bb!.send(cmd), c);
  const frames = (n: number): Promise<void> => page.evaluate((k) => window.__bb!.frames(k), n);
  /** Jump to an hour and let the look settle for a moment of real frames. */
  const at = async (hour: number, settle = 700): Promise<void> => {
    await send({ type: 'set_time', hour });
    await frames(2);
    await page.waitForTimeout(settle);
  };
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1920, 1080));
    await clickSlot(page, 0);
    await page.waitForTimeout(800);
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    await page.mouse.move(1900, 60);
    await at(5.6);
    await shot(page, '100-dawn');
    await at(6.3);
    await shot(page, '101-sunrise');
    await at(12);
    await shot(page, '102-noon');
    await at(18.4);
    await shot(page, '103-sunset');
    await at(19.3);
    await shot(page, '104-dusk');
    await at(22, 1200);
    await shot(page, '105-night');
    // The pond by night: fireflies over the reeds, the moon on the water.
    await scrollTo(page, 17);
    await page.mouse.move(1900, 60);
    await page.waitForTimeout(900);
    await shot(page, '106-night-pond');
    // The flashlight at night, near the reeds.
    const pen = (await entities(page)).find((e) => e.defId === 'item_flashlight_pen');
    if (pen) {
      const reeds = (await page.evaluate(() => window.__bb!.fixture('fix_reeds')))!;
      await page.evaluate(() => window.__bb!.setPaused(true));
      const p = await toClient(page, pen.x, pen.y);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await frames(2);
      const to = await toClient(page, reeds.x + 2.5, 8.2);
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(p.x + ((to.x - p.x) * i) / 10, p.y + ((to.y - p.y) * i) / 10);
        await frames(2);
      }
      await frames(20);
      await page.mouse.up();
      await frames(40);
      await page.evaluate(() => window.__bb!.setPaused(false));
      const now = (await entities(page)).find((e) => e.id === pen.id)!;
      const c = await toClient(page, now.x, now.y);
      await page.mouse.click(c.x, c.y);
      await page.waitForTimeout(700);
      await page.mouse.move(960, 120);
      await shot(page, '107-night-flashlight');
      // Three clicks call Flick.
      for (let k = 0; k < 2; k++) {
        const e = (await entities(page)).find((v) => v.id === pen.id)!;
        const q = await toClient(page, e.x, e.y);
        await page.mouse.click(q.x, q.y);
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(1500);
      await page.mouse.move(960, 120);
      await shot(page, '108-flick-joins');
      const flick = (await entities(page)).find((e) => e.defId === 'bug_firefly_flick');
      if (flick) await closeUp(page, '109-flick-closeup', flick.x, flick.y - 0.3, 3, 2);
    }
    // Back to the plaza by night: sleeping bugs, glowing mushrooms, eyes in the knothole.
    await scrollTo(page, 35);
    await page.mouse.move(1900, 60);
    await page.evaluate(() => window.__bb!.step(60 * 60));
    await page.waitForTimeout(800);
    await shot(page, '110-night-plaza-asleep');
    // Rain by day.
    await at(11);
    await send({ type: 'set_weather', wind: 0, rain: true });
    await page.evaluate(() => window.__bb!.step(60 * 40));
    await page.waitForTimeout(4500);
    await shot(page, '111-rain');
    await closeUp(page, '112-rain-closeup', (await bugNamed(page, 'bug_ladybug_dot')).x, 8, 6, 3.4);
    // After the rain: a rainbow over the pond.
    await send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_rainbow' });
    await page.waitForTimeout(4500);
    await shot(page, '113-rainbow');
    // Wind.
    await send({ type: 'set_weather', wind: 2.2, rain: false });
    await page.waitForTimeout(4000);
    await shot(page, '114-wind');
    // Cloudy.
    await send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_cloudy' });
    await page.waitForTimeout(4500);
    await shot(page, '115-cloudy');
    // Shooting stars at night.
    await send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_shooting_stars' });
    await at(23, 300);
    await page.evaluate(() => window.__bb!.step(60 * 20));
    await page.waitForTimeout(250);
    await shot(page, '116-shooting-star');
    // The sundial, close up at noon and at midnight.
    await send({ type: 'set_weather', wind: 0, rain: false, weather: 'weather_clear' });
    const dial = (await page.evaluate(() => window.__bb!.fixture('fix_sundial')))!;
    await at(12);
    await closeUp(page, '117-sundial-noon', dial.x, dial.y, 4, 2.4);
    await at(0);
    await closeUp(page, '118-sundial-midnight', dial.x, dial.y, 4, 2.4);
    const vane = (await page.evaluate(() => window.__bb!.fixture('fix_weather_vane')))!;
    await scrollTo(page, vane.x - 4);
    await page.mouse.move(1900, 60);
    await at(10);
    const v = await toClient(page, vane.x, vane.y);
    for (let k = 0; k < 3; k++) {
      await page.mouse.click(v.x, v.y);
      await page.waitForTimeout(120);
    }
    await page.mouse.move(1900, 60);
    await page.waitForTimeout(1500);
    await shot(page, '119-weather-vane-gust');
    await closeUp(page, '120-weather-vane', vane.x + 0.5, vane.y + 1.2, 4, 4);
  } finally {
    await bb.close();
  }
});
