/**
 * Phase 3B Decision Domain — pure deterministic FSM transitions.
 *
 * Does not mutate inputs. Does not touch ReasoningRuntime or ProjectSnapshot.
 */

import {
  TERMINAL_DECISION_STATES,
  type ApproveDecisionCommand,
  type DecisionAuditEvent,
  type DecisionCommand,
  type DecisionCommandType,
  type DecisionState,
  type DecisionTransitionError,
  type DecisionTransitionFailure,
  type DecisionTransitionResult,
  type DecisionTransitionSuccess,
  type OperationalDecision,
  type ProposalActionFact,
  type ProposalFacts,
  type SelectedActionSource,
} from "@/domain/decisions/types";

export type CreateOperationalDecisionInput = {
  id: string;
  recommendationId: string;
  signalId: string;
  issueId: string | null;
  approvalRequired: boolean;
  /** Initial mutates flag from the primary action; updated on Approve. */
  mutatesOperationalState: boolean;
  createdAtSimulated: string;
};

/** Open a decision in PendingReview from recommendation identity facts. */
export function createOperationalDecision(
  input: CreateOperationalDecisionInput,
): OperationalDecision {
  return {
    id: input.id,
    recommendationId: input.recommendationId,
    signalId: input.signalId,
    issueId: input.issueId,
    selectedAction: null,
    selectedActionSource: null,
    selectedActionDescriptor: null,
    mutatesOperationalState: input.mutatesOperationalState,
    approvalRequired: input.approvalRequired,
    state: "PendingReview",
    createdAtSimulated: input.createdAtSimulated,
    updatedAtSimulated: input.createdAtSimulated,
    auditTrail: [],
  };
}

/**
 * Apply one command to a decision. Pure: returns a new decision or a typed error.
 * `proposalFacts` are required for Acknowledge / Approve action selection.
 */
export function transitionDecision(
  decision: OperationalDecision,
  command: DecisionCommand,
  proposalFacts: ProposalFacts,
): DecisionTransitionResult {
  if (!isValidSimulatedTimestamp(command.simulatedAt)) {
    return fail("INVALID_TIMESTAMP", "Command simulatedAt must be a non-empty string.");
  }

  if (isTerminalState(decision.state)) {
    return fail(
      "DECISION_ALREADY_TERMINAL",
      `Decision ${decision.id} is already terminal in state ${decision.state}.`,
    );
  }

  switch (command.type) {
    case "AcknowledgeDecision":
      return acknowledge(decision, command, proposalFacts);
    case "ApproveDecision":
      return approve(decision, command, proposalFacts);
    case "RejectDecision":
      return reject(decision, command);
    case "ProceedAfterApproval":
      return proceedAfterApproval(decision, command);
    case "MarkExecutionComplete":
      return requireFrom(decision, command, "PendingExecution", "Executed");
    case "AdvanceToVerification":
      return requireFrom(decision, command, "Executed", "AwaitingVerification");
    case "BlockExecution":
      return blockExecution(decision, command);
    case "RetryExecution":
      return retryExecution(decision, command);
    case "CancelDecision":
      return cancel(decision, command);
    case "VerifyDecision":
      return requireFrom(decision, command, "AwaitingVerification", "Verified");
    case "FailVerification":
      return failVerification(decision, command);
    default: {
      const _exhaustive: never = command;
      return fail("INVALID_TRANSITION", `Unknown command: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function acknowledge(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "AcknowledgeDecision" }>,
  proposalFacts: ProposalFacts,
): DecisionTransitionResult {
  if (decision.state !== "PendingReview") {
    return invalid(decision.state, command.type);
  }
  if (decision.approvalRequired || proposalFacts.approvalRequired) {
    return fail(
      "APPROVAL_REQUIRED",
      "AcknowledgeDecision is only valid when approval is not required.",
    );
  }
  const factsCheck = assertFactsAlignment(decision, proposalFacts);
  if (!factsCheck.ok) return factsCheck;

  return succeed(decision, command, "Acknowledged", {
    selectedAction: proposalFacts.primaryAction.action,
    selectedActionSource: "primary",
    selectedActionDescriptor: proposalFacts.primaryAction.descriptor ?? null,
    mutatesOperationalState: proposalFacts.primaryAction.mutatesOperationalState,
  });
}

function approve(
  decision: OperationalDecision,
  command: ApproveDecisionCommand,
  proposalFacts: ProposalFacts,
): DecisionTransitionResult {
  if (decision.state !== "PendingReview") {
    return invalid(decision.state, command.type);
  }
  if (!decision.approvalRequired || !proposalFacts.approvalRequired) {
    return fail(
      "APPROVAL_NOT_REQUIRED",
      "ApproveDecision is only valid when approval is required.",
    );
  }
  const factsCheck = assertFactsAlignment(decision, proposalFacts);
  if (!factsCheck.ok) return factsCheck;

  const selected = resolveSelectedAction(command, proposalFacts);
  if (!selected.ok) return selected;

  return succeed(decision, command, "Approved", {
    selectedAction: selected.action.action,
    selectedActionSource: selected.source,
    selectedActionDescriptor: selected.action.descriptor ?? null,
    mutatesOperationalState: selected.action.mutatesOperationalState,
  });
}

function reject(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "RejectDecision" }>,
): DecisionTransitionResult {
  if (decision.state !== "PendingReview") {
    return invalid(decision.state, command.type);
  }
  if (!decision.approvalRequired) {
    return fail(
      "APPROVAL_NOT_REQUIRED",
      "RejectDecision is only valid when approval is required.",
    );
  }
  if (!hasText(command.reason)) {
    return fail("MISSING_REASON", "RejectDecision requires a non-empty reason.");
  }
  return succeed(decision, command, "Rejected", {}, command.reason);
}

function proceedAfterApproval(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "ProceedAfterApproval" }>,
): DecisionTransitionResult {
  if (decision.state !== "Approved") {
    return invalid(decision.state, command.type);
  }
  if (decision.selectedAction === null || decision.selectedActionSource === null) {
    return fail(
      "ACTION_NOT_FOUND",
      "Approved decision is missing a selected action identity.",
    );
  }
  const toState: DecisionState = decision.mutatesOperationalState
    ? "PendingExecution"
    : "AwaitingVerification";
  return succeed(decision, command, toState);
}

function blockExecution(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "BlockExecution" }>,
): DecisionTransitionResult {
  if (decision.state !== "PendingExecution") {
    return invalid(decision.state, command.type);
  }
  if (!hasText(command.reason)) {
    return fail("MISSING_REASON", "BlockExecution requires a non-empty reason.");
  }
  return succeed(decision, command, "Blocked", {}, command.reason);
}

function retryExecution(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "RetryExecution" }>,
): DecisionTransitionResult {
  if (decision.state === "Blocked" || decision.state === "VerificationFailed") {
    return succeed(decision, command, "PendingExecution");
  }
  return invalid(decision.state, command.type);
}

function cancel(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "CancelDecision" }>,
): DecisionTransitionResult {
  if (decision.state !== "PendingExecution" && decision.state !== "Blocked") {
    return invalid(decision.state, command.type);
  }
  return succeed(decision, command, "Cancelled", {}, command.reason ?? null);
}

function failVerification(
  decision: OperationalDecision,
  command: Extract<DecisionCommand, { type: "FailVerification" }>,
): DecisionTransitionResult {
  if (decision.state !== "AwaitingVerification") {
    return invalid(decision.state, command.type);
  }
  if (!hasText(command.reason)) {
    return fail("MISSING_REASON", "FailVerification requires a non-empty reason.");
  }
  return succeed(decision, command, "VerificationFailed", {}, command.reason);
}

function requireFrom(
  decision: OperationalDecision,
  command: DecisionCommand,
  from: DecisionState,
  to: DecisionState,
): DecisionTransitionResult {
  if (decision.state !== from) {
    return invalid(decision.state, command.type);
  }
  return succeed(decision, command, to);
}

function resolveSelectedAction(
  command: ApproveDecisionCommand,
  proposalFacts: ProposalFacts,
):
  | { ok: true; action: ProposalActionFact; source: SelectedActionSource }
  | DecisionTransitionFailure {
  if (command.selectedActionSource === "primary") {
    if (command.alternativeIndex !== undefined) {
      return fail(
        "ACTION_TYPE_MISMATCH",
        "ApproveDecision with primary source must not include alternativeIndex.",
      );
    }
    return {
      ok: true,
      action: proposalFacts.primaryAction,
      source: "primary",
    };
  }

  if (command.alternativeIndex === undefined) {
    return fail(
      "ACTION_NOT_FOUND",
      "ApproveDecision with alternative source requires alternativeIndex.",
    );
  }
  const action = proposalFacts.alternatives[command.alternativeIndex];
  if (!action) {
    return fail(
      "ACTION_NOT_FOUND",
      `Alternative at index ${command.alternativeIndex} does not exist on the recommendation facts.`,
    );
  }
  return { ok: true, action, source: "alternative" };
}

function assertFactsAlignment(
  decision: OperationalDecision,
  proposalFacts: ProposalFacts,
): DecisionTransitionResult | { ok: true } {
  if (decision.approvalRequired !== proposalFacts.approvalRequired) {
    return fail(
      "ACTION_TYPE_MISMATCH",
      "Decision.approvalRequired does not match proposalFacts.approvalRequired.",
    );
  }
  return { ok: true };
}

function succeed(
  decision: OperationalDecision,
  command: DecisionCommand,
  toState: DecisionState,
  patch: Partial<
    Pick<
      OperationalDecision,
      | "selectedAction"
      | "selectedActionSource"
      | "selectedActionDescriptor"
      | "mutatesOperationalState"
    >
  > = {},
  reason: string | null = null,
): DecisionTransitionSuccess {
  const fromState = decision.state;
  const audit: DecisionAuditEvent = {
    id: nextAuditId(decision),
    decisionId: decision.id,
    command: command.type,
    fromState,
    toState,
    actor: command.actor,
    simulatedAt: command.simulatedAt,
    reason,
    notes: command.notes ?? null,
  };

  return {
    ok: true,
    decision: {
      ...decision,
      ...patch,
      state: toState,
      updatedAtSimulated: command.simulatedAt,
      auditTrail: [...decision.auditTrail, audit],
    },
  };
}

function nextAuditId(decision: OperationalDecision): string {
  return `audit-${decision.id}-${decision.auditTrail.length + 1}`;
}

function invalid(
  from: DecisionState,
  command: DecisionCommandType,
): DecisionTransitionFailure {
  return fail(
    "INVALID_TRANSITION",
    `Command ${command} is not valid from state ${from}.`,
  );
}

function fail(
  code: DecisionTransitionError["code"],
  message: string,
): DecisionTransitionFailure {
  return { ok: false, error: { code, message } };
}

function isTerminalState(state: DecisionState): boolean {
  return (TERMINAL_DECISION_STATES as readonly DecisionState[]).includes(state);
}

function isValidSimulatedTimestamp(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
