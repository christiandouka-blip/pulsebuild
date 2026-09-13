import { issue } from "@/domain/import/issues";
import type { ImportIssue, NormalizedProjectImport } from "@/domain/import/types";
import { isValidIanaTimeZone } from "@/domain/validation/validateProjectSnapshot";

export function validateNormalizedImport(
  staging: NormalizedProjectImport,
  selectedCurrentPhaseExternalId?: string | null,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const project = staging.project;

  if (!isValidIanaTimeZone(project.timezone)) {
    issues.push(
      issue({
        code: "project.timezone_invalid",
        entityType: "project",
        field: "timezone",
        rawValue: project.timezone,
        message: "Project timezone is not a valid IANA time zone.",
      }),
    );
  }

  if (project.startDate && project.targetDate) {
    if (Date.parse(project.startDate) > Date.parse(project.targetDate)) {
      issues.push(
        issue({
          code: "project.date_order",
          entityType: "project",
          message: "Project start is after target date.",
        }),
      );
    }
  }

  duplicateExternalIds(staging.phases, "phase", issues);
  duplicateExternalIds(staging.tasks, "task", issues);
  duplicateExternalIds(staging.crews, "crew", issues);
  duplicateExternalIds(staging.materials, "material", issues);
  duplicateExternalIds(staging.equipment, "equipment", issues);
  duplicateExternalIds(staging.inspections, "inspection", issues);
  duplicateExternalIds(staging.permits, "permit", issues);

  const phaseIds = new Set(staging.phases.map((item) => item.externalId));
  const taskIds = new Set(staging.tasks.map((item) => item.externalId));
  const crewIds = new Set(staging.crews.map((item) => item.externalId));
  const materialIds = new Set(staging.materials.map((item) => item.externalId));
  const equipmentIds = new Set(staging.equipment.map((item) => item.externalId));

  for (const phase of staging.phases) {
    if (Date.parse(phase.plannedStart) > Date.parse(phase.plannedEnd)) {
      issues.push(
        issue({
          code: "phase.date_order",
          entityType: "phase",
          sheet: phase.sheet,
          row: phase.row,
          message: "Phase start is after end.",
        }),
      );
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const task of staging.tasks) {
    if (!phaseIds.has(task.phaseExternalId)) {
      issues.push(
        issue({
          code: "task.phase_missing",
          entityType: "task",
          sheet: task.sheet,
          row: task.row,
          field: "phase_id",
          rawValue: task.phaseExternalId,
          message: "Task phase does not exist in the import.",
        }),
      );
    }
    if (Date.parse(task.plannedStart) > Date.parse(task.plannedEnd)) {
      issues.push(
        issue({
          code: "task.date_order",
          entityType: "task",
          sheet: task.sheet,
          row: task.row,
          message: "Task planned start is after planned end.",
        }),
      );
    }
    for (const dep of task.dependencyExternalIds) {
      if (dep === task.externalId) {
        issues.push(
          issue({
            code: "task.self_dependency",
            entityType: "task",
            sheet: task.sheet,
            row: task.row,
            field: "dependency_ids",
            rawValue: dep,
            message: "A task cannot depend on itself.",
          }),
        );
      } else if (!taskIds.has(dep)) {
        issues.push(
          issue({
            code: "task.dependency_missing",
            entityType: "task",
            sheet: task.sheet,
            row: task.row,
            field: "dependency_ids",
            rawValue: dep,
            message: "Dependency target was not found in the import.",
          }),
        );
      }
    }
    adjacency.set(task.externalId, [...task.dependencyExternalIds]);
    requireIds(task.requiredCrewExternalIds, crewIds, issues, task, "required_crew_ids", "crew");
    requireIds(
      task.requiredMaterialExternalIds,
      materialIds,
      issues,
      task,
      "required_material_ids",
      "material",
    );
    requireIds(
      task.requiredEquipmentExternalIds,
      equipmentIds,
      issues,
      task,
      "required_equipment_ids",
      "equipment",
    );
  }

  if (hasCycle(adjacency)) {
    issues.push(
      issue({
        code: "task.dependency_cycle",
        entityType: "task",
        message: "Task dependency graph contains a cycle.",
      }),
    );
  }

  for (const crew of staging.crews) {
    if (crew.currentTaskExternalId && !taskIds.has(crew.currentTaskExternalId)) {
      issues.push(
        issue({
          code: "crew.assignment_missing",
          entityType: "crew",
          sheet: crew.sheet,
          row: crew.row,
          field: "current_task_id",
          rawValue: crew.currentTaskExternalId,
          message: "Crew assignment target was not found in the import.",
        }),
      );
    }
  }

  for (const item of staging.equipment) {
    if (item.assignedTaskExternalId && !taskIds.has(item.assignedTaskExternalId)) {
      issues.push(
        issue({
          code: "equipment.allocation_missing",
          entityType: "equipment",
          sheet: item.sheet,
          row: item.row,
          field: "assigned_task_id",
          rawValue: item.assignedTaskExternalId,
          message: "Equipment allocation target was not found in the import.",
        }),
      );
    }
  }

  for (const inspection of staging.inspections) {
    if (!taskIds.has(inspection.requiredBeforeTaskExternalId)) {
      issues.push(
        issue({
          code: "inspection.task_missing",
          entityType: "inspection",
          sheet: inspection.sheet,
          row: inspection.row,
          field: "required_before_task_id",
          rawValue: inspection.requiredBeforeTaskExternalId,
          message: "Inspection gating task was not found in the import.",
        }),
      );
    }
  }

  for (const permit of staging.permits) {
    if (!taskIds.has(permit.requiredForTaskExternalId)) {
      issues.push(
        issue({
          code: "permit.task_missing",
          entityType: "permit",
          sheet: permit.sheet,
          row: permit.row,
          field: "required_for_task_id",
          rawValue: permit.requiredForTaskExternalId,
          message: "Permit target task was not found in the import.",
        }),
      );
    }
  }

  const currentPhase =
    selectedCurrentPhaseExternalId?.trim() ||
    project.currentPhaseExternalId?.trim() ||
    "";
  if (!currentPhase) {
    issues.push(
      issue({
        code: "project.current_phase_required",
        entityType: "project",
        field: "current_phase_id",
        message: "Select the current phase before confirming the import.",
        suggestedResolution: "Choose a phase from the import preview.",
      }),
    );
  } else if (!phaseIds.has(currentPhase)) {
    issues.push(
      issue({
        code: "project.current_phase_missing",
        entityType: "project",
        field: "current_phase_id",
        rawValue: currentPhase,
        message: "Current phase is not one of the imported phases.",
      }),
    );
  }

  if (!project.targetDate && staging.phases.length > 0) {
    const ends = staging.phases
      .map((phase) => Date.parse(phase.plannedEnd))
      .filter((value) => !Number.isNaN(value));
    if (ends.length === 0) {
      issues.push(
        issue({
          code: "project.target_date_required",
          entityType: "project",
          field: "target_date",
          message: "Project target date could not be derived from phase dates.",
        }),
      );
    }
  }

  return issues;
}

function duplicateExternalIds(
  rows: Array<{ externalId: string; sheet: string; row: number }>,
  entityType: ImportIssue["entityType"],
  issues: ImportIssue[],
): void {
  const seen = new Map<string, { sheet: string; row: number }>();
  for (const row of rows) {
    const previous = seen.get(row.externalId);
    if (previous) {
      issues.push(
        issue({
          code: `${entityType}.duplicate_external_id`,
          entityType,
          sheet: row.sheet,
          row: row.row,
          field: "id",
          rawValue: row.externalId,
          message: `Duplicate external id already used on row ${previous.row}.`,
        }),
      );
    } else {
      seen.set(row.externalId, { sheet: row.sheet, row: row.row });
    }
  }
}

function requireIds(
  values: string[],
  known: Set<string>,
  issues: ImportIssue[],
  task: { sheet: string; row: number },
  field: string,
  kind: string,
): void {
  for (const value of values) {
    if (!known.has(value)) {
      issues.push(
        issue({
          code: `task.${field}_missing`,
          entityType: "task",
          sheet: task.sheet,
          row: task.row,
          field,
          rawValue: value,
          message: `Required ${kind} was not found in the import.`,
        }),
      );
    }
  }
}

function hasCycle(adjacency: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const id of adjacency.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}
