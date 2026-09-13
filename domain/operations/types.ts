import type { DecisionCommandType, SelectedActionSource } from "@/domain/decisions/types";
import type { DecisionRuntime } from "@/domain/decisions/runtime";
import type { OverlayRuntime } from "@/domain/effects/runtime";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { IssueRecoveryHistoryEvent } from "@/domain/recovery/history";
import type { ScenarioFixtureSourceType, SignalType } from "@/domain/types/signal";
import type { AuthorizationStatus } from "@/domain/authorization/types";

export type OperationalCommandKind = "observation" | "decision_transition";

export type FsmCommandEnvelope = {
  type: DecisionCommandType;
  selectedActionSource?: SelectedActionSource;
  alternativeIndex?: number;
  reason?: string;
  notes?: string;
};

export type PersistedObservation = {
  id: string;
  organizationId: string;
  projectId: string;
  sequenceOrder: number;
  signalType: SignalType;
  title: string;
  description: string;
  sourceType: ScenarioFixtureSourceType;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTaskId: string;
  payload: Record<string, unknown>;
  evidenceIds: readonly string[];
  committedAt: string;
  actorUserId: string;
  provenance: string;
  idempotencyKey: string;
};

export type PersistedCommand = {
  id: string;
  organizationId: string;
  projectId: string;
  seq: number;
  kind: OperationalCommandKind;
  observationId: string | null;
  decisionId: string | null;
  actorUserId: string;
  committedAt: string;
  idempotencyKey: string;
  fsmCommands: readonly FsmCommandEnvelope[];
};

export type OperationalBundle = {
  organizationId: string;
  projectId: string;
  workflowVersion: number;
  commandSeq: number;
  replayBaselineAt: string;
  currentlyRecoveredIssueIds: readonly string[];
  observations: readonly PersistedObservation[];
  commands: readonly PersistedCommand[];
  recoveryEvents: readonly IssueRecoveryHistoryEvent[];
};

export type ReconstructedOperationalState = {
  reasoning: ReasoningRuntime;
  decisions: DecisionRuntime;
  overlay: OverlayRuntime;
  recovery: RecoveryRuntime;
  workflowVersion: number;
  replayBaselineAt: string;
};

export type ProductionObservationInput = {
  signalType: SignalType;
  title: string;
  description: string;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTaskId: string;
  payload?: Record<string, unknown>;
  evidenceIds?: readonly string[];
  provenance?: string;
  idempotencyKey?: string;
  expectedWorkflowVersion?: number;
};

export type ProductionDecisionInput = {
  decisionId: string;
  commands: readonly FsmCommandEnvelope[];
  idempotencyKey?: string;
  expectedWorkflowVersion?: number;
};

export type OperationalFailureStatus =
  | Exclude<AuthorizationStatus, "Authorized">
  | "InvalidProjectData"
  | "InvalidObservation"
  | "InvalidTransition"
  | "PersistenceConflict"
  | "DatabaseUnavailable"
  | "InvalidPersistedOperationalData"
  | "ReconstructionFailure";

export type ReconstructSuccess = {
  status: "Reconstructed";
  operational: ReconstructedOperationalState;
};

export type ReconstructFailure = {
  status: "InvalidPersistedOperationalData" | "ReconstructionFailure";
  message: string;
};

export type ReconstructResult = ReconstructSuccess | ReconstructFailure;
