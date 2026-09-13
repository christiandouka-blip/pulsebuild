import { buildProjectSnapshot } from "@/data/index";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { ProjectConstructionRecords } from "@/lib/repositories/types";
import { productionConstructionSnapshot } from "@/tests/validation/productionSnapshot";

export const HARBOR_POINT_ORGANIZATION_ID = "org-harbor-point";
export const HARBOR_POINT_PROJECT_ID = "proj-harbor-point";
export const HARBOR_POINT_OPERATIONAL_AT = "2026-03-14T06:30:00-04:00";
export const OTHER_ORGANIZATION_ID = "org-other";
export const ACTOR_USER_ID = "user-repo-actor";

export function recordsFromSnapshot(
  snapshot: ProjectSnapshot,
  organizationId: string,
): ProjectConstructionRecords {
  const projectId = snapshot.project.id;
  return {
    project: {
      id: snapshot.project.id,
      organizationId,
      name: snapshot.project.name,
      location: snapshot.project.location,
      currentPhaseId: snapshot.project.currentPhaseId,
      startDate: snapshot.project.startDate,
      targetDate: snapshot.project.targetDate,
      status: snapshot.project.status,
      timezone: snapshot.project.timezone,
    },
    phases: snapshot.phases.map((phase) => ({ ...phase })),
    tasks: snapshot.tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      phaseId: task.phaseId,
      name: task.name,
      status: task.status,
      taskType: task.taskType,
      plannedStart: task.plannedStart,
      plannedEnd: task.plannedEnd,
      priorityWeight: task.priorityWeight,
      isCriticalPath: task.isCriticalPath,
      actualStart: task.actualStart ?? null,
      actualEnd: task.actualEnd ?? null,
    })),
    crews: snapshot.crews.map((crew) => ({
      id: crew.id,
      projectId,
      name: crew.name,
      trade: crew.trade,
      requiredWorkers: crew.requiredWorkers,
      availableWorkers: crew.availableWorkers,
      status: crew.status,
      currentTaskId: crew.currentTaskId,
    })),
    materials: snapshot.materials.map((material) => ({
      id: material.id,
      projectId,
      name: material.name,
      deliveryStatus: material.deliveryStatus,
      expectedDeliveryTime: material.expectedDeliveryTime,
      quantityExpected: material.quantityExpected,
      quantityReceived: material.quantityReceived,
    })),
    equipment: snapshot.equipment.map((item) => ({
      id: item.id,
      projectId,
      name: item.name,
      status: item.status,
      assignedTaskId: item.assignedTaskId,
      availableFrom: item.availableFrom ?? null,
    })),
    inspections: snapshot.inspections.map((inspection) => ({
      id: inspection.id,
      projectId,
      type: inspection.type,
      status: inspection.status,
      requiredBeforeTaskId: inspection.requiredBeforeTaskId,
      scheduledTime: inspection.scheduledTime ?? null,
      inspectorName: inspection.inspectorName ?? null,
    })),
    permits: snapshot.permits.map((permit) => ({
      id: permit.id,
      projectId,
      type: permit.type,
      status: permit.status,
      requiredForTaskId: permit.requiredForTaskId,
      expirationDate: permit.expirationDate ?? null,
    })),
    weatherEvents: snapshot.weather.map((event) => ({
      id: event.id,
      projectId: event.projectId,
      timestamp: event.timestamp,
      condition: event.condition,
      severity: event.severity,
      startTime: event.startTime,
      endTime: event.endTime,
    })),
    evidenceItems: snapshot.evidence.map((item) => ({
      id: item.id,
      projectId,
      evidenceType: item.evidenceType,
      sourceType: item.sourceType,
      sourceRef: item.sourceRef,
      relatedEntityType: item.relatedEntityType,
      relatedEntityId: item.relatedEntityId,
      observedValue: item.observedValue,
      timestamp: item.timestamp,
      confidence: item.confidence ?? null,
    })),
    taskDependencies: snapshot.tasks.flatMap((task) =>
      task.dependencyTaskIds.map((predecessorTaskId) => ({
        taskId: task.id,
        predecessorTaskId,
        projectId,
      })),
    ),
    taskRequiredCrews: snapshot.tasks.flatMap((task) =>
      task.requiredCrewIds.map((crewId) => ({
        taskId: task.id,
        crewId,
        projectId,
      })),
    ),
    taskRequiredMaterials: snapshot.tasks.flatMap((task) =>
      task.requiredMaterialIds.map((materialId) => ({
        taskId: task.id,
        materialId,
        projectId,
      })),
    ),
    taskRequiredEquipment: snapshot.tasks.flatMap((task) =>
      task.requiredEquipmentIds.map((equipmentId) => ({
        taskId: task.id,
        equipmentId,
        projectId,
      })),
    ),
    weatherAffectedTaskTypes: snapshot.weather.flatMap((event) =>
      event.affectedTaskTypes.map((taskType) => ({
        weatherEventId: event.id,
        projectId: event.projectId,
        taskType,
      })),
    ),
  };
}

export function harborPointRecords(
  organizationId = HARBOR_POINT_ORGANIZATION_ID,
): ProjectConstructionRecords {
  return recordsFromSnapshot(buildProjectSnapshot(), organizationId);
}

export function productionRecords(
  organizationId = "org-midwest",
  overrides: Partial<ProjectSnapshot> = {},
): ProjectConstructionRecords {
  return recordsFromSnapshot(productionConstructionSnapshot(overrides), organizationId);
}

export function cloneRecords(
  records: ProjectConstructionRecords,
): ProjectConstructionRecords {
  return structuredClone(records);
}
