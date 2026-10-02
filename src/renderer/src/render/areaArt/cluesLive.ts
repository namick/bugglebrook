import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef, FixtureDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import type { Particles } from '../particles';
import { ItemSprite } from '../draw/item';
import { drawPicto } from '../draw/pictogram';
import type { Picto } from '../reactions';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { soft } from './common';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

/**
 * The views for M10's clues (game design doc, section 12): the plaza's ring
 * mushrooms and clover patch, the stump's little door, the pond's frog eyes,
 * the boot, and the frog king, the porch's shadow puppet and moth spiral,
 * and the treehouse window's telescope. Plus the puffs and sparkles that
 * mark each clue's moment.
 */

const PPM = PIXELS_PER_METER;

interface Spot {
  area: AreaDef;
  fixture: FixtureDef;
  /** World px. */
  x: number;
  y: number;
}

function spots(sim: Sim, kind: FixtureDef['kind']): Spot[] {
  const out: Spot[] = [];
  for (const area of sim.content.areas.all)
    for (const fixture of area.fixtures ?? [])
      if (fixture.kind === kind)
        out.push({ area, fixture, x: (area.xStart + fixture.x) * PPM, y: fixture.y * PPM });
  return out;
}

/** A squash spring after a hit, `t` seconds on: 0 at rest. */
export function squash(t: number): number {
  if (t < 0 || t > 1.2) return 0;
  return Math.exp(-t * 6) * Math.cos(t * 28);
}

/** How far up the frog king's head is, `t` seconds after he surfaces (0 hidden, 1 up). */
export function kingRise(t: number): number {
  if (t < 0 || t > 3.4) return 0;
  if (t < 0.5) return 1 - (1 - t / 0.5) ** 3;
  if (t < 2.8) return 1 + 0.03 * Math.sin(t * 6);
  return 1 - (t - 2.8) / 0.6;
}

const CAP_COLORS = [0xff7eb6, 0xb07cff, 0x6ec6ff];

/** The plaza's three ring mushrooms, the clover patch, and the stump's little door. */
export class PlazaCluesLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly caps: Spot[];
  private readonly clover: Spot | null;
  private readonly hole: Spot | null;
  private hits: number[] = [];
  private chord = -1;
  private door = -1;

  constructor(
    area: AreaDef,
    caps: Spot[],
    clover: Spot | null,
    hole: Spot | null,
    private readonly surface: (xPx: number) => number | null,
  ) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.caps = caps;
    this.clover = clover;
    this.hole = hole;
    this.hits = caps.map(() => 99);
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    return [
      sim.events.on('mushroom_bounced', (e) => {
        this.hits[e.index] = 0;
        const c = this.caps[e.index];
        if (c) particles.puff(c.x, c.y - 30, lighten(CAP_COLORS[e.index] ?? 0xffffff, 0.4), 4, 0, -70, 10);
      }),
      sim.events.on('mushroom_chord', () => {
        this.chord = 0;
        for (const [i, c] of this.caps.entries()) {
          particles.burst(c.x, c.y - 40, 10, CAP_COLORS[i] ?? 0xffffff, Math.PI, Math.PI);
          particles.sparkles(c.x, c.y - 60, 6);
        }
      }),
      sim.events.on('nook_opened', (e) => {
        this.door = 0;
        particles.dust(e.x * PPM, e.y * PPM, 1);
        particles.sparkles(e.x * PPM, e.y * PPM - 20, 10);
      }),
      sim.events.on('clover_dug', (e) => {
        particles.dust(e.x * PPM, e.y * PPM, e.found ? 1.4 : 0.5);
        if (e.found) particles.sparkles(e.x * PPM, e.y * PPM - 40, 16);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    for (let i = 0; i < this.hits.length; i++) this.hits[i] = (this.hits[i] ?? 99) + f.dt;
    if (this.chord >= 0) this.chord += f.dt;
    if (this.door >= 0) this.door += f.dt;
    if (!this.shows(f)) return;
    this.drawCaps(g, f);
    this.drawClover(g, f);
    this.drawDoor(g, fg, f);
  }

  private drawCaps(g: Graphics, f: AreaFrame): void {
    const glow = this.chord >= 0 && this.chord < 1.6 ? 1 - this.chord / 1.6 : 0;
    for (const [i, c] of this.caps.entries()) {
      const ground = (this.surface(c.x) ?? f.sim.surfaceY(c.x / PPM) * PPM) + 4;
      const r = c.fixture.radius * PPM;
      const k = squash(this.hits[i] ?? 99) * (f.reduced ? 0.4 : 1);
      const capY = c.y + k * 10;
      const color = CAP_COLORS[i] ?? 0xff7eb6;
      // The stem, a little bowed.
      g.moveTo(c.x - r * 0.28, ground)
        .quadraticCurveTo(c.x - r * 0.4, (ground + capY) / 2, c.x - r * 0.2, capY + 6)
        .lineTo(c.x + r * 0.22, capY + 6)
        .quadraticCurveTo(c.x + r * 0.35, (ground + capY) / 2, c.x + r * 0.3, ground)
        .closePath()
        .fill(0xfff1d6)
        .stroke(stroke(3));
      // A sleepy face on the stem that wakes when bounced.
      const awake = (this.hits[i] ?? 99) < 0.8 || glow > 0;
      const fy = (ground + capY) / 2 + 6;
      for (const dx of [-7, 7])
        if (awake) g.circle(c.x + dx, fy, 3).fill(OUTLINE);
        else
          g.moveTo(c.x + dx - 3, fy)
            .lineTo(c.x + dx + 3, fy)
            .stroke({ width: 2, color: OUTLINE, cap: 'round' });
      if (awake) g.ellipse(c.x, fy + 8, 4, 3).fill(0x7a2336);
      // The cap: a squashy dome with spots.
      const w = r * (1 + k * 0.25);
      const h = r * 0.75 * (1 - k * 0.3);
      g.moveTo(c.x - w, capY + 8)
        .quadraticCurveTo(c.x - w, capY - h * 1.25, c.x, capY - h * 1.3)
        .quadraticCurveTo(c.x + w, capY - h * 1.25, c.x + w, capY + 8)
        .closePath()
        .fill(glow > 0 ? mix(color, 0xffffff, glow * 0.4) : color)
        .stroke(stroke(3.5));
      for (const [sx, sy, sr] of [
        [-0.45, -0.35, 0.14],
        [0.1, -0.75, 0.12],
        [0.5, -0.25, 0.11],
        [-0.05, -0.2, 0.08],
      ] as const)
        g.ellipse(c.x + sx * w, capY + sy * h, sr * w, sr * w * 0.8).fill(0xffffff);
      g.moveTo(c.x - w * 0.6, capY - h * 0.6)
        .quadraticCurveTo(c.x - w * 0.4, capY - h * 1.05, c.x - w * 0.05, capY - h * 1.1)
        .stroke({ width: 3, color: 0xffffff, alpha: 0.5, cap: 'round' });
    }
  }

  private drawClover(g: Graphics, f: AreaFrame): void {
    const c = this.clover;
    if (!c) return;
    const ground = (this.surface(c.x) ?? f.sim.surfaceY(c.x / PPM) * PPM) + 2;
    const dug = f.sim.secrets.includes('secret_golden_marble');
    if (dug) {
      g.ellipse(c.x + 30, ground - 4, 34, 12)
        .fill(0x8a5a3a)
        .stroke(soft(2.5, 0.5));
      g.ellipse(c.x - 10, ground - 2, 22, 6).fill(0x4a2e1f);
    }
    // Clover sprigs, three leaves each, swaying.
    const sprigs = [-40, -22, -6, 12, 28, 44];
    for (const [i, dx] of sprigs.entries()) {
      if (dug && dx > 0 && dx < 40) continue;
      const sway = Math.sin(f.time * 1.6 + i) * 3 + f.sim.environment.state.wind * 4;
      const x = c.x + dx;
      const h = 22 + ((i * 7) % 12);
      const tx = x + sway;
      const ty = ground - h;
      g.moveTo(x, ground)
        .quadraticCurveTo(x + sway * 0.4, ground - h * 0.5, tx, ty)
        .stroke({ width: 2.5, color: 0x4e9a3a, cap: 'round' });
      const leaves = i === 3 ? 4 : 3;
      for (let k = 0; k < leaves; k++) {
        const a = -Math.PI / 2 + (k - (leaves - 1) / 2) * (leaves === 4 ? 0.95 : 1.15);
        g.circle(tx + Math.cos(a) * 7, ty + Math.sin(a) * 7, 6.5)
          .fill(i === 3 ? 0x8fdc5a : 0x6fbf4a)
          .stroke(soft(1.8, 0.5));
      }
    }
  }

  override lights(f: AreaFrame, light: LightFn): void {
    const c = this.clover;
    if (!c || !this.shows(f)) return;
    // The X in the clover glows faintly at night once the map has shown it, until it is dug.
    const s = f.sim.secrets;
    if (s.includes('secret_treasure_map') && !s.includes('secret_golden_marble') && f.look.stars > 0.5) {
      const ground = f.sim.surfaceY(c.x / PPM) * PPM;
      light(c.x, ground - 14, 60, 0xfff3a0, 0.25 + 0.1 * Math.sin(f.time * 3));
    }
    if (this.chord >= 0 && this.chord < 1.6)
      for (const [i, cap] of this.caps.entries())
        light(cap.x, cap.y - 20, 120, CAP_COLORS[i] ?? 0xffffff, 0.5 * (1 - this.chord / 1.6));
  }

  private drawDoor(g: Graphics, fg: Graphics, f: AreaFrame): void {
    const h = this.hole;
    if (!h || !f.sim.clues.state.nook) return;
    const open = this.door < 0 ? 1 : Math.min(1, this.door / 0.5);
    const x = h.x + 4;
    const y = h.y + 10;
    // The little arched doorway in the knothole, warm inside.
    g.moveTo(x - 22, y + 26)
      .lineTo(x - 22, y - 6)
      .arc(x, y - 6, 22, Math.PI, 0)
      .lineTo(x + 22, y + 26)
      .closePath()
      .fill(0xffcf7a)
      .stroke(stroke(3));
    g.rect(x - 16, y + 10, 32, 4).fill(0x8b5a3c);
    // The door, swung open on its left hinge (drawn narrower as it turns).
    const w = 44 * (1 - 0.75 * open);
    fg.moveTo(x - 22, y + 26)
      .lineTo(x - 22, y - 6)
      .lineTo(x - 22 - w * 0.25, y - 26)
      .lineTo(x - 22 - w, y - 22)
      .lineTo(x - 22 - w, y + 30)
      .closePath()
      .fill(0xa8744f)
      .stroke(stroke(3));
    fg.circle(x - 22 - w * 0.8, y + 6, 3).fill(0xe8b84a);
    void darken;
  }
}

/** The pond's frog eyes and the frog king, and the sunken boot (which tips out its key). */
export class PondCluesLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private blink = 0;
  private swell = -1;
  private king = -1;
  private kingX = 0;
  private tip = -1;

  constructor(
    area: AreaDef,
    private readonly eyes: Spot | null,
    private readonly boot: Spot | null,
    private readonly surface: (xPx: number) => number | null,
  ) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    return [
      sim.events.on('frog_blinked', (e) => {
        this.blink = 0.2;
        particles.ring(e.x * PPM, (this.surface(e.x * PPM) ?? e.y * PPM) + 2, 18);
      }),
      sim.events.on('frog_ribbited', (e) => {
        this.swell = 0;
        const x = e.x * PPM;
        const y = this.surface(x) ?? e.y * PPM;
        for (const s of [30, 60, 90]) particles.ring(x, y, s);
        particles.splash(x, y, 4, 0.4);
      }),
      sim.events.on('frog_king', (e) => {
        this.king = 0;
        this.kingX = e.x * PPM;
        const y = this.surface(this.kingX) ?? 870;
        particles.splash(this.kingX, y, 6, 0.6);
        particles.bubbles(this.kingX, y, 10);
      }),
      sim.events.on('boot_tipped', (e) => {
        this.tip = 0;
        particles.bubbles(e.x * PPM, e.y * PPM - 40, 12);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    this.blink = Math.max(0, this.blink - f.dt);
    if (this.swell >= 0) this.swell += f.dt;
    if (this.king >= 0) this.king += f.dt;
    if (this.tip >= 0) this.tip += f.dt;
    if (!this.shows(f)) return;
    this.drawBoot(g, f);
    this.drawEyes(fg, f);
    this.drawKing(fg);
  }

  private drawBoot(g: Graphics, f: AreaFrame): void {
    const b = this.boot;
    if (!b) return;
    const tipped = f.sim.clues.state.bootTipped;
    const k = !tipped ? 0 : this.tip < 0 ? 1 : Math.min(1, this.tip / 0.7);
    const ease = 1 - (1 - k) ** 3;
    const x = b.x;
    const y = f.sim.surfaceY(b.x / PPM) * PPM + 4;
    const c = mix(0xf2c230, 0x1d5f8a, 0.35);
    // The boot on its side; tipped, it rolls over onto its toe, its mouth up.
    const a = -ease * 0.9;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = (u: number, v: number): [number, number] => [
      x + 76 + (u - 76) * cos - v * sin,
      y + (u - 76) * sin + v * cos,
    ];
    const pts = [px(-60, 0), px(-60, -48), px(10, -58), px(58, -52), px(70, -30), px(76, 0)].flat();
    g.poly(pts, true).fill(c).stroke(soft(4, 0.5));
    const [mx, my] = px(-60, -24);
    g.ellipse(mx, my, 12, 26).fill(darken(c, 0.5)).stroke(soft(3, 0.5));
  }

  private drawEyes(g: Graphics, f: AreaFrame): void {
    const e = this.eyes;
    if (!e) return;
    const water = this.surface(e.x) ?? e.y;
    const big = this.swell >= 0 && this.swell < 1.2 ? Math.sin((this.swell / 1.2) * Math.PI) : 0;
    const r = 13 + big * 10;
    const hand = f.hand;
    for (const dx of [-16, 16]) {
      const ex = e.x + dx * (1 + big * 0.6);
      const ey = water - 8 - big * 14;
      g.circle(ex, ey, r).fill(0x6fbf4a).stroke(stroke(3));
      if (this.blink > 0 || f.time % 5.3 < 0.14) {
        g.moveTo(ex - r * 0.6, ey - 1)
          .lineTo(ex + r * 0.6, ey - 1)
          .stroke({ width: 2.5, color: OUTLINE, cap: 'round' });
      } else {
        g.circle(ex, ey - 1, r * 0.62).fill(0xfff7c2);
        const lx = hand ? Math.max(-1, Math.min(1, (hand.x - ex) / 300)) * r * 0.25 : 0;
        const ly = hand ? Math.max(-1, Math.min(1, (hand.y - ey) / 300)) * r * 0.2 : 0;
        g.ellipse(ex + lx, ey - 1 + ly, r * 0.18, r * 0.42).fill(OUTLINE);
      }
    }
  }

  /** The frog king: a giant head with a crown rises out of the teacup's water, ribbits, and spits. */
  private drawKing(g: Graphics): void {
    const k = kingRise(this.king);
    if (k <= 0) return;
    const x = this.kingX;
    const water = this.surface(x) ?? 870;
    const top = water - 230 * k;
    const w = 190;
    g.moveTo(x - w, water + 10)
      .bezierCurveTo(x - w, top - 20, x + w, top - 20, x + w, water + 10)
      .closePath()
      .fill(0x5fae3e)
      .stroke(stroke(5));
    g.ellipse(x, water - 30 * k, w * 0.8, 40 * k).fill({ color: 0xc7e88a, alpha: 0.8 });
    // The mouth: a wide, wide smile, opening to spit.
    const spit = this.king > 1.1 && this.king < 1.6 ? 1 : 0;
    g.moveTo(x - w * 0.7, top + 150)
      .quadraticCurveTo(x, top + 190 + spit * 30, x + w * 0.7, top + 150)
      .stroke({ width: 6, color: OUTLINE, cap: 'round' });
    for (const dx of [-90, 90]) {
      const ex = x + dx;
      const ey = top + 30;
      g.circle(ex, ey, 52).fill(0x5fae3e).stroke(stroke(5));
      g.circle(ex, ey, 36).fill(0xfff7c2).stroke(stroke(3));
      g.ellipse(ex + dx * 0.06, ey + 4, 9, 22).fill(OUTLINE);
      g.circle(ex - 10, ey - 12, 6).fill(0xffffff);
    }
    // A bottle-cap crown, a bit too small.
    const cy = top - 6;
    g.poly(
      [
        x - 50,
        cy,
        x - 56,
        cy - 44,
        x - 26,
        cy - 22,
        x,
        cy - 52,
        x + 26,
        cy - 22,
        x + 56,
        cy - 44,
        x + 50,
        cy,
      ],
      true,
    )
      .fill(0xf2c14e)
      .stroke(stroke(4));
    for (const dx of [-28, 0, 28]) g.circle(x + dx, cy - 8, 5).fill(0xd23c3c);
  }
}

/** The porch: the shadow puppet on the back wall, and the moth spiral round the lamp. */
export class PorchCluesLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private shadow = -1;
  private shadowX = 0;
  private moths = -1;
  private mothX = 0;
  private mothY = 0;

  constructor(area: AreaDef) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim): Array<() => void> {
    return [
      sim.events.on('shadow_puppet', (e) => {
        this.shadow = 0;
        this.shadowX = e.x * PPM;
      }),
      sim.events.on('moths_swirled', (e) => {
        this.moths = 0;
        this.mothX = e.x * PPM;
        this.mothY = e.y * PPM;
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    if (this.shadow >= 0) this.shadow += f.dt;
    if (this.moths >= 0) this.moths += f.dt;
    if (!this.shows(f)) return;
    this.drawShadow(g, f);
    this.drawMoths(fg, f);
  }

  /** A big chubby shadow with eight stubby legs, waving: Wubbo's hint. */
  private drawShadow(g: Graphics, f: AreaFrame): void {
    const t = this.shadow;
    if (t < 0 || t > 5) return;
    const a = Math.min(1, t / 0.5, (5 - t) / 0.8) * 0.85;
    const x = this.shadowX;
    const y = 360;
    const c = { color: 0x1a1030, alpha: a };
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const lx = x + side * (40 + i * 34) - side * 20;
        const wig = Math.sin(f.time * 6 + i + side) * 8;
        g.roundRect(lx - 12, y + 40 + wig * 0.3, 24, 46 + wig, 12).fill(c);
      }
    }
    g.ellipse(x, y, 170, 92).fill(c);
    g.ellipse(x + 150, y - 30, 60, 52).fill(c);
    g.circle(x + 196, y - 34, 18).fill(c);
    // One arm up, waving.
    const wave = Math.sin(f.time * 7) * 0.5;
    g.roundRect(x + 100, y - 150 + wave * 20, 26, 90, 13).fill(c);
  }

  /** The flashlight's round spot on the back wall, where the shadow shows. */
  override lights(f: AreaFrame, light: LightFn): void {
    const t = this.shadow;
    if (t < 0 || t > 5 || !this.shows(f)) return;
    const a = Math.min(1, t / 0.4, (5 - t) / 0.8);
    light(this.shadowX + 30, 340, 420, 0xfff1c0, 0.55 * a, 1.2, 1);
  }

  private drawMoths(g: Graphics, f: AreaFrame): void {
    const t = this.moths;
    if (t < 0 || t > 6) return;
    const fade = Math.min(1, t / 0.4, (6 - t) / 1);
    for (let i = 0; i < 36; i++) {
      const a = i * 0.7 + t * (2 + (i % 5) * 0.2);
      const r = 30 + (i / 36) * 220 * Math.min(1, t / 1.5);
      const x = this.mothX + Math.cos(a) * r;
      const y = this.mothY + 40 + Math.sin(a) * r * 0.55;
      const flap = Math.abs(Math.sin(f.time * 24 + i)) * 7 + 2;
      g.ellipse(x - 5, y, 6, flap).fill({ color: 0xe8dcc0, alpha: fade });
      g.ellipse(x + 5, y, 6, flap).fill({ color: 0xe8dcc0, alpha: fade });
      g.circle(x, y, 2.5).fill({ color: 0x6b5a4a, alpha: fade });
    }
  }
}

/** Hint pictograms the telescope can draw with the shared pictogram set. */
const PICTO_GLYPHS: Record<string, Picto> = {
  moon: 'moon',
  sun: 'sun',
  cloud: 'rain',
  snow: 'snow',
  drop: 'drop',
  note: 'note',
  notes3: 'note',
  rainbow: 'star',
};

/** The treehouse window's telescope view: a round zoomed porthole showing where a secret waits. */
export class TelescopeLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly items = new Container();
  private t = -1;
  private hint: string[] = [];
  private area: string | null = null;

  constructor(
    area: AreaDef,
    private readonly window: Spot,
  ) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.front.addChild(this.g, this.items);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    return [
      sim.events.on('telescope_peeked', (e) => {
        this.t = 0;
        this.hint = e.hint;
        this.area = e.area;
        this.items.removeChildren().forEach((c) => c.destroy());
        const n = e.hint.length;
        e.hint.forEach((h, i) => {
          const def = sim.content.items.tryGet(h);
          if (!def) return;
          const v = new ItemSprite(def, i);
          v.position.set(this.window.x + 260 + (i - (n - 1) / 2) * 90, this.window.y + 130);
          v.scale.set(1.3);
          this.items.addChild(v);
        });
      }),
      sim.events.on('window_tapped', (e) => particles.ring(e.x * PPM, e.y * PPM, 20)),
      sim.events.on('marble_tune', (e) => {
        for (let i = 0; i < 6; i++)
          particles.burst(
            e.x * PPM,
            e.y * PPM - 40,
            4,
            [0xff4f5e, 0xffd23f, 0x6bd66b, 0x4d9bff, 0xb07cff, 0xff9f43][i]!,
          );
        particles.sparkles(e.x * PPM, e.y * PPM - 120, 14);
      }),
      sim.events.on('claw_spun', (e) => {
        particles.stars(e.x * PPM, e.y * PPM);
        particles.sparkles(e.x * PPM, e.y * PPM, 12);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    if (this.t >= 0) this.t += f.dt;
    const live = this.t >= 0 && this.t < 4.5;
    this.items.visible = live;
    if (!live || !this.shows(f)) return;
    const k = Math.min(1, this.t / 0.35, (4.5 - this.t) / 0.4);
    const pop = k * (1 + 0.08 * Math.exp(-this.t * 5) * Math.sin(this.t * 20));
    this.items.alpha = k;
    const cx = this.window.x + 260;
    const cy = this.window.y + 130;
    const r = 150 * pop;
    // A beam from the window to the porthole, like a spyglass.
    g.moveTo(this.window.x, this.window.y)
      .lineTo(cx - r * 0.7, cy - r * 0.7)
      .lineTo(cx - r * 0.7, cy + r * 0.7)
      .closePath()
      .fill({ color: 0xfff3c4, alpha: 0.25 * k });
    const a = f.sim.content.areas.tryGet(this.area ?? '');
    const sky = a ? a.skyTop : 0x1b2350;
    const ground = a ? a.ground : 0x4a2e1f;
    g.circle(cx, cy, r).fill(sky);
    g.moveTo(cx - r, cy + r * 0.25)
      .quadraticCurveTo(cx, cy + r * 0.05, cx + r, cy + r * 0.25)
      .arc(cx, cy, r, 0.25, Math.PI - 0.25)
      .closePath()
      .fill(ground);
    g.circle(cx, cy, r).stroke({ width: 16, color: 0xc98a3a });
    g.circle(cx, cy, r + 8).stroke(stroke(4));
    g.circle(cx, cy, r - 8).stroke({ width: 3, color: 0xffe0a0, alpha: 0.8 });
    if (this.hint.length === 0) {
      // Nothing left to point at: a happy star.
      drawPicto(g, 'star', cx, cy, 90 * k, f.time);
      return;
    }
    this.hint.forEach((h, i) => {
      const x = cx + (i - (this.hint.length - 1) / 2) * 90;
      const p = PICTO_GLYPHS[h];
      if (p) drawPicto(g, p, x, cy - 30, 70 * k, f.time);
      else if (!f.sim.content.items.has(h)) drawPicto(g, 'question', x, cy - 30, 60 * k, f.time);
    });
    // A sparkle twinkles over the spot.
    g.star(cx + r * 0.45, cy - r * 0.45, 4, 18, 6, f.time * 2).fill({ color: 0xffffff, alpha: 0.9 * k });
  }
}

/** The quick puffs and sparkles that mark M10's clue moments anywhere in the world. */
export class ClueFxLive extends AreaLive {
  private readonly g = new Graphics();
  private squeak = -1;
  private squeakX = 0;
  private squeakY = 0;

  constructor(width: number) {
    super(0, width * PPM);
    this.front.addChild(this.g);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const at = (x: number, y: number): [number, number] => [x * PPM, y * PPM];
    return [
      sim.events.on('regatta_won', (e) => {
        particles.burst(...at(e.x, e.y - 1.2), 12, 0xffd23f);
        particles.sparkles(...at(e.x, e.y - 1.5), 14);
      }),
      sim.events.on('rain_danced', (e) => particles.sparkles(...at(e.x, e.y - 1.5), 20)),
      sim.events.on('rainbow_caught', (e) => {
        for (const c of [0xff4f5e, 0xff9f43, 0xffd23f, 0x6bd66b, 0x4d9bff, 0x9b6bd6])
          particles.burst(...at(e.x, e.y - 0.4), 3, c);
        particles.sparkles(...at(e.x, e.y - 0.6), 12);
      }),
      sim.events.on('slide_souvenir', (e) => particles.sparkles(...at(e.x, e.y - 0.6), 14)),
      sim.events.on('cloud_caught', (e) => {
        particles.puff(...at(e.x, e.y), 0xe8eef7, 8, 0, -40, 26);
        particles.sparkles(...at(e.x, e.y), 10);
      }),
      sim.events.on('cloud_jar_opened', (e) =>
        particles.puff(...at(e.x, e.y - 0.4), 0x9aa8c0, 10, 0, -160, 30),
      ),
      sim.events.on('map_assembled', (e) => {
        particles.ring(...at(e.x, e.y), 50);
        particles.sparkles(...at(e.x, e.y - 0.3), 18);
      }),
      sim.events.on('orbit_launched', (e) => particles.stars(...at(e.x, 0.4))),
      sim.events.on('orbit_returned', (e) => {
        particles.stars(...at(e.x, e.y - 0.5));
        particles.sparkles(...at(e.x, e.y - 0.5), 16);
      }),
      sim.events.on('twig_bridged', (e) => particles.hearts(...at(e.x, e.y - 0.6), 5)),
      sim.events.on('moss_squeaked', (e) => {
        this.squeak = 0;
        [this.squeakX, this.squeakY] = at(e.x, e.y);
      }),
      sim.events.on('boot_tipped', (e) => particles.sparkles(...at(e.x, e.y - 0.8), 8)),
    ];
  }

  /** The moss jar's squeak: wobble lines either side, and two beady eyes blinking out of the moss. */
  update(f: AreaFrame): void {
    const g = this.g.clear();
    if (this.squeak < 0) return;
    this.squeak += f.dt;
    if (this.squeak > 1.4) {
      this.squeak = -1;
      return;
    }
    const t = this.squeak;
    const a = Math.min(1, (1.4 - t) / 0.4);
    const x = this.squeakX;
    const y = this.squeakY;
    const w = Math.sin(t * 30) * 4 * (f.reduced ? 0.4 : 1);
    for (const side of [-1, 1])
      for (const k of [0, 1]) {
        const a0 = side > 0 ? -0.5 : Math.PI - 0.5;
        const r = 28 + k * 9;
        g.moveTo(x + w + Math.cos(a0) * r, y + Math.sin(a0) * r);
        g.arc(x + w, y, r, a0, a0 + 1).stroke({
          width: 2.5,
          color: 0xffffff,
          alpha: 0.8 * a,
          cap: 'round',
        });
      }
    if (t % 0.7 > 0.1)
      for (const dx of [-5, 5]) g.circle(x + dx + w, y + 6, 2.2).fill({ color: OUTLINE, alpha: a });
  }
}

/** The clue views for whatever the world has. */
export function clueLives(sim: Sim, surface: (xPx: number) => number | null): AreaLive[] {
  const out: AreaLive[] = [];
  const area = (id: string): AreaDef | undefined => sim.content.areas.tryGet(id);
  const plaza = area('area_stump_plaza');
  if (plaza)
    out.push(
      new PlazaCluesLive(
        plaza,
        spots(sim, 'ring_mushroom'),
        spots(sim, 'clover')[0] ?? null,
        spots(sim, 'knothole')[0] ?? null,
        surface,
      ),
    );
  const pond = area('area_puddle_pond');
  if (pond)
    out.push(
      new PondCluesLive(
        pond,
        spots(sim, 'frog_eyes')[0] ?? null,
        spots(sim, 'rubber_boot')[0] ?? null,
        surface,
      ),
    );
  const porch = area('area_under_porch');
  if (porch) out.push(new PorchCluesLive(porch));
  const tree = area('area_treehouse_arcade');
  const win = spots(sim, 'window')[0];
  if (tree && win) out.push(new TelescopeLive(tree, win));
  out.push(new ClueFxLive(sim.worldWidth));
  return out;
}
