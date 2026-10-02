import type { ItemArt, ItemDef, ItemShape, MaterialId, WearPerk, WearSlot } from './types';

interface Spec {
  name: string;
  shape: ItemShape;
  material: MaterialId;
  density: number;
  friction?: number;
  restitution?: number;
  art: ItemArt;
  color: number;
  accent: number;
  tags?: readonly string[];
}

/** A wearable: its look, its slot, and what else it does. */
function wearable(
  id: string,
  spec: Spec,
  wear: WearSlot,
  perks: readonly WearPerk[] = [],
  extra: Partial<ItemDef> = {},
): ItemDef {
  return {
    id,
    name: spec.name,
    shape: spec.shape,
    material: spec.material,
    density: spec.density,
    friction: spec.friction ?? 0.6,
    restitution: spec.restitution ?? 0.2,
    art: spec.art,
    color: spec.color,
    accent: spec.accent,
    tags: spec.tags ?? [],
    adverts: [],
    wear,
    ...(perks.length ? { perks } : {}),
    ...extra,
  };
}

const box = (width: number, height: number): ItemShape => ({ type: 'box', width, height });

/**
 * M11's hats and accessories (game design doc, section 7.3): the sixteen
 * the catalog has that M8 did not craft. The rest are in `items8.ts`.
 */
export const M11_ITEMS: readonly ItemDef[] = [
  wearable(
    'item_hat_acorn_cap',
    {
      name: 'Acorn cap',
      shape: box(0.42, 0.26),
      material: 'mat_wood',
      density: 0.6,
      art: 'hat_acorn',
      color: 0x9b6a3c,
      accent: 0x5e3d22,
    },
    'head',
  ),
  wearable(
    'item_hat_party_cone',
    {
      name: 'Party cone',
      shape: box(0.34, 0.5),
      material: 'mat_paper',
      density: 0.4,
      art: 'hat_party',
      color: 0xff5fa2,
      accent: 0xffd23f,
    },
    'head',
    ['horn'],
  ),
  wearable(
    'item_hat_flower_petal',
    {
      name: 'Petal bonnet',
      shape: box(0.5, 0.26),
      material: 'mat_leaf',
      density: 0.3,
      art: 'hat_petal',
      color: 0xff9ec7,
      accent: 0xffe066,
    },
    'head',
    ['flowery'],
  ),
  wearable(
    'item_hat_tiny_top_hat',
    {
      name: 'Tiny top hat',
      shape: box(0.36, 0.42),
      material: 'mat_cloth',
      density: 0.5,
      art: 'hat_top',
      color: 0x2b2438,
      accent: 0xe8453c,
    },
    'head',
  ),
  wearable(
    'item_hat_chef',
    {
      name: 'Chef hat',
      shape: box(0.42, 0.46),
      material: 'mat_cloth',
      density: 0.3,
      art: 'hat_chef',
      color: 0xfdfdf8,
      accent: 0xd8d8e0,
    },
    'head',
    ['chef'],
  ),
  wearable(
    'item_hat_wizard',
    {
      name: 'Wizard hat',
      shape: box(0.46, 0.6),
      material: 'mat_cloth',
      density: 0.4,
      art: 'hat_wizard',
      color: 0x2e3a8c,
      accent: 0xffd23f,
    },
    'head',
    ['night_glow'],
  ),
  wearable(
    'item_hat_candle',
    {
      name: 'Birthday candle hat',
      shape: box(0.3, 0.5),
      material: 'mat_plastic',
      density: 0.7,
      art: 'hat_candle',
      color: 0xff9ec7,
      accent: 0xffd23f,
      tags: ['tag_glowing', 'tag_hot'],
    },
    'head',
    ['glow'],
  ),
  wearable(
    'item_hat_eggshell',
    {
      name: 'Eggshell hat',
      shape: box(0.46, 0.3),
      material: 'mat_shell',
      density: 0.5,
      art: 'hat_eggshell',
      color: 0xfff4e0,
      accent: 0xe0cfb0,
    },
    'head',
    ['fragile'],
    // Rule R11 still holds: a hard knock cracks it into bits.
    { shatters: { into: 'item_eggshell_bit', count: 3, speed: 7 } },
  ),
  wearable(
    'item_hat_goo',
    {
      name: 'Goo hat',
      shape: box(0.44, 0.3),
      material: 'mat_jelly',
      density: 1.1,
      friction: 1,
      restitution: 0.05,
      art: 'hat_goo',
      color: 0x7fa33a,
      accent: 0x556b2f,
      tags: ['tag_smelly', 'tag_slimy'],
    },
    'head',
    ['smelly'],
  ),
  wearable(
    'item_hat_bubble',
    {
      name: 'Bubble helmet',
      shape: box(0.56, 0.52),
      material: 'mat_plastic',
      density: 0.3,
      restitution: 0.5,
      art: 'hat_bubble',
      color: 0xbfe8ff,
      accent: 0xffffff,
    },
    'head',
    ['breathe'],
  ),
  wearable(
    'item_acc_sunglasses',
    {
      name: 'Sunglasses',
      shape: box(0.48, 0.16),
      material: 'mat_plastic',
      density: 0.8,
      art: 'sunglasses',
      color: 0x2b2438,
      accent: 0x6b6280,
    },
    'face',
    ['shades'],
  ),
  wearable(
    'item_acc_mustache',
    {
      name: 'Mustache',
      shape: box(0.4, 0.14),
      material: 'mat_cloth',
      density: 0.4,
      art: 'mustache',
      color: 0x2b2438,
      accent: 0x5a4a5e,
    },
    'face',
    ['deep_voice'],
  ),
  wearable(
    'item_acc_monocle',
    {
      name: 'Monocle',
      shape: box(0.22, 0.3),
      material: 'mat_glass',
      density: 1.2,
      art: 'monocle',
      color: 0xd8b04a,
      accent: 0xbfe8ff,
    },
    'face',
    ['peer'],
  ),
  wearable(
    'item_acc_bowtie_ribbon',
    {
      name: 'Ribbon bow tie',
      shape: box(0.4, 0.2),
      material: 'mat_cloth',
      density: 0.4,
      art: 'bowtie',
      color: 0xe8453c,
      accent: 0xffb3a8,
    },
    'back',
  ),
  wearable(
    'item_acc_scarf_yarn',
    {
      name: 'Yarn scarf',
      shape: box(0.7, 0.14),
      material: 'mat_cloth',
      density: 0.4,
      art: 'scarf',
      color: 0x4d7cff,
      accent: 0xfff4dc,
    },
    'back',
    [],
    { linearDamping: 1.5 },
  ),
  wearable(
    'item_acc_bandaid',
    {
      name: 'Bandage patch',
      shape: box(0.32, 0.12),
      material: 'mat_paper',
      density: 0.4,
      art: 'bandaid',
      color: 0xffb3c6,
      accent: 0xfff0f4,
    },
    'back',
  ),
];

/**
 * Dropped on a bug's head, these become a hat instead of going in its
 * mouth (section 12, `secret_compost_goo_hat`; the porch's eggshell).
 */
export const HEAD_TURNS: Readonly<Record<string, string>> = {
  item_compost_goo: 'item_hat_goo',
  item_eggshell: 'item_hat_eggshell',
};
