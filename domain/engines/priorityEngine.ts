import {
  PRIORITY_CASCADE_UPGRADE_THRESHOLD,
  PRIORITY_DOWNSTREAM_UPGRADE_THRESHOLD,
} from "@/domain/constants/scoringConstants";
import {
  PRIORITY_RULE_DESCRIPTIONS,
  type PriorityRuleId,
  mostSevereTier,
} from "@/domain/constants/priorityRules";
import { assessConfidence } from "@/domain/engines/confidence";
import type { DependencyImpact, PriorityAdjustment, PriorityResult } from "@/domain/types/analysis";
import type { ContextSnapshot } from "@/domain/types/context";
import type { PriorityTier } from "@/domain/types/signal";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { ReasoningEvidence } from "@/domain/types/reasoning";

const POSITIVE_TYPES = new Set(["TaskComplete", "DeliveryReceived"]);

/**
 * Priority Engine — PO Decision 4 documented rule table.
 *
 * The baseline hint is only a starting point. Explicit documented rules adjust
 * it; the most operationally severe valid rule wins. No statistical scoring, no
 * machine learning, no hidden thresholds. Every decision carries evidence.
 */
export function classifyPriority(
  signal: ProjectSignal,
  snapshot: ProjectSnapshot,
  context: ContextSnapshot,
  dependency: DependencyImpact,
): PriorityResult {
  const baselineHint = signal.severityHint;
  const task = snapshot.tasks.find((t) => t.id === signal.relatedTaskId);
  const req = context.requirementStatusByTask[signal.relatedTaskId];
  const adjustments: PriorityAdjustment[] = [];
  const evidence: ReasoningEvidence[] = [];

  record(adjustments, "R0_baseline", "preserve", baselineHint);

  const isPositive = POSITIVE_TYPES.has(signal.type);
  const activeBlock =
    !!req &&
    req.isBlocked &&
    !!task &&
    (task.status === "Ready" || task.status === "Executing");

  let finalTier: PriorityTier = baselineHint;

  if (isPositive) {
    record(adjustments, "R13_positive_recovery", "preserve", "Tier4");
    finalTier = "Tier4";
    evidence.push({
      entityType: "task",
      entityId: signal.relatedTaskId,
      fact: "Positive recovery signal — urgency not upgraded",
    });
  } else {
    const fire = (
      ruleId: PriorityRuleId,
      resultingTier: PriorityTier,
      effect: PriorityAdjustment["effect"] = "upgrade",
    ) => {
      finalTier = effect === "upgrade" ? mostSevereTier(finalTier, resultingTier) : finalTier;
      record(adjustments, ruleId, effect, resultingTier);
    };

    if (signal.type === "SafetyIncident") {
      fire("R1_safety", "Tier1");
      evidence.push({ entityType: "signal", entityId: signal.id, fact: "Safety condition" });
    }
    if (req && req.inspectionsPassed === "unsatisfied" && (activeBlock || signal.type === "InspectionMissing")) {
      fire("R2_missing_inspection", "Tier1");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Required inspection not passed" });
    }
    if (activeBlock) {
      fire("R3_active_block", "Tier1");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Blocks active productive work" });
    }
    if (req && req.permitsApproved === "unsatisfied") {
      fire("R5_permit", activeBlock ? "Tier1" : "Tier2");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Permit not approved" });
    }
    if ((req && req.materialsReady === "unsatisfied") || signal.type === "MaterialDeliveryDelayed") {
      fire("R6_material", activeBlock && dependency.criticalPathImpacted ? "Tier1" : "Tier2");
      evidence.push({ entityType: "material", entityId: signal.relatedEntityId, fact: "Required material delayed" });
    }
    if (req && req.equipmentAvailable === "unsatisfied") {
      fire("R7_equipment", activeBlock ? "Tier1" : "Tier2");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Required equipment unavailable" });
    }
    if (req && req.crewAvailable === "unsatisfied") {
      fire("R8_crew", activeBlock ? "Tier1" : "Tier2");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Required crew unavailable" });
    }
    if (signal.type === "WeatherAlert" && weatherRelevant(signal, task?.taskType)) {
      fire("R9_weather", activeBlock && dependency.criticalPathImpacted ? "Tier1" : "Tier2");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Weather relevant to task type" });
    }
    if (dependency.criticalPathImpacted) {
      fire("R4_critical_path", upgradeByOne(baselineHint));
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: "Critical-path impact" });
    }
    if (dependency.affectedTaskIds.length >= PRIORITY_DOWNSTREAM_UPGRADE_THRESHOLD) {
      fire("R10_downstream_count", upgradeByOne(baselineHint));
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: `${dependency.affectedTaskIds.length} downstream tasks affected` });
    }
    if (dependency.cascadeDepth >= PRIORITY_CASCADE_UPGRADE_THRESHOLD) {
      fire("R11_cascade_depth", upgradeByOne(baselineHint));
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: `Cascade depth ${dependency.cascadeDepth}` });
    }
    if (req && req.blockingReasons.length >= 2) {
      fire("R12_multiple_blockers", "Tier1");
      evidence.push({ entityType: "task", entityId: signal.relatedTaskId, fact: `Multiple simultaneous blockers: ${req.blockingReasons.length}` });
    }
    if (signal.type === "MinorDelay") {
      record(adjustments, "R14_minor", "preserve", finalTier);
    }
  }

  return {
    baselineHint,
    finalTier,
    adjustments,
    confidence: buildConfidence(signal, snapshot, task !== undefined, req !== undefined),
    evidence,
  };
}

function record(
  adjustments: PriorityAdjustment[],
  ruleId: PriorityRuleId,
  effect: PriorityAdjustment["effect"],
  resultingTier: PriorityTier,
): void {
  adjustments.push({
    ruleId,
    description: PRIORITY_RULE_DESCRIPTIONS[ruleId],
    effect,
    resultingTier,
  });
}

function upgradeByOne(tier: PriorityTier): PriorityTier {
  switch (tier) {
    case "Tier4":
      return "Tier3";
    case "Tier3":
      return "Tier2";
    case "Tier2":
      return "Tier1";
    case "Tier1":
      return "Tier1";
  }
}

function weatherRelevant(signal: ProjectSignal, taskType: string | undefined): boolean {
  if (!taskType) return false;
  const affected = signal.rawData["affectedTaskTypes"];
  return Array.isArray(affected) && affected.includes(taskType);
}

function buildConfidence(
  signal: ProjectSignal,
  snapshot: ProjectSnapshot,
  relatedTaskExists: boolean,
  requirementKnown: boolean,
) {
  const task = snapshot.tasks.find((t) => t.id === signal.relatedTaskId);
  const dependencyDataComplete =
    !!task && task.dependencyTaskIds.every((id) => snapshot.tasks.some((t) => t.id === id));
  const evidenceRecordsAvailable = Object.keys(signal.rawData).length > 0;
  const relevantDatesAvailable = !!task?.plannedStart;

  const supportingFacts: string[] = [];
  const missingFacts: string[] = [];
  if (relatedTaskExists) supportingFacts.push("Related task resolved");
  else missingFacts.push("Related task missing");
  if (requirementKnown) supportingFacts.push("Requirement states known");
  else missingFacts.push("Requirement states unknown");
  if (dependencyDataComplete) supportingFacts.push("Dependency data complete");
  else missingFacts.push("Dependency data incomplete");
  if (evidenceRecordsAvailable) supportingFacts.push("Observation evidence present");
  else missingFacts.push("Observation evidence absent");
  if (relevantDatesAvailable) supportingFacts.push("Relevant dates available");
  else missingFacts.push("Relevant dates missing");

  return assessConfidence({
    referencedEntityExists: true,
    relatedTaskExists,
    requiredResourceStatesKnown: requirementKnown,
    dependencyDataComplete,
    evidenceRecordsAvailable,
    relevantDatesAvailable,
    supportingFacts,
    missingFacts,
    conflictingFacts: [],
  });
}
