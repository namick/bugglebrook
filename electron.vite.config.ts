import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { artWatchPlugin } from './scripts/art/vitePlugin.ts';

// A build for a store that updates games itself (Steam) leaves the
// auto-updater out: `electron-vite build --mode steam`, or set
// BUGGLEBROOK_UPDATER=off. See docs/09-steam-readiness.md.
export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __BB_UPDATER__: JSON.stringify(mode !== 'steam' && process.env.BUGGLEBROOK_UPDATER !== 'off'),
    },
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
}));
