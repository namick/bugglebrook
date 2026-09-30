import { Container, FillGradient, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../game/constants';
import type { AreaDef } from '../../../game/data/types';
import type { EntityView, Sim } from '../../../game/sim';
import { PAD_WIDTH, SPRAY } from '../../../game/systems/environment';
import type { WaterSurface } from '../../../game/systems/water';
import type { Camera } from './camera';
import { OUTLINE, darken, lighten, mix, stroke } from './palette';
import type { Particles } from './particles';
import { POND_COLORS } from './pondArt';
import { WaveSurface, swell } from './waveSurface';

const PPM = PIXELS_PER_METER;
const C = POND_COLORS;

interface Ripple {
  x: number;
  age: number;
  max: number;
  size: number;
}

interface Tadpole {
  x: number;
  y: number;
  vx: number;
  phase: number;
  scared: number;
}

interface Pond {
  area: AreaDef;
  waves: WaveSurface;
  ripples: Ripple[];
  tadpoles: Tadpole[];
  /** The last surface the sim reported. */
  surface: WaterSurface | null;
}

/** A dragonfly that zips across now and then and rests on a cattail. */
interface Dragonfly {
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  flying: boolean;
}

const soft = (width = 3, alpha = 0.55) => ({
  width,
  color: OUTLINE,
  alpha,
  cap: 'round' as const,
  join: 'round' as const,
});

/**
 * Draws the water: a deep back layer behind everything, a clear tinted front
 * layer over whatever is under the surface, a wobbly surface with ripples
 * and glints, lily pads, ice, the hose and its spray, and pond life. All
 * cosmetic and render-side: it reads the sim and never writes to it.
 */
export class WaterView {
  /** Behind entities: the depths, the pond bottom, pads, ice, the tap. */
  readonly back = new Container();
  /** In front of entities: the clear water, the surface line, ripples. */
  readonly front = new Container();
  private readonly deep = new Graphics();
  private readonly bottom = new Graphics();
  private readonly life = new Graphics();
  private readonly pads = new Graphics();
  private readonly ice = new Graphics();
  private readonly tap = new Graphics();
  private readonly overlay = new Graphics();
  private readonly surfaceG = new Graphics();
  private readonly spray = new Graphics();
  private readonly ponds: Pond[] = [];
  private readonly dragonfly: Dragonfly;
  private time = 0;
  private tapAngle = 0;
  private sprayRamp = 0;
  private dripIn = 1;
  private deepFill: FillGradient;

  constructor(
    private readonly sim: Sim,
    private readonly particles: Particles,
  ) {
    this.back.addChild(this.deep, this.bottom, this.life, this.pads, this.ice, this.tap);
    this.front.addChild(this.overlay, this.spray, this.surfaceG);
    this.deepFill = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: mix(C.surface, 0xffffff, 0.1) },
        { offset: 0.35, color: C.surface },
        { offset: 1, color: C.deep },
      ],
      textureSpace: 'local',
    });
    for (const area of sim.content.areas.all) {
      const w = area.water;
      if (!w) continue;
      const x0 = (area.xStart + w.x0) * PPM;
      const x1 = (area.xStart + w.x1) * PPM;
      const tadpoles: Tadpole[] = [];
      for (let i = 0; i < 9; i++)
        tadpoles.push({
          x: x0 + 200 + Math.random() * (x1 - x0 - 400),
          y: 0,
          vx: (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 30),
          phase: Math.random() * 10,
          scared: 0,
        });
      this.ponds.push({
        area,
        waves: new WaveSurface(x0 - 40, x1 + 40),
        ripples: [],
        tadpoles,
        surface: null,
      });
      this.drawBottom(area);
    }
    const first = this.ponds[0];
    const home = first ? (first.area.xStart + (first.area.water?.x1 ?? 0) + 0.6) * PPM : 0;
    this.dragonfly = { x: home, y: 520, tx: home, ty: 520, wait: 8, flying: false };
  }

  /** Static things on the pond bottom: the sunken teacup, the rubber boot, pond weed. */
  private drawBottom(area: AreaDef): void {
    const g = this.bottom;
    const ax = area.xStart * PPM;
    const ground = (x: number): number => this.sim.surfaceY(x / PPM) * PPM;
    // A half-sunk teacup at x 12 (design doc: x 1200).
    {
      const x = ax + 12 * PPM;
      const y = ground(x) + 6;
      const tint = (c: number): number => mix(c, C.deep, 0.35);
      g.moveTo(x - 62, y - 70)
        .bezierCurveTo(x - 60, y - 5, x + 60, y - 5, x + 62, y - 70)
        .closePath()
        .fill(tint(0xfdf6ec))
        .stroke(soft(4, 0.5));
      g.ellipse(x, y - 70, 62, 14)
        .fill(tint(0xc9a27a))
        .stroke(soft(3, 0.5));
      g.moveTo(x + 58, y - 56)
        .bezierCurveTo(x + 100, y - 60, x + 100, y - 22, x + 50, y - 26)
        .stroke({ width: 9, color: tint(0xfdf6ec), cap: 'round' });
      for (let i = 0; i < 5; i++)
        g.circle(x - 40 + i * 20, y - 38 + (i % 2) * 8, 5).fill({ color: tint(0x6fa8dc), alpha: 0.9 });
    }
    // The rubber boot on its side, at the boot fixture.
    const boot = (area.fixtures ?? []).find((f) => f.kind === 'rubber_boot');
    if (boot) {
      const x = ax + boot.x * PPM;
      const y = ground(x) + 4;
      const c = mix(0xf2c230, C.deep, 0.35);
      g.moveTo(x - 60, y)
        .lineTo(x - 60, y - 48)
        .lineTo(x + 10, y - 58)
        .quadraticCurveTo(x + 58, y - 60, x + 70, y - 30)
        .lineTo(x + 76, y)
        .closePath()
        .fill(c)
        .stroke(soft(4, 0.5));
      g.ellipse(x - 60, y - 24, 12, 26)
        .fill(darken(c, 0.5))
        .stroke(soft(3, 0.5));
      g.rect(x - 50, y - 8, 124, 8).fill(darken(c, 0.25));
      g.moveTo(x - 30, y - 44)
        .lineTo(x + 20, y - 50)
        .stroke({ width: 5, color: lighten(c, 0.4), alpha: 0.7, cap: 'round' });
    }
  }

  /** Surfaces from the sim, refreshed each frame. */
  private refresh(): void {
    const surfaces = this.sim.environment.surfaces();
    for (const pond of this.ponds) pond.surface = surfaces.find((s) => s.areaId === pond.area.id) ?? null;
  }

  private pondAt(xPx: number): Pond | null {
    for (const p of this.ponds)
      if (p.surface && xPx > p.surface.left * PPM && xPx < p.surface.right * PPM) return p;
    return null;
  }

  /** World-pixel y of the live surface at x, or null if there is no water there. */
  surfaceAt(xPx: number): number | null {
    const p = this.pondAt(xPx);
    if (!p?.surface) return null;
    return p.surface.level * PPM + p.waves.heightAt(xPx) + swell(xPx, this.time);
  }

  /** Something hit the water: ripples, a ring, and tadpoles scatter. */
  splash(xPx: number, speed: number, size: number): void {
    const p = this.pondAt(xPx);
    if (!p) return;
    const kick = Math.min(160, 25 + speed * 18) * Math.min(1.4, 0.6 + size * 2);
    p.waves.disturb(xPx, kick, 26 + size * 60);
    p.ripples.push({ x: xPx, age: 0, max: 1.1, size: 30 + size * 90 + speed * 6 });
    for (const t of p.tadpoles) if (Math.abs(t.x - xPx) < 260) t.scared = 1.2;
  }

  /** A little ring where something bobs or a bug paddles. */
  ripple(xPx: number, size = 26): void {
    const p = this.pondAt(xPx);
    if (!p || p.ripples.length > 30) return;
    p.ripples.push({ x: xPx, age: 0, max: 0.9, size });
    p.waves.disturb(xPx, 30, 20);
  }

  /**
   * How far a floating thing rides the ripples: a vertical offset in pixels
   * and a gentle rock in radians. Zero for anything not floating.
   */
  bob(view: EntityView): { dy: number; angle: number } {
    if (view.held || view.submerged <= 0 || view.submerged >= 0.98) return { dy: 0, angle: 0 };
    const x = view.x * PPM;
    const p = this.pondAt(x);
    if (!p) return { dy: 0, angle: 0 };
    const k = Math.min(1, view.submerged * 3);
    const dy = (p.waves.heightAt(x) + swell(x, this.time)) * k;
    const slope = p.waves.slopeAt(x) + (swell(x + 10, this.time) - swell(x - 10, this.time)) / 20;
    return { dy, angle: Math.atan(slope) * 0.8 * k };
  }

  update(dt: number, camera: Camera, views: readonly EntityView[]): void {
    this.time += dt;
    this.refresh();
    const left = camera.x * PPM - 300;
    const right = (camera.x + camera.viewWidth) * PPM + 300;
    // Floaters and skaters stir the surface as they move.
    for (const v of views) {
      if (v.held) continue;
      const x = v.x * PPM;
      const p = this.pondAt(x);
      if (!p?.surface) continue;
      const nearTop = Math.abs(v.y - p.surface.level) < 0.8;
      if (v.submerged > 0 && v.submerged < 1 && nearTop) {
        const stir = Math.abs(v.vy) * 60 + Math.abs(v.vx) * 12;
        if (stir > 4) p.waves.disturb(x, stir * dt * 40, 24);
        if (Math.abs(v.vx) > 0.4 && Math.random() < dt * 3) this.ripple(x - Math.sign(v.vx) * 30, 18);
      }
      if (v.bug?.mode === 'st_swim' && Math.random() < dt * 2.5) this.ripple(x, 22);
      if (v.defId === 'bug_waterstrider_skeet' && this.sim.environment.skating.has(v.id)) {
        if (Math.abs(v.vx) > 0.3 && Math.random() < dt * 5) {
          // Dimples under each long foot, left behind as he skates.
          this.ripple(x - 55, 14);
          this.ripple(x + 60, 14);
        }
      }
    }
    for (const p of this.ponds) {
      if (!p.surface) continue;
      p.waves.step(dt);
      for (const r of p.ripples) r.age += dt;
      p.ripples = p.ripples.filter((r) => r.age < r.max);
    }
    this.drawDeep(left, right);
    this.drawLife(dt, left, right);
    this.drawPads();
    this.drawIce();
    this.drawTap(dt);
    this.drawOverlay(left, right);
    this.drawSpray(dt);
  }

  /** Points along the live surface from left to right edge, every 10 px. */
  private surfacePoints(p: Pond, from: number, to: number): number[] {
    const s = p.surface!;
    const a = Math.max(s.left * PPM, from);
    const b = Math.min(s.right * PPM, to);
    const pts: number[] = [];
    for (let x = a; x < b; x += 10) pts.push(x, s.level * PPM + p.waves.heightAt(x) + swell(x, this.time));
    pts.push(b, s.level * PPM + p.waves.heightAt(b) + swell(b, this.time));
    return pts;
  }

  /** The water body's outline: the surface, then back along the basin floor. */
  private bodyPolygon(p: Pond, from: number, to: number): number[] {
    const top = this.surfacePoints(p, from, to);
    const a = top[0]!;
    const b = top[top.length - 2]!;
    const floor: number[] = [];
    for (let x = b; x > a; x -= 12) floor.push(x, this.sim.surfaceY(x / PPM) * PPM + 2);
    floor.push(a, this.sim.surfaceY(a / PPM) * PPM + 2);
    return [...top, ...floor];
  }

  private drawDeep(left: number, right: number): void {
    const g = this.deep.clear();
    for (const p of this.ponds) {
      if (!p.surface) continue;
      const poly = this.bodyPolygon(p, left, right);
      if (poly.length < 8) continue;
      g.poly(poly).fill(this.deepFill);
      // Slanting sun shafts through the water.
      const s = p.surface;
      for (let i = 0; i < 7; i++) {
        const x = s.left * PPM + ((i * 263 + this.time * 14) % ((s.right - s.left) * PPM));
        if (x < left || x > right) continue;
        const top = s.level * PPM + 6;
        const bot = this.sim.surfaceY(x / PPM) * PPM;
        const w = 26 + (i % 3) * 14;
        g.poly([x, top, x + w, top, x + w - 60, bot, x - 60, bot]).fill({ color: 0xffffff, alpha: 0.07 });
      }
      // Caustics: wobbly light lines on the floor.
      for (let x = Math.max(left, s.left * PPM + 20); x < Math.min(right, s.right * PPM - 20); x += 46) {
        const y = this.sim.surfaceY(x / PPM) * PPM - 6;
        const k = Math.sin(x * 0.05 + this.time * 2.3) * 0.5 + 0.5;
        g.moveTo(x, y - k * 6)
          .quadraticCurveTo(x + 12, y - 12 - k * 5, x + 26, y - 4)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.12 + 0.1 * k, cap: 'round' });
      }
    }
  }

  /** Pond weed, tadpoles, frog eyes, bubbles from the boot, and the dragonfly. */
  private drawLife(dt: number, left: number, right: number): void {
    const g = this.life.clear();
    for (const p of this.ponds) {
      const s = p.surface;
      if (!s) continue;
      const ax = p.area.xStart * PPM;
      // Pond weed swaying on the bottom.
      for (let i = 0; i < 16; i++) {
        const x = s.left * PPM + 90 + i * (((s.right - s.left) * PPM - 180) / 15) + (i % 3) * 17;
        if (x < left || x > right) continue;
        const y = this.sim.surfaceY(x / PPM) * PPM + 4;
        const h = 60 + ((i * 37) % 70);
        const sway = Math.sin(this.time * 1.4 + i) * 14;
        g.moveTo(x, y)
          .bezierCurveTo(x + sway * 0.5, y - h * 0.4, x - sway, y - h * 0.7, x + sway, y - h)
          .stroke({ width: 9, color: mix(0x5fa347, C.deep, 0.3), cap: 'round' });
      }
      // Tadpoles: little black commas that wiggle about and flee splashes.
      for (const t of p.tadpoles) {
        const floor = this.sim.surfaceY(t.x / PPM) * PPM;
        if (t.y === 0) t.y = (s.level * PPM + floor) / 2 + (Math.random() - 0.5) * 30;
        t.scared = Math.max(0, t.scared - dt);
        const speed = t.scared > 0 ? 3.2 : 1;
        t.x += t.vx * speed * dt;
        t.y += Math.sin(this.time * 2 + t.phase) * 12 * dt;
        const minY = s.level * PPM + 30;
        const maxY = floor - 16;
        t.y = Math.min(maxY, Math.max(minY, t.y));
        if (
          t.x < s.left * PPM + 70 ||
          t.x > s.right * PPM - 70 ||
          this.sim.surfaceY(t.x / PPM) * PPM < t.y + 16
        ) {
          t.vx = -t.vx;
          t.x += t.vx * dt * 2;
        }
        if (t.x < left || t.x > right) continue;
        const dir = Math.sign(t.vx) || 1;
        const wig = Math.sin(this.time * (t.scared > 0 ? 30 : 14) + t.phase) * 7;
        g.moveTo(t.x - dir * 10, t.y)
          .quadraticCurveTo(t.x - dir * 20, t.y + wig, t.x - dir * 30, t.y + wig * 1.4)
          .stroke({ width: 5, color: 0x243040, cap: 'round' });
        g.ellipse(t.x, t.y, 11, 8).fill(0x243040);
        g.circle(t.x + dir * 4, t.y - 3, 2).fill({ color: 0xffffff, alpha: 0.8 });
      }
      // Frog eyes peeking over the surface near the far-left reeds. Blinks, does nothing else.
      {
        const fx = ax + (p.area.water!.x0 + 1.6) * PPM;
        const fy = s.level * PPM + swell(fx, this.time);
        if (fx > left && fx < right) {
          const blink = this.time % 5.3 < 0.14;
          for (const dx of [-16, 16]) {
            g.circle(fx + dx, fy - 8, 13)
              .fill(0x6fbf4a)
              .stroke(soft(3, 0.6));
            if (blink)
              g.moveTo(fx + dx - 8, fy - 9)
                .lineTo(fx + dx + 8, fy - 9)
                .stroke({ width: 3, color: OUTLINE, cap: 'round' });
            else {
              g.circle(fx + dx, fy - 10, 8).fill(0xffffff);
              g.circle(fx + dx + 1, fy - 10, 4.5).fill(OUTLINE);
            }
          }
        }
      }
    }
    this.drawDragonfly(g, dt);
  }

  private drawDragonfly(g: Graphics, dt: number): void {
    const d = this.dragonfly;
    const pond = this.ponds[0];
    if (!pond?.surface) return;
    d.wait -= dt;
    if (!d.flying && d.wait <= 0) {
      // Zip to a new spot: across the pond, to a cattail on the other side.
      d.flying = true;
      const s = pond.surface;
      const goLeft = d.x > (s.left + s.right) * 0.5 * PPM;
      d.tx = goLeft ? s.left * PPM - 110 : s.right * PPM + 90;
      d.ty = 560 + Math.random() * 60;
    }
    if (d.flying) {
      const dx = d.tx - d.x;
      const dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.min(dist, 700 * dt);
      d.x += (dx / (dist || 1)) * step;
      d.y += (dy / (dist || 1)) * step + Math.sin(this.time * 9) * 60 * dt;
      if (dist < 4) {
        d.flying = false;
        d.wait = 40 + Math.random() * 30;
      }
    }
    const flap = d.flying ? Math.sin(this.time * 70) : 0.3;
    const dir = d.tx < d.x ? -1 : 1;
    const { x, y } = d;
    for (const [ox, k] of [
      [-6, 1],
      [6, 0.8],
    ] as const) {
      g.ellipse(x + ox * dir, y - 10 - flap * 6 * k, 22, 7)
        .fill({ color: 0xe8f7ff, alpha: 0.75 })
        .stroke(soft(2, 0.4));
    }
    g.moveTo(x - dir * 34, y + 2)
      .lineTo(x + dir * 8, y)
      .stroke({ width: 7, color: 0x2fb6c9, cap: 'round' });
    g.moveTo(x - dir * 34, y + 2)
      .lineTo(x + dir * 8, y)
      .stroke({ width: 2, color: OUTLINE, alpha: 0.5, cap: 'round' });
    g.circle(x + dir * 12, y - 1, 7)
      .fill(0x2f8fbf)
      .stroke(soft(2, 0.6));
    g.circle(x + dir * 15, y - 3, 3).fill(OUTLINE);
  }

  /** Lily pads: flat green discs with a notch and veins; the middle one has a pink bloom. */
  private drawPads(): void {
    const g = this.pads.clear();
    const pads = this.sim.environment.pads();
    pads.forEach((pad, i) => {
      const x = pad.x * PPM;
      const y = pad.y * PPM;
      const rx = (PAD_WIDTH / 2) * PPM + 4;
      const ry = 17;
      const notch = i % 2 === 0 ? 1 : -1;
      const pts: number[] = [];
      for (let k = 0; k <= 40; k++) {
        const a = -Math.PI / 2 + notch * 0.22 + (k / 40) * (Math.PI * 2 - 0.44);
        pts.push(x + Math.cos(a) * rx * notch, y + Math.sin(a) * ry);
      }
      pts.push(x, y);
      g.poly(pts).fill(darken(C.lily, 0.25)).stroke(stroke(4));
      const top: number[] = [];
      for (let k = 0; k <= 40; k++) {
        const a = -Math.PI / 2 + notch * 0.22 + (k / 40) * (Math.PI * 2 - 0.44);
        top.push(x + Math.cos(a) * rx * 0.93 * notch, y - 3 + Math.sin(a) * ry * 0.7);
      }
      top.push(x, y - 3);
      g.poly(top).fill(C.lily);
      for (let k = 0; k < 6; k++) {
        const a = Math.PI * (0.15 + k * 0.14);
        g.moveTo(x, y - 3)
          .lineTo(
            x + Math.cos(a) * rx * 0.85 * (k % 2 ? 1 : -1),
            y - 3 + Math.sin(a - Math.PI / 2) * ry * 0.55,
          )
          .stroke({ width: 2.5, color: lighten(C.lily, 0.25), alpha: 0.8, cap: 'round' });
      }
      g.ellipse(x - rx * 0.35, y - 8, rx * 0.25, 3).fill({ color: 0xffffff, alpha: 0.35 });
      if (i === 1) this.bloom(g, x + 26, y - 10);
    });
  }

  /** A pink water-lily bloom. */
  private bloom(g: Graphics, x: number, y: number): void {
    const petal = (a: number, len: number, color: number): void => {
      const tx = x + Math.sin(a) * len;
      const ty = y - Math.cos(a) * len;
      g.moveTo(x, y)
        .quadraticCurveTo(x + Math.sin(a - 0.5) * len * 0.7, y - Math.cos(a - 0.5) * len * 0.7, tx, ty)
        .quadraticCurveTo(x + Math.sin(a + 0.5) * len * 0.7, y - Math.cos(a + 0.5) * len * 0.7, x, y)
        .fill(color)
        .stroke(soft(2.5, 0.6));
    };
    for (const a of [-1.3, 1.3, -0.8, 0.8]) petal(a, 26, lighten(C.bloom, 0.25));
    for (const a of [-0.35, 0.35, 0]) petal(a, 30, C.bloom);
    g.circle(x, y - 6, 6).fill(0xffd84d);
  }

  /** Ice sheets: pale, glassy slabs with glints and a crack or two. */
  private drawIce(): void {
    const g = this.ice.clear();
    for (const sheet of this.sim.environment.state.ice) {
      const area = this.sim.content.areas.get(sheet.areaId);
      const s = this.sim.environment.surfaces().find((w) => w.areaId === area.id);
      if (!s) continue;
      const x0 = sheet.x0 * PPM;
      const x1 = sheet.x1 * PPM;
      const y = s.level * PPM + 2;
      const left = (sheet.until - this.sim.tick) / 60;
      const melt = Math.min(1, left / 5); // thins out over its last 5 s
      const h = 14 * (0.5 + 0.5 * melt);
      g.roundRect(x0, y - h / 2, x1 - x0, h, h / 2)
        .fill({ color: 0xdff4ff, alpha: 0.8 })
        .stroke({ width: 3.5, color: 0x7fb8d8, alpha: 0.9 });
      g.moveTo(x0 + 16, y - h / 2 + 3)
        .lineTo(x1 - 40, y - h / 2 + 3)
        .stroke({ width: 3, color: 0xffffff, alpha: 0.9, cap: 'round' });
      const mid = (x0 + x1) / 2;
      g.moveTo(mid - 30, y - 2)
        .lineTo(mid - 8, y + 3)
        .lineTo(mid + 18, y - 3)
        .stroke({ width: 2, color: 0x9fcbe6, alpha: 0.9 });
      for (let k = 0; k < 3; k++) {
        const tw = Math.sin(this.time * 5 + k * 2.1 + sheet.id);
        if (tw > 0.2) {
          const sx = x0 + ((k + 0.5) / 3) * (x1 - x0);
          g.star(sx, y - h, 4, 7 * tw, 2.5 * tw).fill(0xffffff);
        }
      }
    }
  }

  /** The tap's red wheel turns when clicked; the nozzle drips when it is off. */
  private drawTap(dt: number): void {
    const g = this.tap.clear();
    const hose = this.hoseTap();
    if (!hose) return;
    const on = this.sim.environment.state.hoseOn;
    const target = on ? Math.PI * 1.5 : 0;
    this.tapAngle += (target - this.tapAngle) * Math.min(1, dt * 8);
    const { x, y } = hose;
    const r = 30;
    g.circle(x, y, r + 3).fill({ color: 0xffffff, alpha: 0.25 });
    for (let k = 0; k < 4; k++) {
      const a = this.tapAngle + (k * Math.PI) / 2;
      g.moveTo(x, y)
        .lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55)
        .stroke({ width: 13, color: OUTLINE, cap: 'round' });
      g.moveTo(x, y)
        .lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55)
        .stroke({ width: 7, color: C.tap, cap: 'round' });
    }
    g.ellipse(x, y, r, r * 0.55).stroke({ width: 10, color: OUTLINE });
    g.ellipse(x, y, r, r * 0.55).stroke({ width: 5, color: C.tap });
    g.circle(x, y, 9).fill(C.brass).stroke(stroke(3.5));
    // The dripping nozzle, when off.
    if (!on) {
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        this.dripIn = 1.2 + Math.random() * 1.6;
        const n = this.nozzle();
        if (n) this.particles.drops(n.x - 6, n.y + 4, -10, 40, C.surface, 1);
      }
    }
  }

  private hoseTap(): { x: number; y: number } | null {
    for (const area of this.sim.content.areas.all) {
      const f = (area.fixtures ?? []).find((ff) => ff.kind === 'hose_tap');
      if (f) return { x: (area.xStart + f.x) * PPM, y: f.y * PPM };
    }
    return null;
  }

  private nozzle(): { x: number; y: number } | null {
    const t = this.hoseTap();
    return t ? { x: t.x + SPRAY.dx * PPM, y: t.y + SPRAY.dy * PPM } : null;
  }

  /** The spray: a clear stream along the arc with droplets riding it, and mist where it lands. */
  private drawSpray(dt: number): void {
    const g = this.spray.clear();
    const arc = this.sim.environment.spray();
    const on = arc.length > 1;
    this.sprayRamp = Math.max(0, Math.min(1, this.sprayRamp + (on ? dt * 3 : -dt * 4)));
    if (!on || this.sprayRamp <= 0) return;
    const pts = arc.map(([x, y]) => [x * PPM, y * PPM] as const);
    const n = Math.max(2, Math.round(pts.length * this.sprayRamp));
    const path = (w: number, color: number, alpha: number): void => {
      pts.slice(0, n).forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.stroke({ width: w, color, alpha, cap: 'round', join: 'round' });
    };
    path(16, OUTLINE, 0.18);
    path(12, C.surface, 0.75);
    path(4, 0xffffff, 0.8);
    for (let k = 0; k < 14; k++) {
      const u = (k / 14 + this.time * 1.8) % 1;
      const i = Math.min(n - 1, Math.floor(u * (n - 1)));
      const [x, y] = pts[i]!;
      const jitter = Math.sin(k * 12.9 + this.time * 7) * 7;
      g.circle(x + jitter, y + jitter * 0.6, 4 + (k % 3)).fill({ color: 0xe8f8ff, alpha: 0.95 });
    }
    const [lx, ly] = pts[n - 1]!;
    if (n === pts.length) {
      this.ripple(lx, 20);
      if (Math.random() < dt * 14)
        this.particles.drops(lx, ly - 4, (Math.random() - 0.5) * 200, -220, C.surface, 2);
      for (const p of this.ponds) p.waves.disturb(lx, 180 * dt * 10, 26);
    }
  }

  /** The clear front layer: tint over anything underwater, the surface line, ripples, glints. */
  private drawOverlay(left: number, right: number): void {
    const g = this.overlay.clear();
    const sg = this.surfaceG.clear();
    for (const p of this.ponds) {
      const s = p.surface;
      if (!s) continue;
      const poly = this.bodyPolygon(p, left, right);
      if (poly.length < 8) continue;
      g.poly(poly).fill({ color: C.surface, alpha: 0.3 });
      const top = this.surfacePoints(p, left, right);
      // A lighter band just under the surface.
      const band = [...top];
      for (let i = top.length - 2; i >= 0; i -= 2) band.push(top[i]!, top[i + 1]! + 14);
      g.poly(band).fill({ color: 0xbfeaf7, alpha: 0.35 });
      // The surface line: a soft outline with a bright top edge.
      const line = (w: number, color: number, alpha: number, dy = 0): void => {
        sg.moveTo(top[0]!, top[1]! + dy);
        for (let i = 2; i < top.length; i += 2) sg.lineTo(top[i]!, top[i + 1]! + dy);
        sg.stroke({ width: w, color, alpha, cap: 'round', join: 'round' });
      };
      line(7, OUTLINE, 0.3, 1);
      line(4, 0xffffff, 0.95);
      // Ripples: flat rings spreading on the surface.
      for (const r of p.ripples) {
        const t = r.age / r.max;
        const y = s.level * PPM + p.waves.heightAt(r.x) + swell(r.x, this.time) + 3;
        sg.ellipse(r.x, y, r.size * (0.3 + t), r.size * (0.08 + t * 0.18)).stroke({
          width: 3.5 * (1 - t) + 1,
          color: 0xffffff,
          alpha: 0.85 * (1 - t),
        });
      }
      // Glints: little stars twinkling on the water in the sun.
      for (let k = 0; k < 10; k++) {
        const x = s.left * PPM + ((k * 331.7) % ((s.right - s.left) * PPM));
        if (x < left || x > right) continue;
        const tw = Math.sin(this.time * 2.6 + k * 1.9);
        if (tw < 0.55) continue;
        const y = s.level * PPM + p.waves.heightAt(x) + swell(x, this.time) + 8;
        const r = 9 * (tw - 0.55) * 2.2;
        sg.star(x, y, 4, r, r * 0.3).fill({ color: 0xffffff, alpha: 0.95 });
      }
    }
  }

  /** Short-lived test hook data: live ripples. */
  get rippleCount(): number {
    return this.ponds.reduce((n, p) => n + p.ripples.length, 0);
  }

  destroy(): void {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
