import { describe, expect, it } from "vitest";

import { HEALTH_PROVEN_RECOVERY_BONUS } from "@/domain/constants/scoringConstants";
import {
  applyOperationalEffects,
  createEffectiveProjectSnapshot,
} from "@/domain/effects";
import type { CrewAssignmentChangedEffect } from "@/domain/effects/types";
import {
  initialOverlayRuntime,
  syncOverlayFromReasoning,
} from "@/domain/effects/runtime";
import {
  recoveredEventId,
  reopenedEventId,
} from "@/domain/recovery/history";
import {
  initialRecoveryRuntime,
  recomputeRecoveryRuntime,
  type RecomputeRecoveryInput,
  type RecoveryRuntime,
} from "@/domain/recovery/runtime";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
  type SignalReasoning,
} from "@/domain/engines/reasoningPipeline";
import type { OperationalIssue } from "@/domain/types/issue";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";
import { freshSnapshot } from "@/tests/engines/helpers";

const T_REOPEN = "2026-03-20T00:00:00.000Z";
const T_REOPEN_2 = "2026-03-21T00:00:00.000Z";
const CONCRETE_CREW = "crew-concrete-a";
const POUR = "task-pour-level-1-slab";
const SYNTHETIC_CREW_TASK = "task-synthetic-crew-target";

function processAll(snapshot: ProjectSnapshot): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function overlayAfterObservations(snapshot: ProjectSnapshot, reasoning: ReasoningRuntime) {
  return syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
}

function mustRecompute(input: RecomputeRecoveryInput): RecoveryRuntime {
  const result = recomputeRecoveryRuntime(input);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.runtime;
}

function recoverMaterial(snapshot: ProjectSnapshot, reasoning: ReasoningRuntime) {
  const overlay = overlayAfterObservations(snapshot, reasoning);
  return {
    overlay,
    recovery: mustRecompute({
      history: [],
      currentlyRecoveredIssueIds: [],
      reasoning,
      effective: overlay.effective,
    }),
  };
}

function reopenMaterial(
  snapshot: ProjectSnapshot,
  reasoning: ReasoningRuntime,
  previous: RecoveryRuntime,
  evaluationSimulatedAt: string,
) {
  return mustRecompute({
    history: previous.history,
    currentlyRecoveredIssueIds: previous.currentlyRecoveredIssueIds,
    reasoning,
    effective: createEffectiveProjectSnapshot(snapshot),
    evaluationSimulatedAt,
  });
}

function materialIssue(reasoning: ReasoningRuntime): OperationalIssue {
  const material = reasoning.reasonings.find(
    (r) => r.issue?.kind === "MaterialDeliveryDelayed",
  );
  if (!material?.issue) throw new Error("missing material issue");
  return material.issue;
}

function makeTask(id: string, requiredCrewIds: string[]): Task {
  return {
    id,
    projectId: "proj-harbor-point",
    phaseId: "phase-structure",
    name: `Synthetic ${id}`,
    status: "Ready",
    taskType: "interior_prep",
    plannedStart: "2026-03-14T08:00:00-04:00",
    plannedEnd: "2026-03-14T16:00:00-04:00",
    dependencyTaskIds: [],
    requiredCrewIds,
    requiredMaterialIds: [],
    requiredEquipmentIds: [],
    priorityWeight: 2,
    isCriticalPath: false,
  };
}

function stubReasoning(issue: OperationalIssue, signal: ProjectSignal): SignalReasoning {
  const confidence = {
    category: "High" as const,
    supportingFacts: [],
    missingFacts: [],
    conflictingFacts: [],
    explanation: "test stub",
  };
  return {
    signal,
    issue,
    recommendation: null,
    dependency: {
      originTaskId: signal.relatedTaskId,
      immediateTaskIds: [],
      affectedTaskIds: [],
      cascadeDepth: 0,
      criticalPathImpacted: false,
      evidence: [],
    },
    priority: {
      baselineHint: issue.finalTier,
      finalTier: issue.finalTier,
      adjustments: [],
      confidence,
      evidence: [],
    },
    prediction: {
      affectedTaskIds: [],
      cascadeDepth: 0,
      criticalPathExposure: "No measurable exposure",
      idleCrewRisk: { category: "No measurable exposure", crewIds: [] },
      scheduleExposure: { category: "No measurable exposure", estimatedHours: null },
      projectedConsequence: "test stub",
      confidence,
      evidence: [],
    },
  };
}

describe("multi-episode recovery history", () => {
  it("creates episode 1 on first recovery", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const { recovery } = recoverMaterial(snapshot, reasoning);
    const issue = materialIssue(reasoning);
    expect(recovery.history).toEqual([
      expect.objectContaining({
        id: recoveredEventId(issue.id, "VERIFY_MATERIAL_REQUIREMENT", 1),
        type: "Recovered",
        episodeNumber: 1,
        issueId: issue.id,
      }),
    ]);
  });

  it("does not append a duplicate while still recovered", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const first = recoverMaterial(snapshot, reasoning);
    const second = mustRecompute({
      history: first.recovery.history,
      currentlyRecoveredIssueIds: first.recovery.currentlyRecoveredIssueIds,
      reasoning,
      effective: first.overlay.effective,
    });
    expect(second.history).toBe(first.recovery.history);
    expect(second.history).toHaveLength(1);
  });

  it("rejects reopen without evaluationSimulatedAt and does not mutate history", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const { recovery } = recoverMaterial(snapshot, reasoning);
    const result = recomputeRecoveryRuntime({
      history: recovery.history,
      currentlyRecoveredIssueIds: recovery.currentlyRecoveredIssueIds,
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_EVALUATION_SIMULATED_AT");
    expect(recovery.history).toHaveLength(1);
  });

  it("dates Reopened from evaluationSimulatedAt, not issue.openedAtSimulated", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const issue = materialIssue(reasoning);
    const { recovery } = recoverMaterial(snapshot, reasoning);
    const reopened = reopenMaterial(snapshot, reasoning, recovery, T_REOPEN);
    const event = reopened.history[1];
    expect(event?.type).toBe("Reopened");
    expect(event?.simulatedAt).toBe(T_REOPEN);
    expect(event?.simulatedAt).not.toBe(issue.openedAtSimulated);
    expect(event?.simulatedAt).not.toBe(reopened.history[0]?.simulatedAt);
  });

  it("rejects a reopen timestamp that is not strictly after the prior recovery", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const { recovery } = recoverMaterial(snapshot, reasoning);
    const recoveredAt = recovery.history[0]!.simulatedAt;
    const tooEarly = recomputeRecoveryRuntime({
      history: recovery.history,
      currentlyRecoveredIssueIds: recovery.currentlyRecoveredIssueIds,
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(tooEarly.ok).toBe(false);
    if (tooEarly.ok) return;
    expect(tooEarly.error.code).toBe("REOPEN_TIMESTAMP_NOT_AFTER_RECOVERY");
    expect(tooEarly.error.latestRecoverySimulatedAt).toBe(recoveredAt);

    const equal = recomputeRecoveryRuntime({
      history: recovery.history,
      currentlyRecoveredIssueIds: recovery.currentlyRecoveredIssueIds,
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: recoveredAt,
    });
    expect(equal.ok).toBe(false);
    if (equal.ok) return;
    expect(equal.error.code).toBe("REOPEN_TIMESTAMP_NOT_AFTER_RECOVERY");
  });

  it("creates Reopened episode 1 on first regression", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const issue = materialIssue(reasoning);
    const { recovery } = recoverMaterial(snapshot, reasoning);
    const reopened = reopenMaterial(snapshot, reasoning, recovery, T_REOPEN);
    expect(reopened.history[1]).toEqual(
      expect.objectContaining({
        id: reopenedEventId(issue.id, "VERIFY_MATERIAL_REQUIREMENT", 1),
        type: "Reopened",
        episodeNumber: 1,
        simulatedAt: T_REOPEN,
      }),
    );
  });

  it("does not duplicate Reopened while still reopened", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const { recovery } = recoverMaterial(snapshot, reasoning);
    const first = reopenMaterial(snapshot, reasoning, recovery, T_REOPEN);
    const second = mustRecompute({
      history: first.history,
      currentlyRecoveredIssueIds: first.currentlyRecoveredIssueIds,
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: T_REOPEN_2,
    });
    expect(second.history).toBe(first.history);
    expect(second.history.filter((e) => e.type === "Reopened")).toHaveLength(1);
  });

  it("creates episode 2 on second recovery with a distinct deterministic id", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const issue = materialIssue(reasoning);
    const first = recoverMaterial(snapshot, reasoning);
    const reopened = reopenMaterial(snapshot, reasoning, first.recovery, T_REOPEN);
    const second = mustRecompute({
      history: reopened.history,
      currentlyRecoveredIssueIds: reopened.currentlyRecoveredIssueIds,
      reasoning,
      effective: overlayAfterObservations(snapshot, reasoning).effective,
    });
    expect(second.history).toHaveLength(3);
    expect(second.history[2]).toEqual(
      expect.objectContaining({
        id: recoveredEventId(issue.id, "VERIFY_MATERIAL_REQUIREMENT", 2),
        type: "Recovered",
        episodeNumber: 2,
      }),
    );
    expect(second.history[2]?.id).not.toBe(second.history[0]?.id);
    expect(second.history[2]?.simulatedAt).toBe(second.history[0]?.simulatedAt);
    expect(second.history[0]).toEqual(first.recovery.history[0]);
    expect(second.history[1]).toEqual(reopened.history[1]);
  });

  it("scopes episode numbering per issue and starts each issue at episode 1", () => {
    const snapshot = freshSnapshot();
    const withTarget: ProjectSnapshot = {
      ...snapshot,
      tasks: [...snapshot.tasks, makeTask(SYNTHETIC_CREW_TASK, [CONCRETE_CREW])],
    };
    const reasoning = processAll(withTarget);
    const crewSignal: ProjectSignal = {
      id: "signal-synthetic-CrewShortage",
      projectId: "proj-harbor-point",
      type: "CrewShortage",
      status: "Prioritized",
      source: "simulation",
      relatedEntityType: "crew",
      relatedEntityId: CONCRETE_CREW,
      relatedTaskId: SYNTHETIC_CREW_TASK,
      severityHint: "Tier1",
      rawData: {},
      observedAtSimulated: "2026-03-14T12:00:00.000Z",
      originFixtureId: "fixture-synthetic",
      sequenceOrder: 99,
    };
    const crewIssue: OperationalIssue = {
      id: "issue-signal-synthetic-CrewShortage",
      signalId: crewSignal.id,
      taskId: SYNTHETIC_CREW_TASK,
      kind: "CrewShortage",
      status: "open",
      finalTier: "Tier1",
      openedAtSimulated: crewSignal.observedAtSimulated,
    };
    const combined: ReasoningRuntime = {
      ...reasoning,
      reasonings: [...reasoning.reasonings, stubReasoning(crewIssue, crewSignal)],
    };
    const assignment: CrewAssignmentChangedEffect = {
      id: "effect-decision-crew-shortage-CrewAssignmentChanged",
      decisionId: "decision-crew-shortage",
      recommendationId: "rec-crew-shortage",
      signalId: crewSignal.id,
      issueId: crewIssue.id,
      ruleId: "REC_CREW_REASSIGN",
      effectType: "CrewAssignmentChanged",
      simulatedAt: "2026-03-14T13:00:00.000Z",
      crewId: CONCRETE_CREW,
      originTaskId: POUR,
      targetTaskId: SYNTHETIC_CREW_TASK,
    };
    const observationOverlay = overlayAfterObservations(withTarget, combined);
    const { effective } = applyOperationalEffects(withTarget, [
      ...observationOverlay.effectHistory,
      assignment,
    ]);
    const recovery = mustRecompute({
      history: [],
      currentlyRecoveredIssueIds: [],
      reasoning: combined,
      effective,
    });
    const recovered = recovery.history.filter((e) => e.type === "Recovered");
    expect(recovered).toHaveLength(2);
    expect(recovered.every((e) => e.episodeNumber === 1)).toBe(true);
    expect(new Set(recovered.map((e) => e.issueId)).size).toBe(2);
  });
});

describe("current truth, scoring, determinism, and reset", () => {
  it("keeps current resolution truth verification-derived across episodes", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const issue = materialIssue(reasoning);
    const first = recoverMaterial(snapshot, reasoning);
    expect(first.recovery.currentlyRecoveredIssueIds).toEqual([issue.id]);
    expect(first.recovery.scores.currentlyResolvedIssueIds).toEqual([issue.id]);
    expect(
      first.recovery.verificationResults.some(
        (r) => r.issueId === issue.id && r.outcome === "Recovered",
      ),
    ).toBe(true);

    const reopened = reopenMaterial(snapshot, reasoning, first.recovery, T_REOPEN);
    expect(reopened.currentlyRecoveredIssueIds).toEqual([]);
    expect(reopened.scores.currentlyResolvedIssueIds).toEqual([]);
    expect(
      reopened.verificationResults.some(
        (r) => r.issueId === issue.id && r.outcome === "StillActive",
      ),
    ).toBe(true);

    const second = mustRecompute({
      history: reopened.history,
      currentlyRecoveredIssueIds: reopened.currentlyRecoveredIssueIds,
      reasoning,
      effective: overlayAfterObservations(snapshot, reasoning).effective,
    });
    expect(second.currentlyRecoveredIssueIds).toEqual([issue.id]);
    expect(second.history.filter((e) => e.type === "Recovered")).toHaveLength(2);
    expect(second.scores.currentlyResolvedIssueIds).toEqual([issue.id]);
  });

  it("awards one +5 on first recovery, zero on reopen, and one +5 on second recovery", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const first = recoverMaterial(snapshot, reasoning).recovery;
    expect(first.scores.health.score).toBe(41);
    expect(
      first.scores.health.breakdown.filter(
        (line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS,
      ),
    ).toHaveLength(1);

    const reopened = reopenMaterial(snapshot, reasoning, first, T_REOPEN);
    expect(reopened.scores.health.score).toBe(11);
    expect(
      reopened.scores.health.breakdown.some(
        (line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS,
      ),
    ).toBe(false);
    expect(reopened.scores.drift.score).toBe(120);

    const second = mustRecompute({
      history: reopened.history,
      currentlyRecoveredIssueIds: reopened.currentlyRecoveredIssueIds,
      reasoning,
      effective: overlayAfterObservations(snapshot, reasoning).effective,
    });
    expect(second.scores.health.score).toBe(41);
    expect(
      second.scores.health.breakdown.filter(
        (line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS,
      ),
    ).toHaveLength(1);
    expect(second.scores.drift.score).toBe(95);
    expect(second.scores.drift.label).toBe("Critical Drift");
  });

  it("replays identically and is deep-equal for the same sequence", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = overlayAfterObservations(snapshot, reasoning);
    const baseline = createEffectiveProjectSnapshot(snapshot);

    function play(): RecoveryRuntime {
      const recovered = mustRecompute({
        history: [],
        currentlyRecoveredIssueIds: [],
        reasoning,
        effective: overlay.effective,
      });
      const reopened = mustRecompute({
        history: recovered.history,
        currentlyRecoveredIssueIds: recovered.currentlyRecoveredIssueIds,
        reasoning,
        effective: baseline,
        evaluationSimulatedAt: T_REOPEN,
      });
      return mustRecompute({
        history: reopened.history,
        currentlyRecoveredIssueIds: reopened.currentlyRecoveredIssueIds,
        reasoning,
        effective: overlay.effective,
      });
    }

    const a = play();
    const b = play();
    expect(a).toEqual(b);
    expect(a.history.map((e) => e.id)).toEqual(b.history.map((e) => e.id));
    const again = mustRecompute({
      history: a.history,
      currentlyRecoveredIssueIds: a.currentlyRecoveredIssueIds,
      reasoning,
      effective: overlay.effective,
    });
    expect(again).toEqual(a);
  });

  it("clears all episode and reopen history on reset", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const first = recoverMaterial(snapshot, reasoning).recovery;
    const reopened = reopenMaterial(snapshot, reasoning, first, T_REOPEN);
    expect(reopened.history.length).toBeGreaterThan(0);
    const reset = initialRecoveryRuntime(snapshot);
    expect(reset.history).toEqual([]);
    expect(reset.currentlyRecoveredIssueIds).toEqual([]);
    expect(reset.verificationResults).toEqual([]);
    expect(reset.scores.health.score).toBe(100);
    expect(reset.scores.drift.score).toBe(0);
  });
});
