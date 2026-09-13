import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { buildAgentContext } from "@/lib/agent/buildAgentContext";
import {
  processNextObservationCommitted,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import {
  currentSimulatedAt,
} from "@/lib/orchestration/simulatedClock";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import { useAgentStore } from "@/store/useAgentStore";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import {
  initialDecisionRuntime,
  intakeDecisions,
} from "@/domain/decisions";
import {
  initialOverlayRuntime,
  syncOverlayFromReasoning,
} from "@/domain/effects";
import { recomputeRecoveryRuntime } from "@/domain/recovery";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
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

function recoveredAskContext() {
  const snapshot = freshSnapshot();
  const reasoning = processAll(snapshot);
  const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
  const recoveryResult = recomputeRecoveryRuntime({
    history: [],
    currentlyRecoveredIssueIds: [],
    reasoning,
    effective: overlay.effective,
    evaluationSimulatedAt: EVALUATION_AT,
  });
  if (!recoveryResult.ok) throw new Error(recoveryResult.error.code);
  const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
  const timeline = joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
    effectHistory: overlay.effectHistory,
    applicationResults: overlay.applicationResults,
    recoveryHistory: recoveryResult.runtime.history,
  });
  const context = buildAgentContext({
    reasoning,
    decisions,
    overlay,
    recovery: recoveryResult.runtime,
    evaluationSimulatedAt: EVALUATION_AT,
    timeline,
  });
  return { snapshot, reasoning, overlay, recovery: recoveryResult.runtime, decisions, timeline, context };
}

function resetStores() {
  useAgentStore.getState().clearHistory();
  useProjectStore.setState({
    snapshot: null,
    isLoaded: false,
    source: "demo",
    operational: null,
  });
  useReasoningStore.getState().resetReasoning();
  useReasoningStore.setState({ isInitialized: false });
  useDecisionStore.getState().resetDecisions();
  useOverlayStore.setState({ runtime: null });
  useRecoveryStore.setState({ runtime: null });
  useSimulatedClockStore.setState({ clock: null });
}

describe("useAgentStore", () => {
  beforeEach(() => {
    useAgentStore.getState().clearHistory();
  });

  it("appends user then agent with deterministic sequence ids", () => {
    const { context } = recoveredAskContext();
    const response = useAgentStore.getState().ask({
      question: "What recovered?",
      context,
    });
    const messages = useAgentStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "user-msg-1",
      role: "user",
      text: "What recovered?",
    });
    expect(messages[1]).toMatchObject({
      id: "agent-msg-2",
      role: "agent",
    });
    expect(response.id).toBe("agent-msg-2");
    expect(useAgentStore.getState().sequence).toBe(2);
  });

  it("increments ids on repeated asks and keeps equivalent content", () => {
    const { context } = recoveredAskContext();
    const first = useAgentStore.getState().ask({
      question: "What recovered?",
      context,
    });
    const second = useAgentStore.getState().ask({
      question: "What recovered?",
      context,
    });
    expect(first.id).toBe("agent-msg-2");
    expect(second.id).toBe("agent-msg-4");
    expect(second.answerText).toBe(first.answerText);
    expect(useAgentStore.getState().messages.map((item) => item.id)).toEqual([
      "user-msg-1",
      "agent-msg-2",
      "user-msg-3",
      "agent-msg-4",
    ]);
  });

  it("copies evaluationSimulatedAt and does not advance the simulated clock", () => {
    const { context } = recoveredAskContext();
    useSimulatedClockStore.setState({ clock: null });
    useSimulatedClockStore.getState().initializeClock(EVALUATION_AT);
    const before = structuredClone(useSimulatedClockStore.getState().clock);
    const response = useAgentStore.getState().ask({
      question: "What is Health?",
      context,
    });
    expect(response.generatedAtSimulated).toBe(context.evaluationSimulatedAt);
    const user = useAgentStore.getState().messages[0];
    if (user.role === "user") {
      expect(user.generatedAtSimulated).toBe(context.evaluationSimulatedAt);
    }
    expect(useSimulatedClockStore.getState().clock).toEqual(before);
    expect(useSimulatedClockStore.getState().clock?.committedStepCount).toBe(0);
    useSimulatedClockStore.setState({ clock: null });
  });

  it("does not mutate runtimes, context, or a separate simulated clock", () => {
    const { context, reasoning, decisions, overlay, recovery, timeline } =
      recoveredAskContext();
    const clock = useSimulatedClockStore.getState();
    const reasoningBefore = structuredClone(reasoning);
    const decisionsBefore = structuredClone(decisions);
    const overlayBefore = structuredClone(overlay);
    const recoveryBefore = structuredClone(recovery);
    const contextBefore = structuredClone(context);
    const timelineBefore = structuredClone(timeline);

    useAgentStore.getState().ask({ question: "What happened?", context });

    expect(reasoning).toEqual(reasoningBefore);
    expect(decisions).toEqual(decisionsBefore);
    expect(overlay).toEqual(overlayBefore);
    expect(recovery).toEqual(recoveryBefore);
    expect(context).toEqual(contextBefore);
    expect(timeline).toEqual(timelineBefore);
    expect(useSimulatedClockStore.getState()).toBe(clock);
  });

  it("clearHistory empties messages and resets sequence", () => {
    const { context } = recoveredAskContext();
    useAgentStore.getState().ask({ question: "What happened?", context });
    expect(useAgentStore.getState().messages.length).toBeGreaterThan(0);
    useAgentStore.getState().clearHistory();
    expect(useAgentStore.getState().messages).toEqual([]);
    expect(useAgentStore.getState().sequence).toBe(0);
  });

  it("Command Center Reset clears Agent history and still resets 3A/3B/3C", () => {
    resetStores();
    processNextObservationCommitted();
    const overlay = useOverlayStore.getState().runtime;
    const recovery = useRecoveryStore.getState().runtime;
    const reasoning = useReasoningStore.getState().runtime;
    const decisions = useDecisionStore.getState().runtime;
    if (!overlay || !recovery) throw new Error("phase 3c runtimes missing");
    const timeline = joinOperationalTimeline(reasoning.timeline, decisions.decisions, {
      effectHistory: overlay.effectHistory,
      applicationResults: overlay.applicationResults,
      recoveryHistory: recovery.history,
    });
    const context = buildAgentContext({
      reasoning,
      decisions,
      overlay,
      recovery,
      evaluationSimulatedAt:
        useSimulatedClockStore.getState().current() ?? EVALUATION_AT,
      timeline,
    });
    useAgentStore.getState().ask({ question: "What happened?", context });
    expect(useAgentStore.getState().messages).toHaveLength(2);
    expect(useReasoningStore.getState().runtime.reasonings.length).toBe(1);
    const clockBeforeReset = useSimulatedClockStore.getState().clock;

    resetCommandCenter();

    expect(useAgentStore.getState().messages).toEqual([]);
    expect(useAgentStore.getState().sequence).toBe(0);
    expect(useReasoningStore.getState().runtime.reasonings).toEqual([]);
    expect(useDecisionStore.getState().runtime.decisions).toEqual([]);
    expect(useOverlayStore.getState().runtime?.effectHistory).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.history).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(100);
    expect(useRecoveryStore.getState().runtime?.scores.drift.score).toBe(0);
    const clock = useSimulatedClockStore.getState().clock;
    expect(clock?.committedStepCount).toBe(0);
    expect(clock?.baselineSimulatedAt).toBe(clockBeforeReset?.baselineSimulatedAt);
    expect(currentSimulatedAt(clock!)).toBe("2026-03-14T10:30:00.000Z");
  });

  it("production agent store has no voice, LLM, or operational store imports", () => {
    const source = readFileSync("store/useAgentStore.ts", "utf8");
    for (const token of [
      "SpeechSynthesis",
      "speechSynthesis",
      "openai",
      "anthropic",
      "process.env",
      "fetch(",
      "Date.now(",
      "Math.random(",
      "randomUUID",
      "crypto.randomUUID",
      "setTimeout(",
      "setInterval(",
      "useReasoningStore",
      "useDecisionStore",
      "useOverlayStore",
      "useRecoveryStore",
    ]) {
      expect(source.includes(token), `store contains ${token}`).toBe(false);
    }
  });
});
