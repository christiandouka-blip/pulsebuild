import type { EvidenceSourceType } from "@/domain/types/evidence";
import type { PhaseStatus, ProjectStatus } from "@/domain/types/project";
import type {
  CrewStatus,
  DeliveryStatus,
  EquipmentStatus,
  InspectionStatus,
  PermitStatus,
  WeatherSeverity,
} from "@/domain/types/resources";
import type { TenantScope } from "@/domain/tenancy/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { TaskState, TaskType } from "@/domain/types/task";

export type InstantValue = Date | string;

export type PersistedProjectRow = {
  id: string;
  organizationId: string;
  name: string;
  location: string;
  currentPhaseId: string | null;
  startDate: InstantValue;
  targetDate: InstantValue;
  status: ProjectStatus;
  timezone: string;
};

export type PersistedPhaseRow = {
  id: string;
  projectId: string;
  name: string;
  plannedStart: InstantValue;
  plannedEnd: InstantValue;
  status: PhaseStatus;
};

export type PersistedTaskRow = {
  id: string;
  projectId: string;
  phaseId: string;
  name: string;
  status: TaskState;
  taskType: TaskType;
  plannedStart: InstantValue;
  plannedEnd: InstantValue;
  priorityWeight: number;
  isCriticalPath: boolean;
  actualStart: InstantValue | null;
  actualEnd: InstantValue | null;
};

export type PersistedCrewRow = {
  id: string;
  projectId: string;
  name: string;
  trade: string;
  requiredWorkers: number;
  availableWorkers: number;
  status: CrewStatus;
  currentTaskId: string | null;
};

export type PersistedMaterialRow = {
  id: string;
  projectId: string;
  name: string;
  deliveryStatus: DeliveryStatus;
  expectedDeliveryTime: InstantValue;
  quantityExpected: number;
  quantityReceived: number;
};

export type PersistedEquipmentRow = {
  id: string;
  projectId: string;
  name: string;
  status: EquipmentStatus;
  assignedTaskId: string | null;
  availableFrom: InstantValue | null;
};

export type PersistedInspectionRow = {
  id: string;
  projectId: string;
  type: string;
  status: InspectionStatus;
  requiredBeforeTaskId: string;
  scheduledTime: InstantValue | null;
  inspectorName: string | null;
};

export type PersistedPermitRow = {
  id: string;
  projectId: string;
  type: string;
  status: PermitStatus;
  requiredForTaskId: string;
  expirationDate: InstantValue | null;
};

export type PersistedWeatherRow = {
  id: string;
  projectId: string;
  timestamp: InstantValue;
  condition: string;
  severity: WeatherSeverity;
  startTime: InstantValue;
  endTime: InstantValue;
};

export type PersistedEvidenceRow = {
  id: string;
  projectId: string;
  evidenceType: string;
  sourceType: EvidenceSourceType;
  sourceRef: string;
  relatedEntityType: string;
  relatedEntityId: string;
  observedValue: string;
  timestamp: InstantValue;
  confidence: number | null;
};

export type PersistedTaskDependencyRow = {
  taskId: string;
  predecessorTaskId: string;
  projectId: string;
};

export type PersistedTaskRequiredCrewRow = {
  taskId: string;
  crewId: string;
  projectId: string;
};

export type PersistedTaskRequiredMaterialRow = {
  taskId: string;
  materialId: string;
  projectId: string;
};

export type PersistedTaskRequiredEquipmentRow = {
  taskId: string;
  equipmentId: string;
  projectId: string;
};

export type PersistedWeatherAffectedTaskTypeRow = {
  weatherEventId: string;
  projectId: string;
  taskType: TaskType;
};

export type ProjectConstructionRecords = {
  project: PersistedProjectRow;
  phases: PersistedPhaseRow[];
  tasks: PersistedTaskRow[];
  crews: PersistedCrewRow[];
  materials: PersistedMaterialRow[];
  equipment: PersistedEquipmentRow[];
  inspections: PersistedInspectionRow[];
  permits: PersistedPermitRow[];
  weatherEvents: PersistedWeatherRow[];
  evidenceItems: PersistedEvidenceRow[];
  taskDependencies: PersistedTaskDependencyRow[];
  taskRequiredCrews: PersistedTaskRequiredCrewRow[];
  taskRequiredMaterials: PersistedTaskRequiredMaterialRow[];
  taskRequiredEquipment: PersistedTaskRequiredEquipmentRow[];
  weatherAffectedTaskTypes: PersistedWeatherAffectedTaskTypeRow[];
};

export type LoadProjectSnapshotInput = {
  tenantScope: TenantScope;
  projectId: string;
  currentOperationalAt: string;
};

export type LoadProjectSnapshotResult =
  | { status: "Loaded"; snapshot: ProjectSnapshot }
  | { status: "ProjectNotFound" }
  | { status: "InvalidProjectData"; diagnostics: string[] }
  | { status: "DatabaseUnavailable"; message: string };

export type ProjectWorldSource = {
  loadProjectWorld(input: {
    organizationId: string;
    projectId: string;
  }): Promise<ProjectConstructionRecords | null>;
};

export type ProjectRepository = {
  loadProjectSnapshot(
    input: LoadProjectSnapshotInput,
  ): Promise<LoadProjectSnapshotResult>;
};
