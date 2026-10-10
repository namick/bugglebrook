import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSets } from '../../scripts/art/build.ts';
import type { SetPack } from '../../scripts/art/setPack.ts';
import { buildSetPack } from '../../scripts/art/setPack.ts';
import type { BackdropManifest } from '../../src/renderer/src/art/backdropData';
import type { ItemManifest } from '../../src/renderer/src/art/itemSheet';
import type { Manifest, RigFile } from '../../src/renderer/src/art/rigFile';

// One art set that supplies everything a set can: a bug with a color and a
// night light of its own, the face kit, an item sheet, and a backdrop. The
// crude fixtures stand in for the art. Both ways of building it must take
// every piece: the whole build that `pnpm art:build` writes, and the packs a
// tour installs in a running game.

const FIX = resolve(import.meta.dirname, '../e2e/fixtures/art');
const DOT = 'bug_ladybug_dot';
const SET = 'whole_set';
const SHEET = 'items_food_1';
const STRIP = 'area_puddle_pond_mid';

let root = '';
let dir = '';
let pack: SetPack;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bugglebrook-setpack-'));
  dir = join(root, 'sets', SET);
  for (const sub of ['bugs', 'faces', 'items', 'backdrop']) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, 'set.json'), JSON.stringify({ name: 'Whole set', credit: 'Test fixture' }));
  const copy = (from: string, to: string, name: string, exts: string[]): void => {
    for (const ext of exts) copyFileSync(join(FIX, from, `${name}.${ext}`), join(dir, to, `${name}.${ext}`));
  };
  copy('.', 'bugs', DOT, ['ora', 'rig.json']);
  copy('.', 'faces', 'face_kit', ['ora', 'rig.json']);
  copy('items', 'items', SHEET, ['ora', 'rig.json']);
  copy('backdrop', 'backdrop', STRIP, ['ora', 'strip.json']);
  for (const name of ['sky.json', 'world.json'])
    copyFileSync(join(FIX, 'backdrop', name), join(dir, 'backdrop', name));
  const rig = JSON.parse(readFileSync(join(FIX, `${DOT}.rig.json`), 'utf8')) as RigFile;
  const shell = rig.parts.find((p) => p.name === 'shell')!.pivot;
  writeFileSync(
    join(dir, 'bugs', `${DOT}.lights.json`),
    JSON.stringify({ lights: [{ part: 'shell', x: shell.x, y: shell.y, r: 80, color: '#40e0d0' }] }),
  );
  writeFileSync(
    join(dir, 'colors.json'),
    JSON.stringify({ bugs: { [DOT]: { body: '#3c8fe8', lid: '#2a3a60' } } }),
  );
  pack = buildSetPack(SET, root);
}, 120_000);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('a set with every kind of piece', () => {
  it('builds into packs a running game can install, with a report for every file', () => {
    expect(pack.set).toEqual({ id: SET, name: 'Whole set', credit: 'Test fixture' });
    expect(pack.errors).toBe(0);
    const dot = pack.art.assets.find((a) => a.id === DOT)!;
    expect(dot.status).toBe('drawn');
    expect(dot.colors).toEqual({ body: 0x3c8fe8, lid: 0x2a3a60 });
    expect(dot.lights).toHaveLength(1);
    expect(dot.lights![0]).toMatchObject({ part: 'shell', color: 0x40e0d0 });
    expect(pack.art.assets.map((a) => a.id).sort()).toEqual([DOT, 'face_kit']);
    // Every page an asset names is in the pack, as a picture the game can decode.
    for (const a of pack.art.assets)
      for (const page of [...a.pages['1'], ...a.pages['2']])
        expect(pack.art.pages[page]!.png, page).toMatch(/^data:image\/png;base64,/);
    expect(pack.items!.sheets.map((s) => [s.id, s.status])).toEqual([[SHEET, 'drawn']]);
    expect(pack.items!.sheets[0]!.items).toContain('item_berry_red');
    const backdrop = pack.backdrop!.manifest;
    expect(backdrop.sky).not.toBeNull();
    expect(backdrop.world).not.toBeNull();
    expect(backdrop.strips[STRIP]!.status).toBe('drawn');
    expect(pack.backdrop!.images[backdrop.strips[STRIP]!.paint!.image]).toMatch(/^data:image\/png/);
    for (const file of [
      `${DOT}.ora`,
      'face_kit.ora',
      `items/${SHEET}.ora`,
      'backdrop/sky.json',
      'backdrop/world.json',
      `backdrop/${STRIP}.ora`,
    ])
      expect(pack.report.split('\n'), file).toContain(file);
  });

  it('is the same art the whole build writes for that set', () => {
    const all = buildSets(root);
    const text = (path: string): string => new TextDecoder().decode(all.files[`sets/${SET}/${path}`]);
    const manifest = JSON.parse(text('manifest.json')) as Manifest;
    expect(manifest.assets[DOT]).toEqual(pack.art.assets.find((a) => a.id === DOT));
    const items = JSON.parse(text('items/manifest.json')) as ItemManifest;
    expect(items.sheets[SHEET]).toEqual(pack.items!.sheets[0]);
    const backdrop = JSON.parse(text('backdrop.json')) as BackdropManifest;
    expect(backdrop).toEqual(pack.backdrop!.manifest);
    // One catalog lists the set, and nothing of it leaks into the reference set's folder.
    const sets = JSON.parse(new TextDecoder().decode(all.files['sets.json'])) as { sets: { id: string }[] };
    expect(sets.sets.map((s) => s.id)).toEqual(['reference', SET]);
    expect(Object.keys(all.files).filter((f) => !f.startsWith(`sets/${SET}/`))).toEqual([
      'manifest.json',
      'sets.json',
    ]);
    for (const [id, messages] of all.messages)
      expect(
        messages.filter((m) => m.level !== 'info'),
        id,
      ).toEqual([]);
  }, 120_000);

  it('counts a file with an error and leaves it out, and says so for a set that is not there', () => {
    // A strip without its .strip.json cannot be placed.
    copyFileSync(join(FIX, 'backdrop', 'area_puddle_pond_far.ora'), join(dir, 'backdrop', 'lost.ora'));
    try {
      const broken = buildSetPack(SET, root);
      expect(broken.errors).toBe(1);
      expect(broken.report).toMatch(/backdrop\/lost\.ora\n {2}x /);
      expect(Object.keys(broken.backdrop!.manifest.strips)).toEqual([STRIP]);
      expect(broken.art.assets.find((a) => a.id === DOT)!.status).toBe('drawn');
    } finally {
      rmSync(join(dir, 'backdrop', 'lost.ora'));
    }
    expect(() => buildSetPack('nowhere', root)).toThrow(/no art set "nowhere"/);
  }, 120_000);
});
