import { describe, expect, it } from "vitest";

import { buildContext } from "@/domain/engines/contextBuilder";
import { analyzeDependency } from "@/domain/engines/dependencyEngine";
import { classifyPriority } from "@/domain/engines/priorityEngine";
import { predict } from "@/domain/engines/predictionEngine";
import { recommend } from "@/domain/engines/recommendationEngine";
import { markPrioritized, normalizeSignal } from "@/domain/engines/signalEngine";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";
import { freshSnapshot, runFixture } from "./helpers";

function baseSignal(
  type: ProjectSignal["type"],
  overrides: Partial<ProjectSignal> = {},
): ProjectSignal {
  return {
    id: `signal-${type}-test`,
    projectId: "proj-harbor-point",
    type,
    status: "Prioritized",
    source: "simulation",
    relatedEntityType: "task",
    relatedEntityId: "task-pour-level-1-slab",
    relatedTaskId: "task-pour-level-1-slab",
    severityHint: "Tier2",
    rawData: {},
    observedAtSimulated: "2026-03-14T12:00:00.000Z",
    originFixtureId: "fixture-synthetic",
    sequenceOrder: 99,
    ...overrides,
  };
}

function materialSignal() {
  return baseSignal("MaterialDeliveryDelayed", {
    relatedEntityType: "material",
    relatedEntityId: "mat-concrete",
  });
}

function recommendFor(
  snapshot: ProjectSnapshot,
  signal: ProjectSignal,
  issueId: string | null = `issue-${signal.id}`,
) {
  const context = buildContext(snapshot);
  let normalized = normalizeSignal(signal);
  const dependency = analyzeDependency(normalized, snapshot);
  const priority = classifyPriority(normalized, snapshot, context, dependency);
  normalized = markPrioritized(normalized);
  const prediction = predict(normalized, snapshot, context, dependency, priority);
  const recommendation = recommend({
    signal: normalized,
    snapshot,
    context,
    dependency,
    priority,
    prediction,
    issueId,
  });
  return { context, dependency, priority, prediction, recommendation };
}

function allActions(rec: NonNullable<ReturnType<typeof recommendFor>["recommendation"]>) {
  return [rec.primaryAction, ...rec.alternatives.map((a) => a.action)];
}

function makeAlternate(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-temp-interior-ready",
    projectId: "proj-harbor-point",
    phaseId: "phase-structure",
    name: "Temporary interior ready work",
    status: "Ready",
    taskType: "interior_prep",
    plannedStart: "2026-03-14T08:00:00-04:00",
    plannedEnd: "2026-03-14T16:00:00-04:00",
    dependencyTaskIds: [],
    requiredCrewIds: ["crew-concrete-a"],
    requiredMaterialIds: [],
    requiredEquipmentIds: [],
    priorityWeight: 2,
    isCriticalPath: false,
    ...overrides,
  };
}

/** No idle crew; no reassignment path. */
function snapshotWithoutIdleOrAlternate(): ProjectSnapshot {
  const snapshot = freshSnapshot();
  return {
    ...snapshot,
    tasks: snapshot.tasks.map((t) =>
      t.id === "task-pour-level-1-slab"
        ? { ...t, requiredCrewIds: [] }
        : t.id === "task-interior-drywall-prep"
          ? { ...t, status: "Planned" as const }
          : t,
    ),
    crews: snapshot.crews.map((c) =>
      c.id === "crew-concrete-a"
        ? { ...c, currentTaskId: null, status: "available" as const }
        : c,
    ),
    materials: snapshot.materials.map((m) =>
      m.id === "mat-drywall"
        ? { ...m, deliveryStatus: "delayed" as const, quantityReceived: 0 }
        : m,
    ),
  };
}

/** Idle concrete crew + ready alternate that does NOT list the crew in requiredCrewIds. */
function snapshotIdleReadyButNotRequired(): ProjectSnapshot {
  const snapshot = freshSnapshot();
  return {
    ...snapshot,
    tasks: [...snapshot.tasks, makeAlternate({ requiredCrewIds: [] })],
    crews: snapshot.crews.map((c) =>
      c.id === "crew-concrete-a"
        ? { ...c, currentTaskId: "task-pour-level-1-slab", status: "assigned" as const }
        : c,
    ),
  };
}

/** Idle concrete crew + ready alternate that explicitly requires that crew. */
function snapshotWithEligibleCrewReassign(): ProjectSnapshot {
  const snapshot = freshSnapshot();
  return {
    ...snapshot,
    tasks: [...snapshot.tasks, makeAlternate({ requiredCrewIds: ["crew-concrete-a"] })],
    crews: snapshot.crews.map((c) =>
      c.id === "crew-concrete-a"
        ? { ...c, currentTaskId: "task-pour-level-1-slab", status: "assigned" as const }
        : c,
    ),
  };
}

function snapshotWithoutResequenceAlternate(): ProjectSnapshot {
  const base = snapshotWithoutIdleOrAlternate();
  return {
    ...base,
    tasks: base.tasks.map((t) =>
      t.id === "task-interior-drywall-prep" ? { ...t, status: "Planned" as const } : t,
    ),
  };
}

describe("recommendation engine — evidence-gated candidates", () => {
  it("rejects crew reassignment when idle crew and ready alternate lack requiredCrewIds", () => {
    const { recommendation, prediction } = recommendFor(
      snapshotIdleReadyButNotRequired(),
      materialSignal(),
    );
    expect(prediction.idleCrewRisk.crewIds).toContain("crew-concrete-a");
    expect(recommendation).not.toBeNull();
    expect(allActions(recommendation!).join(" ")).not.toMatch(/Propose reassigning/i);
    expect(
      recommendation!.evidence.some((e) =>
        e.fact.includes("No ready alternate task explicitly requires crew-concrete-a"),
      ) ||
        recommendation!.alternatives.some((a) =>
          a.evidence.some((e) =>
            e.fact.includes("No ready alternate task explicitly requires crew-concrete-a"),
          ),
        ) ||
        recommendation!.primaryAction.match(/Monitor/i) !== null,
    ).toBe(true);
  });

  it("proposes crew reassignment when requiredCrewIds and all other eligibility facts hold", () => {
    const { recommendation, prediction } = recommendFor(
      snapshotWithEligibleCrewReassign(),
      materialSignal(),
    );
    expect(prediction.idleCrewRisk.crewIds).toContain("crew-concrete-a");
    expect(recommendation).not.toBeNull();
    const reassign = allActions(recommendation!).find((t) => /Propose reassigning/i.test(t));
    expect(reassign).toBeDefined();
    expect(reassign).toContain("crew-concrete-a");
    expect(reassign).toContain("task-pour-level-1-slab");
    expect(reassign).toContain("task-temp-interior-ready");
    expect(reassign).toMatch(/explicitly requires/i);
  });

  it("includes the requiredCrewIds eligibility fact in reassignment evidence", () => {
    const { recommendation } = recommendFor(
      snapshotWithEligibleCrewReassign(),
      materialSignal(),
    );
    const reassignAlt = recommendation!.alternatives.find((a) =>
      /Propose reassigning/i.test(a.action),
    );
    const evidence =
      /Propose reassigning/i.test(recommendation!.primaryAction)
        ? recommendation!.evidence
        : reassignAlt!.evidence;
    expect(
      evidence.some(
        (e) =>
          e.entityId === "task-temp-interior-ready" &&
          e.fact.includes("Task.requiredCrewIds includes crew-concrete-a"),
      ),
    ).toBe(true);
  });

  it("does not claim trade qualification or general task capability", () => {
    const { recommendation } = recommendFor(
      snapshotWithEligibleCrewReassign(),
      materialSignal(),
    );
    const blob = JSON.stringify(recommendation);
    expect(blob).not.toMatch(/trade-qualified|skills|interchangeable|any ready task/i);
    expect(blob).not.toMatch(/can perform productive work/i);
  });

  it("uses conditional expected-benefit language without guaranteeing recovery", () => {
    const { recommendation } = recommendFor(
      snapshotWithEligibleCrewReassign(),
      materialSignal(),
    );
    const reassign =
      /Propose reassigning/i.test(recommendation!.primaryAction)
        ? recommendation!
        : recommendation!.alternatives.find((a) => /Propose reassigning/i.test(a.action))!;
    const benefit =
      "expectedBenefit" in reassign
        ? reassign.expectedBenefit
        : recommendation!.expectedBenefit;
    expect(benefit).toMatch(/^May /);
    expect(benefit).not.toMatch(/guarantee|will recover|ensures/i);
  });

  it("rejects reassignment when the alternate already has a conflicting crew assignment", () => {
    const snapshot = snapshotWithEligibleCrewReassign();
    const conflicted: ProjectSnapshot = {
      ...snapshot,
      crews: [
        ...snapshot.crews,
        {
          id: "crew-temp-other",
          name: "Temp Other",
          trade: "general",
          requiredWorkers: 2,
          availableWorkers: 2,
          status: "assigned",
          currentTaskId: "task-temp-interior-ready",
        },
      ],
    };
    const { recommendation } = recommendFor(conflicted, materialSignal());
    expect(allActions(recommendation!).join(" ")).not.toMatch(/Propose reassigning/i);
  });

  it("rejects reassignment when the alternate is downstream of the blocked origin", () => {
    const snapshot = freshSnapshot();
    const withDownstreamAlt: ProjectSnapshot = {
      ...snapshot,
      tasks: [
        ...snapshot.tasks,
        makeAlternate({
          id: "task-temp-downstream",
          // Frame is downstream of pour; depending on frame makes this transitively dependent.
          dependencyTaskIds: ["task-frame-level-2"],
          requiredCrewIds: ["crew-concrete-a"],
          status: "Ready",
        }),
      ],
    };
    // Make the synthetic task appear requirement-ready except dependency on pour chain:
    // predecessors won't be complete while frame is incomplete — also reject path.
    const { recommendation } = recommendFor(withDownstreamAlt, materialSignal());
    expect(allActions(recommendation!).join(" ")).not.toMatch(/Propose reassigning/i);
  });

  it("rejects reassignment when the alternate has an incomplete predecessor", () => {
    const snapshot = snapshotWithEligibleCrewReassign();
    const incomplete: ProjectSnapshot = {
      ...snapshot,
      tasks: snapshot.tasks.map((t) =>
        t.id === "task-temp-interior-ready"
          ? { ...t, dependencyTaskIds: ["task-frame-level-2"] }
          : t,
      ),
    };
    const { recommendation } = recommendFor(incomplete, materialSignal());
    expect(allActions(recommendation!).join(" ")).not.toMatch(/Propose reassigning/i);
  });

  it("rejects reassignment when the alternate has an unsatisfied material requirement", () => {
    const snapshot = snapshotWithEligibleCrewReassign();
    const unsatisfied: ProjectSnapshot = {
      ...snapshot,
      tasks: snapshot.tasks.map((t) =>
        t.id === "task-temp-interior-ready"
          ? { ...t, requiredMaterialIds: ["mat-concrete"] }
          : t,
      ),
    };
    const { recommendation } = recommendFor(unsatisfied, materialSignal());
    expect(allActions(recommendation!).join(" ")).not.toMatch(/Propose reassigning/i);
  });

  it("never emits unsupported reassignment among alternatives", () => {
    const { recommendation } = recommendFor(
      snapshotIdleReadyButNotRequired(),
      materialSignal(),
    );
    expect(recommendation!.alternatives.every((a) => !/Propose reassigning/i.test(a.action))).toBe(
      true,
    );
  });

  it("produces different MaterialDeliveryDelayed outcomes when requiredCrewIds eligibility differs", () => {
    const weak = recommendFor(snapshotIdleReadyButNotRequired(), materialSignal()).recommendation!;
    const strong = recommendFor(
      snapshotWithEligibleCrewReassign(),
      materialSignal(),
    ).recommendation!;
    expect(allActions(weak).some((a) => /Propose reassigning/i.test(a))).toBe(false);
    expect(allActions(strong).some((a) => /Propose reassigning/i.test(a))).toBe(true);
  });

  it("produces deeply equal output for identical valid reassignment inputs", () => {
    const snapshot = snapshotWithEligibleCrewReassign();
    const signal = materialSignal();
    const a = recommendFor(snapshot, signal).recommendation!;
    const b = recommendFor(snapshot, signal).recommendation!;
    expect(a).toEqual(b);
  });

  it("produces deeply equal fallback output for identical invalid reassignment inputs", () => {
    const snapshot = snapshotIdleReadyButNotRequired();
    const signal = materialSignal();
    const a = recommendFor(snapshot, signal).recommendation!;
    const b = recommendFor(snapshot, signal).recommendation!;
    expect(a).toEqual(b);
    expect(allActions(a).join(" ")).not.toMatch(/Propose reassigning/i);
  });

  it("does not recommend crew reassignment when there is no idle crew", () => {
    const { recommendation, prediction } = recommendFor(
      snapshotWithoutIdleOrAlternate(),
      materialSignal(),
    );
    expect(prediction.idleCrewRisk.crewIds).toHaveLength(0);
    expect(allActions(recommendation!).join(" ")).not.toMatch(/Propose reassigning/i);
  });

  it("does not fabricate resequencing for WeatherAlert when no eligible alternate exists", () => {
    const { recommendation } = recommendFor(
      snapshotWithoutResequenceAlternate(),
      baseSignal("WeatherAlert", {
        relatedEntityType: "weather",
        relatedEntityId: "wx-baseline-clear",
        rawData: { affectedTaskTypes: ["concrete"] },
      }),
    );
    expect(recommendation!.primaryAction).not.toMatch(/Resequence/i);
    expect(recommendation!.primaryAction).toMatch(/Monitor/i);
    expect(recommendation!.approval.required).toBe(false);
  });

  it("may propose resequencing for WeatherAlert when a dependency-safe alternate exists", () => {
    const { recommendation } = recommendFor(
      freshSnapshot(),
      baseSignal("WeatherAlert", {
        relatedEntityType: "weather",
        relatedEntityId: "wx-baseline-clear",
        rawData: { affectedTaskTypes: ["concrete"] },
      }),
    );
    expect(recommendation!.primaryAction).toMatch(/Resequence/i);
    expect(recommendation!.primaryAction).toContain("task-pour-level-1-slab");
    expect(recommendation!.primaryAction).toContain("task-interior-drywall-prep");
    expect(recommendation!.approval.required).toBe(true);
  });

  it("identifies the exact inspection and affected task for InspectionMissing", () => {
    const { recommendation } = runFixture(freshSnapshot(), "fixture-inspection-missing");
    expect(recommendation!.primaryAction).toContain("insp-slab-pre-pour");
    expect(recommendation!.primaryAction).toContain("task-pour-level-1-slab");
  });

  it("does not invent a rescheduled inspection date", () => {
    const { recommendation } = runFixture(freshSnapshot(), "fixture-inspection-missing");
    expect(recommendation!.primaryAction).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("produces a monitoring proposal with requiresApproval=false for MinorDelay", () => {
    const { recommendation } = recommendFor(
      freshSnapshot(),
      baseSignal("MinorDelay", { severityHint: "Tier3" }),
    );
    expect(recommendation!.primaryAction).toMatch(/Monitor/i);
    expect(recommendation!.approval.required).toBe(false);
  });

  it("produces no corrective recommendation for positive signals without an issue", () => {
    expect(runFixture(freshSnapshot(), "fixture-delivery-received").recommendation).toBeNull();
    expect(runFixture(freshSnapshot(), "fixture-task-complete").recommendation).toBeNull();
  });

  it("sets approval from the selected action, not merely SignalType", () => {
    const monitorish = recommendFor(
      snapshotWithoutIdleOrAlternate(),
      materialSignal(),
    ).recommendation!;
    const weatherResequence = recommendFor(
      freshSnapshot(),
      baseSignal("WeatherAlert", {
        relatedEntityType: "weather",
        relatedEntityId: "wx-baseline-clear",
        rawData: { affectedTaskTypes: ["concrete"] },
      }),
    ).recommendation!;
    expect(monitorish.approval.required).toBe(false);
    expect(weatherResequence.approval.required).toBe(true);
  });
});
