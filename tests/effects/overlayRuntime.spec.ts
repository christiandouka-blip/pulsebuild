import { beforeEach, describe, expect, it } from "vitest";

import {
  applyCommandsToDecision,
  createOperationalDecision,
  initialDecisionRuntime,
  intakeDecisions,
  transitionDecision,
  type DecisionCommand,
  type DecisionRuntime,
  type OperationalDecision,
  type ProposalFacts,
} from "@/domain/decisions";
import {
  applyOverlayEffect,
  collectDecisionEffectIntake,
  collectObservationEffectIntake,
  initialOverlayRuntime,
  syncOverlayFromDecisions,
  syncOverlayFromReasoning,
  syncOverlayFromRuntimes,
} from "@/domain/effects/runtime";
import type { CrewAssignmentChangedEffect } from "@/domain/effects/types";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import type { RecommendationActionDescriptor } from "@/domain/types/recommendation";
import type { Crew } from "@/domain/types/resources";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";
import { useOverlayStore } from "@/store/useOverlayStore";
import { freshSnapshot } from "@/tests/engines/helpers";

const ACTOR = "superintendent" as const;
const T_CREATE = "2026-03-14T12:00:00.000Z";
const T_APPROVE = "2026-03-14T12:15:00.000Z";
const T_EXECUTE = "2026-03-14T12:30:00.000Z";
const T_VERIFY = "2026-03-14T12:45:00.000Z";

const POUR = "task-pour-level-1-slab";
const CONCRETE_CREW = "crew-concrete-a";
const TARGET_A = "task-synthetic-reassign-a";

const CREW_DESCRIPTOR: RecommendationActionDescriptor = {
  ruleId: "REC_CREW_REASSIGN",
  mutatesOperationalState: true,
  subjectEntityType: "crew",
  subjectEntityId: CONCRETE_CREW,
  originTaskId: POUR,
  targetTaskId: TARGET_A,
};

const CREW_PROSE =
  "Propose reassigning crew-concrete-a from blocked task-pour-level-1-slab to task-synthetic-reassign-a.";

function processAll(snapshot: ProjectSnapshot): ReasoningRuntime {
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

function makeTask(id: string, requiredCrewIds: string[]): Task {
  return {
    id,
    projectId: "proj-harbor-point",
    phaseId: "phase-structure",
    name: `Synthetic ${id}`,
    status: "Ready",
    taskType: "interior_prep",
    plannedStart: "2026-03-14T08:00:00-04:00",
    plannedEnd: "2026-03-14T16:00:00-04:00",
    dependencyTaskIds: [],
    requiredCrewIds,
    requiredMaterialIds: [],
    requiredEquipmentIds: [],
    priorityWeight: 2,
    isCriticalPath: false,
  };
}

function snapshotWithTargets(): ProjectSnapshot {
  const baseline = freshSnapshot();
  return {
    ...baseline,
    tasks: [...baseline.tasks, makeTask(TARGET_A, [CONCRETE_CREW])],
  };
}

function crewFacts(): ProposalFacts {
  return {
    approvalRequired: true,
    primaryAction: {
      action: CREW_PROSE,
      mutatesOperationalState: CREW_DESCRIPTOR.mutatesOperationalState,
      descriptor: CREW_DESCRIPTOR,
    },
    alternatives: [],
  };
}

function step(
  decision: OperationalDecision,
  command: DecisionCommand,
  facts: ProposalFacts,
): OperationalDecision {
  const result = transitionDecision(decision, command, facts);
  if (!result.ok) {
    throw new Error(`${command.type} failed: ${result.error.code}`);
  }
  return result.decision;
}

function verifiedCrewDecision(): OperationalDecision {
  const facts = crewFacts();
  let decision = createOperationalDecision({
    id: "decision-rec-synthetic",
    recommendationId: "rec-synthetic",
    signalId: "signal-synthetic",
    issueId: "issue-synthetic",
    approvalRequired: true,
    mutatesOperationalState: true,
    createdAtSimulated: T_CREATE,
  });
  decision = step(
    decision,
    {
      type: "ApproveDecision",
      actor: ACTOR,
      simulatedAt: T_APPROVE,
      selectedActionSource: "primary",
    },
    facts,
  );
  decision = step(
    decision,
    { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T_APPROVE },
    facts,
  );
  decision = step(
    decision,
    { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T_EXECUTE },
    facts,
  );
  decision = step(
    decision,
    { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: T_EXECUTE },
    facts,
  );
  return step(
    decision,
    { type: "VerifyDecision", actor: ACTOR, simulatedAt: T_VERIFY },
    facts,
  );
}

function crewDecisionRuntime(decision: OperationalDecision): DecisionRuntime {
  return {
    decisions: [decision],
    proposalFactsByRecommendationId: {
      [decision.recommendationId]: crewFacts(),
    },
  };
}

function driveToVerified(
  runtime: DecisionRuntime,
  decisionId: string,
): DecisionRuntime {
  const result = applyCommandsToDecision(runtime, decisionId, [
    {
      type: "ApproveDecision",
      actor: ACTOR,
      simulatedAt: T_APPROVE,
      selectedActionSource: "primary",
    },
    { type: "ProceedAfterApproval", actor: ACTOR, simulatedAt: T_APPROVE },
    { type: "MarkExecutionComplete", actor: ACTOR, simulatedAt: T_EXECUTE },
    { type: "AdvanceToVerification", actor: ACTOR, simulatedAt: T_EXECUTE },
    { type: "VerifyDecision", actor: ACTOR, simulatedAt: T_VERIFY },
  ]);
  if (!result.ok) {
    throw new Error(`driveToVerified failed: ${result.error.code}`);
  }
  return result.runtime;
}

function assignedCrew(snapshot: ProjectSnapshot, crewId: string): Crew | undefined {
  return snapshot.crews.find((c) => c.id === crewId);
}

function missingCrewEffect(): CrewAssignmentChangedEffect {
  return {
    id: "effect-decision-missing-crew-CrewAssignmentChanged",
    decisionId: "decision-missing-crew",
    recommendationId: "rec-missing-crew",
    signalId: "signal-missing-crew",
    issueId: null,
    ruleId: "REC_CREW_REASSIGN",
    effectType: "CrewAssignmentChanged",
    simulatedAt: T_VERIFY,
    crewId: "crew-does-not-exist",
    originTaskId: POUR,
    targetTaskId: TARGET_A,
  };
}

describe("OverlayRuntime baseline", () => {
  it("starts from the immutable baseline snapshot with no applied effects", () => {
    const snapshot = freshSnapshot();
    const overlay = initialOverlayRuntime(snapshot);
    expect(overlay.effective.baseline).toBe(snapshot);
    expect(overlay.effective.snapshot).toBe(snapshot);
    expect(overlay.effective.applied).toEqual([]);
    expect(overlay.effectHistory).toEqual([]);
    expect(overlay.applicationResults).toEqual([]);
  });
});

describe("decision-effect intake", () => {
  it("applies an eligible verified crew-reassignment effect", () => {
    const snapshot = snapshotWithTargets();
    const decisions = crewDecisionRuntime(verifiedCrewDecision());
    const overlay = syncOverlayFromDecisions(initialOverlayRuntime(snapshot), decisions);
    expect(overlay.applicationResults).toHaveLength(1);
    expect(overlay.applicationResults[0]?.outcome).toBe("Applied");
    expect(overlay.effectHistory[0]?.id).toBe(
      "effect-decision-rec-synthetic-CrewAssignmentChanged",
    );
    expect(assignedCrew(overlay.effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
    expect(assignedCrew(snapshot, CONCRETE_CREW)?.currentTaskId).toBe(POUR);
  });

  it("produces no operational write for a verified workflow-only decision", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const weather = reasoning.reasonings.find((r) => r.signal.type === "WeatherAlert");
    expect(weather?.recommendation).toBeTruthy();
    const seeded = intakeDecisions(reasoning, initialDecisionRuntime());
    const verified = driveToVerified(seeded, `decision-${weather!.recommendation!.id}`);
    expect(
      verified.decisions.find((d) => d.id === `decision-${weather!.recommendation!.id}`)
        ?.state,
    ).toBe("Verified");
    const overlay = syncOverlayFromDecisions(initialOverlayRuntime(snapshot), verified);
    expect(overlay.effective.applied).toEqual([]);
    expect(overlay.effectHistory).toEqual([]);
    const intake = collectDecisionEffectIntake(verified);
    const weatherIntake = intake.intakes.find(
      (row) => row.decisionId === `decision-${weather!.recommendation!.id}`,
    );
    expect(weatherIntake?.resolution.outcome).toBe("NoOperationalEffect");
  });

  it("produces no operational write for an unverified decision", () => {
    const snapshot = snapshotWithTargets();
    const pending = createOperationalDecision({
      id: "decision-rec-synthetic",
      recommendationId: "rec-synthetic",
      signalId: "signal-synthetic",
      issueId: "issue-synthetic",
      approvalRequired: true,
      mutatesOperationalState: true,
      createdAtSimulated: T_CREATE,
    });
    const overlay = syncOverlayFromDecisions(
      initialOverlayRuntime(snapshot),
      crewDecisionRuntime(pending),
    );
    expect(overlay.effective.applied).toEqual([]);
    expect(overlay.effectHistory).toEqual([]);
    const intake = collectDecisionEffectIntake(crewDecisionRuntime(pending));
    expect(intake.intakes[0]?.resolution).toMatchObject({
      outcome: "Rejected",
      code: "DECISION_NOT_VERIFIED",
    });
  });

  it("is idempotent across repeated decision sync", () => {
    const snapshot = snapshotWithTargets();
    const decisions = crewDecisionRuntime(verifiedCrewDecision());
    const first = syncOverlayFromDecisions(initialOverlayRuntime(snapshot), decisions);
    const second = syncOverlayFromDecisions(first, decisions);
    expect(second).toEqual(first);
    expect(second.effective.applied).toHaveLength(1);
    expect(second.effectHistory).toHaveLength(1);
  });
});

describe("observation-effect intake", () => {
  it("applies DeliveryReceived as a material overlay effect", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    const material = overlay.effective.snapshot.materials.find((m) => m.id === "mat-concrete");
    expect(material?.deliveryStatus).toBe("received");
    const delivery = reasoning.reasonings.find((r) => r.signal.type === "DeliveryReceived");
    expect(overlay.effectHistory.find((e) => e.effectType === "MaterialDeliveryReceived")?.id).toBe(
      `effect-observation-${delivery!.signal.id}-MaterialDeliveryReceived`,
    );
  });

  it("applies TaskComplete as a task overlay effect", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    const task = overlay.effective.snapshot.tasks.find(
      (t) => t.id === "task-interior-drywall-prep",
    );
    expect(task?.status).toBe("Completed");
    expect(overlay.effectHistory.some((e) => e.effectType === "TaskCompleted")).toBe(true);
  });

  it("produces no operational write for unsupported observations", () => {
    const snapshot = freshSnapshot();
    let reasoning = initialRuntime();
    reasoning = processNextObservation(snapshot, reasoning);
    expect(reasoning.reasonings[0]?.signal.type).toBe("WeatherAlert");
    const overlay = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    expect(overlay.effective.applied).toEqual([]);
    const intake = collectObservationEffectIntake(reasoning);
    expect(intake.intakes[0]?.resolution.outcome).toBe("NoOperationalEffect");
  });

  it("is idempotent across repeated reasoning sync", () => {
    const snapshot = freshSnapshot();
    const reasoning = processAll(snapshot);
    const first = syncOverlayFromReasoning(initialOverlayRuntime(snapshot), reasoning);
    const second = syncOverlayFromReasoning(first, reasoning);
    expect(second).toEqual(first);
    expect(first.effectHistory).toHaveLength(2);
  });
});

describe("immutability, rejection, ordering, and reset", () => {
  it("does not mutate ProjectSnapshot, ReasoningRuntime, or DecisionRuntime", () => {
    const snapshot = snapshotWithTargets();
    const reasoning = processAll(snapshot);
    const decisions = crewDecisionRuntime(verifiedCrewDecision());
    const snapshotBefore = JSON.stringify(snapshot);
    const reasoningBefore = JSON.stringify(reasoning);
    const decisionsBefore = JSON.stringify(decisions);

    syncOverlayFromRuntimes(initialOverlayRuntime(snapshot), reasoning, decisions);

    expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
    expect(JSON.stringify(reasoning)).toBe(reasoningBefore);
    expect(JSON.stringify(decisions)).toBe(decisionsBefore);
  });

  it("changes only the effective snapshot on a successful write", () => {
    const snapshot = snapshotWithTargets();
    const overlay = syncOverlayFromDecisions(
      initialOverlayRuntime(snapshot),
      crewDecisionRuntime(verifiedCrewDecision()),
    );
    expect(overlay.effective.baseline).toBe(snapshot);
    expect(overlay.effective.snapshot).not.toBe(snapshot);
    expect(assignedCrew(overlay.effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
    expect(assignedCrew(overlay.effective.baseline, CONCRETE_CREW)?.currentTaskId).toBe(
      POUR,
    );
  });

  it("surfaces a rejected effect explicitly without throwing", () => {
    const snapshot = snapshotWithTargets();
    const overlay = applyOverlayEffect(initialOverlayRuntime(snapshot), missingCrewEffect());
    expect(overlay.applicationResults).toHaveLength(1);
    expect(overlay.applicationResults[0]).toMatchObject({
      outcome: "Rejected",
      code: "CREW_NOT_FOUND",
    });
    expect(overlay.effective.applied).toEqual([]);
    expect(overlay.effectHistory).toHaveLength(1);
    expect(overlay.effective.snapshot).toBe(snapshot);
  });

  it("applies observation effects before decision effects in combined sync", () => {
    const snapshot = snapshotWithTargets();
    const reasoning = processAll(snapshot);
    const overlay = syncOverlayFromRuntimes(
      initialOverlayRuntime(snapshot),
      reasoning,
      crewDecisionRuntime(verifiedCrewDecision()),
    );
    expect(overlay.effectHistory.map((e) => e.effectType)).toEqual([
      "MaterialDeliveryReceived",
      "TaskCompleted",
      "CrewAssignmentChanged",
    ]);
  });

  it("produces a deep-equal OverlayRuntime for the same sync sequence", () => {
    const snapshot = snapshotWithTargets();
    const reasoning = processAll(snapshot);
    const decisions = crewDecisionRuntime(verifiedCrewDecision());
    const a = syncOverlayFromRuntimes(initialOverlayRuntime(snapshot), reasoning, decisions);
    const b = syncOverlayFromRuntimes(initialOverlayRuntime(snapshot), reasoning, decisions);
    expect(a).toEqual(b);
  });

  it("keeps application history append-only and effect ids deterministic", () => {
    const snapshot = snapshotWithTargets();
    const overlay = syncOverlayFromDecisions(
      initialOverlayRuntime(snapshot),
      crewDecisionRuntime(verifiedCrewDecision()),
    );
    const rejected = applyOverlayEffect(overlay, missingCrewEffect());
    expect(rejected.applicationResults).toHaveLength(2);
    expect(rejected.effectHistory.map((e) => e.id)).toEqual([
      "effect-decision-rec-synthetic-CrewAssignmentChanged",
      "effect-decision-missing-crew-CrewAssignmentChanged",
    ]);
    expect(rejected.effective.applied).toHaveLength(1);
  });

  it("resets OverlayRuntime to the baseline world", () => {
    const snapshot = snapshotWithTargets();
    const overlay = syncOverlayFromDecisions(
      initialOverlayRuntime(snapshot),
      crewDecisionRuntime(verifiedCrewDecision()),
    );
    const reset = initialOverlayRuntime(snapshot);
    expect(reset.effective.snapshot).toBe(snapshot);
    expect(reset.effectHistory).toEqual([]);
    expect(reset.applicationResults).toEqual([]);
    expect(assignedCrew(overlay.effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
  });
});

describe("overlay store", () => {
  beforeEach(() => {
    useOverlayStore.setState({ runtime: null });
  });

  it("exposes initialize, sync, apply, and reset without mutating the baseline", () => {
    const snapshot = snapshotWithTargets();
    const before = JSON.stringify(snapshot);
    useOverlayStore.getState().initializeOverlay(snapshot);
    expect(useOverlayStore.getState().runtime?.effective.applied).toEqual([]);

    const reasoning = processAll(snapshot);
    useOverlayStore.getState().syncFromReasoning(reasoning);
    useOverlayStore.getState().syncFromDecisions(crewDecisionRuntime(verifiedCrewDecision()));
    expect(useOverlayStore.getState().runtime?.effective.applied.length).toBeGreaterThan(0);

    useOverlayStore.getState().resetOverlay(snapshot);
    expect(useOverlayStore.getState().runtime?.effective.snapshot).toBe(snapshot);
    expect(useOverlayStore.getState().runtime?.effectHistory).toEqual([]);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
