import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import type { AreaDef, ItemDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { ItemSprite } from '../draw/item';
import type { Particles } from '../particles';
import { OUTLINE, darken, stroke } from '../palette';
import { ANTS } from './depths';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;
/** The hill's door in the plaza's static art (plaza-local px). */
const DOOR = { x: 290, y: 755 } as const;

/**
 * The plaza's ant hill, alive (M10): its little door, a thought bubble with
 * a sugar cube while the hand hovers it (the clue), the ants carrying the
 * player's sugar up and in, the hole crumbling wide into a doorway, and once
 * open, a warm glow from the tunnel and a beckoning pulse under the hand.
 */
export class AntHillLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly bubble = new Container();
  private readonly bubbleG = new Graphics();
  private sugar: ItemSprite | null = null;
  private readonly dx: number;
  private readonly dy = DOOR.y;
  /** The thought bubble's size, eased (0 hidden). */
  private think = 0;
  /** The crumble animation, 0 to 1 while it plays, -1 before or after. */
  private crumble = -1;

  constructor(
    plaza: AreaDef,
    private readonly sugarDef: ItemDef | null,
  ) {
    super(plaza.xStart * PPM, plaza.xStart * PPM + 800);
    this.dx = plaza.xStart * PPM + DOOR.x;
    this.back.addChild(this.g);
    this.front.addChild(this.fg, this.bubble);
    this.bubble.addChild(this.bubbleG);
    if (sugarDef) {
      this.sugar = new ItemSprite(sugarDef, 5);
      this.sugar.scale.set(1.25);
      this.bubble.addChild(this.sugar);
    }
    this.bubble.position.set(this.dx + 70, this.dy - 210);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('ant_hill_opened', () => {
        this.crumble = 0;
        for (let i = 0; i < 4; i++) particles.crumbs(this.dx + (i - 1.5) * 20, this.dy + 10, ANTS.earth);
        particles.dust(this.dx, this.dy + 40, 1);
      }),
      ev.on('ants_took_sugar', (e) => particles.sparkles(e.x * PPM, e.y * PPM - 20, 5)),
      ev.on('ant_hill_poked', () => particles.crumbs(this.dx, this.dy + 6, 0xc49464)),
    ];
  }

  /** Is the hill a doorway now? */
  private open(f: AreaFrame): boolean {
    return f.sim.barriers.isOpen('area_ant_hill_depths');
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    if (this.crumble >= 0) {
      this.crumble += f.dt / 1.2;
      if (this.crumble >= 1) this.crumble = -1;
    }
    this.updateBubble(f);
    if (!this.shows(f)) return;
    const open = this.open(f);
    const grow = this.crumble >= 0 ? easeOut(this.crumble) : open ? 1 : 0;
    this.drawDoor(g, f, grow);
    this.drawCarry(fg, f);
  }

  /** The door: a small dark hole, crumbling wide into an arch with a warm glow inside. */
  private drawDoor(g: Graphics, f: AreaFrame, grow: number): void {
    const x = this.dx;
    if (grow <= 0) return;
    // The little hole at the top fills in as the front of the hill crumbles open.
    g.ellipse(x, this.dy, 30, 22).fill({ color: 0xc49464, alpha: grow });
    // The doorway: straight sides, a round top, a sill on the ground.
    const sill = this.dy + 75;
    const w = 20 + 28 * grow;
    const h = 10 + 24 * grow;
    const top = sill - h;
    // A rim of loose, crumbled earth.
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      g.circle(x + Math.cos(a) * (w + 9), top + Math.sin(a) * (w + 7), 6 + (i % 3) * 2).fill(
        darken(0xc49464, 0.18),
      );
    }
    for (const sx of [-1, 1]) g.circle(x + sx * (w + 9), sill - 6, 7).fill(darken(0xc49464, 0.18));
    const arch = (pad: number): Graphics =>
      g
        .moveTo(x - w - pad, sill + 2)
        .lineTo(x - w - pad, top)
        .arc(x, top, w + pad, Math.PI, 0)
        .lineTo(x + w + pad, sill + 2);
    arch(0).closePath().fill(0x1e110b).stroke(stroke(4));
    // A warm lamp deep inside, and the top of a grass-stem ladder going down.
    g.circle(x + 8, top + 6, 9 * grow).fill({ color: ANTS.amber, alpha: 0.75 * grow });
    for (const sx of [-12, 12])
      g.moveTo(x + sx - 4, sill + 2)
        .lineTo(x + sx - 4, top + 12)
        .stroke({ width: 3, color: 0x8fbf4a, alpha: grow });
    for (const ly of [sill - 10, sill - 26])
      g.moveTo(x - 16, ly)
        .lineTo(x + 8, ly)
        .stroke({ width: 3, color: 0x8fbf4a, alpha: grow });
    // Under the hand, the way in pulses.
    const hand = f.hand;
    if (grow >= 1 && hand && Math.hypot(hand.x - x, hand.y - (sill - 30)) < 120) {
      const p = 0.5 + 0.5 * Math.sin(f.time * 6);
      arch(8).stroke({ width: 5, color: 0xffffff, alpha: 0.4 + 0.4 * p, cap: 'round' });
    }
  }

  /** Ants under the sugar cube while they carry it in. */
  private drawCarry(g: Graphics, f: AreaFrame): void {
    const c = f.sim.hidden.depths.state.sugar;
    if (!c) return;
    const v = f.views.find((q) => q.id === c.id);
    if (!v) return;
    const cx = v.x * PPM;
    const cy = v.y * PPM + 16;
    for (let i = 0; i < 6; i++) {
      const ox = (i - 2.5) * 9;
      const step = Math.sin(f.time * 22 + i * 1.7) * 2;
      g.ellipse(cx + ox, cy + 6 + step, 5, 3.5)
        .fill(ANTS.ant)
        .stroke({ width: 1.5, color: OUTLINE, alpha: 0.8 });
      g.circle(cx + ox + 5, cy + 3 + step, 2.6).fill(ANTS.antDark);
      g.moveTo(cx + ox - 2, cy + 8 + step)
        .lineTo(cx + ox - 4, cy + 13)
        .stroke({ width: 1.5, color: OUTLINE });
      g.moveTo(cx + ox + 2, cy + 8 + step)
        .lineTo(cx + ox + 4, cy + 13)
        .stroke({ width: 1.5, color: OUTLINE });
    }
  }

  /** While the hill is still shut and the hand hovers it: a thought bubble with a sugar cube. */
  private updateBubble(f: AreaFrame): void {
    const hand = f.hand;
    const want =
      !this.open(f) &&
      !f.sim.hidden.depths.state.sugar &&
      hand !== null &&
      Math.abs(hand.x - this.dx) < 130 &&
      hand.y > this.dy - 120 &&
      hand.y < this.dy + 150;
    this.think += ((want ? 1 : 0) - this.think) * Math.min(1, f.dt * (want ? 9 : 6));
    this.bubble.visible = this.think > 0.02 && this.shows(f);
    if (!this.bubble.visible) return;
    const k = this.think;
    this.bubble.scale.set(0.6 + 0.4 * k + Math.sin(f.time * 3) * 0.02);
    this.bubble.alpha = Math.min(1, k * 1.4);
    const g = this.bubbleG.clear();
    // A lumpy thought cloud, with two puffs trailing down to the door.
    for (const [x, y, r] of [
      [-34, -8, 30],
      [0, -22, 34],
      [34, -8, 30],
      [-18, 18, 26],
      [20, 18, 26],
    ] as const)
      g.circle(x, y, r).fill(0xffffff).stroke(stroke(4.5));
    g.ellipse(0, 0, 58, 32).fill(0xffffff);
    g.circle(-44, 56, 10).fill(0xffffff).stroke(stroke(3.5));
    g.circle(-62, 86, 6).fill(0xffffff).stroke(stroke(3));
    if (this.sugar) {
      this.sugar.position.set(0, Math.sin(f.time * 4) * 3);
      this.sugar.rotation = Math.sin(f.time * 2) * 0.12;
    }
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f) || !this.open(f)) return;
    light(this.dx, this.dy + 50, 90, ANTS.amber, 0.35 + 0.2 * f.look.glow);
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
