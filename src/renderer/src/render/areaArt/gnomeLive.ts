import { Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { NOSE_HOLE } from '../../../../game/systems/hollow';
import type { Particles } from '../particles';
import { lighten, stroke } from '../palette';
import { GNOME_HEAD, drawGnomeHat } from './flowerbed';
import { HOLLOW_COLORS } from './hollow';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;
const HOLLOW = 'area_gnome_hollow';

/**
 * The flowerbed's gnome, the live parts (M10, `mystery_gnome_nose`): his
 * hat, the hole where his nose should be (it glows while the player holds
 * the nose), a sniffle while the hand hovers his face, the big sneeze when
 * the nose goes back in, and the hat flipping open into Gnome Hollow.
 */
export class GnomeLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly hx: number;
  private readonly hy = GNOME_HEAD.y;
  /** The sneeze: seconds since it started, or -1. */
  private sneeze = -1;
  /** The sniffle twitch, 0 to 1. */
  private sniff = 0;
  /** How open the hat is, eased. */
  private hat = 0;

  constructor(private readonly area: AreaDef) {
    super(area.xStart * PPM, area.xStart * PPM + 900);
    this.hx = area.xStart * PPM + GNOME_HEAD.x;
    this.back.addChild(this.g);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('gnome_sneezed', (e) => {
        this.sneeze = 0;
        const x = e.x * PPM;
        const y = e.y * PPM;
        particles.puff(x + 10, y - 10, 0xffffff, 12, 160, -60, 22);
        particles.sparkles(x, y - 20, 12);
        particles.stars(x - 120, y - 60);
      }),
    ];
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const open = f.sim.barriers.isOpen(HOLLOW);
    if (this.sneeze >= 0) this.sneeze += f.dt;
    if (this.sneeze > 2.5) this.sneeze = -1;
    // The hat waits for the sneeze to finish before it flips.
    const target = open && (this.sneeze < 0 || this.sneeze > 0.9) ? 1 : 0;
    this.hat += (target - this.hat) * Math.min(1, f.dt * (target > this.hat ? 5 : 8));
    const hand = f.hand;
    const holeX = this.area.xStart * PPM + NOSE_HOLE.x * PPM;
    const holeY = NOSE_HOLE.y * PPM;
    const near = !!hand && Math.hypot(hand.x - this.hx, hand.y - this.hy) < 110;
    this.sniff = Math.max(0, this.sniff - f.dt * 2);
    if (near && !open && Math.sin(f.time * 2.2) > 0.95) this.sniff = 1;
    if (!this.shows(f)) return;
    // A sneeze rocks his head back.
    const jolt = this.sneeze >= 0 && this.sneeze < 0.6 ? Math.sin((this.sneeze / 0.6) * Math.PI) * 12 : 0;
    drawGnomeHat(g, this.hx - jolt, this.hy, easeBack(this.hat));
    if (open) {
      // His nose, back where it belongs: a round ceramic button, rosy at the tip.
      g.ellipse(holeX + 2, holeY - 6, 22, 18)
        .fill(0xf2a08a)
        .stroke(stroke(4));
      g.ellipse(holeX + 8, holeY - 12, 8, 5).fill({ color: lighten(0xf2a08a, 0.5), alpha: 0.9 });
    } else {
      // The nose hole twitches with a sniffle.
      const k = this.sniff;
      if (k > 0)
        g.ellipse(holeX + 2, holeY + 2, 12 + k * 5, 8 + k * 3).fill({ color: 0x2b1d18, alpha: 0.6 * k });
      // Holding his nose: the hole glows, here it goes.
      const holding = f.views.some((v) => v.held && v.defId === 'item_gnome_nose');
      if (holding) {
        const p = 0.5 + 0.5 * Math.sin(f.time * 6);
        g.circle(holeX + 2, holeY + 2, 30 + p * 8).stroke({
          width: 5,
          color: 0xffffff,
          alpha: 0.5 + 0.4 * p,
        });
        g.circle(holeX + 2, holeY + 2, 46 + p * 10).stroke({
          width: 3,
          color: HOLLOW_COLORS.gold,
          alpha: 0.4 * p,
        });
      }
    }
    // A big "ah-CHOO": his whole face scrunches.
    if (this.sneeze >= 0 && this.sneeze < 0.5) {
      const t = this.sneeze / 0.5;
      g.moveTo(this.hx - 4, this.hy - 34)
        .lineTo(this.hx + 22, this.hy - 26)
        .lineTo(this.hx - 2, this.hy - 20)
        .stroke({ width: 5, color: 0x2b1d2e, alpha: 1 - t, cap: 'round', join: 'round' });
    }
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f) || this.hat < 0.3) return;
    // Warm light from inside his head.
    light(this.hx - 34, this.hy - 14, 110 * this.hat, HOLLOW_COLORS.gold, 0.35 * this.hat);
  }
}

/** Ease out with a little overshoot, for the hat's flip. */
function easeBack(t: number): number {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}
