import { beforeEach, describe, expect, it } from "vitest";

import { initialDecisionRuntime, intakeDecisions } from "@/domain/decisions";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import {
  initializePhase3cRuntimes,
  resetPhase3cRuntimes,
  syncPhase3cRuntimes,
} from "@/lib/orchestration/phase3cRuntime";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { freshSnapshot } from "@/tests/engines/helpers";

function processAll(snapshot: ProjectSnapshot): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

describe("Phase 3C runtime orchestration", () => {
  beforeEach(() => {
    useOverlayStore.setState({ runtime: null });
    useRecoveryStore.setState({ runtime: null });
    useDecisionStore.getState().resetDecisions();
    useReasoningStore.getState().resetReasoning();
  });

  it("syncs overlay then recovery without stores importing each other", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
    initializePhase3cRuntimes(snapshot);

    const reasoningBefore = JSON.stringify(reasoning);
    const decisionsBefore = JSON.stringify(decisions);
    const snapshotBefore = JSON.stringify(snapshot);

    syncPhase3cRuntimes({ reasoning, decisions });

    const overlay = useOverlayStore.getState().runtime;
    const recovery = useRecoveryStore.getState().runtime;
    expect(overlay?.effectHistory).toHaveLength(2);
    expect(recovery?.history).toHaveLength(1);
    expect(recovery?.scores.health.score).toBe(41);
    expect(recovery?.scores.drift.score).toBe(95);

    expect(JSON.stringify(reasoning)).toBe(reasoningBefore);
    expect(JSON.stringify(decisions)).toBe(decisionsBefore);
    expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
    expect(useReasoningStore.getState().runtime.reasonings).toEqual([]);
    expect(useDecisionStore.getState().runtime.decisions).toEqual([]);
  });

  it("does not let overlay application alone change RecoveryRuntime", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    initializePhase3cRuntimes(snapshot);
    const before = useRecoveryStore.getState().runtime;
    useOverlayStore.getState().syncFromReasoning(reasoning);
    expect(useRecoveryStore.getState().runtime).toEqual(before);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(100);
    expect(useOverlayStore.getState().runtime?.effective.applied.length).toBe(2);
  });

  it("resets overlay and recovery together to baseline scores", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    initializePhase3cRuntimes(snapshot);
    syncPhase3cRuntimes({
      reasoning,
      decisions: intakeDecisions(reasoning, initialDecisionRuntime()),
    });
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(41);

    resetPhase3cRuntimes(snapshot);
    expect(useOverlayStore.getState().runtime?.effectHistory).toEqual([]);
    expect(useOverlayStore.getState().runtime?.effective.snapshot).toBe(snapshot);
    expect(useRecoveryStore.getState().runtime?.history).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.currentlyRecoveredIssueIds).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(100);
    expect(useRecoveryStore.getState().runtime?.scores.drift.score).toBe(0);
  });
});
