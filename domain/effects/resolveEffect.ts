/**
 * Phase 3C Effect Resolver — pure translation of a verified decision into a
 * typed operational effect.
 *
 * Structured-identity only: the resolver reads OperationalDecision workflow
 * facts and RecommendationActionDescriptor fields. It never reads action prose,
 * never calls inferMutatesOperationalState, never touches ProjectSnapshot, and
 * never re-runs recommendation eligibility — that was settled before the action
 * existed. It resolves; it does not apply.
 */

import type { RecommendationRuleId } from "@/domain/constants/recommendationRules";
import type { OperationalDecision } from "@/domain/decisions/types";
import type {
  CrewAssignmentChangedEffect,
  EffectPolicy,
  EffectRejected,
  EffectRejectionCode,
  EffectResolution,
  NoOperationalEffect,
} from "@/domain/effects/types";
import type { RecommendationActionDescriptor } from "@/domain/types/recommendation";

/**
 * Exhaustive effect policy per recommendation rule (PO Contract Gap Resolution).
 *
 * Typed as a total Record over RecommendationRuleId, so adding a rule id without
 * an explicit effect-policy decision fails to compile.
 *
 * Only crew reassignment can be represented honestly with existing fields:
 * Crew.currentTaskId is a real assignment field and a real blockage input.
 * Resequencing, inspection coordination, safety protection, material
 * protect/escalate, and monitoring are coordination work with no truthful
 * project-data representation in the frozen model.
 */
export const EFFECT_POLICY_BY_RULE: Record<RecommendationRuleId, EffectPolicy> = {
  REC_CREW_REASSIGN: {
    kind: "operational_overlay",
    effectType: "CrewAssignmentChanged",
  },
  REC_TASK_RESEQUENCE: { kind: "workflow_only" },
  REC_INSPECTION_COORDINATE: { kind: "workflow_only" },
  REC_SAFETY_PROTECT: { kind: "workflow_only" },
  REC_MATERIAL_PROTECT: { kind: "workflow_only" },
  REC_MATERIAL_ESCALATE: { kind: "workflow_only" },
  REC_MONITOR_PROTECT: { kind: "workflow_only" },
};

/**
 * Resolve the operational effect of one decision.
 *
 * Pure. Returns an explicit outcome for every path and never throws for a
 * normal domain rejection.
 */
export function resolveOperationalEffect(
  decision: OperationalDecision,
): EffectResolution {
  if (decision.state !== "Verified") {
    return rejected(
      decision,
      "DECISION_NOT_VERIFIED",
      `Decision ${decision.id} is in state ${decision.state}; only a Verified decision can produce an operational effect.`,
    );
  }

  const descriptor = decision.selectedActionDescriptor;
  if (descriptor === null) {
    return rejected(
      decision,
      "MISSING_ACTION_DESCRIPTOR",
      `Decision ${decision.id} carries no structured action descriptor; Phase 3C does not infer effects from action text.`,
    );
  }

  const simulatedAt = verifiedAtSimulated(decision);
  if (simulatedAt === null) {
    return rejected(
      decision,
      "MISSING_VERIFICATION_EVENT",
      `Decision ${decision.id} has no VerifyDecision audit event to date the effect.`,
    );
  }

  const policy = EFFECT_POLICY_BY_RULE[descriptor.ruleId];
  if (policy.kind === "workflow_only") {
    return noOperationalEffect(decision, descriptor, simulatedAt);
  }

  switch (policy.effectType) {
    case "CrewAssignmentChanged":
      return resolveCrewAssignmentChanged(decision, descriptor, simulatedAt);
    default: {
      const exhaustive: never = policy.effectType;
      return rejected(
        decision,
        "DESCRIPTOR_SUBJECT_MISMATCH",
        `Unhandled effect type: ${String(exhaustive)}`,
      );
    }
  }
}

function resolveCrewAssignmentChanged(
  decision: OperationalDecision,
  descriptor: RecommendationActionDescriptor,
  simulatedAt: string,
): EffectResolution {
  if (descriptor.subjectEntityType !== "crew") {
    return rejected(
      decision,
      "DESCRIPTOR_SUBJECT_MISMATCH",
      `Crew reassignment requires a crew subject; descriptor subject is ${descriptor.subjectEntityType}.`,
    );
  }
  if (descriptor.targetTaskId === undefined) {
    return rejected(
      decision,
      "MISSING_TARGET_TASK",
      `Crew reassignment requires a target task on the action descriptor.`,
    );
  }

  const effect: CrewAssignmentChangedEffect = {
    id: effectId(decision.id, "CrewAssignmentChanged"),
    decisionId: decision.id,
    recommendationId: decision.recommendationId,
    signalId: decision.signalId,
    issueId: decision.issueId,
    ruleId: descriptor.ruleId,
    effectType: "CrewAssignmentChanged",
    simulatedAt,
    crewId: descriptor.subjectEntityId,
    originTaskId: descriptor.originTaskId,
    targetTaskId: descriptor.targetTaskId,
  };

  return { outcome: "Resolved", effect };
}

function noOperationalEffect(
  decision: OperationalDecision,
  descriptor: RecommendationActionDescriptor,
  simulatedAt: string,
): NoOperationalEffect {
  return {
    outcome: "NoOperationalEffect",
    reason: "workflow_only_rule",
    decisionId: decision.id,
    ruleId: descriptor.ruleId,
    originTaskId: descriptor.originTaskId,
    targetTaskId: descriptor.targetTaskId ?? null,
    simulatedAt,
  };
}

/** Deterministic id derived from existing identity; no counter, no clock. */
function effectId(decisionId: string, effectType: string): string {
  return `effect-${decisionId}-${effectType}`;
}

/**
 * Simulated instant of the verification that authorized the effect, taken from
 * the Phase 3B audit trail by command identity (not by prose, not by position).
 */
function verifiedAtSimulated(decision: OperationalDecision): string | null {
  for (let i = decision.auditTrail.length - 1; i >= 0; i--) {
    const event = decision.auditTrail[i];
    if (event.command === "VerifyDecision") return event.simulatedAt;
  }
  return null;
}

function rejected(
  decision: OperationalDecision,
  code: EffectRejectionCode,
  message: string,
): EffectRejected {
  return { outcome: "Rejected", code, decisionId: decision.id, message };
}
