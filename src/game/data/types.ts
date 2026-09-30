/**
 * Content definition types. All content lives in typed registries keyed by
 * snake_case IDs. Definitions are plain data: no functions, no classes.
 */

/** 0xRRGGBB color. */
export type Color = number;

export interface AreaDef {
  id: string;
  name: string;
  /** Left edge in world meters. Areas tile the world left to right. */
  xStart: number;
  /** Right edge in world meters. */
  xEnd: number;
  skyTop: Color;
  skyBottom: Color;
  ground: Color;
  groundDark: Color;
  unlockedByDefault: boolean;
}

export interface BugDef {
  id: string;
  name: string;
  /** Collision radius in meters. */
  radius: number;
  /** Walking speed in meters per second. */
  speed: number;
  body: Color;
  belly: Color;
  spots: Color | null;
  antenna: 'curly' | 'straight' | 'none';
  /** Hidden bugs start locked and are found through secrets. */
  hidden: boolean;
  /** Personality knobs that the AI reads. 0 to 1. */
  traits: { restless: number; bouncy: number };
}

export type ItemShape = { type: 'circle'; radius: number } | { type: 'box'; width: number; height: number };

export interface ItemDef {
  id: string;
  name: string;
  shape: ItemShape;
  density: number;
  friction: number;
  restitution: number;
  color: Color;
  accent: Color;
  tags: readonly string[];
}

export interface RecipeDef {
  id: string;
  /** Two item IDs, order-insensitive. */
  inputs: readonly [string, string];
  output: string;
}

export interface PotionDef {
  id: string;
  name: string;
  color: Color;
  effect: 'float' | 'grow' | 'shrink' | 'stink' | 'paint';
  /** Duration in sim ticks. */
  durationTicks: number;
}

export type SecretTrigger =
  | { type: 'bug_holds_item'; bug: string; item: string; area: string }
  | { type: 'recipe'; recipe: string }
  | { type: 'potion_on_bug'; potion: string; bug: string };

export interface SecretDef {
  id: string;
  name: string;
  trigger: SecretTrigger;
  /** Content unlocked when found. */
  unlocks: readonly { kind: 'bug' | 'area' | 'item'; id: string }[];
}
