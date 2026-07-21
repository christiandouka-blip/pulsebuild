import type {
  CrewId,
  EquipmentId,
  InspectionId,
  MaterialId,
  PermitId,
  ProjectId,
  TaskId,
  WeatherEventId,
} from "@/domain/types/identifiers";
import type { TaskType } from "@/domain/types/task";

export type CrewStatus = "available" | "assigned" | "idle" | "off_site";

export type DeliveryStatus =
  | "ordered"
  | "in_transit"
  | "delayed"
  | "received"
  | "partial";

export type EquipmentStatus =
  | "available"
  | "assigned"
  | "maintenance"
  | "unavailable";

export type InspectionStatus =
  | "not_scheduled"
  | "scheduled"
  | "passed"
  | "failed"
  | "cancelled";

export type PermitStatus = "pending" | "approved" | "expired" | "revoked";

export type WeatherSeverity = "low" | "moderate" | "high" | "severe";

export type Crew = {
  id: CrewId;
  name: string;
  trade: string;
  requiredWorkers: number;
  availableWorkers: number;
  status: CrewStatus;
  /** Current assignment — separate from Task.requiredCrewIds requirement fact. */
  currentTaskId: TaskId | null;
};

export type Material = {
  id: MaterialId;
  name: string;
  deliveryStatus: DeliveryStatus;
  expectedDeliveryTime: string;
  quantityExpected: number;
  quantityReceived: number;
};

export type Equipment = {
  id: EquipmentId;
  name: string;
  status: EquipmentStatus;
  /** Current allocation — separate from Task.requiredEquipmentIds requirement fact. */
  assignedTaskId: TaskId | null;
  availableFrom?: string;
};

export type Inspection = {
  id: InspectionId;
  type: string;
  status: InspectionStatus;
  requiredBeforeTaskId: TaskId;
  scheduledTime?: string;
  inspectorName?: string;
};

export type Permit = {
  id: PermitId;
  type: string;
  status: PermitStatus;
  requiredForTaskId: TaskId;
  expirationDate?: string;
};

export type WeatherEvent = {
  id: WeatherEventId;
  projectId: ProjectId;
  timestamp: string;
  condition: string;
  severity: WeatherSeverity;
  affectedTaskTypes: TaskType[];
  startTime: string;
  endTime: string;
};
