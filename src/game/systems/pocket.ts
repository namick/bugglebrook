import type { EntityId } from '../core/entities';

/**
 * The pocket tray (game design doc, section 2): six slots that carry items
 * and bugs between areas. Things in the pocket are out of the world: their
 * bodies are switched off, bugs sit in `st_pocketed` with their needs
 * frozen, and tag timers pause. Identical `tag_stackable` items stack up to
 * nine in a slot. Dropping onto a slot that cannot take the thing swaps:
 * whatever was there pops out at the hand.
 *
 * This module is the pure slot logic. `Sim` moves the bodies.
 */
export const POCKET_SLOTS = 6;
export const STACK_MAX = 9;

export interface PocketState {
  /** Entity IDs in each slot, bottom of the stack first. Always POCKET_SLOTS long. */
  slots: EntityId[][];
  /** The tick each pocketed thing went in, keyed by entity ID, so its timers can resume. */
  at: Record<string, number>;
}

export function emptyPocket(): PocketState {
  return { slots: Array.from({ length: POCKET_SLOTS }, () => []), at: {} };
}

export const isPocketSlot = (slot: unknown): slot is number =>
  typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < POCKET_SLOTS;

/** What the sim needs to know about a thing to decide where it can go. */
export interface Pocketable {
  id: EntityId;
  defId: string;
  stackable: boolean;
}

/**
 * Can `thing` go on top of this slot's contents without a swap? An empty
 * slot takes anything; a stack takes one more of the same stackable item.
 */
export function fits(contents: readonly Pocketable[], thing: Pocketable): boolean {
  if (contents.length === 0) return true;
  if (!thing.stackable || contents.length >= STACK_MAX) return false;
  return contents.every((c) => c.stackable && c.defId === thing.defId);
}

/**
 * Put `thing` in a slot. Returns what must leave the slot to make room (a
 * swap), with how many ticks each spent inside, or an empty list. Mutates
 * `state`.
 */
export function pocketPut(
  state: PocketState,
  slot: number,
  thing: Pocketable,
  contents: readonly Pocketable[],
  tick: number,
): { id: EntityId; ticks: number }[] {
  const ids = state.slots[slot]!;
  const out: { id: EntityId; ticks: number }[] = [];
  if (!fits(contents, thing)) {
    for (const id of ids) {
      const key = String(id);
      out.push({ id, ticks: Math.max(0, tick - (state.at[key] ?? tick)) });
      delete state.at[key];
    }
    ids.length = 0;
  }
  ids.push(thing.id);
  state.at[String(thing.id)] = tick;
  return out;
}

/** Take the top thing out of a slot. Returns its ID and how many ticks it spent inside. */
export function pocketTake(
  state: PocketState,
  slot: number,
  tick: number,
): { id: EntityId; ticks: number } | null {
  const id = state.slots[slot]?.pop();
  if (id === undefined) return null;
  const key = String(id);
  const at = state.at[key] ?? tick;
  delete state.at[key];
  return { id, ticks: Math.max(0, tick - at) };
}

/** Which slot holds this entity, or -1. */
export function slotOf(state: PocketState, id: EntityId): number {
  return state.slots.findIndex((s) => s.includes(id));
}

/** Every pocketed ID. */
export function pocketedIds(state: PocketState): EntityId[] {
  return state.slots.flat();
}

/**
 * Drop IDs that no longer exist (content removed since the save) and any
 * duplicates, keeping the state well formed.
 */
export function tidyPocket(state: PocketState, exists: (id: EntityId) => boolean): PocketState {
  const seen = new Set<EntityId>();
  const slots = Array.from({ length: POCKET_SLOTS }, (_, i) =>
    (state.slots[i] ?? []).filter((id) => {
      if (seen.has(id) || !exists(id)) return false;
      seen.add(id);
      return true;
    }),
  );
  const at: Record<string, number> = {};
  for (const id of seen) at[String(id)] = state.at[String(id)] ?? 0;
  return { slots, at };
}
