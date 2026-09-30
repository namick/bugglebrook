import type { ItemDef } from './types';
import { createRegistry } from './registry';

export const ITEMS = createRegistry<ItemDef>('item', [
  {
    id: 'pebble',
    name: 'Pebble',
    shape: { type: 'circle', radius: 0.28 },
    density: 2.5,
    friction: 0.6,
    restitution: 0.35,
    color: 0xb9b3c9,
    accent: 0xe6e2f0,
    tags: ['stone', 'round'],
  },
  {
    id: 'matchbox',
    name: 'Matchbox',
    shape: { type: 'box', width: 0.9, height: 0.55 },
    density: 0.8,
    friction: 0.7,
    restitution: 0.15,
    color: 0xff9f1c,
    accent: 0xfff1d0,
    tags: ['box', 'stackable'],
  },
  {
    id: 'bottle_cap',
    name: 'Bottle cap',
    shape: { type: 'box', width: 0.55, height: 0.18 },
    density: 1.6,
    friction: 0.5,
    restitution: 0.3,
    color: 0x2ec4b6,
    accent: 0xcbf3f0,
    tags: ['metal', 'flat'],
  },
  {
    id: 'pebble_rattle',
    name: 'Pebble rattle',
    shape: { type: 'box', width: 0.55, height: 0.4 },
    density: 1.8,
    friction: 0.5,
    restitution: 0.4,
    color: 0x9b5de5,
    accent: 0xf1e3ff,
    tags: ['toy', 'noisy'],
  },
]);
