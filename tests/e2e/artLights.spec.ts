import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BuiltAsset } from '../../scripts/art/build.ts';
import { buildAsset, toArtPack } from '../../scripts/art/build.ts';
import type { RigFile } from '../../src/renderer/src/art/rigFile';
import {
  PLAZA_X,
  chooseArtSet,
  clickUi,
  content,
  entities,
  entity,
  frames,
  glideFrames,
  jumpTo,
  launchApp,
  openFrozen,
  pressFrozen,
  waitForScene,
} from './app';
import type { TestHook } from './app';

// An art set's night lights (a bug's .lights.json) in the world. The crude
// test art pack stands in for a set, with lights of its own on Dot and Rollo.

const FIXTURES = join(import.meta.dirname, 'fixtures/art');
const DOT = 'bug_ladybug_dot';
const ROLLO = 'bug_pillbug_rollo';
const TEAL = 0x40e0d0;
const PINK = 0xff66cc;
const AMBER = 0xffaa00;
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

const rigOf = (id: string): RigFile =>
  JSON.parse(readFileSync(join(FIXTURES, `${id}.rig.json`), 'utf8')) as RigFile;

/** A fixture bug with a light on the pivot of each part named, in that color. */
function lit(id: string, lights: [part: string, color: number][] = []): BuiltAsset {
  const rig = rigOf(id);
  const file = {
    lights: lights.map(([part, color]) => {
      const p = rig.parts.find((q) => q.name === part)!.pivot;
      return { part, x: p.x, y: p.y, r: 80, color: hex(color) };
    }),
  };
  const built = buildAsset(new Uint8Array(readFileSync(join(FIXTURES, `${id}.ora`))), rig, {
    lights: lights.length ? JSON.stringify(file) : undefined,
  });
  expect(built.messages, id).toEqual([]);
  return built;
}

type Command = Parameters<TestHook['send']>[0];
const send = (page: Page, c: Command): Promise<void> => page.evaluate((cmd) => window.__bb!.send(cmd), c);
const lights = (page: Page) => page.evaluate(() => window.__bb!.bugLights());
const colored = async (page: Page, color: number) => (await lights(page)).filter((l) => l.color === color);

test('a set’s night lights come on after dark, stay on the bug as the hand carries it, and go when it does', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await waitForScene(page, 'menu');
    await page.evaluate(() => window.__bb!.sfxFixture('all', true));
    const pack = toArtPack([
      lit(DOT, [
        ['shell', TEAL],
        ['antenna_tip', PINK],
      ]),
      // Rollo sleeps rolled up: his ball has a light of its own.
      lit(ROLLO, [
        ['body', AMBER],
        ['ball', AMBER],
      ]),
      lit('face_kit'),
    ]);
    await page.evaluate((p) => window.__bb!.loadArtSet(p, 'family', 'Family drawing'), pack);
    await openFrozen(page, 0);
    // A Dot and a Rollo of our own on flat ground.
    const at = PLAZA_X + 20;
    await send(page, { type: 'spawn', kind: 'bug', defId: DOT, x: at, y: 7 });
    await send(page, { type: 'spawn', kind: 'bug', defId: ROLLO, x: at + 4, y: 7 });
    await frames(page, 2);
    const mine = async (defId: string): Promise<number> =>
      (await entities(page))
        .filter((e) => e.defId === defId && !e.bug?.pending)
        .sort((a, b) => Math.abs(a.x - at) - Math.abs(b.x - at))[0]!.id;
    const dot = await mine(DOT);
    const rollo = await mine(ROLLO);
    for (const id of [dot, rollo]) await content(page, id);
    await jumpTo(page, at - 8);
    await frames(page, 60);

    await clickUi(page, 'pause');
    await chooseArtSet(page, 'family');
    await clickUi(page, 'resume');
    await frames(page, 2);
    // By day the lights are off, whatever the set.
    expect(await lights(page)).toEqual([]);

    await send(page, { type: 'set_time', hour: 23 });
    await frames(page, 4);
    const near = async (id: number, color: number): Promise<void> => {
      const bug = (await entity(page, id))!;
      const mineLit = await colored(page, color);
      expect(mineLit.length, hex(color)).toBeGreaterThan(0);
      for (const l of mineLit) {
        // On the bug: within its body and feelers of its middle.
        expect(Math.hypot(l.x - bug.x, l.y - bug.y), hex(color)).toBeLessThan(1.3);
        expect(l.alpha).toBeGreaterThan(0.2);
        expect(l.r).toBeCloseTo(0.2);
      }
    };
    await near(dot, TEAL);
    await near(dot, PINK);
    await near(rollo, AMBER);
    expect(await colored(page, TEAL)).toHaveLength(1);
    const stats = await page.evaluate(() => window.__bb!.weatherStats());
    expect(stats.lights).toBeGreaterThanOrEqual((await lights(page)).length);

    // Pick Dot up with the real mouse and carry her off: her lights go with her.
    const before = (await entity(page, dot))!;
    const from = await pressFrozen(page, dot);
    const up = await glideFrames(page, from, 0, -140, 8, 2);
    await glideFrames(page, up, 260, 0, 10, 2);
    await frames(page, 4);
    const held = (await entity(page, dot))!;
    expect(held.held).toBe(true);
    expect(Math.hypot(held.x - before.x, held.y - before.y)).toBeGreaterThan(1.5);
    await near(dot, TEAL);
    await near(dot, PINK);

    // In the pocket she is not in the world, and neither are her lights. Rollo keeps his.
    await send(page, { type: 'pocket_put', slot: 0 });
    await frames(page, 3);
    await page.mouse.up();
    expect((await page.evaluate(() => window.__bb!.pocket()))[0]).toEqual([dot]);
    expect(await colored(page, TEAL)).toEqual([]);
    expect(await colored(page, PINK)).toEqual([]);
    await near(rollo, AMBER);

    // Another set has no lights of its own, even at night.
    await clickUi(page, 'pause');
    await chooseArtSet(page, 'reference');
    await clickUi(page, 'resume');
    await frames(page, 2);
    expect(await lights(page)).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});

test('the Art Lab’s night look shows a set’s lights, and its other looks do not', async () => {
  const { page, close, errors } = await launchApp();
  try {
    await waitForScene(page, 'menu');
    const pack = toArtPack([lit(DOT, [['shell', TEAL]]), lit('face_kit')]);
    await page.evaluate((p) => window.__bb!.loadArtSet(p, 'family', 'Family drawing'), pack);
    await page.evaluate(() => window.__bb!.artMode('drawn'));
    await page.evaluate(() => window.__bb!.artSelect('family'));
    await page.evaluate(() => window.__bb!.artLab('bug_ladybug_dot'));
    await page.evaluate(() => window.__bb!.artLabFrames(2));
    const state = () => page.evaluate(() => window.__bb!.artLabState());
    expect(await state()).toMatchObject({ drawn: true, look: 'plain', lights: 0 });
    await page.evaluate(() => window.__bb!.artLabSet({ look: 'night' }));
    await page.evaluate(() => window.__bb!.artLabFrames(2));
    // One light on her shell in every cell: each pose and each expression.
    const night = (await state())!;
    expect(night.lights).toBe(night.cells);
    await page.evaluate(() => window.__bb!.artLabSet({ look: 'paint' }));
    await page.evaluate(() => window.__bb!.artLabFrames(2));
    expect((await state())!.lights).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await close();
  }
});
