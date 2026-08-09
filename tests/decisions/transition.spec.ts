import { describe, expect, it } from "vitest";

import {
  createOperationalDecision,
  transitionDecision,
  type DecisionCommand,
  type OperationalDecision,
  type ProposalFacts,
} from "@/domain/decisions";

const T0 = "2026-07-01T08:00:00.000Z";
const T1 = "2026-07-01T09:00:00.000Z";
const T2 = "2026-07-01T10:00:00.000Z";
const T3 = "2026-07-01T11:00:00.000Z";
const T4 = "2026-07-01T12:00:00.000Z";

function mutatingFacts(approvalRequired: boolean): ProposalFacts {
  return {
    approvalRequired,
    primaryAction: {
      action: "Protect critical path and escalate material shortage",
      mutatesOperationalState: true,
    },
    alternatives: [
      {
        action: "Propose reassigning crew-02 from blocked task-04 to task-07",
        mutatesOperationalState: true,
      },
      {
        action: "Monitor the condition and protect the current plan",
        mutatesOperationalState: false,
      },
    ],
  };
}

function nonMutatingFacts(approvalRequired: boolean): ProposalFacts {
  return {
    approvalRequired,
    primaryAction: {
      action: "Monitor the condition and protect the current plan",
      mutatesOperationalState: false,
    },
    alternatives: [],
  };
}

function openDecision(approvalRequired: boolean, mutates = true): OperationalDecision {
  return createOperationalDecision({
    id: "decision-1",
    recommendationId: "rec-1",
    signalId: "signal-1",
    issueId: "issue-1",
    approvalRequired,
    mutatesOperationalState: mutates,
    createdAtSimulated: T0,
  });
}

function mustSucceed(
  decision: OperationalDecision,
  command: DecisionCommand,
  facts: ProposalFacts,
): OperationalDecision {
  const result = transitionDecision(decision, command, facts);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.decision;
}

function approvePrimary(
  decision: OperationalDecision,
  facts: ProposalFacts,
  at = T1,
): OperationalDecision {
  return mustSucceed(
    decision,
    {
      type: "ApproveDecision",
      actor: "superintendent",
      simulatedAt: at,
      selectedActionSource: "primary",
    },
    facts,
  );
}

describe("decision FSM — PendingReview gates", () => {
  it("PendingReview → Acknowledged succeeds when approval is not required", () => {
    const decision = openDecision(false, false);
    const facts = nonMutatingFacts(false);
    const next = mustSucceed(
      decision,
      {
        type: "AcknowledgeDecision",
        actor: "superintendent",
        simulatedAt: T1,
      },
      facts,
    );
    expect(next.state).toBe("Acknowledged");
    expect(next.selectedAction).toBe(facts.primaryAction.action);
    expect(next.selectedActionSource).toBe("primary");
  });

  it("PendingReview → Acknowledged fails when approval is required", () => {
    const decision = openDecision(true, true);
    const result = transitionDecision(
      decision,
      {
        type: "AcknowledgeDecision",
        actor: "superintendent",
        simulatedAt: T1,
      },
      mutatingFacts(true),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("APPROVAL_REQUIRED");
  });

  it("PendingReview → Approved succeeds when approval is required", () => {
    const facts = mutatingFacts(true);
    const next = approvePrimary(openDecision(true), facts);
    expect(next.state).toBe("Approved");
    expect(next.selectedAction).toBe(facts.primaryAction.action);
    expect(next.selectedActionSource).toBe("primary");
  });

  it("PendingReview → Approved fails when approval is not required", () => {
    const result = transitionDecision(
      openDecision(false, false),
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: T1,
        selectedActionSource: "primary",
      },
      nonMutatingFacts(false),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("APPROVAL_NOT_REQUIRED");
  });

  it("PendingReview → Rejected succeeds when approval is required", () => {
    const next = mustSucceed(
      openDecision(true),
      {
        type: "RejectDecision",
        actor: "superintendent",
        simulatedAt: T1,
        reason: "Not operationally justified",
      },
      mutatingFacts(true),
    );
    expect(next.state).toBe("Rejected");
  });
});

describe("decision FSM — post-approval and execution", () => {
  it("Approved mutating action → PendingExecution", () => {
    const facts = mutatingFacts(true);
    const approved = approvePrimary(openDecision(true, true), facts);
    const next = mustSucceed(
      approved,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    expect(next.state).toBe("PendingExecution");
  });

  it("Approved non-mutating action → AwaitingVerification", () => {
    const facts = nonMutatingFacts(true);
    const approved = approvePrimary(openDecision(true, false), facts);
    const next = mustSucceed(
      approved,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    expect(next.state).toBe("AwaitingVerification");
  });

  it("PendingExecution → Executed", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "MarkExecutionComplete", actor: "superintendent", simulatedAt: T3 },
      facts,
    );
    expect(d.state).toBe("Executed");
  });

  it("Executed → AwaitingVerification", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "MarkExecutionComplete", actor: "superintendent", simulatedAt: T3 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "AdvanceToVerification", actor: "superintendent", simulatedAt: T4 },
      facts,
    );
    expect(d.state).toBe("AwaitingVerification");
  });

  it("PendingExecution → Blocked", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "BlockExecution",
        actor: "superintendent",
        simulatedAt: T3,
        reason: "Crew unavailable on site",
      },
      facts,
    );
    expect(d.state).toBe("Blocked");
  });

  it("Blocked → PendingExecution", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "BlockExecution",
        actor: "superintendent",
        simulatedAt: T3,
        reason: "Crew unavailable on site",
      },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "RetryExecution", actor: "superintendent", simulatedAt: T4 },
      facts,
    );
    expect(d.state).toBe("PendingExecution");
  });

  it("PendingExecution → Cancelled", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "CancelDecision",
        actor: "superintendent",
        simulatedAt: T3,
        reason: "Superseded",
      },
      facts,
    );
    expect(d.state).toBe("Cancelled");
  });

  it("Blocked → Cancelled", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "BlockExecution",
        actor: "superintendent",
        simulatedAt: T3,
        reason: "Blocked",
      },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "CancelDecision", actor: "superintendent", simulatedAt: T4 },
      facts,
    );
    expect(d.state).toBe("Cancelled");
  });
});

describe("decision FSM — verification and retry", () => {
  it("AwaitingVerification → Verified", () => {
    const facts = nonMutatingFacts(true);
    let d = approvePrimary(openDecision(true, false), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "VerifyDecision", actor: "superintendent", simulatedAt: T3 },
      facts,
    );
    expect(d.state).toBe("Verified");
  });

  it("AwaitingVerification → VerificationFailed", () => {
    const facts = nonMutatingFacts(true);
    let d = approvePrimary(openDecision(true, false), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "FailVerification",
        actor: "superintendent",
        simulatedAt: T3,
        reason: "Field condition unchanged",
      },
      facts,
    );
    expect(d.state).toBe("VerificationFailed");
  });

  it("VerificationFailed → PendingExecution", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "MarkExecutionComplete", actor: "superintendent", simulatedAt: T3 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "AdvanceToVerification", actor: "superintendent", simulatedAt: T4 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "FailVerification",
        actor: "superintendent",
        simulatedAt: "2026-07-01T13:00:00.000Z",
        reason: "Incomplete",
      },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "RetryExecution",
        actor: "superintendent",
        simulatedAt: "2026-07-01T14:00:00.000Z",
      },
      facts,
    );
    expect(d.state).toBe("PendingExecution");
  });

  it("VerificationFailed cannot jump directly to Verified", () => {
    const facts = nonMutatingFacts(true);
    let d = approvePrimary(openDecision(true, false), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      {
        type: "FailVerification",
        actor: "superintendent",
        simulatedAt: T3,
        reason: "Failed",
      },
      facts,
    );
    const result = transitionDecision(
      d,
      { type: "VerifyDecision", actor: "superintendent", simulatedAt: T4 },
      facts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("decision FSM — terminals and guards", () => {
  it("Rejected cannot execute", () => {
    const facts = mutatingFacts(true);
    const rejected = mustSucceed(
      openDecision(true),
      {
        type: "RejectDecision",
        actor: "superintendent",
        simulatedAt: T1,
        reason: "No",
      },
      facts,
    );
    const result = transitionDecision(
      rejected,
      { type: "MarkExecutionComplete", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECISION_ALREADY_TERMINAL");
  });

  it("Cancelled cannot verify", () => {
    const facts = mutatingFacts(true);
    let d = approvePrimary(openDecision(true), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "CancelDecision", actor: "superintendent", simulatedAt: T3 },
      facts,
    );
    const result = transitionDecision(
      d,
      { type: "VerifyDecision", actor: "superintendent", simulatedAt: T4 },
      facts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECISION_ALREADY_TERMINAL");
  });

  it("Verified cannot transition again", () => {
    const facts = nonMutatingFacts(true);
    let d = approvePrimary(openDecision(true, false), facts);
    d = mustSucceed(
      d,
      { type: "ProceedAfterApproval", actor: "superintendent", simulatedAt: T2 },
      facts,
    );
    d = mustSucceed(
      d,
      { type: "VerifyDecision", actor: "superintendent", simulatedAt: T3 },
      facts,
    );
    const result = transitionDecision(
      d,
      {
        type: "FailVerification",
        actor: "superintendent",
        simulatedAt: T4,
        reason: "late",
      },
      facts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECISION_ALREADY_TERMINAL");
  });

  it("Acknowledged cannot transition again", () => {
    const facts = nonMutatingFacts(false);
    const ack = mustSucceed(
      openDecision(false, false),
      {
        type: "AcknowledgeDecision",
        actor: "superintendent",
        simulatedAt: T1,
      },
      facts,
    );
    const result = transitionDecision(
      ack,
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: T2,
        selectedActionSource: "primary",
      },
      facts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECISION_ALREADY_TERMINAL");
  });
});

describe("decision FSM — action selection and purity", () => {
  it("alternative selection must reference a real recommendation alternative", () => {
    const facts = mutatingFacts(true);
    const next = mustSucceed(
      openDecision(true),
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: T1,
        selectedActionSource: "alternative",
        alternativeIndex: 0,
      },
      facts,
    );
    expect(next.selectedActionSource).toBe("alternative");
    expect(next.selectedAction).toBe(facts.alternatives[0].action);
    expect(next.mutatesOperationalState).toBe(true);
  });

  it("unknown alternative must fail", () => {
    const facts = mutatingFacts(true);
    const result = transitionDecision(
      openDecision(true),
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: T1,
        selectedActionSource: "alternative",
        alternativeIndex: 99,
      },
      facts,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ACTION_NOT_FOUND");
  });

  it("the original decision object must remain unchanged", () => {
    const decision = openDecision(true);
    const before = structuredClone(decision);
    mustSucceed(
      decision,
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: T1,
        selectedActionSource: "primary",
      },
      mutatingFacts(true),
    );
    expect(decision).toEqual(before);
  });

  it("every successful transition appends exactly one audit event with correct from/to", () => {
    const facts = mutatingFacts(true);
    const decision = openDecision(true);
    const next = mustSucceed(
      decision,
      {
        type: "ApproveDecision",
        actor: "superintendent",
        simulatedAt: T1,
        selectedActionSource: "primary",
      },
      facts,
    );
    expect(next.auditTrail).toHaveLength(1);
    expect(decision.auditTrail).toHaveLength(0);
    expect(next.auditTrail[0]).toMatchObject({
      decisionId: decision.id,
      command: "ApproveDecision",
      fromState: "PendingReview",
      toState: "Approved",
      actor: "superintendent",
      simulatedAt: T1,
    });
  });

  it("identical inputs produce deeply equal outputs", () => {
    const decision = openDecision(true);
    const command: DecisionCommand = {
      type: "ApproveDecision",
      actor: "superintendent",
      simulatedAt: T1,
      selectedActionSource: "primary",
    };
    const facts = mutatingFacts(true);
    const a = transitionDecision(decision, command, facts);
    const b = transitionDecision(decision, command, facts);
    expect(a).toEqual(b);
  });
});
