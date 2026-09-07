import { describe, expect, it } from "vitest";

import type { RecommendationRuleId } from "@/domain/constants/recommendationRules";
import {
  buildProposalFacts,
  inferMutatesOperationalState,
} from "@/domain/decisions/proposalFacts";
import {
  createOperationalDecision,
  transitionDecision,
} from "@/domain/decisions/transition";
import type {
  DecisionCommand,
  OperationalDecision,
  ProposalFacts,
} from "@/domain/decisions/types";
import {
  EFFECT_POLICY_BY_RULE,
  resolveOperationalEffect,
} from "@/domain/effects";
import type { RecommendationActionDescriptor } from "@/domain/types/recommendation";
import { freshSnapshot, runFixture } from "@/tests/engines/helpers";

const ACTOR = "superintendent" as const;
const T_CREATE = "2026-03-14T12:00:00.000Z";
const T_APPROVE = "2026-03-14T12:15:00.000Z";
const T_EXECUTE = "2026-03-14T12:30:00.000Z";
const T_VERIFY = "2026-03-14T12:45:00.000Z";

const POUR = "task-pour-level-1-slab";
const DRYWALL_PREP = "task-interior-drywall-prep";

const ALL_RULE_IDS: RecommendationRuleId[] = [
  "REC_CREW_REASSIGN",
  "REC_INSPECTION_COORDINATE",
  "REC_MATERIAL_ESCALATE",
  "REC_MATERIAL_PROTECT",
  "REC_MONITOR_PROTECT",
  "REC_SAFETY_PROTECT",
  "REC_TASK_RESEQUENCE",
];

/**
 * Synthetic crew-reassignment identity. The seeded scenario cannot trigger
 * REC_CREW_REASSIGN, and the seed must not be changed to make it appear, so the
 * effect-supported path is proven with deterministic synthetic descriptors.
 */
const CREW_DESCRIPTOR: RecommendationActionDescriptor = {
  ruleId: "REC_CREW_REASSIGN",
  mutatesOperationalState: true,
  subjectEntityType: "crew",
  subjectEntityId: "crew-synthetic-a",
  originTaskId: "task-synthetic-origin",
  targetTaskId: "task-synthetic-target",
};

/** Prose that the Phase 3B fallback would classify as a mutating reassignment. */
const CREW_PROSE =
  "Propose reassigning crew-synthetic-a from blocked task-synthetic-origin to task-synthetic-target.";

function factsWith(
  descriptor: RecommendationActionDescriptor | undefined,
  options: { action?: string; approvalRequired?: boolean } = {},
): ProposalFacts {
  const action = options.action ?? CREW_PROSE;
  const mutates = descriptor
    ? descriptor.mutatesOperationalState
    : inferMutatesOperationalState(action);
  return {
    approvalRequired: options.approvalRequired ?? true,
    primaryAction: descriptor
      ? { action, mutatesOperationalState: mutates, descriptor }
      : { action, mutatesOperationalState: mutates },
    alternatives: [],
  };
}

function openDecision(facts: ProposalFacts): OperationalDecision {
  return createOperationalDecision({
    id: "decision-rec-synthetic",
    recommendationId: "rec-synthetic",
    signalId: "signal-synthetic",
    issueId: "issue-synthetic",
    approvalRequired: facts.approvalRequired,
    mutatesOperationalState: facts.primaryAction.mutatesOperationalState,
    createdAtSimulated: T_CREATE,
  });
}

function step(
  decision: OperationalDecision,
  command: DecisionCommand,
  facts: ProposalFacts,
): OperationalDecision {
  const result = transitionDecision(decision, command, facts);
  if (!result.ok) {
    throw new Error(
      `${command.type} failed: ${result.error.code} — ${result.error.message}`,
    );
  }
  return result.decision;
}

function approve(
  decision: OperationalDecision,
  facts: ProposalFacts,
): OperationalDecision {
  return step(
    decision,
    {
      type: "ApproveDecision",
      actor: ACTOR,
      simulatedAt: T_APPROVE,
      selectedActionSource: "primary",
    },
    facts,
  );
}

function proceed(
  decision: OperationalDecision,
  facts: ProposalFacts,
): OperationalDecision {
  return step(
    decision,
    { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T_APPROVE },
    facts,
  );
}

function markExecuted(
  decision: OperationalDecision,
  facts: ProposalFacts,
): OperationalDecision {
  return step(
    decision,
    { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T_EXECUTE },
    facts,
  );
}

function advance(
  decision: OperationalDecision,
  facts: ProposalFacts,
): OperationalDecision {
  return step(
    decision,
    { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: T_EXECUTE },
    facts,
  );
}

function verify(
  decision: OperationalDecision,
  facts: ProposalFacts,
): OperationalDecision {
  return step(
    decision,
    { type: "VerifyDecision", actor: ACTOR, simulatedAt: T_VERIFY },
    facts,
  );
}

/** Full mutating-action path: PendingReview → … → Verified, via the real FSM. */
function verifiedFrom(facts: ProposalFacts): OperationalDecision {
  const approved = approve(openDecision(facts), facts);
  const pendingExecution = proceed(approved, facts);
  const executed = markExecuted(pendingExecution, facts);
  return verify(advance(executed, facts), facts);
}

function crewFacts(action?: string): ProposalFacts {
  return factsWith(CREW_DESCRIPTOR, action === undefined ? {} : { action });
}

/** Real seeded resequencing proposal (REC_TASK_RESEQUENCE, approval required). */
function seededResequenceFacts(): ProposalFacts {
  const { recommendation } = runFixture(freshSnapshot(), "fixture-weather-alert");
  if (!recommendation) throw new Error("no weather recommendation");
  return buildProposalFacts(recommendation);
}

/** Real seeded inspection proposal (REC_INSPECTION_COORDINATE, advisory). */
function seededInspectionFacts(): ProposalFacts {
  const { recommendation } = runFixture(
    freshSnapshot(),
    "fixture-inspection-missing",
  );
  if (!recommendation) throw new Error("no inspection recommendation");
  return buildProposalFacts(recommendation);
}

describe("effect policy mapping", () => {
  it("covers every RecommendationRuleId explicitly", () => {
    expect(Object.keys(EFFECT_POLICY_BY_RULE).sort()).toEqual([...ALL_RULE_IDS].sort());
    for (const ruleId of ALL_RULE_IDS) {
      const policy = EFFECT_POLICY_BY_RULE[ruleId];
      expect(["workflow_only", "operational_overlay"]).toContain(policy.kind);
    }
  });

  it("authorizes exactly one overlay-effect rule", () => {
    const overlayRules = ALL_RULE_IDS.filter(
      (ruleId) => EFFECT_POLICY_BY_RULE[ruleId].kind === "operational_overlay",
    );
    expect(overlayRules).toEqual(["REC_CREW_REASSIGN"]);
    expect(EFFECT_POLICY_BY_RULE.REC_CREW_REASSIGN).toEqual({
      kind: "operational_overlay",
      effectType: "CrewAssignmentChanged",
    });
  });

  it("classifies every other rule as workflow-only", () => {
    for (const ruleId of ALL_RULE_IDS) {
      if (ruleId === "REC_CREW_REASSIGN") continue;
      expect(EFFECT_POLICY_BY_RULE[ruleId]).toEqual({ kind: "workflow_only" });
    }
  });
});

describe("verified-state gate", () => {
  it("rejects PendingReview", () => {
    const facts = crewFacts();
    const result = resolveOperationalEffect(openDecision(facts));
    expect(result.outcome).toBe("Rejected");
    if (result.outcome !== "Rejected") return;
    expect(result.code).toBe("DECISION_NOT_VERIFIED");
  });

  it("rejects Approved", () => {
    const facts = crewFacts();
    const approved = approve(openDecision(facts), facts);
    expect(approved.state).toBe("Approved");
    expect(resolveOperationalEffect(approved)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects PendingExecution", () => {
    const facts = crewFacts();
    const pending = proceed(approve(openDecision(facts), facts), facts);
    expect(pending.state).toBe("PendingExecution");
    expect(resolveOperationalEffect(pending)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects Executed", () => {
    const facts = crewFacts();
    const executed = markExecuted(
      proceed(approve(openDecision(facts), facts), facts),
      facts,
    );
    expect(executed.state).toBe("Executed");
    expect(resolveOperationalEffect(executed)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects Blocked", () => {
    const facts = crewFacts();
    const blocked = step(
      proceed(approve(openDecision(facts), facts), facts),
      {
        type: "BlockExecution",
        actor: ACTOR,
        simulatedAt: T_EXECUTE,
        reason: "crew unavailable on site",
      },
      facts,
    );
    expect(blocked.state).toBe("Blocked");
    expect(resolveOperationalEffect(blocked)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects AwaitingVerification", () => {
    const facts = crewFacts();
    const awaiting = advance(
      markExecuted(proceed(approve(openDecision(facts), facts), facts), facts),
      facts,
    );
    expect(awaiting.state).toBe("AwaitingVerification");
    expect(resolveOperationalEffect(awaiting)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects VerificationFailed", () => {
    const facts = crewFacts();
    const failed = step(
      advance(
        markExecuted(proceed(approve(openDecision(facts), facts), facts), facts),
        facts,
      ),
      {
        type: "FailVerification",
        actor: ACTOR,
        simulatedAt: T_VERIFY,
        reason: "crew never moved",
      },
      facts,
    );
    expect(failed.state).toBe("VerificationFailed");
    expect(resolveOperationalEffect(failed)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects Rejected", () => {
    const facts = crewFacts();
    const rejected = step(
      openDecision(facts),
      {
        type: "RejectDecision",
        actor: ACTOR,
        simulatedAt: T_APPROVE,
        reason: "not operationally sound",
      },
      facts,
    );
    expect(rejected.state).toBe("Rejected");
    expect(resolveOperationalEffect(rejected)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects Cancelled", () => {
    const facts = crewFacts();
    const cancelled = step(
      proceed(approve(openDecision(facts), facts), facts),
      { type: "CancelDecision", actor: ACTOR, simulatedAt: T_EXECUTE },
      facts,
    );
    expect(cancelled.state).toBe("Cancelled");
    expect(resolveOperationalEffect(cancelled)).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("produces no operational effect for an Acknowledged advisory decision", () => {
    const facts = seededInspectionFacts();
    expect(facts.approvalRequired).toBe(false);
    const acknowledged = step(
      openDecision(facts),
      { type: "AcknowledgeDecision", actor: ACTOR, simulatedAt: T_APPROVE },
      facts,
    );
    expect(acknowledged.state).toBe("Acknowledged");

    const result = resolveOperationalEffect(acknowledged);
    expect(result.outcome).not.toBe("Resolved");
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("rejects a Verified decision with no VerifyDecision audit event", () => {
    const facts = crewFacts();
    const verified = verifiedFrom(facts);
    const withoutAudit: OperationalDecision = { ...verified, auditTrail: [] };
    expect(resolveOperationalEffect(withoutAudit)).toMatchObject({
      outcome: "Rejected",
      code: "MISSING_VERIFICATION_EVENT",
    });
  });
});

describe("crew reassignment effect", () => {
  it("resolves deterministically from structured identity", () => {
    const facts = crewFacts();
    const verified = verifiedFrom(facts);
    expect(verified.state).toBe("Verified");

    const result = resolveOperationalEffect(verified);
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;

    expect(result.effect).toEqual({
      id: "effect-decision-rec-synthetic-CrewAssignmentChanged",
      decisionId: "decision-rec-synthetic",
      recommendationId: "rec-synthetic",
      signalId: "signal-synthetic",
      issueId: "issue-synthetic",
      ruleId: "REC_CREW_REASSIGN",
      effectType: "CrewAssignmentChanged",
      simulatedAt: T_VERIFY,
      crewId: "crew-synthetic-a",
      originTaskId: "task-synthetic-origin",
      targetTaskId: "task-synthetic-target",
    });
  });

  it("takes crew, origin, and target from the descriptor", () => {
    const descriptor: RecommendationActionDescriptor = {
      ...CREW_DESCRIPTOR,
      subjectEntityId: "crew-other-b",
      originTaskId: "task-other-origin",
      targetTaskId: "task-other-target",
    };
    const facts = factsWith(descriptor);
    const result = resolveOperationalEffect(verifiedFrom(facts));
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    expect(result.effect.crewId).toBe("crew-other-b");
    expect(result.effect.originTaskId).toBe("task-other-origin");
    expect(result.effect.targetTaskId).toBe("task-other-target");
  });

  it("ignores action prose entirely", () => {
    const misleading = "Monitor the condition and change nothing.";
    expect(inferMutatesOperationalState(misleading)).toBe(false);

    const facts = crewFacts(misleading);
    const verified = verifiedFrom(facts);
    expect(verified.selectedAction).toBe(misleading);

    const result = resolveOperationalEffect(verified);
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    expect(result.effect.effectType).toBe("CrewAssignmentChanged");
    expect(result.effect.crewId).toBe("crew-synthetic-a");
  });

  it("resolves even when the action prose is empty", () => {
    const facts = factsWith(CREW_DESCRIPTOR, { action: "" });
    const result = resolveOperationalEffect(verifiedFrom(facts));
    expect(result.outcome).toBe("Resolved");
  });

  it("rejects safely when the target task is missing", () => {
    const withoutTarget: RecommendationActionDescriptor = {
      ruleId: "REC_CREW_REASSIGN",
      mutatesOperationalState: true,
      subjectEntityType: "crew",
      subjectEntityId: "crew-synthetic-a",
      originTaskId: "task-synthetic-origin",
    };
    const facts = factsWith(withoutTarget);
    expect(resolveOperationalEffect(verifiedFrom(facts))).toMatchObject({
      outcome: "Rejected",
      code: "MISSING_TARGET_TASK",
    });
  });

  it("rejects safely when the descriptor subject is not a crew", () => {
    const wrongSubject: RecommendationActionDescriptor = {
      ...CREW_DESCRIPTOR,
      subjectEntityType: "task",
      subjectEntityId: "task-synthetic-origin",
    };
    const facts = factsWith(wrongSubject);
    expect(resolveOperationalEffect(verifiedFrom(facts))).toMatchObject({
      outcome: "Rejected",
      code: "DESCRIPTOR_SUBJECT_MISMATCH",
    });
  });
});

describe("workflow-only rules", () => {
  it("returns NoOperationalEffect with structured ids for verified resequencing", () => {
    const facts = seededResequenceFacts();
    expect(facts.primaryAction.descriptor?.ruleId).toBe("REC_TASK_RESEQUENCE");

    const result = resolveOperationalEffect(verifiedFrom(facts));
    expect(result.outcome).toBe("NoOperationalEffect");
    if (result.outcome !== "NoOperationalEffect") return;

    expect(result).toEqual({
      outcome: "NoOperationalEffect",
      reason: "workflow_only_rule",
      decisionId: "decision-rec-synthetic",
      ruleId: "REC_TASK_RESEQUENCE",
      originTaskId: POUR,
      targetTaskId: DRYWALL_PREP,
      simulatedAt: T_VERIFY,
    });
  });

  it("returns NoOperationalEffect for a verified monitoring action", () => {
    const monitor: RecommendationActionDescriptor = {
      ruleId: "REC_MONITOR_PROTECT",
      mutatesOperationalState: false,
      subjectEntityType: "task",
      subjectEntityId: POUR,
      originTaskId: POUR,
    };
    // Mutating crew prose paired with a workflow-only descriptor: prose is inert.
    const facts = factsWith(monitor, { action: CREW_PROSE });
    expect(inferMutatesOperationalState(CREW_PROSE)).toBe(true);

    const approved = approve(openDecision(facts), facts);
    const verified = verify(proceed(approved, facts), facts);
    expect(verified.state).toBe("Verified");

    const result = resolveOperationalEffect(verified);
    expect(result.outcome).toBe("NoOperationalEffect");
    if (result.outcome !== "NoOperationalEffect") return;
    expect(result.ruleId).toBe("REC_MONITOR_PROTECT");
    expect(result.targetTaskId).toBeNull();
  });
});

describe("legacy descriptor-less decisions", () => {
  it("rejects without consulting the prose fallback", () => {
    const facts = factsWith(undefined, { action: CREW_PROSE });
    expect(facts.primaryAction.descriptor).toBeUndefined();
    expect(facts.primaryAction.mutatesOperationalState).toBe(true);

    const verified = verifiedFrom(facts);
    expect(verified.state).toBe("Verified");
    expect(verified.selectedActionDescriptor).toBeNull();
    expect(verified.selectedAction).toBe(CREW_PROSE);

    const result = resolveOperationalEffect(verified);
    expect(result.outcome).toBe("Rejected");
    if (result.outcome !== "Rejected") return;
    expect(result.code).toBe("MISSING_ACTION_DESCRIPTOR");
  });
});

describe("purity and determinism", () => {
  it("does not mutate the decision or the descriptor", () => {
    const facts = crewFacts();
    const verified = verifiedFrom(facts);
    const decisionBefore = JSON.stringify(verified);
    const descriptorBefore = JSON.stringify(verified.selectedActionDescriptor);
    const factsBefore = JSON.stringify(facts);

    resolveOperationalEffect(verified);

    expect(JSON.stringify(verified)).toBe(decisionBefore);
    expect(JSON.stringify(verified.selectedActionDescriptor)).toBe(
      descriptorBefore,
    );
    expect(JSON.stringify(facts)).toBe(factsBefore);
  });

  it("produces deep-equal output for the same input", () => {
    const facts = crewFacts();
    const verified = verifiedFrom(facts);
    expect(resolveOperationalEffect(verified)).toEqual(
      resolveOperationalEffect(verified),
    );

    const rebuilt = verifiedFrom(crewFacts());
    expect(resolveOperationalEffect(rebuilt)).toEqual(
      resolveOperationalEffect(verified),
    );
  });

  it("derives the effect id and timestamp from existing identity only", () => {
    const facts = crewFacts();
    const verified = verifiedFrom(facts);
    const verifyEvent = verified.auditTrail.find(
      (event) => event.command === "VerifyDecision",
    );
    expect(verifyEvent).toBeDefined();

    const result = resolveOperationalEffect(verified);
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;

    expect(result.effect.id).toBe(
      `effect-${verified.id}-${result.effect.effectType}`,
    );
    expect(result.effect.simulatedAt).toBe(verifyEvent!.simulatedAt);
    expect(result.effect.simulatedAt).toBe(T_VERIFY);
  });
});
