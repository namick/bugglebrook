import type { MaterialDef, MaterialId } from './types';

/**
 * Materials (game design doc, section 6). A material sets default physics
 * and default tags. Item defs repeat the physics numbers so an item can
 * differ from its material (a cork is lighter than most wood); the tags
 * here are added to every item made of the material.
 */
export const MATERIALS: Readonly<Record<MaterialId, MaterialDef>> = {
  mat_wood: { density: 0.6, restitution: 0.3, friction: 0.6, tags: ['tag_floaty'] },
  mat_stone: { density: 2.5, restitution: 0.15, friction: 0.7, tags: ['tag_heavy'] },
  mat_metal: { density: 3, restitution: 0.25, friction: 0.4, tags: ['tag_magnetic', 'tag_heavy'] },
  mat_rubber: { density: 1.1, restitution: 0.85, friction: 0.9, tags: ['tag_bouncy'] },
  mat_glass: { density: 2.2, restitution: 0.3, friction: 0.2, tags: ['tag_fragile'] },
  mat_leaf: { density: 0.4, restitution: 0.1, friction: 0.8, tags: ['tag_floaty', 'tag_light', 'tag_leafy'] },
  mat_cloth: { density: 0.5, restitution: 0.05, friction: 0.9, tags: ['tag_light', 'tag_absorbent'] },
  mat_paper: { density: 0.5, restitution: 0.1, friction: 0.7, tags: ['tag_light', 'tag_floaty'] },
  mat_plastic: { density: 0.9, restitution: 0.5, friction: 0.5, tags: ['tag_floaty'] },
  mat_food: { density: 1, restitution: 0.2, friction: 0.6, tags: ['tag_edible'] },
  mat_jelly: { density: 1, restitution: 0.6, friction: 0.95, tags: ['tag_sticky'] },
  mat_shell: { density: 1.2, restitution: 0.35, friction: 0.5, tags: ['tag_fragile'] },
  mat_junk: { density: 1, restitution: 0.3, friction: 0.8, tags: [] },
};
