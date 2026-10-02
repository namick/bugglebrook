import { Container, Graphics } from 'pixi.js';
import { PIXELS_PER_METER } from '../../../../game/constants';
import { HOLLOW_CEILING } from '../../../../game/data/hiddenAreas';
import type { AreaDef, ItemDef } from '../../../../game/data/types';
import type { Sim } from '../../../../game/sim';
import { ItemSprite } from '../draw/item';
import type { Particles } from '../particles';
import { darken, lighten, stroke } from '../palette';
import { HOLLOW_COLORS, LOST_SHELVES, starPath } from './hollow';
import { AreaLive } from './live';
import type { AreaFrame, LightFn } from './live';

const PPM = PIXELS_PER_METER;

/** Twinkling stars painted on the dome (area-local x, world y), the same every time. */
const TWINKLES: readonly (readonly [number, number])[] = Array.from({ length: 18 }, (_, i) => [
  1.4 + ((i * 0.618) % 1) * 16.4,
  1.2 + ((i * 0.381) % 1) * 2.4,
]);

/** Where the lost toys' pictures stand: area-local x on each shelf (the top one keeps room for the map scrap). */
const PICTURE_SPOTS: readonly (readonly [number, number])[] = [
  ...[2.55, 3.05, 3.55, 4.05, 4.55, 5.05].map((x) => [x, LOST_SHELVES[0]![2]] as const),
  ...[2.55, 3.05, 3.55, 4.05, 4.55, 5.05, 5.55, 6.05].map((x) => [x, LOST_SHELVES[1]![2]] as const),
];

/**
 * Gnome Hollow, alive (M10): twinkling painted stars, the brass telescope
 * at the top of the stair (it swings open through the hat for the finale),
 * the lost-toy museum's pictures of everything the player has flung out of
 * the world, the moon pedestal's glow, the door's pulse, and a cosy lamp.
 */
export class HollowLive extends AreaLive {
  private readonly g = new Graphics();
  private readonly fg = new Graphics();
  private readonly pictures = new Container();
  private readonly ax: number;
  private shelfKey = '';
  /** The telescope's peek animation (s), or -1. */
  private peek = -1;

  constructor(
    private readonly area: AreaDef,
    private readonly itemDef: (defId: string) => ItemDef | undefined,
  ) {
    super(area.xStart * PPM, area.xEnd * PPM);
    this.ax = area.xStart * PPM;
    this.back.addChild(this.g, this.pictures);
    this.front.addChild(this.fg);
  }

  override listen(sim: Sim, particles: Particles): Array<() => void> {
    const ev = sim.events;
    return [
      ev.on('telescope_viewed', (e) => {
        this.peek = 0;
        particles.sparkles(e.x * PPM, e.y * PPM - 40, 8);
      }),
      ev.on('marble_seated', (e) => {
        particles.sparkles(e.x * PPM, e.y * PPM - 20, 16);
        particles.stars(e.x * PPM, e.y * PPM - 60);
      }),
      ev.on('pedestal_poked', (e) => particles.sparkles(e.x * PPM, e.y * PPM, 4)),
    ];
  }

  private px(m: number): number {
    return this.ax + m * PPM;
  }

  update(f: AreaFrame): void {
    const g = this.g.clear();
    const fg = this.fg.clear();
    if (this.peek >= 0) this.peek = this.peek + f.dt > 1.4 ? -1 : this.peek + f.dt;
    this.updatePictures(f);
    if (!this.shows(f)) return;
    const finale = f.sim.hidden.hollow.finaleAge;
    const open = finale >= 0 ? Math.min(1, finale / 90) : f.sim.hidden.hollow.state.finale === -2 ? 1 : 0;
    this.drawSky(g, f, open);
    this.drawTwinkles(g, f);
    this.drawTelescope(fg, f, open);
    this.drawPedestal(g, f);
    this.drawDoor(fg, f);
  }

  /** In the finale the hat opens: real night sky shows through the top of his head. */
  private drawSky(g: Graphics, f: AreaFrame, open: number): void {
    if (open <= 0) return;
    const cx = this.px(16.8);
    const r = 170 * open;
    g.circle(cx, HOLLOW_CEILING * PPM - 10, r + 10).fill(darken(HOLLOW_COLORS.night, 0.4));
    g.circle(cx, HOLLOW_CEILING * PPM - 10, r).fill(0x0b1030);
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.4) % (Math.PI * 2);
      const d = ((i * 0.37) % 1) * r * 0.9;
      const tw = 0.5 + 0.5 * Math.sin(f.time * 3 + i);
      g.circle(cx + Math.cos(a) * d, HOLLOW_CEILING * PPM - 10 + Math.sin(a) * d * 0.6, 2 + tw * 2).fill({
        color: 0xffffff,
        alpha: 0.6 + 0.4 * tw,
      });
    }
  }

  private drawTwinkles(g: Graphics, f: AreaFrame): void {
    TWINKLES.forEach(([x, y], i) => {
      const tw = Math.max(0, Math.sin(f.time * (1.2 + (i % 4) * 0.3) + i * 1.7));
      if (tw < 0.3) return;
      starPath(g, this.px(x), y * PPM, 6 + 8 * tw, f.time * 0.3 + i).fill({ color: 0xfff3c4, alpha: tw });
    });
  }

  /** The brass telescope on its tripod at the top of the stair. */
  private drawTelescope(g: Graphics, f: AreaFrame, open: number): void {
    const tel = this.area.fixtures?.find((q) => q.kind === 'telescope');
    if (!tel) return;
    const bx = this.px(tel.x);
    const by = 2.7 * PPM;
    // Tripod.
    for (const dx of [-40, 0, 40])
      g.moveTo(bx, by - 50)
        .lineTo(bx + dx, by)
        .stroke({ width: 5, color: HOLLOW_COLORS.woodDark, cap: 'round' });
    const peek = this.peek >= 0 ? Math.sin((this.peek / 1.4) * Math.PI) : 0;
    const a = -0.9 - 0.4 * open + Math.sin(f.time * 0.4) * 0.05 * (1 - open);
    const len = 120 + 40 * peek + 70 * open;
    const cx = bx;
    const cy = by - 58;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    const bxx = cx - Math.cos(a) * 40;
    const byy = cy - Math.sin(a) * 40;
    g.moveTo(bxx, byy).lineTo(ex, ey).stroke({ width: 30, color: HOLLOW_COLORS.brass, cap: 'round' });
    g.moveTo(bxx, byy)
      .lineTo(ex, ey)
      .stroke({ width: 10, color: lighten(HOLLOW_COLORS.brass, 0.4), alpha: 0.6, cap: 'round' });
    // Bands and the big lens.
    for (const k of [0.3, 0.65])
      g.circle(cx + Math.cos(a) * len * k, cy + Math.sin(a) * len * k, 17)
        .fill(darken(HOLLOW_COLORS.brass, 0.2))
        .stroke(stroke(3));
    g.circle(ex, ey, 22).fill(darken(HOLLOW_COLORS.brass, 0.15)).stroke(stroke(4));
    g.circle(ex, ey, 14).fill({ color: 0x8fd6f2, alpha: 0.9 });
    g.circle(ex - 4, ey - 4, 5).fill({ color: 0xffffff, alpha: 0.8 });
    g.circle(bxx, byy, 9).fill(HOLLOW_COLORS.brass).stroke(stroke(3));
    // Under the hand: it wobbles, inviting a look.
    const hand = f.hand;
    if (hand && Math.hypot(hand.x - this.px(tel.x), hand.y - tel.y * PPM) < tel.radius * PPM) {
      const p = 0.5 + 0.5 * Math.sin(f.time * 6);
      g.circle(bxx, byy, 22 + 6 * p).stroke({ width: 4, color: 0xffffff, alpha: 0.5 + 0.3 * p });
    }
  }

  /** The moon pedestal: it glows while the player holds the golden marble, and shines once it is home. */
  private drawPedestal(g: Graphics, f: AreaFrame): void {
    const ped = this.area.fixtures?.find((q) => q.kind === 'moon_pedestal');
    if (!ped) return;
    const x = this.px(ped.x);
    const y = ped.y * PPM;
    const holding = f.views.some((v) => v.held && v.defId === 'item_marble_gold');
    if (holding) {
      const p = 0.5 + 0.5 * Math.sin(f.time * 6);
      g.circle(x, y, 40 + 10 * p).stroke({ width: 5, color: 0xffffff, alpha: 0.4 + 0.4 * p });
      g.circle(x, y, 62 + 12 * p).stroke({ width: 3, color: HOLLOW_COLORS.gold, alpha: 0.5 * p });
    }
  }

  private drawDoor(g: Graphics, f: AreaFrame): void {
    const door = this.area.fixtures?.find((q) => q.kind === 'hollow_door');
    const hand = f.hand;
    if (!door || !hand) return;
    const x = this.px(door.x);
    const y = door.y * PPM;
    if (Math.hypot(hand.x - x, hand.y - y) > door.radius * PPM) return;
    const p = 0.5 + 0.5 * Math.sin(f.time * 6);
    g.moveTo(x - 70, 9 * PPM)
      .lineTo(x - 70, 9 * PPM - 90)
      .arc(x, 9 * PPM - 90, 70, Math.PI, 0)
      .lineTo(x + 70, 9 * PPM)
      .stroke({ width: 5, color: 0xffffff, alpha: 0.4 + 0.4 * p });
  }

  /** The lost-toy museum: a little framed picture of each thing that flew out of the world. */
  private updatePictures(f: AreaFrame): void {
    const lost = f.sim.journal.state.lost;
    const key = lost.join(',');
    if (key === this.shelfKey) return;
    this.shelfKey = key;
    for (const c of this.pictures.removeChildren()) c.destroy({ children: true });
    const show = lost.slice(-PICTURE_SPOTS.length);
    show.forEach((defId, i) => {
      const def = this.itemDef(defId);
      const [x, shelf] = PICTURE_SPOTS[i]!;
      if (!def) return;
      const frame = new Container();
      const g = new Graphics();
      const w = 40;
      const h = 48;
      const tilt = ((i * 0.37) % 1) * 0.16 - 0.08;
      g.roundRect(-w / 2 - 4, -h - 4, w + 8, h + 8, 4)
        .fill(HOLLOW_COLORS.woodDark)
        .stroke(stroke(2.5));
      g.roundRect(-w / 2, -h, w, h, 3).fill(i % 2 ? 0xe9f3fb : 0xfff5e0);
      frame.addChild(g);
      const icon = new ItemSprite(def, i);
      const s = def.shape;
      const size = s.type === 'circle' ? s.radius * 2 : Math.max(s.width, s.height);
      icon.scale.set(Math.min(0.9, 0.32 / Math.max(0.05, size)));
      icon.position.set(0, -h / 2);
      frame.addChild(icon);
      frame.rotation = tilt;
      frame.position.set(this.px(x), shelf * PPM);
      this.pictures.addChild(frame);
    });
  }

  /** How many pictures the shelf shows (test hook). */
  get pictureCount(): number {
    return this.pictures.children.length;
  }

  override lights(f: AreaFrame, light: LightFn): void {
    if (!this.shows(f)) return;
    // The standing lamp by the stair, the crescent's gold, and the stars.
    light(this.px(18.75), 6.3 * PPM, 220, 0xffe3a3, 0.4);
    const ped = this.area.fixtures?.find((q) => q.kind === 'moon_pedestal');
    if (ped) {
      const home = f.views.some(
        (v) => v.defId === 'item_marble_gold' && Math.abs(v.x - (this.area.xStart + ped.x)) < 0.3,
      );
      light(
        this.px(ped.x),
        ped.y * PPM,
        home ? 150 : 90,
        0xf2c14e,
        home ? 0.3 + 0.08 * Math.sin(f.time * 2) : 0.14,
      );
    }
    TWINKLES.forEach(([x, y], i) => {
      const tw = Math.max(0, Math.sin(f.time * (1.2 + (i % 4) * 0.3) + i * 1.7));
      if (tw > 0.6) light(this.px(x), y * PPM, 40, 0xfff3c4, 0.25 * tw);
    });
    const finale = f.sim.hidden.hollow.finaleAge;
    if (finale >= 0) light(this.px(16.8), HOLLOW_CEILING * PPM, 300, 0xbfd0ff, Math.min(0.5, finale / 120));
  }
}
