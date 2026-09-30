import { Texture } from 'pixi.js';

/**
 * Soft textures drawn once on a canvas: gradients for the sky, and the
 * round and cone-shaped glows that lights add at night. White, so a tint
 * colors them.
 */
const cache = new Map<string, Texture>();

function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

/** A vertical white gradient, top to bottom: stops are [offset, alpha]. */
export function gradientTexture(stops: readonly [number, number][]): Texture {
  const key = `g${JSON.stringify(stops)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = canvas(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = Texture.from(c);
  cache.set(key, tex);
  return tex;
}

/** A round glow: bright in the middle, fading to nothing at the edge. 256 px across. */
export function glowTexture(): Texture {
  const hit = cache.get('glow');
  if (hit) return hit;
  const { c, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = Texture.from(c);
  cache.set('glow', tex);
  return tex;
}

/** A cone of light pointing right from its left middle, 256 by 128 px. */
export function coneTexture(): Texture {
  const hit = cache.get('cone');
  if (hit) return hit;
  const { c, ctx } = canvas(256, 128);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.lineTo(256, 0);
  ctx.lineTo(256, 128);
  ctx.lineTo(0, 70);
  ctx.closePath();
  ctx.filter = 'blur(6px)';
  ctx.fill();
  const tex = Texture.from(c);
  cache.set('cone', tex);
  return tex;
}
