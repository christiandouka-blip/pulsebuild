import type { PriorityTier } from "@/domain/types/signal";

/**
 * DOCUMENTED PRIORITY RULE TABLE — PO Decision 4.
 *
 * The Priority Engine evaluates these explicit rules. `DOCUMENTED_SIGNAL_BASELINE_TIERS`
 * is only the starting hint. Conflict resolution is binding: the most operationally
 * severe valid rule wins (Tier1 > Tier2 > Tier3 > Tier4). Positive-recovery rules
 * never upgrade. No statistical scoring, machine learning, or hidden thresholds.
 */
export type PriorityRuleId =
  | "R0_baseline"
  | "R1_safety"
  | "R2_missing_inspection"
  | "R3_active_block"
  | "R4_critical_path"
  | "R5_permit"
  | "R6_material"
  | "R7_equipment"
  | "R8_crew"
  | "R9_weather"
  | "R10_downstream_count"
  | "R11_cascade_depth"
  | "R12_multiple_blockers"
  | "R13_positive_recovery"
  | "R14_minor";

export const PRIORITY_RULE_DESCRIPTIONS: Record<PriorityRuleId, string> = {
  R0_baseline: "Baseline tier from documented signal type hint.",
  R1_safety: "Safety-related condition forces Tier 1.",
  R2_missing_inspection:
    "Required inspection missing before a task that blocks active productive work.",
  R3_active_block: "Signal blocks a task that should be productive now.",
  R4_critical_path: "Affected work includes a critical-path task.",
  R5_permit: "Required permit missing or unapproved for an imminent task.",
  R6_material: "Required material delayed for a task that needs it.",
  R7_equipment: "Required equipment unavailable or allocated elsewhere.",
  R8_crew: "Required crew unavailable or assigned elsewhere.",
  R9_weather: "Weather condition relevant to the task type.",
  R10_downstream_count: "Number of affected downstream tasks meets the upgrade threshold.",
  R11_cascade_depth: "Dependency cascade depth meets the upgrade threshold.",
  R12_multiple_blockers: "Multiple simultaneous blockers on the same task.",
  R13_positive_recovery: "Positive recovery signal; never upgrades urgency.",
  R14_minor: "Low-impact slip with no downstream, critical-path, or active blockage.",
};

/** Tier severity rank — lower is more severe (Tier1 highest urgency). */
export const TIER_RANK: Record<PriorityTier, number> = {
  Tier1: 1,
  Tier2: 2,
  Tier3: 3,
  Tier4: 4,
};

/** Return the most operationally severe of two tiers (binding conflict resolution). */
export function mostSevereTier(a: PriorityTier, b: PriorityTier): PriorityTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}
