import type { EntityId } from '../core/entities';

/**
 * Drop targets (game design doc, section 2). When the player lets go of
 * something, or a thrown thing hits a bug, the first matching target by
 * priority wins; ties go to the nearest. If nothing matches, it is a plain
 * physics drop. M8 adds containers (the bench's trays, the cauldron),
 * potions at a mouth, and paint on a bug. Heads, hands, and seats come later.
 */
export type DropTargetKind = 'mouth' | 'tray' | 'cauldron' | 'body';

export interface DropRule {
  kind: DropTargetKind;
  /** Lower runs first. Matches the doc's table. */
  priority: number;
  /** Snap radius in meters. */
  radius: number;
  /**
   * The dropped thing needs this tag. Besides real tags, the sim gives
   * items `item`, potion bottles `potion`, and paint drops `paint`.
   */
  tag: string;
}

export const DROP_RULES: readonly DropRule[] = [
  // 2: a container's opening (the bench's trays, the cauldron). 60 px; the cauldron's mouth is wide.
  { kind: 'tray', priority: 2, radius: 0.6, tag: 'item' },
  { kind: 'cauldron', priority: 2, radius: 1.1, tag: 'item' },
  // 4: a bug's mouth, for anything edible or a potion. 50 px from the mouth anchor.
  { kind: 'mouth', priority: 4, radius: 0.5, tag: 'tag_edible' },
  { kind: 'mouth', priority: 4, radius: 0.5, tag: 'potion' },
  // 5: a bug's body, for paint. 70 px from its middle.
  { kind: 'body', priority: 5, radius: 0.7, tag: 'paint' },
];

/** A place something could be dropped right now. */
export interface DropCandidate {
  kind: DropTargetKind;
  /** The entity that owns the target (the bug, for a mouth). */
  entityId: EntityId;
  x: number;
  y: number;
}

export interface DropTarget extends DropCandidate {
  priority: number;
  distance: number;
}

/**
 * The target a thing with `tags` at (x, y) would land in, or null.
 * Pure: the sim supplies the candidates.
 */
export function pickDropTarget(
  tags: readonly string[],
  x: number,
  y: number,
  candidates: readonly DropCandidate[],
  rules: readonly DropRule[] = DROP_RULES,
): DropTarget | null {
  let best: DropTarget | null = null;
  for (const c of candidates) {
    const rule = rules.find((r) => r.kind === c.kind && tags.includes(r.tag));
    if (!rule) continue;
    const distance = Math.hypot(c.x - x, c.y - y);
    if (distance > rule.radius) continue;
    const better =
      !best ||
      rule.priority < best.priority ||
      (rule.priority === best.priority &&
        (distance < best.distance || (distance === best.distance && c.entityId < best.entityId)));
    if (better) best = { ...c, priority: rule.priority, distance };
  }
  return best;
}
