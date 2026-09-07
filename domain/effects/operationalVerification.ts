/**
 * Phase 3C operational verification — pure proof that an OperationalIssue
 * condition is or is not still supported by the current effective snapshot.
 *
 * Structured identity only: OperationalIssue.kind / signalId / taskId plus
 * ProjectSignal.relatedEntityType / relatedEntityId. No issue prose, no
 * recommendation prose, no DecisionState.
 *
 * Quantity is inspected as evidence but is not a recovery gate: frozen
 * materialsReady is deliveryStatus === "received" only.
 */

import type { EffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import type {
  EffectApplicationRecord,
  IssueResolutionRecord,
  OperationalVerificationResult,
  VerificationFact,
  VerificationRecovered,
  VerificationRejectionCode,
} from "@/domain/effects/types";
import {
  VERIFICATION_POLICY_BY_SIGNAL_TYPE,
  type RelatedEntityKind,
  type RequirementVerificationPolicy,
} from "@/domain/effects/verificationRules";
import type { OperationalIssue } from "@/domain/types/issue";
import type { SignalType } from "@/domain/types/signal";
import type { ProjectSignal } from "@/domain/types/signalRuntime";

export type VerifyOperationalIssueInput = {
  issue: OperationalIssue;
  signal: ProjectSignal;
  effective: EffectiveProjectSnapshot;
};

export function verifyOperationalIssue(
  input: VerifyOperationalIssueInput,
): OperationalVerificationResult {
  const { issue, signal, effective } = input;
  const identityError = validateIssueSignalIdentity(issue, signal);
  if (identityError) return identityError;

  const policy = policyForKind(issue.kind);
  if (policy.kind === "not_verifiable" || policy.kind === "never_creates_issue") {
    return {
      outcome: "NotVerifiable",
      issueId: issue.id,
      signalId: issue.signalId,
      issueKind: issue.kind,
      simulatedAt: asOfSimulated(issue, effective),
      missingRule: policy.missingRule,
    };
  }

  return verifyRequirement(issue, signal, effective, policy);
}

function verifyRequirement(
  issue: OperationalIssue,
  signal: ProjectSignal,
  effective: EffectiveProjectSnapshot,
  policy: RequirementVerificationPolicy,
): OperationalVerificationResult {
  if (signal.relatedEntityType !== policy.relatedEntityType) {
    return rejected(
      issue,
      "WRONG_RELATED_ENTITY_TYPE",
      `Issue kind ${issue.kind} requires relatedEntityType "${policy.relatedEntityType}"; signal has "${signal.relatedEntityType}".`,
    );
  }
  if (!hasText(signal.relatedEntityId)) {
    return rejected(
      issue,
      "MISSING_RELATED_ENTITY_ID",
      `Issue ${issue.id} is missing a related entity id on the original signal.`,
    );
  }
  if (issue.taskId === null || !hasText(issue.taskId)) {
    return rejected(
      issue,
      "MISSING_TASK",
      `Issue ${issue.id} has no taskId; requirement verification needs the affected task.`,
    );
  }

  const snapshot = effective.snapshot;
  const task = snapshot.tasks.find((t) => t.id === issue.taskId);
  if (!task) {
    return rejected(
      issue,
      "TASK_NOT_FOUND",
      `Task ${issue.taskId} does not exist in the effective snapshot.`,
    );
  }

  const entityId = signal.relatedEntityId;
  switch (policy.ruleId) {
    case "VERIFY_MATERIAL_REQUIREMENT":
      return verifyMaterial(issue, signal, effective, policy, task.id, entityId);
    case "VERIFY_INSPECTION_REQUIREMENT":
      return verifyInspection(issue, signal, effective, policy, task.id, entityId);
    case "VERIFY_CREW_REQUIREMENT":
      return verifyCrew(issue, signal, effective, policy, task.id, entityId);
    default: {
      const exhaustive: never = policy.ruleId;
      return rejected(
        issue,
        "INVALID_SIGNAL_IDENTITY",
        `Unhandled verification rule: ${String(exhaustive)}`,
      );
    }
  }
}

function verifyMaterial(
  issue: OperationalIssue,
  signal: ProjectSignal,
  effective: EffectiveProjectSnapshot,
  policy: RequirementVerificationPolicy,
  taskId: string,
  materialId: string,
): OperationalVerificationResult {
  const task = effective.snapshot.tasks.find((t) => t.id === taskId)!;
  if (!task.requiredMaterialIds.includes(materialId)) {
    return rejected(
      issue,
      "TASK_DOES_NOT_REQUIRE_ENTITY",
      `Task ${taskId} does not list material ${materialId} in requiredMaterialIds.`,
    );
  }
  const material = effective.snapshot.materials.find((m) => m.id === materialId);
  if (!material) {
    return rejected(
      issue,
      "RELATED_ENTITY_NOT_FOUND",
      `Material ${materialId} does not exist in the effective snapshot.`,
    );
  }

  const issueCondition = fact(
    "material",
    materialId,
    `MaterialDeliveryDelayed on task ${taskId} remains while deliveryStatus is not received.`,
  );
  const currentEffectiveCondition = fact(
    "material",
    materialId,
    `deliveryStatus=${material.deliveryStatus}; quantityReceived=${material.quantityReceived}; quantityExpected=${material.quantityExpected}.`,
  );

  if (material.deliveryStatus !== "received") {
    return stillActive({
      issue,
      signal,
      policy,
      taskId,
      entityId: materialId,
      entityType: "material",
      effective,
      issueCondition,
      currentEffectiveCondition,
      remainingFacts: [
        fact(
          "material",
          materialId,
          `Frozen materialsReady requires deliveryStatus === received; current status is ${material.deliveryStatus}.`,
        ),
      ],
    });
  }

  const proving = provingRecords(
    effective,
    materialId,
    "MaterialDeliveryReceived",
    "deliveryStatus",
    "received",
  );
  const simulatedAt = latestSimulatedAt(proving);
  if (simulatedAt === null) {
    return rejected(
      issue,
      "MISSING_RECOVERY_TIMESTAMP",
      `Material ${materialId} is received but no applied overlay record dates that fact.`,
    );
  }

  return recovered({
    issue,
    signal,
    policy,
    taskId,
    entityId: materialId,
    entityType: "material",
    simulatedAt,
    sourceEffectIds: proving.map((r) => r.effectId),
    issueCondition,
    currentEffectiveCondition,
    provingFacts: [
      fact("task", taskId, `requiredMaterialIds includes ${materialId}.`),
      fact("material", materialId, "deliveryStatus === received."),
      fact(
        "material",
        materialId,
        `quantityReceived=${material.quantityReceived} is recorded evidence only; frozen materialsReady does not use quantity as a gate.`,
      ),
    ],
  });
}

function verifyInspection(
  issue: OperationalIssue,
  signal: ProjectSignal,
  effective: EffectiveProjectSnapshot,
  policy: RequirementVerificationPolicy,
  taskId: string,
  inspectionId: string,
): OperationalVerificationResult {
  const inspection = effective.snapshot.inspections.find((i) => i.id === inspectionId);
  if (!inspection) {
    return rejected(
      issue,
      "RELATED_ENTITY_NOT_FOUND",
      `Inspection ${inspectionId} does not exist in the effective snapshot.`,
    );
  }
  if (inspection.requiredBeforeTaskId !== taskId) {
    return rejected(
      issue,
      "TASK_DOES_NOT_REQUIRE_ENTITY",
      `Inspection ${inspectionId} gates ${inspection.requiredBeforeTaskId}, not issue task ${taskId}.`,
    );
  }

  const issueCondition = fact(
    "inspection",
    inspectionId,
    `Inspection issue on task ${taskId} remains while status is not passed.`,
  );
  const currentEffectiveCondition = fact(
    "inspection",
    inspectionId,
    `status=${inspection.status}.`,
  );

  if (inspection.status !== "passed") {
    return stillActive({
      issue,
      signal,
      policy,
      taskId,
      entityId: inspectionId,
      entityType: "inspection",
      effective,
      issueCondition,
      currentEffectiveCondition,
      remainingFacts: [
        fact(
          "inspection",
          inspectionId,
          `Frozen inspectionsPassed requires status === passed; current status is ${inspection.status}. Phase 3C has no inspection overlay effect.`,
        ),
      ],
    });
  }

  const proving = provingRecords(effective, inspectionId, null, "status", "passed");
  const simulatedAt = latestSimulatedAt(proving);
  if (simulatedAt === null) {
    return rejected(
      issue,
      "MISSING_RECOVERY_TIMESTAMP",
      `Inspection ${inspectionId} is passed but no applied overlay record dates that fact.`,
    );
  }

  return recovered({
    issue,
    signal,
    policy,
    taskId,
    entityId: inspectionId,
    entityType: "inspection",
    simulatedAt,
    sourceEffectIds: proving.map((r) => r.effectId),
    issueCondition,
    currentEffectiveCondition,
    provingFacts: [
      fact("inspection", inspectionId, "status === passed."),
    ],
  });
}

function verifyCrew(
  issue: OperationalIssue,
  signal: ProjectSignal,
  effective: EffectiveProjectSnapshot,
  policy: RequirementVerificationPolicy,
  taskId: string,
  crewId: string,
): OperationalVerificationResult {
  const task = effective.snapshot.tasks.find((t) => t.id === taskId)!;
  if (!task.requiredCrewIds.includes(crewId)) {
    return rejected(
      issue,
      "TASK_DOES_NOT_REQUIRE_ENTITY",
      `Task ${taskId} does not list crew ${crewId} in requiredCrewIds.`,
    );
  }
  const crew = effective.snapshot.crews.find((c) => c.id === crewId);
  if (!crew) {
    return rejected(
      issue,
      "RELATED_ENTITY_NOT_FOUND",
      `Crew ${crewId} does not exist in the effective snapshot.`,
    );
  }

  const satisfied =
    crew.currentTaskId === taskId || crew.status === "available";
  const issueCondition = fact(
    "crew",
    crewId,
    `CrewShortage on task ${taskId} remains while the named required crew is neither assigned to the task nor available.`,
  );
  const currentEffectiveCondition = fact(
    "crew",
    crewId,
    `currentTaskId=${crew.currentTaskId ?? "none"}; status=${crew.status}.`,
  );

  if (!satisfied) {
    return stillActive({
      issue,
      signal,
      policy,
      taskId,
      entityId: crewId,
      entityType: "crew",
      effective,
      issueCondition,
      currentEffectiveCondition,
      remainingFacts: [
        fact(
          "crew",
          crewId,
          "Frozen crewAvailable requires currentTaskId === task.id or status === available. No trade or skill substitution is applied.",
        ),
      ],
    });
  }

  const proving = provingRecords(
    effective,
    crewId,
    "CrewAssignmentChanged",
    "currentTaskId",
    taskId,
  );
  const simulatedAt = latestSimulatedAt(proving);
  if (simulatedAt === null) {
    return rejected(
      issue,
      "MISSING_RECOVERY_TIMESTAMP",
      `Crew ${crewId} satisfies the task requirement but no applied overlay record dates that assignment.`,
    );
  }

  return recovered({
    issue,
    signal,
    policy,
    taskId,
    entityId: crewId,
    entityType: "crew",
    simulatedAt,
    sourceEffectIds: proving.map((r) => r.effectId),
    issueCondition,
    currentEffectiveCondition,
    provingFacts: [
      fact("task", taskId, `requiredCrewIds includes ${crewId}.`),
      fact(
        "crew",
        crewId,
        `currentTaskId === ${taskId} or status === available (status=${crew.status}, currentTaskId=${crew.currentTaskId ?? "none"}).`,
      ),
    ],
  });
}

function validateIssueSignalIdentity(
  issue: OperationalIssue,
  signal: ProjectSignal,
): OperationalVerificationResult | null {
  if (!hasText(issue.id) || !hasText(issue.signalId) || !hasText(signal.id)) {
    return rejected(
      issue,
      "INVALID_SIGNAL_IDENTITY",
      "Issue and signal require non-empty ids.",
    );
  }
  if (issue.signalId !== signal.id) {
    return rejected(
      issue,
      "ISSUE_SIGNAL_MISMATCH",
      `Issue.signalId ${issue.signalId} does not match signal.id ${signal.id}.`,
    );
  }
  if (issue.kind !== signal.type) {
    return rejected(
      issue,
      "ISSUE_SIGNAL_MISMATCH",
      `Issue.kind ${issue.kind} does not match signal.type ${signal.type}.`,
    );
  }
  if (issue.taskId !== signal.relatedTaskId) {
    return rejected(
      issue,
      "ISSUE_SIGNAL_MISMATCH",
      `Issue.taskId ${issue.taskId} does not match signal.relatedTaskId ${signal.relatedTaskId}.`,
    );
  }
  return null;
}

function policyForKind(kind: string): ReturnType<
  typeof policyForSignalType
> {
  if (!isSignalType(kind)) {
    return {
      kind: "not_verifiable",
      missingRule: `Issue kind "${kind}" is not a known SignalType; no verification rule exists.`,
    };
  }
  return policyForSignalType(kind);
}

function policyForSignalType(type: SignalType) {
  return VERIFICATION_POLICY_BY_SIGNAL_TYPE[type];
}

function isSignalType(value: string): value is SignalType {
  return Object.prototype.hasOwnProperty.call(
    VERIFICATION_POLICY_BY_SIGNAL_TYPE,
    value,
  );
}

function recovered(input: {
  issue: OperationalIssue;
  signal: ProjectSignal;
  policy: RequirementVerificationPolicy;
  taskId: string;
  entityId: string;
  entityType: RelatedEntityKind;
  simulatedAt: string;
  sourceEffectIds: readonly string[];
  issueCondition: VerificationFact;
  currentEffectiveCondition: VerificationFact;
  provingFacts: readonly VerificationFact[];
}): VerificationRecovered {
  const resolution: IssueResolutionRecord = {
    id: `resolution-${input.issue.id}-${input.policy.ruleId}`,
    issueId: input.issue.id,
    signalId: input.issue.signalId,
    verificationRuleId: input.policy.ruleId,
    resolvedAtSimulated: input.simulatedAt,
    relatedEntityType: input.entityType,
    relatedEntityId: input.entityId,
    taskId: input.taskId,
    sourceEffectIds: input.sourceEffectIds,
    evidence: input.provingFacts,
  };
  return {
    outcome: "Recovered",
    issueId: input.issue.id,
    signalId: input.issue.signalId,
    verificationRuleId: input.policy.ruleId,
    relatedEntityType: input.entityType,
    relatedEntityId: input.entityId,
    taskId: input.taskId,
    simulatedAt: input.simulatedAt,
    issueCondition: input.issueCondition,
    currentEffectiveCondition: input.currentEffectiveCondition,
    provingFacts: input.provingFacts,
    sourceEffectIds: input.sourceEffectIds,
    resolution,
  };
}

function stillActive(input: {
  issue: OperationalIssue;
  signal: ProjectSignal;
  policy: RequirementVerificationPolicy;
  taskId: string;
  entityId: string;
  entityType: RelatedEntityKind;
  effective: EffectiveProjectSnapshot;
  issueCondition: VerificationFact;
  currentEffectiveCondition: VerificationFact;
  remainingFacts: readonly VerificationFact[];
}): OperationalVerificationResult {
  return {
    outcome: "StillActive",
    issueId: input.issue.id,
    signalId: input.issue.signalId,
    verificationRuleId: input.policy.ruleId,
    relatedEntityType: input.entityType,
    relatedEntityId: input.entityId,
    taskId: input.taskId,
    simulatedAt: asOfSimulated(input.issue, input.effective),
    issueCondition: input.issueCondition,
    currentEffectiveCondition: input.currentEffectiveCondition,
    remainingFacts: input.remainingFacts,
  };
}

function provingRecords(
  effective: EffectiveProjectSnapshot,
  entityId: string,
  effectType: string | null,
  field: string,
  newValue: unknown,
): EffectApplicationRecord[] {
  return effective.applied.filter((record) => {
    if (record.entityId !== entityId) return false;
    if (effectType !== null && record.effectType !== effectType) return false;
    return record.changes.some(
      (change) => change.field === field && change.newValue === newValue,
    );
  });
}

function latestSimulatedAt(
  records: readonly EffectApplicationRecord[],
): string | null {
  if (records.length === 0) return null;
  return records.reduce(
    (latest, record) =>
      record.simulatedAt > latest ? record.simulatedAt : latest,
    records[0].simulatedAt,
  );
}

function asOfSimulated(
  issue: OperationalIssue,
  effective: EffectiveProjectSnapshot,
): string {
  if (effective.applied.length === 0) return issue.openedAtSimulated;
  return effective.applied.reduce(
    (latest, record) =>
      record.simulatedAt > latest ? record.simulatedAt : latest,
    effective.applied[0].simulatedAt,
  );
}

function fact(
  entityType: string,
  entityId: string,
  text: string,
): VerificationFact {
  return { entityType, entityId, fact: text };
}

function rejected(
  issue: OperationalIssue,
  code: VerificationRejectionCode,
  message: string,
): OperationalVerificationResult {
  return { outcome: "Rejected", code, issueId: issue.id, message };
}

function hasText(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
