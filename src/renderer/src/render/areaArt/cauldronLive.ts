import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef, FixtureDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { STIR_RATE } from '../../../../game/systems/bugMachines';
import { MOUTH_HALF } from '../../../../game/systems/cauldron';
import { ItemSprite } from '../draw/item';
import { drawTagIcon } from '../draw/tagIcon';
import type { Particles } from '../particles';
import { OUTLINE, darken, lighten, mix, stroke } from '../palette';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;
/** The brew's color before anything goes in: clear green. */
export const CLEAR_BREW = 0x9be86b;
const SHELL = 0xfff4e0;

interface Bubble {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
}

/** How hard the brew bubbles: a simmer that grows with stirring, then a boil while it brews. */
export function bubbling(progress: number, brewing: boolean): number {
  return brewing ? 1 : 0.12 + 0.5 * progress;
}

/**
 * The compost cauldron (game design doc, section 9), alive: half an
 * eggshell sitting in the warm heap, its brew tinted by what went in, a
 * bent-spoon ladle that goes round as the hand stirs, bubbles that grow
 * with the stirring, a hard boil and a flash of the potion's color when it
 * brews, a foam fountain for a three-essence potion, and a tip when it is
 * clicked. The bug scope's zoomed view pops up over the microscope.
 */
export class CauldronLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly lens = new Container();
  private readonly lensG = new Graphics();
  private readonly cx: number;
  private readonly rim: number;
  private color = CLEAR_BREW;
  private bubbles: Bubble[] = [];
  private flash = 0;
  private flashColor = 0xffffff;
  private tip = 0;
  private splash = 0;
  /** The ladle's angle round the pot, eased toward the hand's. */
  private ladle = -0.6;
  private scope: {
    at: { x: number; y: number };
    defId: string | null;
    tag: string | null;
    t: number;
  } | null = null;
  private scopeSprite: ItemSprite | null = null;

  constructor(area: AreaDef, cauldron: FixtureDef, scopeFix: FixtureDef | null) {
    super(
      (area.xStart + cauldron.x - 6) * PPM,
      (area.xStart + Math.max(cauldron.x, scopeFix?.x ?? 0) + 6) * PPM,
    );
    this.cx = (area.xStart + cauldron.x) * PPM;
    this.rim = cauldron.y * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg, this.lens);
    this.lens.addChild(this.lensG);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('cauldron_added', (e) => {
        this.splash = 1;
        particles.splash(e.x * PPM, this.rim + 12, 5, 0.25);
        particles.drops(e.x * PPM, this.rim, 0, -260, e.color, 8);
      }),
      ev.on('cauldron_bubbled', (e) => {
        particles.steam(this.cx, this.rim - 10, 14);
        particles.bubbles(this.cx, this.rim, 10);
        this.flashColor = e.color;
      }),
      ev.on('potion_brewed', (e) => {
        this.flash = 1;
        this.flashColor = e.color;
        this.color = CLEAR_BREW;
        particles.burst(this.cx, this.rim - 30, 18, e.color);
        particles.sparkles(this.cx, this.rim - 80, 18);
        particles.puff(this.cx, this.rim - 40, 0xffffff, 10, 0, -90, 28);
        particles.ring(this.cx, this.rim - 20, 120);
      }),
      ev.on('cauldron_tipped', (e) => {
        this.tip = 1;
        this.color = CLEAR_BREW;
        particles.drops(this.cx, this.rim, 0, -200, CLEAR_BREW, e.count > 0 ? 14 : 6);
      }),
      ev.on('cauldron_full', (e) => particles.splash(e.x * PPM, this.rim + 8, 4, 0.2)),
      ev.on('scope_viewed', (e) => {
        this.scope = { at: { x: e.x * PPM, y: e.y * PPM }, defId: e.defId, tag: e.tag, t: 2.4 };
        this.lens.removeChildren();
        this.lens.addChild(this.lensG);
        this.scopeSprite = null;
        if (e.defId && e.tag !== 'wubbo') {
          const s = new ItemSprite(sim.content.items.get(e.defId), 11);
          this.scopeSprite = s;
          this.lens.addChild(s);
        }
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    const c = f.sim.cauldron;
    // The brew drifts toward the color of what is in it.
    const target = c.state.contents.length > 0 ? c.preview().color : CLEAR_BREW;
    this.color = mix(this.color, target, Math.min(1, f.dt * 3));
    this.flash = Math.max(0, this.flash - f.dt * 1.2);
    this.tip = Math.max(0, this.tip - f.dt * 1.4);
    this.splash = Math.max(0, this.splash - f.dt * 2);
    // A bug stirring on its own (R20) sends the ladle round at its pace.
    const bugStirs = f.sim.entities
      .ofKind('bug')
      .some((b) => b.bug?.mode === 'st_use' && b.bug.action === 'brew' && b.bug.done);
    const want =
      f.drag?.kind === 'stir'
        ? f.drag.angle
        : bugStirs
          ? this.ladle + STIR_RATE / 14
          : this.ladle + f.dt * 0.15 * Math.sin(f.time * 0.7);
    this.ladle += angleDiff(want, this.ladle) * Math.min(1, f.dt * 14);
    this.updateLens(f);
    if (!this.shows(f)) return;
    const heat = bubbling(c.progress(), c.bubbling);
    this.spawnBubbles(f, heat, c.state.contents.length);
    // A three-essence brew erupts in a foam fountain.
    if (c.state.foamUntil > f.sim.tick && f.sim.tick % 3 === 0)
      f.particles.puff(
        this.cx + (Math.random() - 0.5) * 80,
        this.rim - 10,
        0xffffff,
        3,
        (Math.random() - 0.5) * 120,
        -320,
        22,
      );
    if (c.bubbling && f.sim.tick % 4 === 0)
      f.particles.steam(this.cx + (Math.random() - 0.5) * 200, this.rim - 10, 2);
    this.drawPot(g, fg, f, heat);
  }

  private spawnBubbles(f: AreaFrame, heat: number, count: number): void {
    const n = Math.random() < heat * f.dt * 30 ? 1 : 0;
    for (let i = 0; i < n; i++)
      this.bubbles.push({
        x: this.cx + (Math.random() - 0.5) * 240,
        y: this.rim + 14 + Math.random() * 10,
        r: 5 + Math.random() * (8 + heat * 10 + count * 2),
        age: 0,
        life: 0.6 + Math.random() * 0.6,
      });
    for (const b of this.bubbles) b.age += f.dt;
    this.bubbles = this.bubbles.filter((b) => b.age < b.life).slice(-40);
  }

  private drawPot(g: Graphics, fg: Graphics, f: AreaFrame, heat: number): void {
    const cx = this.cx;
    const rim = this.rim;
    const tilt = Math.sin(this.tip * Math.PI) * 0.35;
    const boil = f.sim.cauldron.bubbling ? Math.sin(f.time * 40) * 3 : 0;
    const w = 165;
    const depth = 150;
    // The shell, cracked at the rim, sitting in the heap.
    const pts: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * (i / 24);
      pts.push(cx - Math.cos(a) * w + boil, rim + Math.sin(a) * depth);
    }
    // The jagged top edge, right to left.
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = cx + w - t * w * 2;
      const jag = i % 2 === 0 ? -10 : 4;
      pts.push(x + boil, rim + jag - Math.sin(t * Math.PI) * 6);
    }
    g.poly(rotate(pts, cx, rim + 60, tilt))
      .fill(SHELL)
      .stroke(stroke(5));
    // Speckles on the shell.
    for (let i = 0; i < 14; i++) {
      const a = 0.3 + (i / 14) * 2.5;
      const r = 0.55 + ((i * 37) % 10) / 30;
      const [x, y] = rotate([cx - Math.cos(a) * w * r, rim + Math.sin(a) * depth * r], cx, rim + 60, tilt);
      g.circle(x!, y!, 3 + (i % 3)).fill({ color: 0xc9a07a, alpha: 0.55 });
    }
    // The brew: a glossy surface, darker below.
    const surf = rim + 14 - this.splash * 6 - (f.sim.cauldron.bubbling ? 6 : 0);
    const brewColor = this.flash > 0 ? mix(this.color, this.flashColor, this.flash) : this.color;
    const [sx, sy] = rotate([cx, surf], cx, rim + 60, tilt);
    g.ellipse(sx!, sy!, w - 18, 22)
      .fill(darken(brewColor, 0.25))
      .stroke(stroke(3));
    g.ellipse(sx!, sy! - 3, w - 30, 15).fill(brewColor);
    g.ellipse(sx! - 50, sy! - 7, 34, 5).fill({ color: 0xffffff, alpha: 0.45 });
    // Bubbles on the surface.
    for (const b of this.bubbles) {
      const k = b.age / b.life;
      const r = b.r * (0.4 + k * 0.8);
      g.circle(b.x, surf - r * 0.4, r)
        .fill({ color: lighten(brewColor, 0.3), alpha: 0.9 })
        .stroke({ width: 2, color: OUTLINE, alpha: 0.6 });
      g.circle(b.x - r * 0.35, surf - r * 0.75, r * 0.25).fill({ color: 0xffffff, alpha: 0.7 });
    }
    // Things in the brew: little dots bobbing, one per ingredient.
    f.sim.cauldron.state.contents.forEach((p, i) => {
      const def = f.sim.content.items.tryGet(p.defId);
      const bx = cx - 70 + i * 70;
      const by = surf + 4 + Math.sin(f.time * 2 + i) * 3;
      g.circle(bx, by, 9)
        .fill(def?.color ?? 0xffffff)
        .stroke(stroke(2.5));
    });
    // The ladle: a bent spoon in the brew, its handle out over the rim.
    const a = this.ladle;
    const bowl = { x: cx + Math.cos(a) * (w - 70), y: surf + 6 + Math.sin(a) * 10 };
    const handle = { x: bowl.x + Math.cos(a) * 30 + 30, y: bowl.y - 190 };
    fg.moveTo(bowl.x, bowl.y).lineTo(handle.x, handle.y).stroke({ width: 16, color: OUTLINE, cap: 'round' });
    fg.moveTo(bowl.x, bowl.y).lineTo(handle.x, handle.y).stroke({ width: 9, color: 0xc7d3e3, cap: 'round' });
    fg.circle(handle.x, handle.y, 10).fill(0xdfe6f0).stroke(stroke(3));
    fg.ellipse(bowl.x, bowl.y + 4, 22, 9)
      .fill(0xc7d3e3)
      .stroke(stroke(3));
    // How far the stirring has got: a ring of little dots over the pot.
    const prog = f.sim.cauldron.progress();
    if (prog > 0 && !f.sim.cauldron.bubbling)
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const on = t < prog;
        const pa = -Math.PI / 2 + t * Math.PI * 2;
        fg.circle(cx + Math.cos(pa) * 40, rim - 120 + Math.sin(pa) * 40, on ? 7 : 4).fill({
          color: on ? lighten(this.color, 0.2) : 0xffffff,
          alpha: on ? 0.95 : 0.4,
        });
      }
    // Steam curling off a warm brew.
    if (heat > 0.3 && f.sim.tick % 20 === 0)
      f.particles.steam(cx + (Math.random() - 0.5) * 160, surf - 10, 1);
  }

  /** The bug scope's zoomed view: a round lens over the microscope for two seconds. */
  private updateLens(f: AreaFrame): void {
    const l = this.lensG.clear();
    const s = this.scope;
    if (!s) {
      this.lens.visible = false;
      return;
    }
    s.t -= f.dt;
    if (s.t <= 0) {
      this.scope = null;
      this.lens.visible = false;
      return;
    }
    this.lens.visible = true;
    const pop = Math.min(1, (2.4 - s.t) * 5) * Math.min(1, s.t * 4);
    const x = s.at.x;
    const y = s.at.y - 230;
    const r = 120 * (0.6 + 0.4 * pop);
    this.lens.alpha = pop;
    l.circle(x, y, r + 12).fill(0x3b3a4a);
    l.circle(x, y, r).fill(0xeaf6ff);
    l.circle(x, y, r * 0.92).fill(0xd8efe0);
    // A dotted mossy dish underneath it all.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      l.circle(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, 4).fill({ color: 0x9ccc4a, alpha: 0.4 });
    }
    if (s.tag === 'wubbo') this.drawWubbo(l, x, y, f.time);
    else if (this.scopeSprite) {
      this.scopeSprite.position.set(x - r * 0.15, y + r * 0.1);
      this.scopeSprite.scale.set(2.2 * pop);
    }
    if (s.tag && s.tag !== 'wubbo') {
      l.circle(x + r * 0.55, y - r * 0.5, 34)
        .fill(0xfffbe8)
        .stroke(stroke(3));
      drawTagIcon(l, s.tag, x + r * 0.55, y - r * 0.5, 44);
    } else if (!s.defId) {
      for (const dx of [-24, 0, 24]) l.circle(x + dx, y, 6).fill({ color: OUTLINE, alpha: 0.5 });
    }
    l.circle(x - r * 0.45, y - r * 0.45, r * 0.18).fill({ color: 0xffffff, alpha: 0.5 });
    l.circle(x, y, r + 12).stroke({ width: 6, color: OUTLINE });
  }

  /** A tiny water bear in the moss, waving, dreaming of a mushroom. */
  private drawWubbo(g: Graphics, x: number, y: number, time: number): void {
    const body = 0xc9b8e8;
    g.ellipse(x, y + 10, 46, 30)
      .fill(body)
      .stroke(stroke(4));
    for (let i = 0; i < 4; i++)
      g.circle(x - 30 + i * 20, y + 38, 8)
        .fill(darken(body, 0.15))
        .stroke(stroke(3));
    const wave = Math.sin(time * 8) * 0.5;
    g.moveTo(x + 36, y)
      .lineTo(x + 58, y - 22 + wave * 10)
      .stroke({ width: 10, color: OUTLINE, cap: 'round' });
    g.moveTo(x + 36, y)
      .lineTo(x + 58, y - 22 + wave * 10)
      .stroke({ width: 6, color: body, cap: 'round' });
    g.circle(x - 14, y + 2, 5).fill(OUTLINE);
    g.circle(x + 8, y + 2, 5).fill(OUTLINE);
    g.moveTo(x - 8, y + 14)
      .quadraticCurveTo(x - 3, y + 19, x + 2, y + 14)
      .stroke({ width: 3, color: OUTLINE });
    // A thought: a mushroom.
    g.circle(x - 46, y - 40, 6)
      .fill(0xffffff)
      .stroke(stroke(2));
    g.circle(x - 60, y - 64, 26)
      .fill(0xffffff)
      .stroke(stroke(3));
    g.ellipse(x - 60, y - 70, 16, 10)
      .fill(0xe8453c)
      .stroke(stroke(2.5));
    g.rect(x - 64, y - 62, 8, 12)
      .fill(0xfff4e0)
      .stroke(stroke(2));
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    const c = f.sim.cauldron;
    const glow = 0.25 + c.progress() * 0.35 + (c.bubbling ? 0.4 : 0) + this.flash * 0.8;
    light(this.cx, this.rim, 260, this.flash > 0 ? this.flashColor : this.color, Math.min(1, glow));
  }
}

/** Rotate a flat list of points about (cx, cy). */
function rotate(pts: readonly number[], cx: number, cy: number, a: number): number[] {
  if (a === 0) return [...pts];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i]! - cx;
    const dy = pts[i + 1]! - cy;
    out.push(cx + dx * c - dy * s, cy + dx * s + dy * c);
  }
  return out;
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The cauldron's mouth, half its width in pixels: the drop glow uses it. */
export const MOUTH_PX = MOUTH_HALF * PPM;
