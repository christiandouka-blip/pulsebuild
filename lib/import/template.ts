export const TEMPLATE_SHEETS: Record<string, string[][]> = {
  Project: [
    [
      "id",
      "name",
      "timezone",
      "start_date",
      "target_date",
      "location",
      "current_phase_id",
    ],
    [
      "proj-example",
      "Example Tower",
      "America/Chicago",
      "2026-01-01",
      "2027-12-31",
      "Chicago",
      "phase-structure",
    ],
  ],
  Phases: [
    ["id", "name", "planned_start", "planned_end", "status"],
    ["phase-structure", "Structure", "2026-01-01", "2026-08-01", "active"],
  ],
  Tasks: [
    [
      "id",
      "name",
      "phase_id",
      "status",
      "task_type",
      "planned_start",
      "planned_end",
      "actual_start",
      "actual_end",
      "is_critical_path",
      "priority_weight",
      "dependency_ids",
      "required_crew_ids",
      "required_material_ids",
      "required_equipment_ids",
    ],
    [
      "task-foundation",
      "Foundation",
      "phase-structure",
      "Completed",
      "concrete",
      "2026-01-02T08:00:00",
      "2026-02-01T17:00:00",
      "2026-01-02T08:00:00",
      "2026-01-31T17:00:00",
      "true",
      "8",
      "",
      "crew-a",
      "mat-a",
      "equip-a",
    ],
    [
      "task-pour",
      "Pour",
      "phase-structure",
      "Ready",
      "concrete",
      "2026-03-01T08:00:00",
      "2026-03-01T17:00:00",
      "",
      "",
      "true",
      "10",
      "task-foundation",
      "crew-a",
      "mat-a",
      "equip-a",
    ],
  ],
  Crews: [
    [
      "id",
      "name",
      "trade",
      "required_workers",
      "available_workers",
      "status",
      "current_task_id",
    ],
    ["crew-a", "Concrete Crew", "concrete", "8", "8", "available", ""],
  ],
  Materials: [
    [
      "id",
      "name",
      "delivery_status",
      "expected_delivery_time",
      "quantity_expected",
      "quantity_received",
    ],
    ["mat-a", "Concrete", "received", "2026-02-15T08:00:00", "100", "100"],
  ],
  Equipment: [
    ["id", "name", "status", "assigned_task_id", "available_from"],
    ["equip-a", "Pump truck", "available", "", ""],
  ],
  Inspections: [
    [
      "id",
      "type",
      "status",
      "required_before_task_id",
      "scheduled_time",
      "inspector_name",
    ],
    ["insp-pour", "Pre-pour", "scheduled", "task-pour", "2026-03-01T07:00:00", ""],
  ],
  Permits: [
    ["id", "type", "status", "required_for_task_id", "expiration_date"],
    ["perm-pour", "Pour permit", "approved", "task-pour", ""],
  ],
};

export function csvFromSheet(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`;
          return cell;
        })
        .join(","),
    )
    .join("\n");
}

export function unifiedTemplateCsv(): string {
  return csvFromSheet([
    ["sheet", "id", "name", "status", "task_type", "phase_id", "planned_start", "planned_end", "is_critical_path", "priority_weight", "dependency_ids", "required_crew_ids", "required_material_ids", "required_equipment_ids"],
    ["Tasks", "task-foundation", "Foundation", "Completed", "concrete", "phase-structure", "2026-01-02T08:00:00", "2026-02-01T17:00:00", "true", "8", "", "crew-a", "mat-a", "equip-a"],
  ]);
}
