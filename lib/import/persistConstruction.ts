import { and, eq } from "drizzle-orm";

import {
  crews,
  equipment,
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
import type { ProjectConstructionRecords } from "@/lib/repositories/types";

export async function persistConstructionRecords(
  tx: Database,
  records: ProjectConstructionRecords,
): Promise<void> {
  await tx.insert(projects).values({
    id: records.project.id,
    organizationId: records.project.organizationId,
    name: records.project.name,
    location: records.project.location,
    currentPhaseId: null,
    startDate: asDate(records.project.startDate),
    targetDate: asDate(records.project.targetDate),
    status: records.project.status,
    timezone: records.project.timezone,
  });

  if (records.phases.length > 0) {
    await tx.insert(phases).values(
      records.phases.map((phase) => ({
        id: phase.id,
        projectId: phase.projectId,
        name: phase.name,
        plannedStart: asDate(phase.plannedStart),
        plannedEnd: asDate(phase.plannedEnd),
        status: phase.status,
      })),
    );
  }

  await tx
    .update(projects)
    .set({ currentPhaseId: records.project.currentPhaseId })
    .where(
      and(
        eq(projects.id, records.project.id),
        eq(projects.organizationId, records.project.organizationId),
      ),
    );

  if (records.tasks.length > 0) {
    await tx.insert(tasks).values(
      records.tasks.map((task) => ({
        id: task.id,
        projectId: task.projectId,
        phaseId: task.phaseId,
        name: task.name,
        status: task.status,
        taskType: task.taskType,
        plannedStart: asDate(task.plannedStart),
        plannedEnd: asDate(task.plannedEnd),
        priorityWeight: task.priorityWeight,
        isCriticalPath: task.isCriticalPath,
        actualStart: asDateOrNull(task.actualStart),
        actualEnd: asDateOrNull(task.actualEnd),
      })),
    );
  }

  if (records.crews.length > 0) {
    await tx.insert(crews).values(
      records.crews.map((crew) => ({
        id: crew.id,
        projectId: crew.projectId,
        name: crew.name,
        trade: crew.trade,
        requiredWorkers: crew.requiredWorkers,
        availableWorkers: crew.availableWorkers,
        status: crew.status,
        currentTaskId: crew.currentTaskId,
      })),
    );
  }

  if (records.materials.length > 0) {
    await tx.insert(materials).values(
      records.materials.map((material) => ({
        id: material.id,
        projectId: material.projectId,
        name: material.name,
        deliveryStatus: material.deliveryStatus,
        expectedDeliveryTime: asDate(material.expectedDeliveryTime),
        quantityExpected: material.quantityExpected,
        quantityReceived: material.quantityReceived,
      })),
    );
  }

  if (records.equipment.length > 0) {
    await tx.insert(equipment).values(
      records.equipment.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        name: item.name,
        status: item.status,
        assignedTaskId: item.assignedTaskId,
        availableFrom: asDateOrNull(item.availableFrom),
      })),
    );
  }

  if (records.inspections.length > 0) {
    await tx.insert(inspections).values(
      records.inspections.map((inspection) => ({
        id: inspection.id,
        projectId: inspection.projectId,
        type: inspection.type,
        status: inspection.status,
        requiredBeforeTaskId: inspection.requiredBeforeTaskId,
        scheduledTime: asDateOrNull(inspection.scheduledTime),
        inspectorName: inspection.inspectorName,
      })),
    );
  }

  if (records.permits.length > 0) {
    await tx.insert(permits).values(
      records.permits.map((permit) => ({
        id: permit.id,
        projectId: permit.projectId,
        type: permit.type,
        status: permit.status,
        requiredForTaskId: permit.requiredForTaskId,
        expirationDate: asDateOrNull(permit.expirationDate),
      })),
    );
  }

  if (records.weatherEvents.length > 0) {
    await tx.insert(weatherEvents).values(
      records.weatherEvents.map((event) => ({
        id: event.id,
        projectId: event.projectId,
        timestamp: asDate(event.timestamp),
        condition: event.condition,
        severity: event.severity,
        startTime: asDate(event.startTime),
        endTime: asDate(event.endTime),
      })),
    );
  }

  if (records.taskDependencies.length > 0) {
    await tx.insert(taskDependencies).values(records.taskDependencies);
  }
  if (records.taskRequiredCrews.length > 0) {
    await tx.insert(taskRequiredCrews).values(records.taskRequiredCrews);
  }
  if (records.taskRequiredMaterials.length > 0) {
    await tx.insert(taskRequiredMaterials).values(records.taskRequiredMaterials);
  }
  if (records.taskRequiredEquipment.length > 0) {
    await tx.insert(taskRequiredEquipment).values(records.taskRequiredEquipment);
  }
  if (records.weatherAffectedTaskTypes.length > 0) {
    await tx.insert(weatherEventAffectedTaskTypes).values(
      records.weatherAffectedTaskTypes,
    );
  }
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function asDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return asDate(value);
}
