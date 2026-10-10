import type { Texture } from 'pixi.js';
import type { AtlasSet } from './artStore';
import { artStore, atlasSet, sourceFrom } from './artStore';
import type { ItemManifest, ItemPack, ManifestItemSheet } from './itemSheet';
import type { AtlasJson } from './rigFile';

/**
 * The hand-painted items the game has, by art set: what `pnpm art:build`
 * makes from each set's item sheets (docs/06-art-guide.md, B21). An item a
 * set has not painted stays code-drawn, one item at a time.
 */

/** One painted item at one scale. */
export interface ItemFrame {
  texture: Texture;
  /** The body's center as a fraction of the frame. */
  anchor: { x: number; y: number };
}

export interface LoadedItem {
  /** The sheet it was painted on. */
  sheet: string;
  scales: Partial<Record<1 | 2, ItemFrame>>;
}

export class ItemArtBook {
  private readonly sets = new Map<string, Map<string, LoadedItem>>();
  private readonly entries = new Map<string, Map<string, ManifestItemSheet>>();

  /** `changed` runs whenever a sheet is added or replaced, so views can swap their drawings. */
  constructor(private readonly changed: () => void = () => undefined) {}

  /** A set's painting of an item, or null when the set has not painted it. */
  get(setId: string, itemId: string): LoadedItem | null {
    return this.sets.get(setId)?.get(itemId) ?? null;
  }

  /** The item IDs a set has painted. */
  painted(setId: string): string[] {
    return [...(this.sets.get(setId)?.keys() ?? [])];
  }

  /** A sheet's entry as the importer wrote it (its status and report). */
  sheet(setId: string, sheetId: string): ManifestItemSheet | null {
    return this.entries.get(setId)?.get(sheetId) ?? null;
  }

  /** Add (or replace) a sheet whose pages are already textures. */
  put(setId: string, entry: ManifestItemSheet, atlases: Partial<Record<1 | 2, AtlasSet>>): void {
    let items = this.sets.get(setId);
    if (!items) this.sets.set(setId, (items = new Map()));
    let entries = this.entries.get(setId);
    if (!entries) this.entries.set(setId, (entries = new Map()));
    // A sheet saved again may have fewer items than before: drop its old ones first.
    for (const [id, item] of items) if (item.sheet === entry.id) items.delete(id);
    entries.set(entry.id, entry);
    for (const id of entry.items) {
      const loaded: LoadedItem = { sheet: entry.id, scales: {} };
      for (const scale of [1, 2] as const) {
        const set = atlases[scale];
        const texture = set?.frames.get(id);
        if (!set || !texture) continue;
        loaded.scales[scale] = { texture, anchor: set.anchors.get(id)! };
      }
      if (loaded.scales[1] || loaded.scales[2]) items.set(id, loaded);
    }
    this.changed();
  }

  /** Install built sheets: decode their pages and swap them in. */
  async install(pack: ItemPack, setId: string): Promise<void> {
    for (const entry of pack.sheets) {
      const atlases: Partial<Record<1 | 2, AtlasSet>> = {};
      for (const scale of [1, 2] as const) {
        const set: AtlasSet = { scale, frames: new Map(), anchors: new Map() };
        let complete = true;
        for (const page of entry.pages[String(scale) as '1' | '2']) {
          const p = pack.pages[page];
          if (!p) {
            complete = false;
            break;
          }
          atlasSet(await sourceFrom(p.png), p.json, set);
        }
        if (complete && set.frames.size) atlases[scale] = set;
      }
      this.put(setId, entry, atlases);
    }
  }

  /** Load the item art bundled with the game (src/renderer/art, built by `pnpm art:build`). */
  async loadBundled(): Promise<void> {
    const manifests = import.meta.glob<ItemManifest>('../../art/**/items/manifest.json', {
      eager: true,
      import: 'default',
    });
    const jsons = import.meta.glob<AtlasJson>('../../art/**/items/*@*.json', {
      eager: true,
      import: 'default',
    });
    const pngs = import.meta.glob<string>('../../art/**/items/*.png', {
      query: '?inline',
      import: 'default',
    });
    for (const { setId, base, entry } of bundledSheets(manifests)) {
      try {
        const pages: ItemPack['pages'] = {};
        for (const page of [...entry.pages['1'], ...entry.pages['2']]) {
          const json = jsons[`${base}${page}.json`];
          const png = pngs[`${base}${page}.png`];
          if (json && png) pages[page] = { json, png: await png() };
        }
        await this.install({ sheets: [entry], pages }, setId);
      } catch (err) {
        console.warn(`Item art could not load: ${setId}/${entry.id}`, err);
      }
    }
  }
}

/**
 * Every bundled sheet with the set it belongs to and the folder its page
 * paths start from. The reference set's files sit at the top of the art
 * folder; every other set's are under `sets/<id>/`. Pure.
 */
export function bundledSheets(
  manifests: Readonly<Record<string, ItemManifest>>,
): { setId: string; base: string; entry: ManifestItemSheet }[] {
  const out: { setId: string; base: string; entry: ManifestItemSheet }[] = [];
  for (const path of Object.keys(manifests).sort()) {
    const m = /^(.*?\/art\/(?:sets\/([^/]+)\/)?)items\/manifest\.json$/.exec(path);
    if (!m) continue;
    for (const entry of Object.values(manifests[path]!.sheets))
      out.push({ setId: m[2] ?? 'reference', base: m[1]!, entry });
  }
  return out;
}

/** The game's item art. A new sheet bumps the art version, so every view swaps to it. */
export const itemArtBook = new ItemArtBook(() => {
  artStore.version++;
});
