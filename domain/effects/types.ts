/**
 * Phase 3C Operational Effect model — types only.
 *
 * An OperationalEffect is the deterministic, typed consequence of either a
 * VERIFIED decision or an authorized positive observation. Decision effects
 * are resolved by resolveOperationalEffect; observation effects by
 * resolveObservationEffect. Application is a separate pure step.
 *
 * No effect carries a previous ("from") value: the pre-change state belongs to
 * the effective world at application time, not to the proposal of the effect.
 */

import type { RecommendationRuleId } from "@/domain/constants/recommendationRules";
import type { CrewId, MaterialId, TaskId } from "@/domain/types/identifiers";
import type { CrewStatus } from "@/domain/types/resources";
import type { SignalType } from "@/domain/types/signal";

/** Decision-sourced overlay. Observation types must not appear in EFFECT_POLICY_BY_RULE. */
export type DecisionOverlayEffectType = "CrewAssignmentChanged";

/** Observation-sourced overlay — DeliveryReceived and TaskComplete only. */
export type ObservationOverlayEffectType =
  | "MaterialDeliveryReceived"
  | "TaskCompleted";

/** Every effect kind Phase 3C can represent. Extend only with PO authorization. */
export type OperationalEffectType =
  | DecisionOverlayEffectType
  | ObservationOverlayEffectType;

export type DecisionEffectProvenance = {
  source: "decision";
  decisionId: string;
  recommendationId: string;
  signalId: string;
  issueId: string | null;
  ruleId: RecommendationRuleId;
};

export type ObservationEffectProvenance = {
  source: "observation";
  signalId: string;
};

export type EffectProvenance = DecisionEffectProvenance | ObservationEffectProvenance;

/**
 * Decision-sourced identity. Observation effects must not use this shape —
 * they must not fabricate decisionId, recommendationId, or issueId.
 */
export type OperationalEffectIdentity = {
  /** Deterministic: effect-<decisionId>-<effectType>. */
  id: string;
  decisionId: string;
  recommendationId: string;
  signalId: string;
  issueId: string | null;
  ruleId: RecommendationRuleId;
  effectType: DecisionOverlayEffectType;
  /** The simulated instant of the Phase 3B VerifyDecision audit event. */
  simulatedAt: string;
};

export type ObservationEffectIdentity = {
  /** Deterministic: effect-observation-<signalId>-<effectType>. */
  id: string;
  source: "observation";
  signalId: string;
  effectType: ObservationOverlayEffectType;
  simulatedAt: string;
};

/**
 * A verified crew reassignment. Expresses intent in descriptor terms: move the
 * named crew off the blocked origin task and onto the target task that the
 * Recommendation Engine already proved eligible.
 */
export type CrewAssignmentChangedEffect = OperationalEffectIdentity & {
  effectType: "CrewAssignmentChanged";
  crewId: CrewId;
  originTaskId: TaskId;
  targetTaskId: TaskId;
};

/**
 * DeliveryReceived observation. Material identity and quantity come from the
 * committed ProjectSignal (relatedEntityId + rawData). No prose.
 */
export type MaterialDeliveryReceivedEffect = ObservationEffectIdentity & {
  effectType: "MaterialDeliveryReceived";
  materialId: MaterialId;
  deliveryStatus: "received";
  quantityReceived: number;
};

/**
 * TaskComplete observation. actualEnd is signal.observedAtSimulated.
 * rawData.completedAt is descriptive and is not copied onto the effect.
 */
export type TaskCompletedEffect = ObservationEffectIdentity & {
  effectType: "TaskCompleted";
  taskId: TaskId;
  status: "Completed";
  actualEnd: string;
};

export type OperationalEffect =
  | CrewAssignmentChangedEffect
  | MaterialDeliveryReceivedEffect
  | TaskCompletedEffect;

/**
 * Per-rule effect policy. workflow_only means a verified action is real
 * coordination work that the domain model cannot represent as a project-data
 * change without inventing facts.
 *
 * effectType is DecisionOverlayEffectType so adding an observation effect
 * does not silently become a decision-policy option.
 */
export type EffectPolicy =
  | { kind: "workflow_only" }
  | { kind: "operational_overlay"; effectType: DecisionOverlayEffectType };

/** Why a verified action intentionally produced no project overlay effect. */
export type NoOperationalEffectReason = "workflow_only_rule";

/** Why an effect could not be resolved. Never thrown — always returned. */
export type EffectRejectionCode =
  | "DECISION_NOT_VERIFIED"
  | "MISSING_ACTION_DESCRIPTOR"
  | "MISSING_VERIFICATION_EVENT"
  | "MISSING_TARGET_TASK"
  | "DESCRIPTOR_SUBJECT_MISMATCH";

export type EffectResolved = {
  outcome: "Resolved";
  effect: CrewAssignmentChangedEffect;
};

/**
 * The action was verified and eligible, and its rule deliberately changes no
 * project data. Structured identity is retained so the audit trail can explain
 * exactly which coordination was confirmed.
 */
export type NoOperationalEffect = {
  outcome: "NoOperationalEffect";
  reason: NoOperationalEffectReason;
  decisionId: string;
  ruleId: RecommendationRuleId;
  originTaskId: TaskId;
  targetTaskId: TaskId | null;
  simulatedAt: string;
};

export type EffectRejected = {
  outcome: "Rejected";
  code: EffectRejectionCode;
  decisionId: string;
  message: string;
};

export type EffectResolution =
  | EffectResolved
  | NoOperationalEffect
  | EffectRejected;

export type ObservationNoOperationalEffectReason = "unsupported_signal_type";

export type ObservationEffectRejectionCode =
  | "INVALID_SIGNAL_IDENTITY"
  | "WRONG_RELATED_ENTITY_TYPE"
  | "MISSING_RELATED_ENTITY_ID"
  | "MISSING_OBSERVED_AT"
  | "INVALID_DELIVERY_STATUS"
  | "DELIVERY_STATUS_NOT_RECEIVED"
  | "INVALID_QUANTITY_RECEIVED";

export type ObservationEffectResolved = {
  outcome: "Resolved";
  effect: MaterialDeliveryReceivedEffect | TaskCompletedEffect;
};

export type ObservationNoOperationalEffect = {
  outcome: "NoOperationalEffect";
  reason: ObservationNoOperationalEffectReason;
  signalId: string;
  signalType: SignalType;
  simulatedAt: string;
};

export type ObservationEffectRejected = {
  outcome: "Rejected";
  code: ObservationEffectRejectionCode;
  signalId: string;
  message: string;
};

export type ObservationEffectResolution =
  | ObservationEffectResolved
  | ObservationNoOperationalEffect
  | ObservationEffectRejected;

/**
 * Why an effect could not be applied to the current effective state.
 * Distinct from EffectRejectionCode, which belongs to resolution (Step 2).
 */
export type EffectApplicationRejectionCode =
  | "INVALID_EFFECT_IDENTITY"
  | "CREW_NOT_FOUND"
  | "ORIGIN_TASK_NOT_FOUND"
  | "TARGET_TASK_NOT_FOUND"
  | "ORIGIN_EQUALS_TARGET"
  | "TARGET_DOES_NOT_REQUIRE_CREW"
  | "CREW_NOT_ASSIGNABLE"
  | "CREW_ALREADY_AT_TARGET"
  | "ASSIGNMENT_CONFLICT"
  | "MATERIAL_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "MATERIAL_ALREADY_RECEIVED"
  | "TASK_ALREADY_COMPLETED";

/** One field write under a single applied effect. */
export type EffectFieldChange = {
  field: string;
  previousValue: unknown;
  newValue: unknown;
};

/**
 * Immutable record of one successful application. Distinct from effect
 * resolution and from DecisionAuditEvent — this is the overlay write log.
 *
 * `changes` is the canonical multi-field audit. Decision-sourced crew records
 * also retain the Step 3 single-field properties so existing consumers and
 * tests keep working. Observation records omit decisionId / ruleId rather
 * than fabricating them.
 */
export type EffectApplicationRecord = {
  effectId: string;
  effectType: OperationalEffectType;
  entityId: string;
  simulatedAt: string;
  provenance: EffectProvenance;
  changes: readonly EffectFieldChange[];
  /** Present only on decision-sourced crew assignment records. */
  decisionId?: string;
  ruleId?: RecommendationRuleId;
  field?: "currentTaskId";
  previousValue?: TaskId | null;
  newValue?: TaskId;
  previousStatus?: CrewStatus;
  newStatus?: CrewStatus;
};

export type EffectApplied = {
  outcome: "Applied";
  record: EffectApplicationRecord;
};

export type EffectAlreadyApplied = {
  outcome: "AlreadyApplied";
  effectId: string;
  provenance: EffectProvenance;
  record: EffectApplicationRecord;
  /** Present only when the applied effect was decision-sourced. */
  decisionId?: string;
};

export type EffectApplicationRejected = {
  outcome: "Rejected";
  code: EffectApplicationRejectionCode;
  effectId: string;
  provenance: EffectProvenance;
  message: string;
  /** Present only when the rejected effect was decision-sourced. */
  decisionId?: string;
};

export type EffectApplicationResult =
  | EffectApplied
  | EffectAlreadyApplied
  | EffectApplicationRejected;

export type VerificationRuleId =
  | "VERIFY_MATERIAL_REQUIREMENT"
  | "VERIFY_INSPECTION_REQUIREMENT"
  | "VERIFY_CREW_REQUIREMENT";

export type VerificationRejectionCode =
  | "ISSUE_SIGNAL_MISMATCH"
  | "INVALID_SIGNAL_IDENTITY"
  | "WRONG_RELATED_ENTITY_TYPE"
  | "MISSING_RELATED_ENTITY_ID"
  | "MISSING_TASK"
  | "TASK_NOT_FOUND"
  | "RELATED_ENTITY_NOT_FOUND"
  | "TASK_DOES_NOT_REQUIRE_ENTITY"
  | "MISSING_RECOVERY_TIMESTAMP";

export type VerificationFact = {
  entityType: string;
  entityId: string;
  fact: string;
};

export type IssueResolutionRecord = {
  id: string;
  issueId: string;
  signalId: string;
  verificationRuleId: VerificationRuleId;
  resolvedAtSimulated: string;
  relatedEntityType: string;
  relatedEntityId: string;
  taskId: TaskId;
  sourceEffectIds: readonly string[];
  evidence: readonly VerificationFact[];
};

export type VerificationRecovered = {
  outcome: "Recovered";
  issueId: string;
  signalId: string;
  verificationRuleId: VerificationRuleId;
  relatedEntityType: string;
  relatedEntityId: string;
  taskId: TaskId;
  simulatedAt: string;
  issueCondition: VerificationFact;
  currentEffectiveCondition: VerificationFact;
  provingFacts: readonly VerificationFact[];
  sourceEffectIds: readonly string[];
  resolution: IssueResolutionRecord;
};

export type VerificationStillActive = {
  outcome: "StillActive";
  issueId: string;
  signalId: string;
  verificationRuleId: VerificationRuleId;
  relatedEntityType: string;
  relatedEntityId: string;
  taskId: TaskId;
  simulatedAt: string;
  issueCondition: VerificationFact;
  currentEffectiveCondition: VerificationFact;
  remainingFacts: readonly VerificationFact[];
};

export type VerificationNotVerifiable = {
  outcome: "NotVerifiable";
  issueId: string;
  signalId: string;
  issueKind: string;
  simulatedAt: string;
  missingRule: string;
};

export type VerificationRejected = {
  outcome: "Rejected";
  code: VerificationRejectionCode;
  issueId: string;
  message: string;
};

export type OperationalVerificationResult =
  | VerificationRecovered
  | VerificationStillActive
  | VerificationNotVerifiable
  | VerificationRejected;
