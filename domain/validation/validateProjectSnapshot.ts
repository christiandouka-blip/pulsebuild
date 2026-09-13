import type { ProjectSnapshot } from "@/domain/types/snapshot";
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

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Generic construction-domain integrity for any legitimate PulseBuild project.
 * Harbor Point demo invariants live in validateHarborPointSeedSnapshot.
 */
export function validateProjectSnapshot(
  snapshot: ProjectSnapshot,
): ValidationResult {
  const errors: string[] = [];

  const taskIds = new Set(snapshot.tasks.map((t) => t.id));
  const crewIds = new Set(snapshot.crews.map((c) => c.id));
  const materialIds = new Set(snapshot.materials.map((m) => m.id));
  const equipmentIds = new Set(snapshot.equipment.map((e) => e.id));
  const evidenceIds = new Set(snapshot.evidence.map((e) => e.id));
  const projectId = snapshot.project.id;

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

  if (!isValidIanaTimeZone(snapshot.project.timezone)) {
    errors.push(
      `Project timezone is not a valid IANA time zone: ${snapshot.project.timezone}`,
    );
  }

  requireParseableInstant(
    "Project currentSimulatedAt",
    snapshot.project.currentSimulatedAt,
    errors,
  );
  requireChronology(
    "Project",
    snapshot.project.startDate,
    snapshot.project.targetDate,
    errors,
  );

  const currentPhase = snapshot.phases.find(
    (phase) => phase.id === snapshot.project.currentPhaseId,
  );
  if (!currentPhase) {
    errors.push(
      `Project currentPhaseId ${snapshot.project.currentPhaseId} not found`,
    );
  } else if (currentPhase.projectId !== projectId) {
    errors.push(
      `Project currentPhaseId ${snapshot.project.currentPhaseId} belongs to a different project`,
    );
  }

  for (const phase of snapshot.phases) {
    if (phase.projectId !== projectId) {
      errors.push(
        `Phase ${phase.id} projectId ${phase.projectId} does not match project ${projectId}`,
      );
    }
    requireChronology(`Phase ${phase.id}`, phase.plannedStart, phase.plannedEnd, errors);
  }

  for (const task of snapshot.tasks) {
    if (task.projectId !== projectId) {
      errors.push(
        `Task ${task.id} projectId ${task.projectId} does not match project ${projectId}`,
      );
    }
    const phase = snapshot.phases.find((item) => item.id === task.phaseId);
    if (!phase) {
      errors.push(`Task ${task.id} references invalid phase ${task.phaseId}`);
    } else if (phase.projectId !== projectId) {
      errors.push(
        `Task ${task.id} phase ${task.phaseId} belongs to a different project`,
      );
    }
    if (!CANONICAL_TASK_STATES.includes(task.status)) {
      errors.push(`Task ${task.id} has non-canonical status ${task.status}`);
    }
    requireChronology(`Task ${task.id} planned`, task.plannedStart, task.plannedEnd, errors);
    if (task.actualStart !== undefined && task.actualEnd !== undefined) {
      requireChronology(
        `Task ${task.id} actual`,
        task.actualStart,
        task.actualEnd,
        errors,
      );
    } else {
      if (task.actualStart !== undefined) {
        requireParseableInstant(
          `Task ${task.id} actualStart`,
          task.actualStart,
          errors,
        );
      }
      if (task.actualEnd !== undefined) {
        requireParseableInstant(
          `Task ${task.id} actualEnd`,
          task.actualEnd,
          errors,
        );
      }
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

  // Snapshot starting-state integrity: Ready must not have an incomplete
  // predecessor. Not a Dependency Engine and performs no dynamic transition.
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
    if (equipment.availableFrom !== undefined) {
      requireParseableInstant(
        `Equipment ${equipment.id} availableFrom`,
        equipment.availableFrom,
        errors,
      );
    }
  }

  for (const inspection of snapshot.inspections) {
    if (!taskIds.has(inspection.requiredBeforeTaskId)) {
      errors.push(
        `Inspection ${inspection.id} requiredBeforeTaskId ${inspection.requiredBeforeTaskId} not found`,
      );
    }
    if (inspection.scheduledTime !== undefined) {
      requireParseableInstant(
        `Inspection ${inspection.id} scheduledTime`,
        inspection.scheduledTime,
        errors,
      );
    }
  }

  for (const permit of snapshot.permits) {
    if (!taskIds.has(permit.requiredForTaskId)) {
      errors.push(
        `Permit ${permit.id} requiredForTaskId ${permit.requiredForTaskId} not found`,
      );
    }
    if (permit.expirationDate !== undefined) {
      requireParseableInstant(
        `Permit ${permit.id} expirationDate`,
        permit.expirationDate,
        errors,
      );
    }
  }

  for (const weather of snapshot.weather) {
    if (weather.projectId !== projectId) {
      errors.push(
        `Weather ${weather.id} projectId ${weather.projectId} does not match project ${projectId}`,
      );
    }
    requireParseableInstant(`Weather ${weather.id} timestamp`, weather.timestamp, errors);
    requireChronology(`Weather ${weather.id}`, weather.startTime, weather.endTime, errors);
  }

  for (const item of snapshot.evidence) {
    requireParseableInstant(`Evidence ${item.id} timestamp`, item.timestamp, errors);
    if (!entityExists(snapshot, item.relatedEntityType, item.relatedEntityId)) {
      errors.push(
        `Evidence ${item.id} references missing ${item.relatedEntityType}:${item.relatedEntityId}`,
      );
    }
  }

  const sequenceOrders = new Set<number>();
  for (const fixture of snapshot.scenarioFixtures) {
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

  return { ok: errors.length === 0, errors };
}

/**
 * Minimum IANA check using the runtime Intl API. No timezone package.
 * Uses a fixed instant so validation never reads the system clock.
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.trim() !== timeZone) {
    return false;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return true;
  } catch {
    return false;
  }
}

function requireParseableInstant(
  label: string,
  value: string,
  errors: string[],
): number | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    errors.push(`${label} is not a valid timestamp: ${value}`);
    return null;
  }
  return ms;
}

function requireChronology(
  label: string,
  start: string,
  end: string,
  errors: string[],
): void {
  const startMs = requireParseableInstant(`${label} start`, start, errors);
  const endMs = requireParseableInstant(`${label} end`, end, errors);
  if (startMs !== null && endMs !== null && startMs > endMs) {
    errors.push(`${label} start is after end`);
  }
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
