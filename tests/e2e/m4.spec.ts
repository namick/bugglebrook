import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAZA_X, bugNamed, clickSlot, content, entities, entity, launchApp, pressOn, toClient } from './app';

// M4 acceptance (game design doc, section 19): the needs AI, playing
// together, and the setup rule, driven with the real mouse and checked
// through window.__bb. Long stretches of bug life run through __bb.step so
// the tests stay quick on CI's software renderer.
test.setTimeout(180_000);

type Logged = { name: string; tick: number; payload: Record<string, unknown> };

const events = (page: Page, name: string): Promise<Logged[]> =>
  page.evaluate((n) => window.__bb!.events().filter((e) => e.name === n), name) as Promise<Logged[]>;

const step = (page: Page, n: number): Promise<void> => page.evaluate((k) => window.__bb!.step(k), n);

const setNeed = (page: Page, id: number, need: string, value: number): Promise<void> =>
  page.evaluate(
    ([i, n, v]) =>
      window.__bb!.send({ type: 'set_need', id: i as number, need: n as 'need_fun', value: v as number }),
    [id, need, value] as const,
  );

/** Spawn an item from the sky and wait for it to land. */
async function drop(page: Page, defId: string, x: number): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await page.evaluate(
    ([d, px]) => window.__bb!.send({ type: 'spawn', kind: 'item', defId: d!, x: px!, y: 6 }),
    [defId, x] as const,
  );
  let id = -1;
  await expect
    .poll(async () => {
      const e = (await entities(page)).find((v) => !before.has(v.id) && v.defId === defId);
      id = e?.id ?? -1;
      return !!e && Math.hypot(e.vx, e.vy) < 0.3 && e.y > 7;
    })
    .toBe(true);
  return id;
}

/** Carry a held thing to a world point with the real mouse, then let go gently. */
async function carryAndDrop(page: Page, from: { x: number; y: number }, x: number, y: number): Promise<void> {
  const to = await toClient(page, x, y);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.mouse.move(960, 80, { steps: 3 });
}

test('a new thing the player drops near a bug gets sniffed, and the bugs leave it be', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    // Nobody grabs it for a snack before the player gets to it.
    for (const b of (await entities(page)).filter((e) => e.kind === 'bug')) await content(page, b.id);
    const berry = await drop(page, 'item_berry_red', rollo.x + 3);
    const at = await pressOn(page, berry);
    await carryAndDrop(page, at, rollo.x + 2.5, 8.3);
    const placed = (await entity(page, berry))!;
    const placedAt = await page.evaluate(() => window.__bb!.tick());
    // Now a bug is peckish: it still must not eat the player's berry.
    await setNeed(page, rollo.id, 'need_hunger', 20);
    expect(placed.tags).toContain('tag_player_setup');
    const sniffed = async (): Promise<boolean> =>
      (await events(page, 'bug_inspected')).some((e) => e.payload.itemId === berry);
    // Within 30 s of sim time.
    for (let i = 0; i < 30 && !(await sniffed()); i++) await step(page, 60);
    expect(await sniffed()).toBe(true);
    // Sniffed in place, never eaten or carried off, even by a hungry bug.
    await step(page, 60 * 20);
    const after = (list: Logged[]): Logged[] =>
      list.filter((e) => e.payload.itemId === berry && e.tick > placedAt);
    expect(after(await events(page, 'bug_fed'))).toEqual([]);
    expect(after(await events(page, 'bug_picked_up'))).toEqual([]);
    expect(await entity(page, berry)).not.toBeNull();
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('a stack of three built with the mouse stays standing while the bugs go about their day', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const bugs = (await entities(page)).filter((e) => e.kind === 'bug');
    for (const b of bugs) await content(page, b.id);
    // Dot starts on the plaza's bottle cap: lift her off it first.
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    await carryAndDrop(page, await pressOn(page, dot.id), PLAZA_X + 3.2, 8.3);
    await page.waitForTimeout(600);
    // The plaza's own bottle cap is the base; two more are set on top of it.
    const base = (await entities(page)).find((e) => e.defId === 'item_bottle_cap' && e.x > PLAZA_X)!;
    const baseX = base.x;
    const caps = [base.id];
    for (let i = 1; i < 3; i++) {
      const before = new Set((await entities(page)).map((e) => e.id));
      await page.evaluate(
        ([x, y]) =>
          window.__bb!.send({ type: 'spawn', kind: 'item', defId: 'item_bottle_cap', x: x!, y: y! }),
        [baseX, base.y - i * 0.17 - 0.01] as const,
      );
      await expect
        .poll(async () => (await entities(page)).find((e) => !before.has(e.id))?.id ?? -1)
        .toBeGreaterThan(0);
      caps.push((await entities(page)).find((e) => !before.has(e.id))!.id);
      await page.waitForTimeout(300);
    }
    // The player sets the top one straight with the hand (press, hold a moment, let
    // go). One touched piece makes the whole stack the player's for good.
    for (const c of [caps[2]!]) {
      await pressOn(page, c);
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.mouse.move(960, 80, { steps: 2 });
      await page.waitForTimeout(300);
    }
    await expect
      .poll(async () => {
        const v = await Promise.all(caps.map((c) => entity(page, c)));
        return v[2]!.y < v[1]!.y && v[1]!.y < v[0]!.y && Math.abs(v[2]!.x - v[0]!.x) < 0.25;
      })
      .toBe(true);
    await step(page, 60);
    const before = await Promise.all(caps.map((c) => entity(page, c)));
    for (const b of before) expect(b!.tags).toContain('tag_player_setup');
    // Three minutes of bug life, with bugs bored and lonely enough to be up and about.
    for (const b of bugs) {
      await setNeed(page, b.id, 'need_fun', 30);
      await setNeed(page, b.id, 'need_social', 30);
    }
    for (let i = 0; i < 18; i++) await step(page, 600);
    const after = await Promise.all(caps.map((c) => entity(page, c)));
    after.forEach((a, i) => {
      const b = before[i]!;
      expect(Math.hypot(a!.x - b.x, a!.y - b.y), `cap ${i}`).toBeLessThan(0.08);
    });
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});

test('needs stay put while the game is paused', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__bb!.setPaused(true));
    const needs = async () =>
      (await entities(page)).filter((e) => e.kind === 'bug').map((e) => JSON.stringify(e.bug!.needs));
    const before = await needs();
    const tick = await page.evaluate(() => window.__bb!.tick());
    await page.waitForTimeout(1500);
    expect(await needs()).toEqual(before);
    expect(await page.evaluate(() => window.__bb!.tick())).toBe(tick);
    await page.evaluate(() => window.__bb!.setPaused(false));
    await page.waitForTimeout(800);
    expect(await needs()).not.toEqual(before);
  } finally {
    await bb.close();
  }
});

test('a click wakes a napping bug, groggy', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const glorp = await bugNamed(page, 'bug_snail_glorp');
    await content(page, glorp.id);
    await setNeed(page, glorp.id, 'need_energy', 8);
    // Frozen and stepped from here, so a slow machine sees the same nap: step until he nods off.
    await page.evaluate(() => window.__bb!.setPaused(true));
    const asleep = await page.evaluate((id) => {
      for (let i = 0; i < 60 * 60; i++) {
        window.__bb!.step(1);
        if (window.__bb!.entity(id)?.bug?.mode === 'st_sleep') return true;
      }
      return false;
    }, glorp.id);
    expect(asleep).toBe(true);
    await page.evaluate(() => window.__bb!.clearLogs());
    // Snoring: "Z"s drift up in real time.
    await page.waitForTimeout(600);
    const g = (await entity(page, glorp.id))!;
    const p = await toClient(page, g.x, g.y);
    await page.mouse.click(p.x, p.y);
    await page.evaluate(() => window.__bb!.frames(3));
    await page.evaluate(() => window.__bb!.setPaused(false));
    await expect.poll(async () => (await events(page, 'bug_woke')).length).toBeGreaterThan(0);
    const [woke] = await events(page, 'bug_woke');
    expect(woke!.payload).toMatchObject({ id: glorp.id, early: true });
    expect((await entity(page, glorp.id))!.bug!.groggy).toBe(true);
  } finally {
    await bb.close();
  }
});

test('lonely bugs chat with pictures in speech bubbles, and like each other more after', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    const dot = await bugNamed(page, 'bug_ladybug_dot');
    const rollo = await bugNamed(page, 'bug_pillbug_rollo');
    const all = (await entities(page)).filter((e) => e.kind === 'bug');
    for (const b of all) await content(page, b.id);
    for (const b of [dot, rollo]) await setNeed(page, b.id, 'need_social', 5);
    // Everyone's affinity with everyone before: whichever pair ends up chatting should like each other more.
    const defs = all.map((b) => b.defId);
    const affinities = (): Promise<Record<string, number>> =>
      page.evaluate((ds) => {
        const out: Record<string, number> = {};
        for (const a of ds) for (const b of ds) if (a < b) out[`${a}|${b}`] = window.__bb!.affinity(a, b);
        return out;
      }, defs);
    const aff0 = await affinities();
    let bubbles: { bugId: number; kind: string; pictos: readonly string[] }[] = [];
    for (let i = 0; i < 60; i++) {
      await step(page, 20);
      await page.waitForTimeout(30);
      const now = await page.evaluate(() => window.__bb!.bubbles());
      const speech = now.filter((b) => b.kind === 'speech' && (b.bugId === dot.id || b.bugId === rollo.id));
      if ((await events(page, 'bug_chatted')).length >= 2 && speech.length > 0) {
        bubbles = speech;
        break;
      }
    }
    const lines = await events(page, 'bug_socialized');
    expect(lines.length).toBeGreaterThan(0);
    expect(bubbles.length).toBeGreaterThan(0);
    expect(bubbles[0]!.pictos.length).toBeGreaterThan(0);
    // Play pays out when it ends: give it time.
    await step(page, 60 * 20);
    const chat = lines[0]!.payload as { id: number; partnerId: number };
    const defOf = (id: number): string => all.find((b) => b.id === id)!.defId;
    const key = [defOf(chat.id), defOf(chat.partnerId)].sort().join('|');
    const aff1 = await affinities();
    expect(aff1[key]).toBeGreaterThan(aff0[key]!);
  } finally {
    await bb.close();
  }
});

test('bugs left in the sleeping pond are doing something sensible when the camera comes back', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.mouse.move(960, 200);
    // Far right: the pond sleeps.
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(20);
    }
    await expect.poll(() => page.evaluate(() => window.__bb!.areaAsleep('area_puddle_pond'))).toBe(true);
    await step(page, 60 * 60 * 2);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(20);
    }
    await expect.poll(() => page.evaluate(() => window.__bb!.areaAsleep('area_puddle_pond'))).toBe(false);
    const skeet = await bugNamed(page, 'bug_waterstrider_skeet');
    expect(skeet.held).toBe(false);
    // Anything a free bug does is fine (it may already be eating the food it set off for); never held or stuck mid-fling.
    expect([
      'st_idle',
      'st_wander',
      'st_seek',
      'st_sleep',
      'st_use',
      'st_eat',
      'st_social',
      'st_landing',
      'st_airborne',
      'st_react',
    ]).toContain(skeet.bug!.mode);
    expect(skeet.x).toBeLessThan(PLAZA_X);
    expect(bb.errors).toEqual([]);
  } finally {
    await bb.close();
  }
});
