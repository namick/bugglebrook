import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Container } from 'pixi.js';
import { BufferImageSource, Graphics, MeshRope, Sprite } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildAsset } from '../../scripts/art/build.ts';
import { decodePng } from '../../scripts/art/png.ts';
import { BUGS, CONTENT } from '../../src/game/data';
import type { BugDef } from '../../src/game/data/types';
import type { LoadedArt } from '../../src/renderer/src/art/artStore';
import { atlasSet } from '../../src/renderer/src/art/artStore';
import { EXPRESSIONS, expressionFrame, poseFrame, posesFor } from '../../src/renderer/src/art/poses';
import type { PoseState } from '../../src/renderer/src/art/poses';
import type { AtlasJson, RigFile } from '../../src/renderer/src/art/rigFile';
import { SpriteBugView } from '../../src/renderer/src/art/spriteBug';
import type { BugFrame } from '../../src/renderer/src/render/draw/bug';
import { BugSprite } from '../../src/renderer/src/render/draw/bug';
import { ItemSprite } from '../../src/renderer/src/render/draw/item';
import type { Pt } from '../../src/renderer/src/render/rig/bugRig';
import { rigFor } from '../../src/renderer/src/render/rig/bugRig';

// The cutout renderer on every bug, with the crude test art pack
// (tests/e2e/fixtures/art, made by make.ts): every pose, form, and expression
// draws from the parts, every part is used, and the rest pose puts each part
// where the template's pivots are.

const FIX = join(resolve(import.meta.dirname, '../..'), 'tests/e2e/fixtures/art');

function loaded(id: string): LoadedArt {
  const rig = JSON.parse(readFileSync(join(FIX, `${id}.rig.json`), 'utf8')) as RigFile;
  const built = buildAsset(new Uint8Array(readFileSync(join(FIX, `${id}.ora`))), rig);
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

const arts = new Map<string, LoadedArt>();
let kit: LoadedArt;
beforeAll(() => {
  kit = loaded('face_kit');
  for (const def of BUGS.all) arts.set(def.id, loaded(def.id));
}, 60_000);

const view = (def: BugDef): SpriteBugView => new SpriteBugView(def, arts.get(def.id)!, kit);

/** Every visible sprite and rope in a view, by label. */
function visible(root: Container): (Sprite | MeshRope)[] {
  const out: (Sprite | MeshRope)[] = [];
  const walk = (c: Container): void => {
    if (!c.visible) return;
    if (c instanceof Sprite || c instanceof MeshRope) out.push(c);
    c.children.forEach((ch) => walk(ch as Container));
  };
  walk(root);
  return out;
}
const labels = (v: SpriteBugView): string[] => visible(v).map((s) => s.label);
const sprites = (v: SpriteBugView, label: string): Sprite[] =>
  visible(v).filter((s): s is Sprite => s instanceof Sprite && s.label === label);

const pose = (def: BugDef, id: string): PoseState => {
  const s = posesFor(def).find((p) => p.id === id);
  if (!s) throw new Error(`${def.id} has no pose ${id}`);
  return s;
};

const near = (a: Pt, b: Pt, tol: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('the crude test art pack', () => {
  it('builds every bug and the kit with no problems', () => {
    for (const def of BUGS.all) {
      const e = arts.get(def.id)!.entry;
      expect(e.status, def.id).toBe('drawn');
      expect(e.report, def.id).toEqual([]);
    }
    expect(kit.entry.status).toBe('drawn');
  });
});

describe('the cutout renderer, for every bug', () => {
  it('draws every pose and expression from parts, with the face from the kit', () => {
    for (const def of BUGS.all) {
      const v = view(def);
      const used = new Set<string>();
      for (const state of posesFor(def))
        for (const t of [0, 0.37, 0.81]) {
          v.update(poseFrame(state, t));
          const what = `${def.id} ${state.id} t=${t}`;
          expect(v.shown.codeFace, what).toBe(0);
          // Every part the skeleton asked for has a drawing (nothing silently missing).
          const asked = new Set(v.lastSkeleton!.items.map((i) => i.part));
          for (const i of v.lastSkeleton!.items) if (i.kind === 'limb' && i.lower) asked.add(i.lower);
          if (v.lastSkeleton!.ball) asked.add(v.lastSkeleton!.ball.part);
          expect([...asked].sort(), what).toEqual([...new Set(v.shown.parts)].sort());
          expect(v.shown.parts.length, what).toBeGreaterThan(0);
          v.shown.parts.forEach((p) => used.add(p));
        }
      for (const e of EXPRESSIONS) {
        v.update(expressionFrame(e, 0.5));
        expect(v.shown.codeFace, `${def.id} ${e.id}`).toBe(0);
        expect(v.shown.face.length, `${def.id} ${e.id}`).toBeGreaterThan(0);
      }
      // Every part of the template shows up in some pose.
      const all = rigFor(def).parts.map((p) => p.name);
      expect([...used].sort(), def.id).toEqual([...all].sort());
    }
  });

  it('puts every part on its template pivot in the rest pose', () => {
    for (const def of BUGS.all) {
      const rig = rigFor(def);
      const tol = rig.r * 0.06;
      // Each pose at t = 0, facing right: the springs are at rest.
      const skeletons = posesFor(def).map((s) => {
        const v = view(def);
        v.update(poseFrame(s, 0));
        return v.lastSkeleton!;
      });
      for (const part of rig.parts) {
        // Drawn twice at offsets (wings), or placed from another piece (elbows and knobs).
        if (part.kind === 'wing' || part.kind === 'limb_lower' || part.kind === 'tip') continue;
        if (part.name === 'wing_open' || part.name === 'antenna_end') continue;
        const hit = skeletons.some(
          (sk) =>
            sk.items.some((i) => {
              if (i.part !== part.name) return false;
              if (i.kind === 'piece') return near(i.at, part.pivot, tol);
              if (i.kind === 'limb') return near(i.hip, part.pivot, tol);
              return near(i.pts[0]!, part.pivot, tol);
            }) || sk.ball?.part === part.name,
        );
        expect(hit, `${def.id} ${part.name}`).toBe(true);
      }
    }
  });

  it('uses 2x pages and faces left', () => {
    SpriteBugView.forceScale = 2;
    try {
      for (const def of BUGS.all) {
        const v = view(def);
        v.update({ ...poseFrame(posesFor(def)[1]!, 0.4), facing: -1 } as BugFrame);
        expect(v.shown.scale, def.id).toBe(2);
        expect(v.shown.codeFace, def.id).toBe(0);
      }
    } finally {
      SpriteBugView.forceScale = null;
    }
  });
});

describe('special forms', () => {
  it('Rollo and Barty curl into a ball that rolls; Barty’s shimmers', () => {
    for (const id of ['bug_pillbug_rollo', 'bug_dungbeetle_barty']) {
      const def = BUGS.get(id);
      const v = view(def);
      const f = poseFrame(pose(def, 'curled'), 0.5);
      v.update(f);
      const ball = id === 'bug_pillbug_rollo' ? 'ball' : 'ball_tint';
      expect(v.shown.ball).toBe(ball);
      expect(labels(v)).toEqual([ball]);
      expect(sprites(v, ball)[0]!.parent!.rotation).toBeCloseTo(f.angle, 6);
    }
    const barty = BUGS.get('bug_dungbeetle_barty');
    const v = view(barty);
    const tints: number[] = [];
    for (let i = 0; i < 30; i++) {
      v.update(poseFrame(pose(barty, 'walk'), i / 10));
      tints.push(sprites(v, 'shell_tint')[0]!.tint);
    }
    // Teal to violet as he walks; his shine stays untinted.
    expect(new Set(tints).size).toBeGreaterThan(10);
    expect(sprites(v, 'shine')[0]!.tint).toBe(0xffffff);
  });

  it('Glorp hides in his shell with his eyes in the opening', () => {
    const def = BUGS.get('bug_snail_glorp');
    const v = view(def);
    v.update(poseFrame(pose(def, 'in_shell'), 0.3));
    expect(v.shown.parts).toEqual(['shell_closed']);
    expect(v.shown.face.filter((n) => n === 'eye_white')).toHaveLength(2);
    v.update(poseFrame(pose(def, 'walk'), 0.3));
    expect(v.shown.parts).toEqual(expect.arrayContaining(['body', 'shell', 'stalk']));
    expect(v.shown.extras).toEqual(['ripple']);
  });

  it('Skeet rows on the water and spreads his legs like a parachute', () => {
    const def = BUGS.get('bug_waterstrider_skeet');
    const v = view(def);
    const feet = (id: string): number => {
      v.update(poseFrame(pose(def, id), 0.2));
      const ys = v.lastSkeleton!.items.flatMap((i) =>
        i.kind === 'limb' && i.part === 'leg_long_upper' ? [i.foot.y] : [],
      );
      return Math.max(...ys);
    };
    expect(v.lastSkeleton).toBeNull();
    const skate = feet('skate');
    const chute = feet('thrown');
    expect(chute).toBeLessThan(skate);
    expect(labels(v)).toEqual(expect.arrayContaining(['leg_long_upper', 'leg_long_lower', 'leg_upper']));
  });

  it('Boing kicks his hind legs straight out mid-hop', () => {
    const def = BUGS.get('bug_grasshopper_boing');
    const v = view(def);
    const shin = (id: string): Sprite => {
      v.update(poseFrame(pose(def, id), 0.2));
      return sprites(v, 'hindleg_shin').at(-1)!;
    };
    const stand = shin('idle').rotation;
    const hop = shin('hop').rotation;
    expect(Math.abs(hop - stand)).toBeGreaterThan(0.5);
  });

  it('Whiff wears his polite brows, and the stink cloud stays the game’s', () => {
    const def = BUGS.get('bug_stinkbug_whiff');
    const v = view(def);
    v.update(poseFrame(pose(def, 'idle'), 0.2));
    expect(v.shown.face.filter((n) => n === 'brow_polite')).toHaveLength(2);
    v.update(
      expressionFrame(
        EXPRESSIONS.find((e) => e.id === 'hate')!,
        0.2,
      ),
    );
    expect(v.shown.face).not.toContain('brow_polite');
    expect(v.shown.face).toContain('brow_angry');
  });

  it('Moose lies on his back with his body flipped and head upright, and lifts things overhead', () => {
    const def = BUGS.get('bug_stagbeetle_moose');
    const v = view(def);
    v.update(poseFrame(pose(def, 'stuck'), 0.4));
    expect(sprites(v, 'shell')[0]!.scale.y).toBeLessThan(0);
    expect(sprites(v, 'belly')[0]!.scale.y).toBeLessThan(0);
    expect(sprites(v, 'head')[0]!.scale.y).toBeGreaterThan(0);
    expect(sprites(v, 'antler')).toHaveLength(2);
    // Mirrored where the code mirrors him: the belly (at 0.5 r) ends up just above the middle.
    const belly = v.lastSkeleton!.items.find((i) => i.part === 'belly')!;
    expect(belly.kind === 'piece' && belly.at.y).toBeCloseTo(-0.04 * rigFor(def).r, 6);
    // His legs wave up in the air, above the shell.
    const feet = v.lastSkeleton!.items.flatMap((i) => (i.kind === 'limb' ? [i.foot.y] : []));
    expect(Math.max(...feet)).toBeLessThan(0);
    v.update(poseFrame(pose(def, 'overhead'), 0.4));
    expect(sprites(v, 'shell')[0]!.scale.y).toBeGreaterThan(0);
    const front = v.lastSkeleton!.items.filter((i) => i.kind === 'limb' && i.part === 'leg_upper');
    const r = rigFor(def).r;
    expect(front.some((i) => i.kind === 'limb' && i.foot.y < -r)).toBe(true);
  });

  it('Barty walks backward rolling, and keeps his nose in the air while aloof', () => {
    const def = BUGS.get('bug_dungbeetle_barty');
    const v = view(def);
    v.update(poseFrame(pose(def, 'rolling'), 0.4));
    expect(v.lastSkeleton!.adjust.tilt).toBeGreaterThan(0);
    expect(labels(v)).toContain('hindleg_thigh');
    v.update(poseFrame(pose(def, 'aloof'), 0.4));
    expect(v.lastSkeleton!.adjust.tilt).toBeLessThan(0);
    expect(v.lastSkeleton!.face!.look!.y).toBeLessThan(0);
  });

  it('Munch inches with a wave through his segments, and a bite travels down him', () => {
    const def = BUGS.get('bug_caterpillar_munch');
    const v = view(def);
    v.update(poseFrame(pose(def, 'walk'), 0.6));
    const segs = () => v.lastSkeleton!.items.filter((i) => i.part === 'segment_a' || i.part === 'segment_b');
    expect(segs()).toHaveLength(6);
    expect(sprites(v, 'segment_a')).toHaveLength(3);
    expect(sprites(v, 'segment_b')).toHaveLength(3);
    const ys = segs().map((i) => (i.kind === 'piece' ? i.at.y : 0));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
    // Eating: one segment swells as the bite goes down.
    let biggest = 0;
    for (let t = 0; t < 1.4; t += 0.1) {
      v.update(poseFrame(pose(def, 'eat'), t));
      for (const i of segs()) if (i.kind === 'piece') biggest = Math.max(biggest, i.sx ?? 1);
    }
    expect(biggest).toBeGreaterThan(1.1);
    // Paint lands segment by segment.
    v.update({ ...poseFrame(pose(def, 'idle'), 0), paint: ['paint_blue'] });
    expect(v.shown.paint).toBe(2);
  });

  it('Munch sleeps as a cocoon on a thread, and flies as a butterfly with his own face', () => {
    const def = BUGS.get('bug_caterpillar_munch');
    const v = view(def);
    v.update(poseFrame(pose(def, 'cocoon'), 0.3));
    expect(v.shown.parts).toEqual(['cocoon']);
    expect(v.shown.extras).toEqual(['thread']);
    expect(v.shown.face).toEqual(expect.arrayContaining(['eye_closed', 'mouth_smile']));
    v.update(poseFrame(pose(def, 'flutter'), 0.3));
    expect(sprites(v, 'bf_wing_fore')).toHaveLength(2);
    expect(sprites(v, 'bf_wing_hind')).toHaveLength(2);
    expect(sprites(v, 'bf_wing_fore').some((s) => s.scale.x < 0)).toBe(true);
    expect(v.shown.parts).toEqual(expect.arrayContaining(['head', 'bf_body', 'bf_leg', 'bf_antenna']));
    expect(v.shown.parts).not.toContain('segment_a');
    const open = (t: number): number => {
      v.update(poseFrame(pose(def, 'flutter'), t));
      return sprites(v, 'bf_wing_fore')[1]!.rotation;
    };
    expect(new Set([0.1, 0.2, 0.3, 0.4].map(open)).size).toBeGreaterThan(2);
  });

  it('Prim folds her arms, strikes karate poses, chops with a swoosh, and opens her wings when flung', () => {
    const def = BUGS.get('bug_mantis_prim');
    const v = view(def);
    const hand = (id: string): Pt => {
      v.update(poseFrame(pose(def, id), 0.3));
      const arm = v.lastSkeleton!.items.find((i) => i.kind === 'limb' && i.part === 'arm_thigh' && !i.far);
      return arm!.kind === 'limb' ? arm!.foot : { x: 0, y: 0 };
    };
    const folded = hand('idle');
    const posed = hand('pose');
    expect(posed.y).toBeLessThan(folded.y);
    hand('karate');
    expect(v.shown.extras).toEqual(['swoosh']);
    expect(labels(v)).toEqual(expect.arrayContaining(['arm_thigh', 'arm_blade']));
    v.update(poseFrame(pose(def, 'fly'), 0.3));
    expect(sprites(v, 'wing_open')).toHaveLength(2);
    expect(sprites(v, 'wing_folded')).toHaveLength(0);
  });

  it('Twig lies flat as the twig item, peeks, and stands on six legs once found', () => {
    const def = BUGS.get('bug_stickinsect_twig');
    const v = view(def);
    for (const facing of [1, -1] as const) {
      v.update({ ...poseFrame(pose(def, 'disguised'), 0.3), facing });
      expect(v.shown.parts).toEqual(['stick']);
      // He cancels the facing flip, so his nubs match the item's whichever way he faces.
      const stick = sprites(v, 'stick')[0]!;
      expect(Math.sign(stick.scale.x) * facing).toBe(1);
      expect(v.lastSkeleton!.adjust.still).toBe(true);
    }
    v.update(poseFrame(pose(def, 'peek'), 0.3));
    expect(v.shown.face.filter((n) => n === 'eye_white')).toHaveLength(2);
    v.update(poseFrame(pose(def, 'walk'), 0.3));
    expect(v.shown.parts).toEqual(expect.arrayContaining(['stick', 'leg_upper', 'leg_lower', 'antenna']));
    v.update(poseFrame(pose(def, 'asleep'), 0.3));
    expect(v.shown.parts).toEqual(['stick']);
  });

  it('Buzzby and Luma beat their wings in the air and rest them folded back on the ground', () => {
    for (const [id, parts] of [
      ['bug_bee_buzzby', ['wing']],
      ['bug_moth_luma', ['wing_hind', 'wing_fore']],
    ] as const) {
      const def = BUGS.get(id);
      const v = view(def);
      const turns = (poseId: string): number[] =>
        [0.1, 0.3, 0.5, 0.7].map((t) => {
          v.update(poseFrame(pose(def, poseId), t));
          return sprites(v, parts[0])[1]!.rotation;
        });
      const idle = turns('idle');
      // Each wing piece shows twice (far and near).
      for (const part of parts) expect(sprites(v, part), `${id} ${part}`).toHaveLength(2);
      const fly = turns('fly');
      expect(Math.max(...idle) - Math.min(...idle), id).toBeLessThan(0.1);
      expect(Math.max(...fly) - Math.min(...fly), id).toBeGreaterThan(0.3);
      // Flying, her legs hang tucked up off the ground.
      const feet = v.lastSkeleton!.items.flatMap((i) => (i.kind === 'limb' ? [i.foot.y] : []));
      expect(Math.max(...feet), id).toBeLessThan(rigFor(def).foot * 0.95);
    }
  });

  it('Luma’s open eyes rest half shut', () => {
    const def = BUGS.get('bug_moth_luma');
    const v = view(def);
    v.update(poseFrame(pose(def, 'idle'), 0.2));
    expect(v.lastSkeleton!.face!.eyes.map((e) => e.shape)).toEqual(['sleepy', 'sleepy']);
    expect(v.shown.face).toContain('eye_sleepy_lid');
  });

  it('Fiddle bows one back leg across the other when he plays', () => {
    const def = BUGS.get('bug_cricket_fiddle');
    const v = view(def);
    const bow = (poseId: string, t: number) => {
      v.update(poseFrame(pose(def, poseId), t));
      const near = v.lastSkeleton!.items.find(
        (i) => i.kind === 'limb' && i.part === 'hindleg_thigh' && !i.far,
      );
      if (near?.kind !== 'limb') throw new Error('no near back leg');
      return near;
    };
    const stand = bow('idle', 0.3);
    expect(stand.slot).toBe('front');
    expect(stand.foot.y).toBeCloseTo(rigFor(def).foot, 0);
    const a = bow('fiddle', 0.3);
    // Lifted up over his body, in front of everything, and sawing back and forth.
    expect(a.slot).toBe('top');
    expect(a.foot.y).toBeLessThan(0);
    expect(a.foot.x).toBeGreaterThan(a.knee.x);
    const b = bow('fiddle', 0.47);
    expect(Math.abs(b.foot.x - a.foot.x)).toBeGreaterThan(1);
    expect(labels(v)).toEqual(expect.arrayContaining(['hindleg_thigh', 'hindleg_shin', 'head', 'antenna']));
  });

  it('every bug keeps the game’s dizzy stars circling its crown', () => {
    for (const def of BUGS.all) {
      const v = view(def);
      v.update(poseFrame(pose(def, 'dizzy'), 0.3));
      const fx = v.children.find((c) => c instanceof Graphics) as Graphics;
      expect(fx.context.instructions.length, def.id).toBeGreaterThan(0);
    }
  });
});

describe('worn things on the cutout bugs (M11)', () => {
  it('sit where they sit on the code-drawn bug, in every pose', () => {
    const items = [
      'item_hat_acorn_cap',
      'item_acc_sunglasses',
      'item_acc_cape_leaf',
      'item_acc_roller_skates',
    ].map((id) => CONTENT.items.get(id));
    for (const def of BUGS.all) {
      for (const state of posesFor(def)) {
        const f = poseFrame(state, 0.3);
        const cut = view(def);
        const code = new BugSprite(def);
        for (const s of [cut, code])
          s.setWorn(
            items.map((d, i) => ({ id: i + 1, def: d })),
            (d) => new ItemSprite(d, 0),
          );
        cut.update(f);
        code.update(f);
        for (const id of [1, 2, 3, 4]) {
          const a = cut.wornAt.get(id)!;
          const b = code.wornAt.get(id)!;
          const where = `${items[id - 1]!.id} on ${def.id} (${state.id})`;
          expect(Math.hypot(a.x - b.x, a.y - b.y), where).toBeLessThan(0.5);
          expect(a.hidden, where).toBe(b.hidden);
        }
        cut.destroy({ children: true });
        code.destroy({ children: true });
      }
    }
  });
});
