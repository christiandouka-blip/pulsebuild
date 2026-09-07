/**
 * Phase 4B explainer contract.
 *
 * Receives AgentContext only. Does not read runtimes, stores, or engines.
 * A later language-model adapter must implement this same interface.
 */

import type { AgentContext, AgentResponse } from "@/domain/agent/types";

export type AgentResponseIdentity = {
  id: string;
};

export type AgentExplainer = {
  explain(
    question: string,
    context: AgentContext,
    responseIdentity: AgentResponseIdentity,
  ): AgentResponse;
};

const LLM_UNAVAILABLE =
  "External language-model explanation is not enabled.";

/**
 * Dormant LLM boundary. Always unavailable. No network, no keys, no SDK.
 */
export const unavailableLlmExplainer: AgentExplainer = {
  explain(question, context, responseIdentity) {
    return {
      id: responseIdentity.id,
      question,
      answerText: LLM_UNAVAILABLE,
      grounding: "unavailable",
      evidenceRefs: [],
      relatedSignalIds: [],
      relatedIssueIds: [],
      relatedRecommendationIds: [],
      relatedDecisionIds: [],
      relatedTimelineEventIds: [],
      generatedAtSimulated: context.evaluationSimulatedAt,
      unsupportedReason: LLM_UNAVAILABLE,
    };
  },
};
