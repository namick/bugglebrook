import type { SecretDef } from './types';
import { createRegistry } from './registry';

// Secrets (game design doc, section 12). The journal that lists them comes
// in M10; for now the sim logs each one the first time it is found
// (`sim.secrets`, `secret_found`). M6 brings the ones that hang on the time
// of day: the sundial, the sun, the knothole, the moonlit teacup, and the
// fireflies.
export const SECRETS = createRegistry<SecretDef>('secret', [
  {
    id: 'secret_sundial_midnight',
    name: 'Midnight on the sundial',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_sun_shades',
    name: 'Sun shades',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_stump_eyes',
    name: 'Eyes in the stump',
    trigger: { type: 'scripted', area: 'area_stump_plaza' },
    unlocks: [],
  },
  {
    id: 'secret_moon_pebble',
    name: 'Moon pebble',
    trigger: { type: 'scripted', area: 'area_puddle_pond' },
    unlocks: [{ kind: 'item', id: 'item_moon_pebble' }],
  },
  {
    id: 'secret_firefly_flick',
    name: 'Flick the firefly',
    trigger: { type: 'scripted', area: 'area_puddle_pond' },
    unlocks: [{ kind: 'bug', id: 'bug_firefly_flick' }],
  },
]);
