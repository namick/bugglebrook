import type { Graphics } from 'pixi.js';
import type { BugDef } from '../../../../../game/data/types';
import type { BugRig } from '../../rig/bugRig';
import { rigFor } from '../../rig/bugRig';
import type { Skeleton } from '../../rig/skeleton';
import type { BugFrame } from '../bug';
import type { Adjust, AntennaSpring, Box, Oval, PainterArgs, SpeciesLayers, SpeciesPainter } from './common';
import { PIXELS_PER_METER } from '../../../../../game/constants';
import type { WearSpot } from '../../wearLook';

/** Shared plumbing for species painters. */
export abstract class BasePainter implements SpeciesPainter {
  readonly def: BugDef;
  readonly r: number;
  readonly foot: number;
  readonly curls: boolean = false;
  protected readonly L: SpeciesLayers;
  /** The skeleton the template and the cutout renderer share. */
  protected readonly bones: BugRig;
  /** How strong a waiting bug's sign of life is this frame, 0 to 1 (test hook). */
  life = 0;

  constructor(args: PainterArgs, foot = args.r) {
    this.def = args.def;
    this.r = args.r;
    this.L = args.layers;
    this.foot = foot;
    this.bones = rigFor(args.def);
  }

  key(frame: BugFrame): string {
    return frame.face.form;
  }

  paintsItself(_frame: BugFrame): boolean {
    return false;
  }

  crown(_frame: BugFrame): { x: number; y: number } {
    return { x: this.r * 0.3, y: -this.r * 1.35 };
  }

  /** The head as drawn this frame (rig space), or null when it is tucked away. */
  protected abstract headOval(frame: BugFrame): Oval | null;

  wearSpot(frame: BugFrame): WearSpot {
    const [bx, by] = this.def.wear.back;
    const ball = this.curls && frame.face.form === 'curled';
    return {
      head: ball ? null : this.headOval(frame),
      top: ball ? { x: 0, y: -this.r } : this.crown(frame),
      ball,
      back: { x: bx * PIXELS_PER_METER, y: by * PIXELS_PER_METER },
      feet: { x: 0, y: this.foot },
    };
  }

  abstract drawStatic(frame: BugFrame): void;
  abstract mask(g: Graphics, frame: BugFrame): void;
  abstract paintBox(frame: BugFrame): Box | null;
  abstract update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust;
  abstract skeleton(frame: BugFrame, springs: readonly AntennaSpring[]): Skeleton;
}
