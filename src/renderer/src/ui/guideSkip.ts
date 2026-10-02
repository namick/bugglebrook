import { Graphics } from 'pixi.js';
import { VIEW_HEIGHT_PX } from '../../../game/constants';
import { OUTLINE, stroke } from '../render/palette';
import { PictureButton } from './button';

/**
 * The guided start's skip button (playtest F3): a round wooden token with a
 * fast-forward mark, bottom left, shown only while guided demos are still to
 * come. A click ends the guide; the ordinary, rarer ghost demos stay.
 */
export function guideSkipButton(onPress: () => void): PictureButton {
  const art = new Graphics();
  art.circle(0, 0, 40).fill(0xf2dfb0).stroke(stroke(6));
  art.circle(0, 0, 32).stroke({ width: 3, color: 0xc98a3a, alpha: 0.6 });
  // Two triangles and a bar: "skip ahead".
  for (const dx of [-14, 4])
    art
      .poly([dx - 6, -14, dx + 12, 0, dx - 6, 14], true)
      .fill(0x6fbf4a)
      .stroke(stroke(3));
  art.roundRect(16, -14, 7, 28, 3).fill(0x6fbf4a).stroke({ width: 3, color: OUTLINE });
  const button = new PictureButton(art, 96, 96, onPress);
  button.position.set(90, VIEW_HEIGHT_PX - 90);
  button.label = 'guide_skip';
  return button;
}
