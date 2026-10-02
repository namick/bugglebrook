import { Container, Graphics } from 'pixi.js';
import { VIEW_WIDTH_PX } from '../../../game/constants';
import { stroke } from '../render/palette';
import { PictureButton } from './button';
import { CREAM, LEAF_DARK, token } from './icons';

/** Where the camera and the album sit (top right, the camera left of the album). */
export const ALBUM_AT = { x: VIEW_WIDTH_PX - 90, y: 80 };
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

/** A stack of polaroids, the top one a little askew. */
export function albumIcon(g: Graphics, s: number): Graphics {
  const w = s * 0.42;
  const h = s * 0.4;
  for (const [dx, dy, rot, fill] of [
    [-s * 0.06, s * 0.06, -0.25, 0xe9e2d2],
    [s * 0.04, s * 0.02, 0.12, 0xf4efe2],
    [0, -s * 0.02, -0.04, 0xffffff],
  ] as const) {
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const p = (x: number, y: number): [number, number] => [dx + x * c - y * sn, dy + x * sn + y * c];
    g.poly([...p(-w / 2, -h / 2), ...p(w / 2, -h / 2), ...p(w / 2, h / 2), ...p(-w / 2, h / 2)])
      .fill(fill)
      .stroke(stroke(4.5));
    const iw = w * 0.78;
    const ih = h * 0.52;
    const top = -h / 2 + h * 0.12;
    g.poly([...p(-iw / 2, top), ...p(iw / 2, top), ...p(iw / 2, top + ih), ...p(-iw / 2, top + ih)]).fill(
      fill === 0xffffff ? 0x7ec8ff : 0xb9c7d6,
    );
    if (fill === 0xffffff) {
      g.poly([
        ...p(-iw / 2, top + ih * 0.62),
        ...p(iw / 2, top + ih * 0.62),
        ...p(iw / 2, top + ih),
        ...p(-iw / 2, top + ih),
      ]).fill(LEAF_DARK);
      g.circle(...p(0, top + ih * 0.66), s * 0.055).fill(0xe8485c);
    }
  }
  return g;
}

/** The camera button (top right, left of the album): opens and closes photo mode. */
export function cameraButton(onPress: () => void): PictureButton {
  const art = token(new Graphics(), 48);
  cameraIcon(art, 84);
  const button = new PictureButton(art, 110, 110, onPress);
  button.position.set(CAMERA_AT.x, CAMERA_AT.y);
  button.label = 'camera';
  return button;
}

/**
 * The album button (top right, where the journal will live): a stack of
 * polaroids that wiggles when a photo lands on it. Hidden until there is a photo.
 */
export class AlbumButton extends PictureButton {
  private wiggle = 0;
  private readonly stack: Container;

  constructor(onPress: () => void) {
    const art = new Container();
    const back = token(new Graphics(), 48);
    const stack = new Container();
    albumIcon(stack.addChild(new Graphics()), 86);
    art.addChild(back, stack);
    super(art, 110, 110, onPress);
    this.stack = stack;
    this.position.set(ALBUM_AT.x, ALBUM_AT.y);
    this.label = 'album';
  }

  /** A photo landed: wiggle once. */
  bump(): void {
    this.wiggle = 1;
  }

  override update(dt: number): void {
    super.update(dt);
    if (this.wiggle > 0) {
      this.wiggle = Math.max(0, this.wiggle - dt * 1.6);
      this.stack.rotation = Math.sin(this.wiggle * 18) * 0.25 * this.wiggle;
      this.stack.scale.set(1 + 0.18 * this.wiggle);
    } else {
      this.stack.rotation = 0;
      this.stack.scale.set(1);
    }
  }
}
