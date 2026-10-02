import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BufferImageSource, Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildAsset } from '../../scripts/art/build.ts';
import { readOra, walk } from '../../scripts/art/ora.ts';
import { decodePng } from '../../scripts/art/png.ts';
import { buildTemplate, placeTemplate, refreshGuides } from '../../scripts/art/template.ts';
import type { Guides } from '../../scripts/art/template.ts';
import { analyze } from '../../scripts/art/validate.ts';
import { rebuild } from '../../scripts/art/vitePlugin.ts';
import { watchArt } from '../../scripts/art/watch.ts';
import { BUGS } from '../../src/game/data';
import type { LoadedArt } from '../../src/renderer/src/art/artStore';
import { ArtStore, atlasSet } from '../../src/renderer/src/art/artStore';
import { makeBugView } from '../../src/renderer/src/art/bugViews';
import { EYE_PIECES, MOUTH_PIECES, eyePieces, mouthPiece } from '../../src/renderer/src/art/faceKit';
import { FACE_KIT } from '../../src/renderer/src/art/kit';
import { EXPRESSIONS, expressionFrame, poseFrame, posesFor } from '../../src/renderer/src/art/poses';
import { kitHash, rigHashFor } from '../../src/renderer/src/art/rigData';
import type { AtlasJson, RigFile } from '../../src/renderer/src/art/rigFile';
import { SpriteBugView } from '../../src/renderer/src/art/spriteBug';
import { BugSprite } from '../../src/renderer/src/render/draw/bug';
import { legJoints } from '../../src/renderer/src/render/rig/bugRig';
import { EMPTY } from './artFixtures';

const ROOT = resolve(import.meta.dirname, '../..');
const FIX = join(ROOT, 'tests/e2e/fixtures/art');
const rigAt = (path: string): RigFile => JSON.parse(readFileSync(path, 'utf8')) as RigFile;

/** Build a fixture and turn its pages into textures, the way the game does with images. */
function loaded(id: string): LoadedArt {
  const built = buildAsset(
    new Uint8Array(readFileSync(join(FIX, `${id}.ora`))),
    rigAt(join(FIX, `${id}.rig.json`)),
  );
  const art: LoadedArt = { entry: built.entry, scales: {} };
  for (const scale of [1, 2] as const)
    for (const page of built.entry.pages[String(scale) as '1' | '2']) {
      const img = decodePng(built.files[`${page}.png`]!);
      const json = JSON.parse(new TextDecoder().decode(built.files[`${page}.json`]!)) as AtlasJson;
      const source = new BufferImageSource({
        resource: new Uint8Array(img.data),
        width: img.w,
        height: img.h,
      });
      art.scales[scale] = atlasSet(source, json, art.scales[scale]);
    }
  return art;
}

const DOT = BUGS.get('bug_ladybug_dot');

describe('committed art files', () => {
  it("match the game's current rigs (run pnpm art:templates --refresh-guides if not)", () => {
    for (const def of BUGS.all) {
      const rig = rigAt(join(ROOT, `art/src/bugs/${def.id}.rig.json`));
      expect(rig.rigHash, def.id).toBe(rigHashFor(def));
    }
    expect(rigAt(join(ROOT, 'art/src/faces/face_kit.rig.json')).rigHash).toBe(kitHash());
    // The crude test pack too (node tests/e2e/fixtures/art/make.ts).
    expect(rigAt(join(FIX, 'bug_ladybug_dot.rig.json')).rigHash).toBe(rigHashFor(DOT));
    expect(rigAt(join(FIX, 'face_kit.rig.json')).rigHash).toBe(kitHash());
  });

  it('are templates that open clean: every part layer there, named right, and nothing drawn yet', () => {
    for (const sub of ['bugs', 'faces']) {
      const dir = join(ROOT, 'art/src', sub);
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.ora'))) {
        const bytes = new Uint8Array(readFileSync(join(dir, f)));
        const rig = rigAt(join(dir, f.replace('.ora', '.rig.json')));
        const a = analyze(bytes, rig);
        expect(
          a.messages.filter((m) => m.level !== 'info'),
          f,
        ).toEqual([]);
        const names = walk(readOra(bytes).root).map((n) => n.node.name);
        for (const p of rig.parts) expect(names, `${f} ${p.name}`).toContain(p.name);
        expect(names).toContain('guide_current');
        expect(names).toContain(`guide_rig_${rig.rigHash}`);
      }
    }
  });
});

describe('templates', () => {
  const rig = rigAt(join(ROOT, 'art/src/bugs/bug_ladybug_dot.rig.json'));
  const old = new Uint8Array(readFileSync(join(ROOT, 'art/src/bugs/bug_ladybug_dot.ora')));
  const doc = readOra(old);
  const current = walk(doc.root).find((n) => n.node.name === 'guide_current')!.node;
  const png = current.kind === 'layer' && current.png ? current.png : EMPTY();
  const guides: Guides = { rig, current: png, pivots: png, safe: png, notes: png };

  it('refreshes the guides and keeps every drawn layer byte for byte', () => {
    const drawn = readFileSync(join(FIX, 'bug_ladybug_dot.ora'));
    const before = readOra(new Uint8Array(drawn));
    const after = readOra(refreshGuides(new Uint8Array(drawn), guides));
    const layers = (d: typeof before) =>
      walk(d.root)
        .filter((n) => n.node.kind === 'layer' && !n.node.name.startsWith('guide'))
        .map((n) => [n.node.name, n.node.kind === 'layer' ? n.node.png : null, n.node.x, n.node.y]);
    expect(layers(after)).toEqual(layers(before));
    expect(walk(after.root).map((n) => n.node.name)).toContain('guide_pivots');
  });

  it('never overwrites a source: a fresh copy goes to art/templates', () => {
    const root = mkdtempSync(join(tmpdir(), 'bb-art-'));
    try {
      expect(placeTemplate(guides, { refresh: false, root }).action).toBe('created');
      const src = join(root, 'art/src/bugs/bug_ladybug_dot.ora');
      writeFileSync(src, readFileSync(join(FIX, 'bug_ladybug_dot.ora')));
      expect(placeTemplate(guides, { refresh: false, root })).toMatchObject({
        action: 'fresh copy',
        ora: 'art/templates/bug_ladybug_dot.ora',
      });
      expect(readFileSync(src)).toEqual(readFileSync(join(FIX, 'bug_ladybug_dot.ora')));
      expect(placeTemplate(guides, { refresh: true, root }).action).toBe('refreshed');
      expect(analyze(new Uint8Array(readFileSync(src)), rig).parts.size).toBe(rig.parts.length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('makes the same file from the same guides', () => {
    expect(buildTemplate(guides)).toEqual(buildTemplate(guides));
  });
});

describe('face kit', () => {
  it('maps every eye and mouth shape to kit layers', () => {
    for (const pieces of [...Object.values(EYE_PIECES), ...Object.values(MOUTH_PIECES)])
      for (const p of pieces) expect(FACE_KIT).toContain(p);
    expect(FACE_KIT).toHaveLength(28);
  });

  it('blinks, follows the hand, beats, spins, and chews like the code-drawn face', () => {
    const e = { x: 10, y: 0, r: 10, shape: 'open' as const, lid: 0, line: 4, far: false };
    expect(eyePieces(e, { x: 0, y: 0 }, 0.2, 0).map((p) => p.name)).toEqual(['eye_closed']);
    const open = eyePieces(e, { x: 1, y: 0 }, 1, 0);
    expect(open.map((p) => p.name)).toEqual(['eye_white', 'eye_pupil']);
    // Pupil reach: r - 0.52r - 0.08r.
    expect(open[1]!.x).toBeCloseTo(14, 6);
    expect(eyePieces({ ...e, shape: 'sleepy' }, { x: 0, y: 0 }, 1, 0)[2]).toMatchObject({
      name: 'eye_sleepy_lid',
      tint: 0,
    });
    expect(eyePieces({ ...e, shape: 'heart' }, { x: 0, y: 0 }, 0, 0.1)[0]!.sx).toBeGreaterThan(1);
    expect(eyePieces({ ...e, shape: 'spiral' }, { x: 0, y: 0 }, 0, 1)[1]!.rotation).toBe(9);
    const m = { x: 0, y: 0, s: 20, shape: 'chew' as const, color: 0, line: 4 };
    expect(mouthPiece(m, 0).name).toBe('mouth_chew_1');
    expect(mouthPiece(m, 0.13).name).toBe('mouth_chew_2');
  });
});

describe('the cutout renderer', () => {
  const dot = loaded('bug_ladybug_dot');
  const kit = loaded('face_kit');

  it('draws Dot from her parts in every pose and expression, with no code-drawn face', () => {
    const view = new SpriteBugView(DOT, dot, kit);
    for (const state of posesFor(DOT))
      for (const t of [0, 0.3, 0.7]) {
        view.update(poseFrame(state, t));
        expect(view.shown.parts, state.id).toEqual(
          expect.arrayContaining(['belly', 'head', 'shell', 'leg_upper']),
        );
        expect(view.shown.codeFace, state.id).toBe(0);
      }
    for (const e of EXPRESSIONS) {
      view.update(expressionFrame(e, 0.5));
      expect(view.shown.codeFace, e.id).toBe(0);
    }
  });

  it('puts each leg on its hip and the shell on its hinge, and opens it to fly', () => {
    const view = new SpriteBugView(DOT, dot, kit);
    const fly = posesFor(DOT).find((s) => s.id === 'fly')!;
    const frame = poseFrame(fly, 0.2);
    view.update(frame);
    const sprites: Sprite[] = [];
    view.children.forEach(function walkAll(c) {
      if (c instanceof Sprite) sprites.push(c);
      c.children.forEach(walkAll);
    });
    const shell = sprites.find((s) => s.label === 'shell')!;
    expect(shell.rotation).toBe(-0.55);
    expect(shell.x).toBeCloseTo(dot.entry.parts.shell!.pivot.x, 3);
    const hips = legJoints(view.bones, frame.pose, frame).map((j) => j.hip);
    const uppers = sprites.filter((s) => s.label === 'leg_upper' && s.visible);
    expect(uppers).toHaveLength(6);
    for (const u of uppers) expect(hips.some((h) => Math.hypot(h.x - u.x, h.y - u.y) < 1e-6)).toBe(true);
  });

  it('uses 2x pages when asked, and falls back to code for bugs without art', () => {
    SpriteBugView.forceScale = 2;
    try {
      const view = new SpriteBugView(DOT, dot, kit);
      view.update(poseFrame(posesFor(DOT)[0]!, 0));
      expect(view.shown.scale).toBe(2);
    } finally {
      SpriteBugView.forceScale = null;
    }
    const store = new ArtStore();
    store.put(dot);
    expect(makeBugView(DOT, store)).toBeInstanceOf(SpriteBugView);
    expect(makeBugView(BUGS.get('bug_pillbug_rollo'), store)).not.toBeInstanceOf(SpriteBugView);
    expect(store.status(BUGS.get('bug_pillbug_rollo')).reason).toBe('no art file');
    store.setMode('code');
    expect(makeBugView(DOT, store)).toBeInstanceOf(BugSprite);
    expect(store.status(DOT).reason).toBe('art is switched off');
    // Every species can be drawn from art now: a broken file is the only reason left besides missing art.
    const moose = BUGS.get('bug_stagbeetle_moose');
    store.setMode('drawn');
    store.put({
      ...dot,
      entry: { ...dot.entry, id: moose.id, status: 'broken', report: [{ level: 'error', text: 'Oops.' }] },
    });
    expect(store.status(moose).reason).toBe('the file has problems: Oops.');
  });
});

describe('art:watch', () => {
  it('rebuilds a saved file into a pack for the game, with the report', () => {
    const src = mkdtempSync(join(tmpdir(), 'bb-watch-'));
    try {
      mkdirSync(join(src, 'bugs'));
      copyFileSync(join(FIX, 'bug_ladybug_dot.ora'), join(src, 'bugs/bug_ladybug_dot.ora'));
      copyFileSync(join(FIX, 'bug_ladybug_dot.rig.json'), join(src, 'bugs/bug_ladybug_dot.rig.json'));
      const { pack, report } = rebuild(src, ['bug_ladybug_dot']);
      expect(report).toBe('bug_ladybug_dot.ora\n  - All good.');
      expect(pack.assets[0]!.status).toBe('drawn');
      expect(Object.keys(pack.pages)).toEqual(['bugs/bug_ladybug_dot@1x', 'bugs/bug_ladybug_dot@2x']);
      expect(pack.pages['bugs/bug_ladybug_dot@1x']!.png).toMatch(/^data:image\/png;base64,/);
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });

  it('waits until a saved file stops changing, then reports it once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-watch-'));
    const seen: string[][] = [];
    const stop = watchArt(dir, (ids) => seen.push(ids), 60);
    try {
      writeFileSync(join(dir, 'bug_x.ora'), 'part');
      await new Promise((r) => setTimeout(r, 20));
      writeFileSync(join(dir, 'bug_x.ora'), 'part two');
      writeFileSync(join(dir, 'notes.txt'), 'ignored');
      await expect.poll(() => seen, { timeout: 3000 }).toEqual([['bug_x']]);
    } finally {
      stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
