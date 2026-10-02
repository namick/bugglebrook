import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { artWatchPlugin } from './scripts/art/vitePlugin.ts';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preloads must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    // `pnpm art:watch`: rebuild the artist's saved .ora files and hot-swap them in (dev only).
    plugins: [artWatchPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } },
      chunkSizeWarningLimit: 2000,
    },
  },
});
