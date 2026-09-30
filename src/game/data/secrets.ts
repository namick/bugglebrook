import type { SecretDef } from './types';
import { createRegistry } from './registry';

export const SECRETS = createRegistry<SecretDef>('secret', [
  {
    id: 'bip_bottle_cap_hat',
    name: 'Cap hat',
    trigger: { type: 'bug_holds_item', bug: 'bip', item: 'bottle_cap', area: 'backyard' },
    unlocks: [{ kind: 'area', id: 'pond' }],
  },
]);
