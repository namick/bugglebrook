import { Text } from 'pixi.js';
import { OUTLINE } from '../render/palette';

/**
 * The journal's short labels (1 to 3 words, section 13): chunky rounded
 * letters with the shared outline, like a sticker. The only words in the
 * game besides the logo, and only on things already found.
 */
const FONT = '"Baloo 2", "Fredoka", "Nunito", "Arial Rounded MT Bold", "Trebuchet MS", "Verdana", sans-serif';

export function label(text: string, size: number, color = 0xffffff, outline = OUTLINE): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: FONT,
      fontSize: size,
      fontWeight: '900',
      fill: color,
      stroke: { color: outline, width: Math.max(3, size * 0.22), join: 'round' },
      align: 'center',
      letterSpacing: 0.5,
    },
    resolution: 2,
  });
  t.anchor.set(0.5);
  return t;
}

/** A label no wider than `max` pixels (long names shrink to fit). */
export function fitLabel(text: string, size: number, max: number, color = 0xffffff): Text {
  const t = label(text, size, color);
  if (t.width > max) t.scale.set(max / t.width);
  return t;
}
