import { describe, expect, it } from "vitest";

import { buildProjectSnapshot } from "@/data/index";
import {
  applyOperationalEffects,
  createEffectiveProjectSnapshot,
  resolveObservationEffect,
  VERIFICATION_POLICY_BY_SIGNAL_TYPE,
  verifyOperationalIssue,
} from "@/domain/effects";
import type {
  CrewAssignmentChangedEffect,
  MaterialDeliveryReceivedEffect,
  TaskCompletedEffect,
} from "@/domain/effects";
import { intakeObservation } from "@/domain/engines/observationIntake";
import { normalizeSignal } from "@/domain/engines/signalEngine";
import type { OperationalIssue } from "@/domain/types/issue";
import type { SignalType } from "@/domain/types/signal";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";

const POUR = "task-pour-level-1-slab";
const DRYWALL_PREP = "task-interior-drywall-prep";
const CONCRETE = "mat-concrete";
const CONDUIT = "mat-conduit";
const CONCRETE_CREW = "crew-concrete-a";
const SYNTHETIC_CREW_TASK = "task-synthetic-crew-target";
const ALL_SIGNAL_TYPES: SignalType[] = [
  "SafetyIncident",
  "InspectionFailed",
  "InspectionMissing",
  "CriticalEquipmentFailure",
  "MaterialDeliveryDelayed",
  "CrewShortage",
  "WeatherAlert",
  "PermitPending",
  "TaskBehindSchedule",
  "MinorDelay",
  "TaskComplete",
  "DeliveryReceived",
];

function snapshot(): ProjectSnapshot {
  return buildProjectSnapshot();
}

function committedSignal(fixtureId: string): ProjectSignal {
  const project = snapshot();
  const fixture = project.scenarioFixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new Error(`missing fixture ${fixtureId}`);
  const intake = intakeObservation(project, fixture, []);
  if (!intake.ok || !intake.signal) {
    throw new Error(`intake failed: ${intake.warnings.join(", ")}`);
  }
  return normalizeSignal(intake.signal);
}

function issueFrom(signal: ProjectSignal): OperationalIssue {
  return {
    id: `issue-${signal.id}`,
    signalId: signal.id,
    taskId: signal.relatedTaskId,
    kind: signal.type,
    status: "open",
    finalTier: signal.severityHint,
    openedAtSimulated: signal.observedAtSimulated,
  };
}

function syntheticSignal(
  type: SignalType,
  overrides: Partial<ProjectSignal> = {},
): ProjectSignal {
  return {
    id: `signal-synthetic-${type}`,
    projectId: "proj-harbor-point",
    type,
    status: "Prioritized",
    source: "simulation",
    relatedEntityType: "task",
    relatedEntityId: POUR,
    relatedTaskId: POUR,
    severityHint: "Tier2",
    rawData: {},
    observedAtSimulated: "2026-03-14T12:00:00.000Z",
    originFixtureId: "fixture-synthetic",
    sequenceOrder: 99,
    ...overrides,
  };
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

function applyDelivery(project: ProjectSnapshot) {
  const resolved = resolveObservationEffect(committedSignal("fixture-delivery-received"));
  if (resolved.outcome !== "Resolved") {
    throw new Error("expected DeliveryReceived to resolve");
  }
  return applyOperationalEffects(project, [resolved.effect]);
}

function applyTaskComplete(project: ProjectSnapshot) {
  const resolved = resolveObservationEffect(committedSignal("fixture-task-complete"));
  if (resolved.outcome !== "Resolved") {
    throw new Error("expected TaskComplete to resolve");
  }
  return applyOperationalEffects(project, [resolved.effect]);
}

describe("verification policy table", () => {
  it("covers every SignalType explicitly", () => {
    expect(Object.keys(VERIFICATION_POLICY_BY_SIGNAL_TYPE).sort()).toEqual(
      [...ALL_SIGNAL_TYPES].sort(),
    );
  });
});

describe("purity and immutability", () => {
  it("does not mutate the issue, baseline snapshot, or effective snapshot", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const effective = createEffectiveProjectSnapshot(project);
    const issueBefore = JSON.stringify(issue);
    const snapshotBefore = JSON.stringify(project);
    const effectiveBefore = JSON.stringify(effective);

    verifyOperationalIssue({ issue, signal, effective });

    expect(JSON.stringify(issue)).toBe(issueBefore);
    expect(issue.status).toBe("open");
    expect(JSON.stringify(project)).toBe(snapshotBefore);
    expect(JSON.stringify(effective)).toBe(effectiveBefore);
  });

  it("produces deep-equal output for the same inputs", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const effective = createEffectiveProjectSnapshot(project);
    expect(verifyOperationalIssue({ issue, signal, effective })).toEqual(
      verifyOperationalIssue({ issue, signal, effective }),
    );
  });
});

describe("material-delivery verification", () => {
  it("keeps the material issue active before delivery", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    expect(signal.relatedEntityId).toBe(CONCRETE);
    const issue = issueFrom(signal);
    const result = verifyOperationalIssue({
      issue,
      signal,
      effective: createEffectiveProjectSnapshot(project),
    });
    expect(result.outcome).toBe("StillActive");
    if (result.outcome !== "StillActive") return;
    expect(result.verificationRuleId).toBe("VERIFY_MATERIAL_REQUIREMENT");
    expect(result.relatedEntityId).toBe(CONCRETE);
    expect(result.remainingFacts.length).toBeGreaterThan(0);
    expect(result.currentEffectiveCondition.fact).toContain("in_transit");
  });

  it("recovers only after the named material is received on the issue task", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const { effective } = applyDelivery(project);
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("Recovered");
    if (result.outcome !== "Recovered") return;
    expect(result.verificationRuleId).toBe("VERIFY_MATERIAL_REQUIREMENT");
    expect(result.relatedEntityId).toBe(CONCRETE);
    expect(result.taskId).toBe(POUR);
    expect(result.provingFacts.length).toBeGreaterThan(0);
    expect(result.resolution.id).toBe(
      `resolution-${issue.id}-VERIFY_MATERIAL_REQUIREMENT`,
    );
    expect(result.resolution.resolvedAtSimulated).toBe(result.simulatedAt);
    expect(result.sourceEffectIds.length).toBeGreaterThan(0);
  });

  it("does not recover from an unrelated material delivery", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const unrelated: MaterialDeliveryReceivedEffect = {
      id: "effect-observation-signal-unrelated-MaterialDeliveryReceived",
      source: "observation",
      signalId: "signal-unrelated",
      effectType: "MaterialDeliveryReceived",
      simulatedAt: "2026-03-14T14:30:00.000Z",
      materialId: CONDUIT,
      deliveryStatus: "received",
      quantityReceived: 1500,
    };
    const { effective } = applyOperationalEffects(project, [unrelated]);
    expect(
      effective.snapshot.materials.find((m) => m.id === CONDUIT)?.deliveryStatus,
    ).toBe("received");
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("StillActive");
  });

  it("rejects a material/task relationship the task does not require", () => {
    const signal = syntheticSignal("MaterialDeliveryDelayed", {
      relatedEntityType: "material",
      relatedEntityId: CONCRETE,
      relatedTaskId: DRYWALL_PREP,
    });
    const issue = issueFrom(signal);
    const result = verifyOperationalIssue({
      issue,
      signal,
      effective: createEffectiveProjectSnapshot(snapshot()),
    });
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "TASK_DOES_NOT_REQUIRE_ENTITY",
    });
  });

  it("follows frozen materialsReady semantics and does not invent a quantity gate", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const zeroQty: MaterialDeliveryReceivedEffect = {
      id: "effect-observation-signal-zero-qty-MaterialDeliveryReceived",
      source: "observation",
      signalId: "signal-zero-qty",
      effectType: "MaterialDeliveryReceived",
      simulatedAt: "2026-03-14T14:30:00.000Z",
      materialId: CONCRETE,
      deliveryStatus: "received",
      quantityReceived: 0,
    };
    const { effective } = applyOperationalEffects(project, [zeroQty]);
    const material = effective.snapshot.materials.find((m) => m.id === CONCRETE)!;
    expect(material.deliveryStatus).toBe("received");
    expect(material.quantityReceived).toBe(0);
    expect(material.quantityExpected).toBe(120);
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("Recovered");
  });
});

describe("TaskComplete is not generic recovery", () => {
  it("does not resolve a material issue", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const { effective } = applyTaskComplete(project);
    expect(
      effective.snapshot.tasks.find((t) => t.id === DRYWALL_PREP)?.status,
    ).toBe("Completed");
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("StillActive");
  });

  it("does not resolve SafetyIncident", () => {
    const project = snapshot();
    const signal = syntheticSignal("SafetyIncident", {
      relatedEntityType: "task",
      relatedEntityId: DRYWALL_PREP,
      relatedTaskId: DRYWALL_PREP,
    });
    const issue = issueFrom(signal);
    const { effective } = applyTaskComplete(project);
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("NotVerifiable");
    if (result.outcome !== "NotVerifiable") return;
    expect(result.missingRule.toLowerCase()).toContain("safety");
  });

  it("does not resolve InspectionMissing merely because a task is Completed", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-inspection-missing");
    const issue = issueFrom(signal);
    const { effective } = applyTaskComplete(project);
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("StillActive");
    if (result.outcome !== "StillActive") return;
    expect(result.verificationRuleId).toBe("VERIFY_INSPECTION_REQUIREMENT");
    expect(result.currentEffectiveCondition.fact).toContain("scheduled");
  });
});

describe("inspection, weather, and crew", () => {
  it("keeps an inspection issue active while the inspection is not passed", () => {
    const signal = committedSignal("fixture-inspection-missing");
    const issue = issueFrom(signal);
    const result = verifyOperationalIssue({
      issue,
      signal,
      effective: createEffectiveProjectSnapshot(snapshot()),
    });
    expect(result.outcome).toBe("StillActive");
    if (result.outcome !== "StillActive") return;
    expect(result.remainingFacts.map((f) => f.fact).join(" ")).toContain("passed");
  });

  it("returns NotVerifiable for WeatherAlert", () => {
    const signal = committedSignal("fixture-weather-alert");
    const issue = issueFrom(signal);
    const { effective } = applyDelivery(snapshot());
    const result = verifyOperationalIssue({ issue, signal, effective });
    expect(result.outcome).toBe("NotVerifiable");
    if (result.outcome !== "NotVerifiable") return;
    expect(result.missingRule.toLowerCase()).toContain("weather");
  });

  it("requires the exact required crew and does not infer trade substitution", () => {
    const project = snapshot();
    const withTarget: ProjectSnapshot = {
      ...project,
      tasks: [...project.tasks, makeTask(SYNTHETIC_CREW_TASK, [CONCRETE_CREW])],
    };
    const signal = syntheticSignal("CrewShortage", {
      relatedEntityType: "crew",
      relatedEntityId: CONCRETE_CREW,
      relatedTaskId: SYNTHETIC_CREW_TASK,
    });
    const issue = issueFrom(signal);
    const empty = createEffectiveProjectSnapshot(withTarget);
    const before = verifyOperationalIssue({ issue, signal, effective: empty });
    expect(before.outcome).toBe("StillActive");

    const assignment: CrewAssignmentChangedEffect = {
      id: "effect-decision-crew-shortage-CrewAssignmentChanged",
      decisionId: "decision-crew-shortage",
      recommendationId: "rec-crew-shortage",
      signalId: signal.id,
      issueId: issue.id,
      ruleId: "REC_CREW_REASSIGN",
      effectType: "CrewAssignmentChanged",
      simulatedAt: "2026-03-14T13:00:00.000Z",
      crewId: CONCRETE_CREW,
      originTaskId: POUR,
      targetTaskId: SYNTHETIC_CREW_TASK,
    };
    const { effective } = applyOperationalEffects(withTarget, [assignment]);
    const after = verifyOperationalIssue({ issue, signal, effective });
    expect(after.outcome).toBe("Recovered");
    if (after.outcome !== "Recovered") return;
    expect(after.verificationRuleId).toBe("VERIFY_CREW_REQUIREMENT");
    expect(after.relatedEntityId).toBe(CONCRETE_CREW);
    expect(after.provingFacts.map((f) => f.fact).join(" ")).not.toMatch(/trade|skill/i);
  });
});

describe("rejected, not verifiable, and resolution records", () => {
  it("rejects an invalid issue/signal identity pairing", () => {
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const result = verifyOperationalIssue({
      issue: { ...issue, signalId: "signal-other" },
      signal,
      effective: createEffectiveProjectSnapshot(snapshot()),
    });
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "ISSUE_SIGNAL_MISMATCH",
    });
  });

  it("returns NotVerifiable for TaskBehindSchedule", () => {
    const signal = syntheticSignal("TaskBehindSchedule");
    const result = verifyOperationalIssue({
      issue: issueFrom(signal),
      signal,
      effective: createEffectiveProjectSnapshot(snapshot()),
    });
    expect(result.outcome).toBe("NotVerifiable");
  });

  it("creates an IssueResolutionRecord only from Recovered", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const active = verifyOperationalIssue({
      issue,
      signal,
      effective: createEffectiveProjectSnapshot(project),
    });
    expect(active.outcome).toBe("StillActive");
    expect(active).not.toHaveProperty("resolution");

    const weather = verifyOperationalIssue({
      issue: issueFrom(committedSignal("fixture-weather-alert")),
      signal: committedSignal("fixture-weather-alert"),
      effective: createEffectiveProjectSnapshot(project),
    });
    expect(weather.outcome).toBe("NotVerifiable");
    expect(weather).not.toHaveProperty("resolution");

    const { effective } = applyDelivery(project);
    const recovered = verifyOperationalIssue({ issue, signal, effective });
    expect(recovered.outcome).toBe("Recovered");
    if (recovered.outcome !== "Recovered") return;
    expect(recovered.resolution.issueId).toBe(issue.id);
    expect(recovered.resolution.verificationRuleId).toBe(
      "VERIFY_MATERIAL_REQUIREMENT",
    );
    expect(recovered.resolution.id).toBe(
      `resolution-${issue.id}-VERIFY_MATERIAL_REQUIREMENT`,
    );
  });

  it("keeps the resolution record additive; the issue stays open", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const { effective } = applyDelivery(project);
    const recovered = verifyOperationalIssue({ issue, signal, effective });
    expect(recovered.outcome).toBe("Recovered");
    if (recovered.outcome !== "Recovered") return;
    const before = JSON.stringify(recovered.resolution);
    expect(issue.status).toBe("open");
    expect(JSON.stringify(recovered.resolution)).toBe(before);
    expect(recovered.resolution).not.toBe(issue);
  });

  it("does not accept DecisionState and does not invoke Health or Drift", () => {
    const keys = ["issue", "signal", "effective"];
    const signal = committedSignal("fixture-material-delay");
    const issue = issueFrom(signal);
    const result = verifyOperationalIssue({
      issue,
      signal,
      effective: createEffectiveProjectSnapshot(snapshot()),
    });
    expect(result.outcome).toBe("StillActive");
    expect(result).not.toHaveProperty("decisionState");
    expect(result).not.toHaveProperty("health");
    expect(result).not.toHaveProperty("drift");
    expect(Object.keys({ issue, signal, effective: true })).toEqual(
      expect.arrayContaining(keys),
    );
  });
});

describe("task complete effect isolation", () => {
  it("does not treat a TaskCompleted overlay as inspection recovery", () => {
    const project = snapshot();
    const signal = committedSignal("fixture-inspection-missing");
    const complete: TaskCompletedEffect = {
      id: "effect-observation-signal-pour-complete-TaskCompleted",
      source: "observation",
      signalId: "signal-pour-complete",
      effectType: "TaskCompleted",
      simulatedAt: "2026-03-14T15:30:00.000Z",
      taskId: POUR,
      status: "Completed",
      actualEnd: "2026-03-14T15:30:00.000Z",
    };
    const { effective } = applyOperationalEffects(project, [complete]);
    expect(effective.snapshot.tasks.find((t) => t.id === POUR)?.status).toBe(
      "Completed",
    );
    const result = verifyOperationalIssue({
      issue: issueFrom(signal),
      signal,
      effective,
    });
    expect(result.outcome).toBe("StillActive");
  });
});
