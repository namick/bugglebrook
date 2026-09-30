import type { EntityId } from '../core/entities';

/**
 * Drop targets (game design doc, section 2). When the player lets go of
 * something, or a thrown thing hits a bug, the first matching target by
 * priority wins; ties go to the nearest. If nothing matches, it is a plain
 * physics drop. Later milestones add the pocket, containers, heads, paint,
 * hands, and seats to DROP_RULES.
 */
export type DropTargetKind = 'mouth';

export interface DropRule {
  kind: DropTargetKind;
  /** Lower runs first. Matches the doc's table. */
  priority: number;
  /** Snap radius in meters. */
  radius: number;
  /** The dropped thing needs this tag. */
  tag: string;
}

export const DROP_RULES: readonly DropRule[] = [
  // 4: a bug's mouth, for anything edible. 50 px from the mouth anchor.
  { kind: 'mouth', priority: 4, radius: 0.5, tag: 'tag_edible' },
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
    const rule = rules.find((r) => r.kind === c.kind);
    if (!rule || !tags.includes(rule.tag)) continue;
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
