import type { EvidenceItem, EvidenceSourceType } from "@/domain/types/evidence";
import type { Phase, PhaseStatus, Project, ProjectStatus } from "@/domain/types/project";
import type {
  Crew,
  CrewStatus,
  DeliveryStatus,
  Equipment,
  EquipmentStatus,
  Inspection,
  InspectionStatus,
  Material,
  Permit,
  PermitStatus,
  WeatherEvent,
  WeatherSeverity,
} from "@/domain/types/resources";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task, TaskState, TaskType } from "@/domain/types/task";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import type {
  InstantValue,
  PersistedTaskRow,
  ProjectConstructionRecords,
} from "@/lib/repositories/types";

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
];
const PHASE_STATUSES: readonly PhaseStatus[] = ["planned", "active", "completed"];
const TASK_STATES: readonly TaskState[] = [
  "Planned",
  "Ready",
  "Waiting",
  "Blocked",
  "Executing",
  "Paused",
  "Completed",
  "Verified",
  "Closed",
];
const TASK_TYPES: readonly TaskType[] = [
  "sitework",
  "concrete",
  "framing",
  "steel",
  "interior_prep",
  "envelope",
  "electrical_rough",
  "plumbing_rough",
  "drywall",
  "finishes",
];
const CREW_STATUSES: readonly CrewStatus[] = [
  "available",
  "assigned",
  "idle",
  "off_site",
];
const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "ordered",
  "in_transit",
  "delayed",
  "received",
  "partial",
];
const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  "available",
  "assigned",
  "maintenance",
  "unavailable",
];
const INSPECTION_STATUSES: readonly InspectionStatus[] = [
  "not_scheduled",
  "scheduled",
  "passed",
  "failed",
  "cancelled",
];
const PERMIT_STATUSES: readonly PermitStatus[] = [
  "pending",
  "approved",
  "expired",
  "revoked",
];
const WEATHER_SEVERITIES: readonly WeatherSeverity[] = [
  "low",
  "moderate",
  "high",
  "severe",
];
const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "seed",
  "simulation",
  "user",
  "system",
];

export type MapProjectSnapshotResult =
  | { status: "Mapped"; snapshot: ProjectSnapshot }
  | { status: "InvalidProjectData"; diagnostics: string[] };

/**
 * Pure mapping from persistence records to ProjectSnapshot.
 * currentOperationalAt is explicit. Does not read the system clock.
 * Does not mutate input records.
 */
export function mapProjectSnapshot(
  recordsInput: ProjectConstructionRecords,
  currentOperationalAt: string,
): MapProjectSnapshotResult {
  const records = structuredClone(recordsInput);
  const diagnostics: string[] = [];
  const projectId = records.project.id;

  if (!currentOperationalAt.trim()) {
    diagnostics.push("currentOperationalAt is required");
  }

  if (records.project.currentPhaseId == null || records.project.currentPhaseId === "") {
    diagnostics.push("Project currentPhaseId is required");
  }

  const phaseIds = new Set(records.phases.map((phase) => phase.id));
  const taskIds = new Set(records.tasks.map((task) => task.id));
  const crewIds = new Set(records.crews.map((crew) => crew.id));
  const materialIds = new Set(records.materials.map((material) => material.id));
  const equipmentIds = new Set(records.equipment.map((item) => item.id));

  for (const phase of records.phases) {
    if (phase.projectId !== projectId) {
      diagnostics.push(`Phase ${phase.id} is not in the loaded project`);
    }
    requireEnum("Phase status", phase.status, PHASE_STATUSES, diagnostics);
  }

  if (
    records.project.currentPhaseId &&
    !phaseIds.has(records.project.currentPhaseId)
  ) {
    diagnostics.push("Project currentPhaseId does not match a loaded phase");
  }

  requireEnum("Project status", records.project.status, PROJECT_STATUSES, diagnostics);

  for (const task of records.tasks) {
    if (task.projectId !== projectId) {
      diagnostics.push(`Task ${task.id} is not in the loaded project`);
    }
    requireEnum("Task status", task.status, TASK_STATES, diagnostics);
    requireEnum("Task type", task.taskType, TASK_TYPES, diagnostics);
  }

  collectIds(
    records.taskDependencies,
    projectId,
    taskIds,
    "taskId",
    "predecessorTaskId",
    "dependency",
    diagnostics,
    taskIds,
  );
  collectIds(
    records.taskRequiredCrews,
    projectId,
    crewIds,
    "taskId",
    "crewId",
    "required crew",
    diagnostics,
    taskIds,
  );
  collectIds(
    records.taskRequiredMaterials,
    projectId,
    materialIds,
    "taskId",
    "materialId",
    "required material",
    diagnostics,
    taskIds,
  );
  collectIds(
    records.taskRequiredEquipment,
    projectId,
    equipmentIds,
    "taskId",
    "equipmentId",
    "required equipment",
    diagnostics,
    taskIds,
  );

  for (const crew of records.crews) {
    if (crew.projectId !== projectId) {
      diagnostics.push(`Crew ${crew.id} is not in the loaded project`);
    }
    requireEnum("Crew status", crew.status, CREW_STATUSES, diagnostics);
    if (crew.currentTaskId !== null && !taskIds.has(crew.currentTaskId)) {
      diagnostics.push(`Crew ${crew.id} assignment target is not in the loaded project`);
    }
  }

  for (const material of records.materials) {
    if (material.projectId !== projectId) {
      diagnostics.push(`Material ${material.id} is not in the loaded project`);
    }
    requireEnum(
      "Material delivery status",
      material.deliveryStatus,
      DELIVERY_STATUSES,
      diagnostics,
    );
  }

  for (const item of records.equipment) {
    if (item.projectId !== projectId) {
      diagnostics.push(`Equipment ${item.id} is not in the loaded project`);
    }
    requireEnum("Equipment status", item.status, EQUIPMENT_STATUSES, diagnostics);
    if (item.assignedTaskId !== null && !taskIds.has(item.assignedTaskId)) {
      diagnostics.push(
        `Equipment ${item.id} allocation target is not in the loaded project`,
      );
    }
  }

  for (const inspection of records.inspections) {
    if (inspection.projectId !== projectId) {
      diagnostics.push(`Inspection ${inspection.id} is not in the loaded project`);
    }
    requireEnum("Inspection status", inspection.status, INSPECTION_STATUSES, diagnostics);
    if (!taskIds.has(inspection.requiredBeforeTaskId)) {
      diagnostics.push(
        `Inspection ${inspection.id} gating task is not in the loaded project`,
      );
    }
  }

  for (const permit of records.permits) {
    if (permit.projectId !== projectId) {
      diagnostics.push(`Permit ${permit.id} is not in the loaded project`);
    }
    requireEnum("Permit status", permit.status, PERMIT_STATUSES, diagnostics);
    if (!taskIds.has(permit.requiredForTaskId)) {
      diagnostics.push(
        `Permit ${permit.id} related task is not in the loaded project`,
      );
    }
  }

  for (const weather of records.weatherEvents) {
    if (weather.projectId !== projectId) {
      diagnostics.push(`Weather ${weather.id} is not in the loaded project`);
    }
    requireEnum("Weather severity", weather.severity, WEATHER_SEVERITIES, diagnostics);
  }

  for (const affected of records.weatherAffectedTaskTypes) {
    if (affected.projectId !== projectId) {
      diagnostics.push("Weather affected task type is not in the loaded project");
    }
    requireEnum("Weather affected task type", affected.taskType, TASK_TYPES, diagnostics);
    if (!records.weatherEvents.some((event) => event.id === affected.weatherEventId)) {
      diagnostics.push("Weather affected task type references a missing weather event");
    }
  }

  for (const evidence of records.evidenceItems) {
    if (evidence.projectId !== projectId) {
      diagnostics.push(`Evidence ${evidence.id} is not in the loaded project`);
    }
    requireEnum(
      "Evidence source type",
      evidence.sourceType,
      EVIDENCE_SOURCE_TYPES,
      diagnostics,
    );
  }

  if (diagnostics.length > 0) {
    return { status: "InvalidProjectData", diagnostics };
  }

  const dependenciesByTask = groupValues(
    records.taskDependencies,
    (row) => row.taskId,
    (row) => row.predecessorTaskId,
  );
  const crewsByTask = groupValues(
    records.taskRequiredCrews,
    (row) => row.taskId,
    (row) => row.crewId,
  );
  const materialsByTask = groupValues(
    records.taskRequiredMaterials,
    (row) => row.taskId,
    (row) => row.materialId,
  );
  const equipmentByTask = groupValues(
    records.taskRequiredEquipment,
    (row) => row.taskId,
    (row) => row.equipmentId,
  );
  const affectedByWeather = groupValues(
    records.weatherAffectedTaskTypes,
    (row) => row.weatherEventId,
    (row) => row.taskType,
  );

  const project: Project = {
    id: records.project.id,
    name: records.project.name,
    location: records.project.location,
    currentPhaseId: records.project.currentPhaseId!,
    startDate: toDomainInstant(records.project.startDate),
    targetDate: toDomainInstant(records.project.targetDate),
    status: records.project.status,
    timezone: records.project.timezone,
    currentSimulatedAt: currentOperationalAt,
  };

  const phases: Phase[] = records.phases.map((phase) => ({
    id: phase.id,
    projectId: phase.projectId,
    name: phase.name,
    plannedStart: toDomainInstant(phase.plannedStart),
    plannedEnd: toDomainInstant(phase.plannedEnd),
    status: phase.status,
  }));

  const tasks: Task[] = records.tasks.map((task) => mapTask(task, {
    dependencyTaskIds: dependenciesByTask.get(task.id) ?? [],
    requiredCrewIds: crewsByTask.get(task.id) ?? [],
    requiredMaterialIds: materialsByTask.get(task.id) ?? [],
    requiredEquipmentIds: equipmentByTask.get(task.id) ?? [],
  }));

  const crews: Crew[] = records.crews.map((crew) => ({
    id: crew.id,
    name: crew.name,
    trade: crew.trade,
    requiredWorkers: crew.requiredWorkers,
    availableWorkers: crew.availableWorkers,
    status: crew.status,
    currentTaskId: crew.currentTaskId,
  }));

  const materials: Material[] = records.materials.map((material) => ({
    id: material.id,
    name: material.name,
    deliveryStatus: material.deliveryStatus,
    expectedDeliveryTime: toDomainInstant(material.expectedDeliveryTime),
    quantityExpected: material.quantityExpected,
    quantityReceived: material.quantityReceived,
  }));

  const equipment: Equipment[] = records.equipment.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    assignedTaskId: item.assignedTaskId,
    ...(item.availableFrom == null
      ? {}
      : { availableFrom: toDomainInstant(item.availableFrom) }),
  }));

  const inspections: Inspection[] = records.inspections.map((inspection) => ({
    id: inspection.id,
    type: inspection.type,
    status: inspection.status,
    requiredBeforeTaskId: inspection.requiredBeforeTaskId,
    ...(inspection.scheduledTime == null
      ? {}
      : { scheduledTime: toDomainInstant(inspection.scheduledTime) }),
    ...(inspection.inspectorName == null
      ? {}
      : { inspectorName: inspection.inspectorName }),
  }));

  const permits: Permit[] = records.permits.map((permit) => ({
    id: permit.id,
    type: permit.type,
    status: permit.status,
    requiredForTaskId: permit.requiredForTaskId,
    ...(permit.expirationDate == null
      ? {}
      : { expirationDate: toDomainInstant(permit.expirationDate) }),
  }));

  const weather: WeatherEvent[] = records.weatherEvents.map((event) => ({
    id: event.id,
    projectId: event.projectId,
    timestamp: toDomainInstant(event.timestamp),
    condition: event.condition,
    severity: event.severity,
    affectedTaskTypes: affectedByWeather.get(event.id) ?? [],
    startTime: toDomainInstant(event.startTime),
    endTime: toDomainInstant(event.endTime),
  }));

  const evidence: EvidenceItem[] = records.evidenceItems.map((item) => ({
    id: item.id,
    evidenceType: item.evidenceType,
    sourceType: item.sourceType,
    sourceRef: item.sourceRef,
    relatedEntityType: item.relatedEntityType,
    relatedEntityId: item.relatedEntityId,
    observedValue: item.observedValue,
    timestamp: toDomainInstant(item.timestamp),
    ...(item.confidence == null ? {} : { confidence: item.confidence }),
  }));

  const snapshot: ProjectSnapshot = {
    project,
    phases,
    tasks,
    crews,
    materials,
    equipment,
    inspections,
    permits,
    weather,
    evidence,
    scenarioFixtures: [],
  };

  const validation = validateProjectSnapshot(snapshot);
  if (!validation.ok) {
    return { status: "InvalidProjectData", diagnostics: validation.errors };
  }

  return { status: "Mapped", snapshot };
}

function mapTask(
  task: PersistedTaskRow,
  relations: {
    dependencyTaskIds: string[];
    requiredCrewIds: string[];
    requiredMaterialIds: string[];
    requiredEquipmentIds: string[];
  },
): Task {
  return {
    id: task.id,
    projectId: task.projectId,
    phaseId: task.phaseId,
    name: task.name,
    status: task.status,
    taskType: task.taskType,
    plannedStart: toDomainInstant(task.plannedStart),
    plannedEnd: toDomainInstant(task.plannedEnd),
    dependencyTaskIds: [...relations.dependencyTaskIds],
    requiredCrewIds: [...relations.requiredCrewIds],
    requiredMaterialIds: [...relations.requiredMaterialIds],
    requiredEquipmentIds: [...relations.requiredEquipmentIds],
    priorityWeight: task.priorityWeight,
    isCriticalPath: task.isCriticalPath,
    ...(task.actualStart == null
      ? {}
      : { actualStart: toDomainInstant(task.actualStart) }),
    ...(task.actualEnd == null ? {} : { actualEnd: toDomainInstant(task.actualEnd) }),
  };
}

export function toDomainInstant(value: InstantValue): string {
  return value instanceof Date ? value.toISOString() : value;
}

function requireEnum<T extends string>(
  label: string,
  value: string,
  allowed: readonly T[],
  diagnostics: string[],
): void {
  if (!(allowed as readonly string[]).includes(value)) {
    diagnostics.push(`${label} is not a recognized domain value`);
  }
}

function collectIds(
  rows: Array<{ taskId: string; projectId: string } & Record<string, string>>,
  projectId: string,
  targetIds: Set<string>,
  taskKey: "taskId",
  targetKey: string,
  label: string,
  diagnostics: string[],
  taskIds: Set<string> = new Set(),
): void {
  for (const row of rows) {
    if (row.projectId !== projectId) {
      diagnostics.push(`${label} row is not in the loaded project`);
    }
    if (taskIds.size > 0 && !taskIds.has(row[taskKey])) {
      diagnostics.push(`${label} row references a task outside the loaded project`);
    }
    if (targetKey === "predecessorTaskId" && row.taskId === row.predecessorTaskId) {
      diagnostics.push("Task dependency cannot reference itself");
    }
    if (!targetIds.has(row[targetKey])) {
      diagnostics.push(`${label} target is not in the loaded project`);
    }
  }
}

function groupValues<T, V>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => V,
): Map<string, V[]> {
  const grouped = new Map<string, V[]>();
  for (const row of rows) {
    const list = grouped.get(key(row)) ?? [];
    list.push(value(row));
    grouped.set(key(row), list);
  }
  return grouped;
}
