import { CONTENT } from '../../src/game/data';

/**
 * Where the plaza starts in world meters. Puddle Pond sits to its left, so
 * plaza tests add this to the plaza-local positions they were written for.
 */
export const PLAZA_X = CONTENT.areas.get('area_stump_plaza').xStart;

/** Where Puddle Pond starts in world meters: the flowerbed is to its left. */
export const POND_X = CONTENT.areas.get('area_puddle_pond').xStart;

/** Puddle Pond's water, in world meters. */
export const POND = (() => {
  const pond = CONTENT.areas.get('area_puddle_pond');
  const w = pond.water!;
  return {
    x0: pond.xStart + w.x0,
    x1: pond.xStart + w.x1,
    level: w.level,
    middle: pond.xStart + (w.x0 + w.x1) / 2,
  };
})();
