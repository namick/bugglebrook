import type { RecipeDef } from './types';
import { createRegistry } from './registry';

// Crafting arrives in M8 (game design doc, section 8).
export const RECIPES = createRegistry<RecipeDef>('recipe', []);
