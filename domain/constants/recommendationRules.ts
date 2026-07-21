/**
 * Documented Recommendation candidate ranking — Phase 3A correction.
 *
 * Lower rank value = higher priority. No hidden statistical scoring.
 * Tie-break: ascending candidate ruleId (stable, deterministic).
 */
export type RecommendationRankBand =
  | "safety_protection"
  | "remove_immediate_blocker"
  | "protect_productive_work"
  | "use_ready_alternative"
  | "reduce_idle_resource_risk"
  | "monitor_and_confirm";

export const RECOMMENDATION_RANK: Record<RecommendationRankBand, number> = {
  safety_protection: 1,
  remove_immediate_blocker: 2,
  protect_productive_work: 3,
  use_ready_alternative: 4,
  reduce_idle_resource_risk: 5,
  monitor_and_confirm: 6,
};

/** Stable candidate rule identifiers used for generation and tie-breaking. */
export type RecommendationRuleId =
  | "REC_SAFETY_PROTECT"
  | "REC_INSPECTION_COORDINATE"
  | "REC_CREW_REASSIGN"
  | "REC_TASK_RESEQUENCE"
  | "REC_MATERIAL_PROTECT"
  | "REC_MATERIAL_ESCALATE"
  | "REC_MONITOR_PROTECT";
