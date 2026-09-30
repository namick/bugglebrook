import { Rectangle } from 'pixi.js';
import type { Container, Renderer } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../../game/constants';

/** Slot pictures are 320x180 (game design doc, section 18). */
export const THUMB_WIDTH = 320;

/**
 * A small picture of what the camera shows, for the slot's sign on the
 * menu: the world view only (no hand, pocket, or buttons), as a JPEG data
 * URL. Null if the renderer cannot extract (it then keeps the old picture).
 */
export async function captureThumb(renderer: Renderer, view: Container): Promise<string | null> {
  try {
    const url = await renderer.extract.base64({
      target: view,
      frame: new Rectangle(0, 0, VIEW_WIDTH_PX, VIEW_HEIGHT_PX),
      resolution: THUMB_WIDTH / VIEW_WIDTH_PX,
      format: 'jpg',
      quality: 0.82,
    });
    return typeof url === 'string' && url.startsWith('data:image/') ? url : null;
  } catch (err) {
    console.warn('Could not take the slot picture', err);
    return null;
  }
}
