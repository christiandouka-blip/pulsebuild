import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  askPulseBuildAgent,
  canSubmitAgentQuestion,
  currentAgentContext,
  normalizeAgentQuestion,
} from "@/lib/orchestration/agentChat";
import {
  AGENT_SUGGESTED_QUESTIONS,
  evidenceChipLabel,
  evidenceSignalHref,
  presentAgentResponse,
} from "@/lib/agent/agentChatPresentation";
import { unavailableLlmExplainer } from "@/lib/agent/explainer";
import {
  ensureCommandCenterInitialized,
  processNextObservationCommitted,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import { useAgentStore } from "@/store/useAgentStore";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";

function resetAllStores(): void {
  useAgentStore.getState().clearHistory();
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

function processAllObservations(): void {
  while (true) {
    const result = processNextObservationCommitted();
    if (!result.ok) break;
  }
}

function requireContext() {
  const context = currentAgentContext();
  if (!context) throw new Error("AgentContext unavailable");
  return context;
}

function snapshotJson(): string {
  const snapshot = useProjectStore.getState().snapshot;
  if (!snapshot) throw new Error("snapshot is not loaded");
  return JSON.stringify(snapshot);
}

describe("Phase 4C Agent Chat orchestration", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("builds AgentContext from current runtimes", () => {
    ensureCommandCenterInitialized();
    const context = requireContext();
    const recovery = useRecoveryStore.getState().runtime;
    const clock = useSimulatedClockStore.getState().clock;
    if (!recovery || !clock) throw new Error("runtimes missing");
    expect(context.health.score).toBe(recovery.scores.health.score);
    expect(context.drift.score).toBe(recovery.scores.drift.score);
    expect(context.evaluationSimulatedAt).toBe(currentSimulatedAt(clock));
    expect(context.health.score).toBe(100);
  });

  it("ask uses the current context and appends user then agent", () => {
    ensureCommandCenterInitialized();
    const context = requireContext();
    const result = askPulseBuildAgent("What happened?");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.generatedAtSimulated).toBe(context.evaluationSimulatedAt);
    expect(result.response.grounding).toBe("grounded");
    const messages = useAgentStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "user-msg-1",
      role: "user",
      text: "What happened?",
    });
    expect(messages[1]).toMatchObject({
      id: "agent-msg-2",
      role: "agent",
    });
  });

  it("second question after recovery uses updated scores and keeps history", () => {
    ensureCommandCenterInitialized();
    const firstAsk = askPulseBuildAgent("What is Health?");
    expect(firstAsk.ok).toBe(true);
    if (!firstAsk.ok) return;
    expect(firstAsk.response.answerText).toContain("100");

    processAllObservations();
    const recovered = requireContext();
    expect(recovered.health.score).toBe(41);
    expect(recovered.drift.score).toBe(95);

    const secondAsk = askPulseBuildAgent("What is Health?");
    expect(secondAsk.ok).toBe(true);
    if (!secondAsk.ok) return;
    expect(secondAsk.response.answerText).toContain("41");
    expect(secondAsk.response.answerText).toContain("red");

    const firstAgent = useAgentStore.getState().messages[1];
    if (firstAgent.role !== "agent") throw new Error("expected agent message");
    expect(firstAgent.response.answerText).toContain("100");
    expect(firstAgent.response.answerText).not.toContain("Effective Health is 41");
    expect(firstAgent.response).toEqual(firstAsk.response);
  });

  it("rejects empty and whitespace-only questions without appending messages", () => {
    ensureCommandCenterInitialized();
    expect(normalizeAgentQuestion("  What happened?  ")).toBe("What happened?");
    expect(canSubmitAgentQuestion("")).toBe(false);
    expect(canSubmitAgentQuestion("   ")).toBe(false);
    expect(canSubmitAgentQuestion("What happened?")).toBe(true);

    expect(askPulseBuildAgent("").ok).toBe(false);
    expect(askPulseBuildAgent("   ").ok).toBe(false);
    expect(useAgentStore.getState().messages).toEqual([]);
    expect(useAgentStore.getState().sequence).toBe(0);

    const result = askPulseBuildAgent("  What happened?  ");
    expect(result.ok).toBe(true);
    const user = useAgentStore.getState().messages[0];
    expect(user.role).toBe("user");
    if (user.role === "user") expect(user.text).toBe("What happened?");
  });

  it("keeps grounded, unsupported, and unavailable presentation distinct", () => {
    ensureCommandCenterInitialized();
    processAllObservations();

    const grounded = askPulseBuildAgent("What should I do next?");
    expect(grounded.ok).toBe(true);
    if (!grounded.ok) return;
    expect(grounded.response.grounding).toBe("grounded");
    expect(grounded.response.evidenceRefs.length).toBeGreaterThan(0);
    const groundedView = presentAgentResponse(grounded.response);
    expect(groundedView.grounding).toBe("grounded");
    expect(groundedView.groundingLabel).toBe("Grounded");
    expect(groundedView.answerText).toBe(grounded.response.answerText);
    expect(groundedView.evidenceRefs).toEqual(grounded.response.evidenceRefs);

    const unsupported = askPulseBuildAgent(
      "What will the weather be tomorrow on the internet?",
    );
    expect(unsupported.ok).toBe(true);
    if (!unsupported.ok) return;
    expect(unsupported.response.grounding).toBe("unsupported");
    const unsupportedView = presentAgentResponse(unsupported.response);
    expect(unsupportedView.grounding).toBe("unsupported");
    expect(unsupportedView.groundingLabel).toBe("Unsupported");
    expect(unsupportedView.answerText).toBe(unsupported.response.answerText);
    expect(unsupportedView.evidenceRefs).toEqual([]);

    const context = requireContext();
    const unavailable = unavailableLlmExplainer.explain("What happened?", context, {
      id: "agent-msg-unavailable",
    });
    const unavailableView = presentAgentResponse(unavailable);
    expect(unavailableView.grounding).toBe("unavailable");
    expect(unavailableView.groundingLabel).toBe("Unavailable");
    expect(unavailableView.answerText).toBe(unavailable.answerText);
  });

  it("does not advance time, process fixtures, or mutate operational runtimes", () => {
    ensureCommandCenterInitialized();
    processNextObservationCommitted();

    const reasoningBefore = structuredClone(useReasoningStore.getState().runtime);
    const decisionsBefore = structuredClone(useDecisionStore.getState().runtime);
    const overlayBefore = structuredClone(useOverlayStore.getState().runtime);
    const recoveryBefore = structuredClone(useRecoveryStore.getState().runtime);
    const snapshotBefore = snapshotJson();
    const clockBefore = structuredClone(useSimulatedClockStore.getState().clock);
    const fixturesBefore = [
      ...useReasoningStore.getState().runtime.processedFixtureIds,
    ];

    askPulseBuildAgent("What happened?");
    askPulseBuildAgent("What is blocking?");

    expect(useReasoningStore.getState().runtime).toEqual(reasoningBefore);
    expect(useDecisionStore.getState().runtime).toEqual(decisionsBefore);
    expect(useOverlayStore.getState().runtime).toEqual(overlayBefore);
    expect(useRecoveryStore.getState().runtime).toEqual(recoveryBefore);
    expect(snapshotJson()).toBe(snapshotBefore);
    expect(useSimulatedClockStore.getState().clock).toEqual(clockBefore);
    expect(useReasoningStore.getState().runtime.processedFixtureIds).toEqual(
      fixturesBefore,
    );
  });

  it("Reset clears Agent history and sequence while restoring Phase 3 runtimes", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    askPulseBuildAgent("What recovered?");
    expect(useAgentStore.getState().messages).toHaveLength(2);
    expect(useAgentStore.getState().sequence).toBe(2);

    resetCommandCenter();

    expect(useAgentStore.getState().messages).toEqual([]);
    expect(useAgentStore.getState().sequence).toBe(0);
    expect(useReasoningStore.getState().runtime.reasonings).toEqual([]);
    expect(useDecisionStore.getState().runtime.decisions).toEqual([]);
    expect(useRecoveryStore.getState().runtime?.scores.health.score).toBe(100);
    expect(useSimulatedClockStore.getState().clock?.committedStepCount).toBe(0);
  });

  it("repeated runs produce equivalent response content", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    const first = askPulseBuildAgent("What recovered?");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    resetCommandCenter();
    processAllObservations();
    const second = askPulseBuildAgent("What recovered?");
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.response.answerText).toBe(first.response.answerText);
    expect(second.response.grounding).toBe(first.response.grounding);
    expect(second.response.evidenceRefs).toEqual(first.response.evidenceRefs);
  });

  it("suggested questions use the same ask path and evidence chips do not invent facts", () => {
    ensureCommandCenterInitialized();
    processAllObservations();
    for (const question of AGENT_SUGGESTED_QUESTIONS) {
      const result = askPulseBuildAgent(question);
      expect(result.ok, question).toBe(true);
      if (!result.ok) continue;
      expect(result.response.question).toBe(question);
      expect(result.response.grounding).toBe("grounded");
    }
    const last = useAgentStore.getState().messages.at(-1);
    if (!last || last.role !== "agent") throw new Error("expected agent message");
    for (const ref of last.response.evidenceRefs) {
      expect(evidenceChipLabel(ref)).toBe(`${ref.entityType} · ${ref.entityId}`);
      if (ref.entityType === "signal") {
        expect(evidenceSignalHref(ref)).toBe(`/signals/${ref.entityId}`);
      } else {
        expect(evidenceSignalHref(ref)).toBeNull();
      }
    }
  });

  it("Agent UI orchestration has no operational commands, engines, timers, or LLM sources", () => {
    const files = [
      "lib/orchestration/agentChat.ts",
      "lib/agent/agentChatPresentation.ts",
      "components/chat/AgentChatPanelShell.tsx",
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
      "process.env",
      "fetch(",
      "approveDecisionCommitted",
      "rejectDecisionCommitted",
      "acknowledgeDecisionCommitted",
      "executeDecisionCommitted",
      "verifyDecisionCommitted",
      "failVerificationCommitted",
      "blockDecisionCommitted",
      "retryDecisionCommitted",
      "cancelDecisionCommitted",
      "processNextObservationCommitted",
      "recommendationEngine",
      "priorityEngine",
      "healthEngine",
      "driftEngine",
      "applyEffect",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });
});
