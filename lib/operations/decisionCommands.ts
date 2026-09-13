import type { DecisionCommand } from "@/domain/decisions/types";
import type { FsmCommandEnvelope } from "@/domain/operations/types";

/** Frozen FSM still requires the demo actor role. Production actor is stored separately. */
export function toDecisionCommand(
  envelope: FsmCommandEnvelope,
  simulatedAt: string,
): DecisionCommand {
  switch (envelope.type) {
    case "AcknowledgeDecision":
      return {
        type: "AcknowledgeDecision",
        actor: "superintendent",
        simulatedAt,
        notes: envelope.notes,
      };
    case "ApproveDecision":
      return {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt,
        selectedActionSource: envelope.selectedActionSource ?? "primary",
        alternativeIndex: envelope.alternativeIndex,
        notes: envelope.notes,
      };
    case "RejectDecision":
      return {
        type: "RejectDecision",
        actor: "superintendent",
        simulatedAt,
        reason: envelope.reason ?? "",
        notes: envelope.notes,
      };
    case "ProceedAfterApproval":
      return {
        type: "ProceedAfterApproval",
        actor: "superintendent",
        simulatedAt,
        notes: envelope.notes,
      };
    case "MarkExecutionComplete":
      return {
        type: "MarkExecutionComplete",
        actor: "superintendent",
        simulatedAt,
        notes: envelope.notes,
      };
    case "AdvanceToVerification":
      return {
        type: "AdvanceToVerification",
        actor: "superintendent",
        simulatedAt,
        notes: envelope.notes,
      };
    case "BlockExecution":
      return {
        type: "BlockExecution",
        actor: "superintendent",
        simulatedAt,
        reason: envelope.reason ?? "",
        notes: envelope.notes,
      };
    case "RetryExecution":
      return {
        type: "RetryExecution",
        actor: "superintendent",
        simulatedAt,
        notes: envelope.notes,
      };
    case "CancelDecision":
      return {
        type: "CancelDecision",
        actor: "superintendent",
        simulatedAt,
        reason: envelope.reason,
        notes: envelope.notes,
      };
    case "VerifyDecision":
      return {
        type: "VerifyDecision",
        actor: "superintendent",
        simulatedAt,
        notes: envelope.notes,
      };
    case "FailVerification":
      return {
        type: "FailVerification",
        actor: "superintendent",
        simulatedAt,
        reason: envelope.reason ?? "",
        notes: envelope.notes,
      };
  }
}

export function capabilityForDecisionCommands(
  commands: readonly FsmCommandEnvelope[],
):
  | "decision:approve"
  | "decision:reject"
  | "decision:acknowledge"
  | "decision:execute"
  | "decision:verify" {
  const types = new Set(commands.map((item) => item.type));
  if (types.has("ApproveDecision") || types.has("ProceedAfterApproval")) {
    return "decision:approve";
  }
  if (types.has("RejectDecision") || types.has("CancelDecision")) {
    return "decision:reject";
  }
  if (types.has("AcknowledgeDecision")) {
    return "decision:acknowledge";
  }
  if (
    types.has("VerifyDecision") ||
    types.has("FailVerification")
  ) {
    return "decision:verify";
  }
  return "decision:execute";
}
