export const ID_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export interface Registry<T extends { id: string }> {
  readonly kind: string;
  readonly all: readonly T[];
  get(id: string): T;
  tryGet(id: string): T | undefined;
  has(id: string): boolean;
}

/**
 * Wrap a list of definitions for lookup by ID. Duplicate IDs are not thrown
 * here; `validateContent` reports them so tests can list every problem at
 * once. `get` throws on unknown IDs, `tryGet` does not.
 */
export function createRegistry<T extends { id: string }>(kind: string, defs: readonly T[]): Registry<T> {
  const byId = new Map<string, T>();
  for (const def of defs) if (!byId.has(def.id)) byId.set(def.id, def);
  return {
    kind,
    all: defs,
    get(id) {
      const def = byId.get(id);
      if (!def) throw new Error(`Unknown ${kind} id: ${id}`);
      return def;
    },
    tryGet: (id) => byId.get(id),
    has: (id) => byId.has(id),
  };
}
