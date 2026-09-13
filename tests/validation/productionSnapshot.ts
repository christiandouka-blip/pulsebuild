import type {
  Crew,
  Equipment,
  Inspection,
  Material,
  Permit,
  WeatherEvent,
} from "@/domain/types/resources";
import type { Phase, Project } from "@/domain/types/project";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";

export function productionConstructionSnapshot(
  overrides: Partial<ProjectSnapshot> = {},
): ProjectSnapshot {
  const project: Project = {
    id: "proj-midwest-tower",
    name: "Midwest Tower",
    location: "Chicago yard",
    currentPhaseId: "phase-structure",
    startDate: "2026-01-01",
    targetDate: "2027-12-31",
    status: "active",
    timezone: "America/Chicago",
    currentSimulatedAt: "2026-09-07T15:00:00.000Z",
  };

  const phases: Phase[] = [
    {
      id: "phase-structure",
      projectId: "proj-midwest-tower",
      name: "Structure",
      plannedStart: "2026-01-01",
      plannedEnd: "2026-08-01",
      status: "active",
    },
  ];

  const tasks: Task[] = [
    {
      id: "task-foundation",
      projectId: "proj-midwest-tower",
      phaseId: "phase-structure",
      name: "Foundation",
      status: "Completed",
      taskType: "concrete",
      plannedStart: "2026-01-02T08:00:00.000Z",
      plannedEnd: "2026-02-01T17:00:00.000Z",
      dependencyTaskIds: [],
      requiredCrewIds: ["crew-a"],
      requiredMaterialIds: ["mat-a"],
      requiredEquipmentIds: ["equip-a"],
      priorityWeight: 8,
      isCriticalPath: true,
      actualStart: "2026-01-02T08:00:00.000Z",
      actualEnd: "2026-01-31T17:00:00.000Z",
    },
    {
      id: "task-pour",
      projectId: "proj-midwest-tower",
      phaseId: "phase-structure",
      name: "Pour",
      status: "Ready",
      taskType: "concrete",
      plannedStart: "2026-03-01T08:00:00.000Z",
      plannedEnd: "2026-03-01T17:00:00.000Z",
      dependencyTaskIds: ["task-foundation"],
      requiredCrewIds: ["crew-a"],
      requiredMaterialIds: ["mat-a"],
      requiredEquipmentIds: ["equip-a"],
      priorityWeight: 10,
      isCriticalPath: true,
    },
  ];

  const crews: Crew[] = [
    {
      id: "crew-a",
      name: "Concrete Crew",
      trade: "concrete",
      requiredWorkers: 8,
      availableWorkers: 8,
      status: "available",
      currentTaskId: null,
    },
  ];

  const materials: Material[] = [
    {
      id: "mat-a",
      name: "Concrete",
      deliveryStatus: "received",
      expectedDeliveryTime: "2026-02-15T08:00:00.000Z",
      quantityExpected: 100,
      quantityReceived: 100,
    },
  ];

  const equipment: Equipment[] = [
    {
      id: "equip-a",
      name: "Pump truck",
      status: "available",
      assignedTaskId: null,
    },
  ];

  const inspections: Inspection[] = [
    {
      id: "insp-pour",
      type: "Pre-pour",
      status: "scheduled",
      requiredBeforeTaskId: "task-pour",
      scheduledTime: "2026-03-01T07:00:00.000Z",
    },
  ];

  const permits: Permit[] = [
    {
      id: "perm-pour",
      type: "Pour permit",
      status: "approved",
      requiredForTaskId: "task-pour",
    },
  ];

  const weather: WeatherEvent[] = [
    {
      id: "wx-clear",
      projectId: "proj-midwest-tower",
      timestamp: "2026-09-07T15:00:00.000Z",
      condition: "Clear",
      severity: "low",
      affectedTaskTypes: [],
      startTime: "2026-09-07T12:00:00.000Z",
      endTime: "2026-09-07T20:00:00.000Z",
    },
  ];

  return {
    project,
    phases,
    tasks,
    crews,
    materials,
    equipment,
    inspections,
    permits,
    weather,
    evidence: [
      {
        id: "ev-start",
        evidenceType: "clock",
        sourceType: "system",
        sourceRef: "time-provider",
        relatedEntityType: "project",
        relatedEntityId: "proj-midwest-tower",
        observedValue: "Operational instant supplied by TimeProvider",
        timestamp: "2026-09-07T15:00:00.000Z",
      },
    ],
    scenarioFixtures: [],
    ...overrides,
  };
}
