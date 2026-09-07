/**
 * Phase 4C Agent Chat orchestration.
 *
 * Assembles a fresh AgentContext from current Command Center runtimes and
 * submits a question through useAgentStore.ask(). Does not advance the
 * workflow clock and does not mutate operational runtimes.
 */

import type { AgentContext, AgentResponse } from "@/domain/agent/types";
import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import { ensureCommandCenterInitialized } from "@/lib/orchestration/commandCenter";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import { useAgentStore } from "@/store/useAgentStore";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";

export type AskPulseBuildAgentResult =
  | { ok: true; response: AgentResponse }
  | { ok: false; code: "EMPTY_QUESTION" | "CONTEXT_UNAVAILABLE" };

export function normalizeAgentQuestion(raw: string): string {
  return raw.trim();
}

export function canSubmitAgentQuestion(raw: string): boolean {
  return normalizeAgentQuestion(raw).length > 0;
}

/**
 * Read-only assembly of the current operational world into AgentContext.
 * Callers must not persist the result in Agent history.
 */
export function currentAgentContext(): AgentContext | null {
  ensureCommandCenterInitialized();
  const overlay = useOverlayStore.getState().runtime;
  const recovery = useRecoveryStore.getState().runtime;
  const clock = useSimulatedClockStore.getState().clock;
  if (!overlay || !recovery || !clock) return null;

  const reasoning = useReasoningStore.getState().runtime;
  const decisions = useDecisionStore.getState().runtime;
  const evaluationSimulatedAt = currentSimulatedAt(clock);
  const timeline = joinOperationalTimeline(
    reasoning.timeline,
    decisions.decisions,
    {
      effectHistory: overlay.effectHistory,
      applicationResults: overlay.applicationResults,
      recoveryHistory: recovery.history,
    },
  );

  return buildAgentContext({
    reasoning,
    decisions,
    overlay,
    recovery,
    evaluationSimulatedAt,
    timeline,
  });
}

export function askPulseBuildAgent(rawQuestion: string): AskPulseBuildAgentResult {
  const question = normalizeAgentQuestion(rawQuestion);
  if (question.length === 0) {
    return { ok: false, code: "EMPTY_QUESTION" };
  }
  const context = currentAgentContext();
  if (!context) {
    return { ok: false, code: "CONTEXT_UNAVAILABLE" };
  }
  const response = useAgentStore.getState().ask({ question, context });
  return { ok: true, response };
}
