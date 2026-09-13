import { eq } from "drizzle-orm";

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
import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import type { EnvRecord } from "@/lib/auth/runtimeMode";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import {
  PROJECT_COLLECTION_ORDER,
  tenantScopedProjectWhere,
} from "@/lib/repositories/postgresProjectQueries";
import type {
  PersistedCrewRow,
  PersistedEquipmentRow,
  PersistedEvidenceRow,
  PersistedInspectionRow,
  PersistedMaterialRow,
  PersistedPermitRow,
  PersistedPhaseRow,
  PersistedProjectRow,
  PersistedTaskDependencyRow,
  PersistedTaskRequiredCrewRow,
  PersistedTaskRequiredEquipmentRow,
  PersistedTaskRequiredMaterialRow,
  PersistedTaskRow,
  PersistedWeatherAffectedTaskTypeRow,
  PersistedWeatherRow,
  ProjectConstructionRecords,
  ProjectRepository,
  ProjectWorldSource,
} from "@/lib/repositories/types";

/**
 * One coherent project read.
 *
 * Isolation: REPEATABLE READ, access mode READ ONLY.
 * That is enough for a consistent view of one project's construction rows
 * without serializable lock contention. Not a serializable write lock.
 *
 * Query set: one tenant-scoped project query, then one query per project-scoped
 * collection/relationship table. No N+1. No single mega-join.
 */
export const PROJECT_SNAPSHOT_READ_ISOLATION = {
  isolationLevel: "repeatable read",
  accessMode: "read only",
} as const;

export function createPostgresProjectWorldSource(
  db: Database,
): ProjectWorldSource {
  return {
    loadProjectWorld(input) {
      return loadPostgresProjectWorld(db, input);
    },
  };
}

export function createPostgresProjectRepository(
  env: EnvRecord = process.env,
): ProjectRepository {
  return createProjectRepository({
    async loadProjectWorld(input) {
      const db = getDb(env);
      return loadPostgresProjectWorld(db, input);
    },
  });
}

export async function loadPostgresProjectWorld(
  db: Database,
  input: { organizationId: string; projectId: string },
): Promise<ProjectConstructionRecords | null> {
  return db.transaction(
    (tx) => loadPostgresProjectWorldFromSession(tx, input),
    PROJECT_SNAPSHOT_READ_ISOLATION,
  );
}

export async function loadPostgresProjectWorldFromSession(
  tx: Database,
  input: { organizationId: string; projectId: string },
): Promise<ProjectConstructionRecords | null> {
    const [projectRow] = await tx
      .select()
      .from(projects)
      .where(tenantScopedProjectWhere(input.projectId, input.organizationId))
      .limit(1);

    if (!projectRow) {
      return null;
    }

    const projectId = projectRow.id;

    const phaseRows = await tx
      .select()
      .from(phases)
      .where(eq(phases.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.phases);

    const taskRows = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.tasks);

    const crewRows = await tx
      .select()
      .from(crews)
      .where(eq(crews.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.crews);

    const materialRows = await tx
      .select()
      .from(materials)
      .where(eq(materials.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.materials);

    const equipmentRows = await tx
      .select()
      .from(equipment)
      .where(eq(equipment.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.equipment);

    const inspectionRows = await tx
      .select()
      .from(inspections)
      .where(eq(inspections.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.inspections);

    const permitRows = await tx
      .select()
      .from(permits)
      .where(eq(permits.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.permits);

    const weatherRows = await tx
      .select()
      .from(weatherEvents)
      .where(eq(weatherEvents.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.weatherEvents);

    const evidenceRows = await tx
      .select()
      .from(evidenceItems)
      .where(eq(evidenceItems.projectId, projectId))
      .orderBy(PROJECT_COLLECTION_ORDER.evidenceItems);

    const dependencyRows = await tx
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.projectId, projectId))
      .orderBy(...PROJECT_COLLECTION_ORDER.taskDependencies);

    const requiredCrewRows = await tx
      .select()
      .from(taskRequiredCrews)
      .where(eq(taskRequiredCrews.projectId, projectId))
      .orderBy(...PROJECT_COLLECTION_ORDER.taskRequiredCrews);

    const requiredMaterialRows = await tx
      .select()
      .from(taskRequiredMaterials)
      .where(eq(taskRequiredMaterials.projectId, projectId))
      .orderBy(...PROJECT_COLLECTION_ORDER.taskRequiredMaterials);

    const requiredEquipmentRows = await tx
      .select()
      .from(taskRequiredEquipment)
      .where(eq(taskRequiredEquipment.projectId, projectId))
      .orderBy(...PROJECT_COLLECTION_ORDER.taskRequiredEquipment);

    const weatherAffectedRows = await tx
      .select()
      .from(weatherEventAffectedTaskTypes)
      .where(eq(weatherEventAffectedTaskTypes.projectId, projectId))
      .orderBy(...PROJECT_COLLECTION_ORDER.weatherAffectedTaskTypes);

    return {
      project: toProjectRow(projectRow),
      phases: phaseRows.map(toPhaseRow),
      tasks: taskRows.map(toTaskRow),
      crews: crewRows.map(toCrewRow),
      materials: materialRows.map(toMaterialRow),
      equipment: equipmentRows.map(toEquipmentRow),
      inspections: inspectionRows.map(toInspectionRow),
      permits: permitRows.map(toPermitRow),
      weatherEvents: weatherRows.map(toWeatherRow),
      evidenceItems: evidenceRows.map(toEvidenceRow),
      taskDependencies: dependencyRows.map(toDependencyRow),
      taskRequiredCrews: requiredCrewRows.map(toRequiredCrewRow),
      taskRequiredMaterials: requiredMaterialRows.map(toRequiredMaterialRow),
      taskRequiredEquipment: requiredEquipmentRows.map(toRequiredEquipmentRow),
      weatherAffectedTaskTypes: weatherAffectedRows.map(toWeatherAffectedRow),
    };
}

function toProjectRow(row: typeof projects.$inferSelect): PersistedProjectRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    location: row.location,
    currentPhaseId: row.currentPhaseId,
    startDate: row.startDate,
    targetDate: row.targetDate,
    status: row.status,
    timezone: row.timezone,
  };
}

function toPhaseRow(row: typeof phases.$inferSelect): PersistedPhaseRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    status: row.status,
  };
}

function toTaskRow(row: typeof tasks.$inferSelect): PersistedTaskRow {
  return {
    id: row.id,
    projectId: row.projectId,
    phaseId: row.phaseId,
    name: row.name,
    status: row.status,
    taskType: row.taskType,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    priorityWeight: row.priorityWeight,
    isCriticalPath: row.isCriticalPath,
    actualStart: row.actualStart,
    actualEnd: row.actualEnd,
  };
}

function toCrewRow(row: typeof crews.$inferSelect): PersistedCrewRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    trade: row.trade,
    requiredWorkers: row.requiredWorkers,
    availableWorkers: row.availableWorkers,
    status: row.status,
    currentTaskId: row.currentTaskId,
  };
}

function toMaterialRow(row: typeof materials.$inferSelect): PersistedMaterialRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    deliveryStatus: row.deliveryStatus,
    expectedDeliveryTime: row.expectedDeliveryTime,
    quantityExpected: row.quantityExpected,
    quantityReceived: row.quantityReceived,
  };
}

function toEquipmentRow(row: typeof equipment.$inferSelect): PersistedEquipmentRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    assignedTaskId: row.assignedTaskId,
    availableFrom: row.availableFrom,
  };
}

function toInspectionRow(
  row: typeof inspections.$inferSelect,
): PersistedInspectionRow {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    requiredBeforeTaskId: row.requiredBeforeTaskId,
    scheduledTime: row.scheduledTime,
    inspectorName: row.inspectorName,
  };
}

function toPermitRow(row: typeof permits.$inferSelect): PersistedPermitRow {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    requiredForTaskId: row.requiredForTaskId,
    expirationDate: row.expirationDate,
  };
}

function toWeatherRow(row: typeof weatherEvents.$inferSelect): PersistedWeatherRow {
  return {
    id: row.id,
    projectId: row.projectId,
    timestamp: row.timestamp,
    condition: row.condition,
    severity: row.severity,
    startTime: row.startTime,
    endTime: row.endTime,
  };
}

function toEvidenceRow(
  row: typeof evidenceItems.$inferSelect,
): PersistedEvidenceRow {
  return {
    id: row.id,
    projectId: row.projectId,
    evidenceType: row.evidenceType,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    observedValue: row.observedValue,
    timestamp: row.timestamp,
    confidence: row.confidence,
  };
}

function toDependencyRow(
  row: typeof taskDependencies.$inferSelect,
): PersistedTaskDependencyRow {
  return {
    taskId: row.taskId,
    predecessorTaskId: row.predecessorTaskId,
    projectId: row.projectId,
  };
}

function toRequiredCrewRow(
  row: typeof taskRequiredCrews.$inferSelect,
): PersistedTaskRequiredCrewRow {
  return {
    taskId: row.taskId,
    crewId: row.crewId,
    projectId: row.projectId,
  };
}

function toRequiredMaterialRow(
  row: typeof taskRequiredMaterials.$inferSelect,
): PersistedTaskRequiredMaterialRow {
  return {
    taskId: row.taskId,
    materialId: row.materialId,
    projectId: row.projectId,
  };
}

function toRequiredEquipmentRow(
  row: typeof taskRequiredEquipment.$inferSelect,
): PersistedTaskRequiredEquipmentRow {
  return {
    taskId: row.taskId,
    equipmentId: row.equipmentId,
    projectId: row.projectId,
  };
}

function toWeatherAffectedRow(
  row: typeof weatherEventAffectedTaskTypes.$inferSelect,
): PersistedWeatherAffectedTaskTypeRow {
  return {
    weatherEventId: row.weatherEventId,
    projectId: row.projectId,
    taskType: row.taskType,
  };
}
