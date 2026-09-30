/**
 * Commands are the only way input changes the sim. They are plain data so
 * they can be logged, replayed, and injected by E2E tests.
 * Coordinates are world meters.
 */
export type Command =
  | { type: 'grab'; x: number; y: number }
  | { type: 'drag'; x: number; y: number }
  | { type: 'release' }
  | { type: 'spawn'; kind: 'bug' | 'item'; defId: string; x: number; y: number };

export type CommandType = Command['type'];
