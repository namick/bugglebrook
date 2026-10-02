import { CONTENT } from '../../../game/data';
import type { BugDef, ItemDef } from '../../../game/data/types';
import type { ItemArt } from '../render/draw/item';
import { BugSprite } from '../render/draw/bug';
import type { ArtStore } from './artStore';
import { artStore } from './artStore';
import { SpriteBugView } from './spriteBug';

/** A view for a bug: drawn from the artist's parts when its art is complete, else code-drawn. */
export function makeBugView(def: BugDef, store: ArtStore = artStore): BugSprite {
  const art = store.get(def.id);
  if (!art || !store.status(def).drawn) return new BugSprite(def);
  return new SpriteBugView(def, art, store.kit());
}

/**
 * Hand-drawn art for an item, or null to draw it in code. Only the twig so
 * far: when Twig is drawn from art, the twig item uses his `stick` drawing,
 * so his disguise still matches (docs/06-art-guide.md, B7).
 */
export function itemArt(def: ItemDef, store: ArtStore = artStore): ItemArt | null {
  if (def.art !== 'twig') return null;
  const twig = CONTENT.bugs.all.find((b) => b.art === 'stickinsect');
  if (!twig || !store.status(twig).drawn) return null;
  const art = store.get(twig.id)!;
  const want = SpriteBugView.forceScale ?? (SpriteBugView.resolution > 1.25 ? 2 : 1);
  const set = art.scales[want] ?? art.scales[1] ?? art.scales[2];
  const texture = set?.frames.get('stick');
  if (!set || !texture) return null;
  const rim = set.frames.get('stick@rim');
  return {
    texture,
    anchor: set.anchors.get('stick')!,
    k: 1 / set.scale,
    rim: rim ? { texture: rim, anchor: set.anchors.get('stick@rim')! } : null,
  };
}
