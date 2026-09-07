import { describe, expect, it } from "vitest";

import {
  buildProposalFacts,
  inferMutatesOperationalState,
} from "@/domain/decisions/proposalFacts";
import {
  createOperationalDecision,
  transitionDecision,
} from "@/domain/decisions/transition";
import type {
  OperationalDecision,
  ProposalFacts,
} from "@/domain/decisions/types";
import type { RecommendationRuleId } from "@/domain/constants/recommendationRules";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import type { ConfidenceAssessment } from "@/domain/types/reasoning";
import type {
  RecommendationActionDescriptor,
  RecommendationProposal,
  RecommendationSubjectEntityType,
} from "@/domain/types/recommendation";
import { freshSnapshot, runFixture } from "@/tests/engines/helpers";

const T0 = "2026-03-14T12:00:00.000Z";
const ACTOR = "superintendent" as const;

const POUR = "task-pour-level-1-slab";
const DRYWALL_PREP = "task-interior-drywall-prep";

/** Phase 3B workflow-routing classification per rule — must not change. */
const PHASE_3B_MUTATES_BY_RULE: Record<RecommendationRuleId, boolean> = {
  REC_SAFETY_PROTECT: true,
  REC_CREW_REASSIGN: true,
  REC_TASK_RESEQUENCE: true,
  REC_INSPECTION_COORDINATE: false,
  REC_MATERIAL_PROTECT: false,
  REC_MATERIAL_ESCALATE: false,
  REC_MONITOR_PROTECT: false,
};

/** Representative frozen prose per rule, used only to exercise the legacy path. */
const LEGACY_PROSE_BY_RULE: Record<RecommendationRuleId, string> = {
  REC_SAFETY_PROTECT: `Protect affected work on ${POUR} and route the safety condition for human review.`,
  REC_CREW_REASSIGN: `Propose reassigning crew-concrete-a from blocked ${POUR} to ${DRYWALL_PREP}.`,
  REC_TASK_RESEQUENCE: `Resequence work: hold exposed task ${POUR} and advance ready alternate task ${DRYWALL_PREP}.`,
  REC_INSPECTION_COORDINATE: `Coordinate completion of required inspection insp-slab-pre-pour before releasing gated task ${POUR}.`,
  REC_MATERIAL_PROTECT: `Protect the plan for ${POUR} until material mat-concrete delivery status is confirmed received.`,
  REC_MATERIAL_ESCALATE: `Escalate the material blocker for mat-concrete affecting task ${POUR}.`,
  REC_MONITOR_PROTECT: `Monitor the condition on ${POUR}, protect the current plan, and reassess when missing operational facts change.`,
};

const RULE_IDS = Object.keys(PHASE_3B_MUTATES_BY_RULE) as RecommendationRuleId[];

const SUBJECT_TYPES: RecommendationSubjectEntityType[] = [
  "task",
  "crew",
  "material",
  "inspection",
];

const PROPOSAL_KEYS_PHASE_3B = [
  "alternatives",
  "approval",
  "confidence",
  "evidence",
  "expectedBenefit",
  "id",
  "issueId",
  "primaryAction",
  "rationale",
  "signalId",
];

const ALTERNATIVE_KEYS_PHASE_3B = [
  "action",
  "evidence",
  "expectedBenefit",
  "rationale",
];

function proposalFor(fixtureId: string): RecommendationProposal {
  const { recommendation } = runFixture(freshSnapshot(), fixtureId);
  if (!recommendation) throw new Error(`no recommendation for ${fixtureId}`);
  return recommendation;
}

function primaryDescriptor(
  proposal: RecommendationProposal,
): RecommendationActionDescriptor {
  const descriptor = proposal.actionDescriptor;
  if (!descriptor) throw new Error(`missing primary descriptor on ${proposal.id}`);
  return descriptor;
}

function alternativeRuleIds(proposal: RecommendationProposal): string[] {
  return proposal.alternatives.map((alt) => {
    if (!alt.actionDescriptor) throw new Error("missing alternative descriptor");
    return alt.actionDescriptor.ruleId;
  });
}

/** Structured selection: locate an alternative by rule identity, never by prose. */
function alternativeIndexByRule(
  proposal: RecommendationProposal,
  ruleId: RecommendationRuleId,
): number {
  return proposal.alternatives.findIndex(
    (alt) => alt.actionDescriptor?.ruleId === ruleId,
  );
}

function expectDescriptorShape(
  descriptor: RecommendationActionDescriptor | undefined,
): void {
  expect(descriptor).toBeDefined();
  const value = descriptor as RecommendationActionDescriptor;
  expect(RULE_IDS).toContain(value.ruleId);
  expect(typeof value.mutatesOperationalState).toBe("boolean");
  expect(SUBJECT_TYPES).toContain(value.subjectEntityType);
  expect(value.subjectEntityId.length).toBeGreaterThan(0);
  expect(value.originTaskId.length).toBeGreaterThan(0);

  const expectedKeys = [
    "mutatesOperationalState",
    "originTaskId",
    "ruleId",
    "subjectEntityId",
    "subjectEntityType",
  ];
  if (value.targetTaskId !== undefined) expectedKeys.push("targetTaskId");
  expect(Object.keys(value).sort()).toEqual(expectedKeys.sort());
}

function fullRun(): ReasoningRuntime {
  const snapshot = freshSnapshot();
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function proposalsFromRun(): RecommendationProposal[] {
  return fullRun()
    .reasonings.map((entry) => entry.recommendation)
    .filter((rec): rec is RecommendationProposal => rec !== null);
}

function decisionFrom(proposal: RecommendationProposal): {
  decision: OperationalDecision;
  facts: ProposalFacts;
} {
  const facts = buildProposalFacts(proposal);
  const decision = createOperationalDecision({
    id: `decision-${proposal.id}`,
    recommendationId: proposal.id,
    signalId: proposal.signalId,
    issueId: proposal.issueId,
    approvalRequired: proposal.approval.required,
    mutatesOperationalState: facts.primaryAction.mutatesOperationalState,
    createdAtSimulated: T0,
  });
  return { decision, facts };
}

/** Copy without the Phase 3C field, to compare against the Phase 3B shape. */
function withoutDescriptor<T extends { actionDescriptor?: unknown }>(
  value: T,
): Omit<T, "actionDescriptor"> {
  const copy = { ...value };
  delete copy.actionDescriptor;
  return copy;
}

function confidenceStub(): ConfidenceAssessment {
  return {
    category: "High",
    supportingFacts: [],
    missingFacts: [],
    conflictingFacts: [],
    explanation: "test stub",
  };
}

/** Legacy proposal shape: no descriptor on the primary or on alternatives. */
function legacyProposal(
  primaryAction: string,
  alternativeActions: string[],
  approvalRequired: boolean,
): RecommendationProposal {
  return {
    id: "rec-legacy",
    signalId: "signal-legacy",
    issueId: "issue-legacy",
    primaryAction,
    rationale: "legacy rationale",
    expectedBenefit: "legacy benefit",
    approval: {
      required: approvalRequired,
      reason: approvalRequired ? "legacy approval reason" : null,
    },
    alternatives: alternativeActions.map((action) => ({
      action,
      rationale: "legacy alternative rationale",
      expectedBenefit: "legacy alternative benefit",
      evidence: [],
    })),
    confidence: confidenceStub(),
    evidence: [],
  };
}

function descriptorStub(
  ruleId: RecommendationRuleId,
  mutatesOperationalState: boolean,
): RecommendationActionDescriptor {
  return {
    ruleId,
    mutatesOperationalState,
    subjectEntityType: "task",
    subjectEntityId: POUR,
    originTaskId: POUR,
  };
}

describe("structured action identity — recommendation rules", () => {
  it("weather resequencing carries rule identity and both task identifiers", () => {
    const proposal = proposalFor("fixture-weather-alert");
    expect(primaryDescriptor(proposal)).toEqual({
      ruleId: "REC_TASK_RESEQUENCE",
      mutatesOperationalState: true,
      subjectEntityType: "task",
      subjectEntityId: POUR,
      originTaskId: POUR,
      targetTaskId: DRYWALL_PREP,
    });
    expect(alternativeRuleIds(proposal)).toEqual(["REC_MONITOR_PROTECT"]);
  });

  it("material escalation carries the material subject and ordered alternatives", () => {
    const proposal = proposalFor("fixture-material-delay");
    expect(primaryDescriptor(proposal)).toEqual({
      ruleId: "REC_MATERIAL_ESCALATE",
      mutatesOperationalState: false,
      subjectEntityType: "material",
      subjectEntityId: "mat-concrete",
      originTaskId: POUR,
    });
    expect(alternativeRuleIds(proposal)).toEqual([
      "REC_MATERIAL_PROTECT",
      "REC_TASK_RESEQUENCE",
      "REC_MONITOR_PROTECT",
    ]);

    const resequenceIndex = alternativeIndexByRule(proposal, "REC_TASK_RESEQUENCE");
    expect(
      proposal.alternatives[resequenceIndex].actionDescriptor?.targetTaskId,
    ).toBe(DRYWALL_PREP);
  });

  it("inspection coordination carries the gating inspection as subject", () => {
    const proposal = proposalFor("fixture-inspection-missing");
    expect(primaryDescriptor(proposal)).toEqual({
      ruleId: "REC_INSPECTION_COORDINATE",
      mutatesOperationalState: false,
      subjectEntityType: "inspection",
      subjectEntityId: "insp-slab-pre-pour",
      originTaskId: POUR,
    });
    expect(alternativeRuleIds(proposal)).toEqual(["REC_MONITOR_PROTECT"]);
  });

  it("primary and alternative actions use one descriptor model", () => {
    const proposals = proposalsFromRun();
    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      expectDescriptorShape(proposal.actionDescriptor);
      expect(proposal.alternatives.length).toBeGreaterThan(0);
      for (const alternative of proposal.alternatives) {
        expectDescriptorShape(alternative.actionDescriptor);
      }
    }
  });

  it("every descriptor keeps the Phase 3B mutates classification for its rule", () => {
    const seen = new Set<RecommendationRuleId>();
    for (const proposal of proposalsFromRun()) {
      const descriptors = [
        primaryDescriptor(proposal),
        ...proposal.alternatives.map((alt) => alt.actionDescriptor!),
      ];
      for (const descriptor of descriptors) {
        seen.add(descriptor.ruleId);
        expect(descriptor.mutatesOperationalState).toBe(
          PHASE_3B_MUTATES_BY_RULE[descriptor.ruleId],
        );
      }
    }
    expect([...seen].sort()).toEqual([
      "REC_INSPECTION_COORDINATE",
      "REC_MATERIAL_ESCALATE",
      "REC_MATERIAL_PROTECT",
      "REC_MONITOR_PROTECT",
      "REC_TASK_RESEQUENCE",
    ]);
  });

  it("classification table agrees with the frozen prose inference for every rule", () => {
    for (const ruleId of RULE_IDS) {
      expect(inferMutatesOperationalState(LEGACY_PROSE_BY_RULE[ruleId])).toBe(
        PHASE_3B_MUTATES_BY_RULE[ruleId],
      );
    }
    expect(PHASE_3B_MUTATES_BY_RULE.REC_SAFETY_PROTECT).toBe(true);
    expect(PHASE_3B_MUTATES_BY_RULE.REC_CREW_REASSIGN).toBe(true);
  });
});

describe("ProposalFacts descriptor propagation", () => {
  it("carries the same descriptor objects through without cloning", () => {
    const proposal = proposalFor("fixture-material-delay");
    const facts = buildProposalFacts(proposal);

    expect(facts.primaryAction.descriptor).toBe(proposal.actionDescriptor);
    expect(facts.alternatives).toHaveLength(proposal.alternatives.length);
    proposal.alternatives.forEach((alternative, index) => {
      expect(facts.alternatives[index].descriptor).toBe(
        alternative.actionDescriptor,
      );
      expect(facts.alternatives[index].action).toBe(alternative.action);
    });
  });

  it("treats the descriptor as authoritative over action prose", () => {
    const proseSaysMutating = legacyProposal(
      LEGACY_PROSE_BY_RULE.REC_TASK_RESEQUENCE,
      [],
      true,
    );
    const withNonMutatingDescriptor: RecommendationProposal = {
      ...proseSaysMutating,
      actionDescriptor: descriptorStub("REC_MONITOR_PROTECT", false),
    };
    expect(
      inferMutatesOperationalState(withNonMutatingDescriptor.primaryAction),
    ).toBe(true);
    expect(
      buildProposalFacts(withNonMutatingDescriptor).primaryAction
        .mutatesOperationalState,
    ).toBe(false);

    const proseSaysAdvisory = legacyProposal(
      LEGACY_PROSE_BY_RULE.REC_MONITOR_PROTECT,
      [],
      true,
    );
    const withMutatingDescriptor: RecommendationProposal = {
      ...proseSaysAdvisory,
      actionDescriptor: descriptorStub("REC_CREW_REASSIGN", true),
    };
    expect(
      inferMutatesOperationalState(withMutatingDescriptor.primaryAction),
    ).toBe(false);
    expect(
      buildProposalFacts(withMutatingDescriptor).primaryAction
        .mutatesOperationalState,
    ).toBe(true);
  });

  it("falls back to prose inference only for a descriptor-less proposal", () => {
    const proposal = legacyProposal(
      LEGACY_PROSE_BY_RULE.REC_CREW_REASSIGN,
      [LEGACY_PROSE_BY_RULE.REC_MONITOR_PROTECT],
      true,
    );
    const facts = buildProposalFacts(proposal);

    expect(facts.primaryAction.descriptor).toBeUndefined();
    expect(facts.primaryAction.mutatesOperationalState).toBe(true);
    expect(facts.alternatives[0].descriptor).toBeUndefined();
    expect(facts.alternatives[0].mutatesOperationalState).toBe(false);
  });
});

describe("selected descriptor persistence on OperationalDecision", () => {
  it("opens a decision with no selected descriptor", () => {
    const { decision } = decisionFrom(proposalFor("fixture-weather-alert"));
    expect(decision.selectedAction).toBeNull();
    expect(decision.selectedActionSource).toBeNull();
    expect(decision.selectedActionDescriptor).toBeNull();
  });

  it("Acknowledge persists the primary descriptor", () => {
    const proposal = proposalFor("fixture-inspection-missing");
    const { decision, facts } = decisionFrom(proposal);
    expect(facts.approvalRequired).toBe(false);

    const result = transitionDecision(
      decision,
      { type: "AcknowledgeDecision", actor: ACTOR, simulatedAt: T0 },
      facts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.decision.state).toBe("Acknowledged");
    expect(result.decision.selectedActionSource).toBe("primary");
    expect(result.decision.selectedActionDescriptor).toBe(
      proposal.actionDescriptor,
    );
    expect(result.decision.selectedActionDescriptor?.ruleId).toBe(
      "REC_INSPECTION_COORDINATE",
    );
  });

  it("Approve with primary source persists the primary descriptor", () => {
    const proposal = proposalFor("fixture-weather-alert");
    const { decision, facts } = decisionFrom(proposal);
    expect(facts.approvalRequired).toBe(true);

    const result = transitionDecision(
      decision,
      {
        type: "ApproveDecision",
        actor: ACTOR,
        simulatedAt: T0,
        selectedActionSource: "primary",
      },
      facts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.decision.state).toBe("Approved");
    expect(result.decision.selectedActionDescriptor).toEqual({
      ruleId: "REC_TASK_RESEQUENCE",
      mutatesOperationalState: true,
      subjectEntityType: "task",
      subjectEntityId: POUR,
      originTaskId: POUR,
      targetTaskId: DRYWALL_PREP,
    });
    expect(result.decision.mutatesOperationalState).toBe(true);
  });

  it("Approve with an alternative persists that exact alternative descriptor", () => {
    const proposal = proposalFor("fixture-weather-alert");
    const { decision, facts } = decisionFrom(proposal);
    const alternativeIndex = alternativeIndexByRule(
      proposal,
      "REC_MONITOR_PROTECT",
    );
    expect(alternativeIndex).toBeGreaterThanOrEqual(0);

    const result = transitionDecision(
      decision,
      {
        type: "ApproveDecision",
        actor: ACTOR,
        simulatedAt: T0,
        selectedActionSource: "alternative",
        alternativeIndex,
      },
      facts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The chosen alternative's rule differs from the primary's rule.
    expect(primaryDescriptor(proposal).ruleId).toBe("REC_TASK_RESEQUENCE");
    expect(result.decision.selectedActionSource).toBe("alternative");
    expect(result.decision.selectedActionDescriptor).toBe(
      proposal.alternatives[alternativeIndex].actionDescriptor,
    );
    expect(result.decision.selectedActionDescriptor?.ruleId).toBe(
      "REC_MONITOR_PROTECT",
    );
    // Classification follows the selected alternative, not the primary.
    expect(result.decision.mutatesOperationalState).toBe(false);
  });

  it("records a null descriptor when a legacy proposal has none", () => {
    const proposal = legacyProposal(
      LEGACY_PROSE_BY_RULE.REC_CREW_REASSIGN,
      [LEGACY_PROSE_BY_RULE.REC_MONITOR_PROTECT],
      true,
    );
    const { decision, facts } = decisionFrom(proposal);

    const result = transitionDecision(
      decision,
      {
        type: "ApproveDecision",
        actor: ACTOR,
        simulatedAt: T0,
        selectedActionSource: "alternative",
        alternativeIndex: 0,
      },
      facts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.decision.selectedActionDescriptor).toBeNull();
    expect(result.decision.selectedAction).toBe(
      LEGACY_PROSE_BY_RULE.REC_MONITOR_PROTECT,
    );
    expect(result.decision.mutatesOperationalState).toBe(false);
  });
});

describe("Phase 3A recommendation regression after descriptor stripping", () => {
  it("adds exactly one key to proposals and alternatives", () => {
    for (const proposal of proposalsFromRun()) {
      expect(Object.keys(proposal).sort()).toEqual(
        [...PROPOSAL_KEYS_PHASE_3B, "actionDescriptor"].sort(),
      );

      expect(Object.keys(withoutDescriptor(proposal)).sort()).toEqual(
        [...PROPOSAL_KEYS_PHASE_3B].sort(),
      );

      for (const alternative of proposal.alternatives) {
        expect(Object.keys(alternative).sort()).toEqual(
          [...ALTERNATIVE_KEYS_PHASE_3B, "actionDescriptor"].sort(),
        );
        expect(Object.keys(withoutDescriptor(alternative)).sort()).toEqual(
          [...ALTERNATIVE_KEYS_PHASE_3B].sort(),
        );
      }
    }
  });

  it("preserves prose, approval, evidence, ordering, and confidence", () => {
    const weather = proposalFor("fixture-weather-alert");
    expect(weather.primaryAction).toBe(
      `Resequence work: hold exposed task ${POUR} and advance ready alternate task ${DRYWALL_PREP}.`,
    );
    expect(weather.rationale).toBe(
      "Dependency and requirement facts show a safe alternate task can proceed while the exposed task remains constrained.",
    );
    expect(weather.expectedBenefit).toBe(
      `Protects continuity by advancing ${DRYWALL_PREP} while ${POUR} remains exposed.`,
    );
    expect(weather.approval).toEqual({
      required: true,
      reason: "Critical-path or multi-task resequencing requires approval.",
    });
    expect(weather.alternatives.map((alt) => alt.action)).toEqual([
      `Monitor the condition on ${POUR}, protect the current plan, and reassess when missing operational facts change.`,
    ]);
    expect(
      weather.evidence.map((item) => `${item.entityType}:${item.entityId}`),
    ).toEqual([
      "signal:signal-fixture-weather-alert",
      `task:${POUR}`,
      `task:${DRYWALL_PREP}`,
      `task:${POUR}`,
    ]);

    const material = proposalFor("fixture-material-delay");
    expect(material.primaryAction).toBe(
      `Escalate the material blocker for mat-concrete affecting task ${POUR}.`,
    );
    expect(material.rationale).toBe(
      "The material requirement remains unsatisfied and continues to block the related task.",
    );
    expect(material.expectedBenefit).toBe(
      "Surfaces the unmet material requirement for mat-concrete without inventing a substitute delivery.",
    );
    expect(material.approval).toEqual({ required: false, reason: null });
    expect(material.alternatives.map((alt) => alt.action)).toEqual([
      `Protect the plan for ${POUR} until material mat-concrete delivery status is confirmed received.`,
      `Resequence work: hold exposed task ${POUR} and advance ready alternate task ${DRYWALL_PREP}.`,
      `Monitor the condition on ${POUR}, protect the current plan, and reassess when missing operational facts change.`,
    ]);

    const inspection = proposalFor("fixture-inspection-missing");
    expect(inspection.primaryAction).toBe(
      `Coordinate completion of required inspection insp-slab-pre-pour before releasing gated task ${POUR}.`,
    );
    expect(inspection.rationale).toBe(
      "Dependent work cannot proceed while the required inspection remains incomplete.",
    );
    expect(inspection.expectedBenefit).toBe(
      `Protects ${POUR} from release until inspection insp-slab-pre-pour is passed.`,
    );
    expect(inspection.approval).toEqual({ required: false, reason: null });

    // Confidence remains the Priority Engine assessment, passed through.
    const run = runFixture(freshSnapshot(), "fixture-weather-alert");
    expect(run.recommendation?.confidence).toBe(run.priority.confidence);
  });

  it("produces no recommendation for positive recovery observations", () => {
    for (const fixtureId of ["fixture-delivery-received", "fixture-task-complete"]) {
      const { recommendation } = runFixture(freshSnapshot(), fixtureId);
      expect(recommendation).toBeNull();
    }
  });
});

describe("determinism and immutability", () => {
  it("two identical runs produce identical output including descriptors", () => {
    expect(JSON.stringify(fullRun())).toBe(JSON.stringify(fullRun()));
  });

  it("recommendation generation does not mutate the snapshot", () => {
    const snapshot = freshSnapshot();
    const before = JSON.stringify(snapshot);
    runFixture(snapshot, "fixture-material-delay");
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("buildProposalFacts does not mutate the proposal", () => {
    const proposal = proposalFor("fixture-material-delay");
    const before = JSON.stringify(proposal);
    buildProposalFacts(proposal);
    expect(JSON.stringify(proposal)).toBe(before);
  });

  it("transitionDecision returns a new decision without mutating the input", () => {
    const proposal = proposalFor("fixture-weather-alert");
    const { decision, facts } = decisionFrom(proposal);
    const before = JSON.stringify(decision);

    const result = transitionDecision(
      decision,
      {
        type: "ApproveDecision",
        actor: ACTOR,
        simulatedAt: T0,
        selectedActionSource: "primary",
      },
      facts,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(JSON.stringify(decision)).toBe(before);
    expect(result.decision).not.toBe(decision);
    expect(decision.selectedActionDescriptor).toBeNull();
  });
});
