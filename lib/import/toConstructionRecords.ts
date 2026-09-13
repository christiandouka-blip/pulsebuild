import { makeEntityId, makeProjectId } from "@/domain/import/ids";
import type { NormalizedProjectImport } from "@/domain/import/types";
import type { ProjectConstructionRecords } from "@/lib/repositories/types";

export function stagingToConstructionRecords(input: {
  importJobId: string;
  organizationId: string;
  staging: NormalizedProjectImport;
  currentPhaseExternalId: string;
}): ProjectConstructionRecords {
  const projectId = makeProjectId(input.importJobId);
  const staging = input.staging;
  const phaseId = (externalId: string) =>
    makeEntityId(projectId, "phase", externalId);
  const taskId = (externalId: string) => makeEntityId(projectId, "task", externalId);
  const crewId = (externalId: string) => makeEntityId(projectId, "crew", externalId);
  const materialId = (externalId: string) =>
    makeEntityId(projectId, "material", externalId);
  const equipmentId = (externalId: string) =>
    makeEntityId(projectId, "equipment", externalId);

  const targetDate =
    staging.project.targetDate ??
    latestDate([
      ...staging.phases.map((phase) => phase.plannedEnd),
      ...staging.tasks.map((task) => task.plannedEnd),
    ]);

  return {
    project: {
      id: projectId,
      organizationId: input.organizationId,
      name: staging.project.name,
      location: staging.project.location,
      currentPhaseId: phaseId(input.currentPhaseExternalId),
      startDate: staging.project.startDate,
      targetDate,
      status: staging.project.status,
      timezone: staging.project.timezone,
    },
    phases: staging.phases.map((phase) => ({
      id: phaseId(phase.externalId),
      projectId,
      name: phase.name,
      plannedStart: phase.plannedStart,
      plannedEnd: phase.plannedEnd,
      status: phase.status,
    })),
    tasks: staging.tasks.map((task) => ({
      id: taskId(task.externalId),
      projectId,
      phaseId: phaseId(task.phaseExternalId),
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
    crews: staging.crews.map((crew) => ({
      id: crewId(crew.externalId),
      projectId,
      name: crew.name,
      trade: crew.trade,
      requiredWorkers: crew.requiredWorkers,
      availableWorkers: crew.availableWorkers,
      status: crew.status,
      currentTaskId: crew.currentTaskExternalId
        ? taskId(crew.currentTaskExternalId)
        : null,
    })),
    materials: staging.materials.map((material) => ({
      id: materialId(material.externalId),
      projectId,
      name: material.name,
      deliveryStatus: material.deliveryStatus,
      expectedDeliveryTime: material.expectedDeliveryTime,
      quantityExpected: material.quantityExpected,
      quantityReceived: material.quantityReceived,
    })),
    equipment: staging.equipment.map((item) => ({
      id: equipmentId(item.externalId),
      projectId,
      name: item.name,
      status: item.status,
      assignedTaskId: item.assignedTaskExternalId
        ? taskId(item.assignedTaskExternalId)
        : null,
      availableFrom: item.availableFrom ?? null,
    })),
    inspections: staging.inspections.map((inspection) => ({
      id: makeEntityId(projectId, "insp", inspection.externalId),
      projectId,
      type: inspection.type,
      status: inspection.status,
      requiredBeforeTaskId: taskId(inspection.requiredBeforeTaskExternalId),
      scheduledTime: inspection.scheduledTime ?? null,
      inspectorName: inspection.inspectorName ?? null,
    })),
    permits: staging.permits.map((permit) => ({
      id: makeEntityId(projectId, "perm", permit.externalId),
      projectId,
      type: permit.type,
      status: permit.status,
      requiredForTaskId: taskId(permit.requiredForTaskExternalId),
      expirationDate: permit.expirationDate ?? null,
    })),
    weatherEvents: staging.weather.map((event) => ({
      id: makeEntityId(projectId, "wx", event.externalId),
      projectId,
      timestamp: event.timestamp,
      condition: event.condition,
      severity: event.severity,
      startTime: event.startTime,
      endTime: event.endTime,
    })),
    evidenceItems: [],
    taskDependencies: staging.tasks.flatMap((task) =>
      task.dependencyExternalIds.map((predecessor) => ({
        taskId: taskId(task.externalId),
        predecessorTaskId: taskId(predecessor),
        projectId,
      })),
    ),
    taskRequiredCrews: staging.tasks.flatMap((task) =>
      task.requiredCrewExternalIds.map((id) => ({
        taskId: taskId(task.externalId),
        crewId: crewId(id),
        projectId,
      })),
    ),
    taskRequiredMaterials: staging.tasks.flatMap((task) =>
      task.requiredMaterialExternalIds.map((id) => ({
        taskId: taskId(task.externalId),
        materialId: materialId(id),
        projectId,
      })),
    ),
    taskRequiredEquipment: staging.tasks.flatMap((task) =>
      task.requiredEquipmentExternalIds.map((id) => ({
        taskId: taskId(task.externalId),
        equipmentId: equipmentId(id),
        projectId,
      })),
    ),
    weatherAffectedTaskTypes: staging.weather.flatMap((event) =>
      event.affectedTaskTypes.map((taskType) => ({
        weatherEventId: makeEntityId(projectId, "wx", event.externalId),
        projectId,
        taskType,
      })),
    ),
  };
}

function latestDate(values: string[]): string {
  return values.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest,
  );
}
