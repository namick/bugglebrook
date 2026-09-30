// Pixi compiles shaders with `new Function` unless this polyfill is loaded,
// which our Content-Security-Policy (no unsafe-eval) would block.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { VIEW_HEIGHT_PX, VIEW_WIDTH_PX } from '../../game/constants';
import { Game } from './app/game';
import { memoryApi } from './app/memorySaves';
import { WebAudioBackend } from './audio/synth';
import { installTestHook } from './debug/testHook';
import { fitViewport } from './render/viewport';

function isSoftwareRenderer(app: Application): boolean {
  const gl = (app.renderer as { gl?: WebGLRenderingContext }).gl;
  if (!gl) return false;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /swiftshader|llvmpipe|software/i.test(name);
}

async function boot(): Promise<void> {
  const api = window.bugglebrook ?? memoryApi();
  const app = new Application();
  await app.init({
    width: VIEW_WIDTH_PX,
    height: VIEW_HEIGHT_PX,
    antialias: true,
    background: 0x7ec8ff,
    autoDensity: false,
    preference: 'webgl',
  });
  const canvas = app.canvas;
  // Software WebGL (CI under xvfb, VMs) is fill-rate bound: render fewer pixels there.
  const software = isSoftwareRenderer(app);
  canvas.id = 'game';
  document.body.appendChild(canvas);

  // Keep a fixed 1920x1080 logical stage, letterboxed and scaled to the
  // window, rendering at the real pixel density so edges stay crisp.
  const resize = (): void => {
    const fit = fitViewport(window.innerWidth, window.innerHeight, VIEW_WIDTH_PX, VIEW_HEIGHT_PX);
    const resolution = software ? 0.5 : Math.min(2, fit.scale * window.devicePixelRatio);
    app.renderer.resize(VIEW_WIDTH_PX, VIEW_HEIGHT_PX, resolution);
    Object.assign(canvas.style, {
      width: `${fit.width}px`,
      height: `${fit.height}px`,
      left: `${fit.left}px`,
      top: `${fit.top}px`,
    });
  };
  window.addEventListener('resize', resize);
  resize();

  const game = new Game(app, api, new WebAudioBackend());
  game.softwareRenderer = software;
  if (api.testMode) installTestHook(game);
  await game.start();
}

boot().catch((err: unknown) => {
  console.error('Failed to start', err);
});
