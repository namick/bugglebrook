import { ImageSource, Texture } from 'pixi.js';
import { artStore } from './artStore';
import type {
  BackdropManifest,
  BackdropPack,
  SkyPalette,
  StripEntry,
  StripLayer,
  WorldStyle,
} from './backdropData';
import { DEFAULT_SKY, DEFAULT_WORLD, parseSky, parseWorld } from './backdropData';

/**
 * The backdrops the game has: each art set's `backdrop.json` (written by
 * `pnpm art:build`) and its strip pictures. The selected set's backdrop is
 * loaded when the set is chosen; `WorldView` redraws the world when
 * `version` moves. A set with no backdrop, or with art switched off, gives
 * `null`: the game's own look. docs/04-architecture.md, "Backdrops".
 */

/** One painted strip, its pictures decoded. */
export interface LoadedStrip {
  entry: StripEntry;
  paint: Texture | null;
  glow: Texture | null;
}

/** A set's backdrop, ready to draw. */
export interface LoadedBackdrop {
  /** The art set it belongs to. */
  id: string;
  /** The set's sky, or null for the game's own. */
  sky: SkyPalette | null;
  /** The set's world style, or null for the game's own colors. */
  world: WorldStyle | null;
  /** Its drawn strips. */
  strips: LoadedStrip[];
}

/** The sky to draw: the backdrop's, or the game's own. */
export const skyOf = (b: LoadedBackdrop | null): SkyPalette => b?.sky ?? DEFAULT_SKY;
/** The world style to draw with: the backdrop's, or the game's own colors. */
export const worldOf = (b: LoadedBackdrop | null): WorldStyle => b?.world ?? DEFAULT_WORLD;
/** A backdrop's drawn strips for one layer. */
export const stripsOf = (b: LoadedBackdrop | null, layer: StripLayer): LoadedStrip[] =>
  b?.strips.filter((s) => s.entry.layer === layer) ?? [];

interface Bundle {
  manifest: BackdropManifest;
  /** Each picture's URL (or data URL), by its path in the manifest. */
  images: Record<string, string>;
}

async function textureFrom(url: string): Promise<Texture> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return new Texture({
    source: new ImageSource({ resource: img, scaleMode: 'linear', label: 'backdrop strip' }),
  });
}

function destroy(b: LoadedBackdrop): void {
  for (const s of b.strips) {
    s.paint?.destroy(true);
    s.glow?.destroy(true);
  }
}

/** The set a bundled file belongs to, from its path under `src/renderer/art`. */
export function setOfPath(path: string): string {
  return /\/art\/sets\/([^/]+)\//.exec(path)?.[1] ?? 'reference';
}

export class BackdropStore {
  /** Bumps whenever the backdrop to draw changes. */
  version = 0;
  private readonly bundles = new Map<string, Bundle>();
  /** The set whose backdrop is wanted now (null: the game's own look). */
  private wanted: string | null = null;
  /** Bumps on every new load, so a slow one that was overtaken is dropped. */
  private loads = 0;
  private loaded: LoadedBackdrop | null = null;
  /** The backdrop just replaced: its pictures are freed a frame later, once the views have let go. */
  private stale: LoadedBackdrop | null = null;
  private pending: Promise<void> | null = null;

  /** The backdrop to draw now, or null for the game's own look. */
  get current(): LoadedBackdrop | null {
    return this.loaded;
  }

  /** Is the wanted backdrop the one in `current`? False while its pictures decode. */
  get ready(): boolean {
    return this.pending === null && (this.loaded?.id ?? null) === this.target();
  }

  /** Has a set got a backdrop at all? */
  has(setId: string): boolean {
    return this.bundles.has(setId);
  }

  /** Register the backdrops bundled with the game (src/renderer/art, built by `pnpm art:build`). */
  loadBundled(): void {
    const manifests = import.meta.glob<BackdropManifest>('../../art/**/backdrop.json', {
      eager: true,
      import: 'default',
    });
    // By URL, not inlined: strips are megabytes, and only the selected set's are ever fetched.
    const urls = import.meta.glob<string>('../../art/**/backdrop/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    });
    for (const [path, manifest] of Object.entries(manifests)) {
      const base = path.slice(0, -'backdrop.json'.length);
      const images: Record<string, string> = {};
      for (const [file, url] of Object.entries(urls))
        if (file.startsWith(base)) images[file.slice(base.length)] = url;
      this.bundles.set(setOfPath(path), { manifest, images });
    }
  }

  /** Install a built backdrop for a set at run time (tests, the review tour). */
  install(setId: string, pack: BackdropPack): void {
    this.bundles.set(setId, { manifest: pack.manifest, images: pack.images });
    // Load it afresh if it is the one showing.
    if (this.wanted === setId) this.wanted = null;
  }

  /** The set whose backdrop should show: the art store's choice, when it has one. */
  private target(): string | null {
    if (artStore.mode !== 'drawn') return null;
    return this.bundles.has(artStore.selection) ? artStore.selection : null;
  }

  /**
   * Follow the art store's choice. Called every frame: it does nothing unless
   * the choice changed, and then loads the new set's pictures before showing it.
   */
  sync(): void {
    if (this.stale) {
      destroy(this.stale);
      this.stale = null;
    }
    const target = this.target();
    if (target === this.wanted) return;
    this.wanted = target;
    const load = ++this.loads;
    if (target === null) {
      this.pending = null;
      this.show(null);
      return;
    }
    this.pending = this.load(target)
      .then((b) => {
        if (load !== this.loads) return destroy(b);
        this.pending = null;
        this.show(b);
      })
      .catch((err: unknown) => {
        console.warn(`Backdrop could not load: ${target}`, err);
        if (load !== this.loads) return;
        this.pending = null;
        this.show(null);
      });
  }

  /** Wait until the wanted backdrop is the one showing. */
  async whenReady(): Promise<void> {
    this.sync();
    while (this.pending) await this.pending;
  }

  private show(b: LoadedBackdrop | null): void {
    if (b === this.loaded) return;
    this.stale = this.loaded;
    this.loaded = b;
    this.version++;
  }

  private async load(setId: string): Promise<LoadedBackdrop> {
    const { manifest, images } = this.bundles.get(setId)!;
    const strips: LoadedStrip[] = [];
    await Promise.all(
      Object.values(manifest.strips).map(async (entry) => {
        if (entry.status !== 'drawn') return;
        const get = async (image: string | undefined): Promise<Texture | null> => {
          const url = image ? images[image] : undefined;
          return url ? textureFrom(url) : null;
        };
        const [paint, glow] = await Promise.all([get(entry.paint?.image), get(entry.glow?.image)]);
        // A strip whose picture is missing is not drawn: the code-drawn art shows there instead.
        if (paint) strips.push({ entry, paint, glow });
        else glow?.destroy(true);
      }),
    );
    strips.sort((a, b) => (a.entry.id < b.entry.id ? -1 : 1));
    return {
      id: setId,
      sky: manifest.sky == null ? null : parseSky(manifest.sky).sky,
      world: manifest.world == null ? null : parseWorld(manifest.world).world,
      strips,
    };
  }
}

/** The game's backdrops. */
export const backdropStore = new BackdropStore();
