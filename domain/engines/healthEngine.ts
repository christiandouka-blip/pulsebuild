import {
  HEALTH_AFFECTED_TASK_PENALTY,
  HEALTH_BASELINE,
  HEALTH_MAX,
  HEALTH_MIN,
  HEALTH_PENALTY_BY_TIER,
  HEALTH_PROVEN_RECOVERY_BONUS,
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
  /**
   * Currently proven-resolved issue ids. Optional so Phase 3A callers omit it.
   * Deduplicated by id. One currently recovered issue = one +5 bonus.
   */
  provenResolvedIssueIds?: readonly string[];
};

/**
 * Health Engine (SoT §10).
 *
 * Deterministic. Baseline 100 with no active issues. Every contribution is
 * explained in the breakdown. Phase 3C may supply provenResolvedIssueIds for
 * the authorized +5 verified-operational-recovery bonus; omitted input keeps
 * Phase 3A arithmetic unchanged.
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

  for (const issueId of uniqueIds(input.provenResolvedIssueIds ?? [])) {
    score += HEALTH_PROVEN_RECOVERY_BONUS;
    breakdown.push({
      label: `Verified operational recovery (${issueId})`,
      delta: HEALTH_PROVEN_RECOVERY_BONUS,
      sourceEntityIds: [issueId],
    });
  }

  score = clamp(score, HEALTH_MIN, HEALTH_MAX);

  const explanation =
    breakdown.length === 0
      ? "No active operational issues."
      : `Health reduced by ${breakdown.length} factor(s).`;

  return { score, band: healthBand(score), explanation, breakdown };
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
