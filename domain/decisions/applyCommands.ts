/**
 * Pure multi-command application against DecisionRuntime.
 * Used by the store so chained approve/execute stays transactional and testable.
 */

import { transitionDecision } from "@/domain/decisions/transition";
import {
  getDecisionById,
  replaceDecision,
  type DecisionRuntime,
} from "@/domain/decisions/runtime";
import type {
  DecisionCommand,
  DecisionTransitionError,
  OperationalDecision,
} from "@/domain/decisions/types";

export type ApplyCommandsResult =
  | { ok: true; runtime: DecisionRuntime; decision: OperationalDecision }
  | { ok: false; error: DecisionTransitionError };

/**
 * Apply commands in order. Commits only if every transition succeeds.
 * On any failure, returns the original runtime unchanged (caller must not set).
 */
export function applyCommandsToDecision(
  runtime: DecisionRuntime,
  decisionId: string,
  commands: readonly DecisionCommand[],
): ApplyCommandsResult {
  const start = getDecisionById(runtime, decisionId);
  if (!start) {
    return {
      ok: false,
      error: {
        code: "ACTION_NOT_FOUND",
        message: `Decision ${decisionId} not found in DecisionRuntime.`,
      },
    };
  }

  const facts = runtime.proposalFactsByRecommendationId[start.recommendationId];
  if (!facts) {
    return {
      ok: false,
      error: {
        code: "ACTION_NOT_FOUND",
        message: `Proposal facts missing for recommendation ${start.recommendationId}.`,
      },
    };
  }

  if (commands.length === 0) {
    return { ok: true, runtime, decision: start };
  }

  let current = start;
  for (const command of commands) {
    const result = transitionDecision(current, command, facts);
    if (!result.ok) return result;
    current = result.decision;
  }

  return {
    ok: true,
    runtime: replaceDecision(runtime, current),
    decision: current,
  };
}
