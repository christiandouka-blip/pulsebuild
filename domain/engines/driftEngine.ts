import {
  DRIFT_WEIGHT_AFFECTED_TASK,
  DRIFT_WEIGHT_IDLE_CREW,
  DRIFT_WEIGHT_TIER1,
  DRIFT_WEIGHT_TIER2,
  DRIFT_WEIGHT_UNRESOLVED_ACTION,
  driftLabel,
} from "@/domain/constants/scoringConstants";
import type { TaskId } from "@/domain/types/identifiers";
import type { OperationalIssue } from "@/domain/types/issue";
import type { DriftResult, ScoreBreakdownLine } from "@/domain/types/scoring";

export type DriftInput = {
  openIssues: OperationalIssue[];
  affectedTaskIds: TaskId[];
  idleCrewRiskCount: number;
  /** Approved actions awaiting verification — always 0 in Phase 3A. */
  unresolvedActionCount: number;
};

/**
 * Drift Engine (SoT §10; bands PO Decision 2).
 *
 * Deterministic. Baseline 0 with no active issues. Higher is worse. Every
 * contribution is explained.
 */
export function computeDrift(input: DriftInput): DriftResult {
  const breakdown: ScoreBreakdownLine[] = [];
  const contributingEntityIds: string[] = [];
  let score = 0;

  const tier1 = input.openIssues.filter((i) => i.finalTier === "Tier1");
  const tier2 = input.openIssues.filter((i) => i.finalTier === "Tier2");

  if (tier1.length > 0) {
    const delta = DRIFT_WEIGHT_TIER1 * tier1.length;
    score += delta;
    breakdown.push({ label: `${tier1.length} active Tier 1`, delta, sourceEntityIds: tier1.map((i) => i.id) });
    contributingEntityIds.push(...tier1.map((i) => i.id));
  }
  if (tier2.length > 0) {
    const delta = DRIFT_WEIGHT_TIER2 * tier2.length;
    score += delta;
    breakdown.push({ label: `${tier2.length} active Tier 2`, delta, sourceEntityIds: tier2.map((i) => i.id) });
    contributingEntityIds.push(...tier2.map((i) => i.id));
  }
  if (input.affectedTaskIds.length > 0) {
    const delta = DRIFT_WEIGHT_AFFECTED_TASK * input.affectedTaskIds.length;
    score += delta;
    breakdown.push({ label: `${input.affectedTaskIds.length} affected task(s)`, delta, sourceEntityIds: [...input.affectedTaskIds] });
    contributingEntityIds.push(...input.affectedTaskIds);
  }
  if (input.idleCrewRiskCount > 0) {
    const delta = DRIFT_WEIGHT_IDLE_CREW * input.idleCrewRiskCount;
    score += delta;
    breakdown.push({ label: `${input.idleCrewRiskCount} idle-crew risk(s)`, delta, sourceEntityIds: [] });
  }
  if (input.unresolvedActionCount > 0) {
    const delta = DRIFT_WEIGHT_UNRESOLVED_ACTION * input.unresolvedActionCount;
    score += delta;
    breakdown.push({ label: `${input.unresolvedActionCount} unresolved action(s)`, delta, sourceEntityIds: [] });
  }

  const explanation =
    breakdown.length === 0
      ? "Project aligned with plan."
      : `Drift driven by ${breakdown.length} factor(s).`;

  return { score, label: driftLabel(score), explanation, breakdown, contributingEntityIds };
}
