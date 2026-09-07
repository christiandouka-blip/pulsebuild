/**
 * Phase 3B Decision Domain — types only.
 *
 * Workflow state is a single finite state machine. Approval, execution, and
 * verification are not independent status fields.
 */

import type { RecommendationActionDescriptor } from "@/domain/types/recommendation";

export type DecisionState =
  | "PendingReview"
  | "Acknowledged"
  | "Approved"
  | "PendingExecution"
  | "Executed"
  | "Blocked"
  | "AwaitingVerification"
  | "VerificationFailed"
  | "Verified"
  | "Rejected"
  | "Cancelled";

/** Terminal states — no further commands are accepted. */
export const TERMINAL_DECISION_STATES: readonly DecisionState[] = [
  "Acknowledged",
  "Verified",
  "Rejected",
  "Cancelled",
] as const;

export type SelectedActionSource = "primary" | "alternative";

export type DecisionActorRole = "superintendent";

export type DecisionAuditEvent = {
  id: string;
  decisionId: string;
  command: DecisionCommandType;
  fromState: DecisionState;
  toState: DecisionState;
  actor: DecisionActorRole;
  simulatedAt: string;
  reason: string | null;
  notes: string | null;
};

export type OperationalDecision = {
  id: string;
  recommendationId: string;
  signalId: string;
  issueId: string | null;
  /** Empty until Acknowledge or Approve records a selection. */
  selectedAction: string | null;
  selectedActionSource: SelectedActionSource | null;
  /**
   * Structured identity of the exact action selected — null until selection, or
   * when the recommendation carried no descriptor. Removes any need to recover
   * alternative identity from prose or array position.
   */
  selectedActionDescriptor: RecommendationActionDescriptor | null;
  mutatesOperationalState: boolean;
  approvalRequired: boolean;
  state: DecisionState;
  createdAtSimulated: string;
  updatedAtSimulated: string;
  auditTrail: DecisionAuditEvent[];
};

/**
 * Immutable recommendation facts supplied to transitions.
 * The RecommendationProposal itself remains authoritative in ReasoningRuntime.
 */
export type ProposalActionFact = {
  action: string;
  mutatesOperationalState: boolean;
  /** Absent only for a descriptor-less legacy proposal. */
  descriptor?: RecommendationActionDescriptor;
};

export type ProposalFacts = {
  primaryAction: ProposalActionFact;
  alternatives: readonly ProposalActionFact[];
  approvalRequired: boolean;
};

export type DecisionCommandType =
  | "AcknowledgeDecision"
  | "ApproveDecision"
  | "RejectDecision"
  | "ProceedAfterApproval"
  | "MarkExecutionComplete"
  | "AdvanceToVerification"
  | "BlockExecution"
  | "RetryExecution"
  | "CancelDecision"
  | "VerifyDecision"
  | "FailVerification";

export type AcknowledgeDecisionCommand = {
  type: "AcknowledgeDecision";
  actor: DecisionActorRole;
  simulatedAt: string;
  notes?: string;
};

export type ApproveDecisionCommand = {
  type: "ApproveDecision";
  actor: DecisionActorRole;
  simulatedAt: string;
  selectedActionSource: SelectedActionSource;
  /** Required when selectedActionSource is "alternative". */
  alternativeIndex?: number;
  notes?: string;
};

export type RejectDecisionCommand = {
  type: "RejectDecision";
  actor: DecisionActorRole;
  simulatedAt: string;
  reason: string;
  notes?: string;
};

/** Advances Approved → PendingExecution | AwaitingVerification by mutates flag. */
export type ProceedAfterApprovalCommand = {
  type: "ProceedAfterApproval";
  actor: DecisionActorRole;
  simulatedAt: string;
  notes?: string;
};

export type MarkExecutionCompleteCommand = {
  type: "MarkExecutionComplete";
  actor: DecisionActorRole;
  simulatedAt: string;
  notes?: string;
};

/** Advances Executed → AwaitingVerification (explicit FSM step). */
export type AdvanceToVerificationCommand = {
  type: "AdvanceToVerification";
  actor: DecisionActorRole;
  simulatedAt: string;
  notes?: string;
};

export type BlockExecutionCommand = {
  type: "BlockExecution";
  actor: DecisionActorRole;
  simulatedAt: string;
  reason: string;
  notes?: string;
};

export type RetryExecutionCommand = {
  type: "RetryExecution";
  actor: DecisionActorRole;
  simulatedAt: string;
  notes?: string;
};

export type CancelDecisionCommand = {
  type: "CancelDecision";
  actor: DecisionActorRole;
  simulatedAt: string;
  reason?: string;
  notes?: string;
};

export type VerifyDecisionCommand = {
  type: "VerifyDecision";
  actor: DecisionActorRole;
  simulatedAt: string;
  notes?: string;
};

export type FailVerificationCommand = {
  type: "FailVerification";
  actor: DecisionActorRole;
  simulatedAt: string;
  reason: string;
  notes?: string;
};

export type DecisionCommand =
  | AcknowledgeDecisionCommand
  | ApproveDecisionCommand
  | RejectDecisionCommand
  | ProceedAfterApprovalCommand
  | MarkExecutionCompleteCommand
  | AdvanceToVerificationCommand
  | BlockExecutionCommand
  | RetryExecutionCommand
  | CancelDecisionCommand
  | VerifyDecisionCommand
  | FailVerificationCommand;

export type DecisionTransitionErrorCode =
  | "INVALID_TRANSITION"
  | "APPROVAL_NOT_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "ACTION_NOT_FOUND"
  | "ACTION_TYPE_MISMATCH"
  | "DECISION_ALREADY_TERMINAL"
  | "MISSING_REASON"
  | "INVALID_TIMESTAMP";

export type DecisionTransitionError = {
  code: DecisionTransitionErrorCode;
  message: string;
};

export type DecisionTransitionSuccess = {
  ok: true;
  decision: OperationalDecision;
};

export type DecisionTransitionFailure = {
  ok: false;
  error: DecisionTransitionError;
};

export type DecisionTransitionResult =
  | DecisionTransitionSuccess
  | DecisionTransitionFailure;
