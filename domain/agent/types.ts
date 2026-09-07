import type { DecisionState, SelectedActionSource } from "@/domain/decisions/types";
import type { VerificationRuleId } from "@/domain/effects/types";
import type { IssueStatus } from "@/domain/types/issue";
import type { ConfidenceCategory } from "@/domain/types/reasoning";
import type { DriftLabel, HealthBand } from "@/domain/types/scoring";
import type { PriorityTier, SignalType } from "@/domain/types/signal";

/**
 * Phase 4A Agent domain — curated explanation context and response contract.
 *
 * AgentContext is the only transformation boundary from frozen operational
 * runtimes into the language layer. Types only; no explanation generation.
 */

export type AgentGrounding = "grounded" | "unsupported" | "unavailable";

/** Structured citation. No arbitrary JSON, no object references. */
export type AgentEvidenceRef = {
  entityType: string;
  entityId: string;
  fact: string;
};

export type AgentTimelineSource =
  | "reasoning"
  | "decision"
  | "overlay"
  | "recovery"
  | "score";

export type AgentHealthView = {
  score: number;
  band: HealthBand;
  explanation: string;
};

export type AgentDriftView = {
  score: number;
  label: DriftLabel;
  explanation: string;
};

export type AgentRecoverySummaryView = {
  currentlyOpenCount: number;
  currentlyRecoveredCount: number;
  historicalRecoveredEpisodeCount: number;
  currentlyReopenedCount: number;
};

export type AgentOpenIssueView = {
  issueId: string;
  kind: string;
  tier: PriorityTier;
  signalId: string;
  taskId: string | null;
  /** Phase 3A historical status. Never rewritten to resolved. */
  historicalStatus: IssueStatus;
  currentlyRecovered: boolean;
};

export type AgentRecoveredIssueView = {
  issueId: string;
  signalId: string;
  verificationRuleId: VerificationRuleId | null;
  currentlyRecovered: true;
  latestEpisodeNumber: number | null;
  latestRecoveredSimulatedAt: string | null;
};

export type AgentSignalView = {
  signalId: string;
  type: SignalType;
  finalTier: PriorityTier;
  summary: string;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTaskId: string;
};

export type AgentRecommendationView = {
  recommendationId: string;
  signalId: string;
  issueId: string | null;
  primaryAction: string;
  approvalRequired: boolean;
  approvalReason: string | null;
  confidenceCategory: ConfidenceCategory;
  finalTier: PriorityTier;
  evidence: readonly AgentEvidenceRef[];
};

export type AgentWorkflowVerificationView = {
  /** Phase 3B: superintendent confirmed the recorded action. */
  superintendentConfirmed: boolean;
  state: DecisionState;
  summary: string;
};

export type AgentOperationalRecoveryRelation = {
  relatedIssueId: string | null;
  /** Phase 3C: current derived recovery, independent of workflow verification. */
  currentlyRecovered: boolean;
};

export type AgentDecisionView = {
  decisionId: string;
  recommendationId: string;
  signalId: string;
  issueId: string | null;
  state: DecisionState;
  selectedAction: string | null;
  selectedActionSource: SelectedActionSource | null;
  workflowVerification: AgentWorkflowVerificationView;
  operationalRecovery: AgentOperationalRecoveryRelation;
};

export type AgentChangedFactView = {
  entityType: "material" | "task" | "crew";
  entityId: string;
  field: string;
  previousValue: string;
  newValue: string;
  effectId: string;
  simulatedAt: string;
};

export type AgentRecoveryHistoryView = {
  eventId: string;
  type: "Recovered" | "Reopened";
  issueId: string;
  verificationRuleId: VerificationRuleId;
  episodeNumber: number;
  simulatedAt: string;
  evidence: readonly AgentEvidenceRef[];
};

export type AgentTimelineView = {
  timelineEventId: string;
  source: AgentTimelineSource;
  label: string;
  summary: string;
  simulatedAt: string;
  facts: readonly string[];
};

/**
 * Curated grounding payload. Not a runtime dump.
 * Future explainers consume this object only.
 */
export type AgentContext = {
  evaluationSimulatedAt: string;
  health: AgentHealthView;
  drift: AgentDriftView;
  recoverySummary: AgentRecoverySummaryView;
  openIssues: readonly AgentOpenIssueView[];
  currentlyRecoveredIssues: readonly AgentRecoveredIssueView[];
  signals: readonly AgentSignalView[];
  recommendations: readonly AgentRecommendationView[];
  decisions: readonly AgentDecisionView[];
  changedFacts: readonly AgentChangedFactView[];
  recoveryHistory: readonly AgentRecoveryHistoryView[];
  timeline: readonly AgentTimelineView[];
};

/**
 * Structured agent reply contract. Phase 4A defines the shape only.
 * `id` is owned by the later Agent store (session sequence). Do not generate
 * it in buildAgentContext.
 */
export type AgentResponse = {
  id: string;
  question: string;
  answerText: string;
  grounding: AgentGrounding;
  evidenceRefs: readonly AgentEvidenceRef[];
  relatedSignalIds: readonly string[];
  relatedIssueIds: readonly string[];
  relatedRecommendationIds: readonly string[];
  relatedDecisionIds: readonly string[];
  relatedTimelineEventIds: readonly string[];
  generatedAtSimulated: string;
  unsupportedReason: string | null;
};
