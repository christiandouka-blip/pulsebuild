/**
 * Presentation-only join of the Phase 3A reasoning timeline and Phase 3B
 * decision audit history.
 *
 * Pure: both sources are read-only and neither is copied into the other
 * runtime. Ordering is deterministic (simulated timestamp, then source rank,
 * then per-source sequence, then id).
 */

import type { DecisionCommandType, OperationalDecision } from "@/domain/decisions";
import type { ReasoningTimelineEvent } from "@/domain/types/timeline";

export type CombinedTimelineSource = "reasoning" | "decision";

export type CombinedTimelineEntry = {
  id: string;
  source: CombinedTimelineSource;
  label: string;
  summary: string;
  simulatedAt: string;
  facts: string[];
};

const REASONING_KIND_LABELS: Record<ReasoningTimelineEvent["kind"], string> = {
  observation: "Observation",
  analysis: "Analysis",
  recommendation: "Recommendation",
};

const DECISION_COMMAND_LABELS: Record<DecisionCommandType, string> = {
  AcknowledgeDecision: "Acknowledged",
  ApproveDecision: "Approved",
  RejectDecision: "Rejected",
  ProceedAfterApproval: "Approval advanced",
  MarkExecutionComplete: "Execution recorded",
  AdvanceToVerification: "Verification requested",
  BlockExecution: "Execution blocked",
  RetryExecution: "Execution retried",
  CancelDecision: "Cancelled",
  VerifyDecision: "Verification succeeded",
  FailVerification: "Verification failed",
};

export function decisionEventLabel(command: DecisionCommandType): string {
  return DECISION_COMMAND_LABELS[command];
}

type SortableEntry = {
  entry: CombinedTimelineEntry;
  sourceRank: number;
  sequence: number;
};

export function joinOperationalTimeline(
  events: readonly ReasoningTimelineEvent[],
  decisions: readonly OperationalDecision[],
): CombinedTimelineEntry[] {
  const sortable: SortableEntry[] = [];

  for (const event of events) {
    sortable.push({
      sourceRank: 0,
      sequence: event.sequenceOrder,
      entry: {
        id: event.id,
        source: "reasoning",
        label: REASONING_KIND_LABELS[event.kind],
        summary: event.summary,
        simulatedAt: event.committedAtSimulated,
        facts: [...event.facts],
      },
    });
  }

  for (const decision of decisions) {
    decision.auditTrail.forEach((audit, index) => {
      const facts = [
        `Decision ${decision.id} · ${audit.fromState} → ${audit.toState}`,
        `Actor · ${audit.actor}`,
      ];
      if (decision.selectedAction) {
        facts.push(`Selected action · ${decision.selectedAction}`);
      }
      if (audit.reason) facts.push(`Reason · ${audit.reason}`);
      if (audit.notes) facts.push(`Notes · ${audit.notes}`);

      sortable.push({
        sourceRank: 1,
        sequence: index,
        entry: {
          id: audit.id,
          source: "decision",
          label: decisionEventLabel(audit.command),
          summary: `${decisionEventLabel(audit.command)} for ${decision.recommendationId}`,
          simulatedAt: audit.simulatedAt,
          facts,
        },
      });
    });
  }

  sortable.sort((a, b) => {
    if (a.entry.simulatedAt !== b.entry.simulatedAt) {
      return a.entry.simulatedAt < b.entry.simulatedAt ? -1 : 1;
    }
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.entry.id.localeCompare(b.entry.id);
  });

  return sortable.map((item) => item.entry);
}
