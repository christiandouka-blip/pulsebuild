import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  approveDecisionCommitted,
  ensureCommandCenterInitialized,
  executeDecisionCommitted,
  processNextObservationCommitted,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import {
  currentSimulatedAt,
  type SimulatedClock,
} from "@/lib/orchestration/simulatedClock";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import {
  presentationScores,
  recoverySummaryView,
  signalRecoveryView,
} from "@/lib/selectors/recoveryPresentationSelectors";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";

function resetAllStores(): void {
  useProjectStore.setState({ snapshot: null, isLoaded: false });
  useReasoningStore.setState({
    isInitialized: false,
    runtime: useReasoningStore.getState().runtime,
    canProcessNext: true,
  });
  useReasoningStore.getState().resetReasoning();
  useReasoningStore.setState({ isInitialized: false });
  useDecisionStore.getState().resetDecisions();
  useOverlayStore.setState({ runtime: null });
  useRecoveryStore.setState({ runtime: null });
  useSimulatedClockStore.setState({ clock: null });
  useUIStore.getState().closeSignal();
}

function requireClock(): SimulatedClock {
  const clock = useSimulatedClockStore.getState().clock;
  if (!clock) throw new Error("clock is not initialized");
  return clock;
}

function requireSnapshotJson(): string {
  const snapshot = useProjectStore.getState().snapshot;
  if (!snapshot) throw new Error("snapshot is not loaded");
  return JSON.stringify(snapshot);
}

function processAllObservations(): void {
  while (true) {
    const result = processNextObservationCommitted();
    if (!result.ok) break;
  }
}

function firstPendingApprovalId(): string {
  const decision = useDecisionStore
    .getState()
    .runtime.decisions.find(
      (item) => item.state === "PendingReview" && item.approvalRequired,
    );
  if (!decision) throw new Error("no pending approval decision");
  return decision.id;
}

function firstMutatingPendingApprovalId(): string {
  const decision = useDecisionStore
    .getState()
    .runtime.decisions.find(
      (item) =>
        item.state === "PendingReview" &&
        item.approvalRequired &&
        item.mutatesOperationalState,
    );
  if (!decision) throw new Error("no mutating pending approval decision");
  return decision.id;
}

describe("Phase 3C Command Center integration", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("starts the simulated clock at the deterministic project baseline", () => {
    const snapshot = ensureCommandCenterInitialized();
    const clock = requireClock();
    expect(clock.committedStepCount).toBe(0);
    expect(clock.baselineSimulatedAt).toBe(snapshot.project.currentSimulatedAt);
    expect(currentSimulatedAt(clock)).toBe("2026-03-14T10:30:00.000Z");
    expect(snapshot.project.currentSimulatedAt).toBe("2026-03-14T06:30:00-04:00");
  });

  it("advances 15 minutes for one Process Next Observation", () => {
    ensureCommandCenterInitialized();
    const result = processNextObservationCommitted();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.simulatedAt).toBe("2026-03-14T10:45:00.000Z");
    expect(currentSimulatedAt(requireClock())).toBe("2026-03-14T10:45:00.000Z");
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toHaveLength(1);
    expect(useReasoningStore.getState().runtime.reasonings).toHaveLength(1);
  });

  it("advances exactly 75 minutes after five observations", () => {
    ensureCommandCenterInitialized();
    for (let i = 0; i < 5; i++) {
      const result = processNextObservationCommitted();
      expect(result.ok).toBe(true);
    }
    expect(requireClock().committedStepCount).toBe(5);
    expect(currentSimulatedAt(requireClock())).toBe("2026-03-14T11:45:00.000Z");
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toHaveLength(5);
  });

  it("does not advance time for a failed workflow action", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    processNextObservationCommitted();
    const before = currentSimulatedAt(requireClock());
    const decisionId = firstPendingApprovalId();
    const failed = approveDecisionCommitted(decisionId, {
      selectedActionSource: "alternative",
      alternativeIndex: 99,
    });
    expect(failed.ok).toBe(false);
    expect(currentSimulatedAt(requireClock())).toBe(before);
    expect(requireClock().committedStepCount).toBe(2);
  });

  it("advances 15 minutes once for a successful approve chain, not per FSM transition", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    processNextObservationCommitted();
    const beforeCount = requireClock().committedStepCount;
    const decisionId = firstPendingApprovalId();
    const approved = approveDecisionCommitted(decisionId);
    expect(approved.ok).toBe(true);
    expect(requireClock().committedStepCount).toBe(beforeCount + 1);
    const decision = useDecisionStore.getState().byId(decisionId);
    expect(decision).toBeTruthy();
    const instants = new Set(decision!.auditTrail.map((event) => event.simulatedAt));
    expect(instants.size).toBe(1);
    expect(decision!.auditTrail.length).toBeGreaterThan(1);
    expect(currentSimulatedAt(requireClock())).toBe(decision!.auditTrail[0]?.simulatedAt);
  });

  it("advances 15 minutes once for a successful execute chain", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    processNextObservationCommitted();
    const decisionId = firstMutatingPendingApprovalId();
    expect(approveDecisionCommitted(decisionId).ok).toBe(true);
    const beforeCount = requireClock().committedStepCount;
    const executed = executeDecisionCommitted(decisionId);
    expect(executed.ok).toBe(true);
    expect(requireClock().committedStepCount).toBe(beforeCount + 1);
    const decision = useDecisionStore.getState().byId(executed.ok ? executed.decision.id : "");
    const markAndAdvance = decision?.auditTrail.filter(
      (event) =>
        event.command === "MarkExecutionComplete" ||
        event.command === "AdvanceToVerification",
    );
    expect(markAndAdvance).toHaveLength(2);
    expect(markAndAdvance?.[0]?.simulatedAt).toBe(markAndAdvance?.[1]?.simulatedAt);
  });

  it("passes evaluationSimulatedAt from the workflow clock", () => {
    ensureCommandCenterInitialized();
    const seen: Array<string | undefined> = [];
    const original = useRecoveryStore.getState().recompute;
    useRecoveryStore.setState({
      recompute: (input) => {
        seen.push(input.evaluationSimulatedAt);
        return original(input);
      },
    });

    try {
      const result = processNextObservationCommitted();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(seen.at(-1)).toBe(result.simulatedAt);
      expect(seen.at(-1)).toBe(currentSimulatedAt(requireClock()));
    } finally {
      useRecoveryStore.setState({ recompute: original });
    }
  });

  it("reset restores the clock baseline", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    processNextObservationCommitted();
    resetCommandCenter();
    expect(requireClock().committedStepCount).toBe(0);
    expect(currentSimulatedAt(requireClock())).toBe("2026-03-14T10:30:00.000Z");
  });

  it("Process Next Observation still processes exactly one fixture", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toEqual([
      "fixture-weather-alert",
    ]);
    processNextObservationCommitted();
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toEqual([
      "fixture-weather-alert",
      "fixture-material-delay",
    ]);
  });

  it("repeated selector reads do not advance the clock", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    const before = requireClock();
    const reasoning = useReasoningStore.getState().runtime;
    const decisions = useDecisionStore.getState().runtime;
    const overlay = useOverlayStore.getState().runtime;
    const recovery = useRecoveryStore.getState().runtime;
    for (let i = 0; i < 5; i++) {
      presentationScores(reasoning, recovery);
      recoverySummaryView(reasoning, recovery);
      joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
        effectHistory: overlay?.effectHistory,
        applicationResults: overlay?.applicationResults,
        recoveryHistory: recovery?.history,
      });
    }
    expect(useSimulatedClockStore.getState().clock).toEqual(before);
  });

  it("presentation scores equal RecoveryRuntime and follow the seeded recovery path", () => {
    ensureCommandCenterInitialized();
    const baselineReasoning = useReasoningStore.getState().runtime;
    const baselineRecovery = useRecoveryStore.getState().runtime;
    const baseline = presentationScores(baselineReasoning, baselineRecovery);
    expect(baseline.health.score).toBe(100);
    expect(baseline.drift.score).toBe(0);
    expect(baseline.health.score).toBe(baselineRecovery?.scores.health.score);
    expect(baseline.drift.score).toBe(baselineRecovery?.scores.drift.score);

    processAllObservations();
    const reasoning = useReasoningStore.getState().runtime;
    const recovery = useRecoveryStore.getState().runtime;
    expect(recovery).toBeTruthy();
    const shown = presentationScores(reasoning, recovery);
    expect(shown.health).toEqual(recovery!.scores.health);
    expect(shown.drift).toEqual(recovery!.scores.drift);
    expect(shown.health.score).toBe(41);
    expect(shown.health.band).toBe("red");
    expect(shown.drift.score).toBe(95);
    expect(shown.drift.label).toBe("Critical Drift");
    expect(reasoning.health.score).toBe(11);
    expect(reasoning.drift.score).toBe(120);

    const material = reasoning.reasonings.find(
      (entry) => entry.issue?.kind === "MaterialDeliveryDelayed",
    );
    expect(material?.issue?.status).toBe("open");
    const view = signalRecoveryView(
      material!.issue!.id,
      recovery,
      useOverlayStore.getState().runtime?.effective ?? null,
      material!.signal.relatedEntityType,
      material!.signal.relatedEntityId,
    );
    expect(view?.currentlyRecovered).toBe(true);
    expect(view?.verificationRuleId).toBe("VERIFY_MATERIAL_REQUIREMENT");
    expect(view?.currentOutcome).toBe("Recovered");
    expect(view?.history).toHaveLength(1);
  });

  it("recovery summary counts match current and historical recovery truth", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    const reasoning = useReasoningStore.getState().runtime;
    const recovery = useRecoveryStore.getState().runtime;
    const summary = recoverySummaryView(reasoning, recovery);
    expect(summary.currentlyRecoveredCount).toBe(1);
    expect(summary.currentlyOpenCount).toBe(2);
    expect(summary.historicalRecoveredEpisodeCount).toBe(1);
    expect(summary.currentlyReopenedCount).toBe(0);
    expect(summary.explanation).toBe(
      "1 blocker recovered; other active risks remain.",
    );
    expect(recovery?.currentlyRecoveredIssueIds).toHaveLength(1);
    expect(recovery?.history.filter((event) => event.type === "Reopened")).toHaveLength(
      0,
    );
  });

  it("timeline merges Phase 3A + 3B + 3C sources without mutating histories", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();
    processNextObservationCommitted();
    const decisionId = firstPendingApprovalId();
    expect(approveDecisionCommitted(decisionId).ok).toBe(true);
    processAllObservations();

    const reasoning = useReasoningStore.getState().runtime;
    const decisions = useDecisionStore.getState().runtime;
    const overlay = useOverlayStore.getState().runtime;
    const recovery = useRecoveryStore.getState().runtime;
    const reasoningBefore = structuredClone(reasoning.timeline);
    const decisionsBefore = structuredClone(decisions.decisions);
    const overlayBefore = structuredClone(overlay?.effectHistory);
    const recoveryBefore = structuredClone(recovery?.history);

    const extras = {
      effectHistory: overlay?.effectHistory,
      applicationResults: overlay?.applicationResults,
      recoveryHistory: recovery?.history,
    };
    const first = joinOperationalTimeline(reasoning.timeline, decisions.decisions, extras);
    const second = joinOperationalTimeline(reasoning.timeline, decisions.decisions, extras);
    expect(first).toEqual(second);

    const sources = new Set(first.map((entry) => entry.source));
    expect(sources.has("reasoning")).toBe(true);
    expect(sources.has("decision")).toBe(true);
    expect(sources.has("overlay")).toBe(true);
    expect(sources.has("recovery")).toBe(true);
    expect(sources.has("score")).toBe(true);

    const timestamps = first.map((entry) => entry.simulatedAt);
    expect([...timestamps].sort()).toEqual(timestamps);

    const recoveryEntries = first.filter((entry) => entry.source === "recovery");
    expect(
      recoveryEntries.every((entry) =>
        entry.facts.some((fact) =>
          fact.includes("Operational verification uses effective project facts"),
        ),
      ),
    ).toBe(true);
    const decisionEntries = first.filter((entry) => entry.source === "decision");
    expect(
      decisionEntries.every((entry) =>
        entry.facts.some((fact) =>
          fact.includes("Workflow verification records superintendent confirmation only."),
        ),
      ),
    ).toBe(true);

    expect(reasoning.timeline).toEqual(reasoningBefore);
    expect(decisions.decisions).toEqual(decisionsBefore);
    expect(overlay?.effectHistory).toEqual(overlayBefore);
    expect(recovery?.history).toEqual(recoveryBefore);
  });

  it("reset clears all four runtime layers, recovery history, overlay effects, and scores", () => {
    ensureCommandCenterInitialized();
    const snapshotBefore = requireSnapshotJson();
    processAllObservations();
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(41);
    expect(useOverlayStore.getState().runtime?.effectHistory.length).toBeGreaterThan(0);

    resetCommandCenter();

    expect(useReasoningStore.getState().runtime.reasonings).toEqual([]);
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toEqual([]);
    expect(useReasoningStore.getState().runtime.health.score).toBe(100);
    expect(useDecisionStore.getState().runtime.decisions).toEqual([]);
    expect(useOverlayStore.getState().runtime?.effectHistory).toEqual([]);
    expect(useOverlayStore.getState().runtime?.applicationResults).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.history).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.currentlyRecoveredIssueIds).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(100);
    expect(useRecoveryStore.getState().runtime?.scores.drift.score).toBe(0);
    expect(currentSimulatedAt(requireClock())).toBe("2026-03-14T10:30:00.000Z");
    expect(requireSnapshotJson()).toBe(snapshotBefore);
  });

  it("keeps ProjectSnapshot unchanged and runtimes deterministic through the integration sequence", () => {
    ensureCommandCenterInitialized();
    const snapshotBefore = requireSnapshotJson();

    processAllObservations();
    const reasoningA = JSON.stringify(useReasoningStore.getState().runtime);
    const decisionsA = JSON.stringify(useDecisionStore.getState().runtime);
    const overlayA = JSON.stringify(useOverlayStore.getState().runtime);
    const recoveryA = JSON.stringify(useRecoveryStore.getState().runtime);

    expect(requireSnapshotJson()).toBe(snapshotBefore);

    resetCommandCenter();
    processAllObservations();
    expect(JSON.stringify(useReasoningStore.getState().runtime)).toBe(reasoningA);
    expect(JSON.stringify(useDecisionStore.getState().runtime)).toBe(decisionsA);
    expect(JSON.stringify(useOverlayStore.getState().runtime)).toBe(overlayA);
    expect(JSON.stringify(useRecoveryStore.getState().runtime)).toBe(recoveryA);
    expect(requireSnapshotJson()).toBe(snapshotBefore);
  });

  it("does not add voice, LLM, timers, or non-deterministic sources in integration production code", () => {
    const files = [
      "lib/orchestration/simulatedClock.ts",
      "lib/orchestration/commandCenter.ts",
      "lib/orchestration/phase3cRuntime.ts",
      "store/useSimulatedClockStore.ts",
      "store/useOverlayStore.ts",
      "store/useRecoveryStore.ts",
      "lib/selectors/recoveryPresentationSelectors.ts",
      "lib/selectors/combinedTimelineSelectors.ts",
      "components/command-center/CommandCenterShell.tsx",
      "components/command-center/HealthStrip.tsx",
      "components/command-center/DecisionReviewQueue.tsx",
      "components/command-center/DecisionWorkflowControls.tsx",
      "components/command-center/SignalDetailShell.tsx",
      "components/timeline/TimelinePanelShell.tsx",
    ];
    const forbidden = [
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
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("does not advance the clock when Process Next has no remaining fixture", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    const before = currentSimulatedAt(requireClock());
    const extra = processNextObservationCommitted();
    expect(extra.ok).toBe(false);
    expect(currentSimulatedAt(requireClock())).toBe(before);
  });
});
