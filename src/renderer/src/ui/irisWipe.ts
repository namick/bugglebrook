import { Container, Graphics } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';
import { irisPolygon, irisRadius } from '../render/iris';
import type { IrisShape } from '../render/iris';
import { OUTLINE } from '../render/palette';

/**
 * The doorway iris wipe's picture (M10): the screen goes dark except for a
 * doorway-shaped hole that closes on the doorway and opens on the other
 * side. The timing is `irisAt` (`render/iris.ts`); `HiddenDirector` runs it.
 */
export class IrisWipe extends Container {
  private readonly g = new Graphics();

  constructor() {
    super();
    this.addChild(this.g);
    this.eventMode = 'none';
    this.visible = false;
  }

  /** Draw the wipe: a hole of `shape` at (x, y) view px, `open` from 0 (shut) to 1. */
  draw(shape: IrisShape, x: number, y: number, open: number): void {
    const g = this.g.clear();
    this.visible = open < 1;
    if (!this.visible) return;
    const r = irisRadius(open, x, y, VIEW_WIDTH_PX, VIEW_HEIGHT_PX);
    // The dark reaches far past the screen, so the hole always lies inside it (a cut must).
    const M = 4000;
    g.rect(-M, -M, VIEW_WIDTH_PX + 2 * M, VIEW_HEIGHT_PX + 2 * M).fill(0x150d18);
    if (r > 1) {
      const lo = -M + 50;
      const hole = irisPolygon(shape, x, y, r).map((v, i) =>
        Math.max(lo, Math.min((i % 2 ? VIEW_HEIGHT_PX : VIEW_WIDTH_PX) - lo, v)),
      );
      g.poly(hole).cut();
      // A bold outline round the hole, like the art's.
      g.poly(hole).stroke({ width: 8, color: OUTLINE, alpha: 0.9, join: 'round' });
    }
  }

  hide(): void {
    this.g.clear();
    this.visible = false;
  }
}
