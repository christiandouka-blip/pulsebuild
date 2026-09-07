import { beforeEach, describe, expect, it } from "vitest";

import {
  applyCommandsToDecision,
  initialDecisionRuntime,
  intakeDecisions,
  type DecisionRuntime,
} from "@/domain/decisions";
import { HEALTH_PROVEN_RECOVERY_BONUS } from "@/domain/constants/scoringConstants";
import { createEffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import {
  initialOverlayRuntime,
  syncOverlayFromReasoning,
} from "@/domain/effects/runtime";
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
} from "@/domain/engines/reasoningPipeline";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { freshSnapshot } from "@/tests/engines/helpers";

const ACTOR = "superintendent" as const;
const T0 = "2026-03-14T12:00:00.000Z";
const T1 = "2026-03-14T12:15:00.000Z";
const T2 = "2026-03-14T12:30:00.000Z";
const T_REOPEN = "2026-03-20T00:00:00.000Z";

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
  const recovery = mustRecompute({
    history: [],
    currentlyRecoveredIssueIds: [],
    reasoning,
    effective: overlay.effective,
  });
  return { overlay, recovery };
}

function verifySeededWeather(reasoning: ReasoningRuntime): DecisionRuntime {
  const weather = reasoning.reasonings.find((r) => r.signal.type === "WeatherAlert");
  if (!weather?.recommendation) throw new Error("missing weather recommendation");
  const seeded = intakeDecisions(reasoning, initialDecisionRuntime());
  const result = applyCommandsToDecision(seeded, `decision-${weather.recommendation.id}`, [
    {
      type: "ApproveDecision",
      actor: ACTOR,
      simulatedAt: T0,
      selectedActionSource: "primary",
    },
    { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T0 },
    { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T1 },
    { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: T1 },
    { type: "VerifyDecision", actor: ACTOR, simulatedAt: T2 },
  ]);
  if (!result.ok) throw new Error(result.error.code);
  return result.runtime;
}

describe("RecoveryRuntime baseline", () => {
  it("begins with no historical resolutions and Health 100 / Drift 0", () => {
    const snapshot = freshSnapshot();
    const recovery = initialRecoveryRuntime(snapshot);
    expect(recovery.history).toEqual([]);
    expect(recovery.currentlyRecoveredIssueIds).toEqual([]);
    expect(recovery.verificationResults).toEqual([]);
    expect(recovery.scores.health.score).toBe(100);
    expect(recovery.scores.drift.score).toBe(0);
    expect(recovery.scores.currentlyResolvedIssueIds).toEqual([]);
  });
});

describe("seeded recovery scoring", () => {
  it("matches Phase 3A Health 11 / Drift 120 before overlay recovery", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    expect(reasoning.health.score).toBe(11);
    expect(reasoning.drift.score).toBe(120);
    const recovery = mustRecompute({
      history: [],
      currentlyRecoveredIssueIds: [],
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
    });
    expect(recovery.scores.health.score).toBe(11);
    expect(recovery.scores.drift.score).toBe(120);
    expect(recovery.history).toEqual([]);
  });

  it("appends one material recovery episode and scores Health 41 / Drift 95", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const { recovery, overlay } = recoverMaterial(snapshot, reasoning);
    const material = reasoning.reasonings.find(
      (r) => r.issue?.kind === "MaterialDeliveryDelayed",
    );
    expect(material?.issue).toBeTruthy();
    expect(recovery.history).toHaveLength(1);
    expect(recovery.history[0]?.issueId).toBe(material!.issue!.id);
    expect(recovery.history[0]?.id).toBe(
      `recovery-${material!.issue!.id}-VERIFY_MATERIAL_REQUIREMENT-episode-1`,
    );
    expect(recovery.history[0]?.episodeNumber).toBe(1);
    expect(recovery.history[0]?.type).toBe("Recovered");
    expect(recovery.scores.health.score).toBe(41);
    expect(recovery.scores.health.band).toBe("red");
    expect(recovery.scores.drift.score).toBe(95);
    expect(recovery.scores.drift.label).toBe("Critical Drift");
    expect(recovery.scores.currentlyResolvedIssueIds).toEqual([material!.issue!.id]);
    expect(recovery.currentlyRecoveredIssueIds).toEqual([material!.issue!.id]);
    expect(recovery.scores.effectiveOpenIssueIds).not.toContain(material!.issue!.id);
    expect(
      overlay.effective.applied.some((r) => r.effectType === "MaterialDeliveryReceived"),
    ).toBe(true);
  });

  it("does not duplicate a recovery episode on repeated verification", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const first = recoverMaterial(snapshot, reasoning).recovery;
    const second = mustRecompute({
      history: first.history,
      currentlyRecoveredIssueIds: first.currentlyRecoveredIssueIds,
      reasoning,
      effective: overlayAfterObservations(snapshot, reasoning).effective,
    });
    expect(second.history).toHaveLength(1);
    expect(second.history[0]).toEqual(first.history[0]);
    expect(second.scores.health.score).toBe(41);
  });
});

describe("reopening and historical vs current", () => {
  it("keeps the Recovered event, appends Reopened, and withdraws +5", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const recovered = recoverMaterial(snapshot, reasoning).recovery;
    const materialId = reasoning.reasonings.find(
      (r) => r.issue?.kind === "MaterialDeliveryDelayed",
    )!.issue!.id;
    const historical = recovered.history[0];
    expect(historical).toBeTruthy();

    const reopened = mustRecompute({
      history: recovered.history,
      currentlyRecoveredIssueIds: recovered.currentlyRecoveredIssueIds,
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });

    expect(reopened.history).toHaveLength(2);
    expect(reopened.history[0]).toEqual(historical);
    expect(reopened.history[1]?.type).toBe("Reopened");
    expect(reopened.history[1]?.episodeNumber).toBe(1);
    expect(reopened.history[1]?.simulatedAt).toBe(T_REOPEN);
    expect(reopened.currentlyRecoveredIssueIds).toEqual([]);
    expect(reopened.scores.currentlyResolvedIssueIds).toEqual([]);
    expect(reopened.scores.effectiveOpenIssueIds).toContain(materialId);
    expect(reopened.scores.health.score).toBe(11);
    expect(reopened.scores.drift.score).toBe(120);
    expect(
      reopened.scores.health.breakdown.some(
        (line) => line.delta === HEALTH_PROVEN_RECOVERY_BONUS,
      ),
    ).toBe(false);
    expect(
      reasoning.reasonings.find((r) => r.issue?.id === materialId)?.issue?.status,
    ).toBe("open");
  });
});

describe("bonus gates", () => {
  it("does not award +5 from DecisionState.Verified alone", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const decisions = verifySeededWeather(reasoning);
    expect(decisions.decisions.some((d) => d.state === "Verified")).toBe(true);
    const recovery = mustRecompute({
      history: [],
      currentlyRecoveredIssueIds: [],
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
    });
    expect(recovery.scores.health.score).toBe(11);
    expect(recovery.history).toEqual([]);
    expect(
      recovery.scores.health.breakdown.some((line) =>
        line.label.includes("Verified operational recovery"),
      ),
    ).toBe(false);
  });

  it("does not award +5 from TaskComplete overlay without material recovery", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const taskCompleteOnly = reasoning.reasonings.filter(
      (r) => r.signal.type === "TaskComplete",
    );
    const taskOverlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), {
      ...reasoning,
      reasonings: taskCompleteOnly,
    });
    const taskRecovery = mustRecompute({
      history: [],
      currentlyRecoveredIssueIds: [],
      reasoning,
      effective: taskOverlay.effective,
    });
    expect(taskRecovery.history).toEqual([]);
    expect(taskRecovery.scores.health.score).toBe(11);
    expect(taskRecovery.scores.currentlyResolvedIssueIds).toEqual([]);
  });
});

describe("immutability, determinism, and reset", () => {
  it("does not mutate ReasoningRuntime or OperationalIssue objects", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const issuesBefore = JSON.stringify(reasoning.reasonings.map((r) => r.issue));
    const reasoningBefore = JSON.stringify(reasoning);
    recoverMaterial(snapshot, reasoning);
    expect(JSON.stringify(reasoning)).toBe(reasoningBefore);
    expect(JSON.stringify(reasoning.reasonings.map((r) => r.issue))).toBe(issuesBefore);
  });

  it("produces a deep-equal RecoveryRuntime for the same verification sequence", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = overlayAfterObservations(snapshot, reasoning);
    const input: RecomputeRecoveryInput = {
      history: [],
      currentlyRecoveredIssueIds: [],
      reasoning,
      effective: overlay.effective,
    };
    const a = mustRecompute(input);
    const b = mustRecompute(input);
    expect(a).toEqual(b);
  });

  it("keeps prior Recovered events unchanged when appending Reopened", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const recovered = recoverMaterial(snapshot, reasoning).recovery;
    const first = recovered.history[0];
    const reopened = mustRecompute({
      history: recovered.history,
      currentlyRecoveredIssueIds: recovered.currentlyRecoveredIssueIds,
      reasoning,
      effective: createEffectiveProjectSnapshot(snapshot),
      evaluationSimulatedAt: T_REOPEN,
    });
    expect(reopened.history[0]).toEqual(first);
    expect(reopened.history).toHaveLength(2);
  });

  it("resets RecoveryRuntime to empty history and Health 100 / Drift 0", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const recovered = recoverMaterial(snapshot, reasoning).recovery;
    expect(recovered.history).toHaveLength(1);
    const reset = initialRecoveryRuntime(snapshot);
    expect(reset.history).toEqual([]);
    expect(reset.currentlyRecoveredIssueIds).toEqual([]);
    expect(reset.scores.health.score).toBe(100);
    expect(reset.scores.drift.score).toBe(0);
  });
});

describe("recovery store", () => {
  beforeEach(() => {
    useRecoveryStore.setState({ runtime: null });
  });

  it("recomputes from explicit reasoning and effective snapshot", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    useRecoveryStore.getState().initializeRecovery(snapshot);
    expect(useRecoveryStore.getState().runtime?.history).toEqual([]);

    const overlay = overlayAfterObservations(snapshot, reasoning);
    const result = useRecoveryStore.getState().recompute({
      reasoning,
      effective: overlay.effective,
    });
    expect(result.ok).toBe(true);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(41);
    expect(useRecoveryStore.getState().runtime?.scores.drift.score).toBe(95);

    useRecoveryStore.getState().resetRecovery(snapshot);
    expect(useRecoveryStore.getState().runtime?.history).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.currentlyRecoveredIssueIds).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(100);
  });
});
