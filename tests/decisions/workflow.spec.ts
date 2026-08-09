import { beforeEach, describe, expect, it } from "vitest";

import {
  allowedCommandsForState,
  applyCommandsToDecision,
  initialDecisionRuntime,
  intakeDecisions,
  isTerminalDecisionState,
  transitionDecision,
  probeProposalFacts,
  type DecisionCommand,
  type DecisionRuntime,
  type OperationalDecision,
} from "@/domain/decisions";
import {
  initialRuntime,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";
import {
  formatWorkflowError,
  latestAuditEvent,
  workflowControlModel,
  workflowCounts,
  workflowStatusLabel,
} from "@/lib/selectors/decisionWorkflowSelectors";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { freshSnapshot } from "@/tests/engines/helpers";

const ACTOR = "superintendent" as const;
const T0 = "2026-07-01T12:00:00.000Z";
const T1 = "2026-07-01T13:00:00.000Z";
const T2 = "2026-07-01T14:00:00.000Z";

function processAll(): ReasoningRuntime {
  const snapshot = freshSnapshot();
  let reasoning = initialRuntime();
  for (let i = 0; i < snapshot.scenarioFixtures.length; i++) {
    reasoning = processNextObservation(snapshot, reasoning);
  }
  return reasoning;
}

function seededRuntime(): DecisionRuntime {
  return intakeDecisions(processAll(), initialDecisionRuntime());
}

function apply(
  runtime: DecisionRuntime,
  decisionId: string,
  commands: DecisionCommand[],
): { runtime: DecisionRuntime; decision: OperationalDecision } {
  const result = applyCommandsToDecision(runtime, decisionId, commands);
  if (!result.ok) {
    throw new Error(`unexpected failure: ${result.error.code} ${result.error.message}`);
  }
  return { runtime: result.runtime, decision: result.decision };
}

/** Approve a mutating recommendation so the decision sits in PendingExecution. */
function pendingExecutionFixture(): {
  runtime: DecisionRuntime;
  decision: OperationalDecision;
} {
  const seeded = seededRuntime();
  const target = seeded.decisions.find(
    (d) => d.approvalRequired && d.mutatesOperationalState,
  );
  if (!target) throw new Error("no approval-required mutating recommendation seeded");
  return apply(seeded, target.id, [
    {
      type: "ApproveDecision",
      actor: ACTOR,
      simulatedAt: T0,
      selectedActionSource: "primary",
    },
    { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T0 },
  ]);
}

function awaitingVerificationFixture(): {
  runtime: DecisionRuntime;
  decision: OperationalDecision;
} {
  const pending = pendingExecutionFixture();
  return apply(pending.runtime, pending.decision.id, [
    { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T1 },
    { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: T1 },
  ]);
}

describe("execution workflow capabilities", () => {
  it("PendingExecution exposes execute, block, and cancel capabilities", () => {
    const { decision } = pendingExecutionFixture();
    expect(decision.state).toBe("PendingExecution");

    const controls = workflowControlModel(decision);
    expect(controls.showExecutionPanel).toBe(true);
    expect(controls.showVerificationPanel).toBe(false);
    expect(controls.canMarkExecuted).toBe(true);
    expect(controls.canBlockExecution).toBe(true);
    expect(controls.canCancel).toBe(true);
    expect(controls.canVerify).toBe(false);
    expect(controls.canFailVerification).toBe(false);
  });

  it("executeDecision performs the atomic PendingExecution → Executed → AwaitingVerification chain", () => {
    useDecisionStore.getState().resetDecisions();
    useDecisionStore.getState().syncFromReasoning(processAll());
    const target = useDecisionStore
      .getState()
      .runtime.decisions.find((d) => d.approvalRequired && d.mutatesOperationalState)!;
    useDecisionStore.getState().approveDecision(target.id, { simulatedAt: T0 });

    const executed = useDecisionStore
      .getState()
      .executeDecision(target.id, { simulatedAt: T1 });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.decision.state).toBe("AwaitingVerification");
    expect(useDecisionStore.getState().byId(target.id)!.state).toBe(
      "AwaitingVerification",
    );
  });

  it("appends both execution audit events in order", () => {
    const { decision } = awaitingVerificationFixture();
    const chain = decision.auditTrail.map((e) => `${e.fromState}->${e.toState}`);
    expect(chain).toEqual([
      "PendingReview->Approved",
      "Approved->PendingExecution",
      "PendingExecution->Executed",
      "Executed->AwaitingVerification",
    ]);
    expect(decision.auditTrail.map((e) => e.command).slice(-2)).toEqual([
      "MarkExecutionComplete",
      "AdvanceToVerification",
    ]);
  });

  it("failure in the second execution transition commits nothing", () => {
    const { runtime, decision } = pendingExecutionFixture();
    const before = structuredClone(runtime);

    const result = applyCommandsToDecision(runtime, decision.id, [
      { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T1 },
      { type: "VerifyDecision", actor: ACTOR, simulatedAt: T1 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
    expect(runtime).toEqual(before);
  });
});

describe("block, retry, and cancel", () => {
  it("block requires a reason", () => {
    const { runtime, decision } = pendingExecutionFixture();
    const before = structuredClone(runtime);
    const result = applyCommandsToDecision(runtime, decision.id, [
      { type: "BlockExecution", actor: ACTOR, simulatedAt: T1, reason: "   " },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_REASON");
    expect(runtime).toEqual(before);
  });

  it("PendingExecution → Blocked records reason, actor, and simulated timestamp", () => {
    const pending = pendingExecutionFixture();
    const { decision } = apply(pending.runtime, pending.decision.id, [
      {
        type: "BlockExecution",
        actor: ACTOR,
        simulatedAt: T1,
        reason: "Crane unavailable on site",
      },
    ]);

    expect(decision.state).toBe("Blocked");
    const event = latestAuditEvent(decision, "BlockExecution")!;
    expect(event.reason).toBe("Crane unavailable on site");
    expect(event.actor).toBe(ACTOR);
    expect(event.simulatedAt).toBe(T1);

    const controls = workflowControlModel(decision);
    expect(controls.showExecutionPanel).toBe(true);
    expect(controls.canRetryExecution).toBe(true);
    expect(controls.canCancel).toBe(true);
    expect(controls.canMarkExecuted).toBe(false);
  });

  it("Blocked → PendingExecution retry keeps the selected action and prior audit events", () => {
    const pending = pendingExecutionFixture();
    const selectedAction = pending.decision.selectedAction;
    const blockedRuntime = apply(pending.runtime, pending.decision.id, [
      {
        type: "BlockExecution",
        actor: ACTOR,
        simulatedAt: T1,
        reason: "Inspector not on site",
      },
    ]);
    const retried = apply(blockedRuntime.runtime, pending.decision.id, [
      { type: "RetryExecution", actor: ACTOR, simulatedAt: T2 },
    ]);

    expect(retried.decision.state).toBe("PendingExecution");
    expect(retried.decision.selectedAction).toBe(selectedAction);
    expect(retried.decision.id).toBe(pending.decision.id);
    expect(retried.decision.recommendationId).toBe(pending.decision.recommendationId);
    expect(latestAuditEvent(retried.decision, "BlockExecution")).not.toBeNull();
    expect(retried.decision.auditTrail).toHaveLength(
      pending.decision.auditTrail.length + 2,
    );
    expect(retried.runtime.decisions).toHaveLength(pending.runtime.decisions.length);
  });

  it("Blocked → Cancelled", () => {
    const pending = pendingExecutionFixture();
    const blockedRuntime = apply(pending.runtime, pending.decision.id, [
      { type: "BlockExecution", actor: ACTOR, simulatedAt: T1, reason: "Weather hold" },
    ]);
    const cancelled = apply(blockedRuntime.runtime, pending.decision.id, [
      { type: "CancelDecision", actor: ACTOR, simulatedAt: T2 },
    ]);
    expect(cancelled.decision.state).toBe("Cancelled");
  });

  it("PendingExecution → Cancelled", () => {
    const pending = pendingExecutionFixture();
    const cancelled = apply(pending.runtime, pending.decision.id, [
      { type: "CancelDecision", actor: ACTOR, simulatedAt: T1 },
    ]);
    expect(cancelled.decision.state).toBe("Cancelled");
    expect(cancelled.decision.issueId).toBe(pending.decision.issueId);
  });

  it("Cancelled is terminal and exposes no workflow controls", () => {
    const pending = pendingExecutionFixture();
    const cancelled = apply(pending.runtime, pending.decision.id, [
      { type: "CancelDecision", actor: ACTOR, simulatedAt: T1 },
    ]);

    expect(isTerminalDecisionState(cancelled.decision.state)).toBe(true);
    expect(allowedCommandsForState(cancelled.decision)).toEqual([]);
    const controls = workflowControlModel(cancelled.decision);
    expect(controls.showExecutionPanel).toBe(false);
    expect(controls.showVerificationPanel).toBe(false);

    const retry = applyCommandsToDecision(cancelled.runtime, cancelled.decision.id, [
      { type: "RetryExecution", actor: ACTOR, simulatedAt: T2 },
    ]);
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error.code).toBe("DECISION_ALREADY_TERMINAL");
  });
});

describe("verification workflow", () => {
  it("AwaitingVerification → Verified", () => {
    const awaiting = awaitingVerificationFixture();
    const controls = workflowControlModel(awaiting.decision);
    expect(controls.showVerificationPanel).toBe(true);
    expect(controls.showExecutionPanel).toBe(false);
    expect(controls.canVerify).toBe(true);
    expect(controls.canFailVerification).toBe(true);

    const verifiedResult = apply(awaiting.runtime, awaiting.decision.id, [
      { type: "VerifyDecision", actor: ACTOR, simulatedAt: T2 },
    ]);
    expect(verifiedResult.decision.state).toBe("Verified");
  });

  it("Verified is terminal", () => {
    const awaiting = awaitingVerificationFixture();
    const verifiedResult = apply(awaiting.runtime, awaiting.decision.id, [
      { type: "VerifyDecision", actor: ACTOR, simulatedAt: T2 },
    ]);
    expect(isTerminalDecisionState(verifiedResult.decision.state)).toBe(true);
    expect(allowedCommandsForState(verifiedResult.decision)).toEqual([]);

    const again = applyCommandsToDecision(
      verifiedResult.runtime,
      verifiedResult.decision.id,
      [{ type: "RetryExecution", actor: ACTOR, simulatedAt: T2 }],
    );
    expect(again.ok).toBe(false);
  });

  it("AwaitingVerification → VerificationFailed requires a reason", () => {
    const awaiting = awaitingVerificationFixture();
    const before = structuredClone(awaiting.runtime);
    const failed = applyCommandsToDecision(awaiting.runtime, awaiting.decision.id, [
      { type: "FailVerification", actor: ACTOR, simulatedAt: T2, reason: "" },
    ]);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("MISSING_REASON");
    expect(awaiting.runtime).toEqual(before);

    const withReason = apply(awaiting.runtime, awaiting.decision.id, [
      {
        type: "FailVerification",
        actor: ACTOR,
        simulatedAt: T2,
        reason: "Barricade was not in place",
      },
    ]);
    expect(withReason.decision.state).toBe("VerificationFailed");
    const event = latestAuditEvent(withReason.decision, "FailVerification")!;
    expect(event.reason).toBe("Barricade was not in place");
    expect(event.actor).toBe(ACTOR);
    expect(event.simulatedAt).toBe(T2);
  });

  it("VerificationFailed → PendingExecution retry is allowed", () => {
    const awaiting = awaitingVerificationFixture();
    const failed = apply(awaiting.runtime, awaiting.decision.id, [
      { type: "FailVerification", actor: ACTOR, simulatedAt: T2, reason: "Not complete" },
    ]);
    expect(isTerminalDecisionState(failed.decision.state)).toBe(false);

    const controls = workflowControlModel(failed.decision);
    expect(controls.showVerificationPanel).toBe(true);
    expect(controls.canRetryExecution).toBe(true);
    expect(controls.canVerify).toBe(false);

    const retried = apply(failed.runtime, failed.decision.id, [
      { type: "RetryExecution", actor: ACTOR, simulatedAt: T2 },
    ]);
    expect(retried.decision.state).toBe("PendingExecution");
    expect(retried.decision.selectedAction).toBe(awaiting.decision.selectedAction);
  });

  it("VerificationFailed cannot transition directly to Verified", () => {
    const awaiting = awaitingVerificationFixture();
    const failed = apply(awaiting.runtime, awaiting.decision.id, [
      { type: "FailVerification", actor: ACTOR, simulatedAt: T2, reason: "Not complete" },
    ]);

    const direct = transitionDecision(
      failed.decision,
      { type: "VerifyDecision", actor: ACTOR, simulatedAt: T2 },
      probeProposalFacts(failed.decision),
    );
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.error.code).toBe("INVALID_TRANSITION");
    expect(allowedCommandsForState(failed.decision)).not.toContain("VerifyDecision");
  });
});

describe("non-mutating and informational decisions", () => {
  it("acknowledged informational decision never exposes execution or verification actions", () => {
    const seeded = seededRuntime();
    const informational = seeded.decisions.find((d) => !d.approvalRequired)!;
    const acknowledged = apply(seeded, informational.id, [
      { type: "AcknowledgeDecision", actor: ACTOR, simulatedAt: T0 },
    ]);

    expect(acknowledged.decision.state).toBe("Acknowledged");
    expect(isTerminalDecisionState(acknowledged.decision.state)).toBe(true);
    const controls = workflowControlModel(acknowledged.decision);
    expect(controls.allowedCommands).toEqual([]);
    expect(controls.showExecutionPanel).toBe(false);
    expect(controls.showVerificationPanel).toBe(false);
    expect(controls.canMarkExecuted).toBe(false);
    expect(controls.canVerify).toBe(false);
  });

  it("non-mutating approved decision reaches AwaitingVerification without an execution record", () => {
    const seeded = seededRuntime();
    const target = seeded.decisions.find((d) => {
      if (!d.approvalRequired) return false;
      const facts = seeded.proposalFactsByRecommendationId[d.recommendationId];
      return (
        !facts.primaryAction.mutatesOperationalState ||
        facts.alternatives.some((a) => !a.mutatesOperationalState)
      );
    })!;
    const facts = seeded.proposalFactsByRecommendationId[target.recommendationId];
    const useAlternative = facts.primaryAction.mutatesOperationalState;
    const alternativeIndex = facts.alternatives.findIndex(
      (a) => !a.mutatesOperationalState,
    );

    const approvedResult = apply(seeded, target.id, [
      {
        type: "ApproveDecision",
        actor: ACTOR,
        simulatedAt: T0,
        selectedActionSource: useAlternative ? "alternative" : "primary",
        alternativeIndex: useAlternative ? alternativeIndex : undefined,
      },
      { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T0 },
    ]);

    expect(approvedResult.decision.state).toBe("AwaitingVerification");
    expect(
      approvedResult.decision.auditTrail.some(
        (e) => e.command === "MarkExecutionComplete",
      ),
    ).toBe(false);
    const controls = workflowControlModel(approvedResult.decision);
    expect(controls.showVerificationPanel).toBe(true);
    expect(controls.canVerify).toBe(true);

    const verifiedResult = apply(approvedResult.runtime, target.id, [
      { type: "VerifyDecision", actor: ACTOR, simulatedAt: T1 },
    ]);
    expect(verifiedResult.decision.state).toBe("Verified");
  });
});

describe("workflow selectors and status labels", () => {
  it("workflowCounts returns correct per-state counts", () => {
    const empty = workflowCounts(initialDecisionRuntime());
    expect(empty).toEqual({
      pendingReviewCount: 0,
      pendingExecutionCount: 0,
      blockedCount: 0,
      awaitingVerificationCount: 0,
      verificationFailedCount: 0,
      verifiedCount: 0,
    });

    const seeded = seededRuntime();
    const total = seeded.decisions.length;
    expect(workflowCounts(seeded).pendingReviewCount).toBe(total);

    const pending = pendingExecutionFixture();
    const afterPending = workflowCounts(pending.runtime);
    expect(afterPending.pendingExecutionCount).toBe(1);
    expect(afterPending.pendingReviewCount).toBe(total - 1);

    const awaiting = awaitingVerificationFixture();
    expect(workflowCounts(awaiting.runtime).awaitingVerificationCount).toBe(1);

    const verifiedRuntime = apply(awaiting.runtime, awaiting.decision.id, [
      { type: "VerifyDecision", actor: ACTOR, simulatedAt: T2 },
    ]).runtime;
    expect(workflowCounts(verifiedRuntime).verifiedCount).toBe(1);
    expect(workflowCounts(verifiedRuntime).awaitingVerificationCount).toBe(0);

    const blockedRuntime = apply(pending.runtime, pending.decision.id, [
      { type: "BlockExecution", actor: ACTOR, simulatedAt: T1, reason: "Access denied" },
    ]).runtime;
    expect(workflowCounts(blockedRuntime).blockedCount).toBe(1);

    const failedRuntime = apply(awaiting.runtime, awaiting.decision.id, [
      { type: "FailVerification", actor: ACTOR, simulatedAt: T2, reason: "Not done" },
    ]).runtime;
    expect(workflowCounts(failedRuntime).verificationFailedCount).toBe(1);
  });

  it("status labels describe workflow progression for every state", () => {
    expect(workflowStatusLabel("PendingReview")).toBe("Needs decision");
    expect(workflowStatusLabel("PendingExecution")).toBe(
      "Approved · Awaiting field execution",
    );
    expect(workflowStatusLabel("Blocked")).toBe("Execution blocked");
    expect(workflowStatusLabel("AwaitingVerification")).toBe(
      "Execution recorded · Verification required",
    );
    expect(workflowStatusLabel("Verified")).toBe("Verified");
    expect(workflowStatusLabel("VerificationFailed")).toBe(
      "Verification failed · Retry required",
    );
    expect(workflowStatusLabel("Cancelled")).toBe("Cancelled");
  });

  it("formatWorkflowError maps typed decision errors", () => {
    expect(formatWorkflowError("INVALID_TRANSITION", "no")).toMatch(
      /Invalid transition/,
    );
    expect(formatWorkflowError("MISSING_REASON", "no")).toMatch(/Reason required/);
    expect(formatWorkflowError("DECISION_ALREADY_TERMINAL", "no")).toMatch(
      /already completed/,
    );
    expect(formatWorkflowError("ACTION_NOT_FOUND", "no")).toMatch(/Action unavailable/);
  });
});

describe("combined operational timeline", () => {
  it("orders reasoning and decision events deterministically", () => {
    const reasoning = processAll();
    const awaiting = awaitingVerificationFixture();

    const first = joinOperationalTimeline(
      reasoning.timeline,
      awaiting.runtime.decisions,
    );
    const second = joinOperationalTimeline(
      reasoning.timeline,
      awaiting.runtime.decisions,
    );
    expect(first).toEqual(second);

    const timestamps = first.map((e) => e.simulatedAt);
    expect([...timestamps].sort()).toEqual(timestamps);

    expect(first.some((e) => e.source === "reasoning")).toBe(true);
    const decisionEntries = first.filter((e) => e.source === "decision");
    expect(decisionEntries.length).toBe(awaiting.decision.auditTrail.length);
    expect(decisionEntries.map((e) => e.label)).toEqual([
      "Approved",
      "Approval advanced",
      "Execution recorded",
      "Verification requested",
    ]);
  });

  it("does not mutate either source history", () => {
    const reasoning = processAll();
    const awaiting = awaitingVerificationFixture();
    const timelineBefore = structuredClone(reasoning.timeline);
    const decisionsBefore = structuredClone(awaiting.runtime.decisions);

    joinOperationalTimeline(reasoning.timeline, awaiting.runtime.decisions);

    expect(reasoning.timeline).toEqual(timelineBefore);
    expect(awaiting.runtime.decisions).toEqual(decisionsBefore);
    expect(
      (reasoning.timeline as unknown as Array<Record<string, unknown>>).some(
        (e) => "command" in e,
      ),
    ).toBe(false);
  });
});

describe("determinism, reset, and snapshot immutability", () => {
  beforeEach(() => {
    useReasoningStore.setState({
      isInitialized: true,
      runtime: initialRuntime(),
      canProcessNext: true,
    });
    useDecisionStore.getState().resetDecisions();
  });

  it("reset clears decision runtime workflow history", () => {
    const awaiting = awaitingVerificationFixture();
    useDecisionStore.setState({ runtime: awaiting.runtime });
    expect(useDecisionStore.getState().runtime.decisions.length).toBeGreaterThan(0);

    useDecisionStore.getState().resetDecisions();
    expect(useDecisionStore.getState().runtime).toEqual(initialDecisionRuntime());
    expect(useDecisionStore.getState().runtime.decisions).toHaveLength(0);
  });

  it("reset leaves the Phase 3A deterministic baseline correct", () => {
    useReasoningStore.getState().processNextObservation();
    useDecisionStore
      .getState()
      .syncFromReasoning(useReasoningStore.getState().runtime);
    const firstPass = structuredClone(useReasoningStore.getState().runtime);

    useReasoningStore.getState().resetReasoning();
    useDecisionStore.getState().resetDecisions();
    expect(useReasoningStore.getState().runtime.reasonings).toHaveLength(0);
    expect(useReasoningStore.getState().runtime.timeline).toHaveLength(0);

    useReasoningStore.getState().processNextObservation();
    expect(useReasoningStore.getState().runtime).toEqual(firstPass);
  });

  it("ProjectSnapshot is unchanged through approve → execute → verify", () => {
    const snapshot = freshSnapshot();
    const before = structuredClone(snapshot);

    let reasoning = initialRuntime();
    for (let i = 0; i < snapshot.scenarioFixtures.length; i++) {
      reasoning = processNextObservation(snapshot, reasoning);
    }

    let runtime = intakeDecisions(reasoning, initialDecisionRuntime());
    const target = runtime.decisions.find(
      (d) => d.approvalRequired && d.mutatesOperationalState,
    )!;
    runtime = apply(runtime, target.id, [
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
    ]).runtime;

    expect(runtime.decisions.find((d) => d.id === target.id)!.state).toBe("Verified");
    expect(snapshot).toEqual(before);
  });

  it("identical workflow command sequences produce deeply equal DecisionRuntime", () => {
    const run = () => {
      let runtime = seededRuntime();
      const target = runtime.decisions.find(
        (d) => d.approvalRequired && d.mutatesOperationalState,
      )!;
      runtime = apply(runtime, target.id, [
        {
          type: "ApproveDecision",
          actor: ACTOR,
          simulatedAt: T0,
          selectedActionSource: "primary",
        },
        { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T0 },
        { type: "BlockExecution", actor: ACTOR, simulatedAt: T1, reason: "Rain" },
        { type: "RetryExecution", actor: ACTOR, simulatedAt: T1 },
        { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T2 },
        { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: T2 },
        { type: "FailVerification", actor: ACTOR, simulatedAt: T2, reason: "Partial" },
        { type: "RetryExecution", actor: ACTOR, simulatedAt: T2 },
      ]).runtime;
      return runtime;
    };

    expect(run()).toEqual(run());
  });
});
