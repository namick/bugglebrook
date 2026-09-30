import type { BugMode } from '../../../game/core/entities';

export interface BugPoseInput {
  mode: BugMode;
  vx: number;
  vy: number;
  /** Seconds since start, for idle animation. */
  time: number;
  /** Per-bug phase offset so bugs do not animate in lockstep. */
  phase: number;
  /** Ticks left in the current mode (for timed wiggles). */
  timer?: number;
  /** Walking speed of this species in m/s, to pace the legs. */
  walkSpeed?: number;
}

export interface BugPose {
  /** Horizontal and vertical scale for breathing and gait. */
  sx: number;
  sy: number;
  /** Body rotation in radians. */
  tilt: number;
  /** Vertical bob in pixels (negative is up). */
  bob: number;
  /** Leg animation phase in radians. */
  legPhase: number;
  /** How far legs swing, 0 (still) to 1 (full stride). */
  stride: number;
  /** Eye openness, 0 closed to 1 open. */
  eyeOpen: number;
  dizzy: boolean;
  /** Flailing legs: held or flying. */
  flail: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Cheap deterministic hash to [0, 1). */
export function hash01(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Blinks every few seconds at pseudo-random moments: one blink per 4 s
 * bucket, at a hashed offset, so gaps range from about 1 to 7 s.
 */
export function blinkAmount(time: number, phase: number): number {
  const bucket = Math.floor(time / 4);
  const at = bucket * 4 + 0.3 + hash01(bucket, phase) * 3.4;
  const d = time - at;
  if (d < 0 || d > 0.16) return 0;
  // Close fast, open a touch slower.
  return d < 0.06 ? d / 0.06 : 1 - (d - 0.06) / 0.1;
}

/**
 * Compute a bug's cartoon pose from its sim state. Pure so it can be tested
 * and so the renderer stays a thin layer. Scales keep volume roughly
 * constant: stretching tall makes the bug thinner.
 */
export function bugPose(input: BugPoseInput): BugPose {
  const t = input.time + input.phase;
  const speed = Math.hypot(input.vx, input.vy);
  let sx = 1;
  let sy = 1;
  let tilt = 0;
  let bob = 0;
  let legPhase = 0;
  let stride = 0;
  let flail = false;

  // Playing, riding, and sniffing look like walking while moving, and like standing otherwise.
  let mode = input.mode;
  if (mode === 'st_use') mode = 'st_airborne';
  else if (mode === 'st_ride') mode = 'st_idle';
  else if (mode === 'st_social' || mode === 'st_hide')
    mode = speed > 0.3 ? 'st_wander' : mode === 'st_hide' ? 'st_hide' : 'st_idle';

  switch (mode) {
    case 'st_sleep': {
      // Slow, deep breaths, sunk low, eyes shut.
      const breath = (Math.sin(t * Math.PI * 2 * 0.22) + 1) / 2;
      sy = 0.9 + 0.06 * breath;
      sx = 1.06 - 0.02 * breath;
      bob = 2;
      break;
    }
    case 'st_hide':
      // Crouched low behind cover, trembling a little.
      sy = 0.84;
      sx = 1.08;
      tilt = Math.sin(t * 40) * 0.015;
      bob = 3;
      break;
    case 'st_perform': {
      // Chest out, a proud little sway.
      sy = 1.06;
      sx = 0.97;
      tilt = -0.1 + Math.sin(t * 3) * 0.04;
      break;
    }
    case 'st_idle':
    case 'st_react':
    case 'st_recover':
    case 'st_landing': {
      // Breathing: 1.0 to 1.03 tall at 0.3 Hz.
      const breath = (Math.sin(t * Math.PI * 2 * 0.3) + 1) / 2;
      sy = 1 + 0.03 * breath;
      sx = 1 / Math.sqrt(sy);
      if (input.mode === 'st_recover') tilt = Math.sin(t * 22) * 0.12; // shaking it off
      if (input.mode === 'st_react') {
        const wiggle = Math.sin(t * 30) * 0.06;
        tilt = wiggle;
        sy *= 1.04;
      }
      break;
    }
    case 'st_wander':
    case 'st_seek': {
      const pace = Math.max(0.3, input.walkSpeed ?? 1) * 7;
      legPhase = t * pace;
      stride = clamp(speed / Math.max(0.3, input.walkSpeed ?? 1), 0, 1);
      bob = -Math.abs(Math.sin(legPhase)) * 4 * stride;
      tilt = Math.sin(legPhase) * 0.04 * stride;
      sy = 1 + 0.025 * Math.sin(legPhase * 2) * stride;
      sx = 1 / sy;
      break;
    }
    case 'st_eat': {
      // Three chews: a little squash on each bite.
      const chew = Math.max(0, Math.sin(t * 12));
      sx = 1 + 0.08 * chew;
      sy = 1 - 0.05 * chew;
      tilt = 0.08;
      break;
    }
    case 'st_held':
      flail = true;
      legPhase = t * 26;
      stride = 1;
      tilt = Math.sin(t * 5) * 0.1;
      break;
    case 'st_airborne':
      flail = true;
      legPhase = t * 20;
      stride = 1;
      break;
    case 'st_swim':
      // Paddling: legs churn, the body bobs and rocks on the water.
      flail = true;
      legPhase = t * 11;
      stride = 0.8;
      bob = Math.sin(t * 4.2) * 3;
      tilt = Math.sin(t * 2.1) * 0.07;
      break;
    case 'st_dizzy':
      tilt = Math.sin(t * 3.5) * 0.18;
      legPhase = t * 4;
      stride = 0.5;
      bob = -Math.abs(Math.sin(t * 3.5)) * 3;
      break;
  }

  const blink = input.mode === 'st_dizzy' ? 0 : blinkAmount(input.time, input.phase);
  return {
    sx,
    sy,
    tilt,
    bob,
    legPhase,
    stride,
    eyeOpen: input.mode === 'st_sleep' ? 0 : 1 - blink,
    dizzy: input.mode === 'st_dizzy',
    flail,
  };
}
