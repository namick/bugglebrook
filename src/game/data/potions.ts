import type { PotionDef, PotionEffect, EssenceId, Color } from './types';
import { createRegistry } from './registry';
import { SIM_HZ } from '../core/loop';

/** Potions last a minute by default (game design doc, section 9). */
export const POTION_SECONDS = 60;

/** One row of the potion table: name, color, essences, and anything unusual about it. */
function potion(
  effect: PotionEffect,
  name: string,
  color: Color,
  recipe: readonly EssenceId[],
  options: { seconds?: number; onItems?: boolean } = {},
): PotionDef {
  return {
    id: `potion_${effect}`,
    name,
    color,
    effect,
    recipe,
    durationTicks: (options.seconds ?? POTION_SECONDS) * SIM_HZ,
    bottle: `item_potion_${effect}`,
    onItems: options.onItems ?? false,
  };
}

// The potion outcomes (game design doc, section 9). A one-essence recipe is
// that essence's base potion; pairs and triples are the special table.
// Rainbow, wobble, sludge, and plain water come from rules, not recipes.
export const POTIONS = createRegistry<PotionDef>('potion', [
  potion('giant', 'Giant potion', 0xff6b5b, ['ess_grow'], { onItems: true }),
  potion('tiny', 'Tiny potion', 0x7fd4ff, ['ess_shrink'], { onItems: true }),
  potion('floaty', 'Floaty potion', 0xc9f2ff, ['ess_float'], { onItems: true }),
  potion('balloon', 'Balloon potion', 0xff8fc8, ['ess_inflate']),
  potion('glow', 'Glow potion', 0xfff27a, ['ess_glow'], { onItems: true }),
  potion('paint', 'Paint potion', 0xe8453c, ['ess_color'], { onItems: true }),
  potion('rainbow', 'Rainbow potion', 0xb36bff, []),
  potion('sticky_feet', 'Sticky feet potion', 0xf0a530, ['ess_sticky'], { onItems: true }),
  potion('burp', 'Burp potion', 0x9be86b, ['ess_fizz']),
  potion('bubble', 'Bubble potion', 0xa8e6ff, ['ess_soap']),
  potion('bubble_burp', 'Bubble burp potion', 0x6be3d9, ['ess_soap', 'ess_fizz']),
  potion('fire_breath', 'Fire breath potion', 0xff7a1f, ['ess_hot']),
  potion('frosty', 'Frosty potion', 0xbfe9ff, ['ess_cold']),
  potion('heavy', 'Heavy potion', 0x6b6f8a, ['ess_heavy'], { onItems: true }),
  potion('bouncy', 'Bouncy potion', 0xff5fa2, ['ess_bounce'], { onItems: true }),
  potion('speedy', 'Speedy potion', 0xffd23f, ['ess_speed']),
  potion('slowmo', 'Slow-mo potion', 0x8c7ae6, ['ess_slow']),
  potion('stinky', 'Stinky potion', 0x8fae3a, ['ess_stink']),
  potion('sleepy', 'Sleepy potion', 0x9d8cff, ['ess_sleep'], { seconds: 20 }),
  potion('opera', 'Opera potion', 0x4d7cff, ['ess_sound']),
  potion('squeaky', 'Squeaky potion', 0xffb3e6, ['ess_inflate', 'ess_sound']),
  potion('upside_down', 'Upside-down potion', 0x3b3f8f, ['ess_moon']),
  potion('copycat', 'Copycat potion', 0xd9dee8, ['ess_mirror']),
  potion('hairy', 'Hairy potion', 0xa0704a, ['ess_hair']),
  potion('magnet', 'Magnet potion', 0xe34f4f, ['ess_magnet'], { onItems: true }),
  potion('ghost', 'Ghost potion', 0xeef4ff, ['ess_glow', 'ess_float', 'ess_mirror']),
  potion('rocket', 'Rocket potion', 0xff4f3b, ['ess_fizz', 'ess_speed'], { seconds: 12 }),
  potion('snowball', 'Snowball potion', 0xf4fbff, ['ess_cold', 'ess_bounce']),
  potion('wings', 'Wings potion', 0xff9ff3, ['ess_float', 'ess_color', 'ess_sticky']),
  potion('jelly', 'Jelly potion', 0x4fe3a0, ['ess_sticky', 'ess_bounce']),
  potion('wobble', 'Wobble potion', 0xd36bff, []),
  potion('sludge', 'Sludge', 0x6b7a2b, [], { seconds: 10 }),
  potion('water', 'Clear water', 0xdff4ff, [], { seconds: 2 }),
]);
