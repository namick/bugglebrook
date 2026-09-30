import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../game/constants';
import type { AreaDef, FixtureDef } from '../../../game/data/types';
import type { Sim } from '../../../game/sim';
import { HOUR, timeOfDay } from '../../../game/systems/sky';
import { OUTLINE, mix, stroke } from './palette';

const PPM = PIXELS_PER_METER;

/** Soft outline for props that stand behind the walk line. */
const soft = (width = 3, alpha = 0.6) => ({
  width,
  color: OUTLINE,
  alpha,
  join: 'round' as const,
  cap: 'round' as const,
});

/**
 * Where the sundial's gnomon shadow points at a clock (radians, screen
 * space, y down): noon points at the painted sun on the left, midnight at
 * the moon on the right, and time runs clockwise, as the rim turns.
 */
export function dialAngle(clock: number): number {
  const hour = timeOfDay(clock) / HOUR;
  return Math.PI + ((hour - 12) / 24) * Math.PI * 2;
}

/** The sundial's face as an ellipse, in world px relative to its fixture point. */
export const DIAL = { rx: 96, ry: 34 } as const;

/**
 * Game minutes that turning the sundial from one pointer spot to another
 * stands for: the angle swept around the dial's face (squashed to a circle),
 * clockwise positive, where a whole turn is a whole day.
 */
export function dialMinutes(
  cx: number,
  cy: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const a0 = Math.atan2((from.y - cy) / DIAL.ry, (from.x - cx) / DIAL.rx);
  const a1 = Math.atan2((to.y - cy) / DIAL.ry, (to.x - cx) / DIAL.rx);
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return (d / (Math.PI * 2)) * 24 * 60;
}

/**
 * The plaza's clickable fixtures, drawn live because they move: the sundial
 * (its shadow follows the clock, its rim glows while it turns), the weather
 * vane's rooster (it spins when clicked and leans into the wind), and the
 * eyes that blink in the stump's knothole at night.
 */
export class FixtureArt extends Container {
  private readonly dial = new Graphics();
  private readonly vane = new Graphics();
  private readonly rooster = new Graphics();
  /** The knothole's eyes glow, so they sit outside the graded world. */
  readonly eyes = new Graphics();
  private vaneSpin = 0;
  private vaneSpeed = 0;
  private blinkIn = 2;
  private blink = 0;
  private peekFlash = 0;
  private dialGlow = 0;
  private readonly spots: Map<FixtureDef['kind'], { x: number; y: number }>;

  constructor(private readonly sim: Sim) {
    super();
    this.spots = new Map();
    for (const area of sim.content.areas.all as readonly AreaDef[])
      for (const f of area.fixtures ?? [])
        if (f.kind === 'sundial' || f.kind === 'weather_vane' || f.kind === 'knothole')
          this.spots.set(f.kind, { x: (area.xStart + f.x) * PPM, y: f.y * PPM });
    this.drawVanePole();
    this.drawRooster();
    this.addChild(this.vane, this.rooster, this.dial);
    const vane = this.spots.get('weather_vane');
    if (vane) this.rooster.position.set(vane.x + 10, vane.y);
  }

  /** The vane was clicked: spin it round. */
  spin(): void {
    this.vaneSpeed = Math.max(this.vaneSpeed, 26);
  }

  /** The knothole was clicked at night: the eyes blink twice, quickly. */
  peek(): void {
    this.peekFlash = 1.2;
  }

  private drawVanePole(): void {
    const v = this.spots.get('weather_vane');
    if (!v) return;
    const g = this.vane;
    const x = v.x;
    const gy = this.sim.surfaceY(x / PPM) * PPM + 5;
    g.moveTo(x, gy)
      .lineTo(x, v.y + 20)
      .stroke({ width: 14, color: 0x8b6a45, cap: 'round' });
    g.moveTo(x, gy)
      .lineTo(x, v.y + 20)
      .stroke(soft(3, 0.5));
    // Compass arms under the rooster.
    g.moveTo(x - 50, v.y + 40)
      .lineTo(x + 50, v.y + 40)
      .stroke({ width: 5, color: 0x9aa3b5, cap: 'round' });
    g.circle(x - 50, v.y + 40, 5)
      .fill(0xe8453c)
      .circle(x + 50, v.y + 40, 5)
      .fill(0x4d9bff);
  }

  /** A bent-spoon rooster, facing right at scale 1. */
  private drawRooster(): void {
    const g = this.rooster;
    const spoon = 0xc9d4e0;
    // Tail feathers (the spoon's bowl).
    g.ellipse(-36, -14, 24, 30).fill(spoon).stroke(soft(3));
    g.ellipse(-30, -16, 10, 18).fill({ color: 0xffffff, alpha: 0.45 });
    // Body and neck.
    g.ellipse(0, 0, 46, 20).fill(spoon).stroke(soft(3));
    g.ellipse(34, -16, 14, 22).fill(spoon).stroke(soft(3));
    // Comb, beak, wattle, eye.
    g.poly([26, -38, 32, -52, 38, -40, 44, -50, 46, -34]).fill(0xe8453c).stroke(soft(2));
    g.poly([46, -20, 60, -15, 46, -10]).fill(0xffb703).stroke(soft(2));
    g.ellipse(44, -4, 5, 8).fill(0xe8453c);
    g.circle(38, -20, 3.5).fill(OUTLINE);
    g.moveTo(-10, -8).quadraticCurveTo(4, -2, 16, -8).stroke({ width: 3, color: 0xa4b1c2, cap: 'round' });
  }

  update(dt: number, time: number, glow: number): void {
    const sim = this.sim;
    const sky = sim.weather.state;
    const wind = sim.environment.state.wind;
    // The rooster: a spin when clicked, then it swings round to where it faces, and it leans into the wind.
    const facing = sky.vane.facing;
    this.vaneSpin += this.vaneSpeed * dt;
    this.vaneSpeed *= Math.exp(-dt * 1.4);
    if (this.vaneSpeed < 1.2) {
      // Settle so the rooster ends up side-on, facing its way.
      const target = Math.round(this.vaneSpin / Math.PI) * Math.PI + (facing === 1 ? 0 : Math.PI);
      const fix = Math.round((this.vaneSpin - target) / (2 * Math.PI)) * 2 * Math.PI;
      this.vaneSpin += (target + fix - this.vaneSpin) * Math.min(1, dt * 6);
      this.vaneSpeed = 0;
    }
    const flutter = wind !== 0 ? Math.sin(time * 9) * 0.05 * Math.min(1, Math.abs(wind) / 2) : 0;
    this.rooster.scale.x = Math.cos(this.vaneSpin) || 0.001;
    this.rooster.rotation = flutter;
    this.drawDial(time, dt);
    this.drawEyes(dt, glow);
  }

  private drawDial(time: number, dt: number): void {
    const f = this.spots.get('sundial');
    const g = this.dial.clear();
    if (!f) return;
    const sim = this.sim;
    const sky = sim.weather.state;
    const x = f.x;
    const y = f.y;
    const gy = sim.surfaceY(x / PPM) * PPM + 5;
    const { rx, ry } = DIAL;
    const turning = sim.weather.fastForward;
    this.dialGlow += ((turning ? 1 : 0) - this.dialGlow) * Math.min(1, dt * 6);
    // The pedestal.
    g.roundRect(x - 28, y + 6, 56, gy - y - 6, 8)
      .fill(0xb8b1c7)
      .stroke(soft(3));
    g.roundRect(x - 20, y + 14, 12, gy - y - 22, 5).fill({ color: 0xffffff, alpha: 0.25 });
    g.roundRect(x - 44, gy - 18, 88, 20, 8)
      .fill(0xa49cb6)
      .stroke(soft(3));
    // The face: a stone disc seen from a little above.
    g.ellipse(x, y + 8, rx + 2, ry + 4).fill(0x9c95ae);
    g.ellipse(x, y, rx, ry).fill(0xd8d2e3).stroke(soft(3.5, 0.65));
    if (this.dialGlow > 0.01)
      g.ellipse(x, y, rx + 6, ry + 6).stroke({ width: 6, color: 0xffe066, alpha: 0.7 * this.dialGlow });
    // Hour marks around the rim, a whole day in one turn.
    for (let k = 0; k < 24; k++) {
      const a = Math.PI + ((k - 12) / 24) * Math.PI * 2;
      const r0 = k % 6 === 0 ? 0.74 : 0.84;
      g.moveTo(x + Math.cos(a) * rx * r0, y + Math.sin(a) * ry * r0)
        .lineTo(x + Math.cos(a) * rx * 0.94, y + Math.sin(a) * ry * 0.94)
        .stroke({ width: k % 6 === 0 ? 3 : 2, color: 0x8a82a0, alpha: 0.8, cap: 'round' });
    }
    // The painted sun (left) and moon (right).
    const sx = x - 50;
    g.circle(sx, y, 12).fill(0xffd23f).stroke(soft(2, 0.7));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.moveTo(sx + Math.cos(a) * 15, y + Math.sin(a) * 9)
        .lineTo(sx + Math.cos(a) * 20, y + Math.sin(a) * 12)
        .stroke({ width: 2.5, color: 0xffb703, cap: 'round' });
    }
    const mx = x + 58;
    g.circle(mx, y, 11).fill(0x6b7bd6);
    g.circle(mx + 5, y - 3, 9).fill(0xd8d2e3);
    // The gnomon's shadow swings with the clock: soft by day, a pale blue by moonlight.
    const a = dialAngle(sky.clock);
    const glow = sim.weather.dark;
    const tip = { x: x + Math.cos(a) * rx * 0.86, y: y + Math.sin(a) * ry * 0.86 };
    const midnight =
      timeOfDay(sky.clock) === 0 ||
      (sim.secrets.includes('secret_sundial_midnight') && timeOfDay(sky.clock) < 2 * 60);
    g.moveTo(x - Math.sin(a) * 6, y + Math.cos(a) * 3)
      .lineTo(tip.x, tip.y)
      .lineTo(x + Math.sin(a) * 6, y - Math.cos(a) * 3)
      .closePath()
      .fill({ color: glow ? 0x5a64a8 : 0x4a3f5c, alpha: glow ? 0.55 : 0.45 });
    if (midnight) {
      // The moonlit shadow glows and points at the clover (secret_sundial_midnight).
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);
      g.moveTo(x, y).lineTo(tip.x, tip.y).stroke({ width: 5, color: 0xcfe0ff, alpha: pulse, cap: 'round' });
      g.circle(tip.x, tip.y, 7).fill({ color: 0xffffff, alpha: pulse });
    }
    // The gnomon: a little stick fin.
    g.poly([x - 5, y - 2, x + 28, y - 58, x + 34, y - 54, x + 7, y + 2])
      .fill(0x8b6a45)
      .stroke(soft(2.5, 0.7));
  }

  private drawEyes(dt: number, glow: number): void {
    const g = this.eyes.clear();
    const k = this.spots.get('knothole');
    if (!k || glow < 0.25) return;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.18;
      this.blinkIn = 2 + Math.random() * 4;
    }
    if (this.peekFlash > 0) {
      this.peekFlash -= dt;
      if (Math.floor(this.peekFlash * 6) % 2 === 0) this.blink = Math.max(this.blink, 0.05);
    }
    this.blink = Math.max(0, this.blink - dt);
    const alpha = Math.min(1, (glow - 0.25) * 2.5);
    const open = this.blink > 0 ? 0.15 : 1;
    const look = Math.sin(performance.now() / 1300) * 5;
    for (const dx of [-16, 16]) {
      const ex = k.x + 4 + dx + look;
      const ey = k.y + 10;
      g.ellipse(ex, ey, 13, 13 * open + 1).fill({ color: 0xfff27a, alpha: 0.25 * alpha });
      g.ellipse(ex, ey, 8, 9 * open + 0.5).fill({ color: mix(0xfff27a, 0xffffff, 0.3), alpha });
      if (open > 0.5) g.circle(ex + look * 0.3, ey + 1, 3.5).fill({ color: OUTLINE, alpha });
    }
    void stroke;
  }
}
