/**
 * Phase 3B Decision Store — owns DecisionRuntime only.
 *
 * Reads ReasoningRuntime for intake and proposal-fact lookup. Never mutates
 * ReasoningRuntime, RecommendationProposal, or ProjectSnapshot. All workflow
 * changes go through the Step 1 FSM (transitionDecision).
 *
 * syncFromReasoning prefers an explicit ReasoningRuntime argument so Command
 * Center orchestration can avoid relying on store-to-store reads. When omitted,
 * it reads useReasoningStore (decision → reasoning only; never the reverse).
 */

import { create } from "zustand";

import { applyCommandsToDecision } from "@/domain/decisions/applyCommands";
import {
  awaitingVerification,
  approved,
  blocked,
  decisionCounts,
  getDecisionById,
  getDecisionByRecommendationId,
  getDecisionsBySignalId,
  initialDecisionRuntime,
  intakeDecisions,
  pendingExecution,
  pendingReview,
  terminal,
  verified,
  type DecisionCounts,
  type DecisionRuntime,
} from "@/domain/decisions/runtime";
import type {
  DecisionTransitionError,
  OperationalDecision,
  SelectedActionSource,
} from "@/domain/decisions/types";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import { useReasoningStore } from "@/store/useReasoningStore";

export type DecisionActionResult =
  | { ok: true; decision: OperationalDecision }
  | { ok: false; error: DecisionTransitionError };

type ApproveInput = {
  simulatedAt: string;
  selectedActionSource?: SelectedActionSource;
  alternativeIndex?: number;
  notes?: string;
  /** When true (default), also apply ProceedAfterApproval after Approve. */
  proceed?: boolean;
};

type TimedInput = {
  simulatedAt: string;
  notes?: string;
};

type ReasonInput = TimedInput & {
  reason: string;
};

type CancelInput = TimedInput & {
  reason?: string;
};

type DecisionStoreState = {
  runtime: DecisionRuntime;
  /** Intake from an explicit ReasoningRuntime, or the current reasoning store. */
  syncFromReasoning: (reasoning?: ReasoningRuntime) => void;
  resetDecisions: () => void;

  approveDecision: (decisionId: string, input: ApproveInput) => DecisionActionResult;
  rejectDecision: (decisionId: string, input: ReasonInput) => DecisionActionResult;
  acknowledgeDecision: (decisionId: string, input: TimedInput) => DecisionActionResult;
  proceedAfterApproval: (decisionId: string, input: TimedInput) => DecisionActionResult;
  executeDecision: (
    decisionId: string,
    input: TimedInput & { advanceToVerification?: boolean },
  ) => DecisionActionResult;
  advanceToVerification: (decisionId: string, input: TimedInput) => DecisionActionResult;
  blockDecision: (decisionId: string, input: ReasonInput) => DecisionActionResult;
  retryDecision: (decisionId: string, input: TimedInput) => DecisionActionResult;
  cancelDecision: (decisionId: string, input: CancelInput) => DecisionActionResult;
  verifyDecision: (decisionId: string, input: TimedInput) => DecisionActionResult;
  failVerification: (decisionId: string, input: ReasonInput) => DecisionActionResult;

  pendingReview: () => OperationalDecision[];
  approved: () => OperationalDecision[];
  pendingExecution: () => OperationalDecision[];
  blocked: () => OperationalDecision[];
  awaitingVerification: () => OperationalDecision[];
  verified: () => OperationalDecision[];
  terminal: () => OperationalDecision[];
  byRecommendationId: (recommendationId: string) => OperationalDecision | undefined;
  bySignalId: (signalId: string) => OperationalDecision[];
  byId: (decisionId: string) => OperationalDecision | undefined;
  counts: () => DecisionCounts;
};

function commitCommands(
  get: () => DecisionStoreState,
  set: (partial: Partial<DecisionStoreState>) => void,
  decisionId: string,
  commands: Parameters<typeof applyCommandsToDecision>[2],
): DecisionActionResult {
  const before = get().runtime;
  const result = applyCommandsToDecision(before, decisionId, commands);
  if (!result.ok) return result;
  set({ runtime: result.runtime });
  return { ok: true, decision: result.decision };
}

export const useDecisionStore = create<DecisionStoreState>((set, get) => ({
  runtime: initialDecisionRuntime(),

  syncFromReasoning: (reasoning) => {
    const source = reasoning ?? useReasoningStore.getState().runtime;
    const runtime = intakeDecisions(source, get().runtime);
    set({ runtime });
  },

  resetDecisions: () => {
    set({ runtime: initialDecisionRuntime() });
  },

  approveDecision: (decisionId, input) => {
    const proceed = input.proceed !== false;
    const approveCmd = {
      type: "ApproveDecision" as const,
      actor: "superintendent" as const,
      simulatedAt: input.simulatedAt,
      selectedActionSource: input.selectedActionSource ?? "primary",
      alternativeIndex: input.alternativeIndex,
      notes: input.notes,
    };
    if (!proceed) {
      return commitCommands(get, set, decisionId, [approveCmd]);
    }
    return commitCommands(get, set, decisionId, [
      approveCmd,
      {
        type: "ProceedAfterApproval",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]);
  },

  rejectDecision: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "RejectDecision",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        reason: input.reason,
        notes: input.notes,
      },
    ]),

  acknowledgeDecision: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "AcknowledgeDecision",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]),

  proceedAfterApproval: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "ProceedAfterApproval",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]),

  executeDecision: (decisionId, input) => {
    const advance = input.advanceToVerification !== false;
    const mark = {
      type: "MarkExecutionComplete" as const,
      actor: "superintendent" as const,
      simulatedAt: input.simulatedAt,
      notes: input.notes,
    };
    if (!advance) {
      return commitCommands(get, set, decisionId, [mark]);
    }
    return commitCommands(get, set, decisionId, [
      mark,
      {
        type: "AdvanceToVerification",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]);
  },

  advanceToVerification: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "AdvanceToVerification",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]),

  blockDecision: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "BlockExecution",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        reason: input.reason,
        notes: input.notes,
      },
    ]),

  retryDecision: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "RetryExecution",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]),

  cancelDecision: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "CancelDecision",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        reason: input.reason,
        notes: input.notes,
      },
    ]),

  verifyDecision: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "VerifyDecision",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        notes: input.notes,
      },
    ]),

  failVerification: (decisionId, input) =>
    commitCommands(get, set, decisionId, [
      {
        type: "FailVerification",
        actor: "superintendent",
        simulatedAt: input.simulatedAt,
        reason: input.reason,
        notes: input.notes,
      },
    ]),

  pendingReview: () => pendingReview(get().runtime),
  approved: () => approved(get().runtime),
  pendingExecution: () => pendingExecution(get().runtime),
  blocked: () => blocked(get().runtime),
  awaitingVerification: () => awaitingVerification(get().runtime),
  verified: () => verified(get().runtime),
  terminal: () => terminal(get().runtime),
  byRecommendationId: (recommendationId) =>
    getDecisionByRecommendationId(get().runtime, recommendationId),
  bySignalId: (signalId) => getDecisionsBySignalId(get().runtime, signalId),
  byId: (decisionId) => getDecisionById(get().runtime, decisionId),
  counts: () => decisionCounts(get().runtime),
}));
