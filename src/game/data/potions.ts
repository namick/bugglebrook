import type { PotionDef } from './types';
import { createRegistry } from './registry';

export const POTIONS = createRegistry<PotionDef>('potion', [
  { id: 'fizzy_float', name: 'Fizzy float', color: 0x9bf6ff, effect: 'float', durationTicks: 600 },
]);
