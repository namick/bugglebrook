import { PIXELS_PER_METER } from '../../../../../game/constants';
import type { BugDef } from '../../../../../game/data/types';
import { BeePainter } from './bee';
import { CaterpillarPainter } from './caterpillar';
import type { PainterArgs, SpeciesPainter } from './common';
import { CricketPainter } from './cricket';
import { DungbeetlePainter } from './dungbeetle';
import { MantisPainter } from './mantis';
import { MothPainter } from './moth';
import { StagbeetlePainter } from './stagbeetle';
import { StickinsectPainter } from './stickinsect';
import { StinkbugPainter } from './stinkbug';

/**
 * The painter for a species drawn in its own module, or null for the first
 * five bugs and Flick (drawn by BugSprite itself).
 */
export function makePainter(args: PainterArgs): SpeciesPainter | null {
  switch (args.def.art) {
    case 'stinkbug':
      return new StinkbugPainter(args);
    case 'stagbeetle':
      return new StagbeetlePainter(args);
    case 'dungbeetle':
      return new DungbeetlePainter(args);
    case 'caterpillar':
      return new CaterpillarPainter(args);
    case 'mantis':
      return new MantisPainter(args);
    case 'stickinsect':
      return new StickinsectPainter(args);
    case 'bee':
      return new BeePainter(args);
    case 'cricket':
      return new CricketPainter(args);
    case 'moth':
      return new MothPainter(args);
    default:
      return null;
  }
}

/** About how wide a bug is drawn, in pixels, for fitting it in a pocket slot. */
export function bugSpan(def: BugDef): number {
  const d = def.radius * PIXELS_PER_METER * 2;
  switch (def.art) {
    case 'stagbeetle':
      return d * 1.55;
    case 'caterpillar':
      return d * 1.5;
    case 'mantis':
      return d * 1.4;
    case 'cricket':
      return d * 1.5;
    case 'moth':
      return d * 1.2;
    case 'stickinsect':
      return (def.collider?.width ?? def.radius * 2) * PIXELS_PER_METER;
    default:
      return d;
  }
}
