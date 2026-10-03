import type { ArtPack } from './artStore';
import { artStore } from './artStore';

// Hot reload for `pnpm art:watch`: the dev server's art plugin (scripts/art/
// vitePlugin.ts) rebuilds a bug when its .ora is saved and sends the result
// here. Bugs swap to the new drawing in place; the sim never notices.
// Production builds have no `import.meta.hot`, so none of this ships.
if (import.meta.hot) {
  import.meta.hot.on('bb:art-changed', ({ pack, setId }: { pack: ArtPack; setId: string }) => {
    void artStore.install(pack, setId).then(() => {
      console.info(`Art reloaded: ${pack.assets.map((a) => `${a.id} (${a.status})`).join(', ')}`);
    });
  });
}
