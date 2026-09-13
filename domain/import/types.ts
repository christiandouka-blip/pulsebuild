import type { PhaseStatus, ProjectStatus } from "@/domain/types/project";
import type {
  CrewStatus,
  DeliveryStatus,
  EquipmentStatus,
  InspectionStatus,
  PermitStatus,
  WeatherSeverity,
} from "@/domain/types/resources";
import type { TaskState, TaskType } from "@/domain/types/task";

export type ImportFileType = "csv" | "xlsx";

export type ImportEntityType =
  | "file"
  | "project"
  | "phase"
  | "task"
  | "crew"
  | "material"
  | "equipment"
  | "inspection"
  | "permit"
  | "weather"
  | "mapping";

export type ImportIssueSeverity = "Error" | "Warning";

export type ImportJobStatus =
  | "Uploaded"
  | "Parsed"
  | "NeedsReview"
  | "ReadyToImport"
  | "Imported"
  | "Rejected"
  | "Failed";

export type ImportIssue = {
  severity: ImportIssueSeverity;
  code: string;
  entityType: ImportEntityType;
  sheet?: string;
  row?: number;
  field?: string;
  message: string;
  rawValue?: string;
  suggestedResolution?: string;
};

export type ProjectSetupInput = {
  name: string;
  timezone: string;
  startDate: string;
  location?: string;
  targetDate?: string;
  currentPhaseExternalId?: string;
};

export type NormalizedProjectFields = {
  externalId?: string;
  name: string;
  timezone: string;
  startDate: string;
  targetDate?: string;
  location: string;
  status: ProjectStatus;
  currentPhaseExternalId?: string;
};

export type NormalizedPhase = {
  sheet: string;
  row: number;
  externalId: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  status: PhaseStatus;
};

export type NormalizedTask = {
  sheet: string;
  row: number;
  externalId: string;
  name: string;
  phaseExternalId: string;
  status: TaskState;
  taskType: TaskType;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  isCriticalPath: boolean;
  priorityWeight: number;
  dependencyExternalIds: string[];
  requiredCrewExternalIds: string[];
  requiredMaterialExternalIds: string[];
  requiredEquipmentExternalIds: string[];
};

export type NormalizedCrew = {
  sheet: string;
  row: number;
  externalId: string;
  name: string;
  trade: string;
  requiredWorkers: number;
  availableWorkers: number;
  status: CrewStatus;
  currentTaskExternalId: string | null;
};

export type NormalizedMaterial = {
  sheet: string;
  row: number;
  externalId: string;
  name: string;
  deliveryStatus: DeliveryStatus;
  expectedDeliveryTime: string;
  quantityExpected: number;
  quantityReceived: number;
};

export type NormalizedEquipment = {
  sheet: string;
  row: number;
  externalId: string;
  name: string;
  status: EquipmentStatus;
  assignedTaskExternalId: string | null;
  availableFrom?: string;
};

export type NormalizedInspection = {
  sheet: string;
  row: number;
  externalId: string;
  type: string;
  status: InspectionStatus;
  requiredBeforeTaskExternalId: string;
  scheduledTime?: string;
  inspectorName?: string;
};

export type NormalizedPermit = {
  sheet: string;
  row: number;
  externalId: string;
  type: string;
  status: PermitStatus;
  requiredForTaskExternalId: string;
  expirationDate?: string;
};

export type NormalizedWeather = {
  sheet: string;
  row: number;
  externalId: string;
  timestamp: string;
  condition: string;
  severity: WeatherSeverity;
  startTime: string;
  endTime: string;
  affectedTaskTypes: TaskType[];
};

/**
 * Staging DTO. Not a ProjectSnapshot and not operational truth.
 */
export type NormalizedProjectImport = {
  project: NormalizedProjectFields;
  phases: NormalizedPhase[];
  tasks: NormalizedTask[];
  crews: NormalizedCrew[];
  materials: NormalizedMaterial[];
  equipment: NormalizedEquipment[];
  inspections: NormalizedInspection[];
  permits: NormalizedPermit[];
  weather: NormalizedWeather[];
};

export type ProjectImportPreview = {
  projectName: string;
  timezone: string;
  phaseCount: number;
  taskCount: number;
  crewCount: number;
  materialCount: number;
  equipmentCount: number;
  inspectionCount: number;
  permitCount: number;
  weatherCount: number;
  criticalPathCount: number;
  errorCount: number;
  warningCount: number;
  issues: ImportIssue[];
  phaseOptions: Array<{ externalId: string; name: string }>;
  selectedCurrentPhaseExternalId?: string;
};

export type ImportJobRecord = {
  id: string;
  organizationId: string;
  actorUserId: string;
  projectId: string | null;
  sourceFilename: string;
  sourceType: ImportFileType;
  status: ImportJobStatus;
  createdAt: string;
  validatedAt: string | null;
  confirmedAt: string | null;
  errorCount: number;
  warningCount: number;
  phaseCount: number;
  taskCount: number;
  crewCount: number;
  materialCount: number;
  equipmentCount: number;
  inspectionCount: number;
  permitCount: number;
  criticalPathCount: number;
  staging: NormalizedProjectImport | null;
  issues: ImportIssue[];
  selectedCurrentPhaseExternalId: string | null;
  warningsAcknowledged: boolean;
};

export type CreateImportJobInput = {
  tenantScope: { organizationId: string; actorUserId: string };
  setup: ProjectSetupInput;
  filename: string;
  bytes: Uint8Array;
  createdAt: string;
};
