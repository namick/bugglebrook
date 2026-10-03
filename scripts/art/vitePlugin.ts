// The dev server half of `pnpm art:watch` (docs/06-art-guide.md, B9): when an
// .ora is saved, rebuild it, print the report, and send the new art to the
// running game over Vite's HMR socket. The game swaps it in without a reload.
// Only active in `electron-vite dev` with BB_ART_LAB=1.

import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { ArtPack, RigFile } from '../../src/renderer/src/art/rigFile.ts';
import { readFileSync, existsSync } from 'node:fs';
import {
  OUT_DIR,
  ROOT,
  SRC_DIR,
  buildSets,
  buildAsset,
  findSources,
  formatReport,
  toArtPack,
  writeBuild,
} from './build.ts';
import { setSource } from './sets.ts';
import { watchArt } from './watch.ts';

/** Rebuild some assets from a source folder: the pack for the game and the report for the terminal. */
export function rebuild(srcDir: string, ids: readonly string[]): { pack: ArtPack; report: string } {
  const sources = findSources(srcDir).filter((s) => ids.includes(s.id) && existsSync(s.rig));
  const built = sources.map((s) =>
    buildAsset(new Uint8Array(readFileSync(s.ora)), JSON.parse(readFileSync(s.rig, 'utf8')) as RigFile),
  );
  const report = built.map((b) => formatReport(b.entry.id, b.messages)).join('\n');
  return { pack: toArtPack(built), report };
}

export function artWatchPlugin(): Plugin {
  const on = process.env.BB_ART_LAB === '1';
  const external = process.env.BB_ART_SRC ? resolve(process.env.BB_ART_SRC) : null;
  const setId = process.env.BB_ART_SET ?? 'reference';
  const srcDir = external ?? setSource(SRC_DIR, setId);
  return {
    name: 'bugglebrook-art-watch',
    apply: 'serve',
    config: () =>
      on
        ? // The importer writes generated files: don't let Vite reload the page for them.
          { server: { watch: { ignored: [`${OUT_DIR}/**`, `${ROOT}/art/**`] } } }
        : {},
    configureServer(server) {
      if (!on) return;
      console.log(`\nArt Lab: watching ${srcDir} for saved .ora files.\n`);
      const stop = watchArt(srcDir, (ids) => {
        try {
          const { pack, report } = rebuild(srcDir, ids);
          console.log(`\n${report}`);
          // Files in art/src are the record: keep the committed atlases in step with them.
          if (!external) writeBuild(buildSets());
          server.ws.send({ type: 'custom', event: 'bb:art-changed', data: { pack, setId } });
          console.log(`Sent to the game: ${ids.join(', ')}`);
        } catch (err) {
          console.error('Art rebuild failed:', err);
        }
      });
      server.httpServer?.on('close', stop);
    },
  };
}
