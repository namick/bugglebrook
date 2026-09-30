import type { PotionDef } from './types';
import { createRegistry } from './registry';

// Potions arrive in M8 (game design doc, section 9).
export const POTIONS = createRegistry<PotionDef>('potion', []);
