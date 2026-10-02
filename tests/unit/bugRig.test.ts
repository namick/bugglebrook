import { describe, expect, it } from 'vitest';
import { BUGS } from '../../src/game/data';
import type { BugArt } from '../../src/game/data/types';
import {
  REST_FRAME,
  REST_POSE,
  antennaPaths,
  facePlacement,
  legJoints,
  rigFor,
  sampleFeeler,
  walkJoints,
  wingState,
} from '../../src/renderer/src/render/rig/bugRig';

const def = (art: BugArt) => BUGS.all.find((d) => d.art === art)!;
const near = (v: number, want: number): void => expect(v).toBeCloseTo(want, 6);

describe('bug rig', () => {
  it("pins Dot's joints where the code-drawn ladybug puts them", () => {
    const rig = rigFor(def('ladybug'));
    expect(rig.r).toBe(50);
    expect(rig.hinge).toEqual({ x: 22.5, y: -5 });
    const legs = legJoints(rig, REST_POSE, REST_FRAME);
    expect(legs).toHaveLength(6);
    expect(legs.filter((l) => l.far)).toHaveLength(3);
    // The near front leg: hip under the head, knee bent forward, foot on the ground.
    const front = legs[5]!;
    near(front.hip.x, 19);
    near(front.hip.y, 25);
    near(front.knee.x, 26);
    near(front.knee.y, 28.5);
    near(front.foot.y, 50);
    // Held: the legs dangle above the ground.
    const held = legJoints(rig, { ...REST_POSE, flail: true }, REST_FRAME);
    for (const l of held) expect(l.foot.y).toBeLessThanOrEqual(50 + 1e-9);
  });

  it('pins feelers and the face for Dot', () => {
    const rig = rigFor(def('ladybug'));
    const feelers = antennaPaths(
      rig,
      REST_FRAME,
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      'normal',
    );
    expect(feelers).toHaveLength(2);
    near(feelers[1]!.pts[0]!.x, 47.5);
    near(feelers[1]!.pts[0]!.y, -14);
    const pts = sampleFeeler(feelers[1]!, 8);
    expect(pts[0]).toEqual(feelers[1]!.pts[0]);
    expect(pts[8]!.x).toBeCloseTo(feelers[1]!.pts[2]!.x, 6);
    // Curled or in a shell, no feelers.
    expect(antennaPaths(rig, REST_FRAME, [], 'curled')).toEqual([]);
    const face = facePlacement(rig, def('ladybug'), REST_FRAME, [], 'normal')!;
    expect(face.eyes.map((e) => [e.x, e.y, e.r, e.far])).toEqual([
      [30, -1, 12.5, true],
      [49, 0, 15, false],
    ]);
    expect(face.mouth).toMatchObject({ x: 48.5, y: 19, color: 0xffb3c6 });
    expect(facePlacement(rig, def('ladybug'), REST_FRAME, [], 'curled')).toBeNull();
  });

  it('opens the shell and flaps the wings only while flying', () => {
    const rig = rigFor(def('ladybug'));
    expect(wingState(rig, REST_FRAME, 'normal')).toEqual({ shellAngle: 0, wings: [] });
    const fly = wingState(rig, { ...REST_FRAME, time: 0.1 }, 'flying');
    expect(fly.shellAngle).toBe(-0.55);
    expect(fly.wings).toHaveLength(2);
  });

  it('gives Skeet long and short legs and Boing a hind leg per side', () => {
    const skeet = legJoints(rigFor(def('strider')), REST_POSE, REST_FRAME);
    expect(skeet.map((l) => l.part)).toEqual(['leg_long', 'leg_long', 'leg', 'leg_long', 'leg_long', 'leg']);
    const boing = legJoints(rigFor(def('grasshopper')), REST_POSE, { ...REST_FRAME, hopping: true });
    const hind = boing.filter((l) => l.part === 'hindleg');
    expect(hind).toHaveLength(2);
    // Kicked straight out behind while hopping.
    expect(hind[1]!.foot.x).toBeCloseTo(-100, 6);
  });

  it('steps the painters’ walking legs in a tripod gait', () => {
    const spec = {
      r: 44,
      hips: [
        [-30, 22],
        [-8, 23],
        [13, 22],
      ] as const,
      farShift: [5, -2] as const,
      ground: 44,
    };
    const rest = walkJoints(REST_POSE, spec);
    expect(rest).toHaveLength(6);
    for (const j of rest) expect(j.foot[1]).toBe(44);
    const walk = walkJoints({ ...REST_POSE, stride: 1, legPhase: 1 }, spec);
    expect(walk.some((j) => j.foot[1] < 44)).toBe(true);
  });

  it('lists every bug’s art layers, matching the art guide’s counts', () => {
    const counts: Record<string, number> = {
      bug_ladybug_dot: 8,
      bug_pillbug_rollo: 9,
      bug_snail_glorp: 4,
      bug_waterstrider_skeet: 7,
      bug_grasshopper_boing: 7,
      bug_firefly_flick: 10,
      bug_stinkbug_whiff: 8,
      bug_stagbeetle_moose: 9,
      bug_dungbeetle_barty: 11,
      bug_caterpillar_munch: 15,
      bug_mantis_prim: 10,
      bug_stickinsect_twig: 4,
      bug_bee_buzzby: 8,
      bug_cricket_fiddle: 9,
      bug_moth_luma: 8,
    };
    for (const d of BUGS.all) {
      const rig = rigFor(d);
      const names = rig.parts.map((p) => p.name);
      expect(names.length, d.id).toBe(counts[d.id]);
      expect(new Set(names).size, d.id).toBe(names.length);
      for (const p of rig.parts) {
        expect(Number.isFinite(p.pivot.x) && Number.isFinite(p.pivot.y), `${d.id} ${p.name}`).toBe(true);
        if (p.kind === 'limb_upper' || p.kind === 'limb_lower' || p.kind === 'rope')
          expect(p.length, `${d.id} ${p.name}`).toBeGreaterThan(1);
        expect(p.name).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    expect(
      rigFor(BUGS.get('bug_dungbeetle_barty'))
        .parts.filter((p) => p.tintable)
        .map((p) => p.name),
    ).toEqual(['shell_tint', 'thorax_tint', 'head_tint', 'ball_tint']);
    expect(rigFor(BUGS.get('bug_stickinsect_twig')).foot).toBeCloseTo(7, 6);
  });
});
