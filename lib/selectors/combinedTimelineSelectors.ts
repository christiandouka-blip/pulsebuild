/**
 * Presentation-only join of Phase 3A reasoning, Phase 3B decision audit, and
 * Phase 3C overlay/recovery histories.
 *
 * Pure: sources are read-only. Nothing is copied into any runtime.
 *
 * Ordering: simulated timestamp, then fixed source rank, then per-source
 * sequence, then id.
 *
 * Source ranks:
 *   0 reasoning
 *   1 decision
 *   2 overlay (applied / rejected effects)
 *   3 recovery (proven / reopened)
 *   4 score (Health recovery adjustment)
 */

import type { DecisionCommandType, OperationalDecision } from "@/domain/decisions";
import type {
  EffectApplicationResult,
  OperationalEffect,
} from "@/domain/effects/types";
import type { IssueRecoveryHistoryEvent } from "@/domain/recovery/history";
import type { ReasoningTimelineEvent } from "@/domain/types/timeline";

export type CombinedTimelineSource =
  | "reasoning"
  | "decision"
  | "overlay"
  | "recovery"
  | "score";

export type CombinedTimelineEntry = {
  id: string;
  source: CombinedTimelineSource;
  label: string;
  summary: string;
  simulatedAt: string;
  facts: string[];
};

export type CombinedTimelineExtras = {
  effectHistory?: readonly OperationalEffect[];
  applicationResults?: readonly EffectApplicationResult[];
  recoveryHistory?: readonly IssueRecoveryHistoryEvent[];
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
  extras: CombinedTimelineExtras = {},
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
        "Workflow verification records superintendent confirmation only.",
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

  const effectById = new Map(
    (extras.effectHistory ?? []).map((effect) => [effect.id, effect]),
  );
  (extras.applicationResults ?? []).forEach((result, index) => {
    const overlayEntry = overlayTimelineEntry(result, effectById, index);
    if (overlayEntry) sortable.push(overlayEntry);
  });

  (extras.recoveryHistory ?? []).forEach((event, index) => {
    sortable.push(recoveryTimelineEntry(event, index));
    if (event.type === "Recovered") {
      sortable.push(healthAdjustmentTimelineEntry(event, index));
    }
  });

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

function overlayTimelineEntry(
  result: EffectApplicationResult,
  effectById: ReadonlyMap<string, OperationalEffect>,
  sequence: number,
): SortableEntry | null {
  if (result.outcome === "AlreadyApplied") return null;

  if (result.outcome === "Applied") {
    return {
      sourceRank: 2,
      sequence,
      entry: {
        id: `overlay-applied-${result.record.effectId}`,
        source: "overlay",
        label: "Operational effect applied",
        summary: `${result.record.effectType} applied to ${result.record.entityId}`,
        simulatedAt: result.record.simulatedAt,
        facts: result.record.changes.map(
          (change) =>
            `${change.field}: ${String(change.previousValue)} → ${String(change.newValue)}`,
        ),
      },
    };
  }

  const effect = effectById.get(result.effectId);
  const simulatedAt = effect?.simulatedAt;
  if (!simulatedAt) return null;

  return {
    sourceRank: 2,
    sequence,
    entry: {
      id: `overlay-rejected-${result.effectId}`,
      source: "overlay",
      label: "Operational effect rejected",
      summary: `${result.code}: ${result.message}`,
      simulatedAt,
      facts: [`Effect ${result.effectId} was not written to the effective project world.`],
    },
  };
}

function recoveryTimelineEntry(
  event: IssueRecoveryHistoryEvent,
  sequence: number,
): SortableEntry {
  const provenAgain = event.type === "Recovered" && event.episodeNumber > 1;
  const label =
    event.type === "Reopened"
      ? "Operational issue reopened"
      : provenAgain
        ? "Operational recovery proven again"
        : "Operational recovery proven";
  const summary =
    event.type === "Reopened"
      ? `Issue ${event.issueId} is active again (episode ${event.episodeNumber}).`
      : `Issue ${event.issueId} recovered under ${event.verificationRuleId} (episode ${event.episodeNumber}).`;

  return {
    sourceRank: 3,
    sequence,
    entry: {
      id: event.id,
      source: "recovery",
      label,
      summary,
      simulatedAt: event.simulatedAt,
      facts: [
        "Operational verification uses effective project facts, not workflow confirmation.",
        `Rule · ${event.verificationRuleId}`,
        ...event.evidence.map((fact) => fact.fact),
      ],
    },
  };
}

function healthAdjustmentTimelineEntry(
  event: IssueRecoveryHistoryEvent,
  sequence: number,
): SortableEntry {
  return {
    sourceRank: 4,
    sequence,
    entry: {
      id: `score-health-${event.id}`,
      source: "score",
      label: "Health recovery adjustment",
      summary: `Verified operational recovery (${event.issueId}) · +5 Health. This is not full project recovery.`,
      simulatedAt: event.simulatedAt,
      facts: [
        "One currently recovered issue earns one +5 Health bonus.",
        "Historical episode count does not multiply the bonus.",
      ],
    },
  };
}
