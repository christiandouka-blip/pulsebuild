import { normalizeImportDate } from "@/domain/import/dates";
import {
  normalizeCrewStatus,
  normalizeDeliveryStatus,
  normalizeEquipmentStatus,
  normalizeInspectionStatus,
  normalizePermitStatus,
  normalizePhaseStatus,
  normalizeWeatherSeverity,
} from "@/domain/import/enumMaps";
import {
  canonicalHeader,
  canonicalSheetName,
  parseBooleanFlag,
  splitIdList,
} from "@/domain/import/headers";
import { issue } from "@/domain/import/issues";
import { normalizeTaskState } from "@/domain/import/taskStateMap";
import { normalizeTaskType } from "@/domain/import/taskTypeMap";
import type {
  ImportIssue,
  NormalizedCrew,
  NormalizedEquipment,
  NormalizedInspection,
  NormalizedMaterial,
  NormalizedPermit,
  NormalizedPhase,
  NormalizedProjectImport,
  NormalizedTask,
  NormalizedWeather,
  ProjectSetupInput,
} from "@/domain/import/types";
import type { SheetMatrix } from "@/lib/import/parseCsv";

type HeaderIndex = Map<string, number>;

export function normalizeWorkbook(input: {
  sheets: SheetMatrix[];
  setup: ProjectSetupInput;
}): { staging: NormalizedProjectImport; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const grouped = new Map<string, SheetMatrix>();

  for (const sheet of input.sheets) {
    const canonical = canonicalSheetName(sheet.sheet);
    if (!canonical) {
      issues.push(
        issue({
          severity: "Warning",
          code: "sheet.unmapped",
          entityType: "mapping",
          sheet: sheet.sheet,
          message: `Sheet "${sheet.sheet}" is not part of the PulseBuild template and was ignored.`,
        }),
      );
      continue;
    }
    grouped.set(canonical, sheet);
  }

  const project = normalizeProject(
    grouped.get("Project"),
    input.setup,
    issues,
  );

  const phases = grouped.get("Phases")
    ? readPhases(grouped.get("Phases")!, project.timezone, issues)
    : [];
  const tasks = grouped.get("Tasks")
    ? readTasks(grouped.get("Tasks")!, project.timezone, issues)
    : [];
  const crews = grouped.get("Crews")
    ? readCrews(grouped.get("Crews")!, issues)
    : [];
  const materials = grouped.get("Materials")
    ? readMaterials(grouped.get("Materials")!, project.timezone, issues)
    : [];
  const equipment = grouped.get("Equipment")
    ? readEquipment(grouped.get("Equipment")!, project.timezone, issues)
    : [];
  const inspections = grouped.get("Inspections")
    ? readInspections(grouped.get("Inspections")!, project.timezone, issues)
    : [];
  const permits = grouped.get("Permits")
    ? readPermits(grouped.get("Permits")!, project.timezone, issues)
    : [];
  const weather = grouped.get("Weather")
    ? readWeather(grouped.get("Weather")!, project.timezone, issues)
    : [];

  if (phases.length === 0 && tasks.length > 0) {
    phases.push(...inferPhasesFromTasks(tasks, issues));
  }

  if (tasks.length === 0) {
    issues.push(
      issue({
        code: "tasks.required",
        entityType: "task",
        message: "At least one task row is required.",
      }),
    );
  }

  return {
    staging: {
      project,
      phases,
      tasks,
      crews,
      materials,
      equipment,
      inspections,
      permits,
      weather,
    },
    issues,
  };
}

function normalizeProject(
  sheet: SheetMatrix | undefined,
  setup: ProjectSetupInput,
  issues: ImportIssue[],
): NormalizedProjectImport["project"] {
  const row = sheet ? firstDataRow(sheet, issues) : null;
  const fromSheet = row?.record ?? {};

  const name = setup.name.trim() || String(fromSheet.name ?? "").trim();
  const timezone = setup.timezone.trim() || String(fromSheet.timezone ?? "").trim();
  const startRaw = setup.startDate.trim() || String(fromSheet.start_date ?? "");
  const location =
    (setup.location ?? "").trim() || String(fromSheet.location ?? "").trim();
  const targetRaw = (setup.targetDate ?? "").trim() || String(fromSheet.target_date ?? "");
  const currentPhase =
    (setup.currentPhaseExternalId ?? "").trim() ||
    String(fromSheet.current_phase_id ?? "").trim();

  if (!name) {
    issues.push(
      issue({
        code: "project.name_required",
        entityType: "project",
        field: "name",
        message: "Project name is required.",
      }),
    );
  }
  if (!timezone) {
    issues.push(
      issue({
        code: "project.timezone_required",
        entityType: "project",
        field: "timezone",
        message: "Project timezone is required.",
      }),
    );
  }

  const start = requireDate(startRaw, timezone, issues, {
    entityType: "project",
    field: "start_date",
    required: true,
  });
  const target = targetRaw
    ? requireDate(targetRaw, timezone, issues, {
        entityType: "project",
        field: "target_date",
        required: false,
      })
    : undefined;

  return {
    externalId: String(fromSheet.id ?? "").trim() || undefined,
    name,
    timezone,
    startDate: start ?? startRaw,
    targetDate: target,
    location,
    status: "active",
    currentPhaseExternalId: currentPhase || undefined,
  };
}

function readPhases(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedPhase[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "phase", sheet.sheet, row);
    const name = requiredString(record, "name", issues, "phase", sheet.sheet, row);
    const statusRaw = normalizePhaseStatus(record.status);
    if ("unknown" in statusRaw) {
      issues.push(
        issue({
          code: "phase.status_unknown",
          entityType: "phase",
          sheet: sheet.sheet,
          row,
          field: "status",
          message: "Phase status is not a recognized value.",
          rawValue: record.status,
          suggestedResolution: "Use planned, active, or completed.",
        }),
      );
    }
    const plannedStart =
      requireDate(record.planned_start, timeZone, issues, {
        entityType: "phase",
        sheet: sheet.sheet,
        row,
        field: "planned_start",
        required: true,
      }) ?? "";
    const plannedEnd =
      requireDate(record.planned_end, timeZone, issues, {
        entityType: "phase",
        sheet: sheet.sheet,
        row,
        field: "planned_end",
        required: true,
      }) ?? "";
    if (!externalId || !name || "unknown" in statusRaw) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        name,
        plannedStart,
        plannedEnd,
        status: statusRaw.value,
      },
    ];
  });
}

function readTasks(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedTask[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "task", sheet.sheet, row);
    const name = requiredString(record, "name", issues, "task", sheet.sheet, row);
    const phaseExternalId = requiredString(
      record,
      "phase_id",
      issues,
      "task",
      sheet.sheet,
      row,
    );
    const state = normalizeTaskState(record.status);
    if ("unknown" in state) {
      issues.push(
        issue({
          code: "task.status_unknown",
          entityType: "task",
          sheet: sheet.sheet,
          row,
          field: "status",
          message: "Task status is not mapped to a canonical TaskState.",
          rawValue: record.status,
          suggestedResolution:
            "Use Planned, Ready, Waiting, Blocked, Executing, Paused, Completed, Verified, or Closed.",
        }),
      );
    }
    const type = normalizeTaskType(record.task_type);
    if ("unknown" in type) {
      issues.push(
        issue({
          code: "task.type_unknown",
          entityType: "task",
          sheet: sheet.sheet,
          row,
          field: "task_type",
          message: "Task type is not mapped to a canonical TaskType.",
          rawValue: record.task_type,
        }),
      );
    }
    const plannedStart =
      requireDate(record.planned_start, timeZone, issues, {
        entityType: "task",
        sheet: sheet.sheet,
        row,
        field: "planned_start",
        required: true,
      }) ?? "";
    const plannedEnd =
      requireDate(record.planned_end, timeZone, issues, {
        entityType: "task",
        sheet: sheet.sheet,
        row,
        field: "planned_end",
        required: true,
      }) ?? "";
    const actualStart = record.actual_start
      ? requireDate(record.actual_start, timeZone, issues, {
          entityType: "task",
          sheet: sheet.sheet,
          row,
          field: "actual_start",
          required: false,
        })
      : undefined;
    const actualEnd = record.actual_end
      ? requireDate(record.actual_end, timeZone, issues, {
          entityType: "task",
          sheet: sheet.sheet,
          row,
          field: "actual_end",
          required: false,
        })
      : undefined;
    const flag = parseBooleanFlag(record.is_critical_path);
    let isCriticalPath = false;
    if ("unknown" in flag) {
      issues.push(
        issue({
          code: "task.critical_path_invalid",
          entityType: "task",
          sheet: sheet.sheet,
          row,
          field: "is_critical_path",
          message: "Critical-path flag must be true/false or yes/no.",
          rawValue: flag.unknown,
        }),
      );
    } else if ("value" in flag) {
      isCriticalPath = flag.value;
    }
    let priorityWeight = 1;
    if (record.priority_weight?.trim()) {
      const parsed = Number(record.priority_weight);
      if (!Number.isInteger(parsed)) {
        issues.push(
          issue({
            code: "task.priority_weight_invalid",
            entityType: "task",
            sheet: sheet.sheet,
            row,
            field: "priority_weight",
            message: "Priority weight must be an integer.",
            rawValue: record.priority_weight,
          }),
        );
      } else {
        priorityWeight = parsed;
      }
    } else {
      issues.push(
        issue({
          severity: "Warning",
          code: "task.priority_weight_default",
          entityType: "task",
          sheet: sheet.sheet,
          row,
          field: "priority_weight",
          message: "Priority weight was not provided; 1 was used.",
        }),
      );
    }
    if (!externalId || !name || !phaseExternalId || "unknown" in state || "unknown" in type) {
      return [];
    }
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        name,
        phaseExternalId,
        status: state.status,
        taskType: type.taskType,
        plannedStart,
        plannedEnd,
        actualStart,
        actualEnd,
        isCriticalPath,
        priorityWeight,
        dependencyExternalIds: splitIdList(record.dependency_ids),
        requiredCrewExternalIds: splitIdList(record.required_crew_ids),
        requiredMaterialExternalIds: splitIdList(record.required_material_ids),
        requiredEquipmentExternalIds: splitIdList(record.required_equipment_ids),
      },
    ];
  });
}

function readCrews(sheet: SheetMatrix, issues: ImportIssue[]): NormalizedCrew[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "crew", sheet.sheet, row);
    const name = requiredString(record, "name", issues, "crew", sheet.sheet, row);
    const trade = requiredString(record, "trade", issues, "crew", sheet.sheet, row);
    const statusRaw = normalizeCrewStatus(record.status);
    if ("unknown" in statusRaw) {
      issues.push(
        issue({
          code: "crew.status_unknown",
          entityType: "crew",
          sheet: sheet.sheet,
          row,
          field: "status",
          rawValue: record.status,
          message: "Crew status is not recognized.",
        }),
      );
    }
    const requiredWorkers = requiredInt(record, "required_workers", issues, "crew", sheet.sheet, row);
    const availableWorkers = requiredInt(record, "available_workers", issues, "crew", sheet.sheet, row);
    if (!externalId || !name || !trade || "unknown" in statusRaw) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        name,
        trade,
        requiredWorkers: requiredWorkers ?? 0,
        availableWorkers: availableWorkers ?? 0,
        status: statusRaw.value,
        currentTaskExternalId: record.current_task_id?.trim() || null,
      },
    ];
  });
}

function readMaterials(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedMaterial[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "material", sheet.sheet, row);
    const name = requiredString(record, "name", issues, "material", sheet.sheet, row);
    const statusRaw = normalizeDeliveryStatus(record.delivery_status);
    if ("unknown" in statusRaw) {
      issues.push(
        issue({
          code: "material.status_unknown",
          entityType: "material",
          sheet: sheet.sheet,
          row,
          field: "delivery_status",
          rawValue: record.delivery_status,
          message: "Material delivery status is not recognized.",
        }),
      );
    }
    const expected =
      requireDate(record.expected_delivery_time, timeZone, issues, {
        entityType: "material",
        sheet: sheet.sheet,
        row,
        field: "expected_delivery_time",
        required: true,
      }) ?? "";
    const quantityExpected = requiredInt(
      record,
      "quantity_expected",
      issues,
      "material",
      sheet.sheet,
      row,
    );
    const quantityReceived = requiredInt(
      record,
      "quantity_received",
      issues,
      "material",
      sheet.sheet,
      row,
    );
    if (!externalId || !name || "unknown" in statusRaw) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        name,
        deliveryStatus: statusRaw.value,
        expectedDeliveryTime: expected,
        quantityExpected: quantityExpected ?? 0,
        quantityReceived: quantityReceived ?? 0,
      },
    ];
  });
}

function readEquipment(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedEquipment[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "equipment", sheet.sheet, row);
    const name = requiredString(record, "name", issues, "equipment", sheet.sheet, row);
    const statusRaw = normalizeEquipmentStatus(record.status);
    if ("unknown" in statusRaw) {
      issues.push(
        issue({
          code: "equipment.status_unknown",
          entityType: "equipment",
          sheet: sheet.sheet,
          row,
          field: "status",
          rawValue: record.status,
          message: "Equipment status is not recognized.",
        }),
      );
    }
    const availableFrom = record.available_from
      ? requireDate(record.available_from, timeZone, issues, {
          entityType: "equipment",
          sheet: sheet.sheet,
          row,
          field: "available_from",
          required: false,
        })
      : undefined;
    if (!externalId || !name || "unknown" in statusRaw) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        name,
        status: statusRaw.value,
        assignedTaskExternalId: record.assigned_task_id?.trim() || null,
        availableFrom,
      },
    ];
  });
}

function readInspections(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedInspection[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "inspection", sheet.sheet, row);
    const type = requiredString(record, "type", issues, "inspection", sheet.sheet, row);
    const statusRaw = normalizeInspectionStatus(record.status);
    if ("unknown" in statusRaw) {
      issues.push(
        issue({
          code: "inspection.status_unknown",
          entityType: "inspection",
          sheet: sheet.sheet,
          row,
          field: "status",
          rawValue: record.status,
          message: "Inspection status is not recognized.",
        }),
      );
    }
    const requiredBefore = requiredString(
      record,
      "required_before_task_id",
      issues,
      "inspection",
      sheet.sheet,
      row,
    );
    const scheduledTime = record.scheduled_time
      ? requireDate(record.scheduled_time, timeZone, issues, {
          entityType: "inspection",
          sheet: sheet.sheet,
          row,
          field: "scheduled_time",
          required: false,
        })
      : undefined;
    if (!externalId || !type || !requiredBefore || "unknown" in statusRaw) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        type,
        status: statusRaw.value,
        requiredBeforeTaskExternalId: requiredBefore,
        scheduledTime,
        inspectorName: record.inspector_name?.trim() || undefined,
      },
    ];
  });
}

function readPermits(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedPermit[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "permit", sheet.sheet, row);
    const type = requiredString(record, "type", issues, "permit", sheet.sheet, row);
    const statusRaw = normalizePermitStatus(record.status);
    if ("unknown" in statusRaw) {
      issues.push(
        issue({
          code: "permit.status_unknown",
          entityType: "permit",
          sheet: sheet.sheet,
          row,
          field: "status",
          rawValue: record.status,
          message: "Permit status is not recognized.",
        }),
      );
    }
    const requiredFor = requiredString(
      record,
      "required_for_task_id",
      issues,
      "permit",
      sheet.sheet,
      row,
    );
    const expirationDate = record.expiration_date
      ? requireDate(record.expiration_date, timeZone, issues, {
          entityType: "permit",
          sheet: sheet.sheet,
          row,
          field: "expiration_date",
          required: false,
        })
      : undefined;
    if (!externalId || !type || !requiredFor || "unknown" in statusRaw) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        type,
        status: statusRaw.value,
        requiredForTaskExternalId: requiredFor,
        expirationDate,
      },
    ];
  });
}

function readWeather(
  sheet: SheetMatrix,
  timeZone: string,
  issues: ImportIssue[],
): NormalizedWeather[] {
  return dataRecords(sheet, issues).flatMap(({ row, record }) => {
    const externalId = requiredString(record, "id", issues, "weather", sheet.sheet, row);
    const condition = requiredString(record, "condition", issues, "weather", sheet.sheet, row);
    const severity = normalizeWeatherSeverity(record.severity);
    if ("unknown" in severity) {
      issues.push(
        issue({
          code: "weather.severity_unknown",
          entityType: "weather",
          sheet: sheet.sheet,
          row,
          field: "severity",
          rawValue: record.severity,
          message: "Weather severity is not recognized.",
        }),
      );
    }
    const timestamp =
      requireDate(record.timestamp, timeZone, issues, {
        entityType: "weather",
        sheet: sheet.sheet,
        row,
        field: "timestamp",
        required: true,
      }) ?? "";
    const startTime =
      requireDate(record.start_time, timeZone, issues, {
        entityType: "weather",
        sheet: sheet.sheet,
        row,
        field: "start_time",
        required: true,
      }) ?? "";
    const endTime =
      requireDate(record.end_time, timeZone, issues, {
        entityType: "weather",
        sheet: sheet.sheet,
        row,
        field: "end_time",
        required: true,
      }) ?? "";
    const affected: NormalizedWeather["affectedTaskTypes"] = [];
    for (const item of splitIdList(record.affected_task_types)) {
      const mapped = normalizeTaskType(item);
      if ("unknown" in mapped) {
        issues.push(
          issue({
            code: "weather.affected_type_unknown",
            entityType: "weather",
            sheet: sheet.sheet,
            row,
            field: "affected_task_types",
            rawValue: item,
            message: "Weather affected task type is not recognized.",
          }),
        );
      } else {
        affected.push(mapped.taskType);
      }
    }
    if (!externalId || !condition || "unknown" in severity) return [];
    return [
      {
        sheet: sheet.sheet,
        row,
        externalId,
        timestamp,
        condition,
        severity: severity.value,
        startTime,
        endTime,
        affectedTaskTypes: affected,
      },
    ];
  });
}

function inferPhasesFromTasks(
  tasks: NormalizedTask[],
  issues: ImportIssue[],
): NormalizedPhase[] {
  const byId = new Map<string, NormalizedPhase>();
  for (const task of tasks) {
    const existing = byId.get(task.phaseExternalId);
    if (!existing) {
      byId.set(task.phaseExternalId, {
        sheet: "Tasks",
        row: task.row,
        externalId: task.phaseExternalId,
        name: task.phaseExternalId,
        plannedStart: task.plannedStart,
        plannedEnd: task.plannedEnd,
        status: "planned",
      });
      continue;
    }
    if (task.plannedStart < existing.plannedStart) {
      existing.plannedStart = task.plannedStart;
    }
    if (task.plannedEnd > existing.plannedEnd) {
      existing.plannedEnd = task.plannedEnd;
    }
  }
  if (byId.size > 0) {
    issues.push(
      issue({
        severity: "Warning",
        code: "phase.inferred_from_tasks",
        entityType: "phase",
        message:
          "Phases were inferred from task phase ids because a Phases sheet was not provided.",
      }),
    );
  }
  return [...byId.values()];
}

function firstDataRow(
  sheet: SheetMatrix,
  issues: ImportIssue[],
): { row: number; record: Record<string, string> } | null {
  const records = dataRecords(sheet, issues);
  return records[0] ?? null;
}

function dataRecords(
  sheet: SheetMatrix,
  issues: ImportIssue[],
): Array<{ row: number; record: Record<string, string> }> {
  if (sheet.rows.length === 0) return [];
  const headerRow = sheet.rows[0];
  const index: HeaderIndex = new Map();
  headerRow.forEach((header, column) => {
    const canonical = canonicalHeader(header);
    if (!canonical) {
      if (header.trim()) {
        issues.push(
          issue({
            severity: "Warning",
            code: "column.unmapped",
            entityType: "mapping",
            sheet: sheet.sheet,
            field: header,
            message: `Column "${header}" is not mapped and was ignored.`,
          }),
        );
      }
      return;
    }
    index.set(canonical, column);
  });
  const records: Array<{ row: number; record: Record<string, string> }> = [];
  for (let i = 1; i < sheet.rows.length; i += 1) {
    const cells = sheet.rows[i];
    const record: Record<string, string> = {};
    for (const [key, column] of index) {
      record[key] = String(cells[column] ?? "").trim();
    }
    if (Object.values(record).every((value) => value === "")) continue;
    records.push({ row: i + 1, record });
  }
  return records;
}

function requiredString(
  record: Record<string, string>,
  field: string,
  issues: ImportIssue[],
  entityType: ImportIssue["entityType"],
  sheet: string,
  row: number,
): string {
  const value = (record[field] ?? "").trim();
  if (!value) {
    issues.push(
      issue({
        code: `${entityType}.${field}_required`,
        entityType,
        sheet,
        row,
        field,
        message: `${field} is required.`,
      }),
    );
  }
  return value;
}

function requiredInt(
  record: Record<string, string>,
  field: string,
  issues: ImportIssue[],
  entityType: ImportIssue["entityType"],
  sheet: string,
  row: number,
): number | null {
  const raw = (record[field] ?? "").trim();
  if (!raw) {
    issues.push(
      issue({
        code: `${entityType}.${field}_required`,
        entityType,
        sheet,
        row,
        field,
        message: `${field} is required.`,
      }),
    );
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    issues.push(
      issue({
        code: `${entityType}.${field}_invalid`,
        entityType,
        sheet,
        row,
        field,
        rawValue: raw,
        message: `${field} must be an integer.`,
      }),
    );
    return null;
  }
  return parsed;
}

function requireDate(
  raw: string | undefined,
  timeZone: string,
  issues: ImportIssue[],
  meta: {
    entityType: ImportIssue["entityType"];
    field: string;
    required: boolean;
    sheet?: string;
    row?: number;
  },
): string | undefined {
  const result = normalizeImportDate(raw ?? "", timeZone);
  if (result.ok) return result.value;
  if (result.reason === "empty" && !meta.required) return undefined;
  const message =
    result.reason === "ambiguous"
      ? "Date is ambiguous. Use ISO YYYY-MM-DD or an Excel serial date."
      : result.reason === "empty"
        ? `${meta.field} is required.`
        : `${meta.field} is not a valid date.`;
  issues.push(
    issue({
      code: `${meta.entityType}.${meta.field}_${result.reason}`,
      entityType: meta.entityType,
      sheet: meta.sheet,
      row: meta.row,
      field: meta.field,
      rawValue: raw,
      message,
    }),
  );
  return undefined;
}
