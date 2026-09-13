export const APPROVED_SHEETS = [
  "Project",
  "Phases",
  "Tasks",
  "Crews",
  "Materials",
  "Equipment",
  "Inspections",
  "Permits",
  "Weather",
] as const;

export type ApprovedSheet = (typeof APPROVED_SHEETS)[number];

const SHEET_ALIASES: Record<string, ApprovedSheet> = {
  project: "Project",
  projects: "Project",
  phases: "Phases",
  phase: "Phases",
  tasks: "Tasks",
  task: "Tasks",
  crews: "Crews",
  crew: "Crews",
  materials: "Materials",
  material: "Materials",
  equipment: "Equipment",
  inspections: "Inspections",
  inspection: "Inspections",
  permits: "Permits",
  permit: "Permits",
  weather: "Weather",
};

export function canonicalSheetName(name: string): ApprovedSheet | null {
  return SHEET_ALIASES[name.trim().toLowerCase()] ?? null;
}

const HEADER_ALIASES: Record<string, string> = {
  id: "id",
  external_id: "id",
  externalid: "id",
  name: "name",
  timezone: "timezone",
  time_zone: "timezone",
  start: "start_date",
  start_date: "start_date",
  startdate: "start_date",
  target: "target_date",
  target_date: "target_date",
  end_date: "target_date",
  location: "location",
  current_phase: "current_phase_id",
  current_phase_id: "current_phase_id",
  status: "status",
  planned_start: "planned_start",
  plannedstart: "planned_start",
  planned_end: "planned_end",
  plannedend: "planned_end",
  actual_start: "actual_start",
  actualstart: "actual_start",
  actual_end: "actual_end",
  actualend: "actual_end",
  task_type: "task_type",
  tasktype: "task_type",
  type: "type",
  phase: "phase_id",
  phase_id: "phase_id",
  phaseid: "phase_id",
  is_critical_path: "is_critical_path",
  critical_path: "is_critical_path",
  criticalpath: "is_critical_path",
  priority_weight: "priority_weight",
  priorityweight: "priority_weight",
  priority: "priority_weight",
  dependency_ids: "dependency_ids",
  dependencies: "dependency_ids",
  predecessors: "dependency_ids",
  required_crew_ids: "required_crew_ids",
  crews: "required_crew_ids",
  required_material_ids: "required_material_ids",
  materials: "required_material_ids",
  required_equipment_ids: "required_equipment_ids",
  trade: "trade",
  required_workers: "required_workers",
  available_workers: "available_workers",
  current_task_id: "current_task_id",
  current_task: "current_task_id",
  delivery_status: "delivery_status",
  expected_delivery_time: "expected_delivery_time",
  quantity_expected: "quantity_expected",
  quantity_received: "quantity_received",
  assigned_task_id: "assigned_task_id",
  assigned_task: "assigned_task_id",
  available_from: "available_from",
  required_before_task_id: "required_before_task_id",
  required_before_task: "required_before_task_id",
  scheduled_time: "scheduled_time",
  inspector_name: "inspector_name",
  required_for_task_id: "required_for_task_id",
  required_for_task: "required_for_task_id",
  expiration_date: "expiration_date",
  timestamp: "timestamp",
  condition: "condition",
  severity: "severity",
  start_time: "start_time",
  end_time: "end_time",
  affected_task_types: "affected_task_types",
};

export function canonicalHeader(header: string): string | null {
  const key = header.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] ?? null;
}

export function splitIdList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[;|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseBooleanFlag(
  raw: string | undefined,
): { value: boolean } | { unknown: string } | { empty: true } {
  if (raw === undefined || raw.trim() === "") return { empty: true };
  const key = raw.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(key)) return { value: true };
  if (["false", "no", "n", "0"].includes(key)) return { value: false };
  return { unknown: raw.trim() };
}
