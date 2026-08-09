/**
 * Phase 3B workflow presentation selectors.
 *
 * Pure. Capability flags are derived from the Decision FSM allow-list so no
 * component re-implements workflow rules. These are Decision Runtime metrics
 * only: they never feed Drift or Health.
 */

import {
  allowedCommandsForState,
  decisionCounts,
  type DecisionAuditEvent,
  type DecisionCommandType,
  type DecisionRuntime,
  type DecisionState,
  type OperationalDecision,
} from "@/domain/decisions";

export type WorkflowCounts = {
  pendingReviewCount: number;
  pendingExecutionCount: number;
  blockedCount: number;
  awaitingVerificationCount: number;
  verificationFailedCount: number;
  verifiedCount: number;
};

export function workflowCounts(runtime: DecisionRuntime): WorkflowCounts {
  const counts = decisionCounts(runtime);
  return {
    pendingReviewCount: counts.pendingReview,
    pendingExecutionCount: counts.pendingExecution,
    blockedCount: counts.blocked,
    awaitingVerificationCount: counts.awaitingVerification,
    verificationFailedCount: counts.verificationFailed,
    verifiedCount: counts.verified,
  };
}

const EXECUTION_PANEL_STATES: readonly DecisionState[] = [
  "PendingExecution",
  "Blocked",
  "Executed",
];

const VERIFICATION_PANEL_STATES: readonly DecisionState[] = [
  "AwaitingVerification",
  "VerificationFailed",
];

export type WorkflowControlModel = {
  allowedCommands: DecisionCommandType[];
  showExecutionPanel: boolean;
  showVerificationPanel: boolean;
  canMarkExecuted: boolean;
  canAdvanceToVerification: boolean;
  canBlockExecution: boolean;
  canRetryExecution: boolean;
  canCancel: boolean;
  canVerify: boolean;
  canFailVerification: boolean;
};

/** Single FSM probe per decision; every control flag comes from that allow-list. */
export function workflowControlModel(
  decision: OperationalDecision,
): WorkflowControlModel {
  const allowedCommands = allowedCommandsForState(decision);
  const allows = (command: DecisionCommandType) =>
    allowedCommands.includes(command);

  return {
    allowedCommands,
    showExecutionPanel: EXECUTION_PANEL_STATES.includes(decision.state),
    showVerificationPanel: VERIFICATION_PANEL_STATES.includes(decision.state),
    canMarkExecuted: allows("MarkExecutionComplete"),
    canAdvanceToVerification: allows("AdvanceToVerification"),
    canBlockExecution: allows("BlockExecution"),
    canRetryExecution: allows("RetryExecution"),
    canCancel: allows("CancelDecision"),
    canVerify: allows("VerifyDecision"),
    canFailVerification: allows("FailVerification"),
  };
}

const WORKFLOW_STATUS_LABELS: Record<DecisionState, string> = {
  PendingReview: "Needs decision",
  Acknowledged: "Acknowledged",
  Approved: "Approved · Awaiting workflow advance",
  PendingExecution: "Approved · Awaiting field execution",
  Executed: "Execution recorded",
  Blocked: "Execution blocked",
  AwaitingVerification: "Execution recorded · Verification required",
  VerificationFailed: "Verification failed · Retry required",
  Verified: "Verified",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};

export function workflowStatusLabel(state: DecisionState): string {
  return WORKFLOW_STATUS_LABELS[state];
}

/** Most recent audit event for a command, used to surface reason/actor/time. */
export function latestAuditEvent(
  decision: OperationalDecision,
  command: DecisionCommandType,
): DecisionAuditEvent | null {
  for (let i = decision.auditTrail.length - 1; i >= 0; i--) {
    if (decision.auditTrail[i].command === command) return decision.auditTrail[i];
  }
  return null;
}

/** Workflow-phrased typed error text (review-phase wording lives in review selectors). */
export function formatWorkflowError(code: string, message: string): string {
  switch (code) {
    case "INVALID_TRANSITION":
      return `Invalid transition: ${message}`;
    case "DECISION_ALREADY_TERMINAL":
      return `Decision already completed: ${message}`;
    case "MISSING_REASON":
      return `Reason required: ${message}`;
    case "ACTION_NOT_FOUND":
      return `Action unavailable: ${message}`;
    default:
      return message;
  }
}
