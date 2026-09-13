import type { SheetMatrix } from "@/lib/import/parseCsv";
import type { ProjectSetupInput } from "@/domain/import/types";

export const IMPORT_CLOCK = "2026-09-07T18:00:00.000Z";

export const VALID_SETUP: ProjectSetupInput = {
  name: "Example Tower",
  timezone: "America/Chicago",
  startDate: "2026-01-01",
  location: "Chicago",
  targetDate: "2027-12-31",
  currentPhaseExternalId: "phase-structure",
};

export function validSheets(): SheetMatrix[] {
  return [
    {
      sheet: "Project",
      rows: [
        ["id", "name", "timezone", "start_date", "target_date", "location", "current_phase_id"],
        ["proj-example", "Example Tower", "America/Chicago", "2026-01-01", "2027-12-31", "Chicago", "phase-structure"],
      ],
    },
    {
      sheet: "Phases",
      rows: [
        ["id", "name", "planned_start", "planned_end", "status"],
        ["phase-structure", "Structure", "2026-01-01", "2026-08-01", "active"],
      ],
    },
    {
      sheet: "Tasks",
      rows: [
        [
          "id",
          "name",
          "phase_id",
          "status",
          "task_type",
          "planned_start",
          "planned_end",
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
          "true",
          "10",
          "task-foundation",
          "crew-a",
          "mat-a",
          "equip-a",
        ],
      ],
    },
    {
      sheet: "Crews",
      rows: [
        ["id", "name", "trade", "required_workers", "available_workers", "status", "current_task_id"],
        ["crew-a", "Concrete Crew", "concrete", "8", "8", "available", ""],
      ],
    },
    {
      sheet: "Materials",
      rows: [
        ["id", "name", "delivery_status", "expected_delivery_time", "quantity_expected", "quantity_received"],
        ["mat-a", "Concrete", "received", "2026-02-15T08:00:00", "100", "100"],
      ],
    },
    {
      sheet: "Equipment",
      rows: [
        ["id", "name", "status", "assigned_task_id", "available_from"],
        ["equip-a", "Pump truck", "available", "", ""],
      ],
    },
    {
      sheet: "Inspections",
      rows: [
        ["id", "type", "status", "required_before_task_id", "scheduled_time"],
        ["insp-pour", "Pre-pour", "scheduled", "task-pour", "2026-03-01T07:00:00"],
      ],
    },
    {
      sheet: "Permits",
      rows: [
        ["id", "type", "status", "required_for_task_id"],
        ["perm-pour", "Pour permit", "approved", "task-pour"],
      ],
    },
  ];
}

export function sheetsToCsv(sheets: SheetMatrix[]): string {
  const headers = new Set<string>(["sheet"]);
  for (const sheet of sheets) {
    for (const header of sheet.rows[0] ?? []) headers.add(header);
  }
  const headerList = [...headers];
  const lines = [headerList.join(",")];
  for (const sheet of sheets) {
    const keys = sheet.rows[0] ?? [];
    for (let i = 1; i < sheet.rows.length; i += 1) {
      const record = Object.fromEntries(
        keys.map((key, index) => [key, sheet.rows[i][index] ?? ""]),
      );
      lines.push(
        headerList
          .map((header) => {
            const value = header === "sheet" ? sheet.sheet : (record[header] ?? "");
            return /[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
          })
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

export function ownerAuth(organizationId = "org-a", actorUserId = "owner-a") {
  return {
    status: "Authorized" as const,
    scope: { organizationId, actorUserId },
    role: "Owner" as const,
    capabilities: ["project:create"] as const,
  };
}

export function roleAuth(
  role: "ProjectManager" | "Superintendent" | "Viewer",
  organizationId = "org-a",
  actorUserId = `${role.toLowerCase()}-a`,
) {
  return {
    status: "Authorized" as const,
    scope: { organizationId, actorUserId },
    role,
    capabilities: [] as const,
  };
}
