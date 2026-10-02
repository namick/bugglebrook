/**
 * Ghost-hand demos. When the player has left the hand alone for a while, a
 * faint second hand shows one gesture near something on screen that the
 * player has not found yet: turning the sundial's rim, putting a thing in
 * the pocket, dropping something in the cauldron and stirring, dragging the
 * lattice, wetting the sunflower with the sponge, or pulling the bench's
 * lever. It never touches the world (no commands), vanishes the moment the
 * player does anything, never shows what the player has already done, and
 * is rare: one per idle stretch, a long wait between them, and each demo at
 * most twice a session.
 *
 * Pure: `Game` tells it about input and discoveries, offers the demos it can
 * stage on screen, and draws the frame it returns.
 */

export type DemoKind =
  'feed' | 'fling' | 'tickle' | 'shake' | 'dial' | 'pocket' | 'cauldron' | 'lattice' | 'sunflower' | 'lever';

/** Most useful first: the core verbs, then the plaza's own toys, then the barriers. */
export const DEMO_ORDER: readonly DemoKind[] = [
  'feed',
  'fling',
  'tickle',
  'shake',
  'dial',
  'pocket',
  'cauldron',
  'lever',
  'sunflower',
  'lattice',
];

export const GHOST = {
  /** Seconds without any input before a demo may start. */
  idleSeconds: 25,
  /** Seconds after one demo before the next may start. */
  cooldownSeconds: 90,
  /** Each demo shows at most this many times a session. */
  perKind: 2,
  fadeIn: 0.4,
  fadeOut: 0.5,
  /** How see-through the ghost is at its brightest. */
  alpha: 0.7,
} as const;

/**
 * The guided start (playtest F3): in a new world, right after the first
 * scene's camera slide, the core verbs nobody can see (feeding, flinging,
 * the tickle, the shake) are demoed one after another whenever the player
 * pauses for a moment. Any input stops a demo; doing the gesture or the skip
 * button ends that part. It is the same ghost, just sooner and in order.
 */
export const GUIDE = {
  order: ['feed', 'fling', 'tickle', 'shake'] as readonly DemoKind[],
  /** Seconds without input before a guided demo. */
  idleSeconds: 4,
  /** Seconds between guided demos. */
  gapSeconds: 2.5,
  /** The guide begins this long into the first scene (after the fade and the camera slide). */
  startAt: 4.5,
} as const;

export type GhostPose = 'open' | 'hover_grab' | 'grab';

export interface Pt {
  x: number;
  y: number;
}

/** A point on a demo's path: by `at` seconds the hand is here, in this pose. */
export interface GhostKey extends Pt {
  at: number;
  pose: GhostPose;
  /** Carrying the ghost of the thing it picked up. */
  carry?: boolean;
  /** The pocket tray is up (the pocket demo). */
  tray?: boolean;
}

export interface GhostScript {
  kind: DemoKind;
  /** The thing it pretends to carry (an item def), if any. */
  carryDef: string | null;
  keys: GhostKey[];
}

export interface GhostFrame extends Pt {
  kind: DemoKind;
  pose: GhostPose;
  alpha: number;
  carry: string | null;
  tray: boolean;
  /** 0 to 1 through the demo. */
  progress: number;
}

export function scriptLength(s: GhostScript): number {
  return s.keys[s.keys.length - 1]?.at ?? 0;
}

const ease = (u: number): number => u * u * (3 - 2 * u);

/** Where the ghost is `t` seconds into a script, or null once it is over. */
export function ghostAt(s: GhostScript, t: number, slow = 1): GhostFrame | null {
  const time = t / slow;
  const len = scriptLength(s);
  if (time < 0 || time > len || s.keys.length === 0) return null;
  let i = 0;
  while (i < s.keys.length - 1 && s.keys[i + 1]!.at <= time) i++;
  const a = s.keys[i]!;
  const b = s.keys[Math.min(i + 1, s.keys.length - 1)]!;
  const u = b.at > a.at ? ease(Math.max(0, Math.min(1, (time - a.at) / (b.at - a.at)))) : 1;
  const alpha =
    GHOST.alpha * Math.min(1, time / GHOST.fadeIn, (len - time) / GHOST.fadeOut) * (time >= len ? 0 : 1);
  return {
    kind: s.kind,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    pose: a.pose,
    alpha: Math.max(0, alpha),
    carry: a.carry ? s.carryDef : null,
    tray: !!a.tray,
    progress: len > 0 ? time / len : 1,
  };
}

/** Keys round an ellipse, clockwise on screen (y down), from angle `a0` for `sweep` radians. */
function around(c: Pt, rx: number, ry: number, a0: number, sweep: number, t0: number, t1: number, n = 14) {
  const out: GhostKey[] = [];
  for (let k = 1; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    out.push({
      at: t0 + ((t1 - t0) * k) / n,
      x: c.x + Math.cos(a) * rx,
      y: c.y + Math.sin(a) * ry,
      pose: 'grab',
    });
  }
  return out;
}

/** Reach in from a little below and to the right, rest, then grip. Returns the keys and when it gripped. */
function reach(at: Pt, t0 = 0): GhostKey[] {
  return [
    { at: t0, x: at.x + 70, y: at.y + 60, pose: 'open' },
    { at: t0 + 0.7, x: at.x, y: at.y, pose: 'hover_grab' },
    { at: t0 + 1.0, x: at.x, y: at.y, pose: 'grab' },
  ];
}

/** Let go and float away, so the end reads as "now you". */
function letGo(at: Pt, t0: number): GhostKey[] {
  return [
    { at: t0, x: at.x, y: at.y, pose: 'open' },
    { at: t0 + 0.9, x: at.x + 30, y: at.y - 40, pose: 'open' },
  ];
}

/** The sundial: grip the rim and turn it clockwise, a little over half a turn. `rim` is the face's radii. */
export function dialDemo(center: Pt, rim: { rx: number; ry: number }): GhostScript {
  const a0 = Math.PI * 0.85;
  const start = { x: center.x + Math.cos(a0) * rim.rx, y: center.y + Math.sin(a0) * rim.ry };
  const sweep = Math.PI * 1.15;
  const end = { x: center.x + Math.cos(a0 + sweep) * rim.rx, y: center.y + Math.sin(a0 + sweep) * rim.ry };
  return {
    kind: 'dial',
    carryDef: null,
    keys: [...reach(start), ...around(center, rim.rx, rim.ry, a0, sweep, 1.1, 3.0), ...letGo(end, 3.2)],
  };
}

/** The pocket: pick up a small thing and let go of it over a pocket (the tray slides up to meet it). */
export function pocketDemo(item: Pt, slot: Pt, defId: string): GhostScript {
  const keys: GhostKey[] = reach(item);
  keys.push(
    { at: 1.15, x: item.x, y: item.y - 30, pose: 'grab', carry: true, tray: true },
    { at: 2.5, x: slot.x, y: slot.y - 20, pose: 'grab', carry: true, tray: true },
    { at: 2.8, x: slot.x, y: slot.y, pose: 'open', tray: true },
    { at: 3.6, x: slot.x + 20, y: slot.y - 60, pose: 'open', tray: true },
    { at: 3.9, x: slot.x + 30, y: slot.y - 80, pose: 'open' },
  );
  return { kind: 'pocket', carryDef: defId, keys };
}

/**
 * The cauldron: carry something over and drop it in (when there is something
 * to carry), then take the ladle and stir two circles.
 */
export function cauldronDemo(mouth: Pt, item: { at: Pt; defId: string } | null): GhostScript {
  const keys: GhostKey[] = [];
  let t = 0;
  if (item) {
    keys.push(...reach(item.at));
    keys.push(
      { at: 1.15, x: item.at.x, y: item.at.y - 40, pose: 'grab', carry: true },
      { at: 2.4, x: mouth.x, y: mouth.y - 110, pose: 'grab', carry: true },
      { at: 2.7, x: mouth.x, y: mouth.y - 110, pose: 'open' },
    );
    t = 2.9;
  }
  const r = { rx: 95, ry: 32 };
  const a0 = -Math.PI / 2;
  const start = { x: mouth.x + Math.cos(a0) * r.rx, y: mouth.y + Math.sin(a0) * r.ry };
  if (item) keys.push({ at: t, x: (mouth.x + start.x) / 2, y: mouth.y - 90, pose: 'open' });
  keys.push(...reach(start, item ? t + 0.2 : 0).slice(item ? 1 : 0));
  const g = keys[keys.length - 1]!.at;
  keys.push(...around(mouth, r.rx, r.ry, a0, Math.PI * 4, g + 0.1, g + 2.7, 24));
  keys.push(...letGo(start, g + 2.9));
  return { kind: 'cauldron', carryDef: item?.defId ?? null, keys };
}

/** Drag a big thing slowly sideways (the lattice): `dir` is which way it should go. */
export function dragDemo(kind: 'lattice', at: Pt, dir: 1 | -1, distance = 170): GhostScript {
  const to = { x: at.x + dir * distance, y: at.y };
  return {
    kind,
    carryDef: null,
    keys: [
      ...reach(at),
      { at: 1.4, x: at.x + dir * 20, y: at.y, pose: 'grab' },
      { at: 3.0, x: to.x, y: to.y, pose: 'grab' },
      ...letGo(to, 3.2),
    ],
  };
}

/** Carry the sponge to the thirsty sunflower's soil and let go over it. */
export function spongeDemo(sponge: Pt, soil: Pt, defId: string): GhostScript {
  return {
    kind: 'sunflower',
    carryDef: defId,
    keys: [
      ...reach(sponge),
      { at: 1.15, x: sponge.x, y: sponge.y - 40, pose: 'grab', carry: true },
      { at: 2.7, x: soil.x, y: soil.y - 90, pose: 'grab', carry: true },
      ...letGo({ x: soil.x, y: soil.y - 90 }, 3.0),
    ],
  };
}

/** Pull the bench's lever down. */
export function leverDemo(knob: Pt): GhostScript {
  const down = { x: knob.x + 10, y: knob.y + 95 };
  return {
    kind: 'lever',
    carryDef: null,
    keys: [...reach(knob), { at: 1.9, x: down.x, y: down.y, pose: 'grab' }, ...letGo(down, 2.2)],
  };
}

/** Feed a bug: carry a food to its mouth and let go there. */
export function feedDemo(food: Pt, mouth: Pt, defId: string): GhostScript {
  return {
    kind: 'feed',
    carryDef: defId,
    keys: [
      ...reach(food),
      { at: 1.15, x: food.x, y: food.y - 50, pose: 'grab', carry: true },
      { at: 2.5, x: mouth.x, y: mouth.y - 20, pose: 'grab', carry: true },
      { at: 2.8, x: mouth.x, y: mouth.y - 10, pose: 'grab', carry: true },
      ...letGo({ x: mouth.x, y: mouth.y - 10 }, 3.0),
    ],
  };
}

/** Fling a thing: wind back a little, then a quick swoop up and away, letting go mid-swoop. */
export function flingDemo(item: Pt, defId: string, dir: 1 | -1 = 1): GhostScript {
  const back = { x: item.x - dir * 50, y: item.y + 10 };
  const out = { x: item.x + dir * 230, y: item.y - 200 };
  return {
    kind: 'fling',
    carryDef: defId,
    keys: [
      ...reach(item),
      { at: 1.6, x: back.x, y: back.y, pose: 'grab', carry: true },
      { at: 1.8, x: item.x + dir * 110, y: item.y - 90, pose: 'grab', carry: true },
      { at: 1.95, x: out.x, y: out.y, pose: 'open' },
      { at: 2.9, x: out.x + dir * 20, y: out.y - 30, pose: 'open' },
    ],
  };
}

/** Tickle a bug: press on it and hold still, the fingers wiggling a little. */
export function tickleDemo(bug: Pt): GhostScript {
  const keys: GhostKey[] = reach(bug);
  for (let k = 1; k <= 12; k++)
    keys.push({ at: 1.0 + k * 0.17, x: bug.x + (k % 2 ? 3 : -3), y: bug.y + (k % 3) - 1, pose: 'grab' });
  keys.push(...letGo(bug, 3.2));
  return { kind: 'tickle', carryDef: null, keys };
}

/** Shake a held thing: pick it up and swing it back and forth three times, fast. */
export function shakeDemo(item: Pt, defId: string): GhostScript {
  const up = { x: item.x, y: item.y - 70 };
  const keys: GhostKey[] = [...reach(item), { at: 1.4, x: up.x, y: up.y, pose: 'grab', carry: true }];
  for (let k = 1; k <= 6; k++)
    keys.push({ at: 1.4 + k * 0.13, x: up.x + (k % 2 ? 70 : -70), y: up.y, pose: 'grab', carry: true });
  keys.push({ at: 2.4, x: up.x, y: up.y, pose: 'grab', carry: true }, ...letGo(up, 2.6));
  return { kind: 'shake', carryDef: defId, keys };
}

/** The sim events that mean the player found a demo's gesture. */
export function demoDoneBy(name: string, payload: unknown): DemoKind | null {
  const p = (payload ?? {}) as { areaId?: string; defId?: string; byPlayer?: boolean; flung?: boolean };
  switch (name) {
    case 'bug_fed':
      return p.byPlayer ? 'feed' : null;
    case 'item_dropped':
      return p.flung ? 'fling' : null;
    case 'bug_tickled':
      return 'tickle';
    case 'item_shaken':
      return 'shake';
    case 'time_skipped':
      return 'dial';
    case 'pocketed':
      return 'pocket';
    case 'cauldron_stirred':
    case 'potion_brewed':
      return 'cauldron';
    case 'bench_pulled':
      return 'lever';
    case 'sunflower_drank':
      return 'sunflower';
    case 'item_grabbed':
      return p.defId === 'item_lattice_panel' ? 'lattice' : null;
    case 'area_unlocked':
      return p.areaId === 'area_under_porch'
        ? 'lattice'
        : p.areaId === 'area_flowerbed_stage'
          ? 'sunflower'
          : null;
    default:
      return null;
  }
}

/** What a loaded world shows the player has already done. */
export interface WorldDone {
  open: readonly string[];
  pocketUsed: boolean;
  brewed: number;
  benchUsed: boolean;
  secrets: readonly string[];
}

export function demosDoneIn(w: WorldDone): DemoKind[] {
  const out: DemoKind[] = [];
  if (w.secrets.includes('secret_sundial_midnight')) out.push('dial');
  if (w.pocketUsed) out.push('pocket');
  if (w.brewed > 0) out.push('cauldron');
  if (w.benchUsed) out.push('lever');
  if (w.open.includes('area_flowerbed_stage')) out.push('sunflower');
  if (w.open.includes('area_under_porch')) out.push('lattice');
  return out;
}

/** Pick a demo: the least shown of those on screen, in `DEMO_ORDER` on a tie. */
export function chooseDemo(
  allowed: readonly DemoKind[],
  onScreen: readonly DemoKind[],
  shown: ReadonlyMap<DemoKind, number>,
): DemoKind | null {
  let best: DemoKind | null = null;
  for (const k of DEMO_ORDER) {
    if (!allowed.includes(k) || !onScreen.includes(k)) continue;
    if (best === null || (shown.get(k) ?? 0) < (shown.get(best) ?? 0)) best = k;
  }
  return best;
}

export class GhostScheduler {
  /** Seconds since the player last did anything. */
  idle = 0;
  /** Seconds of idling before a demo (tests shorten it). */
  idleStart: number = GHOST.idleSeconds;
  /** Seconds between demos (the screenshot tour shortens it). */
  cooldown: number = GHOST.cooldownSeconds;
  /** Seconds since the last demo ended (or was stopped). */
  sinceEnd = Infinity;
  active: { script: GhostScript; t: number } | null = null;
  readonly shown = new Map<DemoKind, number>();
  readonly done = new Set<DemoKind>();
  /** Demos stopped early by input, for the test hook. */
  stopped = 0;
  /** A demo already ran in this idle stretch. */
  private usedThisIdle = false;
  /** The guided start's demos still to show, in order, or null when there is no guide (F3). */
  guide: DemoKind[] | null = null;

  /** Start the guided start: the core verbs the player has not done yet. */
  startGuide(): void {
    this.guide = GUIDE.order.filter((k) => !this.done.has(k));
    if (this.guide.length === 0) this.guide = null;
  }

  /** The skip button: no more guided demos (the ordinary, rarer ones stay). */
  skipGuide(): void {
    this.guide = null;
    if (this.active && GUIDE.order.includes(this.active.script.kind)) {
      this.active = null;
      this.sinceEnd = 0;
    }
  }

  /** Is a guided demo still to come? */
  get guiding(): boolean {
    return this.guide !== null && this.guide.length > 0;
  }

  /** The player did something: stop any demo now and start counting again. */
  input(): void {
    this.idle = 0;
    this.usedThisIdle = false;
    if (this.active) {
      this.active = null;
      this.sinceEnd = 0;
      this.stopped++;
    }
  }

  /** The player found this gesture: never demo it again. */
  markDone(kind: DemoKind): void {
    this.done.add(kind);
    if (this.guide) {
      this.guide = this.guide.filter((k) => k !== kind);
      if (this.guide.length === 0) this.guide = null;
    }
    if (this.active?.script.kind === kind) {
      this.active = null;
      this.sinceEnd = 0;
    }
  }

  /** Demos that may still be shown this session: while guiding, only the guide's next ones. */
  allowed(): DemoKind[] {
    if (this.guide) return this.guide.filter((k) => !this.done.has(k));
    return DEMO_ORDER.filter(
      (k) => !this.done.has(k) && (this.shown.get(k) ?? 0) < GHOST.perKind && !GUIDE.order.includes(k),
    );
  }

  /** May a new demo start now? The guide waits less, and may show more than one per idle stretch. */
  get due(): boolean {
    if (this.guide)
      return this.active === null && this.idle >= GUIDE.idleSeconds && this.sinceEnd >= GUIDE.gapSeconds;
    return (
      this.active === null &&
      !this.usedThisIdle &&
      this.idle >= this.idleStart &&
      this.sinceEnd >= this.cooldown
    );
  }

  /**
   * One frame. `blocked` is true while the world is paused, the first scene
   * runs, or the hand is busy: no demo shows then. `stage` builds the demo
   * to show from the allowed kinds (null when none fits on screen). `slow`
   * stretches the demo (reduce motion).
   */
  update(
    dt: number,
    blocked: boolean,
    stage: (allowed: DemoKind[]) => GhostScript | null,
    slow = 1,
  ): GhostFrame | null {
    if (blocked) {
      if (this.active) {
        this.active = null;
        this.sinceEnd = 0;
      }
      return null;
    }
    this.idle += dt;
    if (!this.active) this.sinceEnd += dt;
    if (this.due) {
      const allowed = this.allowed();
      const script = allowed.length > 0 ? stage(allowed) : null;
      if (script) {
        this.active = { script, t: 0 };
        this.usedThisIdle = true;
        this.shown.set(script.kind, (this.shown.get(script.kind) ?? 0) + 1);
        // Each guided demo shows once in the guide.
        if (this.guide) {
          this.guide = this.guide.filter((k) => k !== script.kind);
          if (this.guide.length === 0) this.guide = null;
        }
      }
    }
    const a = this.active;
    if (!a) return null;
    a.t += dt;
    const frame = ghostAt(a.script, a.t, slow);
    if (!frame) {
      this.active = null;
      this.sinceEnd = 0;
    }
    return frame;
  }
}
