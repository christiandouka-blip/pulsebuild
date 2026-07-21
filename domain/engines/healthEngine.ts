import {
  HEALTH_AFFECTED_TASK_PENALTY,
  HEALTH_BASELINE,
  HEALTH_MAX,
  HEALTH_MIN,
  HEALTH_PENALTY_BY_TIER,
  HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY,
  healthBand,
} from "@/domain/constants/scoringConstants";
import type { TaskId } from "@/domain/types/identifiers";
import type { OperationalIssue } from "@/domain/types/issue";
import type { HealthResult, ScoreBreakdownLine } from "@/domain/types/scoring";

export type HealthInput = {
  openIssues: OperationalIssue[];
  affectedDownstreamTaskIds: TaskId[];
  unresolvedRecommendationCount: number;
};

/**
 * Health Engine (SoT §10).
 *
 * Deterministic. Baseline 100 with no active issues. Every contribution is
 * explained in the breakdown. Verified-recovery bonus is deferred (3C) and is
 * always 0 in Phase 3A.
 */
export function computeHealth(input: HealthInput): HealthResult {
  const breakdown: ScoreBreakdownLine[] = [];
  let score = HEALTH_BASELINE;

  for (const issue of input.openIssues) {
    const penalty = HEALTH_PENALTY_BY_TIER[issue.finalTier];
    if (penalty > 0) {
      score -= penalty;
      breakdown.push({
        label: `${issue.finalTier} operational issue`,
        delta: -penalty,
        sourceEntityIds: [issue.id],
      });
    }
  }

  if (input.affectedDownstreamTaskIds.length > 0) {
    const delta = -HEALTH_AFFECTED_TASK_PENALTY * input.affectedDownstreamTaskIds.length;
    score += delta;
    breakdown.push({
      label: `${input.affectedDownstreamTaskIds.length} affected downstream task(s)`,
      delta,
      sourceEntityIds: [...input.affectedDownstreamTaskIds],
    });
  }

  if (input.unresolvedRecommendationCount > 0) {
    const delta =
      -HEALTH_UNRESOLVED_RECOMMENDATION_PENALTY * input.unresolvedRecommendationCount;
    score += delta;
    breakdown.push({
      label: `${input.unresolvedRecommendationCount} unresolved recommendation(s)`,
      delta,
      sourceEntityIds: [],
    });
  }

  score = clamp(score, HEALTH_MIN, HEALTH_MAX);

  const explanation =
    breakdown.length === 0
      ? "No active operational issues."
      : `Health reduced by ${breakdown.length} factor(s).`;

  return { score, band: healthBand(score), explanation, breakdown };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
