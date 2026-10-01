import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { BEAD_RADIUS } from '../../../../game/systems/places';
import type { Particles } from '../particles';
import { OUTLINE, lighten, stroke } from '../palette';
import { soft } from './common';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';
import { ARCADE, NEON, neonIcon } from './treehouse';

const PPM = PIXELS_PER_METER;

const BEAD_COLORS = [0xff5fa2, 0xffd23f, 0x4fb6ff, 0x9b6bd6, 0x7bdcb5, 0xff8a5c];

/**
 * The treehouse arcade, alive: the bead pit's beads, the claw machine (its
 * claw, the red button, the glass in front of the prizes), neon that glows
 * and flickers at night, the scoreboard blinking pictograms, rain on the
 * window, a squirrel's tail flicking in the canopy, and a pill-bug-shaped
 * spot of sunlight on the floor.
 */
export class ArcadeLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly ax: number;
  private press = 0;
  private flicker: number[] = NEON.map(() => 1);
  private board = 0;
  private tail = 0;

  constructor(private readonly area: AreaDef) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.back.addChild(this.g);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    const px = (m: number): number => m * PPM;
    return [
      ev.on('claw_moved', (e) => {
        if (e.phase === 'drop') this.press = 0.4;
        if (e.phase === 'prize') particles.sparkles(px(e.x), px(e.y), 10);
        if (e.phase === 'miss') particles.puff(px(e.x), px(e.y), 0xffffff, 3, 0, -20, 10);
      }),
      ev.on('track_snapped', (e) => {
        if (e.on) particles.sparkles(px(e.x), px(e.y), 4);
      }),
      ev.on('dominoes_fell', (e) => {
        particles.sparkles(px(e.x), px(e.y) - 80, 24);
        particles.stars(px(e.x), px(e.y) - 60);
        this.board = 3;
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    this.press = Math.max(0, this.press - f.dt);
    this.board = Math.max(0, this.board - f.dt);
    if (!this.shows(f)) return;
    this.drawBeads(fg, f);
    this.drawClaw(g, fg, f);
    this.drawBoard(g, f);
    this.drawWindowWeather(g, f);
    this.drawTail(g, f);
  }

  private drawBeads(g: Graphics, f: AreaFrame): void {
    const physics = f.sim.physics;
    const r = BEAD_RADIUS * PPM;
    f.sim.places.beads.forEach((key, i) => {
      const s = physics.platformState(key);
      if (!s) return;
      const x = s.x * PPM;
      const y = s.y * PPM;
      g.circle(x, y, r)
        .fill(BEAD_COLORS[i % BEAD_COLORS.length]!)
        .stroke({ width: 2.5, color: OUTLINE, alpha: 0.8 });
      g.circle(x - r * 0.35, y - r * 0.35, r * 0.3).fill({ color: 0xffffff, alpha: 0.6 });
    });
  }

  private drawClaw(g: Graphics, fg: Graphics, f: AreaFrame): void {
    const places = f.sim.places;
    const jar = places.jar();
    const tip = places.clawTip();
    if (!jar || !tip) return;
    const x = tip.x * PPM;
    const y = tip.y * PPM;
    const c = places.state.claw;
    // The carriage on the rail, the cable, and three prongs (closed while holding, open otherwise).
    g.roundRect(x - 30, 238, 60, 40, 10)
      .fill(0xff5fa2)
      .stroke(stroke(4));
    g.moveTo(x, 278)
      .lineTo(x, y - 20)
      .stroke({ width: 4, color: 0x3b3a4a });
    fg.roundRect(x - 16, y - 30, 32, 24, 8)
      .fill(0x9aa3b5)
      .stroke(stroke(3.5));
    const closed = c.holding !== null || c.phase === 'up' ? 1 : c.phase === 'down' ? 0 : 0.4;
    for (const side of [-1, 0, 1]) {
      const spread = (1 - closed) * 22;
      fg.moveTo(x + side * 8, y - 8)
        .lineTo(x + side * (14 + spread), y + 14)
        .lineTo(x + side * (6 + spread * 0.4), y + 30)
        .stroke({ width: 5, color: 0x6a6878, cap: 'round', join: 'round' });
    }
    // The glass in front of the prizes.
    const x0 = jar.x0 * PPM - 10;
    const x1 = jar.x1 * PPM + 10;
    fg.roundRect(x0, 350, x1 - x0, jar.floor * PPM - 350, 40).fill({ color: 0xdff4ff, alpha: 0.12 });
    fg.moveTo(x0 + 30, 400)
      .lineTo(x0 + 30, jar.floor * PPM - 60)
      .stroke({ width: 10, color: 0xffffff, alpha: 0.35, cap: 'round' });
    fg.moveTo(x0 + 54, 420)
      .lineTo(x0 + 54, 480)
      .stroke({ width: 5, color: 0xffffff, alpha: 0.3, cap: 'round' });
    // The red button.
    const button = this.area.fixtures?.find((q) => q.kind === 'claw_button');
    if (button) {
      const bx = this.ax + button.x * PPM;
      const by = button.y * PPM;
      const down = this.press > 0 ? 6 : 0;
      g.ellipse(bx, by + 10, 34, 12).fill(0x6a1f1a);
      g.ellipse(bx, by + down, 32, 14)
        .fill(0xe8453c)
        .stroke(stroke(4));
      g.ellipse(bx - 10, by - 4 + down, 10, 4).fill({ color: 0xffffff, alpha: 0.6 });
      if (c.phase === 'idle' && Math.sin(f.time * 4) > 0)
        g.circle(bx, by - 40, 6).fill({ color: 0xffd23f, alpha: 0.9 });
    }
  }

  /** The scoreboard blinks its pictograms (a bug and a streak for the best fling; a burst after the dominoes). */
  private drawBoard(g: Graphics, f: AreaFrame): void {
    const n = NEON.find((q) => q.icon === 'board');
    if (!n) return;
    const x = this.ax + n.x * PPM;
    const y = n.y * PPM;
    const on = Math.floor(f.time * (this.board > 0 ? 8 : 1.5)) % 2 === 0;
    if (on) neonIcon(g, 'board', x, y, 40, this.board > 0 ? 0xffd23f : ARCADE.blue, 5);
  }

  /** Rain streaks on the window pane; at night, stars over the garden. */
  private drawWindowWeather(g: Graphics, f: AreaFrame): void {
    const wx = this.ax + 3.4 * PPM;
    const wy = 3.3 * PPM;
    if (f.look.glow > 0.2) {
      g.roundRect(wx - 92, wy - 72, 184, 144, 14).fill({ color: 0x2c2f5e, alpha: f.look.glow * 0.75 });
      for (const [dx, dy] of [
        [-50, -40],
        [20, -50],
        [60, -20],
        [-20, -10],
      ] as const)
        g.circle(wx + dx, wy + dy, 2.5).fill({ color: 0xffffff, alpha: f.look.glow });
    }
    if (f.weather.rain > 0.1)
      for (let k = 0; k < 10; k++) {
        const sx = wx - 85 + ((k * 37 + f.time * 60) % 170);
        const sy = wy - 70 + ((k * 53 + f.time * 300) % 140);
        g.moveTo(sx, sy)
          .lineTo(sx - 4, sy + 14)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.6 * f.weather.rain });
      }
  }

  /** A squirrel's bushy tail flicking out of the leaves over the roof. */
  private drawTail(g: Graphics, f: AreaFrame): void {
    this.tail += f.dt;
    const t = this.tail % 9;
    if (t > 2.5) return;
    const show = Math.sin((t / 2.5) * Math.PI);
    const x = this.ax + 2300;
    const y = 40 + (1 - show) * 60;
    const flick = Math.sin(f.time * 9) * 0.3;
    g.moveTo(x, y + 40)
      .bezierCurveTo(x - 60, y - 20 + flick * 30, x + 30, y - 70, x + 60, y - 10)
      .bezierCurveTo(x + 40, y + 10, x + 10, y + 20, x, y + 40)
      .fill(0xc9853f)
      .stroke(soft(3, 0.6));
    g.moveTo(x + 10, y + 20)
      .bezierCurveTo(x - 20, y - 10, x + 20, y - 40, x + 40, y - 10)
      .stroke({
        width: 4,
        color: lighten(0xc9853f, 0.3),
        cap: 'round',
      });
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    const glow = f.look.glow;
    // Neon: it glows by day too, brightly at night, with a flicker now and then.
    NEON.forEach((n, i) => {
      if (Math.random() < f.dt * 0.2) this.flicker[i] = 0.3;
      this.flicker[i] = Math.min(1, this.flicker[i]! + f.dt * 3);
      light(
        this.ax + n.x * PPM,
        n.y * PPM,
        Math.max(n.w, n.h) * PPM * 0.75,
        n.color,
        (0.15 + glow * 0.7) * this.flicker[i]!,
        1.5,
        0.7,
      );
    });
    // The claw machine is lit inside.
    const jar = f.sim.places.jar();
    if (jar) light(((jar.x0 + jar.x1) / 2) * PPM, 500, 200, 0xfff1c9, 0.12 + glow * 0.4);
    // A pill-bug-shaped spot of sunlight on the floor by day.
    if (f.look.dapple > 0.05) {
      const sx = this.ax + 900 + Math.sin(f.time * 0.05) * 200;
      light(sx, 640, 70, 0xfff6d8, f.look.dapple * 0.5, 1.4, 0.35);
      light(sx + 60, 638, 26, 0xfff6d8, f.look.dapple * 0.4, 1, 0.6);
    }
  }
}
