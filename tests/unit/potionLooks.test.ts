import { describe, expect, it } from 'vitest';
import { potionLook } from '../../src/renderer/src/render/potionLooks';
import type { EffectView } from '../../src/game/sim';
import type { PotionEffect } from '../../src/game/data/types';
import { POTIONS } from '../../src/game/data/potions';

const fx = (effect: PotionEffect, extra: Partial<EffectView> = {}): EffectView => ({
  effect,
  potion: `potion_${effect}`,
  strength: 1,
  age: 60,
  left: 600,
  ...extra,
});

/** The size the sim gives a bug under each potion (it owns the size; the look draws it). */
const SIM_SCALE: Partial<Record<PotionEffect, number>> = { giant: 2, tiny: 0.5 };

describe('potion looks (review R17)', () => {
  const effects = [...new Set<PotionEffect>([...POTIONS.all.map((p) => p.effect), 'bubbled'])];

  it('gives every potion effect a lasting tell on a bug', () => {
    for (const effect of effects) {
      const look = potionLook([fx(effect)], SIM_SCALE[effect] ?? 1, 1.3);
      const tells =
        look.scale !== 1 ||
        look.tint !== null ||
        look.alpha !== 1 ||
        look.flipY ||
        look.round > 0 ||
        look.wobble > 0 ||
        look.glow !== null ||
        look.trail !== null ||
        look.extras.size > 0 ||
        look.notes !== null ||
        look.squash > 0 ||
        look.boing > 0;
      expect(tells, effect).toBe(true);
    }
  });

  it('shows the four that were hard to see: heavy, speedy, slow-mo, and squeaky', () => {
    const heavy = potionLook([fx('heavy')]);
    expect(heavy.squash).toBeGreaterThan(0.1);
    expect(heavy.extras.has('sweat')).toBe(true);
    expect(potionLook([fx('speedy')]).extras.has('speed_lines')).toBe(true);
    const slow = potionLook([fx('slowmo')]);
    expect(slow.extras.has('clock')).toBe(true);
    expect(slow.extras.has('echo')).toBe(true);
    expect(slow.pace).toBeLessThan(1);
    const squeaky = potionLook([fx('squeaky')]);
    expect(squeaky.extras.has('squeaky')).toBe(true);
    expect(squeaky.notes).not.toBeNull();
    expect(potionLook([fx('bouncy')]).boing).toBeGreaterThan(0);
  });

  it('drips paint in the potion color, and water in blue', () => {
    expect(potionLook([fx('paint', { paint: 'paint_blue' })]).drip).toBe(0x4d7cff);
    expect(potionLook([fx('water')]).extras.has('drips')).toBe(true);
  });

  it('looks plain with no effects', () => {
    const plain = potionLook([]);
    expect(plain.extras.size).toBe(0);
    expect(plain.notes).toBeNull();
    expect(plain.squash).toBe(0);
  });
});
