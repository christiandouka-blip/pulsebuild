import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import {
  initialDecisionRuntime,
  intakeDecisions,
} from "@/domain/decisions";
import {
  createEffectiveProjectSnapshot,
  initialOverlayRuntime,
  syncOverlayFromReasoning,
} from "@/domain/effects";
import {
  initialRecoveryRuntime,
  recomputeRecoveryRuntime,
} from "@/domain/recovery";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import {
  currentSimulatedAt,
  initialSimulatedClock,
} from "@/lib/orchestration/simulatedClock";
import type { OverlayRuntime } from "@/domain/effects/runtime";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { freshSnapshot } from "@/tests/engines/helpers";

const EVALUATION_AT = "2026-03-14T10:30:00.000Z";

function processAll(snapshot: ProjectSnapshot): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function mustRecovery(
  reasoning: ReasoningRuntime,
  overlay: OverlayRuntime,
): RecoveryRuntime {
  const result = recomputeRecoveryRuntime({
    history: [],
    currentlyRecoveredIssueIds: [],
    reasoning,
    effective: overlay.effective,
    evaluationSimulatedAt: EVALUATION_AT,
  });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.runtime;
}

function contextFor(
  snapshot: ProjectSnapshot,
  reasoning: ReasoningRuntime,
  overlay: OverlayRuntime,
  recovery: RecoveryRuntime,
) {
  const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
  const timeline = joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
    effectHistory: overlay.effectHistory,
    applicationResults: overlay.applicationResults,
    recoveryHistory: recovery.history,
  });
  return {
    decisions,
    timeline,
    context: buildAgentContext({
      reasoning,
      decisions,
      overlay,
      recovery,
      evaluationSimulatedAt: EVALUATION_AT,
      timeline,
    }),
  };
}

describe("buildAgentContext", () => {
  it("baseline AgentContext Health 100 / Drift 0", () => {
    const snapshot = freshSnapshot();
    const reasoning = initialRuntime();
    const overlay = initialOverlayRuntime(snapshot);
    const recovery = initialRecoveryRuntime(snapshot);
    const { context } = contextFor(snapshot, reasoning, overlay, recovery);
    expect(context.health.score).toBe(100);
    expect(context.health.band).toBe("green");
    expect(context.drift.score).toBe(0);
    expect(context.drift.label).toBe("Normal");
    expect(context.signals).toEqual([]);
    expect(context.openIssues).toEqual([]);
    expect(context.currentlyRecoveredIssues).toEqual([]);
  });

  it("post-five-fixture AgentContext Health 11 / Drift 120 before overlay recovery", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    expect(reasoning.health.score).toBe(11);
    expect(reasoning.drift.score).toBe(120);
    const overlay = initialOverlayRuntime(snapshot);
    const recovery = mustRecovery(reasoning, overlay);
    const { context } = contextFor(snapshot, reasoning, overlay, recovery);
    expect(context.health.score).toBe(11);
    expect(context.health.band).toBe("red");
    expect(context.drift.score).toBe(120);
    expect(context.drift.label).toBe("Critical Drift");
    expect(context.health.explanation.length).toBeGreaterThan(0);
    expect(context.drift.explanation.length).toBeGreaterThan(0);
    expect(context.recoverySummary.currentlyRecoveredCount).toBe(0);
    expect(context.recoverySummary.currentlyOpenCount).toBe(3);
    expect(context.openIssues).toHaveLength(3);
    expect(context.currentlyRecoveredIssues).toEqual([]);
  });

  it("recovered seeded AgentContext Health 41 / Drift 95 with recovery distinction", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    const recovery = mustRecovery(reasoning, overlay);
    const { context, decisions, timeline } = contextFor(
      snapshot,
      reasoning,
      overlay,
      recovery,
    );

    expect(context.health.score).toBe(41);
    expect(context.health.band).toBe("red");
    expect(context.drift.score).toBe(95);
    expect(context.drift.label).toBe("Critical Drift");
    expect(reasoning.health.score).toBe(11);
    expect(reasoning.drift.score).toBe(120);
    expect(context.recoverySummary.currentlyRecoveredCount).toBe(1);
    expect(context.recoverySummary.currentlyOpenCount).toBe(2);
    expect(context.recoverySummary.historicalRecoveredEpisodeCount).toBe(1);
    expect(context.recoverySummary.currentlyReopenedCount).toBe(0);

    const material = reasoning.reasonings.find(
      (entry) => entry.issue?.kind === "MaterialDeliveryDelayed",
    );
    expect(material?.issue).toBeTruthy();
    const openMaterial = context.openIssues.find(
      (issue) => issue.issueId === material!.issue!.id,
    );
    expect(openMaterial?.historicalStatus).toBe("open");
    expect(openMaterial?.currentlyRecovered).toBe(true);
    expect(material!.issue!.status).toBe("open");

    const recovered = context.currentlyRecoveredIssues.find(
      (issue) => issue.issueId === material!.issue!.id,
    );
    expect(recovered?.currentlyRecovered).toBe(true);
    expect(recovered?.verificationRuleId).toBe("VERIFY_MATERIAL_REQUIREMENT");
    expect(recovered?.latestEpisodeNumber).toBe(1);

    expect(context.signals.map((item) => item.signalId)).toEqual(
      reasoning.reasonings.map((entry) => entry.signal.id),
    );
    expect(context.recommendations.map((item) => item.recommendationId)).toEqual(
      reasoning.reasonings
        .filter((entry) => entry.recommendation !== null)
        .map((entry) => entry.recommendation!.id),
    );
    expect(context.decisions.map((item) => item.decisionId)).toEqual(
      decisions.decisions.map((item) => item.id),
    );

    const materialDecision = context.decisions.find(
      (item) => item.issueId === material!.issue!.id,
    );
    expect(materialDecision).toBeTruthy();
    expect(materialDecision!.workflowVerification.superintendentConfirmed).toBe(false);
    expect(materialDecision!.workflowVerification.state).toBe("PendingReview");
    expect(materialDecision!.operationalRecovery.currentlyRecovered).toBe(true);
    expect(materialDecision!.operationalRecovery.relatedIssueId).toBe(
      material!.issue!.id,
    );

    const baselineMaterial = snapshot.materials.find(
      (item) => item.id === material!.signal.relatedEntityId,
    );
    const effectiveMaterial = overlay.effective.snapshot.materials.find(
      (item) => item.id === material!.signal.relatedEntityId,
    );
    expect(baselineMaterial?.deliveryStatus).not.toBe("received");
    expect(effectiveMaterial?.deliveryStatus).toBe("received");
    const materialFact = context.changedFacts.find(
      (fact) =>
        fact.entityType === "material" &&
        fact.entityId === material!.signal.relatedEntityId &&
        fact.field === "deliveryStatus",
    );
    expect(materialFact?.newValue).toBe("received");
    expect(materialFact?.effectId).toBe(
      overlay.effective.applied.find(
        (record) =>
          record.effectType === "MaterialDeliveryReceived" &&
          record.entityId === material!.signal.relatedEntityId,
      )?.effectId,
    );

    const taskComplete = reasoning.reasonings.find(
      (entry) => entry.signal.type === "TaskComplete",
    );
    expect(taskComplete).toBeTruthy();
    const baselineTask = snapshot.tasks.find(
      (item) => item.id === taskComplete!.signal.relatedEntityId,
    );
    const effectiveTask = overlay.effective.snapshot.tasks.find(
      (item) => item.id === taskComplete!.signal.relatedEntityId,
    );
    expect(baselineTask?.status).not.toBe("Completed");
    expect(effectiveTask?.status).toBe("Completed");
    const taskFact = context.changedFacts.find(
      (fact) =>
        fact.entityType === "task" &&
        fact.entityId === taskComplete!.signal.relatedEntityId &&
        fact.field === "status",
    );
    expect(taskFact?.newValue).toBe("Completed");

    const crewFacts = context.changedFacts.filter((fact) => fact.entityType === "crew");
    const crewApplied = overlay.effective.applied.filter(
      (record) => record.effectType === "CrewAssignmentChanged",
    );
    expect(crewFacts.map((fact) => fact.effectId).sort()).toEqual(
      crewApplied.flatMap((record) => record.changes.map(() => record.effectId)).sort(),
    );
    for (const fact of crewFacts) {
      expect(
        overlay.effective.applied.some((record) => record.effectId === fact.effectId),
      ).toBe(true);
    }

    expect(context.recoveryHistory).toHaveLength(1);
    expect(context.recoveryHistory[0]?.type).toBe("Recovered");
    expect(context.recoveryHistory[0]?.issueId).toBe(material!.issue!.id);
    expect(context.timeline.map((item) => item.timelineEventId)).toEqual(
      timeline.map((item) => item.id),
    );
    expect(context.evaluationSimulatedAt).toBe(EVALUATION_AT);
  });

  it("copies evaluationSimulatedAt from the supplied workflow time", () => {
    const snapshot = freshSnapshot();
    const clock = initialSimulatedClock(snapshot.project.currentSimulatedAt);
    const instant = currentSimulatedAt(clock);
    const reasoning = initialRuntime();
    const overlay = initialOverlayRuntime(snapshot);
    const recovery = initialRecoveryRuntime(snapshot);
    const decisions = initialDecisionRuntime();
    const context = buildAgentContext({
      reasoning,
      decisions,
      overlay,
      recovery,
      evaluationSimulatedAt: instant,
      timeline: [],
    });
    expect(context.evaluationSimulatedAt).toBe(instant);
    expect(clock.committedStepCount).toBe(0);
    expect(currentSimulatedAt(clock)).toBe(instant);
  });

  it("excludes raw seed fixtures and engine/rule-table internals", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    const recovery = mustRecovery(reasoning, overlay);
    const { context } = contextFor(snapshot, reasoning, overlay, recovery);
    const serialized = JSON.stringify(context);
    expect(context).not.toHaveProperty("scenarioFixtures");
    expect(context).not.toHaveProperty("processedFixtureIds");
    expect(serialized).not.toContain("EFFECT_POLICY_BY_RULE");
    expect(serialized).not.toContain("RECOMMENDATION_RANK");
    expect(serialized).not.toContain("HEALTH_PENALTY_BY_TIER");
    expect(Object.keys(snapshot.scenarioFixtures[0] ?? {})).toContain("rawObservation");
    expect(serialized).not.toContain("rawObservation");
  });

  it("is deterministic and does not mutate any runtime input", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    const recovery = mustRecovery(reasoning, overlay);
    const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
    const timeline = joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
      effectHistory: overlay.effectHistory,
      applicationResults: overlay.applicationResults,
      recoveryHistory: recovery.history,
    });
    const reasoningBefore = structuredClone(reasoning);
    const decisionsBefore = structuredClone(decisions);
    const overlayBefore = structuredClone(overlay);
    const recoveryBefore = structuredClone(recovery);
    const timelineBefore = structuredClone(timeline);
    const snapshotBefore = structuredClone(snapshot);

    const first = buildAgentContext({
      reasoning,
      decisions,
      overlay,
      recovery,
      evaluationSimulatedAt: EVALUATION_AT,
      timeline,
    });
    const second = buildAgentContext({
      reasoning,
      decisions,
      overlay,
      recovery,
      evaluationSimulatedAt: EVALUATION_AT,
      timeline,
    });
    expect(second).toEqual(first);
    expect(reasoning).toEqual(reasoningBefore);
    expect(decisions).toEqual(decisionsBefore);
    expect(overlay).toEqual(overlayBefore);
    expect(recovery).toEqual(recoveryBefore);
    expect(timeline).toEqual(timelineBefore);
    expect(snapshot).toEqual(snapshotBefore);
    expect(createEffectiveProjectSnapshot(snapshot).snapshot).toBe(snapshot);
  });

  it("does not import operational writers, stores, timers, or LLM sources", () => {
    const source = readFileSync("lib/agent/buildAgentContext.ts", "utf8");
    const types = readFileSync("domain/agent/types.ts", "utf8");
    const index = readFileSync("domain/agent/index.ts", "utf8");
    for (const file of [source, types, index]) {
      for (const token of [
        "Date.now(",
        "Math.random(",
        "randomUUID",
        "crypto.randomUUID",
        "setTimeout(",
        "setInterval(",
        "SpeechSynthesis",
        "speechSynthesis",
        "openai",
        "anthropic",
        "supabase",
        "process.env",
        "useReasoningStore",
        "useDecisionStore",
        "useOverlayStore",
        "useRecoveryStore",
        "commitStep",
        "commitWorkflowStep",
        "processNextObservation(",
        "approveDecision",
        "recomputeRecoveryRuntime",
        "syncOverlayFromReasoning",
      ]) {
        expect(file.includes(token), `production source contains ${token}`).toBe(false);
      }
    }
  });
});
