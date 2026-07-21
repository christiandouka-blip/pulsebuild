import type {
  EvidenceId,
  ScenarioFixtureId,
  TaskId,
} from "@/domain/types/identifiers";

/** Documented signal taxonomy — SoT §9. */
export type SignalType =
  | "SafetyIncident"
  | "InspectionFailed"
  | "InspectionMissing"
  | "CriticalEquipmentFailure"
  | "MaterialDeliveryDelayed"
  | "CrewShortage"
  | "WeatherAlert"
  | "PermitPending"
  | "TaskBehindSchedule"
  | "MinorDelay"
  | "TaskComplete"
  | "DeliveryReceived";

/** Canonical signal lifecycle — PO Decision 8. Types only; not active runtime state in Phase 2. */
export type SignalLifecycleStatus =
  | "Detected"
  | "Validated"
  | "Prioritized"
  | "Assigned"
  | "RecommendationGenerated"
  | "AwaitingApproval"
  | "ActionTaken"
  | "Verification"
  | "Resolved"
  | "Archived";

export type PriorityTier = "Tier1" | "Tier2" | "Tier3" | "Tier4";

export type ScenarioFixtureSourceType = "simulation" | "seed" | "user" | "system";

/**
 * Descriptive future observation only — PO Decision 6.
 * Does not modify state or predetermine outcomes.
 */
export type ScenarioFixture = {
  id: ScenarioFixtureId;
  sequenceOrder: number;
  signalType: SignalType;
  title: string;
  description: string;
  sourceType: ScenarioFixtureSourceType;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTaskId: TaskId;
  observedAtOffsetMinutes: number;
  rawObservation: Record<string, unknown>;
  evidenceIds: EvidenceId[];
};
