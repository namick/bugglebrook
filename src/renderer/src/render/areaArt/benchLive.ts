import { Container, Graphics } from 'pixi.js';
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

/** The lever's pivot, right of the bench's middle (m), its length, and its lean at rest. */
export const LEVER_PIVOT = 2.65;
export const LEVER_LENGTH = 1.5;
export const LEVER_REST = -0.18;

/** How the bench looks while it works: pure, so tests can check the timing. */
export function benchShake(left: number, strong: boolean): { dx: number; dy: number; tilt: number } {
  if (left <= 0) return { dx: 0, dy: 0, tilt: 0 };
  const t = BENCH_SHAKE - left;
  // It builds up, rattles, and settles right before the pop.
  const env = Math.min(1, t / 12) * Math.min(1, left / 8);
  const k = (strong ? 9 : 5) * env;
  return {
    dx: Math.sin(t * 1.9) * k,
    dy: -Math.abs(Math.sin(t * 1.3)) * k * 0.6,
    tilt: Math.sin(t * 1.1) * 0.012 * env * (strong ? 1.8 : 1),
  };
}

/**
 * The Tinker Bench (game design doc, section 8), alive: a big thread spool
 * for a table with three bottle-cap trays, a clothespin lever that comes
 * down when pulled, a little crank that wiggles at a near miss, and a cork
 * board above with pinned blueprint cards and tag hints. Pulling the lever
 * shakes the bench in a cloud of sawdust, then the result pops out with a
 * burst of stars.
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
  private pinned = new Map<string, number>();
  private nudgeAt = new Map<string, number>();

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
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    const top = (x: number): [number, number] => [x * PPM, this.top - 20];
    return [
      ev.on('bench_pulled', (e) => {
        this.strong = e.strong;
        if (e.empty) particles.dust(this.cx, this.top, 0.4);
      }),
      ev.on('crafted', (e) => {
        this.flash = 1;
        const [x, y] = top(e.x);
        particles.stars(x, y - 40);
        particles.burst(x, y - 40, 14, 0xffd23f);
        particles.sparkles(x, y - 60, 16);
        particles.ring(x, y - 40, 90);
      }),
      ev.on('uncrafted', (e) => {
        particles.puff(e.x * PPM, this.top - 30, 0xf4ead2, 10, 0, -50, 26);
        particles.sparkles(e.x * PPM, this.top - 40, 8);
      }),
      ev.on('bench_failed', (e) => {
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
    const shake = benchShake(left, this.strong);
    this.wiggle = Math.max(0, this.wiggle - f.dt);
    this.flash = Math.max(0, this.flash - f.dt * 1.5);
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
    if (!this.shows(f)) return;
    if (left > 0 && f.sim.tick % 6 === 0) {
      // Sawdust and the odd star while it hammers away.
      const x = this.cx + (Math.random() - 0.5) * 360;
      f.particles.dust(x, this.top, 0.35);
      if (Math.random() < 0.35) f.particles.burst(x, this.top - 30, 3, 0xffd23f);
    }
    this.drawBoard(f);
    this.drawTable(g, shake, f);
    this.drawLever(fg, shake);
    this.drawCrank(g, shake, f.time);
  }

  /** The cork board over the bench: blueprint cards for hinted recipes, tag pictograms for nudges. */
  private drawBoard(f: AreaFrame): void {
    const c = this.cards.clear();
    const bx = this.cx - 170;
    const by = 330;
    const w = 340;
    const h = 170;
    c.roundRect(bx - 14, by - 14, w + 28, h + 28, 10)
      .fill(darken(WOOD, 0.25))
      .stroke(soft(3, 0.55));
    c.roundRect(bx, by, w, h, 6).fill(CORK);
    for (let i = 0; i < 26; i++) {
      const x = bx + 10 + ((i * 53) % (w - 20));
      const y = by + 8 + ((i * 37) % (h - 16));
      c.circle(x, y, 2.4).fill({ color: darken(CORK, 0.35), alpha: 0.5 });
    }
    const st = f.sim.bench.state;
    const recipes = st.hinted.slice(-4);
    recipes.forEach((id, i) => {
      const age = (this.pinned.get(id) ?? 9) + f.dt;
      this.pinned.set(id, age);
      const pop = age < 0.5 ? 1 + Math.sin(age * Math.PI * 2) * 0.25 * (1 - age * 2) : 1;
      const x = bx + 46 + i * 82;
      const y = by + 62;
      const made = st.made.includes(id);
      c.roundRect(x - 34 * pop, y - 44 * pop, 68 * pop, 88 * pop, 6)
        .fill(made ? 0xfffbe8 : 0xdfeaff)
        .stroke(soft(2, 0.5));
      c.circle(x, y - 38, 6)
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
      icon.position.set(x, y - 6);
      // An unmade recipe shows as a dark silhouette; once made, in full color.
      icon.tint = made ? 0xffffff : 0x3b4a7a;
      icon.alpha = made ? 1 : 0.8;
      // The inputs as little outlined dots underneath.
      recipe.inputs.forEach((_, k) => {
        c.circle(x - 18 + k * 18, y + 30, 6).stroke({ width: 2, color: 0x3b4a7a, alpha: 0.7 });
      });
    });
    for (const [id, icon] of this.icons) icon.visible = recipes.includes(id);
    // Tag nudges: a pictogram pinned at the board's right.
    st.nudged.slice(-2).forEach((tag, i) => {
      const age = (this.nudgeAt.get(tag) ?? 9) + f.dt;
      this.nudgeAt.set(tag, age);
      const x = bx + w - 30;
      const y = by + 40 + i * 70;
      const pulse = age < 2 ? 1 + 0.2 * Math.sin(age * 12) * (1 - age / 2) : 1;
      c.circle(x, y, 26 * pulse)
        .fill(0xfffbe8)
        .stroke(soft(2, 0.5));
      drawTagIcon(c, tag, x, y, 34 * pulse);
    });
  }

  /** The spool table and its trays. */
  private drawTable(g: Graphics, s: { dx: number; dy: number }, f: AreaFrame): void {
    const x = this.cx + s.dx;
    const top = this.top + s.dy;
    const ground = 900;
    // The spool's body: wound red thread.
    g.roundRect(x - 92, top + 20, 184, ground - top - 18, 10)
      .fill(THREAD)
      .stroke(soft(3, 0.55));
    for (let y = top + 34; y < ground - 6; y += 13)
      g.moveTo(x - 92, y)
        .lineTo(x + 92, y + 5)
        .stroke({ width: 3, color: darken(THREAD, 0.3), alpha: 0.55 });
    g.ellipse(x, ground, 220, 30).fill(darken(WOOD, 0.15)).stroke(soft(3, 0.55));
    // The top disc.
    g.rect(x - 220, top, 440, 24)
      .fill(WOOD)
      .stroke(soft(3, 0.55));
    g.ellipse(x, top, 220, 26).fill(lighten(WOOD, 0.15)).stroke(soft(3, 0.55));
    g.ellipse(x, top, 36, 7).fill(darken(WOOD, 0.4));
    // Wood grain rings.
    for (const r of [80, 140, 190])
      g.ellipse(x, top, r, r * 0.12).stroke({ width: 2, color: darken(WOOD, 0.2), alpha: 0.35 });
    // The three bottle-cap trays.
    const st = f.sim.bench.state;
    TRAY_OFFSETS.forEach((off, i) => {
      const tx = x + off * PPM;
      const full = st.trays[i] !== null;
      g.ellipse(tx, top + 2, 50, 11)
        .fill(darken(CAP, 0.25))
        .stroke(stroke(3));
      g.ellipse(tx, top - 2, 46, 9).fill(full ? CAP : lighten(CAP, 0.25));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        g.circle(tx + Math.cos(a) * 48, top + 1 + Math.sin(a) * 10, 2.6).fill(lighten(CAP, 0.5));
      }
    });
    // A flash on the table when something pops out.
    if (this.flash > 0) g.ellipse(x, top - 10, 240, 60).fill({ color: 0xfff6c0, alpha: this.flash * 0.5 });
  }

  /** The clothespin lever, pivoting at the table's right edge. */
  private drawLever(g: Graphics, s: { dx: number; dy: number }): void {
    const px = this.lever.x + s.dx;
    const py = this.top + 4 + s.dy;
    // Up, it leans a little out; pulled, it swings down toward the floor.
    const a = LEVER_REST + this.leverAt * 1.25;
    const len = LEVER_LENGTH * PPM;
    const tip = { x: px + Math.sin(a) * len, y: py - Math.cos(a) * len };
    const side = { x: Math.cos(a) * 15, y: Math.sin(a) * 15 };
    // Its base block.
    g.roundRect(px - 26, py - 6, 52, 30, 6)
      .fill(darken(WOOD, 0.2))
      .stroke(stroke(4));
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
  private drawCrank(g: Graphics, s: { dx: number; dy: number }, time: number): void {
    const x = this.cx - 236 + s.dx;
    const y = this.top + 30 + s.dy;
    const turn = this.wiggle > 0 ? Math.sin(time * 30) * 0.8 * Math.min(1, this.wiggle) : 0.3;
    g.circle(x, y, 18).fill(0x9aa3b5).stroke(stroke(3));
    const hx = x + Math.cos(turn - Math.PI / 2) * 30;
    const hy = y + Math.sin(turn - Math.PI / 2) * 30;
    g.moveTo(x, y).lineTo(hx, hy).stroke({ width: 7, color: OUTLINE, cap: 'round' });
    g.moveTo(x, y).lineTo(hx, hy).stroke({ width: 3, color: 0xdfe6f0, cap: 'round' });
    g.circle(hx, hy, 7).fill(0xffd23f).stroke(stroke(2.5));
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    if (this.flash > 0) light(this.cx, this.top - 60, 320, 0xfff2b0, this.flash * 0.9);
    // A soft lamp over the bench while it works, so it reads at night.
    if (f.sim.bench.busy) light(this.cx, this.top - 40, 260, 0xffe3a3, 0.35);
  }
}

/** Seconds the bench shakes for, for tests and sounds. */
export const BENCH_SECONDS = BENCH_SHAKE / SIM_HZ;
