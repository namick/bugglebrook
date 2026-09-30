import type { BugMode } from '../../../game/core/entities';

export interface BugPoseInput {
  mode: BugMode;
  vx: number;
  vy: number;
  /** Seconds since start, for idle animation. */
  time: number;
  /** Landing squash, 0 (none) to 1 (full), decays in the renderer. */
  squash: number;
  /** Per-bug phase offset so bugs do not animate in lockstep. */
  phase: number;
}

export interface BugPose {
  /** Horizontal and vertical scale for squash and stretch. */
  sx: number;
  sy: number;
  /** Body rotation in radians. */
  tilt: number;
  /** Vertical bob in pixels (negative is up). */
  bob: number;
  /** Leg animation phase in radians. */
  legPhase: number;
  /** Eye openness, 0 closed to 1 open. */
  eyeOpen: number;
  dizzy: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Compute a bug's cartoon pose from its sim state. Pure so it can be tested
 * and so the renderer stays a thin layer. Volume is roughly preserved:
 * stretching tall makes the bug thinner and squashing makes it wider.
 */
export function bugPose(input: BugPoseInput): BugPose {
  const t = input.time + input.phase;
  let sx = 1;
  let sy = 1;
  let tilt = 0;
  let bob = 0;
  let legPhase = 0;

  switch (input.mode) {
    case 'idle':
      sy = 1 + 0.035 * Math.sin(t * 3);
      sx = 1 - 0.02 * Math.sin(t * 3);
      legPhase = Math.sin(t * 1.5) * 0.2;
      break;
    case 'walk':
      bob = -Math.abs(Math.sin(t * 11)) * 5;
      legPhase = t * 11;
      tilt = Math.sin(t * 11) * 0.05;
      break;
    case 'held':
      legPhase = t * 28;
      sy = 1.08 + 0.03 * Math.sin(t * 20);
      sx = 1 / sy;
      break;
    case 'tumble': {
      const stretch = clamp(Math.hypot(input.vx, input.vy) / 30, 0, 0.3);
      sy = 1 + stretch;
      sx = 1 - stretch * 0.5;
      tilt = clamp(input.vx * 0.04, -0.6, 0.6);
      legPhase = t * 20;
      break;
    }
    case 'dizzy':
      tilt = Math.sin(t * 4) * 0.15;
      legPhase = Math.sin(t * 2) * 0.3;
      break;
  }

  const squash = clamp(input.squash, 0, 1);
  sy *= 1 - 0.4 * squash;
  sx *= 1 + 0.4 * squash;

  const blinking = input.mode !== 'dizzy' && t % 3.7 < 0.12;
  return {
    sx,
    sy,
    tilt,
    bob,
    legPhase,
    eyeOpen: blinking ? 0.1 : 1,
    dizzy: input.mode === 'dizzy',
  };
}
