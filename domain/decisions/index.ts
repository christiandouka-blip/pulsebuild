export type {
  AcknowledgeDecisionCommand,
  AdvanceToVerificationCommand,
  ApproveDecisionCommand,
  BlockExecutionCommand,
  CancelDecisionCommand,
  DecisionActorRole,
  DecisionAuditEvent,
  DecisionCommand,
  DecisionCommandType,
  DecisionState,
  DecisionTransitionError,
  DecisionTransitionErrorCode,
  DecisionTransitionFailure,
  DecisionTransitionResult,
  DecisionTransitionSuccess,
  FailVerificationCommand,
  MarkExecutionCompleteCommand,
  OperationalDecision,
  ProceedAfterApprovalCommand,
  ProposalActionFact,
  ProposalFacts,
  RejectDecisionCommand,
  RetryExecutionCommand,
  SelectedActionSource,
  VerifyDecisionCommand,
} from "@/domain/decisions/types";

export { TERMINAL_DECISION_STATES } from "@/domain/decisions/types";

/** Structured action identity re-exported for decision-side consumers. */
export type {
  RecommendationActionDescriptor,
  RecommendationSubjectEntityType,
} from "@/domain/types/recommendation";

export {
  createOperationalDecision,
  transitionDecision,
  type CreateOperationalDecisionInput,
} from "@/domain/decisions/transition";

export {
  allowedCommandsForState,
  canAcknowledge,
  canAdvanceToVerification,
  canApprove,
  canBlock,
  canCancel,
  canExecute,
  canFailVerification,
  canProceedAfterApproval,
  canReject,
  canRetryExecution,
  canVerify,
  isTerminalDecisionState,
  probeProposalFacts,
} from "@/domain/decisions/selectors";

export {
  buildProposalFacts,
  inferMutatesOperationalState,
} from "@/domain/decisions/proposalFacts";

export {
  awaitingVerification,
  approved,
  blocked,
  decisionCounts,
  decisionsInState,
  getDecisionById,
  getDecisionByRecommendationId,
  getDecisionsBySignalId,
  initialDecisionRuntime,
  intakeDecisions,
  pendingExecution,
  pendingReview,
  replaceDecision,
  terminal,
  verified,
  type DecisionCounts,
  type DecisionRuntime,
} from "@/domain/decisions/runtime";

export {
  applyCommandsToDecision,
  type ApplyCommandsResult,
} from "@/domain/decisions/applyCommands";
