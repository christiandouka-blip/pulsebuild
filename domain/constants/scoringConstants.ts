import type { PriorityTier } from "@/domain/types/signal";
import type { DriftLabel, HealthBand } from "@/domain/types/scoring";

/**
 * Documented deterministic scoring constants — Phase 3A.
 *
 * Health formula: SoT §10. Drift formula: SoT §10. Drift bands: PO Decision 2.
 * These are documented rule constants, not hidden heuristics.
 */

export const HEALTH_BASELINE = 100;
export const HEALTH_MIN = 0;
export const HEALTH_MAX = 100;

/** SoT §10: Tier 1 subtracts 20; Tier 2 subtracts 10; Tier 3 subtracts 5. */
export const HEALTH_PENALTY_BY_TIER: Record<PriorityTier, number> = {
  Tier1: 20,
  Tier2: 10,
  Tier3: 5,
  Tier4: 0,
};

/** SoT §10: each affected downstream task subtracts 2. */
export const HEALTH_AFFECTED_TASK_PENALTY = 2;

/** SoT §10: unresolved recommendation subtracts 5 (PO Decision 3: one per open issue). */
export const HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY = 5;

/** SoT §10 UI behavior: green 85-100, amber 65-84, red below 65. */
export function healthBand(score: number): HealthBand {
  if (score >= 85) return "green";
  if (score >= 65) return "amber";
  return "red";
}

/** SoT §10: Tier1 active x25 + Tier2 active x15 + affected tasks x5 + idle crew risks x10 + unresolved actions x8. */
export const DRIFT_WEIGHT_TIER1 = 25;
export const DRIFT_WEIGHT_TIER2 = 15;
export const DRIFT_WEIGHT_AFFECTED_TASK = 5;
export const DRIFT_WEIGHT_IDLE_CREW = 10;
export const DRIFT_WEIGHT_UNRESOLVED_ACTION = 8;

/** PO Decision 2 — deterministic Drift bands. */
export function driftLabel(score: number): DriftLabel {
  if (score >= 60) return "Critical Drift";
  if (score >= 30) return "High Drift";
  if (score >= 15) return "Warning";
  return "Normal";
}

/** PO Decision 4 — documented rule-table thresholds (not hidden attention scores). */
export const PRIORITY_DOWNSTREAM_UPGRADE_THRESHOLD = 3;
export const PRIORITY_CASCADE_UPGRADE_THRESHOLD = 2;

/** Task states treated as terminal-complete for baseline reasoning. */
export const COMPLETE_TASK_STATES = ["Completed", "Verified", "Closed"] as const;
