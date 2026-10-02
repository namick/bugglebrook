import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef, BugDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { constellation } from '../constellations';
import type { Constellation } from '../constellations';
import type { Particles } from '../particles';
import { lighten } from '../palette';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;
/** How long a firework lives (s): the rocket's climb, then the burst and the fall. */
const CLIMB = 0.7;
const LIFE = 3.6;
/** How big a bug-shaped burst is (px, half-width). */
const SIZE = 170;

interface Firework {
  x: number;
  y: number;
  fromX: number;
  age: number;
  color: number;
  shape: Constellation;
}

/**
 * The finale's fireworks (M10, `secret_golden_marble_home`): rockets go up
 * from the stump and burst into the shape of each bug in the cast, in its
 * colors, then drift down and fade. Drawn additively over the plaza.
 */
export class FinaleLive extends AreaLive {
  private readonly g = new Graphics();
  private works: Firework[] = [];

  constructor(
    private readonly plaza: AreaDef,
    private readonly bug: (defId: string) => BugDef | undefined,
  ) {
    super(plaza.xStart * PPM, plaza.xEnd * PPM);
    this.glow.addChild(this.g);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    return [
      sim.events.on('firework_burst', (e) => {
        const def = this.bug(e.defId);
        const fromX = (this.plaza.xStart + 19.5) * PPM;
        this.works.push({
          x: e.x * PPM,
          y: e.y * PPM,
          fromX,
          age: 0,
          color: lighten(def?.body ?? 0xffd23f, 0.25),
          shape: constellation(def?.art ?? 'ladybug'),
        });
        if (this.works.length > 8) this.works.shift();
        void particles;
      }),
    ];
  }

  /** Fireworks in the air right now (test hook). */
  get live(): number {
    return this.works.length;
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    this.works = this.works.filter((w) => (w.age += f.dt) < LIFE);
    if (!this.shows(f)) return;
    for (const w of this.works) {
      if (w.age < CLIMB) {
        // The rocket: a bright dot climbing from the stump with a fizzing tail.
        const u = w.age / CLIMB;
        const k = 1 - (1 - u) * (1 - u);
        const x = w.fromX + (w.x - w.fromX) * k;
        const y = 4 * PPM + (w.y - 4 * PPM) * k;
        for (let i = 0; i < 6; i++) {
          const b = Math.max(0, k - i * 0.04);
          const tx = w.fromX + (w.x - w.fromX) * b;
          const ty = 4 * PPM + (w.y - 4 * PPM) * b;
          g.circle(tx + Math.sin(i * 3 + w.age * 30) * 2, ty, 5 - i * 0.6).fill({
            color: 0xffe9a8,
            alpha: 0.7 - i * 0.1,
          });
        }
        g.circle(x, y, 7).fill(0xffffff);
        continue;
      }
      // The burst: sparks fly out to the bug's stars, hold its shape, then sag and fade.
      const t = (w.age - CLIMB) / (LIFE - CLIMB);
      const out = Math.min(1, t * 4);
      const spread = 1 - (1 - out) * (1 - out) * (1 - out);
      const fade = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
      const sag = t * t * 90;
      const pt = (sx: number, sy: number): [number, number] => [
        w.x + sx * SIZE * spread,
        w.y + sy * SIZE * spread + sag,
      ];
      if (out >= 1)
        for (const [a, b] of w.shape.lines) {
          const [ax, ay] = pt(w.shape.stars[a]![0], w.shape.stars[a]![1]);
          const [bx, by] = pt(w.shape.stars[b]![0], w.shape.stars[b]![1]);
          g.moveTo(ax, ay)
            .lineTo(bx, by)
            .stroke({ width: 3, color: w.color, alpha: 0.45 * fade });
        }
      for (const [sx, sy, s] of w.shape.stars) {
        const [x, y] = pt(sx, sy);
        const tw = 0.7 + 0.3 * Math.sin(w.age * 20 + sx * 9);
        g.circle(x, y, (4 + s * 7) * tw).fill({ color: w.color, alpha: 0.85 * fade });
        g.circle(x, y, (1.5 + s * 3) * tw).fill({ color: 0xffffff, alpha: fade });
        // A few falling glitter trails.
        if (t > 0.3)
          g.circle(x + Math.sin(sx * 40) * 6, y + (t - 0.3) * 120, 2).fill({
            color: w.color,
            alpha: 0.5 * fade,
          });
      }
    }
  }

  override lights(f: AreaFrame, light: LightFn): void {
    for (const w of this.works) {
      if (w.age < CLIMB) continue;
      const t = (w.age - CLIMB) / (LIFE - CLIMB);
      light(w.x, w.y, 420, w.color, 0.5 * Math.max(0, 1 - t * 1.4));
    }
    void f;
  }
}
