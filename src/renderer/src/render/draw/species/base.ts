import type { Graphics } from 'pixi.js';
import type { BugDef } from '../../../../../game/data/types';
import type { BugFrame } from '../bug';
import type { Adjust, AntennaSpring, Box, PainterArgs, SpeciesLayers, SpeciesPainter } from './common';

/** Shared plumbing for species painters. */
export abstract class BasePainter implements SpeciesPainter {
  readonly def: BugDef;
  readonly r: number;
  readonly foot: number;
  readonly curls: boolean = false;
  protected readonly L: SpeciesLayers;

  constructor(args: PainterArgs, foot = args.r) {
    this.def = args.def;
    this.r = args.r;
    this.L = args.layers;
    this.foot = foot;
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

  abstract drawStatic(frame: BugFrame): void;
  abstract mask(g: Graphics, frame: BugFrame): void;
  abstract paintBox(frame: BugFrame): Box | null;
  abstract update(frame: BugFrame, springs: readonly AntennaSpring[]): Adjust;
}
