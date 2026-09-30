import type { AreaDef } from './types';
import { createRegistry } from './registry';

// Placeholder areas for the foundation demo. The game design doc owns the
// real list; keep IDs stable once saves reference them.
export const AREAS = createRegistry<AreaDef>('area', [
  {
    id: 'backyard',
    name: 'Backyard',
    xStart: 0,
    xEnd: 24,
    skyTop: 0x7ec8ff,
    skyBottom: 0xd6f0ff,
    ground: 0x6cc24a,
    groundDark: 0x3f8f2c,
    unlockedByDefault: true,
  },
  {
    id: 'pond',
    name: 'Pond',
    xStart: 24,
    xEnd: 48,
    skyTop: 0x8fd3ff,
    skyBottom: 0xe3f7ff,
    ground: 0x8bc96a,
    groundDark: 0x4f8f3a,
    unlockedByDefault: true,
  },
]);
