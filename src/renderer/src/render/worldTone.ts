import type { Container, GraphicsContext } from 'pixi.js';
import { FillGradient, Graphics } from 'pixi.js';
import type { ShadeRule, ToneAnchor, WorldStyle } from '../art/backdropData';
import { shadesIn, toneColor } from '../art/backdropData';

/**
 * A set's tone map at work (docs/04-architecture.md, "Backdrops"): the
 * code-drawn world's colors are mapped once, shape by shape, before anything
 * is baked or drawn. Nothing runs per frame, and since each shape's own color
 * changes (not the pixels afterwards), edges and see-through layers stay clean.
 */
export type Tone = (color: number) => number;

/** No tone map: every color stays. */
export const NO_TONE: Tone = (c) => c;

/**
 * A tone map as a function that remembers every color it has mapped. With
 * `shades`, it is the map for one area's scenery: that area's shade rules
 * over the hue rules.
 */
export function makeTone(anchors: readonly ToneAnchor[], shades: readonly ShadeRule[] = []): Tone {
  if (!anchors.length && !shades.length) return NO_TONE;
  const seen = new Map<number, number>();
  return (c) => {
    let to = seen.get(c);
    if (to === undefined) {
      to = toneColor(c, anchors, shades);
      seen.set(c, to);
    }
    return to;
  };
}

/**
 * A set's tone maps for the static scenery: one for the whole world, and one
 * for each area with shade rules of its own.
 */
export interface WorldTones {
  all: Tone;
  areas: ReadonlyMap<string, Tone>;
}

export function makeTones(world: Pick<WorldStyle, 'tone' | 'shade'>): WorldTones {
  const areas = new Map<string, Tone>();
  for (const { area } of world.shade)
    if (!areas.has(area)) areas.set(area, makeTone(world.tone, shadesIn(world, area)));
  return { all: makeTone(world.tone), areas };
}

/** A gradient stop's color (`#rrggbbaa`) through a tone map, alpha kept. */
function toneStop(color: string, tone: Tone): string {
  const rgb = tone(parseInt(color.slice(1, 7), 16));
  return `#${rgb.toString(16).padStart(6, '0')}${color.slice(7)}`;
}

/**
 * Map the fill and stroke colors of every `Graphics` under `root`, gradients
 * included. Call it on shapes that have not been drawn yet: once Pixi has
 * built a shape's geometry, changing its colors here does nothing. Tints on
 * containers are light, not paint, and stay. Returns how many colors changed.
 *
 * Given a set's `WorldTones`, a container labelled with an area's ID is that
 * area's scenery: it and everything under it take the area's own map.
 */
export function toneGraphics(root: Container, tones: Tone | WorldTones): number {
  const all = typeof tones === 'function' ? tones : tones.all;
  const areas = typeof tones === 'function' ? null : tones.areas;
  if (all === NO_TONE && !areas?.size) return 0;
  let changed = 0;
  const done = new Set<GraphicsContext>();
  // Shapes drawn one after another with the same style share one style object: map it once.
  const styles = new Set<object>();
  const gradients = new Map<FillGradient, FillGradient>();
  const visit = (node: Container, inherited: Tone): void => {
    const tone = areas?.get(node.label) ?? inherited;
    if (node instanceof Graphics && tone !== NO_TONE && !done.has(node.context)) {
      done.add(node.context);
      for (const ins of node.context.instructions) {
        if (ins.action === 'texture') continue;
        const style = ins.data.style;
        if (styles.has(style)) continue;
        styles.add(style);
        if (style.fill instanceof FillGradient) {
          // A gradient keeps its colors in a texture: swap in one made from the mapped stops.
          let to = gradients.get(style.fill);
          if (!to) {
            const from = style.fill;
            const colorStops = from.colorStops.map((stop) => ({
              offset: stop.offset,
              color: toneStop(stop.color, tone),
            }));
            to =
              from.type === 'radial'
                ? new FillGradient({
                    type: 'radial',
                    center: from.center,
                    innerRadius: from.innerRadius,
                    outerCenter: from.outerCenter,
                    outerRadius: from.outerRadius,
                    scale: from.scale,
                    rotation: from.rotation,
                    textureSpace: from.textureSpace,
                    colorStops,
                  })
                : new FillGradient({
                    type: 'linear',
                    start: from.start,
                    end: from.end,
                    textureSpace: from.textureSpace,
                    colorStops,
                  });
            to.buildGradient();
            gradients.set(from, to);
          }
          style.fill = to;
          style.texture = to.texture;
          style.matrix = to.transform;
          changed++;
        } else if (!style.fill) {
          const to = tone(style.color);
          if (to !== style.color) changed++;
          style.color = to;
        }
      }
    }
    for (const child of node.children) visit(child as Container, tone);
  };
  visit(root, all);
  return changed;
}
