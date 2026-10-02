import { Container } from 'pixi.js';
import { VIEW_WIDTH_M } from '../../../game/constants';
import type { Sim } from '../../../game/sim';
import type { Door } from '../../../game/systems/hidden';
import type { SfxName } from '../audio/sfx';
import type { PointerController } from '../input/pointerController';
import type { Camera, Point } from '../render/camera';
import { IRIS_SECONDS, irisAt, irisShape } from '../render/iris';
import type { IrisShape } from '../render/iris';
import { WUBBO } from '../render/constellations';
import { IrisWipe } from '../ui/irisWipe';
import { TelescopeView } from '../ui/telescopeView';

/** Seconds after the finale starts before the camera goes out to the plaza for the fireworks. */
export const FINALE_CAMERA = 2.6;

interface Wipe {
  t: number;
  shape: IrisShape;
  /** The doorway to go through (`travel` at the middle), or null for a camera move alone. */
  door: string | null;
  /** World points: where the hole closes, and where it opens. */
  from: Point;
  to: Point;
  /** The camera's center on arrival (world x). */
  destX: number;
  sent: boolean;
}

/**
 * M10's hidden areas on the renderer's side: the doorway iris wipe (the
 * hand's click or a held thing's dwell on a doorway, the home button from
 * inside), the telescope's view, the gnome's sniffle on hover, and the
 * finale's trip out to the plaza for the fireworks. It reads the sim and
 * sends commands; the camera is its to move.
 */
export class HiddenDirector {
  readonly layer = new Container();
  readonly iris = new IrisWipe();
  readonly telescope = new TelescopeView();
  private wipe: Wipe | null = null;
  private sniffing = false;
  /** Seconds since the finale started, or -1. */
  private finale = -1;
  /** Doorways gone through, for the test hook. */
  trips = 0;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly input: PointerController,
    private readonly play: (name: SfxName, strength?: number) => void,
  ) {
    this.layer.addChild(this.iris, this.telescope);
    input.onDoor = (id) => this.enter(id);
    this.offs.push(
      sim.events.on('telescope_viewed', () => this.lookUp()),
      sim.events.on('finale_started', () => (this.finale = 0)),
    );
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.input.onDoor = null;
  }

  /** Is the camera inside a hidden area? */
  get inside(): boolean {
    return this.sim.hidden.hiddenAt(this.camera.centerX) !== null;
  }

  get wiping(): boolean {
    return this.wipe !== null;
  }

  /** Go through doorway `id` (it must be open): the wipe starts now, the trip happens at its middle. */
  enter(id: string): boolean {
    const hidden = this.sim.hidden;
    const from = hidden.door(id);
    const to = from ? hidden.door(from.to) : null;
    if (this.wipe || !from || !to || !hidden.doorOpen(id)) return false;
    this.wipe = {
      t: 0,
      shape: irisShape(from.kind),
      door: id,
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      destX: to.x,
      sent: false,
    };
    return true;
  }

  /** The home button from inside a hidden area: back out through its doorway. */
  leave(): boolean {
    const here = this.sim.hidden.hiddenAt(this.camera.centerX);
    if (!here) return false;
    const door = this.sim.hidden.doors().find((d: Door) => d.area.id === here.id);
    return door ? this.enter(door.id) : false;
  }

  /** A camera move under the wipe, with no doorway (the finale's trip to the fireworks). */
  private moveTo(x: number, y: number, shape: IrisShape): void {
    if (this.wipe) return;
    this.wipe = {
      t: 0,
      shape,
      door: null,
      from: { x: this.camera.centerX, y: 5 },
      to: { x, y },
      destX: x,
      sent: false,
    };
  }

  update(dt: number): void {
    this.updateWipe(dt);
    this.updateSniffle();
    this.telescope.update(dt);
    if (this.finale >= 0) {
      const before = this.finale;
      this.finale += dt;
      if (before < FINALE_CAMERA && this.finale >= FINALE_CAMERA) {
        this.telescope.close();
        const plaza = this.sim.content.areas.tryGet('area_stump_plaza');
        if (plaza) this.moveTo(plaza.xStart + 19.5, 3, 'circle');
      }
      if (this.finale > 60) this.finale = -1;
    }
  }

  private updateWipe(dt: number): void {
    const w = this.wipe;
    if (!w) {
      this.iris.hide();
      return;
    }
    if (w.t === 0) this.play('iris', 0.8);
    w.t += dt;
    const f = irisAt(w.t);
    if (f.arrived && !w.sent) {
      w.sent = true;
      this.arrive(w);
    }
    const at = this.camera.worldToView(f.arrived ? w.to : w.from);
    this.iris.draw(w.shape, at.x, at.y, f.open);
    if (f.done || w.t >= IRIS_SECONDS) {
      this.wipe = null;
      this.iris.hide();
    }
  }

  /** The middle of the wipe: through the doorway (with whatever the hand holds), and the camera follows. */
  private arrive(w: Wipe): void {
    if (w.door) {
      this.sim.send({ type: 'travel', door: w.door });
      this.trips++;
    }
    const barriers = this.sim.barriers;
    const open = barriers.view(w.destX);
    this.camera.setLimits(open.x0, open.x1, barriers.region(w.destX));
    this.camera.stopGlide();
    this.camera.velocity = 0;
    this.camera.set(w.destX - VIEW_WIDTH_M / 2);
    if (w.door) {
      const to = this.sim.hidden.door(this.sim.hidden.door(w.door)?.to ?? '');
      if (to) w.to = { x: to.x, y: to.y };
    }
  }

  /** Hovering the gnome's face while his nose is missing: a sniffle (and the journal notes the clue). */
  private updateSniffle(): void {
    const on = this.input.hoverFixture === 'fix_gnome' && !this.sim.barriers.isOpen('area_gnome_hollow');
    if (on && !this.sniffing) {
      this.sim.send({ type: 'notice', what: 'gnome_sniffle' });
      this.play('sniffle');
    }
    this.sniffing = on;
  }

  /** The telescope: the night sky, a constellation per bug, lit for the ones found. */
  private lookUp(): void {
    const sim = this.sim;
    const met = new Set(sim.journal.state.bugs);
    const cast = sim.content.bugs.all.map((b) => ({
      id: b.id,
      art: b.art,
      found: sim.cast.joined(b.id) || met.has(b.id),
    }));
    const wubbo = sim.cast.joined(WUBBO) || sim.secrets.includes('secret_wubbo_found');
    this.telescope.open(cast, wubbo);
  }

  /** For the test hook. */
  report(): {
    wiping: boolean;
    inside: boolean;
    area: string;
    trips: number;
    telescope: ReturnType<TelescopeView['report']>;
    finale: number;
  } {
    return {
      wiping: this.wiping,
      inside: this.inside,
      area: this.sim.areaOf(this.camera.centerX).id,
      trips: this.trips,
      telescope: this.telescope.report(),
      finale: this.finale,
    };
  }
}
