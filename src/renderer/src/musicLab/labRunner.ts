// Plays one of the Music Lab's demos (labPlan.ts) a step at a time. It
// reaches the game only through `LabHost`, so Vitest can run it against the
// real music engine with a fake sink and no Pixi. Each waiting step has a
// time limit: a demo that cannot happen says why and stops.

import type { MusicReport } from '../audio/musicEngine';
import type { LabDemo, LabStep } from './labPlan';

export interface LabHost {
  /** `busy` while the game switches between the menu and a world. */
  scene(): 'menu' | 'world' | 'busy';
  openWorld(): void;
  openMenu(): void;
  /** Open every area of the strip that is still locked, and set the clock and the weather (sim commands). */
  stage(hour: number, rain: boolean): void;
  rain(on: boolean): void;
  /** Put the camera's center at world x: at once, or sliding there over `seconds`. */
  camera(x: number, seconds: number): void;
  report(): MusicReport;
  /** While on, the music cuts to a new track instead of crossfading. */
  cutting(on: boolean): void;
  /** Jump to `bars` bars before the loop point. False when there is no loop (the pad). */
  seek(bars: number): boolean;
  /** One note as the player would play it. */
  note(): void;
}

/** Seconds a step may take before the demo gives up. */
const LIMITS: Record<LabStep['do'], number> = {
  menu: 15,
  stage: 20,
  playing: 60,
  bars: 60,
  camera: 5,
  rain: 5,
  seek: 5,
  wrap: 30,
  notes: 30,
};

const matches = (playing: string, id: string): boolean => playing === id || playing === `pad:${id}`;

export class LabRunner {
  /** The demo playing, or null. */
  demo: LabDemo | null = null;
  /** What is happening, in plain words. */
  status = 'Pick something to listen to and press Play.';
  private index = 0;
  private entered = false;
  private elapsed = 0;
  /** Audio time a `bars` step ends, or the next note is due. */
  private until = 0;
  private notesLeft = 0;
  private lastPosition = 0;
  private staged = false;
  /** Frames since the stage's commands were sent (they land on the sim's next step). */
  private settled = 0;
  private asked = -Infinity;

  constructor(private readonly host: LabHost) {}

  get running(): string | null {
    return this.demo?.id ?? null;
  }

  /** The step under way, counting from 1, and how many there are. */
  get progress(): { step: number; of: number } | null {
    return this.demo ? { step: this.index + 1, of: this.demo.steps.length } : null;
  }

  play(demo: LabDemo): void {
    this.host.cutting(false);
    this.demo = demo;
    this.index = 0;
    this.entered = false;
    this.status = `${demo.label}.`;
  }

  /** Stop where it is. The music carries on by the game's own rules. */
  stop(why = 'Stopped.'): void {
    this.demo = null;
    this.host.cutting(false);
    this.status = why;
  }

  update(dt: number): void {
    const demo = this.demo;
    if (!demo) return;
    const step = demo.steps[this.index];
    if (!step) return this.stop(`Finished: ${demo.label}. The music carries on from here.`);
    const r = this.host.report();
    if (!this.entered) {
      this.entered = true;
      this.elapsed = 0;
      const refused = this.enter(step, r);
      if (refused) return this.stop(`Stopped: ${refused}`);
    }
    this.elapsed += dt;
    this.status = `${demo.label}. ${this.say(step, r)}`;
    if (this.done(step, r)) {
      this.index++;
      this.entered = false;
      if (this.index >= demo.steps.length)
        this.stop(`Finished: ${demo.label}. The music carries on from here.`);
      return;
    }
    if (this.elapsed > LIMITS[step.do]) this.stop(`Stopped: ${this.stuck(step)}`);
  }

  /** Start a step. Returns why it cannot be done, if it cannot. */
  private enter(step: LabStep, r: MusicReport): string | null {
    const beat = 60 / Math.max(1, r.bpm);
    switch (step.do) {
      case 'menu':
        this.host.cutting(true);
        this.asked = -Infinity;
        return null;
      case 'stage':
        this.host.cutting(true);
        this.staged = false;
        this.settled = 0;
        this.asked = -Infinity;
        return null;
      case 'bars':
        this.until = r.time + step.bars * r.beatsPerBar * beat;
        return null;
      case 'camera':
        this.host.camera(step.x, step.seconds);
        return null;
      case 'rain':
        this.host.rain(step.on);
        return null;
      case 'seek':
        return this.host.seek(step.bars)
          ? null
          : 'there is no track here yet, and the pad has no loop point.';
      case 'wrap':
        this.lastPosition = r.position ?? 0;
        return null;
      case 'notes':
        this.notesLeft = step.count;
        this.until = r.time;
        return null;
      case 'playing':
        return null;
    }
  }

  private done(step: LabStep, r: MusicReport): boolean {
    const scene = this.host.scene();
    switch (step.do) {
      case 'menu':
        if (scene === 'world' && this.elapsed - this.asked > 5) {
          this.asked = this.elapsed;
          this.host.openMenu();
        }
        return scene === 'menu';
      case 'stage': {
        if (scene === 'menu' && this.elapsed - this.asked > 5) {
          this.asked = this.elapsed;
          this.host.openWorld();
        }
        if (scene !== 'world') return false;
        if (!this.staged) {
          this.staged = true;
          this.host.stage(step.hour, step.rain);
        }
        // Locked areas open on the sim's next step, and the camera's limits a frame later: keep asking.
        this.host.camera(step.x, 0);
        this.settled++;
        return this.settled > 3 && r.area === step.area;
      }
      case 'playing': {
        const there =
          matches(r.playing, step.id) &&
          !r.fading &&
          !r.state.stinger &&
          (step.phase === undefined || r.phase === step.phase);
        if (there) this.host.cutting(false);
        return there;
      }
      case 'bars':
        return r.time >= this.until;
      case 'camera':
      case 'rain':
      case 'seek':
        return true;
      case 'wrap': {
        const at = r.position;
        if (at === null) return false;
        const wrapped = at < this.lastPosition - 1;
        this.lastPosition = at;
        return wrapped;
      }
      case 'notes':
        if (this.notesLeft > 0 && r.time >= this.until) {
          this.host.note();
          this.notesLeft--;
          this.until = r.time + 60 / Math.max(1, r.bpm);
        }
        return this.notesLeft === 0;
    }
  }

  private say(step: LabStep, r: MusicReport): string {
    if (step.do === 'wrap' && r.position !== null && r.loopSeconds !== null)
      return `${step.say}: ${Math.max(0, Math.ceil(r.loopSeconds - r.position))} seconds to go.`;
    return step.say;
  }

  private stuck(step: LabStep): string {
    switch (step.do) {
      case 'menu':
        return 'could not get back to the menu.';
      case 'stage':
        return 'could not open the world or reach that place.';
      case 'playing':
        return `the music did not change to ${step.id}.`;
      case 'wrap':
        return 'the loop point did not come.';
      default:
        return 'that took too long.';
    }
  }
}
