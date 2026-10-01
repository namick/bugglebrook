import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

/** The page's real size in CSS pixels. The window may be smaller than asked for (a HiDPI screen, a tiling manager). */
export async function screenSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
}

/**
 * A screenshot clip around the world box from (x0, y0) to (x1, y1) meters,
 * kept on the page (at least 40 px a side), in the CSS pixels Playwright
 * clips in. On a 2x display the image comes out at twice that.
 */
export async function worldClip(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const [a, b] = await page.evaluate(
    ([ax, ay, bx, by]) => [window.__bb!.worldToClient(ax!, ay!), window.__bb!.worldToClient(bx!, by!)],
    [x0, y0, x1, y1],
  );
  const size = await screenSize(page);
  const left = Math.max(0, Math.min(size.width - 40, a!.x));
  const top = Math.max(0, Math.min(size.height - 40, a!.y));
  const right = Math.max(left + 40, Math.min(size.width, b!.x));
  const bottom = Math.max(top + 40, Math.min(size.height, b!.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The launcher draws at a tiny resolution on a software renderer, which
 * makes staging a tour quick. This puts full resolution back for each
 * screenshot only: draw two frames sharp, take the picture, go back.
 *
 * A clipped screenshot is taken whole and cropped here. Playwright's own
 * clip resizes the page for a moment, which drops the hand's hover (the
 * pocket tray shut in its close-up), and a crop by the image's real scale
 * stays right on a 2x display.
 */
export function sharpShots(page: Page): void {
  const take = page.screenshot.bind(page);
  page.screenshot = (async (options: Parameters<Page['screenshot']>[0] = {}) => {
    await page.evaluate(async () => {
      window.__bb!.liteRender(false);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    });
    try {
      const { clip, path, ...rest } = options;
      if (!clip) return await take(options);
      const whole = await take(rest);
      const image = await loadImage(whole);
      const scale = image.width / (await screenSize(page)).width;
      const w = Math.max(1, Math.round(clip.width * scale));
      const h = Math.max(1, Math.round(clip.height * scale));
      const canvas = createCanvas(w, h);
      canvas.getContext('2d').drawImage(image, clip.x * scale, clip.y * scale, w, h, 0, 0, w, h);
      const png = canvas.toBuffer('image/png');
      if (path) writeFileSync(path, png);
      return png;
    } finally {
      await page.evaluate(() => window.__bb!.liteRender(true));
    }
  }) as Page['screenshot'];
}
