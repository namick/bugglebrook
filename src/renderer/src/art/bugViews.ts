import type { BugDef } from '../../../game/data/types';
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
