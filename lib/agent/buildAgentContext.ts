/**
 * Phase 4A AgentContext builder — pure read of frozen operational runtimes.
 *
 * Does not write runtimes, does not recompute Health/Drift, does not advance
 * the workflow clock, and does not generate conversational answers.
 */

import type {
  AgentChangedFactView,
  AgentContext,
  AgentDecisionView,
  AgentOpenIssueView,
  AgentRecoveredIssueView,
  AgentRecommendationView,
  AgentRecoveryHistoryView,
  AgentSignalView,
  AgentTimelineSource,
  AgentTimelineView,
} from "@/domain/agent/types";
import type { DecisionRuntime } from "@/domain/decisions/runtime";
import type { OverlayRuntime } from "@/domain/effects/runtime";
import type { OperationalEffectType } from "@/domain/effects/types";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { CombinedTimelineEntry } from "@/lib/selectors/combinedTimelineSelectors";
import { recoverySummaryView } from "@/lib/selectors/recoveryPresentationSelectors";

export type BuildAgentContextInput = {
  reasoning: ReasoningRuntime;
  decisions: DecisionRuntime;
  overlay: OverlayRuntime;
  recovery: RecoveryRuntime;
  /** Current workflow clock instant. Copied read-only. */
  evaluationSimulatedAt: string;
  /** Existing combined timeline. Not rebuilt here. */
  timeline: readonly CombinedTimelineEntry[];
};

const TIMELINE_SOURCES: ReadonlySet<AgentTimelineSource> = new Set([
  "reasoning",
  "decision",
  "overlay",
  "recovery",
  "score",
]);

export function buildAgentContext(input: BuildAgentContextInput): AgentContext {
  const { reasoning, decisions, overlay, recovery, evaluationSimulatedAt, timeline } =
    input;

  const recoveredIds = new Set(recovery.currentlyRecoveredIssueIds);
  const summary = recoverySummaryView(reasoning, recovery);

  return {
    evaluationSimulatedAt,
    health: {
      score: recovery.scores.health.score,
      band: recovery.scores.health.band,
      explanation: recovery.scores.health.explanation,
    },
    drift: {
      score: recovery.scores.drift.score,
      label: recovery.scores.drift.label,
      explanation: recovery.scores.drift.explanation,
    },
    recoverySummary: {
      currentlyOpenCount: summary.currentlyOpenCount,
      currentlyRecoveredCount: summary.currentlyRecoveredCount,
      historicalRecoveredEpisodeCount: summary.historicalRecoveredEpisodeCount,
      currentlyReopenedCount: summary.currentlyReopenedCount,
    },
    openIssues: collectOpenIssues(reasoning, recoveredIds),
    currentlyRecoveredIssues: collectRecoveredIssues(reasoning, recovery),
    signals: collectSignals(reasoning),
    recommendations: collectRecommendations(reasoning),
    decisions: collectDecisions(decisions, recoveredIds),
    changedFacts: collectChangedFacts(overlay),
    recoveryHistory: collectRecoveryHistory(recovery),
    timeline: collectTimeline(timeline),
  };
}

function collectOpenIssues(
  reasoning: ReasoningRuntime,
  recoveredIds: ReadonlySet<string>,
): AgentOpenIssueView[] {
  const issues: AgentOpenIssueView[] = [];
  for (const entry of reasoning.reasonings) {
    if (entry.issue === null) continue;
    issues.push({
      issueId: entry.issue.id,
      kind: entry.issue.kind,
      tier: entry.issue.finalTier,
      signalId: entry.issue.signalId,
      taskId: entry.issue.taskId,
      historicalStatus: entry.issue.status,
      currentlyRecovered: recoveredIds.has(entry.issue.id),
    });
  }
  return issues;
}

function collectRecoveredIssues(
  reasoning: ReasoningRuntime,
  recovery: RecoveryRuntime,
): AgentRecoveredIssueView[] {
  const byIssue = new Map(
    reasoning.reasonings
      .filter((entry) => entry.issue !== null)
      .map((entry) => [entry.issue!.id, entry]),
  );

  const recovered: AgentRecoveredIssueView[] = [];
  for (const issueId of recovery.currentlyRecoveredIssueIds) {
    const entry = byIssue.get(issueId);
    const latest = latestRecoveredHistory(recovery, issueId);
    const verification = recovery.verificationResults.find(
      (result) => result.issueId === issueId && result.outcome === "Recovered",
    );
    recovered.push({
      issueId,
      signalId: entry?.issue?.signalId ?? latest?.signalId ?? issueId,
      verificationRuleId:
        verification && verification.outcome === "Recovered"
          ? verification.verificationRuleId
          : (latest?.verificationRuleId ?? null),
      currentlyRecovered: true,
      latestEpisodeNumber: latest?.episodeNumber ?? null,
      latestRecoveredSimulatedAt: latest?.simulatedAt ?? null,
    });
  }
  return recovered;
}

function latestRecoveredHistory(
  recovery: RecoveryRuntime,
  issueId: string,
) {
  let latest: RecoveryRuntime["history"][number] | null = null;
  for (const event of recovery.history) {
    if (event.type === "Recovered" && event.issueId === issueId) {
      latest = event;
    }
  }
  return latest;
}

function collectSignals(reasoning: ReasoningRuntime): AgentSignalView[] {
  return reasoning.reasonings.map((entry) => ({
    signalId: entry.signal.id,
    type: entry.signal.type,
    finalTier: entry.priority.finalTier,
    summary: entry.prediction.projectedConsequence,
    relatedEntityType: entry.signal.relatedEntityType,
    relatedEntityId: entry.signal.relatedEntityId,
    relatedTaskId: entry.signal.relatedTaskId,
  }));
}

function collectRecommendations(
  reasoning: ReasoningRuntime,
): AgentRecommendationView[] {
  const recommendations: AgentRecommendationView[] = [];
  for (const entry of reasoning.reasonings) {
    if (entry.recommendation === null) continue;
    const proposal = entry.recommendation;
    recommendations.push({
      recommendationId: proposal.id,
      signalId: proposal.signalId,
      issueId: proposal.issueId,
      primaryAction: proposal.primaryAction,
      approvalRequired: proposal.approval.required,
      approvalReason: proposal.approval.reason,
      confidenceCategory: proposal.confidence.category,
      finalTier: entry.priority.finalTier,
      evidence: proposal.evidence.map((item) => ({
        entityType: item.entityType,
        entityId: item.entityId,
        fact: item.fact,
      })),
    });
  }
  return recommendations;
}

function collectDecisions(
  decisions: DecisionRuntime,
  recoveredIds: ReadonlySet<string>,
): AgentDecisionView[] {
  return decisions.decisions.map((decision) => {
    const superintendentConfirmed = decision.state === "Verified";
    return {
      decisionId: decision.id,
      recommendationId: decision.recommendationId,
      signalId: decision.signalId,
      issueId: decision.issueId,
      state: decision.state,
      selectedAction: decision.selectedAction,
      selectedActionSource: decision.selectedActionSource,
      workflowVerification: {
        superintendentConfirmed,
        state: decision.state,
        summary: superintendentConfirmed
          ? "Workflow verification: superintendent confirmed the action was carried out."
          : `Workflow state is ${decision.state}; superintendent has not confirmed completion.`,
      },
      operationalRecovery: {
        relatedIssueId: decision.issueId,
        currentlyRecovered:
          decision.issueId !== null && recoveredIds.has(decision.issueId),
      },
    };
  });
}

function collectChangedFacts(overlay: OverlayRuntime): AgentChangedFactView[] {
  const facts: AgentChangedFactView[] = [];
  for (const record of overlay.effective.applied) {
    const entityType = entityTypeForEffect(record.effectType);
    if (entityType === null) continue;
    for (const change of record.changes) {
      facts.push({
        entityType,
        entityId: record.entityId,
        field: change.field,
        previousValue: stringifyValue(change.previousValue),
        newValue: stringifyValue(change.newValue),
        effectId: record.effectId,
        simulatedAt: record.simulatedAt,
      });
    }
  }
  return facts;
}

function entityTypeForEffect(
  effectType: OperationalEffectType,
): AgentChangedFactView["entityType"] | null {
  switch (effectType) {
    case "MaterialDeliveryReceived":
      return "material";
    case "TaskCompleted":
      return "task";
    case "CrewAssignmentChanged":
      return "crew";
    default: {
      const exhaustive: never = effectType;
      void exhaustive;
      return null;
    }
  }
}

function stringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function collectRecoveryHistory(
  recovery: RecoveryRuntime,
): AgentRecoveryHistoryView[] {
  return recovery.history.map((event) => ({
    eventId: event.id,
    type: event.type,
    issueId: event.issueId,
    verificationRuleId: event.verificationRuleId,
    episodeNumber: event.episodeNumber,
    simulatedAt: event.simulatedAt,
    evidence: event.evidence.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      fact: item.fact,
    })),
  }));
}

function collectTimeline(
  timeline: readonly CombinedTimelineEntry[],
): AgentTimelineView[] {
  return timeline.map((entry) => ({
    timelineEventId: entry.id,
    source: asTimelineSource(entry.source),
    label: entry.label,
    summary: entry.summary,
    simulatedAt: entry.simulatedAt,
    facts: [...entry.facts],
  }));
}

function asTimelineSource(source: CombinedTimelineEntry["source"]): AgentTimelineSource {
  if (TIMELINE_SOURCES.has(source)) return source;
  return "reasoning";
}
