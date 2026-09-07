/**
 * Phase 3C derived effective snapshot — construction-world view plus the
 * overlay application log. The baseline ProjectSnapshot is never mutated.
 *
 * Empty overlay ⇒ snapshot is the same object as baseline. After a successful
 * application, only touched collections are rebuilt; untouched entities keep
 * reference identity.
 */

import type { EffectApplicationRecord } from "@/domain/effects/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export type EffectiveProjectSnapshot = {
  /** Original immutable snapshot supplied to application. Never written. */
  baseline: ProjectSnapshot;
  /**
   * Derived construction-world view. Satisfies ProjectSnapshot so later
   * engines can consume it unchanged. Not a store; not written back to seed.
   */
  snapshot: ProjectSnapshot;
  /** Successfully applied effects only — not resolutions, not rejections. */
  applied: readonly EffectApplicationRecord[];
};

/** Seed + empty overlay. snapshot and baseline share reference identity. */
export function createEffectiveProjectSnapshot(
  baseline: ProjectSnapshot,
): EffectiveProjectSnapshot {
  return {
    baseline,
    snapshot: baseline,
    applied: [],
  };
}
