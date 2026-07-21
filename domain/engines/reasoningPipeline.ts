import { analyzeDependency } from "@/domain/engines/dependencyEngine";
import { buildContext } from "@/domain/engines/contextBuilder";
import { computeDrift } from "@/domain/engines/driftEngine";
import { computeHealth } from "@/domain/engines/healthEngine";
import {
  openIssueIdleScope,
  resolveIdleCrewIds,
} from "@/domain/engines/idleCrewRisk";
import { classifyPriority } from "@/domain/engines/priorityEngine";
import { intakeObservation } from "@/domain/engines/observationIntake";
import { markPrioritized, normalizeSignal } from "@/domain/engines/signalEngine";
import { predict } from "@/domain/engines/predictionEngine";
import { recommend } from "@/domain/engines/recommendationEngine";
import { healthBand } from "@/domain/constants/scoringConstants";
import type { TaskId } from "@/domain/types/identifiers";
import type {
  DependencyImpact,
  PredictionResult,
  PriorityResult,
} from "@/domain/types/analysis";
import type { OperationalIssue } from "@/domain/types/issue";
import type { RecommendationProposal } from "@/domain/types/recommendation";
import type { DriftResult, HealthResult } from "@/domain/types/scoring";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { ReasoningTimelineEvent } from "@/domain/types/timeline";

const POSITIVE_TYPES = new Set(["TaskComplete", "DeliveryReceived"]);

/** Per-signal aggregate of approved runtime models (store/pipeline grouping only). */
export type SignalReasoning = {
  signal: ProjectSignal;
  dependency: DependencyImpact;
  priority: PriorityResult;
  prediction: PredictionResult;
  recommendation: RecommendationProposal | null;
  issue: OperationalIssue | null;
};

export type ReasoningRuntime = {
  reasonings: SignalReasoning[];
  health: HealthResult;
  drift: DriftResult;
  timeline: ReasoningTimelineEvent[];
  processedFixtureIds: string[];
};

/** Baseline runtime — PO Decision 6: Health 100, Drift 0, before any observation. */
export function initialRuntime(): ReasoningRuntime {
  return {
    reasonings: [],
    health: {
      score: 100,
      band: healthBand(100),
      explanation: "No active operational issues.",
      breakdown: [],
    },
    drift: {
      score: 0,
      label: "Normal",
      explanation: "Project aligned with plan.",
      breakdown: [],
      contributingEntityIds: [],
    },
    timeline: [],
    processedFixtureIds: [],
  };
}

/** Return the next unprocessed fixture by sequenceOrder, or null when exhausted. */
export function nextFixtureId(
  snapshot: ProjectSnapshot,
  runtime: ReasoningRuntime,
): string | null {
  const remaining = snapshot.scenarioFixtures
    .filter((f) => !runtime.processedFixtureIds.includes(f.id))
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return remaining.length > 0 ? remaining[0].id : null;
}

/**
 * Process exactly one observation through the authorized deterministic pipeline:
 * Observation → Signal → Context → Dependency → Priority → Prediction →
 * Recommendation → Health → Drift → Timeline. Pure: returns a new runtime and
 * never mutates the snapshot or the previous runtime.
 */
export function processNextObservation(
  snapshot: ProjectSnapshot,
  runtime: ReasoningRuntime,
): ReasoningRuntime {
  const fixtureId = nextFixtureId(snapshot, runtime);
  if (fixtureId === null) return runtime;
  const fixture = snapshot.scenarioFixtures.find((f) => f.id === fixtureId);
  if (!fixture) return runtime;

  const intake = intakeObservation(snapshot, fixture, runtime.processedFixtureIds);
  const processedFixtureIds = [...runtime.processedFixtureIds, fixture.id];
  if (!intake.ok || intake.signal === null) {
    return { ...runtime, processedFixtureIds };
  }

  const context = buildContext(snapshot);
  let signal = normalizeSignal(intake.signal);
  const dependency = analyzeDependency(signal, snapshot);
  const priority = classifyPriority(signal, snapshot, context, dependency);
  signal = markPrioritized(signal);
  const prediction = predict(signal, snapshot, context, dependency, priority);

  const isPositive = POSITIVE_TYPES.has(signal.type);
  const issue: OperationalIssue | null = isPositive
    ? null
    : {
        id: `issue-${signal.id}`,
        signalId: signal.id,
        taskId: signal.relatedTaskId,
        kind: signal.type,
        status: "open",
        finalTier: priority.finalTier,
        openedAtSimulated: signal.observedAtSimulated,
      };

  const recommendation = recommend({
    signal,
    snapshot,
    context,
    dependency,
    priority,
    prediction,
    issueId: issue?.id ?? null,
  });

  const reasoning: SignalReasoning = {
    signal,
    dependency,
    priority,
    prediction,
    recommendation,
    issue,
  };
  const reasonings = [...runtime.reasonings, reasoning];

  const { health, drift } = recomputeScores(snapshot, reasonings, context);
  const timeline = [...runtime.timeline, ...buildTimelineEvents(reasoning)];

  return { reasonings, health, drift, timeline, processedFixtureIds };
}

function recomputeScores(
  snapshot: ProjectSnapshot,
  reasonings: SignalReasoning[],
  context: ReturnType<typeof buildContext>,
): { health: HealthResult; drift: DriftResult } {
  const openReasonings = reasonings.filter(
    (r) => r.issue !== null && r.issue.status === "open",
  );
  const openIssues = openReasonings.map((r) => r.issue as OperationalIssue);

  const affectedSet = new Set<TaskId>();
  for (const r of openReasonings) {
    for (const id of r.dependency.affectedTaskIds) affectedSet.add(id);
  }
  const affectedTaskIds = [...affectedSet];

  const unresolvedRecommendationCount = openReasonings.filter(
    (r) => r.recommendation !== null,
  ).length;

  const openIssueTaskIds = openIssues
    .map((issue) => issue.taskId)
    .filter((id): id is TaskId => id !== null);
  const idleCrewIds = resolveIdleCrewIds(
    snapshot,
    context,
    openIssueIdleScope(openIssueTaskIds),
  );

  const health = computeHealth({
    openIssues,
    affectedDownstreamTaskIds: affectedTaskIds,
    unresolvedRecommendationCount,
  });
  const drift = computeDrift({
    openIssues,
    affectedTaskIds,
    idleCrewRiskCount: idleCrewIds.length,
    unresolvedActionCount: 0,
  });
  return { health, drift };
}

function buildTimelineEvents(reasoning: SignalReasoning): ReasoningTimelineEvent[] {
  const { signal, dependency, priority, recommendation } = reasoning;
  const base = signal.sequenceOrder * 10;
  const events: ReasoningTimelineEvent[] = [
    {
      id: `tl-obs-${signal.id}`,
      kind: "observation",
      signalId: signal.id,
      summary: `Observed ${signal.type} for ${signal.relatedTaskId}`,
      facts: [`Source: ${signal.source}`, `Observed at ${signal.observedAtSimulated}`],
      committedAtSimulated: signal.observedAtSimulated,
      sequenceOrder: base,
    },
    {
      id: `tl-analysis-${signal.id}`,
      kind: "analysis",
      signalId: signal.id,
      summary: `Classified ${priority.finalTier}; ${dependency.affectedTaskIds.length} downstream affected`,
      facts: [
        `Baseline hint ${priority.baselineHint} → final ${priority.finalTier}`,
        `Cascade depth ${dependency.cascadeDepth}`,
        `Confidence ${priority.confidence.category}`,
      ],
      committedAtSimulated: signal.observedAtSimulated,
      sequenceOrder: base + 1,
    },
  ];
  if (recommendation) {
    events.push({
      id: `tl-rec-${signal.id}`,
      kind: "recommendation",
      signalId: signal.id,
      summary: recommendation.primaryAction,
      facts: [
        recommendation.approval.required
          ? `Approval required: ${recommendation.approval.reason ?? ""}`
          : "No approval required",
        `Confidence ${recommendation.confidence.category}`,
      ],
      committedAtSimulated: signal.observedAtSimulated,
      sequenceOrder: base + 2,
    });
  }
  return events;
}
