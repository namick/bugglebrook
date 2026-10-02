import { Graphics } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import { stroke } from '../render/palette';
import { PictureButton } from './button';
import { CREAM, token } from './icons';

/** Where the camera sits: top right, left of the journal. */
export const CAMERA_AT = { x: VIEW_WIDTH_PX - 205, y: 80 };

/** A little camera: a rounded body, a lens, and a shutter button. */
export function cameraIcon(g: Graphics, s: number): Graphics {
  const w = s * 0.42;
  const h = s * 0.3;
  g.roundRect(-w * 0.55, -h - s * 0.1, w * 0.5, s * 0.14, 5)
    .fill(0x4d9bff)
    .stroke(stroke(4.5));
  g.roundRect(-w, -h, w * 2, h * 2, s * 0.09)
    .fill(0x5b6cff)
    .stroke(stroke(5));
  g.roundRect(-w, -h, w * 2, h * 0.5, s * 0.09).fill({ color: 0xffffff, alpha: 0.18 });
  g.circle(s * 0.04, s * 0.02, s * 0.19)
    .fill(CREAM)
    .stroke(stroke(5));
  g.circle(s * 0.04, s * 0.02, s * 0.1).fill(0x2b4a7a);
  g.circle(s * 0.0, -s * 0.02, s * 0.035).fill(0xffffff);
  g.roundRect(w * 0.45, -h * 0.55, s * 0.12, s * 0.1, 4)
    .fill(0xff4f5e)
    .stroke(stroke(3.5));
  return g;
}

/** The camera button (top right, left of the journal): opens and closes photo mode. */
export function cameraButton(onPress: () => void): PictureButton {
  const art = token(new Graphics(), 48);
  cameraIcon(art, 84);
  const button = new PictureButton(art, 110, 110, onPress);
  button.position.set(CAMERA_AT.x, CAMERA_AT.y);
  button.label = 'camera';
  return button;
}
