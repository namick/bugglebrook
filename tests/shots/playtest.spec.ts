import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLAZA_X,
  POND_X,
  clickSlot,
  clickUi,
  entities,
  entity,
  frames,
  freeze,
  glideFrames,
  jumpTo,
  launchApp,
  lookAt,
  pressFrozen,
  toClient,
  waitForScene,
} from '../e2e/app';
import type { EntityView, Launched, TestHook } from '../e2e/app';
import { sharpShots, worldClip } from './clip';

// A post-merge playtest: one scripted session as a curious 12-year-old
// would play it, from a new game through a save, a quit, and a reload.
// `pnpm shots -g "post-merge playtest"` writes /tmp/bb-shots/pt-*.png (or
// $BB_SHOTS_DIR) and pt-log.txt, which records what the game said at each
// beat through `window.__bb`. Beats that throw are logged and skipped, so
// one broken beat does not hide the rest.

const DIR = process.env.BB_SHOTS_DIR ?? '/tmp/bb-shots';
type Command = Parameters<TestHook['send']>[0];
const PORCH_X = 102.4;
const COMPOST_X = 134.4;

const log: string[] = [];
const note = (s: string): void => {
  log.push(s);
  writeFileSync(join(DIR, 'pt-log.txt'), `${log.join('\n')}\n`);
};

const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);

async function shot(page: Page, name: string, what: string): Promise<void> {
  await page.screenshot({ path: join(DIR, `pt-${name}.png`) });
  note(`  [shot] pt-${name}.png: ${what}`);
}

async function closeUp(page: Page, name: string, x: number, y: number, w = 6, h = 3.6): Promise<void> {
  const clip = await worldClip(page, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  await page.screenshot({ path: join(DIR, `pt-${name}.png`), clip });
  note(`  [shot] pt-${name}.png (close-up at ${x.toFixed(1)}, ${y.toFixed(1)})`);
}

async function spawn(
  page: Page,
  defId: string,
  x: number,
  y: number,
  kind: 'item' | 'bug' = 'item',
): Promise<number> {
  const before = new Set((await entities(page)).map((e) => e.id));
  await send(page, { type: 'spawn', kind, defId, x, y });
  await frames(page, 1);
  return (await entities(page)).find((e) => !before.has(e.id) && e.defId === defId)?.id ?? -1;
}

async function calm(page: Page, except: number[] = []): Promise<void> {
  for (const e of await entities(page))
    if (e.kind === 'bug' && !except.includes(e.id))
      for (const need of ['need_hunger', 'need_fun', 'need_social', 'need_clean', 'need_energy'] as const)
        await send(page, { type: 'set_need', id: e.id, need, value: 100 });
}

/** A few lines on the state of the game: errors, counts, sounds, events. */
async function status(bb: Launched, label: string): Promise<void> {
  const s = await bb.page.evaluate(() => {
    const h = window.__bb!;
    const all = h.entities();
    const evs = h.events();
    const counts: Record<string, number> = {};
    for (const e of evs) counts[e.name] = (counts[e.name] ?? 0) + 1;
    return {
      tick: h.tick(),
      hour: h.sky().hour.toFixed(2),
      weather: h.sky().weather,
      items: all.filter((e) => e.kind === 'item').length,
      bugs: all.filter((e) => e.kind === 'bug').length,
      nan: all.filter((e) => !Number.isFinite(e.x) || !Number.isFinite(e.y)).length,
      secrets: h.secrets().length,
      sfx: h.sfxLog().slice(-12),
      samples: h.sfxSamples().length,
      events: counts,
      badge: h.stamps()?.badge ?? null,
      trouble: h.saveTrouble(),
    };
  });
  note(
    `  [status ${label}] tick ${s.tick} hour ${s.hour} ${s.weather}; items ${s.items} bugs ${s.bugs} nan ${s.nan}; secrets ${s.secrets}; badge ${s.badge}; trouble ${JSON.stringify(s.trouble)}`,
  );
  note(`    sfx (last 12): ${s.sfx.join(' ')}; sample plays ${s.samples}`);
  note(`    events: ${JSON.stringify(s.events)}`);
  if (bb.errors.length > 0) note(`    ERRORS: ${JSON.stringify(bb.errors)}`);
}

/** Carry every bug within `r` of x over to `to` by hand (grab commands), and let it down there. */
async function clearBugs(page: Page, x: number, r: number, to: number): Promise<void> {
  for (const b of await entities(page)) {
    if (b.kind !== 'bug' || Math.abs(b.x - x) > r) continue;
    await send(page, { type: 'grab', x: b.x, y: b.y });
    await frames(page, 1);
    for (let i = 1; i <= 20; i++) {
      await send(page, { type: 'drag', x: b.x + ((to - b.x) * i) / 20, y: 7 });
      await frames(page, 1);
    }
    await send(page, { type: 'release', vx: 0, vy: 0 });
    await frames(page, 60);
  }
}

async function beat(bb: Launched, name: string, body: () => Promise<void>): Promise<void> {
  note(`\n== ${name}`);
  const t0 = Date.now();
  try {
    await body();
  } catch (err) {
    note(`  BEAT FAILED: ${String(err).split('\n').slice(0, 4).join(' | ')}`);
    await bb.page.mouse.up().catch(() => undefined);
  }
  await status(bb, name).catch((e) => note(`  status failed: ${String(e)}`));
  note(`  (${((Date.now() - t0) / 1000).toFixed(0)} s real)`);
}

const pose = (e: EntityView): string =>
  `${e.defId.replace('item_', '')}@(${e.x.toFixed(2)},${e.y.toFixed(2)}) a${e.angle.toFixed(2)}`;

test('post-merge playtest', async () => {
  test.setTimeout(3_600_000);
  mkdirSync(DIR, { recursive: true });
  let bb = await launchApp();
  const userData = bb.userData;
  let page = bb.page;
  sharpShots(page);
  const ids: Record<string, number> = {};
  try {
    await beat(bb, '01 menu and the first scene', async () => {
      await waitForScene(page, 'menu');
      await page.waitForTimeout(1500);
      await shot(page, '01-menu', 'the main menu');
      await page.evaluate(() => window.__bb!.enableIntro(true));
      await clickSlot(page, 0);
      await page.mouse.move(640, 60);
      const zooms: string[] = [];
      for (const [t, name] of [
        [0.5, '02-intro-fade'],
        [2.5, '03-intro-close'],
        [5, '04-intro-arrived'],
      ] as const) {
        await page.waitForTimeout(t === 0.5 ? 500 : t === 2.5 ? 2000 : 2500);
        const z = await page.evaluate(() => ({ zoom: window.__bb!.viewZoom(), intro: window.__bb!.intro() }));
        zooms.push(`${name}: ${JSON.stringify(z)}`);
        await shot(page, name, `first scene ${t}s in`);
      }
      note(`  zoom: ${zooms.join(' ; ')}`);
    });

    await beat(bb, '02 feed Dot her berry with the real mouse', async () => {
      const dot = (await entities(page)).find((e) => e.defId === 'bug_ladybug_dot')!;
      ids.dot = dot.id;
      note(`  Dot mode ${dot.bug?.mode}`);
      const at = await toClient(page, dot.x, dot.y - 0.4);
      await page.mouse.move(at.x, at.y, { steps: 6 });
      await page.waitForTimeout(1200);
      const berry = (await entities(page)).find((e) => e.defId === 'item_berry_red' && !e.held)!;
      const b = await toClient(page, berry.x, berry.y);
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.mouse.down();
      const mouth = (await page.evaluate((id) => window.__bb!.mouthOf(id), dot.id))!;
      const m = await toClient(page, mouth.x, mouth.y);
      await page.mouse.move(m.x, m.y - 10, { steps: 12 });
      await page.waitForTimeout(400);
      await shot(page, '05-holding-berry', 'holding the berry at Dot');
      await page.mouse.up();
      await page.waitForTimeout(1500);
      await shot(page, '06-fed', 'Dot fed');
      const evs = await page.evaluate(() =>
        window.__bb!.events().filter((e) => ['bug_fed', 'bug_reacted', 'bug_woke'].includes(e.name)),
      );
      note(`  feed events: ${JSON.stringify(evs.map((e) => [e.name, e.payload]))}`);
      note(`  voices: ${JSON.stringify(await page.evaluate(() => window.__bb!.voiceLog().slice(-5)))}`);
      note(
        `  sample plays: ${JSON.stringify(await page.evaluate(() => window.__bb!.sfxSamples().slice(-6)))}`,
      );
      note(`  ambience: ${JSON.stringify(await page.evaluate(() => window.__bb!.ambience()))}`);
    });

    await beat(bb, '03 fling a pebble and a bug', async () => {
      await freeze(page, true);
      const pebble = (await entities(page)).find(
        (e) => e.defId === 'item_pebble' && !e.held && Math.abs(e.x - (ids.dot ? 0 : 0)) >= 0,
      )!;
      const cam = await page.evaluate(() => window.__bb!.camera());
      note(`  camera ${JSON.stringify(cam)}; pebble ${pose(pebble)}`);
      const from = await pressFrozen(page, pebble.id);
      await glideFrames(page, from, 40, -40, 2, 1);
      await glideFrames(page, { x: from.x + 40, y: from.y - 40 }, 260, -220, 3, 1);
      await page.mouse.up();
      await frames(page, 12);
      await shot(page, '07-pebble-flies', 'a flung pebble in the air');
      await frames(page, 120);
      const p = (await entity(page, pebble.id))!;
      note(`  pebble after 2 s: ${pose(p)} v(${p.vx.toFixed(2)},${p.vy.toFixed(2)})`);
      // Fling Rollo.
      const rollo = (await entities(page)).find((e) => e.defId === 'bug_pillbug_rollo')!;
      ids.rollo = rollo.id;
      const r0 = await pressFrozen(page, rollo.id);
      await glideFrames(page, r0, 30, -60, 2, 1);
      await glideFrames(page, { x: r0.x + 30, y: r0.y - 60 }, 200, -200, 3, 1);
      await page.mouse.up();
      await frames(page, 15);
      await shot(page, '08-rollo-flung', 'Rollo flung');
      await frames(page, 180);
      const r = (await entity(page, rollo.id))!;
      note(
        `  Rollo after 3 s: mode ${r.bug?.mode} at (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) reaction ${JSON.stringify(r.bug?.reaction)}`,
      );
      await shot(page, '09-rollo-landed', 'Rollo after landing');
    });

    // Piles: the settling change. A heap of mixed things, left to rest.
    const PILE = PLAZA_X + 29.4;
    const pile: number[] = [];
    await beat(bb, '04 a pile of things, left to settle', async () => {
      await jumpTo(page, PILE - 9.6);
      await calm(page);
      const defs = [
        'item_pebble',
        'item_seed_sunflower',
        'item_cork',
        'item_button',
        'item_sugar_cube',
        'item_berry_red',
        'item_twig',
        'item_leaf',
        'item_bottle_cap',
        'item_pebble',
        'item_seed_sunflower',
        'item_cork',
        'item_button',
        'item_sugar_cube',
        'item_twig',
        'item_pebble',
        'item_seed_sunflower',
        'item_cork',
        'item_button',
        'item_sugar_cube',
      ];
      for (let i = 0; i < defs.length; i++) {
        const id = await spawn(page, defs[i]!, PILE + ((i % 5) - 2) * 0.22, 5.2 - Math.floor(i / 5) * 0.6);
        if (id > 0) pile.push(id);
        await frames(page, 6);
      }
      note(`  spawned ${pile.length} of ${defs.length}`);
      await frames(page, 60);
      await shot(page, '10-pile-landing', 'the pile one second after the last thing dropped');
      await frames(page, 240);
      const views = (await entities(page)).filter((e) => pile.includes(e.id));
      const still = views.filter((e) => e.vx === 0 && e.vy === 0 && e.av === 0).length;
      note(
        `  after 5 s: ${still}/${views.length} exactly still (settled); spread x ${Math.min(...views.map((e) => e.x)).toFixed(2)}..${Math.max(...views.map((e) => e.x)).toFixed(2)}`,
      );
      note(
        `  highest: ${views
          .sort((a, b) => a.y - b.y)
          .slice(0, 4)
          .map(pose)
          .join(' ')}`,
      );
      await page.mouse.move(10, 10);
      await shot(page, '11-pile-rest', 'the pile at rest');
      await closeUp(page, '12-pile-close', PILE, 7.6, 5, 3);
    });

    await beat(bb, '05 poke the pile, and pull a thing out from under it', async () => {
      const views = (await entities(page)).filter((e) => pile.includes(e.id));
      const top = views.sort((a, b) => a.y - b.y)[0]!;
      const before = Object.fromEntries(views.map((e) => [e.id, e]));
      const at = await toClient(page, top.x, top.y);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await frames(page, 2);
      await page.mouse.up();
      await frames(page, 30);
      const poked = await page.evaluate(() =>
        window
          .__bb!.events()
          .filter((e) => e.name.includes('poke'))
          .slice(-3),
      );
      const t1 = (await entity(page, top.id))!;
      note(`  poked top ${pose(top)} -> ${pose(t1)}; events ${JSON.stringify(poked.map((e) => e.name))}`);
      // Pull the lowest middle thing out sideways.
      const now = (await entities(page)).filter((e) => pile.includes(e.id));
      const low = now.filter((e) => Math.abs(e.x - PILE) < 0.35).sort((a, b) => b.y - a.y)[0]!;
      const above = now.filter((e) => e.id !== low.id && Math.abs(e.x - low.x) < 0.4 && e.y < low.y - 0.1);
      note(`  pulling ${pose(low)}; above it: ${above.map(pose).join(' ')}`);
      const g = await pressFrozen(page, low.id);
      await glideFrames(page, g, -160, 0, 16, 2);
      await frames(page, 6);
      await shot(page, '13-pile-pulled', 'one thing pulled out from the bottom of the pile');
      await page.mouse.up();
      await frames(page, 120);
      const after = (await entities(page)).filter((e) => above.some((a) => a.id === e.id));
      for (const a of after) {
        const b = before[a.id] ?? a;
        note(`    above-thing ${pose(b)} -> ${pose(a)} dy ${(a.y - b.y).toFixed(2)}`);
      }
      // Anything left hanging: not moving, not supported (no thing below within reach, off the ground).
      const all = await entities(page);
      const ground = Math.max(...all.filter((e) => pile.includes(e.id)).map((e) => e.y));
      const floaters = all.filter(
        (e) =>
          pile.includes(e.id) &&
          e.y < ground - 0.5 &&
          !all.some((o) => o.id !== e.id && Math.abs(o.x - e.x) < 0.45 && o.y > e.y && o.y - e.y < 0.55),
      );
      note(`  possibly hanging in the air: ${floaters.map(pose).join(' ') || 'none'}`);
      await page.mouse.move(10, 10);
      await closeUp(page, '14-pile-after-pull', PILE, 7.6, 5, 3);
    });

    await beat(bb, '06 a hungry bug walks through the pile to food', async () => {
      // Rollo is hungry, and his favorite food lies on the far side of the pile.
      const rollo = ids.rollo!;
      await calm(page, [rollo]);
      await send(page, { type: 'set_need', id: rollo, need: 'need_hunger', value: 5 });
      const r = (await entity(page, rollo))!;
      // Carry him to the near side of the pile by hand.
      await send(page, { type: 'grab', x: r.x, y: r.y });
      await frames(page, 1);
      await send(page, { type: 'drag', x: PILE - 2.6, y: 7.4 });
      await frames(page, 50);
      await send(page, { type: 'release', vx: 0, vy: 0 });
      await frames(page, 60);
      const banana = await spawn(page, 'item_rotten_banana_bit', PILE + 2.4, 6.5);
      ids.banana = banana;
      const before = (await entities(page)).filter((e) => pile.includes(e.id));
      for (let i = 0; i < 12; i++) {
        await frames(page, 30);
        const rv = (await entity(page, rollo))!;
        if (i % 2 === 0 || Math.abs(rv.x - PILE) < 0.6) {
          await page.mouse.move(10, 10);
          await closeUp(page, `15-walk-${String(i).padStart(2, '0')}`, PILE, 7.4, 6, 3.4);
        }
        note(
          `    t${(i + 1) * 0.5}s Rollo ${rv.bug?.mode}/${rv.bug?.action} at (${rv.x.toFixed(2)}, ${rv.y.toFixed(2)})`,
        );
        if (!(await entity(page, banana))) break;
      }
      const after = (await entities(page)).filter((e) => pile.includes(e.id));
      const moved = after.filter((a) => {
        const b = before.find((x) => x.id === a.id)!;
        return Math.hypot(a.x - b.x, a.y - b.y) > 0.05;
      });
      note(`  pile things moved by the walk: ${moved.length}/${after.length}`);
      note(`  banana eaten: ${(await entity(page, banana)) === null}`);
    });

    await beat(bb, '07 a seesaw with a cork on one end, and a pebble dropped on the other', async () => {
      // Staged on flat ground left of the stump, with the bugs carried clear and loose things taken away.
      const SAW = PLAZA_X + 9.6;
      await jumpTo(page, SAW - 9.6);
      await calm(page);
      await clearBugs(page, SAW, 4, SAW - 7);
      for (const e of await entities(page))
        if (e.kind === 'item' && Math.abs(e.x - SAW) < 3.5) await send(page, { type: 'despawn', id: e.id });
      await frames(page, 30);
      const saw = await spawn(page, 'item_popsicle_seesaw', SAW, 7.6);
      await frames(page, 120);
      const s = (await entity(page, saw))!;
      note(`  seesaw ${pose(s)} pivot ${JSON.stringify(s.toy)}`);
      const cork = await spawn(page, 'item_cork', s.x + 0.9, s.y - 0.6);
      await frames(page, 300);
      const s1 = (await entity(page, saw))!;
      note(
        `  with cork after 5 s: seesaw angle ${s1.angle.toFixed(3)}; cork ${pose((await entity(page, cork))!)} still ${JSON.stringify((await entity(page, cork))!.vx)}`,
      );
      await closeUp(page, '16-seesaw-loaded', s.x, s.y - 0.4, 5, 3);
      // Anything that rolled in under the plank meanwhile goes too.
      for (const e of await entities(page))
        if (e.kind === 'item' && e.id !== saw && e.id !== cork && Math.abs(e.x - s.x) < 2.5)
          await send(page, { type: 'despawn', id: e.id });
      // A pebble carried over the high end by hand and let go.
      const pebble = await spawn(page, 'item_pebble', s.x - 3, 7.6);
      await frames(page, 60);
      const from = await pressFrozen(page, pebble);
      const high = await toClient(page, s.x - 1.2, s.y - 1.4);
      await glideFrames(page, from, 0, high.y - from.y, 6, 2);
      await glideFrames(page, { x: from.x, y: high.y }, high.x - from.x, 0, 6, 2);
      await frames(page, 20);
      await page.waitForTimeout(150);
      await page.mouse.up();
      let minA = s1.angle;
      for (let i = 0; i < 24; i++) {
        await frames(page, 5);
        minA = Math.min(minA, (await entity(page, saw))!.angle);
      }
      const s2 = (await entity(page, saw))!;
      note(
        `  pebble dropped on the high end: seesaw angle ${s1.angle.toFixed(3)} -> min ${minA.toFixed(3)} end ${s2.angle.toFixed(3)}; pebble ${pose((await entity(page, pebble))!)}; cork ${pose((await entity(page, cork))!)}`,
      );
      await page.mouse.move(10, 10);
      await closeUp(page, '17-seesaw-after-drop', s.x, s.y - 0.4, 5, 3);
    });

    await beat(bb, '08 a hat let go over a napping bug’s body', async () => {
      const at0 = PLAZA_X + 20;
      await jumpTo(page, at0 - 8);
      const glorp = (await entities(page)).find((e) => e.defId === 'bug_snail_glorp')!;
      // Carry Glorp over by hand, then let him nap.
      await send(page, { type: 'grab', x: glorp.x, y: glorp.y });
      await frames(page, 1);
      await send(page, { type: 'drag', x: at0, y: 7.4 });
      await frames(page, 60);
      await send(page, { type: 'release', vx: 0, vy: 0 });
      await calm(page);
      await send(page, { type: 'set_need', id: glorp.id, need: 'need_energy', value: 3 });
      await frames(page, 150);
      const hat = await spawn(page, 'item_hat_tiny_top_hat', at0 - 3, 6.5);
      await frames(page, 60);
      const from = await pressFrozen(page, hat);
      const g = (await entity(page, glorp.id))!;
      const over = await toClient(page, g.x, g.y - 0.75);
      const above = await toClient(page, g.x, g.y - 2);
      await glideFrames(page, from, 0, above.y - from.y, 6, 2);
      await glideFrames(page, { x: from.x, y: above.y }, above.x - from.x, 0, 8, 2);
      await glideFrames(page, above, over.x - above.x, over.y - above.y, 6, 2);
      await frames(page, 12);
      await closeUp(page, '18-hat-over-glorp', g.x, g.y - 0.6, 4, 2.6);
      await page.mouse.up();
      await frames(page, 30);
      const now = (await entity(page, glorp.id))!;
      note(
        `  Glorp ${now.bug?.mode} wearing ${JSON.stringify(now.bug && (now.bug as { wearing?: unknown }).wearing)}`,
      );
      ids.glorp = glorp.id;
      ids.hat = hat;
      await page.mouse.move(10, 10);
      await closeUp(page, '19-hat-on-glorp', g.x, g.y - 0.6, 4, 2.6);
    });

    await beat(bb, '09 the trash can and the whistle', async () => {
      const can = PLAZA_X + 33;
      await jumpTo(page, can - 9.6);
      const mouth = (await page.evaluate(() => window.__bb!.trash()))!.mouth;
      // Feed it a pebble.
      const pebble = await spawn(page, 'item_pebble', can - 3, 6.5);
      await frames(page, 60);
      const p0 = await pressFrozen(page, pebble);
      const over = await toClient(page, mouth.x, mouth.y - 0.45);
      await glideFrames(page, p0, 0, over.y - p0.y - 60, 5, 2);
      await glideFrames(page, { x: p0.x, y: over.y - 60 }, over.x - p0.x, 60, 8, 2);
      await frames(page, 10);
      await page.mouse.up();
      await frames(page, 3);
      await closeUp(page, '20-can-chomp', can, 7.5);
      await frames(page, 60);
      note(`  trash: ${JSON.stringify(await page.evaluate(() => window.__bb!.trash()))}`);
      // Then the whistle, into the can.
      const wid = (await page.evaluate(() => window.__bb!.tidy())).whistle;
      note(`  whistle id ${wid}`);
      if (wid !== null) {
        const w0 = await pressFrozen(page, wid);
        await glideFrames(page, w0, 0, over.y - w0.y - 60, 5, 2);
        await glideFrames(page, { x: w0.x, y: over.y - 60 }, over.x - w0.x, 60, 8, 2);
        await frames(page, 10);
        await page.mouse.up();
        await frames(page, 20);
        await closeUp(page, '21-can-spits-whistle', can, 7.3, 7, 4.4);
        await frames(page, 60);
        const w = await entity(page, wid);
        note(
          `  whistle after: ${w ? pose(w) : 'GONE'}; trash ${JSON.stringify(await page.evaluate(() => window.__bb!.trash()))}`,
        );
        // Clutter, then blow the whistle.
        for (const [d, dx] of [
          ['item_mint_leaf', -7],
          ['item_leaf', -4.2],
          ['item_twig', 2.6],
          ['item_cork', 3.6],
        ] as const)
          await spawn(page, d, can + dx, 6.5);
        await frames(page, 90);
        const wv = (await entity(page, wid))!;
        await jumpTo(page, wv.x - 9.6);
        const wc = await toClient(page, wv.x, wv.y);
        await page.mouse.move(wc.x, wc.y);
        await page.mouse.down();
        await frames(page, 2);
        await page.mouse.up();
        await frames(page, 20);
        await shot(page, '22-whistle-swoosh', 'the whistle blown');
        await frames(page, 150);
        note(`  tidy: ${JSON.stringify(await page.evaluate(() => window.__bb!.tidy()))}`);
        await shot(page, '23-tidied', 'after the whistle');
      }
      const left = (await entities(page)).filter((e) => pile.includes(e.id));
      note(`  pile things still in the world: ${left.length}/${pile.length}`);
    });

    await beat(bb, '10 the pond: a splash and a float', async () => {
      await freeze(page, false);
      await lookAt(page, POND_X + 6);
      await freeze(page, true);
      const water = (await page.evaluate(() => window.__bb!.water())).surfaces.find(
        (s) => s.areaId === 'area_puddle_pond',
      )!;
      note(`  pond ${JSON.stringify(water)}`);
      await page.evaluate(() => window.__bb!.clearLogs());
      const cork = await spawn(page, 'item_cork', water.left + 5, 4);
      const pebble = await spawn(page, 'item_pebble', water.left + 8, 4);
      await frames(page, 40);
      await shot(page, '24-pond-splash', 'a cork and a pebble dropped in the pond');
      await frames(page, 180);
      const c = (await entity(page, cork))!;
      const p = (await entity(page, pebble))!;
      note(
        `  cork ${pose(c)} submerged ${c.submerged.toFixed(2)}; pebble ${pose(p)} submerged ${p.submerged.toFixed(2)}`,
      );
      note(`  sfx: ${JSON.stringify(await page.evaluate(() => window.__bb!.sfxLog()))}`);
      note(`  samples: ${JSON.stringify(await page.evaluate(() => window.__bb!.sfxSamples().slice(-6)))}`);
      note(`  ambience: ${JSON.stringify(await page.evaluate(() => window.__bb!.ambience()))}`);
      note(`  music: ${JSON.stringify(await page.evaluate(() => window.__bb!.music()))}`.slice(0, 600));
      await shot(page, '25-pond-after', 'the pond a few seconds later');
    });

    await beat(bb, '11 night in the flowerbed, sleeping bugs, and a wake', async () => {
      await send(page, { type: 'unlock', area: 'area_flowerbed_stage' });
      await frames(page, 2);
      await freeze(page, false);
      await lookAt(page, 4);
      await freeze(page, true);
      await shot(page, '26-flowerbed-day', 'the flowerbed by day, with its grouped stage props');
      await send(page, { type: 'set_time', hour: 20.75 });
      await frames(page, 60 * 30);
      await shot(page, '27-flowerbed-dusk', 'the flowerbed at 21:15');
      await send(page, { type: 'set_time', hour: 23 });
      await frames(page, 60 * 60);
      await freeze(page, false);
      await page.waitForTimeout(1500);
      await freeze(page, true);
      await page.mouse.move(10, 10);
      await shot(page, '28-flowerbed-night', 'the flowerbed at about 23:00');
      const bugs = (await entities(page)).filter((e) => e.kind === 'bug' && !e.bug?.pending);
      note(
        `  bugs at night: ${bugs.map((b) => `${b.defId.replace('bug_', '')}:${b.bug?.mode}${b.asleep ? '(area asleep)' : ''}`).join(' ')}`,
      );
      note(`  look: ${JSON.stringify(await page.evaluate(() => window.__bb!.look()))}`);
      note(`  weatherStats: ${JSON.stringify(await page.evaluate(() => window.__bb!.weatherStats()))}`);
      note(`  places: ${JSON.stringify(await page.evaluate(() => window.__bb!.places()))}`);
      // Wake a sleeper with a click: the day bugs sleep in the plaza.
      await freeze(page, false);
      await lookAt(page, PLAZA_X + 2);
      await freeze(page, true);
      await frames(page, 30);
      const cam = await page.evaluate(() => window.__bb!.camera());
      const bugsNow = (await entities(page)).filter((e) => e.kind === 'bug' && !e.bug?.pending);
      const sleeper = bugsNow.find((b) => b.bug?.mode === 'st_sleep' && b.x > cam.x + 1 && b.x < cam.x + 18);
      if (sleeper) {
        await page.evaluate(() => window.__bb!.clearLogs());
        const p = await toClient(page, sleeper.x, sleeper.y);
        await page.mouse.click(p.x, p.y);
        await frames(page, 30);
        await closeUp(page, '29-woken', sleeper.x, sleeper.y - 0.5, 5, 3);
        const s1 = (await entity(page, sleeper.id))!;
        note(
          `  woke ${sleeper.defId}: mode ${s1.bug?.mode} groggy ${s1.bug?.groggy}; events ${JSON.stringify((await page.evaluate(() => window.__bb!.events())).map((e) => e.name))}`,
        );
        await frames(page, 40 * 60);
        note(`  40 s later: ${(await entity(page, sleeper.id))!.bug?.mode}`);
        await frames(page, 50 * 60);
        note(`  90 s later: ${(await entity(page, sleeper.id))!.bug?.mode}`);
      } else note('  no sleeping bug in view');
      note(`  ambience: ${JSON.stringify(await page.evaluate(() => window.__bb!.ambience()))}`);
      // The plaza pile at night, from far away and back.
      await freeze(page, false);
      await lookAt(page, PILE - 9.6);
      await freeze(page, true);
      await frames(page, 30);
      const views = (await entities(page)).filter((e) => pile.includes(e.id));
      note(
        `  pile at night after the area slept: ${views.length} things, still ${views.filter((e) => e.vx === 0 && e.vy === 0).length}`,
      );
      await page.mouse.move(10, 10);
      await shot(page, '30-plaza-night', 'the plaza at night, back from the flowerbed');
      await send(page, { type: 'set_time', hour: 10 });
      await frames(page, 60);
    });

    await beat(bb, '12 a craft at the bench and a brew in the cauldron', async () => {
      for (const area of ['area_under_porch', 'area_compost_lab'] as const)
        await send(page, { type: 'unlock', area });
      await frames(page, 2);
      await calm(page);
      const p = (await page.evaluate(() => window.__bb!.m8Points()))!;
      await jumpTo(page, PORCH_X + 9.4);
      await frames(page, 30);
      const onTable = (side: -1 | 1): [number, number] => [
        side < 0 ? p.trays[0]!.x - 0.62 : p.trays[2]!.x + 0.62,
        p.trays[0]!.y - 0.35,
      ];
      const twig = await spawn(page, 'item_twig', ...onTable(-1));
      const band = await spawn(page, 'item_rubber_band', ...onTable(1));
      await frames(page, 30);
      const carry = async (id: number, x: number, y: number): Promise<void> => {
        const from = await pressFrozen(page, id);
        const up = await toClient(page, x, y - 1.2);
        const at = await glideFrames(page, from, 0, up.y - from.y, 3, 3);
        const over = await glideFrames(page, at, up.x - at.x, 0, 4, 3);
        const to = await toClient(page, x, y);
        await glideFrames(page, over, to.x - over.x, to.y - over.y, 2, 3);
        await frames(page, 12);
        await page.waitForTimeout(150);
        await page.mouse.up();
        await frames(page, 2);
      };
      await carry(twig, p.trays[0]!.x, p.trays[0]!.y - 0.4);
      await carry(band, p.trays[1]!.x, p.trays[1]!.y - 0.4);
      note(`  bench: ${JSON.stringify(await page.evaluate(() => window.__bb!.bench()))}`);
      await shot(page, '31-bench-loaded', 'twig and rubber band in the trays');
      const knob = await toClient(page, p.lever.x, p.lever.y);
      await page.mouse.move(knob.x, knob.y);
      await page.mouse.down();
      await frames(page, 1);
      await glideFrames(page, knob, 20, 110, 8, 1);
      await page.mouse.up();
      await frames(page, 50);
      await shot(page, '32-bench-rattle', 'the bench mid-craft');
      await frames(page, 60);
      await page.mouse.move(10, 10);
      await shot(page, '33-bench-made', 'what the bench made');
      note(
        `  bench after: ${JSON.stringify(await page.evaluate(() => window.__bb!.bench()))}; slingshots ${(await entities(page)).filter((e) => e.defId === 'item_slingshot_twig').length}`,
      );
      // The cauldron.
      await jumpTo(page, COMPOST_X - 1);
      await frames(page, 30);
      const cap = await spawn(page, 'item_mushroom_cap', p.cauldron.x - 2.2, 7.2);
      await frames(page, 40);
      const from = await pressFrozen(page, cap);
      const over = await toClient(page, p.cauldron.x, p.cauldron.y - 0.5);
      await glideFrames(page, from, 0, over.y - from.y, 2, 2);
      await glideFrames(page, { x: from.x, y: over.y }, over.x - from.x, 0, 3, 2);
      await frames(page, 12);
      await page.waitForTimeout(150);
      await page.mouse.up();
      await frames(page, 2);
      const mid = await toClient(page, p.cauldron.x, p.cauldron.y);
      const rx = (await toClient(page, p.cauldron.x + 0.9, p.cauldron.y)).x - mid.x;
      await page.mouse.move(mid.x + rx, mid.y);
      await page.mouse.down();
      await frames(page, 1);
      for (let i = 1; i <= 18; i++) {
        const a = (i / 8) * Math.PI * 2;
        await page.mouse.move(mid.x + Math.cos(a) * rx, mid.y + (Math.sin(a) * rx) / 2);
        await frames(page, 1);
      }
      await page.mouse.up();
      await frames(page, 20);
      await shot(page, '34-cauldron-bubbling', 'the cauldron stirred');
      await frames(page, 64);
      await page.mouse.move(10, 10);
      await shot(page, '35-cauldron-potion', 'the brew');
      note(
        `  cauldron: ${JSON.stringify(await page.evaluate(() => window.__bb!.cauldron()))}; giant potions ${(await entities(page)).filter((e) => e.defId === 'item_potion_giant').length}`,
      );
    });

    await beat(bb, '13 the journal', async () => {
      await freeze(page, false);
      note(`  stamps: ${JSON.stringify(await page.evaluate(() => window.__bb!.stamps()))}`);
      await shot(page, '36-journal-button', 'the journal button and its badge');
      await clickUi(page, 'journal');
      await page.waitForFunction(() => window.__bb!.journal()?.open && !window.__bb!.journal()?.busy, null, {
        timeout: 30_000,
      });
      const j = await page.evaluate(() => window.__bb!.journal());
      note(`  journal: ${JSON.stringify({ ...j, shown: j?.shown.length })}`);
      await shot(page, '37-journal-open', 'the journal open');
      for (const tab of ['page_items', 'page_bugs', 'page_secrets'] as const) {
        await clickUi(page, `journal_tab_${tab}`).catch((e) =>
          note(`  tab ${tab}: ${String(e).slice(0, 120)}`),
        );
        await page
          .waitForFunction(() => !window.__bb!.journal()?.busy, null, { timeout: 30_000 })
          .catch(() => undefined);
        await shot(page, `38-journal-${tab}`, `the journal's ${tab} tab`);
        const jj = await page.evaluate(() => window.__bb!.journal());
        note(
          `  ${tab}: page ${jj?.page} shown ${jj?.shown.length} new ${jj?.newCount} fresh ${JSON.stringify(jj?.fresh)}`,
        );
      }
      await clickUi(page, 'journal_close');
      await page.waitForTimeout(1500);
      note(`  after close: ${JSON.stringify(await page.evaluate(() => window.__bb!.stamps()))}`);
    });

    // Remember the world, then save, quit to the menu, quit the app, and come back.
    let snapshot: EntityView[] = [];
    let tickAt = 0;
    await beat(bb, '14 save, quit to the menu, quit the app', async () => {
      await page.evaluate(() => window.__bb!.saveNow());
      snapshot = await entities(page);
      tickAt = await page.evaluate(() => window.__bb!.tick());
      note(`  slots: ${JSON.stringify(await page.evaluate(() => window.__bb!.listSlots()))}`.slice(0, 500));
      await clickUi(page, 'pause');
      await page.waitForTimeout(800);
      await shot(page, '39-paused', 'the pause board');
      await clickUi(page, 'to_menu');
      await waitForScene(page, 'menu');
      await page.waitForTimeout(1500);
      await shot(page, '40-menu-after', 'the menu with slot 1 played');
      note(
        `  locks ${JSON.stringify(await page.evaluate(() => window.__bb!.slotLocks()))} pictures ${JSON.stringify(await page.evaluate(() => window.__bb!.slotPictures()))} problems ${JSON.stringify(await page.evaluate(() => window.__bb!.saveProblems()))}`,
      );
      // Back in, play on a moment, then quit the app the way Cmd+Q does.
      await clickSlot(page, 0);
      await page.waitForTimeout(3000);
      snapshot = await entities(page);
      tickAt = await page.evaluate(() => window.__bb!.tick());
      const closed = bb.app.waitForEvent('close');
      void bb.app.evaluate(({ app }) => app.quit()).catch(() => undefined);
      await closed;
      note(`  quit at tick ${tickAt} with ${snapshot.length} entities`);
      const { readdirSync } = await import('node:fs');
      note(`  saves dir: ${JSON.stringify(readdirSync(join(userData, 'saves')).sort())}`);
    });

    await beat(bb, '15 relaunch and reopen the slot', async () => {
      bb = await launchApp(userData);
      page = bb.page;
      sharpShots(page);
      await waitForScene(page, 'menu');
      await page.waitForTimeout(1500);
      await shot(page, '41-menu-relaunch', 'the menu after a relaunch');
      await clickSlot(page, 0);
      await page.waitForTimeout(1500);
      await shot(page, '42-reloaded', 'the slot reopened');
      const now = await entities(page);
      const tick = await page.evaluate(() => window.__bb!.tick());
      const byId = new Map(now.map((e) => [e.id, e]));
      const missing = snapshot.filter((e) => !byId.has(e.id) && e.pocket === undefined);
      const added = now.filter((e) => !snapshot.some((s) => s.id === e.id));
      const moved = snapshot.filter((e) => {
        const n = byId.get(e.id);
        return n && e.kind === 'item' && Math.hypot(n.x - e.x, n.y - e.y) > 0.5;
      });
      note(
        `  tick ${tickAt} -> ${tick}; entities ${snapshot.length} -> ${now.length}; missing ${missing.map((e) => e.defId).join(' ') || 'none'}; added ${added.map((e) => e.defId).join(' ') || 'none'}; items moved >0.5 m: ${moved.map((e) => e.defId).join(' ') || 'none'}`,
      );
      if (ids.glorp)
        note(
          `  Glorp wearing ${JSON.stringify((byId.get(ids.glorp)?.bug as { wearing?: unknown } | undefined)?.wearing)}`,
        );
      note(`  sky ${JSON.stringify(await page.evaluate(() => window.__bb!.sky()))}`);
      note(`  log tail: see userData/logs`);
      await freeze(page, true);
      await frames(page, 120);
      const pileNow = (await entities(page)).filter((e) => pile.includes(e.id));
      note(
        `  pile after reload and 2 s: ${pileNow.length} things, still ${pileNow.filter((e) => e.vx === 0 && e.vy === 0).length}`,
      );
      await freeze(page, false);
    });
  } finally {
    note(`\nerrors: ${JSON.stringify(bb.errors)}`);
    await bb.close();
  }
});
