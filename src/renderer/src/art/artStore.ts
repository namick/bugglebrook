import type { TextureSource } from 'pixi.js';
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import type { BugDef } from '../../../game/data/types';
import { FACE_KIT_ID } from './kit';
import type { ArtPack, AtlasJson, Manifest, ManifestAsset } from './rigFile';

export type { ArtPack };

/**
 * The hand-drawn art the game has: the manifest written by `pnpm art:build`,
 * and the atlas pages, turned into textures. Bugs with complete, valid art
 * are drawn from it (SpriteBugView); the rest stay code-drawn. Hot reload
 * (`pnpm art:watch`) and the test hook install new art at run time.
 */

export type ArtMode = 'drawn' | 'code';

/** One asset's textures at one scale. */
export interface AtlasSet {
  scale: 1 | 2;
  frames: Map<string, Texture>;
  /** The pivot as a fraction of each frame. */
  anchors: Map<string, { x: number; y: number }>;
}

export interface LoadedArt {
  entry: ManifestAsset;
  scales: Partial<Record<1 | 2, AtlasSet>>;
}

/** Cut a page's frames into textures. */
export function atlasSet(source: TextureSource, json: AtlasJson, into?: AtlasSet): AtlasSet {
  const set: AtlasSet = into ?? { scale: json.meta.scale as 1 | 2, frames: new Map(), anchors: new Map() };
  for (const [name, f] of Object.entries(json.frames)) {
    set.frames.set(
      name,
      new Texture({ source, frame: new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h), label: name }),
    );
    set.anchors.set(name, f.anchor);
  }
  return set;
}

async function sourceFrom(url: string): Promise<TextureSource> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return new ImageSource({
    resource: img,
    scaleMode: 'linear',
    autoGenerateMipmaps: true,
    label: 'art page',
  });
}

export class ArtStore {
  /** Tests start code-drawn so existing tests don't change; players see drawn art. */
  mode: ArtMode = 'drawn';
  /** Bumps whenever art or the mode changes: views rebuild their bugs. */
  version = 0;
  private readonly assets = new Map<string, LoadedArt>();
  private readonly listeners = new Set<(id: string) => void>();

  /** Called with an asset's ID when its art changes (hot reload). */
  onChange(fn: (id: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMode(mode: ArtMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.version++;
  }

  get(id: string): LoadedArt | null {
    return this.assets.get(id) ?? null;
  }

  /** The face kit, if any of it is drawn. */
  kit(): LoadedArt | null {
    const k = this.assets.get(FACE_KIT_ID);
    return k && k.entry.status === 'drawn' && this.mode === 'drawn' ? k : null;
  }

  /** Add (or replace) an asset whose pages are already textures. */
  put(art: LoadedArt): void {
    this.assets.set(art.entry.id, art);
    this.version++;
    for (const fn of this.listeners) fn(art.entry.id);
  }

  /** Install built art: decode its pages and swap it in. */
  async install(pack: ArtPack): Promise<void> {
    for (const entry of pack.assets) {
      const art: LoadedArt = { entry, scales: {} };
      for (const scale of [1, 2] as const) {
        const set: AtlasSet = { scale, frames: new Map(), anchors: new Map() };
        for (const page of entry.pages[String(scale) as '1' | '2']) {
          const p = pack.pages[page];
          if (!p) continue;
          atlasSet(await sourceFrom(p.png), p.json, set);
        }
        if (set.frames.size) art.scales[scale] = set;
      }
      this.put(art);
    }
  }

  /** Load the art bundled with the game (src/renderer/art, built by `pnpm art:build`). */
  async loadBundled(): Promise<void> {
    const manifests = import.meta.glob<Manifest>('../../art/manifest.json', {
      eager: true,
      import: 'default',
    });
    const jsons = import.meta.glob<AtlasJson>('../../art/**/*@*.json', { eager: true, import: 'default' });
    const pngs = import.meta.glob<string>('../../art/**/*.png', { query: '?inline', import: 'default' });
    const manifest = Object.values(manifests)[0];
    if (!manifest) return;
    const pages: ArtPack['pages'] = {};
    const assets = Object.values(manifest.assets);
    for (const entry of assets) {
      for (const page of [...entry.pages['1'], ...entry.pages['2']]) {
        const json = jsons[`../../art/${page}.json`];
        const png = pngs[`../../art/${page}.png`];
        if (json && png) pages[page] = { json, png: await png() };
      }
    }
    await this.install({ assets, pages });
  }

  /**
   * Whether a bug is drawn from art, and why not when it isn't. Art is used
   * only when it validated and every required part is there: a bug is never
   * half code-drawn and half hand-drawn.
   */
  status(def: BugDef): { drawn: boolean; reason: string } {
    if (this.mode === 'code') return { drawn: false, reason: 'art is switched off' };
    const art = this.assets.get(def.id);
    if (!art) return { drawn: false, reason: 'no art file' };
    const e = art.entry;
    if (e.status === 'empty') return { drawn: false, reason: 'nothing drawn yet' };
    if (e.status === 'broken') {
      const first = e.report.find((m) => m.level === 'error');
      return { drawn: false, reason: `the file has problems: ${first?.text ?? 'see the report'}` };
    }
    if (!art.scales[1] && !art.scales[2]) return { drawn: false, reason: 'its atlas pages are missing' };
    return { drawn: true, reason: 'drawn from art' };
  }
}

/** The game's art. */
export const artStore = new ArtStore();
