/**
 * Phase 3B Decision Domain — pure capability selectors.
 *
 * Derived from the same FSM rules as transitionDecision so business rules are
 * not duplicated as ad-hoc boolean matrices.
 */

import { transitionDecision } from "@/domain/decisions/transition";
import {
  TERMINAL_DECISION_STATES,
  type DecisionCommand,
  type DecisionCommandType,
  type DecisionState,
  type OperationalDecision,
  type ProposalFacts,
} from "@/domain/decisions/types";

const ACTOR = "superintendent" as const;
const TS = "sim-probe";

/** Probe commands used only to derive allow-lists (never applied for side effects). */
function probeCommands(): DecisionCommand[] {
  return [
    { type: "AcknowledgeDecision", actor: ACTOR, simulatedAt: TS },
    {
      type: "ApproveDecision",
      actor: ACTOR,
      simulatedAt: TS,
      selectedActionSource: "primary",
    },
    {
      type: "RejectDecision",
      actor: ACTOR,
      simulatedAt: TS,
      reason: "probe",
    },
    { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: TS },
    { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: TS },
    { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: TS },
    {
      type: "BlockExecution",
      actor: ACTOR,
      simulatedAt: TS,
      reason: "probe",
    },
    { type: "RetryExecution", actor: ACTOR, simulatedAt: TS },
    { type: "CancelDecision", actor: ACTOR, simulatedAt: TS },
    { type: "VerifyDecision", actor: ACTOR, simulatedAt: TS },
    {
      type: "FailVerification",
      actor: ACTOR,
      simulatedAt: TS,
      reason: "probe",
    },
  ];
}

/**
 * Proposal facts aligned with the decision's approvalRequired flag.
 * Mutates flags are neutral for capability probes except Approve/Acknowledge.
 */
export function probeProposalFacts(decision: OperationalDecision): ProposalFacts {
  return {
    approvalRequired: decision.approvalRequired,
    primaryAction: {
      action: decision.selectedAction ?? "probe-primary-action",
      mutatesOperationalState: decision.mutatesOperationalState,
    },
    alternatives: [],
  };
}

export function isTerminalDecisionState(state: DecisionState): boolean {
  return (TERMINAL_DECISION_STATES as readonly DecisionState[]).includes(state);
}

export function allowedCommandsForState(
  decision: OperationalDecision,
  proposalFacts: ProposalFacts = probeProposalFacts(decision),
): DecisionCommandType[] {
  if (isTerminalDecisionState(decision.state)) return [];

  const allowed: DecisionCommandType[] = [];
  for (const command of probeCommands()) {
    const result = transitionDecision(decision, command, proposalFacts);
    if (result.ok) allowed.push(command.type);
  }
  return allowed;
}

function allows(
  decision: OperationalDecision,
  type: DecisionCommandType,
  proposalFacts?: ProposalFacts,
): boolean {
  return allowedCommandsForState(decision, proposalFacts).includes(type);
}

export function canAcknowledge(
  decision: OperationalDecision,
  proposalFacts?: ProposalFacts,
): boolean {
  return allows(decision, "AcknowledgeDecision", proposalFacts);
}

export function canApprove(
  decision: OperationalDecision,
  proposalFacts?: ProposalFacts,
): boolean {
  return allows(decision, "ApproveDecision", proposalFacts);
}

export function canReject(
  decision: OperationalDecision,
  proposalFacts?: ProposalFacts,
): boolean {
  return allows(decision, "RejectDecision", proposalFacts);
}

export function canProceedAfterApproval(decision: OperationalDecision): boolean {
  return allows(decision, "ProceedAfterApproval");
}

export function canExecute(decision: OperationalDecision): boolean {
  return allows(decision, "MarkExecutionComplete");
}

export function canAdvanceToVerification(decision: OperationalDecision): boolean {
  return allows(decision, "AdvanceToVerification");
}

export function canBlock(decision: OperationalDecision): boolean {
  return allows(decision, "BlockExecution");
}

export function canRetryExecution(decision: OperationalDecision): boolean {
  return allows(decision, "RetryExecution");
}

export function canCancel(decision: OperationalDecision): boolean {
  return allows(decision, "CancelDecision");
}

export function canVerify(decision: OperationalDecision): boolean {
  return allows(decision, "VerifyDecision");
}

export function canFailVerification(decision: OperationalDecision): boolean {
  return allows(decision, "FailVerification");
}
