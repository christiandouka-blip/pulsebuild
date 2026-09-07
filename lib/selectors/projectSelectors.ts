import type { CrewId, EquipmentId, MaterialId, TaskId } from "@/domain/types/identifiers";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export function getCurrentPhase(snapshot: ProjectSnapshot) {
  return snapshot.phases.find((p) => p.id === snapshot.project.currentPhaseId);
}

export function getCriticalPathTasks(snapshot: ProjectSnapshot) {
  return snapshot.tasks.filter((t) => t.isCriticalPath);
}

export function crewsRequiredByTask(snapshot: ProjectSnapshot, taskId: TaskId) {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return [];
  return snapshot.crews.filter((c) => task.requiredCrewIds.includes(c.id));
}

export function tasksRequiringCrew(snapshot: ProjectSnapshot, crewId: CrewId) {
  return snapshot.tasks.filter((t) => t.requiredCrewIds.includes(crewId));
}

export function crewCurrentAssignment(snapshot: ProjectSnapshot, crewId: CrewId) {
  return snapshot.crews.find((c) => c.id === crewId)?.currentTaskId ?? null;
}

export function materialsRequiredByTask(snapshot: ProjectSnapshot, taskId: TaskId) {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return [];
  return snapshot.materials.filter((m) => task.requiredMaterialIds.includes(m.id));
}

export function tasksRequiringMaterial(
  snapshot: ProjectSnapshot,
  materialId: MaterialId,
) {
  return snapshot.tasks.filter((t) =>
    t.requiredMaterialIds.includes(materialId),
  );
}

export function equipmentRequiredByTask(
  snapshot: ProjectSnapshot,
  taskId: TaskId,
) {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) return [];
  return snapshot.equipment.filter((e) =>
    task.requiredEquipmentIds.includes(e.id),
  );
}

export function tasksRequiringEquipment(
  snapshot: ProjectSnapshot,
  equipmentId: EquipmentId,
) {
  return snapshot.tasks.filter((t) =>
    t.requiredEquipmentIds.includes(equipmentId),
  );
}

export function equipmentCurrentAllocation(
  snapshot: ProjectSnapshot,
  equipmentId: EquipmentId,
) {
  return (
    snapshot.equipment.find((e) => e.id === equipmentId)?.assignedTaskId ?? null
  );
}

export function inspectionsGatingTask(snapshot: ProjectSnapshot, taskId: TaskId) {
  return snapshot.inspections.filter(
    (i) => i.requiredBeforeTaskId === taskId,
  );
}

export function permitsForTask(snapshot: ProjectSnapshot, taskId: TaskId) {
  return snapshot.permits.filter((p) => p.requiredForTaskId === taskId);
}

export function successorTasks(snapshot: ProjectSnapshot, taskId: TaskId) {
  return snapshot.tasks.filter((t) => t.dependencyTaskIds.includes(taskId));
}

export function getProjectFactCounts(snapshot: ProjectSnapshot) {
  return {
    taskCount: snapshot.tasks.length,
    crewCount: snapshot.crews.length,
    equipmentCount: snapshot.equipment.length,
    inspectionCount: snapshot.inspections.length,
    permitCount: snapshot.permits.length,
    criticalPathTaskCount: getCriticalPathTasks(snapshot).length,
  };
}

export function formatSimulatedDateTime(snapshot: ProjectSnapshot) {
  return formatSimulatedInstant(
    snapshot.project.currentSimulatedAt,
    snapshot.project.timezone,
  );
}

/** Format a known simulated ISO instant in the project timezone. Not wall-clock. */
export function formatSimulatedInstant(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}
