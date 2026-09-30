import type { SecretDef } from './types';
import { createRegistry } from './registry';

// Secrets arrive in M10 (game design doc, section 12).
export const SECRETS = createRegistry<SecretDef>('secret', []);
