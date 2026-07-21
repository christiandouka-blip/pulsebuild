import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { SignalType } from "@/domain/types/signal";
import type { TaskState } from "@/domain/types/task";

const CANONICAL_TASK_STATES: TaskState[] = [
  "Planned",
  "Ready",
  "Waiting",
  "Blocked",
  "Executing",
  "Paused",
  "Completed",
  "Verified",
  "Closed",
];

/** Seeded terminal-complete states used only for baseline prerequisite validation. */
const COMPLETE_TASK_STATES: TaskState[] = ["Completed", "Verified", "Closed"];

const APPROVED_FIXTURE_IDS = new Set([
  "fixture-weather-alert",
  "fixture-material-delay",
  "fixture-inspection-missing",
  "fixture-delivery-received",
  "fixture-task-complete",
]);

const APPROVED_FIXTURE_SIGNAL_TYPES: Record<string, SignalType> = {
  "fixture-weather-alert": "WeatherAlert",
  "fixture-material-delay": "MaterialDeliveryDelayed",
  "fixture-inspection-missing": "InspectionMissing",
  "fixture-delivery-received": "DeliveryReceived",
  "fixture-task-complete": "TaskComplete",
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateProjectSnapshot(
  snapshot: ProjectSnapshot,
): ValidationResult {
  const errors: string[] = [];

  const taskIds = new Set(snapshot.tasks.map((t) => t.id));
  const crewIds = new Set(snapshot.crews.map((c) => c.id));
  const materialIds = new Set(snapshot.materials.map((m) => m.id));
  const equipmentIds = new Set(snapshot.equipment.map((e) => e.id));
  const evidenceIds = new Set(snapshot.evidence.map((e) => e.id));
  const phaseIds = new Set(snapshot.phases.map((p) => p.id));

  const allIds: string[] = [
    snapshot.project.id,
    ...snapshot.phases.map((p) => p.id),
    ...snapshot.tasks.map((t) => t.id),
    ...snapshot.crews.map((c) => c.id),
    ...snapshot.materials.map((m) => m.id),
    ...snapshot.equipment.map((e) => e.id),
    ...snapshot.inspections.map((i) => i.id),
    ...snapshot.permits.map((p) => p.id),
    ...snapshot.weather.map((w) => w.id),
    ...snapshot.evidence.map((e) => e.id),
    ...snapshot.scenarioFixtures.map((f) => f.id),
  ];

  const idCounts = new Map<string, number>();
  for (const id of allIds) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push(`Duplicate ID: ${id}`);
    }
  }

  if (snapshot.project.currentPhaseId !== undefined) {
    if (!phaseIds.has(snapshot.project.currentPhaseId)) {
      errors.push(
        `Project currentPhaseId ${snapshot.project.currentPhaseId} not found`,
      );
    }
  }

  if (snapshot.project.currentSimulatedAt !== "2026-03-14T06:30:00-04:00") {
    errors.push(
      `Project currentSimulatedAt must be 2026-03-14T06:30:00-04:00, got ${snapshot.project.currentSimulatedAt}`,
    );
  }

  const criticalPathCount = snapshot.tasks.filter((t) => t.isCriticalPath).length;
  if (criticalPathCount < 3) {
    errors.push(
      `At least three critical-path tasks required, found ${criticalPathCount}`,
    );
  }

  const pourTask = snapshot.tasks.find((t) => t.id === "task-pour-level-1-slab");
  if (!pourTask || pourTask.status !== "Ready") {
    errors.push("task-pour-level-1-slab must exist with status Ready");
  }

  const slabInspection = snapshot.inspections.find(
    (i) => i.id === "insp-slab-pre-pour",
  );
  if (
    !slabInspection ||
    slabInspection.scheduledTime !== "2026-03-14T07:00:00-04:00"
  ) {
    errors.push(
      "insp-slab-pre-pour must be scheduled for 2026-03-14T07:00:00-04:00",
    );
  }

  for (const task of snapshot.tasks) {
    if (!phaseIds.has(task.phaseId)) {
      errors.push(`Task ${task.id} references invalid phase ${task.phaseId}`);
    }
    if (!CANONICAL_TASK_STATES.includes(task.status)) {
      errors.push(`Task ${task.id} has non-canonical status ${task.status}`);
    }
    for (const depId of task.dependencyTaskIds) {
      if (!taskIds.has(depId)) {
        errors.push(`Task ${task.id} dependency ${depId} not found`);
      }
      if (depId === task.id) {
        errors.push(`Task ${task.id} depends on itself`);
      }
    }
    for (const crewId of task.requiredCrewIds) {
      if (!crewIds.has(crewId)) {
        errors.push(`Task ${task.id} required crew ${crewId} not found`);
      }
    }
    for (const materialId of task.requiredMaterialIds) {
      if (!materialIds.has(materialId)) {
        errors.push(
          `Task ${task.id} required material ${materialId} not found`,
        );
      }
    }
    for (const equipmentId of task.requiredEquipmentIds) {
      if (!equipmentIds.has(equipmentId)) {
        errors.push(
          `Task ${task.id} required equipment ${equipmentId} not found`,
        );
      }
    }
  }

  if (hasCycle(snapshot.tasks)) {
    errors.push("Task dependency graph contains a cycle");
  }

  // Baseline prerequisite rule: a task seeded as Ready must not have an
  // incomplete predecessor at the canonical starting state. This inspects
  // seeded task states only — it is NOT a Dependency Engine and performs no
  // dynamic transition calculation.
  const taskStatusById = new Map(
    snapshot.tasks.map((t) => [t.id, t.status]),
  );
  for (const task of snapshot.tasks) {
    if (task.status !== "Ready") continue;
    for (const depId of task.dependencyTaskIds) {
      const depStatus = taskStatusById.get(depId);
      if (depStatus !== undefined && !COMPLETE_TASK_STATES.includes(depStatus)) {
        errors.push(
          `Task ${task.id} is seeded Ready but predecessor ${depId} is incomplete (${depStatus})`,
        );
      }
    }
  }

  for (const crew of snapshot.crews) {
    if (crew.currentTaskId !== null && !taskIds.has(crew.currentTaskId)) {
      errors.push(
        `Crew ${crew.id} currentTaskId ${crew.currentTaskId} not found`,
      );
    }
  }

  for (const equipment of snapshot.equipment) {
    if (
      equipment.assignedTaskId !== null &&
      !taskIds.has(equipment.assignedTaskId)
    ) {
      errors.push(
        `Equipment ${equipment.id} assignedTaskId ${equipment.assignedTaskId} not found`,
      );
    }
  }

  for (const inspection of snapshot.inspections) {
    if (!taskIds.has(inspection.requiredBeforeTaskId)) {
      errors.push(
        `Inspection ${inspection.id} requiredBeforeTaskId ${inspection.requiredBeforeTaskId} not found`,
      );
    }
  }

  for (const permit of snapshot.permits) {
    if (!taskIds.has(permit.requiredForTaskId)) {
      errors.push(
        `Permit ${permit.id} requiredForTaskId ${permit.requiredForTaskId} not found`,
      );
    }
  }

  for (const item of snapshot.evidence) {
    if (!entityExists(snapshot, item.relatedEntityType, item.relatedEntityId)) {
      errors.push(
        `Evidence ${item.id} references missing ${item.relatedEntityType}:${item.relatedEntityId}`,
      );
    }
  }

  if (snapshot.scenarioFixtures.length !== 5) {
    errors.push(
      `Exactly five scenario fixtures required, found ${snapshot.scenarioFixtures.length}`,
    );
  }

  const sequenceOrders = new Set<number>();
  for (const fixture of snapshot.scenarioFixtures) {
    if (!APPROVED_FIXTURE_IDS.has(fixture.id)) {
      errors.push(`Unauthorized scenario fixture id: ${fixture.id}`);
    }
    const expectedSignalType = APPROVED_FIXTURE_SIGNAL_TYPES[fixture.id];
    if (
      expectedSignalType !== undefined &&
      fixture.signalType !== expectedSignalType
    ) {
      errors.push(
        `Fixture ${fixture.id} signalType must be ${expectedSignalType}, got ${fixture.signalType}`,
      );
    }
    if (sequenceOrders.has(fixture.sequenceOrder)) {
      errors.push(`Duplicate scenario fixture sequenceOrder ${fixture.sequenceOrder}`);
    }
    sequenceOrders.add(fixture.sequenceOrder);

    if (!entityExists(snapshot, fixture.relatedEntityType, fixture.relatedEntityId)) {
      errors.push(
        `Fixture ${fixture.id} related entity ${fixture.relatedEntityType}:${fixture.relatedEntityId} not found`,
      );
    }
    if (!taskIds.has(fixture.relatedTaskId)) {
      errors.push(
        `Fixture ${fixture.id} relatedTaskId ${fixture.relatedTaskId} not found`,
      );
    }
    for (const evidenceId of fixture.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(
          `Fixture ${fixture.id} evidenceId ${evidenceId} not found`,
        );
      }
    }
  }

  const disruptiveRain = snapshot.weather.some(
    (w) =>
      w.condition.toLowerCase().includes("rain") &&
      w.severity !== "low" &&
      w.id !== "wx-baseline-clear",
  );
  if (disruptiveRain) {
    errors.push("Disruptive rain must not exist as baseline weather");
  }

  return { ok: errors.length === 0, errors };
}

function entityExists(
  snapshot: ProjectSnapshot,
  entityType: string,
  entityId: string,
): boolean {
  switch (entityType) {
    case "project":
      return snapshot.project.id === entityId;
    case "phase":
      return snapshot.phases.some((p) => p.id === entityId);
    case "task":
      return snapshot.tasks.some((t) => t.id === entityId);
    case "crew":
      return snapshot.crews.some((c) => c.id === entityId);
    case "material":
      return snapshot.materials.some((m) => m.id === entityId);
    case "equipment":
      return snapshot.equipment.some((e) => e.id === entityId);
    case "inspection":
      return snapshot.inspections.some((i) => i.id === entityId);
    case "permit":
      return snapshot.permits.some((p) => p.id === entityId);
    case "weather":
      return snapshot.weather.some((w) => w.id === entityId);
    default:
      return false;
  }
}

function hasCycle(tasks: ProjectSnapshot["tasks"]): boolean {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(taskId: string): boolean {
    if (visiting.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visiting.add(taskId);
    const task = taskMap.get(taskId);
    if (task) {
      for (const depId of task.dependencyTaskIds) {
        if (dfs(depId)) return true;
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) return true;
  }
  return false;
}
