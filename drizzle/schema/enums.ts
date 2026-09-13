/**
 * PostgreSQL enums for the Phase 5A production schema.
 * Provider-portable. Not imported by domain engines.
 */

import { pgEnum } from "drizzle-orm/pg-core";

import { ORGANIZATION_ROLES } from "@/domain/tenancy/types";

export const organizationRoleEnum = pgEnum(
  "organization_role",
  ORGANIZATION_ROLES,
);

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
]);

export const phaseStatusEnum = pgEnum("phase_status", [
  "planned",
  "active",
  "completed",
]);

export const taskStateEnum = pgEnum("task_state", [
  "Planned",
  "Ready",
  "Waiting",
  "Blocked",
  "Executing",
  "Paused",
  "Completed",
  "Verified",
  "Closed",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "sitework",
  "concrete",
  "framing",
  "steel",
  "interior_prep",
  "envelope",
  "electrical_rough",
  "plumbing_rough",
  "drywall",
  "finishes",
]);

export const crewStatusEnum = pgEnum("crew_status", [
  "available",
  "assigned",
  "idle",
  "off_site",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "ordered",
  "in_transit",
  "delayed",
  "received",
  "partial",
]);

export const equipmentStatusEnum = pgEnum("equipment_status", [
  "available",
  "assigned",
  "maintenance",
  "unavailable",
]);

export const inspectionStatusEnum = pgEnum("inspection_status", [
  "not_scheduled",
  "scheduled",
  "passed",
  "failed",
  "cancelled",
]);

export const permitStatusEnum = pgEnum("permit_status", [
  "pending",
  "approved",
  "expired",
  "revoked",
]);

export const weatherSeverityEnum = pgEnum("weather_severity", [
  "low",
  "moderate",
  "high",
  "severe",
]);

export const evidenceSourceTypeEnum = pgEnum("evidence_source_type", [
  "seed",
  "simulation",
  "user",
  "system",
]);

export const IMPORT_JOB_STATUSES = [
  "Uploaded",
  "Parsed",
  "NeedsReview",
  "ReadyToImport",
  "Imported",
  "Rejected",
  "Failed",
] as const;

export const importJobStatusEnum = pgEnum(
  "import_job_status",
  IMPORT_JOB_STATUSES,
);

export const importFileTypeEnum = pgEnum("import_file_type", ["csv", "xlsx"]);

export const OPERATIONAL_SIGNAL_TYPES = [
  "SafetyIncident",
  "InspectionFailed",
  "InspectionMissing",
  "CriticalEquipmentFailure",
  "MaterialDeliveryDelayed",
  "CrewShortage",
  "WeatherAlert",
  "PermitPending",
  "TaskBehindSchedule",
  "MinorDelay",
  "TaskComplete",
  "DeliveryReceived",
] as const;

export const operationalSignalTypeEnum = pgEnum(
  "operational_signal_type",
  OPERATIONAL_SIGNAL_TYPES,
);

export const OPERATIONAL_COMMAND_KINDS = [
  "observation",
  "decision_transition",
] as const;

export const operationalCommandKindEnum = pgEnum(
  "operational_command_kind",
  OPERATIONAL_COMMAND_KINDS,
);

export const OPERATIONAL_DECISION_STATES = [
  "PendingReview",
  "Acknowledged",
  "Approved",
  "PendingExecution",
  "Executed",
  "Blocked",
  "AwaitingVerification",
  "VerificationFailed",
  "Verified",
  "Rejected",
  "Cancelled",
] as const;

export const operationalDecisionStateEnum = pgEnum(
  "operational_decision_state",
  OPERATIONAL_DECISION_STATES,
);

export const OPERATIONAL_DECISION_COMMAND_TYPES = [
  "AcknowledgeDecision",
  "ApproveDecision",
  "RejectDecision",
  "ProceedAfterApproval",
  "MarkExecutionComplete",
  "AdvanceToVerification",
  "BlockExecution",
  "RetryExecution",
  "CancelDecision",
  "VerifyDecision",
  "FailVerification",
] as const;

export const operationalDecisionCommandTypeEnum = pgEnum(
  "operational_decision_command_type",
  OPERATIONAL_DECISION_COMMAND_TYPES,
);

export const OPERATIONAL_EFFECT_APPLICATION_OUTCOMES = [
  "Applied",
  "AlreadyApplied",
  "Rejected",
] as const;

export const operationalEffectApplicationOutcomeEnum = pgEnum(
  "operational_effect_application_outcome",
  OPERATIONAL_EFFECT_APPLICATION_OUTCOMES,
);

export const OPERATIONAL_RECOVERY_EVENT_TYPES = ["Recovered", "Reopened"] as const;

export const operationalRecoveryEventTypeEnum = pgEnum(
  "operational_recovery_event_type",
  OPERATIONAL_RECOVERY_EVENT_TYPES,
);

export const OPERATIONAL_FIXTURE_SOURCE_TYPES = [
  "simulation",
  "seed",
  "user",
  "system",
] as const;

export const operationalFixtureSourceTypeEnum = pgEnum(
  "operational_fixture_source_type",
  OPERATIONAL_FIXTURE_SOURCE_TYPES,
);
