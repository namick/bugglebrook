import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef, FixtureDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { BENCH_SHAKE, TRAY_OFFSETS } from '../../../../game/systems/bench';
import { SIM_HZ } from '../../../../game/core/loop';
import { ItemSprite } from '../draw/item';
import { drawTagIcon } from '../draw/tagIcon';
import type { Particles } from '../particles';
import { OUTLINE, darken, lighten, stroke } from '../palette';
import { soft } from './common';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;

/** The spool table's wood and thread. */
const WOOD = 0xc9955f;
const THREAD = 0xe8453c;
const CAP = 0x2ec4b6;
const CORK = 0xc98a4a;
const PAPER = 0xf3e6c8;
const GROUND = 900;

/** The lever's pivot, right of the bench's middle (m), its length, and its lean at rest. */
export const LEVER_PIVOT = 2.65;
export const LEVER_LENGTH = 1.5;
export const LEVER_REST = -0.18;

/** The ticks at the end of the shake when the bench holds still, squashed, before the pop (hit-stop). */
export const HIT_STOP = 7;
/** The ticks at the start when it crouches before it starts to rattle (anticipation). */
const CROUCH = 10;

/** How a thing pops out of the bench: the size it starts at and how fast it grows, and its stretch. */
export const CRAFT_POP = { from: 0.25, speed: 7, sx: 0.72, sy: 1.4 } as const;

/** The recipe the cork board's faded first card hints at: everything for it lies under the porch. */
export const FIRST_HINT = 'recipe_matchbox_racer';

export type BenchPhase = 'idle' | 'crouch' | 'rattle' | 'hold';

/**
 * How the bench looks while it works (R09), pure so tests can check the
 * timing: it crouches, rattles harder and harder with little hops, then
 * holds still and squashed for a beat (the hit-stop) right before the pop.
 * `left` is the ticks until the pop.
 */
export function benchPose(
  left: number,
  strong: boolean,
): { phase: BenchPhase; dx: number; dy: number; tilt: number; sx: number; sy: number } {
  if (left <= 0) return { phase: 'idle', dx: 0, dy: 0, tilt: 0, sx: 1, sy: 1 };
  const t = BENCH_SHAKE - left;
  const power = strong ? 1.6 : 1;
  if (left <= HIT_STOP) return { phase: 'hold', dx: 0, dy: 3, tilt: 0, sx: 1.1, sy: 0.88 };
  if (t < CROUCH) {
    const c = Math.sin((t / CROUCH) * (Math.PI / 2));
    return { phase: 'crouch', dx: 0, dy: 2 * c, tilt: 0, sx: 1 + 0.06 * c, sy: 1 - 0.08 * c };
  }
  // It rattles harder as it goes.
  const run = (t - CROUCH) / (BENCH_SHAKE - HIT_STOP - CROUCH);
  const k = (5 + 11 * run) * power;
  const hop = Math.abs(Math.sin(t * 0.9));
  return {
    phase: 'rattle',
    dx: Math.sin(t * 2.3) * k,
    dy: -hop * k * 0.7,
    tilt: Math.sin(t * 1.3) * 0.025 * (0.5 + run) * power,
    sx: 1 - hop * 0.04,
    sy: 1 + hop * 0.05,
  };
}

/**
 * How much an empty tray glows (0 to 1) when a held thing is `dist` m from
 * it (R10): nothing past 3.5 m, warming as it comes near, full when it would
 * go in (`hot`).
 */
export function trayGlow(dist: number, hot: boolean): number {
  if (hot) return 1;
  if (dist >= 3.5) return 0;
  return 0.25 + 0.5 * (1 - dist / 3.5);
}

/** What the bench shows right now, for tests. */
export interface BenchLook {
  trays: number[];
  phase: BenchPhase;
  /** Hint cards on the cork board: `how` (how to use it), `hint` (a faded first recipe), or a recipe. */
  cards: string[];
}

/**
 * The Tinker Bench (game design doc, section 8), alive: a big wooden thread
 * spool for a table with three bottle-cap trays, a clothespin lever that
 * comes down when pulled, a little crank that wiggles at a near miss, and a
 * cork board above with a how-to card, pinned blueprint cards and tag
 * hints. Empty trays light up as a held thing comes near. Pulling the lever
 * makes the bench crouch, rattle and steam, hold its breath, and pop the
 * result out in a burst of stars.
 */
export class BenchLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly board = new Container();
  private readonly cards = new Graphics();
  private readonly ghost = new Container();
  private readonly fg = new Graphics();
  private readonly cx: number;
  private readonly top: number;
  private readonly lever: { x: number; y: number };
  /** Blueprint card icons, by recipe. */
  private readonly icons = new Map<string, ItemSprite>();
  private ghostSprite: ItemSprite | null = null;
  private ghostT = 0;
  private wiggle = 0;
  private strong = false;
  /** The lever's angle (0 up, 1 all the way down), eased. */
  private leverAt = 0;
  private flash = 0;
  /** Seconds since the last pop, for the bench's own bounce. */
  private popT = 9;
  private pinned = new Map<string, number>();
  private nudgeAt = new Map<string, number>();
  /** Each tray's glow, eased toward what the held thing asks for. */
  private readonly glows = [0, 0, 0];
  private phase: BenchPhase = 'idle';
  private shown: string[] = [];

  constructor(
    private readonly area: AreaDef,
    bench: FixtureDef,
    lever: FixtureDef,
  ) {
    super((area.xStart + bench.x - 4) * PPM, (area.xStart + bench.x + 4) * PPM);
    this.cx = (area.xStart + bench.x) * PPM;
    this.top = bench.y * PPM;
    // The lever pivots at the table's right edge; its fixture is the click spot round the knob.
    this.lever = { x: this.cx + LEVER_PIVOT * PPM, y: lever.y * PPM };
    this.back.addChild(this.board, this.g, this.ghost);
    this.board.addChild(this.cards);
    this.front.addChild(this.fg);
    // The bench squashes and tilts about the middle of its foot.
    for (const g of [this.g, this.fg]) {
      g.pivot.set(this.cx, GROUND);
      g.position.set(this.cx, GROUND);
    }
  }

  /** What it shows now (tray glows, its phase, the cork board's cards). */
  look(): BenchLook {
    return { trays: [...this.glows], phase: this.phase, cards: [...this.shown] };
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('bench_pulled', (e) => {
        this.strong = e.strong;
        if (e.empty) particles.dust(this.cx, this.top, 0.4);
      }),
      ev.on('crafted', (e) => {
        this.flash = 1;
        this.popT = 0;
        const x = e.x * PPM;
        const y = this.top - 60;
        particles.puff(this.cx, this.top - 10, 0xfff6e0, 16, 0, -70, 34);
        particles.stars(x, y);
        particles.burst(x, y, 16, 0xffd23f);
        particles.burst(x, y, 8, 0xff8fab);
        particles.sparkles(x, y - 20, 18);
        particles.ring(x, y, 110);
      }),
      ev.on('uncrafted', (e) => {
        this.popT = 0;
        particles.puff(e.x * PPM, this.top - 30, 0xf4ead2, 10, 0, -50, 26);
        particles.sparkles(e.x * PPM, this.top - 40, 8);
      }),
      ev.on('bench_failed', (e) => {
        this.popT = 0;
        particles.puff(e.x * PPM, this.top - 40, 0xc9b8a0, 12, 0, -70, 30);
        if (e.kind === 'smelly') particles.puff(e.x * PPM, this.top - 50, 0x9ccc4a, 8, 0, -40, 24);
      }),
      ev.on('bench_shrugged', (e) => particles.dust(e.x * PPM, this.top, 0.5)),
      ev.on('tray_filled', (e) => particles.sparkles(e.x * PPM, this.top - 16, 4)),
      ev.on('bench_hinted', (e) => {
        this.wiggle = 1.4;
        this.showGhost(sim, e.missing, e.tray);
      }),
      ev.on('bench_nudged', (e) => this.nudgeAt.set(e.tag, 0)),
      ev.on('blueprint_found', (e) => {
        this.pinned.set(e.recipe, 0);
        particles.sparkles(e.x * PPM, e.y * PPM - 20, 10);
      }),
    ];
  }

  /** The near miss: the missing thing's ghost flickers once in the empty tray. */
  private showGhost(sim: Sim, defId: string, tray: number): void {
    this.ghost.removeChildren();
    if (!sim.content.items.has(defId)) return;
    const s = new ItemSprite(sim.content.items.get(defId), 7);
    s.position.set(this.cx + (TRAY_OFFSETS[tray] ?? 0) * PPM, this.top - 26);
    s.scale.set(0.8);
    this.ghost.addChild(s);
    this.ghostSprite = s;
    this.ghostT = 1.6;
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    const bench = f.sim.bench;
    const left = bench.busy ? bench.state.busyUntil - f.sim.tick : 0;
    const pose = benchPose(left, this.strong);
    this.phase = pose.phase;
    this.wiggle = Math.max(0, this.wiggle - f.dt);
    this.flash = Math.max(0, this.flash - f.dt * 1.5);
    this.popT += f.dt;
    this.updateGlows(f);
    // The lever: down while the hand pulls it or the bench works, then it springs back up.
    const want = Math.max(f.drag?.kind === 'lever' ? f.drag.amount : 0, left > 0 ? 1 : 0);
    this.leverAt += (want - this.leverAt) * Math.min(1, f.dt * (want > this.leverAt ? 18 : 6));
    if (this.ghostSprite) {
      this.ghostT -= f.dt;
      // A flicker: on, off, on, fading.
      const on = Math.floor(this.ghostT * 8) % 3 !== 1;
      this.ghostSprite.alpha = this.ghostT > 0 && on ? 0.35 * Math.min(1, this.ghostT) : 0;
      this.ghostSprite.tint = 0xbfe0ff;
      if (this.ghostT <= 0) {
        this.ghost.removeChildren();
        this.ghostSprite = null;
      }
    }
    // After the pop the bench springs up and settles: stretch, squash, done.
    const bounce = this.popT < 0.6 ? Math.sin(this.popT * 18) * Math.exp(-this.popT * 7) : 0;
    const sx = pose.sx * (1 - bounce * 0.08);
    const sy = pose.sy * (1 + bounce * 0.12);
    for (const layer of [g, fg]) {
      layer.position.set(this.cx + pose.dx, GROUND + pose.dy);
      layer.scale.set(sx, sy);
      layer.rotation = pose.tilt;
    }
    if (!this.shows(f)) return;
    if (pose.phase === 'rattle') {
      // Sawdust, steam from the spindle and the flanges, and the odd star while it hammers away.
      if (f.sim.tick % 5 === 0) {
        const x = this.cx + (Math.random() - 0.5) * 360;
        f.particles.dust(x, this.top, 0.4);
        if (Math.random() < 0.3) f.particles.burst(x, this.top - 30, 3, 0xffd23f);
      }
      if (f.sim.tick % 7 === 0) {
        const side = Math.random() < 0.5 ? -1 : 1;
        f.particles.puff(this.cx + side * 200, this.top + 10, 0xffffff, 2, side * 30, -80, 14);
        f.particles.puff(this.cx, this.top - 6, 0xffffff, 2, 0, -110, 12);
      }
    }
    this.drawBoard(f);
    this.drawTable(g, f);
    this.drawLever(fg);
    this.drawCrank(g, f.time);
  }

  /** The empty trays light up as a held thing comes near; the one it would go in, brightest (R10). */
  private updateGlows(f: AreaFrame): void {
    const sim = f.sim;
    const held = sim.physics.grabbed;
    const e = held === null ? undefined : sim.entities.get(held);
    const v = e && e.kind === 'item' ? sim.view(e.id) : null;
    const target = v ? sim.dropTargetFor(v.id) : null;
    const open = new Map(sim.bench.candidates().map((c) => [-1 - c.entityId, c] as const));
    for (let i = 0; i < 3; i++) {
      const c = open.get(i);
      const want =
        v && c
          ? trayGlow(
              Math.hypot(c.x - v.x, c.y - v.y),
              target?.kind === 'tray' && target.entityId === c.entityId,
            )
          : 0;
      this.glows[i]! += (want - this.glows[i]!) * Math.min(1, f.dt * (want > this.glows[i]! ? 14 : 5));
      if (this.glows[i]! < 0.01) this.glows[i] = 0;
    }
  }

  /** The cork board over the bench: a how-to card, blueprint cards, and tag pictograms for nudges. */
  private drawBoard(f: AreaFrame): void {
    const c = this.cards.clear();
    const bx = this.cx - 170;
    const by = 330;
    const w = 340;
    const h = 170;
    // The frame, then the cork with its speckle and a lit top edge.
    c.roundRect(bx - 16, by - 16, w + 32, h + 32, 10)
      .fill(darken(WOOD, 0.2))
      .stroke(stroke(4));
    c.rect(bx - 10, by - 12, w + 20, 5).fill({ color: 0xffffff, alpha: 0.25 });
    c.roundRect(bx, by, w, h, 6).fill(CORK).stroke(soft(2, 0.5));
    for (let i = 0; i < 40; i++) {
      const x = bx + 8 + ((i * 53) % (w - 16));
      const y = by + 6 + ((i * 37) % (h - 12));
      c.circle(x, y, 2 + (i % 3) * 0.6).fill({ color: darken(CORK, i % 2 ? 0.3 : 0.15), alpha: 0.5 });
    }
    const st = f.sim.bench.state;
    const cardAt = (i: number): { x: number; y: number } => ({ x: bx + 46 + i * 82, y: by + 84 });
    // The how-to card, always first: things into the trays, pull the lever, ta-da.
    this.drawHowTo(c, cardAt(0).x, cardAt(0).y);
    const recipes = st.hinted.slice(-3);
    // Until a blueprint turns up, a faded card hints at something to make from what lies about.
    const faded = recipes.length === 0 && !st.made.includes(FIRST_HINT) ? [FIRST_HINT] : [];
    this.shown = ['how', ...faded.map(() => 'hint'), ...recipes];
    [...faded, ...recipes].forEach((id, k) => {
      const hint = faded.includes(id) && k === 0;
      const age = hint ? 9 : (this.pinned.get(id) ?? 9) + f.dt;
      if (!hint) this.pinned.set(id, age);
      const pop = age < 0.5 ? 1 + Math.sin(age * Math.PI * 2) * 0.25 * (1 - age * 2) : 1;
      const { x, y } = cardAt(k + 1);
      const made = st.made.includes(id);
      const tilt = ((k * 37) % 7) - 3;
      c.roundRect(x - 33 * pop + tilt, y - 46 * pop, 66 * pop, 90 * pop, 6)
        .fill(made ? 0xfffbe8 : hint ? PAPER : 0xdfeaff)
        .stroke(soft(2, hint ? 0.3 : 0.5));
      if (hint)
        // A strip of tape instead of a pin, and a big question mark.
        c.rect(x - 16, y - 52, 32, 12).fill({ color: 0xfff6d0, alpha: 0.7 });
      else
        c.circle(x, y - 40, 6)
          .fill(0xe8453c)
          .stroke(soft(1.5, 0.6));
      const recipe = f.sim.content.recipes.tryGet(id);
      if (!recipe) return;
      let icon = this.icons.get(id);
      if (!icon) {
        icon = new ItemSprite(f.sim.content.items.get(recipe.output), 3);
        this.icons.set(id, icon);
        this.board.addChild(icon);
      }
      const def = f.sim.content.items.get(recipe.output);
      const size =
        def.shape.type === 'circle' ? def.shape.radius * 2 : Math.max(def.shape.width, def.shape.height);
      icon.scale.set((0.44 / Math.max(0.3, size)) * pop);
      icon.position.set(x, y - 8);
      // An unmade recipe shows as a dark silhouette; once made, in full color. The hint is fainter.
      icon.tint = made ? 0xffffff : 0x3b4a7a;
      icon.alpha = made ? 1 : hint ? 0.35 : 0.8;
      if (hint) {
        c.circle(x + 20, y - 26, 10).fill({ color: 0xffffff, alpha: 0.6 });
        c.moveTo(x + 16, y - 30)
          .quadraticCurveTo(x + 20, y - 36, x + 24, y - 30)
          .quadraticCurveTo(x + 24, y - 26, x + 20, y - 24)
          .stroke({ width: 2.5, color: 0x3b4a7a, alpha: 0.7, cap: 'round' });
        c.circle(x + 20, y - 19, 1.6).fill({ color: 0x3b4a7a, alpha: 0.7 });
      }
      // The inputs as little outlined dots underneath.
      recipe.inputs.forEach((_, n) => {
        c.circle(x - 18 + n * 18, y + 30, 6).stroke({ width: 2, color: 0x3b4a7a, alpha: hint ? 0.4 : 0.7 });
      });
    });
    for (const [id, icon] of this.icons) icon.visible = recipes.includes(id) || faded.includes(id);
    // Tag nudges: a pictogram pinned at the board's right.
    st.nudged.slice(-2).forEach((tag, i) => {
      const age = (this.nudgeAt.get(tag) ?? 9) + f.dt;
      this.nudgeAt.set(tag, age);
      const x = bx + w - 26;
      const y = by + 36 + i * 70;
      const pulse = age < 2 ? 1 + 0.2 * Math.sin(age * 12) * (1 - age / 2) : 1;
      c.circle(x, y, 24 * pulse)
        .fill(0xfffbe8)
        .stroke(soft(2, 0.5));
      drawTagIcon(c, tag, x, y, 32 * pulse);
    });
  }

  /** The how-to card: two things drop into a tray, the lever comes down, a star. Faded paper, taped. */
  private drawHowTo(c: Graphics, x: number, y: number): void {
    const ink = { width: 2.5, color: 0x5a4a3a, alpha: 0.65, cap: 'round' as const, join: 'round' as const };
    c.roundRect(x - 34, y - 48, 68, 94, 6)
      .fill(PAPER)
      .stroke(soft(2, 0.35));
    c.rect(x - 14, y - 54, 28, 12).fill({ color: 0xfff6d0, alpha: 0.7 });
    // A pebble and a stick fall into a cap.
    c.circle(x - 12, y - 32, 5).stroke(ink);
    c.rect(x + 4, y - 36, 14, 5).stroke(ink);
    c.moveTo(x, y - 24)
      .lineTo(x, y - 16)
      .stroke(ink);
    c.moveTo(x - 4, y - 20)
      .lineTo(x, y - 15)
      .lineTo(x + 4, y - 20)
      .stroke(ink);
    c.ellipse(x, y - 9, 14, 4).stroke(ink);
    // The lever, pulled down.
    c.moveTo(x - 16, y + 6)
      .lineTo(x + 4, y + 16)
      .stroke(ink);
    c.circle(x - 18, y + 5, 4).fill({ color: 0xe8453c, alpha: 0.7 });
    c.moveTo(x + 14, y + 2)
      .lineTo(x + 14, y + 14)
      .stroke(ink);
    c.moveTo(x + 10, y + 10)
      .lineTo(x + 14, y + 15)
      .lineTo(x + 18, y + 10)
      .stroke(ink);
    // Ta-da.
    const sy = y + 32;
    const star: number[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? 4 : 10;
      star.push(x + Math.cos(a) * r, sy + Math.sin(a) * r);
    }
    c.poly(star).fill({ color: 0xffd23f, alpha: 0.75 }).stroke(ink);
  }

  /**
   * The spool table (R30): a big wooden thread spool on end. Two wooden
   * flanges with grain and lit edges, a waist wound round and round with red
   * thread (lit on the left, shaded on the right), a loose end with a needle
   * in it, and the three bottle-cap trays on top.
   */
  private drawTable(g: Graphics, f: AreaFrame): void {
    const x = this.cx;
    const top = this.top;
    const flange = 26;
    const waist = 112;
    const bodyTop = top + flange;
    const bodyBottom = GROUND - flange;
    // The bottom flange.
    this.drawFlange(g, x, bodyBottom, 196, flange, false);
    // The waist: wound thread, rounded by a gradient.
    const thread = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: darken(THREAD, 0.25) },
        { offset: 0.3, color: lighten(THREAD, 0.18) },
        { offset: 0.55, color: THREAD },
        { offset: 1, color: darken(THREAD, 0.35) },
      ],
      textureSpace: 'local',
    });
    g.rect(x - waist, bodyTop, waist * 2, bodyBottom - bodyTop)
      .fill(thread)
      .stroke(stroke(4));
    // The winds: gently curved, as round a drum.
    for (let y = bodyTop + 9, k = 0; y < bodyBottom - 4; y += 8, k++) {
      g.moveTo(x - waist + 2, y)
        .quadraticCurveTo(x, y + 7, x + waist - 2, y)
        .stroke({ width: 2, color: darken(THREAD, 0.35), alpha: 0.45 });
      if (k % 3 === 0)
        g.moveTo(x - waist * 0.75, y + 3)
          .quadraticCurveTo(x - waist * 0.45, y + 6, x - waist * 0.2, y + 6)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.28 });
    }
    // Shadow under the top flange, and a shine down the thread.
    g.rect(x - waist, bodyTop, waist * 2, 12).fill({ color: OUTLINE, alpha: 0.3 });
    g.roundRect(x - waist * 0.55, bodyTop + 18, 12, bodyBottom - bodyTop - 30, 6).fill({
      color: 0xffffff,
      alpha: 0.22,
    });
    // The loose end trails down to the floor, with a needle stuck in the winds.
    g.moveTo(x + waist - 20, bodyTop + 60)
      .bezierCurveTo(x + waist + 30, bodyTop + 90, x + waist - 10, GROUND - 40, x + waist + 40, GROUND - 4)
      .stroke({ width: 3, color: THREAD, cap: 'round' });
    g.moveTo(x - 40, bodyTop + 120)
      .lineTo(x + 24, bodyTop + 76)
      .stroke({ width: 5, color: OUTLINE, cap: 'round' });
    g.moveTo(x - 40, bodyTop + 120)
      .lineTo(x + 24, bodyTop + 76)
      .stroke({ width: 2.5, color: 0xdfe6f0, cap: 'round' });
    g.ellipse(x + 20, bodyTop + 79, 3, 1.5).fill(OUTLINE);
    // The top flange: the table.
    this.drawFlange(g, x, top, 220, flange, true);
    // The three bottle-cap trays, lit when a held thing comes near.
    const st = f.sim.bench.state;
    TRAY_OFFSETS.forEach((off, i) => {
      const tx = x + off * PPM;
      const full = st.trays[i] !== null;
      const glow = this.glows[i]!;
      const pulse = glow > 0 ? 0.5 + 0.5 * Math.sin(f.time * Math.PI * 4 + i) : 0;
      const lift = glow * (2 + pulse * 2);
      const ty = top - lift;
      g.ellipse(tx, ty + 3, 52, 12)
        .fill(darken(CAP, 0.25))
        .stroke(stroke(3));
      g.ellipse(tx, ty - 1, 47, 9).fill(full ? CAP : lighten(CAP, 0.25 + glow * 0.35));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        g.circle(tx + Math.cos(a) * 49, ty + 2 + Math.sin(a) * 10.5, 2.6).fill(
          lighten(CAP, 0.5 + glow * 0.3),
        );
      }
      g.ellipse(tx - 16, ty - 3, 14, 3).fill({ color: 0xffffff, alpha: 0.45 });
      if (glow > 0)
        g.ellipse(tx, ty - 1, 56 + pulse * 6 * glow, 14 + pulse * 2 * glow).stroke({
          width: 3,
          color: 0xffe38a,
          alpha: 0.4 + glow * 0.5,
        });
    });
    // A flash on the table when something pops out.
    if (this.flash > 0) g.ellipse(x, top - 10, 240, 60).fill({ color: 0xfff6c0, alpha: this.flash * 0.5 });
  }

  /** A spool flange: a thick wooden disc seen a little from above, grain and a lit rim. */
  private drawFlange(g: Graphics, x: number, top: number, r: number, thick: number, table: boolean): void {
    const edge = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0, color: darken(WOOD, 0.15) },
        { offset: 0.35, color: lighten(WOOD, 0.1) },
        { offset: 1, color: darken(WOOD, 0.3) },
      ],
      textureSpace: 'local',
    });
    g.rect(x - r, top, r * 2, thick)
      .fill(edge)
      .stroke(stroke(4));
    g.ellipse(x, top + thick, r, 10)
      .fill(darken(WOOD, 0.25))
      .stroke(stroke(4));
    g.rect(x - r + 2, top + 2, r * 2 - 4, thick - 2).fill(edge);
    for (let k = 0; k < 4; k++)
      g.moveTo(x - r + 30 + k * 100, top + 8)
        .quadraticCurveTo(x - r + 70 + k * 100, top + 4 + (k % 2) * 8, x - r + 110 + k * 100, top + 12)
        .stroke({ width: 2, color: darken(WOOD, 0.35), alpha: 0.4 });
    g.ellipse(x, top, r, 24).fill(lighten(WOOD, 0.15)).stroke(stroke(4));
    for (const rr of [0.35, 0.6, 0.85])
      g.ellipse(x, top, r * rr, 24 * rr).stroke({ width: 2, color: darken(WOOD, 0.2), alpha: 0.35 });
    g.ellipse(x, top, 30, 7).fill(darken(WOOD, 0.45));
    // Light along the near rim.
    g.moveTo(x - r * 0.8, top + 13)
      .quadraticCurveTo(x - r * 0.3, top + 23, x + r * 0.1, top + 22)
      .stroke({ width: 3, color: 0xfff1d0, alpha: table ? 0.55 : 0.35, cap: 'round' });
  }

  /** The clothespin lever, pivoting at the table's right edge. */
  private drawLever(g: Graphics): void {
    const px = this.lever.x;
    const py = this.top + 4;
    // Up, it leans a little out; pulled, it swings down toward the floor.
    const a = LEVER_REST + this.leverAt * 1.25;
    const len = LEVER_LENGTH * PPM;
    const tip = { x: px + Math.sin(a) * len, y: py - Math.cos(a) * len };
    const side = { x: Math.cos(a) * 15, y: Math.sin(a) * 15 };
    // Its base block.
    g.roundRect(px - 26, py - 6, 52, 30, 6)
      .fill(darken(WOOD, 0.2))
      .stroke(stroke(4));
    g.rect(px - 20, py - 2, 40, 4).fill({ color: 0xffffff, alpha: 0.3 });
    // Two wooden prongs and the spring.
    for (const k of [-1, 1]) {
      const o = { x: side.x * k * 0.55, y: side.y * k * 0.55 };
      g.moveTo(px + o.x, py + o.y)
        .lineTo(tip.x + o.x * 0.9, tip.y + o.y * 0.9)
        .stroke({ width: 22, color: OUTLINE, cap: 'round' });
      g.moveTo(px + o.x, py + o.y)
        .lineTo(tip.x + o.x * 0.9, tip.y + o.y * 0.9)
        .stroke({ width: 15, color: k < 0 ? 0xf0d3a0 : 0xe0bf86, cap: 'round' });
    }
    const mid = { x: px + Math.sin(a) * len * 0.42, y: py - Math.cos(a) * len * 0.42 };
    g.circle(mid.x, mid.y, 11).fill(0x9aa3b5).stroke(stroke(3));
    g.circle(mid.x, mid.y, 5).fill(0xdfe6f0);
    // A red knob to grab.
    g.circle(tip.x, tip.y, 16).fill(0xe8453c).stroke(stroke(4));
    g.circle(tip.x - 5, tip.y - 5, 5).fill({ color: 0xffffff, alpha: 0.6 });
  }

  /** The little crank on the left, which wiggles at a near miss. */
  private drawCrank(g: Graphics, time: number): void {
    const x = this.cx - 236;
    const y = this.top + 30;
    const turn = this.wiggle > 0 ? Math.sin(time * 30) * 0.8 * Math.min(1, this.wiggle) : 0.3;
    g.circle(x, y, 18).fill(0x9aa3b5).stroke(stroke(3));
    g.circle(x - 5, y - 5, 5).fill({ color: 0xffffff, alpha: 0.5 });
    const hx = x + Math.cos(turn - Math.PI / 2) * 30;
    const hy = y + Math.sin(turn - Math.PI / 2) * 30;
    g.moveTo(x, y).lineTo(hx, hy).stroke({ width: 7, color: OUTLINE, cap: 'round' });
    g.moveTo(x, y).lineTo(hx, hy).stroke({ width: 3, color: 0xdfe6f0, cap: 'round' });
    g.circle(hx, hy, 7).fill(0xffd23f).stroke(stroke(2.5));
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    if (this.flash > 0) light(this.cx, this.top - 60, 360, 0xfff2b0, this.flash * 0.95);
    // A soft lamp over the bench while it works, so it reads at night.
    if (f.sim.bench.busy) light(this.cx, this.top - 40, 260, 0xffe3a3, 0.35);
    // The trays glow as a held thing comes near.
    TRAY_OFFSETS.forEach((off, i) => {
      const glow = this.glows[i]!;
      if (glow > 0.02)
        light(this.cx + off * PPM, this.top - 10, 60 + glow * 40, 0xffe38a, 0.25 + glow * 0.45, 1.4, 0.7);
    });
  }
}

/** Seconds the bench shakes for, for tests and sounds. */
export const BENCH_SECONDS = BENCH_SHAKE / SIM_HZ;
