import { describe, expect, it } from 'vitest';
import {
  DEMO_ORDER,
  GHOST,
  GhostScheduler,
  cauldronDemo,
  chooseDemo,
  demoDoneBy,
  demosDoneIn,
  dialDemo,
  dragDemo,
  ghostAt,
  leverDemo,
  pocketDemo,
  scriptLength,
  spongeDemo,
} from '../../src/renderer/src/app/ghost';
import type { DemoKind, GhostScript } from '../../src/renderer/src/app/ghost';
import { AffordanceTracker, HINT, wobbleEnvelope } from '../../src/renderer/src/render/hints';
import type { HintTarget } from '../../src/renderer/src/render/hints';
import { Sim } from '../../src/game';
import { PIXELS_PER_METER, VIEW_WIDTH_M, VIEW_WIDTH_PX } from '../../src/game/constants';
import { sunflowerClue } from '../../src/renderer/src/render/areaArt/barrierLive';
import { LADLE_INVITE, ladleInvite, swirlAmount } from '../../src/renderer/src/render/areaArt/cauldronLive';
import { Camera } from '../../src/renderer/src/render/camera';
import { notchShine, twitchCurve } from '../../src/renderer/src/render/fixtureArt';
import { cursorPose } from '../../src/renderer/src/ui/cursor';
import { HOLD, HoldArm } from '../../src/renderer/src/ui/holdArm';
import { STAMP_UI, freshStamps, iconAlpha, stampSlam, stampsOf } from '../../src/renderer/src/ui/stamps';

const DT = 1 / 60;

function run(n: number, f: () => void): void {
  for (let i = 0; i < n; i++) f();
}

describe('affordance hints', () => {
  const dial: HintTarget = { key: 'sundial', at: { x: 10, y: 8 }, reach: 2.5, done: false };

  it('wobbles a new thing once the hand has rested near it, then waits before the next', () => {
    const t = new AffordanceTracker();
    const still = () => ({ at: { x: 11, y: 8 }, speed: 0 });
    run(Math.floor(HINT.restSeconds / DT) - 5, () => t.update(DT, [dial], still, null));
    expect(t.glint('sundial')).toBe(0);
    run(10, () => t.update(DT, [dial], still, null));
    expect(t.glint('sundial')).toBeGreaterThan(0);
    expect(t.started.get('sundial')).toBe(1);
    // Over in under a second, and quiet until the gap has passed.
    run(Math.ceil(HINT.wobbleSeconds / DT) + 2, () => t.update(DT, [dial], still, null));
    expect(t.wobble('sundial')).toBe(0);
    run(Math.floor((HINT.gapSeconds - HINT.wobbleSeconds) / DT) - 10, () =>
      t.update(DT, [dial], still, null),
    );
    expect(t.started.get('sundial')).toBe(1);
    run(30, () => t.update(DT, [dial], still, null));
    expect(t.started.get('sundial')).toBe(2);
  });

  it('ignores a hand that is far away or busy moving', () => {
    const t = new AffordanceTracker();
    run(300, () => t.update(DT, [dial], () => ({ at: { x: 20, y: 8 }, speed: 0 }), null));
    run(300, () => t.update(DT, [dial], () => ({ at: { x: 10.5, y: 8 }, speed: 30 }), null));
    run(300, () => t.update(DT, [dial], () => null, null));
    expect(t.started.get('sundial')).toBeUndefined();
  });

  it('stops teaching what the player already did, but still answers a hover', () => {
    const t = new AffordanceTracker();
    const done = { ...dial, done: true };
    run(300, () => t.update(DT, [done], () => ({ at: { x: 10, y: 8 }, speed: 0 }), null));
    expect(t.started.get('sundial')).toBeUndefined();
    t.update(DT, [done], () => ({ at: { x: 10, y: 8 }, speed: 0 }), 'sundial');
    expect(t.started.get('sundial')).toBe(1);
    expect(t.glint('sundial')).toBe(1);
    expect(t.hovered('sundial')).toBe(true);
  });

  it('wobbles back and forth inside its envelope', () => {
    expect(wobbleEnvelope(-0.1)).toBe(0);
    expect(wobbleEnvelope(HINT.wobbleSeconds)).toBe(0);
    expect(wobbleEnvelope(HINT.wobbleSeconds / 2)).toBeCloseTo(1);
    const t = new AffordanceTracker();
    t.update(DT, [dial], () => null, 'sundial');
    const seen: number[] = [];
    run(40, () => {
      t.update(DT, [dial], () => null, 'sundial');
      seen.push(t.wobble('sundial'));
    });
    expect(Math.max(...seen)).toBeGreaterThan(0.3);
    expect(Math.min(...seen)).toBeLessThan(-0.3);
  });
});

/** Run a scheduler for `seconds` with a demo always on offer. */
function idleFor(s: GhostScheduler, seconds: number, offer: DemoKind[] = [...DEMO_ORDER]): GhostScheduler {
  const stage = (allowed: DemoKind[]): GhostScript | null => {
    const k = chooseDemo(allowed, offer, s.shown);
    return k ? { ...leverDemo({ x: 500, y: 500 }), kind: k } : null;
  };
  run(Math.round(seconds / DT), () => s.update(DT, false, stage));
  return s;
}

describe('ghost-hand demos', () => {
  it('waits for a long idle stretch before showing one', () => {
    const s = new GhostScheduler();
    idleFor(s, GHOST.idleSeconds - 1);
    expect(s.active).toBeNull();
    idleFor(s, 1.1);
    expect(s.active?.script.kind).toBe('dial');
  });

  it('stops the moment the player does anything', () => {
    const s = idleFor(new GhostScheduler(), GHOST.idleSeconds + 0.5);
    expect(s.active).not.toBeNull();
    s.input();
    expect(s.active).toBeNull();
    expect(s.stopped).toBe(1);
    expect(s.update(DT, false, () => leverDemo({ x: 0, y: 0 }))).toBeNull();
  });

  it('shows one per idle stretch, with a long gap between them', () => {
    const s = idleFor(new GhostScheduler(), GHOST.idleSeconds + 10);
    expect(s.shown.get('dial')).toBe(1);
    idleFor(s, 200);
    // Still the same idle stretch: no second demo, however long it lasts.
    expect([...s.shown.values()].reduce((a, b) => a + b, 0)).toBe(1);
    s.input();
    idleFor(s, GHOST.idleSeconds + 1);
    expect(s.active?.script.kind).toBe('pocket');
    // Right after one ends, the next stretch waits out the cooldown.
    const fresh = idleFor(new GhostScheduler(), GHOST.idleSeconds + 1);
    fresh.input();
    idleFor(fresh, GHOST.idleSeconds + 1);
    expect(fresh.active).toBeNull();
  });

  it('never shows what the player has done, and each demo at most twice', () => {
    const s = new GhostScheduler();
    s.markDone('dial');
    for (let i = 0; i < 20; i++) {
      s.input();
      idleFor(s, Math.max(GHOST.idleSeconds, GHOST.cooldownSeconds) + 6, ['dial', 'pocket']);
    }
    expect(s.shown.get('dial')).toBeUndefined();
    expect(s.shown.get('pocket')).toBe(GHOST.perKind);
    expect(s.allowed()).not.toContain('pocket');
  });

  it('shows nothing while blocked, and drops a running demo', () => {
    const s = idleFor(new GhostScheduler(), GHOST.idleSeconds + 0.5);
    s.update(DT, true, () => null);
    expect(s.active).toBeNull();
    const t = new GhostScheduler();
    run(Math.round((GHOST.idleSeconds + 5) / DT), () => t.update(DT, true, () => leverDemo({ x: 0, y: 0 })));
    expect(t.active).toBeNull();
  });

  it('only offers demos staged on screen, the least shown first', () => {
    expect(chooseDemo(['dial', 'pocket'], ['pocket'], new Map())).toBe('pocket');
    expect(chooseDemo(['dial', 'pocket'], ['dial', 'pocket'], new Map([['dial', 1]]))).toBe('pocket');
    expect(chooseDemo(['dial'], ['pocket'], new Map())).toBeNull();
  });

  it('learns what the player did from sim events and from the save', () => {
    expect(demoDoneBy('time_skipped', {})).toBe('dial');
    expect(demoDoneBy('pocketed', {})).toBe('pocket');
    expect(demoDoneBy('cauldron_stirred', {})).toBe('cauldron');
    expect(demoDoneBy('bench_pulled', {})).toBe('lever');
    expect(demoDoneBy('sunflower_drank', {})).toBe('sunflower');
    expect(demoDoneBy('item_grabbed', { defId: 'item_lattice_panel' })).toBe('lattice');
    expect(demoDoneBy('item_grabbed', { defId: 'item_berry' })).toBeNull();
    expect(demoDoneBy('area_unlocked', { areaId: 'area_under_porch' })).toBe('lattice');
    expect(demoDoneBy('bug_fed', {})).toBeNull();
    expect(
      demosDoneIn({
        open: ['area_flowerbed_stage'],
        pocketUsed: true,
        brewed: 1,
        benchUsed: false,
        secrets: [],
      }).sort(),
    ).toEqual(['cauldron', 'pocket', 'sunflower']);
  });

  it('builds demos that fade in and out and act out each gesture', () => {
    const scripts = [
      dialDemo({ x: 900, y: 600 }, { rx: 96, ry: 34 }),
      pocketDemo({ x: 700, y: 800 }, { x: 960, y: 980 }, 'item_berry'),
      cauldronDemo({ x: 900, y: 660 }, { at: { x: 500, y: 800 }, defId: 'item_berry' }),
      cauldronDemo({ x: 900, y: 660 }, null),
      dragDemo('lattice', { x: 600, y: 500 }, 1),
      spongeDemo({ x: 1200, y: 850 }, { x: 300, y: 890 }, 'item_sponge'),
      leverDemo({ x: 1000, y: 570 }),
    ];
    for (const s of scripts) {
      const len = scriptLength(s);
      expect(len).toBeGreaterThan(2);
      expect(len).toBeLessThan(8);
      for (let i = 1; i < s.keys.length; i++) expect(s.keys[i]!.at).toBeGreaterThanOrEqual(s.keys[i - 1]!.at);
      expect(ghostAt(s, 0)!.alpha).toBe(0);
      expect(ghostAt(s, len / 2)!.alpha).toBeCloseTo(GHOST.alpha);
      expect(ghostAt(s, len + 0.01)).toBeNull();
      // Every demo grips something and lets go again.
      const poses = new Set(s.keys.map((k) => k.pose));
      expect(poses.has('grab') && poses.has('open')).toBe(true);
      // Reduce motion plays it slower, never faster.
      expect(ghostAt(s, len * 1.2, 1.5)).not.toBeNull();
    }
    const pocket = scripts[1]!;
    expect(pocket.keys.some((k) => k.tray && k.carry)).toBe(true);
    // The dial demo turns the rim clockwise (y grows on the left of the face going up, then right).
    const dial = scripts[0]!;
    const xs = dial.keys.filter((k) => k.pose === 'grab').map((k) => k.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(150);
    // The stir goes round twice.
    const stir = scripts[3]!.keys.filter((k) => k.pose === 'grab');
    const tops = stir.filter((k) => k.y < 660 - 30).length;
    expect(tops).toBeGreaterThanOrEqual(2);
  });
});

describe('discovery stamps', () => {
  const unlocks = (id: string) =>
    id === 'secret_find_whiff'
      ? [{ kind: 'bug', id: 'bug_stinkbug_whiff' }]
      : id === 'secret_unlock_flowerbed'
        ? [{ kind: 'area', id: 'area_flowerbed_stage' }]
        : [];

  it('derives a stamp for each secret, bug, area, blueprint, and recipe from saved data', () => {
    const stamps = stampsOf({
      secrets: ['secret_sun_shades', 'secret_find_whiff', 'secret_unlock_flowerbed', 'secret_first_potion'],
      unlocks,
      hinted: ['recipe_spring_shoe'],
      made: ['recipe_spring_shoe'],
    });
    expect(stamps.map((s) => s.kind)).toEqual(['secret', 'bug', 'area', 'potion', 'blueprint', 'recipe']);
    expect(new Set(stamps.map((s) => s.key)).size).toBe(stamps.length);
    expect(stamps[1]!.ref).toBe('bug_stinkbug_whiff');
  });

  it('finds only the new ones', () => {
    const before = stampsOf({ secrets: ['secret_sun_shades'], unlocks, hinted: [], made: [] });
    const after = stampsOf({
      secrets: ['secret_sun_shades', 'secret_stump_eyes'],
      unlocks,
      hinted: [],
      made: [],
    });
    const fresh = freshStamps(new Set(before.map((s) => s.key)), after);
    expect(fresh.map((s) => s.ref)).toEqual(['secret_stump_eyes']);
  });

  it('fades to 40 percent once the cursor has been away for 5 seconds', () => {
    expect(iconAlpha(0)).toBe(1);
    expect(iconAlpha(STAMP_UI.fadeAfter)).toBe(1);
    expect(iconAlpha(STAMP_UI.fadeAfter + 10)).toBeCloseTo(0.4);
    expect(iconAlpha(STAMP_UI.fadeAfter + STAMP_UI.fadeSeconds / 2)).toBeGreaterThan(0.4);
  });

  it('slams a stamp down big and settles it at full size', () => {
    expect(stampSlam(0).scale).toBeGreaterThan(2);
    expect(stampSlam(0.1).alpha).toBeGreaterThan(0.5);
    expect(stampSlam(2).scale).toBeCloseTo(1, 2);
    expect(Math.min(...[0.17, 0.2, 0.25].map((t) => stampSlam(t).scale))).toBeLessThan(1);
  });
});

describe('the home button hold', () => {
  it('acts only once the ring has filled under a held press', () => {
    const arm = new HoldArm();
    arm.press();
    let fired = 0;
    run(Math.floor(HOLD.seconds / DT) - 2, () => (fired += arm.update(DT) ? 1 : 0));
    expect(fired).toBe(0);
    run(10, () => (fired += arm.update(DT) ? 1 : 0));
    expect(fired).toBe(1);
    // Holding on does not fire again.
    run(60, () => (fired += arm.update(DT) ? 1 : 0));
    expect(fired).toBe(1);
  });

  it('drains and shakes "not yet" after a quick tap, and never fires without a press', () => {
    const arm = new HoldArm();
    arm.press();
    run(6, () => arm.update(DT));
    arm.release();
    expect(arm.shake).toBeGreaterThan(0);
    let fired = 0;
    run(120, () => (fired += arm.update(DT) ? 1 : 0));
    expect(fired).toBe(0);
    expect(arm.progress).toBe(0);
    arm.release();
    expect(arm.shake).toBe(0);
  });
});

describe('the sunflower barrier (R07)', () => {
  it('droops its head and its "water me" pictogram into the view the camera rests at', () => {
    const sim = Sim.create({ seed: 'sunflower-clue' });
    const b = sim.barriers.barrier('sunflower')!;
    const cam = new Camera(sim.worldWidth, VIEW_WIDTH_M);
    const span = sim.barriers.span();
    cam.setLimits(span.x0, span.x1);
    // Pan as far left as it goes and let it spring back to rest.
    cam.set(-100);
    for (let i = 0; i < 600; i++) cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(cam.restMin, 2);
    const left = cam.x * PIXELS_PER_METER;
    const right = left + VIEW_WIDTH_PX;
    const ground = sim.surfaceY(b.x) * PIXELS_PER_METER;
    for (const sway of [-14, 0, 14, 30]) {
      const clue = sunflowerClue(b.x * PIXELS_PER_METER, ground, 0, sway);
      // The whole head (70 px petals) and the whole pictogram bubble (26 px) are on screen.
      expect(clue.head.x - 80).toBeGreaterThan(left);
      expect(clue.hint.x - 30).toBeGreaterThan(left);
      expect(clue.hint.x + 30).toBeLessThan(right);
      expect(clue.hint.y - 30).toBeGreaterThan(0);
    }
    // Standing tall, the head is back over its root.
    const tall = sunflowerClue(b.x * PIXELS_PER_METER, ground, 1, 0);
    expect(tall.head.x).toBeCloseTo(b.x * PIXELS_PER_METER);
  });
});

describe('the cauldron invites a stir (R11)', () => {
  it('swings the ladle round a whole circle by itself after an ingredient, then rests', () => {
    expect(ladleInvite(0)).toBe(0);
    expect(ladleInvite(LADLE_INVITE.delay)).toBe(0);
    expect(ladleInvite(LADLE_INVITE.delay + LADLE_INVITE.turn)).toBeCloseTo(Math.PI * 2);
    // Resting: it stays put.
    expect(ladleInvite(LADLE_INVITE.delay + LADLE_INVITE.turn + 1)).toBeCloseTo(Math.PI * 2);
    // Always forward (clockwise).
    let last = 0;
    for (let t = 0; t < 12; t += 0.05) {
      const a = ladleInvite(t);
      expect(a).toBeGreaterThanOrEqual(last - 1e-9);
      last = a;
    }
    // Slower with reduce motion.
    expect(ladleInvite(LADLE_INVITE.delay + LADLE_INVITE.turn, 1.6)).toBeLessThan(Math.PI * 2);
  });

  it('shows a swirl of bubbles while the ladle goes round', () => {
    expect(swirlAmount(0)).toBe(0);
    expect(swirlAmount(LADLE_INVITE.delay + LADLE_INVITE.turn * 0.6)).toBeGreaterThan(0.5);
    expect(swirlAmount(LADLE_INVITE.delay + LADLE_INVITE.turn + LADLE_INVITE.rest * 0.9)).toBe(0);
  });

  it('turns the hand into a stirring fist over a cauldron with something in it', () => {
    const s = { mode: 'none' as const, holding: false, overGrabbable: false, overButton: false };
    expect(cursorPose({ ...s, overFixture: true, overStir: true })).toBe('stir');
    expect(cursorPose({ ...s, overFixture: true })).toBe('hover_poke');
    expect(cursorPose({ ...s, mode: 'stir' })).toBe('stir');
    expect(cursorPose({ ...s, overStir: true, overButton: true })).toBe('hover_poke');
  });
});

describe('the sundial invites a turn (R06)', () => {
  it('twitches its shadow forward a little and settles back', () => {
    expect(twitchCurve(0)).toBe(0);
    expect(twitchCurve(1)).toBe(0);
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => twitchCurve(i / 50)));
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(0.25);
  });

  it('glints the notch the sweep is passing, and not the far side', () => {
    expect(notchShine(1, 1)).toBeCloseTo(1);
    expect(notchShine(1 + Math.PI, 1)).toBe(0);
    expect(notchShine(1.6, 1)).toBeLessThan(0.3);
  });
});
