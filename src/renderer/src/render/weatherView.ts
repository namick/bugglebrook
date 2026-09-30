import { Container, Graphics, Sprite } from 'pixi.js';
import { PIXELS_PER_METER, VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import type { EntityView, Sim } from '../../../game/sim';
import { HOUR, timeOfDay } from '../../../game/systems/sky';
import { MUSHROOMS } from './background';
import type { Camera } from './camera';
import { coneTexture, glowTexture } from './lightTextures';
import { OUTLINE, mix } from './palette';
import type { SkyLook, WeatherMix } from './skyLook';
import type { WaterView } from './water';

const PPM = PIXELS_PER_METER;

/** Budgets that keep weather cheap at 60 fps: drops in front and far away, splashes, leaves. */
export const RAIN_NEAR = 170;
export const RAIN_FAR = 130;
export const SPLASH_MAX = 70;
export const LEAF_MAX = 26;
export const FIREFLIES = 16;

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
  water: boolean;
}

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  rot: number;
  color: number;
  size: number;
  petal: boolean;
}

interface Firefly {
  /** Home spot in world px; it wanders around it. */
  hx: number;
  hy: number;
  x: number;
  y: number;
  phase: number;
  speed: number;
  /** Seconds left of a bright blink. */
  flash: number;
}

/** How dawn mist comes and goes: strongest at 06:00, gone by 08:00. Pure. */
export function mistAt(hour: number, rain: number): number {
  const dawn = hour >= 4.5 && hour < 8 ? Math.sin(((hour - 4.5) / 3.5) * Math.PI) : 0;
  return Math.max(0, Math.min(1, dawn * 0.9 + rain * 0.25));
}

/** How many rain drops to draw for a rain amount, within the budget. Pure. */
export function dropCount(rain: number, budget: number): number {
  return Math.round(Math.max(0, Math.min(1, rain)) * budget);
}

/**
 * Weather and light, drawn: rain streaks near and far with splashes and
 * rings on the pond, puddles in the plaza's dips, blowing leaves, dawn
 * mist, fireflies over the reeds, and the glow of lights at night
 * (glowing things, Flick's tail, the flashlight's beam, the mushrooms, the
 * moon on the pond). Render-only: it reads the sim and never changes it.
 */
export class WeatherView {
  /** Screen space, behind the mid grass: far rain and mist. */
  readonly back = new Container();
  /** World space, graded with the ground: puddles. */
  readonly puddles = new Graphics();
  /** World space, over the graded world: additive lights. */
  readonly lights = new Container();
  /** World space: splashes on the ground and rings on the water. */
  readonly splashLayer = new Graphics();
  /** Screen space, in front of everything: near rain and leaves. */
  readonly front = new Container();
  private readonly farRain = new Graphics();
  private readonly nearRain = new Graphics();
  private readonly leafG = new Graphics();
  private readonly mistBack: Sprite[] = [];
  private readonly mistFront: Sprite[] = [];
  private readonly fireflyDots = new Graphics();
  private readonly lightSprites: Sprite[] = [];
  private readonly cones: Sprite[] = [];
  private used = 0;
  private cone = 0;
  private near: Drop[] = [];
  private far: Drop[] = [];
  private splashes: Splash[] = [];
  private leaves: Leaf[] = [];
  private rings: { x: number; age: number }[] = [];
  private readonly flies: Firefly[] = [];
  private time = 0;
  /** Seconds since the fireflies last blinked back at a light, and how big the blink was. */
  private answer = 0;
  private answerBig = false;
  /** Sounds from the weather itself (rain patter), and how loud. */
  onSound: ((name: 'rain' | 'wind' | 'cricket', strength: number) => void) | null = null;
  private soundIn = 0;

  constructor(
    private readonly sim: Sim,
    private readonly water: WaterView,
  ) {
    this.back.addChild(this.farRain);
    this.front.addChild(this.nearRain, this.leafG);
    const glow = glowTexture();
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(glow);
      s.anchor.set(0.5);
      s.alpha = 0;
      this.mistBack.push(s);
      this.back.addChild(s);
    }
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(glow);
      s.anchor.set(0.5);
      s.alpha = 0;
      this.mistFront.push(s);
      this.front.addChildAt(s, 0);
    }
    this.lights.addChild(this.fireflyDots);
    // Fireflies live over the reeds, with a few by the mushroom ring.
    for (const area of sim.content.areas.all)
      for (const f of area.fixtures ?? []) {
        if (f.kind !== 'reeds') continue;
        for (let i = 0; i < FIREFLIES - 4; i++)
          this.flies.push(
            this.firefly(
              (area.xStart + f.x) * PPM + (Math.random() - 0.5) * f.radius * 2 * PPM,
              f.y * PPM + (Math.random() - 0.3) * 140,
            ),
          );
      }
    const plaza = sim.content.areas.tryGet('area_stump_plaza');
    if (plaza)
      for (let i = 0; i < 4; i++) {
        const [mx] = MUSHROOMS[i % MUSHROOMS.length]!;
        this.flies.push(
          this.firefly(plaza.xStart * PPM + mx + (Math.random() - 0.5) * 300, 700 + Math.random() * 120),
        );
      }
  }

  private firefly(x: number, y: number): Firefly {
    return { hx: x, hy: y, x, y, phase: Math.random() * 10, speed: 0.5 + Math.random() * 0.6, flash: 0 };
  }

  /** What is being drawn now, to check the budgets. */
  stats(): { drops: number; leaves: number; lights: number } {
    return {
      drops: this.near.length + this.far.length,
      leaves: this.leaves.length,
      lights: this.used + this.cone,
    };
  }

  /** The fireflies blink back at a light; `big` is the answer that brings Flick. */
  blinkBack(big: boolean): void {
    this.answer = big ? 2.4 : 1.2;
    this.answerBig = big;
    for (const f of this.flies) f.flash = Math.max(f.flash, 0.3 + Math.random() * 0.3);
  }

  /** A light sprite for this frame. */
  private light(x: number, y: number, radius: number, color: number, alpha: number, sx = 1, sy = 1): void {
    if (alpha <= 0.01) return;
    let s = this.lightSprites[this.used];
    if (!s) {
      s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.lightSprites.push(s);
      this.lights.addChildAt(s, 0);
    }
    this.used++;
    s.visible = true;
    s.position.set(x, y);
    const k = (radius * 2) / 256;
    s.scale.set(k * sx, k * sy);
    s.tint = color;
    s.alpha = Math.min(1, alpha);
  }

  update(dt: number, camera: Camera, look: SkyLook, w: WeatherMix, views: readonly EntityView[]): void {
    this.time += dt;
    const left = camera.x * PPM;
    const hour = timeOfDay(this.sim.weather.clock) / HOUR;
    const wind = this.sim.environment.state.wind;
    this.updateRain(dt, left, w.rain, wind);
    this.updateLeaves(dt, w.wind, wind);
    this.updateMist(hour, w.rain, look);
    this.drawPuddles(w.rain);
    this.used = 0;
    this.cone = 0;
    this.updateLights(dt, look, views, left);
    for (let i = this.used; i < this.lightSprites.length; i++) this.lightSprites[i]!.visible = false;
    for (let i = this.cone; i < this.cones.length; i++) this.cones[i]!.visible = false;
    this.sounds(dt, w, look);
  }

  private updateRain(dt: number, left: number, rain: number, wind: number): void {
    const slant = wind * 70 + 40;
    const refill = (list: Drop[], n: number, far: boolean): Drop[] => {
      while (list.length < n)
        list.push({
          x: Math.random() * (VIEW_WIDTH_PX + 400) - 200,
          y: Math.random() * -VIEW_HEIGHT_PX,
          len: far ? 14 + Math.random() * 10 : 26 + Math.random() * 20,
          speed: far ? 700 + Math.random() * 200 : 1250 + Math.random() * 350,
        });
      return list.slice(0, n);
    };
    this.near = refill(this.near, dropCount(rain, RAIN_NEAR), false);
    this.far = refill(this.far, dropCount(rain, RAIN_FAR), true);
    const nearG = this.nearRain.clear();
    const farG = this.farRain.clear();
    const sim = this.sim;
    for (const d of this.near) {
      d.y += d.speed * dt;
      d.x += (slant * d.speed * dt) / 1000;
      const wx = left + d.x;
      const wy = sim.terrain.surfaceY(wx / PPM) * PPM;
      const water = this.water.surfaceAt(wx);
      const floor = water ?? wy;
      if (d.y > floor) {
        if (this.splashes.length < SPLASH_MAX && Math.random() < 0.6)
          this.splashes.push({ x: wx, y: floor, age: 0, water: water !== null });
        if (water !== null && this.rings.length < 40 && Math.random() < 0.5)
          this.rings.push({ x: wx, age: 0 });
        d.y = -Math.random() * 200 - d.len;
        d.x = Math.random() * (VIEW_WIDTH_PX + 400) - 200 - slant * 0.4;
        continue;
      }
      const dx = (slant * d.len) / 1000;
      nearG.moveTo(d.x, d.y).lineTo(d.x + dx, d.y + d.len);
    }
    if (this.near.length > 0) nearG.stroke({ width: 2.6, color: 0xe6f1ff, alpha: 0.55, cap: 'round' });
    for (const d of this.far) {
      d.y += d.speed * dt;
      d.x += (slant * 0.6 * d.speed * dt) / 1000;
      if (d.y > VIEW_HEIGHT_PX * 0.86) {
        d.y = -Math.random() * 200 - d.len;
        d.x = Math.random() * (VIEW_WIDTH_PX + 400) - 200;
        continue;
      }
      farG.moveTo(d.x, d.y).lineTo(d.x + (slant * 0.6 * d.len) / 1000, d.y + d.len);
    }
    if (this.far.length > 0) farG.stroke({ width: 1.6, color: 0xdce8f7, alpha: 0.35, cap: 'round' });
    // Splashes: two little droplets hopping out; rings spread on the water.
    const sg = this.splashLayer.clear();
    this.splashes = this.splashes.filter((s) => (s.age += dt) < 0.28);
    for (const s of this.splashes) {
      const t = s.age / 0.28;
      const a = 0.7 * (1 - t);
      if (s.water)
        sg.ellipse(s.x, s.y, 4 + t * 10, 1.5 + t * 3).stroke({ width: 2, color: 0xffffff, alpha: a });
      else {
        const up = Math.sin(t * Math.PI) * 10;
        sg.circle(s.x - 3 - t * 9, s.y - up, 2.2).fill({ color: 0xe6f1ff, alpha: a });
        sg.circle(s.x + 3 + t * 9, s.y - up * 0.8, 1.8).fill({ color: 0xe6f1ff, alpha: a });
      }
    }
    this.rings = this.rings.filter((r) => (r.age += dt) < 0.9);
    for (const r of this.rings) {
      const y = this.water.surfaceAt(r.x);
      if (y === null) continue;
      const t = r.age / 0.9;
      sg.ellipse(r.x, y, 6 + t * 26, 2 + t * 6).stroke({ width: 2, color: 0xffffff, alpha: 0.5 * (1 - t) });
    }
  }

  private updateLeaves(dt: number, amount: number, wind: number): void {
    const g = this.leafG.clear();
    const want = Math.round(
      Math.min(1, amount + Math.min(1, Math.abs(wind) / 3)) * LEAF_MAX * (wind !== 0 ? 1 : 0),
    );
    const dir = wind >= 0 ? 1 : -1;
    while (this.leaves.length < want)
      this.leaves.push({
        x: dir > 0 ? -40 - Math.random() * 400 : VIEW_WIDTH_PX + 40 + Math.random() * 400,
        y: 200 + Math.random() * 780,
        vx: dir * (180 + Math.random() * 220) * Math.max(0.6, Math.abs(wind) / 2),
        vy: -20 + Math.random() * 60,
        spin: (Math.random() - 0.5) * 8,
        rot: Math.random() * 6,
        color: [0x7ccf4f, 0x9ccc4a, 0xffb703, 0xf28ab2, 0xe8c07a][Math.floor(Math.random() * 5)]!,
        size: 13 + Math.random() * 11,
        petal: Math.random() < 0.3,
      });
    this.leaves = this.leaves.filter((l) => {
      l.x += l.vx * dt;
      l.y += (l.vy + Math.sin(this.time * 3 + l.rot) * 40) * dt;
      l.rot += l.spin * dt;
      const gone = l.x < -500 || l.x > VIEW_WIDTH_PX + 500 || l.y > VIEW_HEIGHT_PX + 40;
      return !gone && (this.leaves.length <= want || Math.random() > 0.02);
    });
    for (const l of this.leaves) {
      const c = Math.cos(l.rot);
      const s = Math.sin(l.rot);
      const flat = Math.abs(Math.sin(l.rot * 0.7)) * 0.6 + 0.4;
      const pts: number[] = [];
      for (const [px, py] of [
        [-1, 0],
        [0, -0.45 * flat],
        [1, 0],
        [0, 0.45 * flat],
      ] as const)
        pts.push(l.x + (px * c - py * s) * l.size, l.y + (px * s + py * c) * l.size);
      g.poly(pts).fill(l.color).stroke({ width: 2, color: OUTLINE, alpha: 0.55 });
      if (!l.petal)
        g.moveTo(pts[0]!, pts[1]!)
          .lineTo(pts[4]!, pts[5]!)
          .stroke({ width: 1.5, color: OUTLINE, alpha: 0.35 });
    }
  }

  private updateMist(hour: number, rain: number, look: SkyLook): void {
    const amount = mistAt(hour, rain);
    const color = mix(look.skyBottom, 0xffffff, 0.55);
    this.mistBack.forEach((s, i) => {
      s.visible = amount > 0.01;
      s.tint = color;
      s.alpha = amount * 0.55;
      s.width = 1100;
      s.height = 260;
      s.position.set(((i * 420 + this.time * (8 + i * 3)) % (VIEW_WIDTH_PX + 900)) - 400, 820 + (i % 3) * 38);
    });
    this.mistFront.forEach((s, i) => {
      s.visible = amount > 0.01;
      s.tint = color;
      s.alpha = amount * 0.3;
      s.width = 1300;
      s.height = 200;
      s.position.set(((i * 760 + this.time * 14) % (VIEW_WIDTH_PX + 1000)) - 500, 1010);
    });
  }

  /** Rain puddles in the plaza's dips: water with a bright edge, and rings while it rains. */
  private drawPuddles(rain: number): void {
    const g = this.puddles.clear();
    const terrain = this.sim.terrain;
    for (const p of this.sim.weather.puddles()) {
      const level = (p.y - 0.035 - 0.1 * p.fill) * PPM;
      const x0 = (p.x - p.half) * PPM;
      const x1 = (p.x + p.half) * PPM;
      const top: number[] = [];
      const bottom: number[] = [];
      for (let x = x0; x <= x1 + 0.1; x += (x1 - x0) / 12) {
        const ground = terrain.surfaceY(x / PPM) * PPM + 4;
        top.push(x, Math.min(level, ground));
        bottom.unshift(x, Math.max(level, ground + 4));
      }
      g.poly([...top, ...bottom]).fill({ color: 0x8fd0f0, alpha: 0.85 });
      g.moveTo(x0 + 6, level)
        .lineTo(x1 - 6, level)
        .stroke({ width: 3, color: 0xffffff, alpha: 0.7, cap: 'round' });
      g.ellipse(p.x * PPM - (x1 - x0) * 0.18, level + 5, (x1 - x0) * 0.12, 2.5).fill({
        color: 0xffffff,
        alpha: 0.5,
      });
      if (rain > 0.1)
        for (let k = 0; k < 3; k++) {
          const t = (this.time * 1.3 + k / 3) % 1;
          const rx = x0 + (x1 - x0) * ((k * 0.37 + Math.floor(this.time * 1.3 + k / 3) * 0.61) % 1);
          g.ellipse(rx, level + 2, 4 + t * 16, 1.5 + t * 3).stroke({
            width: 2,
            color: 0xffffff,
            alpha: 0.6 * (1 - t) * rain,
          });
        }
    }
  }

  private updateLights(dt: number, look: SkyLook, views: readonly EntityView[], left: number): void {
    const glow = look.glow;
    const sim = this.sim;
    const right = left + VIEW_WIDTH_PX;
    const onScreen = (x: number): boolean => x > left - 300 && x < right + 300;
    // Dappled sunlight drifting over the ground by day.
    if (look.dapple > 0.05)
      for (let i = 0; i < 7; i++) {
        const x = left + (((i * 331 + this.time * (10 + i * 2)) % (VIEW_WIDTH_PX + 400)) - 200);
        const y = sim.terrain.surfaceY(x / PPM) * PPM - 6;
        this.light(x, y, 90 + (i % 3) * 30, 0xfff6d8, look.dapple * 0.16, 1.8, 0.35);
      }
    // Mushrooms glow faintly at night.
    const plaza = sim.content.areas.tryGet('area_stump_plaza');
    if (plaza && glow > 0.05)
      MUSHROOMS.forEach(([mx, h, r], i) => {
        const x = plaza.xStart * PPM + mx;
        if (!onScreen(x)) return;
        const pulse = 0.8 + 0.2 * Math.sin(this.time * 1.4 + i);
        this.light(x, 905 - h - r * 0.3, r * 1.7, 0xff8fb8, glow * 0.4 * pulse);
      });
    // Glowing things and bugs.
    for (const v of views) {
      const x = v.x * PPM;
      if (!onScreen(x)) continue;
      const y = v.y * PPM;
      if (v.kind === 'bug') {
        const def = sim.content.bugs.get(v.defId);
        if (!def.glows) continue;
        // Flick's tail: a slow breathing glow, brighter blinks, dim while he sleeps, out under water.
        const asleep = v.bug?.mode === 'st_sleep';
        const blink = Math.pow(Math.max(0, Math.sin(this.time * 2.2 + v.id)), 6);
        const lit = v.submerged > 0.3 ? 0 : (asleep ? 0.35 : 0.75) + blink * 0.5;
        const tail = { x: x - (v.bug?.facing ?? 1) * def.radius * 0.7 * PPM, y: y + def.radius * 0.1 * PPM };
        this.light(tail.x, tail.y, 180, 0xd8ff4f, lit * (0.25 + glow * 0.9));
        this.light(tail.x, tail.y, 40, 0xf4ffc0, lit * (0.3 + glow * 0.6));
        continue;
      }
      if (!v.tags.includes('tag_glowing')) continue;
      const item = sim.content.items.get(v.defId);
      if (item.lamp) {
        // The flashlight: a warm spot at its head and a long beam.
        const dir = { x: Math.cos(v.angle), y: Math.sin(v.angle) };
        const hx = x + dir.x * 30;
        const hy = y + dir.y * 30;
        this.light(hx, hy, 70, 0xfff1a8, 0.5 + glow * 0.5);
        let c = this.cones[this.cone];
        if (!c) {
          c = new Sprite(coneTexture());
          c.anchor.set(0, 0.5);
          c.blendMode = 'add';
          this.cones.push(c);
          this.lights.addChild(c);
        }
        this.cone++;
        c.visible = true;
        c.position.set(hx, hy);
        c.rotation = v.angle;
        c.scale.set(500 / 256, 1.6);
        c.tint = 0xfff1a8;
        c.alpha = 0.15 + glow * 0.55;
        continue;
      }
      // Moon pebbles and anything else that glows: a pale, cool light.
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 2 + v.id);
      this.light(x, y, 160, item.accent, (0.2 + glow * 0.8) * pulse);
      this.light(x, y, 34, 0xffffff, (0.25 + glow * 0.5) * pulse);
    }
    // The moon on the pond, right over the sunken teacup.
    if (look.moon.alpha > 0.05 && glow > 0.3)
      for (const area of sim.content.areas.all)
        for (const f of area.fixtures ?? []) {
          if (f.kind !== 'teacup') continue;
          const x = (area.xStart + f.x) * PPM;
          const y = this.water.surfaceAt(x);
          if (y === null || !onScreen(x)) continue;
          const shimmer = 1 + 0.12 * Math.sin(this.time * 3);
          this.light(x, y + 6, 90, 0xfff4cc, look.moon.alpha * glow * 0.7, 1.6 * shimmer, 0.28);
          this.light(x, y + 20, 60, 0xfff4cc, look.moon.alpha * glow * 0.35, 0.5, 0.9);
        }
    this.drawFireflies(dt, glow, left);
  }

  private drawFireflies(dt: number, glow: number, left: number): void {
    const g = this.fireflyDots.clear();
    this.answer = Math.max(0, this.answer - dt);
    if (glow < 0.35) return;
    const show = Math.min(1, (glow - 0.35) * 3);
    for (const f of this.flies) {
      f.phase += dt * f.speed;
      f.x = f.hx + Math.sin(f.phase * 0.9) * 90 + Math.sin(f.phase * 2.3) * 24;
      f.y = f.hy + Math.sin(f.phase * 0.7 + 1) * 50 + Math.cos(f.phase * 1.9) * 14;
      if (f.x < left - 200 || f.x > left + VIEW_WIDTH_PX + 200) continue;
      f.flash = Math.max(0, f.flash - dt);
      const pulse = Math.pow(Math.max(0, Math.sin(f.phase * 2.1)), 4);
      const big = this.answerBig && this.answer > 0 ? 1.8 : 1;
      const lit = Math.min(1, 0.25 + pulse * 0.75 + f.flash * 3) * show * big;
      this.light(f.x, f.y, 34 * big, 0xd8ff4f, lit * 0.8);
      g.circle(f.x, f.y, 3).fill({ color: 0xf4ffc0, alpha: Math.min(1, lit) });
    }
  }

  private sounds(dt: number, w: WeatherMix, look: SkyLook): void {
    this.soundIn -= dt;
    if (this.soundIn > 0) return;
    if (w.rain > 0.2) {
      this.soundIn = 0.09 + Math.random() * 0.08;
      this.onSound?.('rain', w.rain);
    } else if (w.wind > 0.3 && Math.random() < 0.3) {
      this.soundIn = 1.5 + Math.random() * 2;
      this.onSound?.('wind', w.wind);
    } else if (look.glow > 0.6 && w.rain < 0.1) {
      this.soundIn = 0.5 + Math.random() * 1.6;
      this.onSound?.('cricket', look.glow);
    } else this.soundIn = 0.5;
  }
}
