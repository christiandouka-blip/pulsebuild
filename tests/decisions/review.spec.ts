import { describe, expect, it, beforeEach } from "vitest";

import { applyCommandsToDecision } from "@/domain/decisions/applyCommands";
import {
  initialDecisionRuntime,
  intakeDecisions,
} from "@/domain/decisions/runtime";
import {
  initialRuntime,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import {
  actionKindLabel,
  canShowReviewControls,
  formatDecisionError,
  joinDecisionReviews,
  resolveSelectedActionFact,
  reviewEmptyMessage,
} from "@/lib/selectors/decisionReviewSelectors";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { freshSnapshot } from "@/tests/engines/helpers";

function processAndSync(count: number): {
  reasoning: ReasoningRuntime;
} {
  useReasoningStore.setState({
    isInitialized: true,
    runtime: initialRuntime(),
    canProcessNext: true,
  });
  useDecisionStore.getState().resetDecisions();

  for (let i = 0; i < count; i++) {
    useReasoningStore.getState().processNextObservation();
    useDecisionStore
      .getState()
      .syncFromReasoning(useReasoningStore.getState().runtime);
  }

  return { reasoning: useReasoningStore.getState().runtime };
}

function processAll(): ReasoningRuntime {
  const snapshot = freshSnapshot();
  let reasoning = initialRuntime();
  for (let i = 0; i < snapshot.scenarioFixtures.length; i++) {
    reasoning = processNextObservation(snapshot, reasoning);
  }
  return reasoning;
}

describe("decision review selectors", () => {
  it("joins recommendation and decision by recommendationId after sync", () => {
    const { reasoning } = processAndSync(3);
    const items = joinDecisionReviews(
      reasoning.reasonings,
      useDecisionStore.getState().runtime,
    );
    const withRec = reasoning.reasonings.filter((r) => r.recommendation !== null);
    expect(items.length).toBe(withRec.length);
    for (const item of items) {
      expect(item.decision).not.toBeNull();
      expect(item.decision!.recommendationId).toBe(item.recommendation.id);
      expect(item.decision!.id).toBe(`decision-${item.recommendation.id}`);
    }
  });

  it("processing a recommendation followed by sync creates a reviewable decision", () => {
    processAndSync(2);
    const pending = useDecisionStore.getState().pendingReview();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((d) => d.state === "PendingReview")).toBe(true);
  });

  it("resolveSelectedActionFact returns primary and alternative identities", () => {
    const reasoning = processAll();
    const runtime = intakeDecisions(reasoning, initialDecisionRuntime());
    const items = joinDecisionReviews(reasoning.reasonings, runtime);
    const withAlts = items.find(
      (i) => (i.proposalFacts?.alternatives.length ?? 0) > 0,
    );
    expect(withAlts?.proposalFacts).toBeDefined();
    const facts = withAlts!.proposalFacts!;
    const primary = resolveSelectedActionFact(facts, { source: "primary" });
    expect(primary?.action).toBe(facts.primaryAction.action);
    const alt = resolveSelectedActionFact(facts, {
      source: "alternative",
      alternativeIndex: 0,
    });
    expect(alt?.action).toBe(facts.alternatives[0].action);
    const missing = resolveSelectedActionFact(facts, {
      source: "alternative",
      alternativeIndex: 99,
    });
    expect(missing).toBeNull();
  });

  it("required approval exposes approve/reject capability; non-required exposes acknowledge", () => {
    const reasoning = processAll();
    const runtime = intakeDecisions(reasoning, initialDecisionRuntime());
    const items = joinDecisionReviews(reasoning.reasonings, runtime);
    const required = items.find((i) => i.recommendation.approval.required)!;
    const optional = items.find((i) => !i.recommendation.approval.required)!;
    expect(canShowReviewControls(required.decision)).toBe(true);
    expect(required.recommendation.approval.required).toBe(true);
    expect(canShowReviewControls(optional.decision)).toBe(true);
    expect(optional.recommendation.approval.required).toBe(false);
    expect(actionKindLabel(true)).toBe("Operational action");
    expect(actionKindLabel(false)).toBe("Advisory action");
  });

  it("terminal states expose no review actions", () => {
    processAndSync(5);
    const optional = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => !d.approvalRequired)!;
    useDecisionStore.getState().acknowledgeDecision(optional.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
    });
    const after = useDecisionStore.getState().byId(optional.id)!;
    expect(after.state).toBe("Acknowledged");
    expect(canShowReviewControls(after)).toBe(false);
  });

  it("formatDecisionError maps typed codes clearly", () => {
    expect(formatDecisionError("MISSING_REASON", "need reason")).toMatch(
      /Rejection reason required/,
    );
    expect(formatDecisionError("DECISION_ALREADY_TERMINAL", "done")).toMatch(
      /already completed/,
    );
    expect(formatDecisionError("ACTION_NOT_FOUND", "gone")).toMatch(
      /no longer available/,
    );
  });

  it("reviewEmptyMessage covers no-recommendation and no-pending cases", () => {
    const empty = reviewEmptyMessage([], []);
    expect(empty.title).toMatch(/No recommendations/i);
    const reasoning = processAll();
    const runtime = intakeDecisions(reasoning, initialDecisionRuntime());
    const items = joinDecisionReviews(reasoning.reasonings, runtime);
    // Acknowledge/reject all pending so none remain PendingReview
    for (const d of [...runtime.decisions]) {
      if (!d.approvalRequired) {
        useDecisionStore.getState().resetDecisions();
      }
    }
    useDecisionStore.getState().syncFromReasoning(reasoning);
    for (const d of useDecisionStore.getState().runtime.decisions) {
      if (d.approvalRequired) {
        useDecisionStore.getState().rejectDecision(d.id, {
          simulatedAt: "2026-07-01T12:00:00.000Z",
          reason: "Deferred for test",
        });
      } else {
        useDecisionStore.getState().acknowledgeDecision(d.id, {
          simulatedAt: "2026-07-01T12:00:00.000Z",
        });
      }
    }
    const afterItems = joinDecisionReviews(
      reasoning.reasonings,
      useDecisionStore.getState().runtime,
    );
    const msg = reviewEmptyMessage(reasoning.reasonings, afterItems);
    expect(msg.title).toMatch(/No pending reviews/i);
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("chained decision atomicity", () => {
  beforeEach(() => {
    useDecisionStore.getState().resetDecisions();
  });

  it("mutating approve chain produces PendingReview→Approved→PendingExecution audits", () => {
    const reasoning = processAll();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const candidate = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired && d.mutatesOperationalState)!;
    const result = useDecisionStore.getState().approveDecision(candidate.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
      selectedActionSource: "primary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.state).toBe("PendingExecution");
    expect(result.decision.auditTrail).toHaveLength(2);
    expect(result.decision.auditTrail[0]).toMatchObject({
      fromState: "PendingReview",
      toState: "Approved",
      command: "ApproveDecision",
    });
    expect(result.decision.auditTrail[1]).toMatchObject({
      fromState: "Approved",
      toState: "PendingExecution",
      command: "ProceedAfterApproval",
    });
    expect(result.decision.selectedAction).toBe(
      useDecisionStore.getState().runtime.proposalFactsByRecommendationId[
        candidate.recommendationId
      ].primaryAction.action,
    );
  });

  it("non-mutating approve chain produces Approved→AwaitingVerification", () => {
    const reasoning = processAll();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const candidate = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired && !d.mutatesOperationalState);
    // Prefer approving a non-mutating alternative on a mutating-required decision
    const withFacts = useDecisionStore.getState().runtime.decisions.find((d) => {
      if (!d.approvalRequired) return false;
      const facts =
        useDecisionStore.getState().runtime.proposalFactsByRecommendationId[
          d.recommendationId
        ];
      return facts.alternatives.some((a) => !a.mutatesOperationalState);
    });
    const target = candidate ?? withFacts;
    expect(target).toBeDefined();

    const facts =
      useDecisionStore.getState().runtime.proposalFactsByRecommendationId[
        target!.recommendationId
      ];
    const altIndex = facts.alternatives.findIndex((a) => !a.mutatesOperationalState);

    const result =
      altIndex >= 0
        ? useDecisionStore.getState().approveDecision(target!.id, {
            simulatedAt: "2026-07-01T12:00:00.000Z",
            selectedActionSource: "alternative",
            alternativeIndex: altIndex,
          })
        : useDecisionStore.getState().approveDecision(target!.id, {
            simulatedAt: "2026-07-01T12:00:00.000Z",
            selectedActionSource: "primary",
          });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.state).toBe("AwaitingVerification");
    expect(result.decision.auditTrail).toHaveLength(2);
    expect(result.decision.auditTrail.map((e) => `${e.fromState}->${e.toState}`)).toEqual([
      "PendingReview->Approved",
      "Approved->AwaitingVerification",
    ]);
  });

  it("alternative approval uses the correct action identity", () => {
    const reasoning = processAll();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const target = useDecisionStore.getState().runtime.decisions.find((d) => {
      if (!d.approvalRequired) return false;
      const facts =
        useDecisionStore.getState().runtime.proposalFactsByRecommendationId[
          d.recommendationId
        ];
      return facts.alternatives.length > 0;
    });
    expect(target).toBeDefined();
    const facts =
      useDecisionStore.getState().runtime.proposalFactsByRecommendationId[
        target!.recommendationId
      ];
    const result = useDecisionStore.getState().approveDecision(target!.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
      selectedActionSource: "alternative",
      alternativeIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.selectedAction).toBe(facts.alternatives[0].action);
    expect(result.decision.selectedActionSource).toBe("alternative");
  });

  it("unknown action selection fails without runtime mutation", () => {
    const reasoning = processAll();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const before = structuredClone(useDecisionStore.getState().runtime);
    const target = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired)!;
    const result = useDecisionStore.getState().approveDecision(target.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
      selectedActionSource: "alternative",
      alternativeIndex: 99,
    });
    expect(result.ok).toBe(false);
    expect(useDecisionStore.getState().runtime).toEqual(before);
  });

  it("reject without a reason fails", () => {
    const reasoning = processAll();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const before = structuredClone(useDecisionStore.getState().runtime);
    const target = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired)!;
    const result = useDecisionStore.getState().rejectDecision(target.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
      reason: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_REASON");
    expect(useDecisionStore.getState().runtime).toEqual(before);
  });

  it("partial chain is not committed when the second command is invalid", () => {
    const reasoning = processAll();
    const runtime = intakeDecisions(reasoning, initialDecisionRuntime());
    const decision = runtime.decisions.find((d) => d.approvalRequired)!;
    const before = structuredClone(runtime);
    // Approve would succeed, but VerifyDecision is invalid from Approved — chain must not commit.
    const result = applyCommandsToDecision(runtime, decision.id, [
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: "2026-07-01T12:00:00.000Z",
        selectedActionSource: "primary",
      },
      {
        type: "VerifyDecision",
        actor: "superintendent",
        simulatedAt: "2026-07-01T12:00:00.000Z",
      },
    ]);
    expect(result.ok).toBe(false);
    // Caller must not set — prove helper did not mutate input runtime.
    expect(runtime).toEqual(before);
  });

  it("executeDecision chain is atomic and appends two audit events", () => {
    const reasoning = processAll();
    useDecisionStore.getState().syncFromReasoning(reasoning);
    const candidate = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired && d.mutatesOperationalState)!;
    const approved = useDecisionStore.getState().approveDecision(candidate.id, {
      simulatedAt: "2026-07-01T12:00:00.000Z",
    });
    expect(approved.ok).toBe(true);
    const executed = useDecisionStore.getState().executeDecision(candidate.id, {
      simulatedAt: "2026-07-01T13:00:00.000Z",
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.decision.state).toBe("AwaitingVerification");
    const lastTwo = executed.decision.auditTrail.slice(-2);
    expect(lastTwo.map((e) => `${e.fromState}->${e.toState}`)).toEqual([
      "PendingExecution->Executed",
      "Executed->AwaitingVerification",
    ]);
  });

  it("repeating intake does not duplicate queue items", () => {
    const { reasoning } = processAndSync(3);
    const first = useDecisionStore.getState().runtime.decisions.length;
    useDecisionStore.getState().syncFromReasoning(reasoning);
    useDecisionStore.getState().syncFromReasoning(reasoning);
    expect(useDecisionStore.getState().runtime.decisions.length).toBe(first);
    expect(joinDecisionReviews(reasoning.reasonings, useDecisionStore.getState().runtime)).toHaveLength(
      first,
    );
  });

  it("reset clears both reasoning and decision state through the orchestration path", () => {
    processAndSync(3);
    expect(useReasoningStore.getState().runtime.reasonings.length).toBeGreaterThan(0);
    expect(useDecisionStore.getState().runtime.decisions.length).toBeGreaterThan(0);

    // Mirror CommandCenterShell handleReset
    useReasoningStore.getState().resetReasoning();
    useDecisionStore.getState().resetDecisions();

    expect(useReasoningStore.getState().runtime.reasonings).toHaveLength(0);
    expect(useDecisionStore.getState().runtime.decisions).toHaveLength(0);
  });
});
