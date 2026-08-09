import { describe, expect, it, beforeEach } from "vitest";

import {
  decisionCounts,
  getDecisionByRecommendationId,
  initialDecisionRuntime,
  intakeDecisions,
  pendingReview,
  type DecisionRuntime,
} from "@/domain/decisions/runtime";
import {
  initialRuntime,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { useDecisionStore } from "@/store/useDecisionStore";
import { freshSnapshot } from "@/tests/engines/helpers";

function reasoningWithRecommendations(): ReasoningRuntime {
  const snapshot = freshSnapshot();
  let runtime = initialRuntime();
  // Process enough fixtures to produce multiple recommendations.
  for (let i = 0; i < 5; i++) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function recommendationCount(reasoning: ReasoningRuntime): number {
  return reasoning.reasonings.filter((r) => r.recommendation !== null).length;
}

describe("decision intake", () => {
  it("creates one decision per recommendation", () => {
    const reasoning = reasoningWithRecommendations();
    const recCount = recommendationCount(reasoning);
    expect(recCount).toBeGreaterThan(0);

    const decisions = intakeDecisions(reasoning, initialDecisionRuntime());
    expect(decisions.decisions).toHaveLength(recCount);
    expect(decisions.decisions.every((d) => d.state === "PendingReview")).toBe(true);

    for (const entry of reasoning.reasonings) {
      if (!entry.recommendation) continue;
      const decision = getDecisionByRecommendationId(
        decisions,
        entry.recommendation.id,
      );
      expect(decision).toBeDefined();
      expect(decision!.signalId).toBe(entry.recommendation.signalId);
      expect(decision!.id).toBe(`decision-${entry.recommendation.id}`);
    }
  });

  it("running intake twice creates no duplicates", () => {
    const reasoning = reasoningWithRecommendations();
    const first = intakeDecisions(reasoning, initialDecisionRuntime());
    const second = intakeDecisions(reasoning, first);
    expect(second.decisions).toHaveLength(first.decisions.length);
    expect(second.decisions.map((d) => d.id).sort()).toEqual(
      first.decisions.map((d) => d.id).sort(),
    );
  });

  it("DecisionRuntime remains deterministic", () => {
    const reasoning = reasoningWithRecommendations();
    const a = intakeDecisions(reasoning, initialDecisionRuntime());
    const b = intakeDecisions(reasoning, initialDecisionRuntime());
    expect(a).toEqual(b);
  });

  it("does not mutate ReasoningRuntime", () => {
    const reasoning = reasoningWithRecommendations();
    const before = structuredClone(reasoning);
    intakeDecisions(reasoning, initialDecisionRuntime());
    expect(reasoning).toEqual(before);
  });
});

describe("decision runtime selectors", () => {
  it("selectors return expected decisions", () => {
    const reasoning = reasoningWithRecommendations();
    const runtime = intakeDecisions(reasoning, initialDecisionRuntime());
    expect(pendingReview(runtime)).toHaveLength(runtime.decisions.length);
    expect(decisionCounts(runtime).pendingReview).toBe(runtime.decisions.length);
    expect(decisionCounts(runtime).total).toBe(runtime.decisions.length);
    expect(decisionCounts(runtime).terminal).toBe(0);

    const first = runtime.decisions[0];
    expect(
      getDecisionByRecommendationId(runtime, first.recommendationId)?.id,
    ).toBe(first.id);
  });
});

describe("useDecisionStore", () => {
  beforeEach(() => {
    useDecisionStore.getState().resetDecisions();
  });

  it("reset clears DecisionRuntime", () => {
    const reasoning = reasoningWithRecommendations();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    expect(useDecisionStore.getState().runtime.decisions.length).toBeGreaterThan(0);
    useDecisionStore.getState().resetDecisions();
    expect(useDecisionStore.getState().runtime).toEqual(initialDecisionRuntime());
  });

  it("ReasoningRuntime is unchanged after sync", () => {
    const reasoning = reasoningWithRecommendations();
    const before = structuredClone(reasoning);
    useDecisionStore.getState().syncFromReasoning(reasoning);
    expect(reasoning).toEqual(before);
  });

  it("actions use the FSM — acknowledge when approval not required", () => {
    const reasoning = reasoningWithRecommendations();
    useDecisionStore.getState().syncFromReasoning(reasoning);

    const candidate = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => !d.approvalRequired);
    expect(candidate).toBeDefined();

    const result = useDecisionStore.getState().acknowledgeDecision(candidate!.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.state).toBe("Acknowledged");
    expect(useDecisionStore.getState().byId(candidate!.id)?.state).toBe(
      "Acknowledged",
    );
    expect(useDecisionStore.getState().terminal().some((d) => d.id === candidate!.id)).toBe(
      true,
    );
  });

  it("actions use the FSM — approve mutating path reaches PendingExecution", () => {
    const snapshot = freshSnapshot();
    let reasoning = initialRuntime();
    for (let i = 0; i < snapshot.scenarioFixtures.length; i++) {
      reasoning = processNextObservation(snapshot, reasoning);
    }
    useDecisionStore.getState().syncFromReasoning(reasoning);

    const candidate = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired && d.mutatesOperationalState);
    expect(candidate).toBeDefined();

    const result = useDecisionStore.getState().approveDecision(candidate!.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.state).toBe("PendingExecution");
    expect(result.decision.auditTrail).toHaveLength(2);
    expect(result.decision.auditTrail.map((e) => e.command)).toEqual([
      "ApproveDecision",
      "ProceedAfterApproval",
    ]);
  });

  it("invalid transitions leave runtime unchanged", () => {
    const reasoning = reasoningWithRecommendations();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const before: DecisionRuntime = structuredClone(
      useDecisionStore.getState().runtime,
    );

    const decision = useDecisionStore.getState().runtime.decisions[0];
    // Force an invalid command: verify while still PendingReview.
    const result = useDecisionStore.getState().verifyDecision(decision.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect(useDecisionStore.getState().runtime).toEqual(before);
  });

  it("reject leaves decision Rejected and store selectors update", () => {
    const reasoning = reasoningWithRecommendations();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const candidate = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired);
    expect(candidate).toBeDefined();

    const result = useDecisionStore.getState().rejectDecision(candidate!.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
      reason: "Not justified",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.state).toBe("Rejected");
    expect(useDecisionStore.getState().counts().rejected).toBe(1);
    expect(useDecisionStore.getState().pendingReview().every((d) => d.id !== candidate!.id)).toBe(
      true,
    );
  });

  it("store selectors mirror runtime helpers", () => {
    const reasoning = reasoningWithRecommendations();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const store = useDecisionStore.getState();
    expect(store.pendingReview()).toEqual(pendingReview(store.runtime));
    expect(store.counts()).toEqual(decisionCounts(store.runtime));
  });
});
