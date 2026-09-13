import { and, asc, eq } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";

import {
  crews,
  equipment,
  evidenceItems,
  inspections,
  materials,
  permits,
  phases,
  projects,
  taskDependencies,
  taskRequiredCrews,
  taskRequiredEquipment,
  taskRequiredMaterials,
  tasks,
  weatherEventAffectedTaskTypes,
  weatherEvents,
} from "@/drizzle/schema";

/**
 * Root project lookup is always tenant-scoped.
 * There is no production loadProjectById(projectId) path.
 */
export function tenantScopedProjectWhere(
  projectId: string,
  organizationId: string,
) {
  return and(
    eq(projects.id, projectId),
    eq(projects.organizationId, organizationId),
  );
}

export function tenantScopedProjectSelectSql(
  projectId: string,
  organizationId: string,
): { sql: string; params: unknown[] } {
  const qb = new QueryBuilder();
  return qb
    .select()
    .from(projects)
    .where(tenantScopedProjectWhere(projectId, organizationId))
    .limit(1)
    .toSQL();
}

export const PROJECT_COLLECTION_ORDER = {
  phases: asc(phases.id),
  tasks: asc(tasks.id),
  crews: asc(crews.id),
  materials: asc(materials.id),
  equipment: asc(equipment.id),
  inspections: asc(inspections.id),
  permits: asc(permits.id),
  weatherEvents: asc(weatherEvents.id),
  evidenceItems: asc(evidenceItems.id),
  taskDependencies: [asc(taskDependencies.taskId), asc(taskDependencies.predecessorTaskId)],
  taskRequiredCrews: [asc(taskRequiredCrews.taskId), asc(taskRequiredCrews.crewId)],
  taskRequiredMaterials: [
    asc(taskRequiredMaterials.taskId),
    asc(taskRequiredMaterials.materialId),
  ],
  taskRequiredEquipment: [
    asc(taskRequiredEquipment.taskId),
    asc(taskRequiredEquipment.equipmentId),
  ],
  weatherAffectedTaskTypes: [
    asc(weatherEventAffectedTaskTypes.weatherEventId),
    asc(weatherEventAffectedTaskTypes.taskType),
  ],
} as const;

export const PROJECT_LOAD_QUERY_TABLES = [
  "projects",
  "phases",
  "tasks",
  "crews",
  "materials",
  "equipment",
  "inspections",
  "permits",
  "weather_events",
  "evidence_items",
  "task_dependencies",
  "task_required_crews",
  "task_required_materials",
  "task_required_equipment",
  "weather_event_affected_task_types",
] as const;
