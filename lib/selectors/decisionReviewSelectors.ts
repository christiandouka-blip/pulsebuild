/**
 * Presentation joins for Phase 3B decision review.
 * Pure — reads ReasoningRuntime + DecisionRuntime; never mutates.
 */

import {
  isTerminalDecisionState,
  type DecisionRuntime,
  type OperationalDecision,
  type ProposalActionFact,
  type ProposalFacts,
  type SelectedActionSource,
} from "@/domain/decisions";
import type { SignalReasoning } from "@/domain/engines/reasoningPipeline";
import type { RecommendationProposal } from "@/domain/types/recommendation";
import type { PriorityTier } from "@/domain/types/signal";
import type { ConfidenceCategory } from "@/domain/types/reasoning";

export type ActionSelection = {
  source: SelectedActionSource;
  alternativeIndex?: number;
};

export type DecisionReviewItem = {
  recommendation: RecommendationProposal;
  decision: OperationalDecision | null;
  proposalFacts: ProposalFacts | null;
  signalId: string;
  signalType: string;
  finalTier: PriorityTier;
  confidence: ConfidenceCategory;
  observedAtSimulated: string;
  expectedBenefit: string;
};

export function joinDecisionReviews(
  reasonings: readonly SignalReasoning[],
  decisionRuntime: DecisionRuntime,
): DecisionReviewItem[] {
  const items: DecisionReviewItem[] = [];

  for (const entry of reasonings) {
    const recommendation = entry.recommendation;
    if (!recommendation) continue;

    const decision =
      decisionRuntime.decisions.find(
        (d) => d.recommendationId === recommendation.id,
      ) ?? null;

    items.push({
      recommendation,
      decision,
      proposalFacts:
        decisionRuntime.proposalFactsByRecommendationId[recommendation.id] ?? null,
      signalId: entry.signal.id,
      signalType: entry.signal.type,
      finalTier: entry.priority.finalTier,
      confidence: recommendation.confidence.category,
      observedAtSimulated: entry.signal.observedAtSimulated,
      expectedBenefit: recommendation.expectedBenefit,
    });
  }

  return items.sort((a, b) =>
    a.recommendation.id.localeCompare(b.recommendation.id),
  );
}

export function resolveSelectedActionFact(
  facts: ProposalFacts,
  selection: ActionSelection,
): ProposalActionFact | null {
  if (selection.source === "primary") {
    return facts.primaryAction;
  }
  if (selection.alternativeIndex === undefined) return null;
  return facts.alternatives[selection.alternativeIndex] ?? null;
}

export function actionKindLabel(mutatesOperationalState: boolean): string {
  return mutatesOperationalState ? "Operational action" : "Advisory action";
}

export function canShowReviewControls(decision: OperationalDecision | null): boolean {
  if (!decision) return false;
  return decision.state === "PendingReview";
}

export function formatDecisionError(
  code: string,
  message: string,
): string {
  switch (code) {
    case "INVALID_TRANSITION":
      return `Invalid transition: ${message}`;
    case "DECISION_ALREADY_TERMINAL":
      return `Decision already completed: ${message}`;
    case "MISSING_REASON":
      return `Rejection reason required: ${message}`;
    case "ACTION_NOT_FOUND":
      return `Action no longer available: ${message}`;
    case "APPROVAL_REQUIRED":
    case "APPROVAL_NOT_REQUIRED":
    case "ACTION_TYPE_MISMATCH":
    case "INVALID_TIMESTAMP":
      return message;
    default:
      return message;
  }
}

export function reviewEmptyMessage(
  reasonings: readonly SignalReasoning[],
  items: readonly DecisionReviewItem[],
): { title: string; description: string } {
  const withRec = reasonings.some((r) => r.recommendation !== null);
  if (!withRec) {
    return {
      title: "No recommendations processed",
      description:
        "Process the next observation to generate deterministic recommendations for superintendent review.",
    };
  }

  const missingIntake = items.some((i) => i.decision === null);
  if (missingIntake) {
    return {
      title: "Decision intake pending",
      description:
        "Recommendations exist, but decision records have not been synced yet. Process or re-sync to open review items.",
    };
  }

  const pending = items.filter((i) => i.decision?.state === "PendingReview");
  if (pending.length === 0) {
    return {
      title: "No pending reviews",
      description:
        "All recommendations have been acknowledged, approved, or rejected. Terminal decisions no longer accept review actions.",
    };
  }

  return {
    title: "Decision review",
    description: "Review pending recommendations and record a superintendent decision.",
  };
}

export function isTerminalReviewItem(item: DecisionReviewItem): boolean {
  return item.decision !== null && isTerminalDecisionState(item.decision.state);
}
