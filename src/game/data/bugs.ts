import type { BugDef } from './types';
import { createRegistry } from './registry';

// Placeholder cast for the foundation demo. The game design doc owns the real
// cast of named bugs.
export const BUGS = createRegistry<BugDef>('bug', [
  {
    id: 'bip',
    name: 'Bip',
    radius: 0.42,
    speed: 1.3,
    body: 0xff4d5e,
    belly: 0xffe0b3,
    spots: 0x2b1b2e,
    antenna: 'curly',
    hidden: false,
    traits: { restless: 0.6, bouncy: 0.7 },
  },
  {
    id: 'gloop',
    name: 'Gloop',
    radius: 0.5,
    speed: 0.8,
    body: 0x7bd84a,
    belly: 0xe8ffb0,
    spots: null,
    antenna: 'straight',
    hidden: false,
    traits: { restless: 0.3, bouncy: 0.4 },
  },
]);
