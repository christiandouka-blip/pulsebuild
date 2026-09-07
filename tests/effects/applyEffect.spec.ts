import { describe, expect, it } from "vitest";

import { buildProjectSnapshot } from "@/data/index";
import {
  applyOperationalEffect,
  applyOperationalEffects,
  createEffectiveProjectSnapshot,
} from "@/domain/effects";
import type { CrewAssignmentChangedEffect } from "@/domain/effects";
import type { Crew } from "@/domain/types/resources";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";

const T_VERIFY = "2026-03-14T12:45:00.000Z";
const POUR = "task-pour-level-1-slab";
const ELECTRICAL_ROUGH = "task-electrical-rough";
const CONCRETE_CREW = "crew-concrete-a";
const ELECTRICAL_CREW = "crew-electrical-a";
const TARGET_A = "task-synthetic-reassign-a";
const TARGET_B = "task-synthetic-reassign-b";
const TARGET_ELEC = "task-synthetic-reassign-elec";

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

/** Harbor Point plus synthetic targets that honestly require the named crews. */
function snapshotWithTargets(): ProjectSnapshot {
  const baseline = buildProjectSnapshot();
  return {
    ...baseline,
    tasks: [
      ...baseline.tasks,
      makeTask(TARGET_A, [CONCRETE_CREW]),
      makeTask(TARGET_B, [CONCRETE_CREW]),
      makeTask(TARGET_ELEC, [ELECTRICAL_CREW]),
    ],
  };
}

function crewEffect(
  overrides: Partial<CrewAssignmentChangedEffect> = {},
): CrewAssignmentChangedEffect {
  return {
    id: "effect-decision-rec-synthetic-CrewAssignmentChanged",
    decisionId: "decision-rec-synthetic",
    recommendationId: "rec-synthetic",
    signalId: "signal-synthetic",
    issueId: "issue-synthetic",
    ruleId: "REC_CREW_REASSIGN",
    effectType: "CrewAssignmentChanged",
    simulatedAt: T_VERIFY,
    crewId: CONCRETE_CREW,
    originTaskId: POUR,
    targetTaskId: TARGET_A,
    ...overrides,
  };
}

function assignedCrew(
  snapshot: ProjectSnapshot,
  crewId: string,
): Crew | undefined {
  return snapshot.crews.find((c) => c.id === crewId);
}

describe("effective snapshot construction", () => {
  it("shares reference identity when the overlay is empty", () => {
    const baseline = snapshotWithTargets();
    const effective = createEffectiveProjectSnapshot(baseline);
    expect(effective.snapshot).toBe(baseline);
    expect(effective.baseline).toBe(baseline);
    expect(effective.applied).toEqual([]);
  });
});

describe("crew assignment application", () => {
  it("assigns the crew on the effective snapshot only", () => {
    const snapshot = snapshotWithTargets();
    const effect = crewEffect();
    const { effective, results } = applyOperationalEffects(snapshot, [effect]);

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("Applied");
    expect(assignedCrew(effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
    expect(assignedCrew(snapshot, CONCRETE_CREW)?.currentTaskId).toBe(POUR);
  });

  it("leaves the original ProjectSnapshot deeply unchanged", () => {
    const snapshot = snapshotWithTargets();
    const before = JSON.stringify(snapshot);
    applyOperationalEffects(snapshot, [crewEffect()]);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("leaves the effect object unchanged", () => {
    const snapshot = snapshotWithTargets();
    const effect = crewEffect();
    const before = JSON.stringify(effect);
    applyOperationalEffects(snapshot, [effect]);
    expect(JSON.stringify(effect)).toBe(before);
  });

  it("reads the previous assignment from application-time effective state", () => {
    const snapshot = snapshotWithTargets();
    expect(assignedCrew(snapshot, CONCRETE_CREW)?.currentTaskId).toBe(POUR);

    const { results } = applyOperationalEffects(snapshot, [crewEffect()]);
    expect(results[0].outcome).toBe("Applied");
    if (results[0].outcome !== "Applied") return;
    expect(results[0].record.previousValue).toBe(POUR);
    expect(results[0].record.newValue).toBe(TARGET_A);
    expect(results[0].record.previousValue).not.toBe(results[0].record.newValue);
  });

  it("records a null previous assignment when the crew is unassigned", () => {
    const snapshot = snapshotWithTargets();
    expect(assignedCrew(snapshot, ELECTRICAL_CREW)?.currentTaskId).toBeNull();

    const effect = crewEffect({
      id: "effect-decision-elec-CrewAssignmentChanged",
      decisionId: "decision-elec",
      crewId: ELECTRICAL_CREW,
      originTaskId: ELECTRICAL_ROUGH,
      targetTaskId: TARGET_ELEC,
    });
    const { results } = applyOperationalEffects(snapshot, [effect]);
    expect(results[0].outcome).toBe("Applied");
    if (results[0].outcome !== "Applied") return;
    expect(results[0].record.previousValue).toBeNull();
    expect(results[0].record.newValue).toBe(TARGET_ELEC);
  });

  it("sets Crew.status to assigned when the crew receives a task", () => {
    const snapshot = snapshotWithTargets();
    expect(assignedCrew(snapshot, ELECTRICAL_CREW)?.status).toBe("available");

    const effect = crewEffect({
      id: "effect-decision-elec-CrewAssignmentChanged",
      decisionId: "decision-elec",
      crewId: ELECTRICAL_CREW,
      originTaskId: ELECTRICAL_ROUGH,
      targetTaskId: TARGET_ELEC,
    });
    const { effective, results } = applyOperationalEffects(snapshot, [effect]);
    expect(results[0].outcome).toBe("Applied");
    if (results[0].outcome !== "Applied") return;
    expect(assignedCrew(effective.snapshot, ELECTRICAL_CREW)?.status).toBe(
      "assigned",
    );
    expect(results[0].record.previousStatus).toBe("available");
    expect(results[0].record.newStatus).toBe("assigned");
  });

  it("does not modify Task.requiredCrewIds", () => {
    const snapshot = snapshotWithTargets();
    const targetBefore = snapshot.tasks.find((t) => t.id === TARGET_A)!;
    const { effective } = applyOperationalEffects(snapshot, [crewEffect()]);
    const targetAfter = effective.snapshot.tasks.find((t) => t.id === TARGET_A)!;
    expect(targetAfter).toBe(targetBefore);
    expect(targetAfter.requiredCrewIds).toEqual([CONCRETE_CREW]);
  });

  it("keeps untouched crew objects by reference", () => {
    const snapshot = snapshotWithTargets();
    const other = snapshot.crews.find((c) => c.id === ELECTRICAL_CREW);
    const { effective } = applyOperationalEffects(snapshot, [crewEffect()]);
    expect(effective.snapshot.crews.find((c) => c.id === ELECTRICAL_CREW)).toBe(
      other,
    );
  });
});

describe("application-time validation", () => {
  it("rejects when the target task does not exist", () => {
    const snapshot = snapshotWithTargets();
    const { effective, results } = applyOperationalEffects(snapshot, [
      crewEffect({ targetTaskId: "task-does-not-exist" }),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "TARGET_TASK_NOT_FOUND",
    });
    expect(effective.snapshot).toBe(snapshot);
    expect(effective.applied).toEqual([]);
  });

  it("rejects when the crew does not exist", () => {
    const { results, effective } = applyOperationalEffects(snapshotWithTargets(), [
      crewEffect({ crewId: "crew-does-not-exist" }),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "CREW_NOT_FOUND",
    });
    expect(effective.applied).toEqual([]);
  });

  it("rejects when the origin task does not exist", () => {
    const { results } = applyOperationalEffects(snapshotWithTargets(), [
      crewEffect({ originTaskId: "task-origin-missing" }),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "ORIGIN_TASK_NOT_FOUND",
    });
  });

  it("rejects when the target does not explicitly require the crew", () => {
    const snapshot = snapshotWithTargets();
    const { effective, results } = applyOperationalEffects(snapshot, [
      crewEffect({ targetTaskId: ELECTRICAL_ROUGH }),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "TARGET_DOES_NOT_REQUIRE_CREW",
    });
    expect(assignedCrew(effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      POUR,
    );
    expect(effective.applied).toEqual([]);
  });

  it("rejects when origin and target are the same task", () => {
    const { results } = applyOperationalEffects(snapshotWithTargets(), [
      crewEffect({ targetTaskId: POUR }),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "ORIGIN_EQUALS_TARGET",
    });
  });

  it("rejects an off_site crew as an impossible assignment", () => {
    const baseline = snapshotWithTargets();
    const snapshot: ProjectSnapshot = {
      ...baseline,
      crews: baseline.crews.map((c) =>
        c.id === CONCRETE_CREW
          ? { ...c, status: "off_site" as const, currentTaskId: null }
          : c,
      ),
    };
    const { results, effective } = applyOperationalEffects(snapshot, [
      crewEffect(),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "CREW_NOT_ASSIGNABLE",
    });
    expect(effective.applied).toEqual([]);
  });

  it("rejects an effect with empty identity fields", () => {
    const { results } = applyOperationalEffects(snapshotWithTargets(), [
      crewEffect({ id: "   " }),
    ]);
    expect(results[0]).toMatchObject({
      outcome: "Rejected",
      code: "INVALID_EFFECT_IDENTITY",
    });
  });
});

describe("idempotency", () => {
  it("applies a duplicate effect id only once", () => {
    const snapshot = snapshotWithTargets();
    const effect = crewEffect();
    const batch = applyOperationalEffects(snapshot, [effect, effect]);
    expect(batch.results.map((r) => r.outcome)).toEqual([
      "Applied",
      "AlreadyApplied",
    ]);
    expect(batch.effective.applied).toHaveLength(1);
    expect(assignedCrew(batch.effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
  });

  it("AlreadyApplied does not change effective state", () => {
    const snapshot = snapshotWithTargets();
    const effect = crewEffect();
    const first = applyOperationalEffects(snapshot, [effect]);
    const before = JSON.stringify(first.effective.snapshot);
    const historyBefore = JSON.stringify(first.effective.applied);

    const second = applyOperationalEffect(first.effective, effect);
    expect(second.result.outcome).toBe("AlreadyApplied");
    expect(second.effective).toBe(first.effective);
    expect(JSON.stringify(second.effective.snapshot)).toBe(before);
    expect(JSON.stringify(second.effective.applied)).toBe(historyBefore);
  });
});

describe("multiple effects and conflicts", () => {
  it("applies multiple valid non-conflicting effects deterministically", () => {
    const snapshot = snapshotWithTargets();
    const concrete = crewEffect();
    const electrical = crewEffect({
      id: "effect-decision-elec-CrewAssignmentChanged",
      decisionId: "decision-elec",
      crewId: ELECTRICAL_CREW,
      originTaskId: ELECTRICAL_ROUGH,
      targetTaskId: TARGET_ELEC,
    });

    const { effective, results } = applyOperationalEffects(snapshot, [
      concrete,
      electrical,
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["Applied", "Applied"]);
    expect(assignedCrew(effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
    expect(assignedCrew(effective.snapshot, ELECTRICAL_CREW)?.currentTaskId).toBe(
      TARGET_ELEC,
    );
    expect(effective.applied.map((r) => r.effectId)).toEqual([
      concrete.id,
      electrical.id,
    ]);
  });

  it("rejects a later conflicting assignment rather than overwriting", () => {
    const snapshot = snapshotWithTargets();
    const first = crewEffect();
    const conflict = crewEffect({
      id: "effect-decision-conflict-CrewAssignmentChanged",
      decisionId: "decision-conflict",
      targetTaskId: TARGET_B,
    });

    const { effective, results } = applyOperationalEffects(snapshot, [
      first,
      conflict,
    ]);
    expect(results[0].outcome).toBe("Applied");
    expect(results[1]).toMatchObject({
      outcome: "Rejected",
      code: "ASSIGNMENT_CONFLICT",
    });
    expect(assignedCrew(effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
    expect(effective.applied).toHaveLength(1);
    expect(effective.applied[0].effectId).toBe(first.id);
  });

  it("does not partially mutate state when a later effect is rejected", () => {
    const snapshot = snapshotWithTargets();
    const valid = crewEffect();
    const invalid = crewEffect({
      id: "effect-decision-invalid-CrewAssignmentChanged",
      decisionId: "decision-invalid",
      crewId: ELECTRICAL_CREW,
      originTaskId: ELECTRICAL_ROUGH,
      targetTaskId: TARGET_A,
    });

    const { effective, results } = applyOperationalEffects(snapshot, [
      valid,
      invalid,
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["Applied", "Rejected"]);
    expect(assignedCrew(effective.snapshot, ELECTRICAL_CREW)?.currentTaskId).toBeNull();
    expect(assignedCrew(effective.snapshot, CONCRETE_CREW)?.currentTaskId).toBe(
      TARGET_A,
    );
    expect(effective.applied).toHaveLength(1);
  });
});

describe("application history", () => {
  it("contains only successfully applied effects", () => {
    const snapshot = snapshotWithTargets();
    const applied = crewEffect();
    const rejected = crewEffect({
      id: "effect-decision-missing-CrewAssignmentChanged",
      decisionId: "decision-missing",
      targetTaskId: "task-does-not-exist",
    });
    const replayed = applied;

    const { effective, results } = applyOperationalEffects(snapshot, [
      applied,
      rejected,
      replayed,
    ]);
    expect(results.map((r) => r.outcome)).toEqual([
      "Applied",
      "Rejected",
      "AlreadyApplied",
    ]);
    expect(effective.applied).toHaveLength(1);
    expect(effective.applied[0].effectId).toBe(applied.id);
  });

  it("preserves effect identity and simulated timestamp", () => {
    const effect = crewEffect();
    const { effective, results } = applyOperationalEffects(snapshotWithTargets(), [
      effect,
    ]);
    expect(results[0].outcome).toBe("Applied");
    if (results[0].outcome !== "Applied") return;
    expect(effective.applied[0]).toMatchObject({
      effectId: effect.id,
      effectType: "CrewAssignmentChanged",
      decisionId: effect.decisionId,
      entityId: CONCRETE_CREW,
      simulatedAt: T_VERIFY,
    });
    expect(results[0].record.simulatedAt).toBe(effect.simulatedAt);
    expect(results[0].record.effectId).toBe(effect.id);
  });
});

describe("purity and determinism", () => {
  it("produces deep-equal output for the same inputs", () => {
    const snapshot = snapshotWithTargets();
    const effects = [
      crewEffect(),
      crewEffect({
        id: "effect-decision-elec-CrewAssignmentChanged",
        decisionId: "decision-elec",
        crewId: ELECTRICAL_CREW,
        originTaskId: ELECTRICAL_ROUGH,
        targetTaskId: TARGET_ELEC,
      }),
    ];
    expect(applyOperationalEffects(snapshot, effects)).toEqual(
      applyOperationalEffects(snapshot, effects),
    );
  });

  it("does not require the Recommendation Engine or reasoning pipeline", () => {
    const snapshot = snapshotWithTargets();
    const effect = crewEffect();
    const { results } = applyOperationalEffects(snapshot, [effect]);
    expect(results[0].outcome).toBe("Applied");
  });
});
