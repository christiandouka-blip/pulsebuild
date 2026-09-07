/**
 * Deterministic mock explainer — the only enabled Phase 4B explanation path.
 *
 * Question wording selects a template. Operational facts come only from
 * AgentContext. No LLM, no engines, no stores.
 */

import type {
  AgentContext,
  AgentDecisionView,
  AgentEvidenceRef,
  AgentRecommendationView,
  AgentResponse,
} from "@/domain/agent/types";
import type { AgentExplainer, AgentResponseIdentity } from "@/lib/agent/explainer";

type Intent =
  | "whatHappened"
  | "blocker"
  | "tier1"
  | "nextAction"
  | "health"
  | "drift"
  | "recovered"
  | "recoveredHistory"
  | "unresolved"
  | "materialChange"
  | "recommendationEvidence"
  | "decisionStatus"
  | "recoveryTimeline";

const ACTIONABLE_STATES = new Set([
  "PendingReview",
  "Approved",
  "PendingExecution",
  "Blocked",
  "AwaitingVerification",
  "VerificationFailed",
]);

const INTENT_PHRASES: readonly { intent: Intent; phrase: string }[] = [
  { intent: "recoveryTimeline", phrase: "recovery timeline" },
  { intent: "recoveryTimeline", phrase: "recovery history" },
  { intent: "recoveredHistory", phrase: "recovered before" },
  { intent: "recoveredHistory", phrase: "historical recovery" },
  { intent: "recommendationEvidence", phrase: "evidence supports" },
  { intent: "recommendationEvidence", phrase: "recommendation evidence" },
  { intent: "recommendationEvidence", phrase: "evidence for this recommendation" },
  { intent: "materialChange", phrase: "material delivery" },
  { intent: "materialChange", phrase: "after the material" },
  { intent: "materialChange", phrase: "delivery received" },
  { intent: "nextAction", phrase: "what should i do next" },
  { intent: "nextAction", phrase: "what do i do next" },
  { intent: "nextAction", phrase: "next action" },
  { intent: "tier1", phrase: "why is this tier 1" },
  { intent: "tier1", phrase: "why tier 1" },
  { intent: "tier1", phrase: "tier 1" },
  { intent: "decisionStatus", phrase: "decision status" },
  { intent: "decisionStatus", phrase: "current decision" },
  { intent: "decisionStatus", phrase: "workflow verification" },
  { intent: "health", phrase: "why is health" },
  { intent: "health", phrase: "what is health" },
  { intent: "health", phrase: "health red" },
  { intent: "health", phrase: "health score" },
  { intent: "drift", phrase: "why is drift" },
  { intent: "drift", phrase: "what is drift" },
  { intent: "drift", phrase: "critical drift" },
  { intent: "drift", phrase: "drift high" },
  { intent: "unresolved", phrase: "still unresolved" },
  { intent: "unresolved", phrase: "still open" },
  { intent: "unresolved", phrase: "unresolved" },
  { intent: "recovered", phrase: "what recovered" },
  { intent: "blocker", phrase: "what is blocking" },
  { intent: "blocker", phrase: "whats blocking" },
  { intent: "blocker", phrase: "blocking" },
  { intent: "blocker", phrase: "blocker" },
  { intent: "whatHappened", phrase: "what happened" },
  { intent: "whatHappened", phrase: "what occurred" },
];

export const mockExplainer: AgentExplainer = {
  explain(question, context, responseIdentity) {
    const intent = classifyQuestion(question);
    if (intent === null) {
      return unsupported(question, context, responseIdentity);
    }
    return answerIntent(intent, question, context, responseIdentity);
  },
};

export function classifyQuestion(question: string): Intent | null {
  const normalized = normalizeQuestion(question);
  if (normalized.length === 0) return null;

  const hits: { intent: Intent; phrase: string }[] = [];
  for (const candidate of INTENT_PHRASES) {
    if (normalized.includes(candidate.phrase)) {
      hits.push(candidate);
    }
  }
  if (hits.length === 0) return null;

  const unique = [...new Set(hits.map((hit) => hit.intent))];
  if (unique.length === 1) return unique[0];

  let bestIntent: Intent | null = null;
  let bestLength = -1;
  let tie = false;
  for (const intent of unique) {
    const longest = hits
      .filter((hit) => hit.intent === intent)
      .reduce((max, hit) => Math.max(max, hit.phrase.length), 0);
    if (longest > bestLength) {
      bestLength = longest;
      bestIntent = intent;
      tie = false;
    } else if (longest === bestLength) {
      tie = true;
    }
  }
  return tie ? null : bestIntent;
}

function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function answerIntent(
  intent: Intent,
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  switch (intent) {
    case "whatHappened":
      return explainWhatHappened(question, context, identity);
    case "blocker":
      return explainBlockers(question, context, identity);
    case "tier1":
      return explainTier1(question, context, identity);
    case "nextAction":
      return explainNextAction(question, context, identity);
    case "health":
      return explainHealth(question, context, identity);
    case "drift":
      return explainDrift(question, context, identity);
    case "recovered":
      return explainRecovered(question, context, identity);
    case "recoveredHistory":
      return explainRecoveredHistory(question, context, identity);
    case "unresolved":
      return explainUnresolved(question, context, identity);
    case "materialChange":
      return explainMaterialChange(question, context, identity);
    case "recommendationEvidence":
      return explainRecommendationEvidence(question, context, identity);
    case "decisionStatus":
      return explainDecisionStatus(question, context, identity);
    case "recoveryTimeline":
      return explainRecoveryTimeline(question, context, identity);
  }
}

function explainWhatHappened(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  if (context.timeline.length === 0 && context.signals.length === 0) {
    return grounded(question, context, identity, {
      answerText:
        "No committed operational events are in the current session yet.",
      evidenceRefs: [],
    });
  }
  const lines = context.timeline.map(
    (event) => `${event.label}: ${event.summary}`,
  );
  return grounded(question, context, identity, {
    answerText:
      lines.length > 0
        ? `Committed operational events, in timeline order: ${lines.join(" ")}`
        : `Committed signals: ${context.signals.map((s) => s.type).join(", ")}.`,
    evidenceRefs: timelineEvidence(context),
    relatedSignalIds: context.signals.map((item) => item.signalId),
    relatedTimelineEventIds: context.timeline.map((item) => item.timelineEventId),
  });
}

function explainBlockers(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const active = context.openIssues.filter((issue) => !issue.currentlyRecovered);
  if (active.length === 0) {
    return grounded(question, context, identity, {
      answerText:
        context.openIssues.length === 0
          ? "No operational issues are present in the current session."
          : "No currently active operational blockers remain. Recovered issues are not current blockers.",
      evidenceRefs: issueEvidence(context.openIssues),
      relatedIssueIds: context.openIssues.map((item) => item.issueId),
      relatedSignalIds: context.openIssues.map((item) => item.signalId),
    });
  }
  const parts = active.map(
    (issue) =>
      `${issue.kind} (${issue.issueId}, ${issue.tier}) on task ${issue.taskId ?? "none"}`,
  );
  return grounded(question, context, identity, {
    answerText: `Currently active blockers: ${parts.join("; ")}.`,
    evidenceRefs: issueEvidence(active),
    relatedIssueIds: active.map((item) => item.issueId),
    relatedSignalIds: active.map((item) => item.signalId),
  });
}

function explainTier1(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const tier1Signals = context.signals.filter((item) => item.finalTier === "Tier1");
  if (tier1Signals.length === 0) {
    return grounded(question, context, identity, {
      answerText: "No committed Tier 1 signal is present in the current context.",
      evidenceRefs: [],
    });
  }
  const signal = tier1Signals[0];
  const rec = context.recommendations.find((item) => item.signalId === signal.signalId);
  const evidence = rec?.evidence ?? [];
  const evidenceText =
    evidence.length > 0
      ? evidence.map((item) => item.fact).join(" ")
      : signal.summary;
  return grounded(question, context, identity, {
    answerText: `${signal.type} (${signal.signalId}) is committed as ${signal.finalTier}. ${evidenceText}`,
    evidenceRefs:
      evidence.length > 0
        ? evidence
        : [
            {
              entityType: "signal",
              entityId: signal.signalId,
              fact: `${signal.type} final tier ${signal.finalTier}. ${signal.summary}`,
            },
          ],
    relatedSignalIds: [signal.signalId],
    relatedIssueIds: context.openIssues
      .filter((item) => item.signalId === signal.signalId)
      .map((item) => item.issueId),
    relatedRecommendationIds: rec ? [rec.recommendationId] : [],
  });
}

function explainNextAction(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const pending = selectNextRecommendation(context);
  if (pending === null) {
    return grounded(question, context, identity, {
      answerText: "No committed action is currently pending.",
      evidenceRefs: context.recommendations.flatMap((item) => item.evidence).slice(0, 3),
      relatedRecommendationIds: context.recommendations.map(
        (item) => item.recommendationId,
      ),
      relatedDecisionIds: context.decisions.map((item) => item.decisionId),
    });
  }
  const rec = pending.recommendation;
  const decision = pending.decision;
  const state = decision?.state ?? "intake pending";
  return grounded(question, context, identity, {
    answerText: `Committed next action: ${rec.primaryAction} (${rec.recommendationId}, ${rec.finalTier}, ${state}). This is an existing recommendation; no new action is proposed.`,
    evidenceRefs:
      rec.evidence.length > 0
        ? rec.evidence
        : [
            {
              entityType: "recommendation",
              entityId: rec.recommendationId,
              fact: rec.primaryAction,
            },
          ],
    relatedRecommendationIds: [rec.recommendationId],
    relatedSignalIds: [rec.signalId],
    relatedIssueIds: rec.issueId ? [rec.issueId] : [],
    relatedDecisionIds: decision ? [decision.decisionId] : [],
  });
}

function selectNextRecommendation(context: AgentContext): {
  recommendation: AgentRecommendationView;
  decision: AgentDecisionView | undefined;
} | null {
  const actionable = context.recommendations
    .map((recommendation) => ({
      recommendation,
      decision: context.decisions.find(
        (item) => item.recommendationId === recommendation.recommendationId,
      ),
    }))
    .filter((item) => isActionable(item.decision));

  const tier1 = actionable.find((item) => item.recommendation.finalTier === "Tier1");
  if (tier1) return tier1;
  if (actionable[0]) return actionable[0];

  const workflow = context.decisions.find((item) => isActionable(item));
  if (!workflow) return null;
  const recommendation = context.recommendations.find(
    (item) => item.recommendationId === workflow.recommendationId,
  );
  return recommendation ? { recommendation, decision: workflow } : null;
}

function isActionable(decision: AgentDecisionView | undefined): boolean {
  if (decision === undefined) return true;
  return ACTIONABLE_STATES.has(decision.state);
}

function explainHealth(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const { health, recoverySummary } = context;
  const recovered =
    recoverySummary.currentlyRecoveredCount === 1
      ? "1 blocker recovered"
      : `${recoverySummary.currentlyRecoveredCount} blockers recovered`;
  const remainder =
    recoverySummary.currentlyOpenCount === 0
      ? "no remaining open operational issues"
      : "other active risks remain";
  return grounded(question, context, identity, {
    answerText: `Effective Health is ${health.score} (${health.band}). ${health.explanation} ${recovered}; ${remainder}. A recovered blocker is not full project recovery.`,
    evidenceRefs: [
      ...issueEvidence(context.openIssues),
      ...recoveredIssueEvidence(context),
    ],
    relatedIssueIds: [
      ...context.openIssues.map((item) => item.issueId),
      ...context.currentlyRecoveredIssues.map((item) => item.issueId),
    ],
  });
}

function explainDrift(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const { drift } = context;
  return grounded(question, context, identity, {
    answerText: `Effective Drift is ${drift.score} (${drift.label}). ${drift.explanation} A recovered blocker is not full project recovery.`,
    evidenceRefs: issueEvidence(
      context.openIssues.filter((item) => !item.currentlyRecovered),
    ),
    relatedIssueIds: context.openIssues
      .filter((item) => !item.currentlyRecovered)
      .map((item) => item.issueId),
  });
}

function explainRecovered(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  if (context.currentlyRecoveredIssues.length === 0) {
    return grounded(question, context, identity, {
      answerText:
        "No issues are currently recovered. Historical recovery episodes are not current recovery truth.",
      evidenceRefs: context.recoveryHistory.map((event) => ({
        entityType: "recovery",
        entityId: event.eventId,
        fact: `${event.type} episode ${event.episodeNumber} for ${event.issueId}`,
      })),
      relatedIssueIds: [],
    });
  }
  const parts = context.currentlyRecoveredIssues.map(
    (issue) =>
      `${issue.issueId} under ${issue.verificationRuleId ?? "unspecified rule"} (episode ${issue.latestEpisodeNumber ?? "n/a"})`,
  );
  return grounded(question, context, identity, {
    answerText: `Currently recovered: ${parts.join("; ")}. Other active risks may remain.`,
    evidenceRefs: recoveredIssueEvidence(context),
    relatedIssueIds: context.currentlyRecoveredIssues.map((item) => item.issueId),
    relatedSignalIds: context.currentlyRecoveredIssues.map((item) => item.signalId),
  });
}

function explainRecoveredHistory(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  if (context.recoveryHistory.length === 0) {
    return grounded(question, context, identity, {
      answerText: "No recovery history episodes are recorded in the current session.",
      evidenceRefs: [],
    });
  }
  const parts = context.recoveryHistory.map(
    (event) =>
      `${event.type} ${event.issueId} episode ${event.episodeNumber} at ${event.simulatedAt}`,
  );
  return grounded(question, context, identity, {
    answerText: `Recovery history: ${parts.join("; ")}. Current recovery is separate from this log.`,
    evidenceRefs: context.recoveryHistory.map((event) => ({
      entityType: "recovery",
      entityId: event.eventId,
      fact: `${event.type} ${event.issueId} episode ${event.episodeNumber}`,
    })),
    relatedIssueIds: [...new Set(context.recoveryHistory.map((event) => event.issueId))],
    relatedTimelineEventIds: context.timeline
      .filter((item) => item.source === "recovery")
      .map((item) => item.timelineEventId),
  });
}

function explainUnresolved(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const active = context.openIssues.filter((issue) => !issue.currentlyRecovered);
  if (active.length === 0) {
    return grounded(question, context, identity, {
      answerText: "No currently unresolved operational issues remain.",
      evidenceRefs: issueEvidence(context.openIssues),
      relatedIssueIds: context.openIssues.map((item) => item.issueId),
    });
  }
  const parts = active.map(
    (issue) => `${issue.issueId} (${issue.kind}, ${issue.tier})`,
  );
  return grounded(question, context, identity, {
    answerText: `Currently unresolved: ${parts.join("; ")}.`,
    evidenceRefs: issueEvidence(active),
    relatedIssueIds: active.map((item) => item.issueId),
    relatedSignalIds: active.map((item) => item.signalId),
  });
}

function explainMaterialChange(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const facts = context.changedFacts.filter((fact) => fact.entityType === "material");
  if (facts.length === 0) {
    return unsupported(question, context, identity, {
      reason:
        "No material delivery change is present in the current effective overlay context.",
    });
  }
  const parts = facts.map(
    (fact) =>
      `${fact.entityId} ${fact.field} ${fact.previousValue} → ${fact.newValue}`,
  );
  return grounded(question, context, identity, {
    answerText: `Effective material changes: ${parts.join("; ")}.`,
    evidenceRefs: facts.map((fact) => ({
      entityType: "material",
      entityId: fact.entityId,
      fact: `${fact.field}: ${fact.previousValue} → ${fact.newValue}`,
    })),
  });
}

function explainRecommendationEvidence(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const rec =
    selectNextRecommendation(context)?.recommendation ?? context.recommendations[0];
  if (!rec) {
    return unsupported(question, context, identity, {
      reason: "No committed recommendation is present in the current context.",
    });
  }
  if (rec.evidence.length === 0) {
    return grounded(question, context, identity, {
      answerText: `Recommendation ${rec.recommendationId} has no structured evidence facts.`,
      evidenceRefs: [
        {
          entityType: "recommendation",
          entityId: rec.recommendationId,
          fact: rec.primaryAction,
        },
      ],
      relatedRecommendationIds: [rec.recommendationId],
      relatedSignalIds: [rec.signalId],
    });
  }
  return grounded(question, context, identity, {
    answerText: `Evidence for ${rec.recommendationId}: ${rec.evidence.map((item) => item.fact).join(" ")}`,
    evidenceRefs: rec.evidence,
    relatedRecommendationIds: [rec.recommendationId],
    relatedSignalIds: [rec.signalId],
    relatedIssueIds: rec.issueId ? [rec.issueId] : [],
  });
}

function explainDecisionStatus(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  if (context.decisions.length === 0) {
    return grounded(question, context, identity, {
      answerText: "No decision records are present in the current session.",
      evidenceRefs: [],
    });
  }
  const parts = context.decisions.map((decision) => {
    const operational = decision.operationalRecovery.currentlyRecovered
      ? "operational recovery currently proven"
      : "operational recovery not currently proven";
    return `${decision.decisionId}: current decision status ${decision.state}. Workflow verification: ${decision.workflowVerification.summary} Operational recovery: ${operational}.`;
  });
  return grounded(question, context, identity, {
    answerText: parts.join(" "),
    evidenceRefs: context.decisions.map((decision) => ({
      entityType: "decision",
      entityId: decision.decisionId,
      fact: `${decision.state}. ${decision.workflowVerification.summary}`,
    })),
    relatedDecisionIds: context.decisions.map((item) => item.decisionId),
    relatedIssueIds: context.decisions
      .map((item) => item.issueId)
      .filter((id): id is string => id !== null),
  });
}

function explainRecoveryTimeline(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
): AgentResponse {
  const recoveryEvents = context.timeline.filter(
    (item) => item.source === "recovery" || item.source === "score",
  );
  if (recoveryEvents.length === 0 && context.recoveryHistory.length === 0) {
    return grounded(question, context, identity, {
      answerText: "The recovery timeline has no committed recovery events yet.",
      evidenceRefs: [],
    });
  }
  const history = context.recoveryHistory.map(
    (event) =>
      `${event.type} ${event.issueId} episode ${event.episodeNumber} at ${event.simulatedAt}`,
  );
  const timeline = recoveryEvents.map((event) => `${event.label}: ${event.summary}`);
  return grounded(question, context, identity, {
    answerText: `Recovery timeline: ${[...history, ...timeline].join(" ")}`,
    evidenceRefs: [
      ...context.recoveryHistory.map((event) => ({
        entityType: "recovery",
        entityId: event.eventId,
        fact: `${event.type} ${event.issueId} episode ${event.episodeNumber}`,
      })),
      ...recoveryEvents.map((event) => ({
        entityType: "timeline",
        entityId: event.timelineEventId,
        fact: event.summary,
      })),
    ],
    relatedIssueIds: [...new Set(context.recoveryHistory.map((event) => event.issueId))],
    relatedTimelineEventIds: recoveryEvents.map((item) => item.timelineEventId),
  });
}

function grounded(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
  partial: {
    answerText: string;
    evidenceRefs: readonly AgentEvidenceRef[];
    relatedSignalIds?: readonly string[];
    relatedIssueIds?: readonly string[];
    relatedRecommendationIds?: readonly string[];
    relatedDecisionIds?: readonly string[];
    relatedTimelineEventIds?: readonly string[];
  },
): AgentResponse {
  const known = knownContextIds(context);
  return {
    id: identity.id,
    question,
    answerText: partial.answerText,
    grounding: "grounded",
    evidenceRefs: partial.evidenceRefs.filter((ref) => known.has(ref.entityId)),
    relatedSignalIds: (partial.relatedSignalIds ?? []).filter((id) => known.has(id)),
    relatedIssueIds: (partial.relatedIssueIds ?? []).filter((id) => known.has(id)),
    relatedRecommendationIds: (partial.relatedRecommendationIds ?? []).filter((id) =>
      known.has(id),
    ),
    relatedDecisionIds: (partial.relatedDecisionIds ?? []).filter((id) => known.has(id)),
    relatedTimelineEventIds: (partial.relatedTimelineEventIds ?? []).filter((id) =>
      known.has(id),
    ),
    generatedAtSimulated: context.evaluationSimulatedAt,
    unsupportedReason: null,
  };
}

function unsupported(
  question: string,
  context: AgentContext,
  identity: AgentResponseIdentity,
  extra?: { reason?: string },
): AgentResponse {
  return {
    id: identity.id,
    question,
    answerText:
      extra?.reason ??
      "That question is not supported by the current operational context.",
    grounding: "unsupported",
    evidenceRefs: [],
    relatedSignalIds: [],
    relatedIssueIds: [],
    relatedRecommendationIds: [],
    relatedDecisionIds: [],
    relatedTimelineEventIds: [],
    generatedAtSimulated: context.evaluationSimulatedAt,
    unsupportedReason:
      extra?.reason ??
      "The requested information is not present in AgentContext.",
  };
}

function issueEvidence(
  issues: readonly { issueId: string; kind: string; tier: string }[],
): AgentEvidenceRef[] {
  return issues.map((issue) => ({
    entityType: "issue",
    entityId: issue.issueId,
    fact: `${issue.kind} ${issue.tier}`,
  }));
}

function recoveredIssueEvidence(context: AgentContext): AgentEvidenceRef[] {
  return context.currentlyRecoveredIssues.map((issue) => ({
    entityType: "issue",
    entityId: issue.issueId,
    fact: `Currently recovered under ${issue.verificationRuleId ?? "unspecified rule"}`,
  }));
}

function timelineEvidence(context: AgentContext): AgentEvidenceRef[] {
  return context.timeline.map((event) => ({
    entityType: "timeline",
    entityId: event.timelineEventId,
    fact: event.summary,
  }));
}

function knownContextIds(context: AgentContext): Set<string> {
  const ids = new Set<string>();
  for (const item of context.openIssues) {
    ids.add(item.issueId);
    ids.add(item.signalId);
    if (item.taskId) ids.add(item.taskId);
  }
  for (const item of context.currentlyRecoveredIssues) {
    ids.add(item.issueId);
    ids.add(item.signalId);
  }
  for (const item of context.signals) {
    ids.add(item.signalId);
    ids.add(item.relatedEntityId);
    ids.add(item.relatedTaskId);
  }
  for (const item of context.recommendations) {
    ids.add(item.recommendationId);
    ids.add(item.signalId);
    if (item.issueId) ids.add(item.issueId);
    for (const evidence of item.evidence) ids.add(evidence.entityId);
  }
  for (const item of context.decisions) {
    ids.add(item.decisionId);
    ids.add(item.recommendationId);
    ids.add(item.signalId);
    if (item.issueId) ids.add(item.issueId);
  }
  for (const item of context.changedFacts) {
    ids.add(item.entityId);
    ids.add(item.effectId);
  }
  for (const item of context.recoveryHistory) {
    ids.add(item.eventId);
    ids.add(item.issueId);
  }
  for (const item of context.timeline) {
    ids.add(item.timelineEventId);
  }
  return ids;
}
