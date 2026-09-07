/**
 * Phase 3C operational verification policy — exhaustive per SignalType.
 *
 * Each kind is classified as a requirement-dimension rule or as not
 * verifiable. No kind is inferred from mutatesOperationalState, DecisionState,
 * or recommendation prose.
 */

import type { VerificationRuleId } from "@/domain/effects/types";
import type { SignalType } from "@/domain/types/signal";

export type RelatedEntityKind = "material" | "inspection" | "crew";

export type RequirementVerificationPolicy = {
  kind: "requirement";
  ruleId: VerificationRuleId;
  relatedEntityType: RelatedEntityKind;
  description: string;
  recoveryCondition: string;
};

export type NotVerifiablePolicy = {
  kind: "not_verifiable";
  missingRule: string;
};

export type NeverCreatesIssuePolicy = {
  kind: "never_creates_issue";
  missingRule: string;
};

export type VerificationPolicy =
  | RequirementVerificationPolicy
  | NotVerifiablePolicy
  | NeverCreatesIssuePolicy;

/**
 * Total map over SignalType. Adding a signal type without a verification
 * policy fails to compile.
 */
export const VERIFICATION_POLICY_BY_SIGNAL_TYPE: Record<
  SignalType,
  VerificationPolicy
> = {
  MaterialDeliveryDelayed: {
    kind: "requirement",
    ruleId: "VERIFY_MATERIAL_REQUIREMENT",
    relatedEntityType: "material",
    description:
      "Material-delivery issue recovers when the named material required by the issue task has deliveryStatus received.",
    recoveryCondition:
      "Task.requiredMaterialIds includes the signal material and Material.deliveryStatus === received.",
  },
  InspectionMissing: {
    kind: "requirement",
    ruleId: "VERIFY_INSPECTION_REQUIREMENT",
    relatedEntityType: "inspection",
    description:
      "Inspection issue recovers when the named gating inspection has status passed.",
    recoveryCondition:
      "Inspection.requiredBeforeTaskId is the issue task and Inspection.status === passed.",
  },
  InspectionFailed: {
    kind: "requirement",
    ruleId: "VERIFY_INSPECTION_REQUIREMENT",
    relatedEntityType: "inspection",
    description:
      "Inspection issue recovers when the named gating inspection has status passed.",
    recoveryCondition:
      "Inspection.requiredBeforeTaskId is the issue task and Inspection.status === passed.",
  },
  CrewShortage: {
    kind: "requirement",
    ruleId: "VERIFY_CREW_REQUIREMENT",
    relatedEntityType: "crew",
    description:
      "Crew-shortage issue recovers when the named required crew is assigned to the issue task or has status available.",
    recoveryCondition:
      "Task.requiredCrewIds includes the signal crew and (Crew.currentTaskId === task.id or Crew.status === available).",
  },
  SafetyIncident: {
    kind: "not_verifiable",
    missingRule:
      "No safety-clearance fact exists in the domain. Task completion, crew reassignment, material delivery, and DecisionState.Verified are not safety recovery.",
  },
  WeatherAlert: {
    kind: "not_verifiable",
    missingRule:
      "No approved weather-clearance condition exists. Simulated time, task completion, and workflow verification are not weather recovery.",
  },
  CriticalEquipmentFailure: {
    kind: "not_verifiable",
    missingRule:
      "No Phase 3C equipment-recovery rule is authorized. Existing equipment-availability semantics are not mapped to CriticalEquipmentFailure in this step.",
  },
  PermitPending: {
    kind: "not_verifiable",
    missingRule:
      "No Phase 3C permit-recovery rule is authorized. Permit.status is not treated as issue recovery in this step.",
  },
  TaskBehindSchedule: {
    kind: "not_verifiable",
    missingRule:
      "No schedule-recovery condition is modeled. Task.status === Completed does not clear TaskBehindSchedule.",
  },
  MinorDelay: {
    kind: "not_verifiable",
    missingRule:
      "No delay-clearance condition is modeled. Task completion is not generic issue recovery.",
  },
  TaskComplete: {
    kind: "never_creates_issue",
    missingRule:
      "TaskComplete does not create an OperationalIssue and is not a generic recovery rule for other issue kinds.",
  },
  DeliveryReceived: {
    kind: "never_creates_issue",
    missingRule:
      "DeliveryReceived does not create an OperationalIssue. Material recovery is verified from MaterialDeliveryDelayed identity plus effective material facts.",
  },
};
