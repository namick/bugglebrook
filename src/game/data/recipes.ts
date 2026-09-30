import type { RecipeDef } from './types';
import { createRegistry } from './registry';

export const RECIPES = createRegistry<RecipeDef>('recipe', [
  { id: 'make_pebble_rattle', inputs: ['pebble', 'bottle_cap'], output: 'pebble_rattle' },
]);
