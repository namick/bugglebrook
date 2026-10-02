import type { ItemDef } from './types';

/**
 * Things added for the playtest's tidy-up feedback (F2). The tidy whistle
 * hangs by the trash can in the plaza: a click blows it, and loose things in
 * view that have wandered from home swoosh back there.
 */
export const TIDY_ITEMS: readonly ItemDef[] = [
  {
    id: 'item_tidy_whistle',
    name: 'Tidy whistle',
    shape: { type: 'box', width: 0.62, height: 0.3 },
    material: 'mat_plastic',
    density: 0.9,
    friction: 0.6,
    restitution: 0.3,
    angularDamping: 3,
    art: 'whistle',
    color: 0xffc928,
    accent: 0xe8453c,
    tags: [],
    adverts: [],
    fixedSize: true,
    whistle: true,
  },
];
