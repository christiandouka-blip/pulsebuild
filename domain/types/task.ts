import type { PhaseId, ProjectId, TaskId } from "@/domain/types/identifiers";
import type { CrewId } from "@/domain/types/identifiers";
import type { MaterialId } from "@/domain/types/identifiers";
import type { EquipmentId } from "@/domain/types/identifiers";

/** Canonical task states — PO Decision 8. */
export type TaskState =
  | "Planned"
  | "Ready"
  | "Waiting"
  | "Blocked"
  | "Executing"
  | "Paused"
  | "Completed"
  | "Verified"
  | "Closed";

/**
 * Narrow task classification for future WeatherEvent.affectedTaskTypes matching.
 * Not a weather reasoning field.
 */
export type TaskType =
  | "sitework"
  | "concrete"
  | "framing"
  | "steel"
  | "interior_prep"
  | "envelope"
  | "electrical_rough"
  | "plumbing_rough"
  | "drywall"
  | "finishes";

export type Task = {
  id: TaskId;
  projectId: ProjectId;
  phaseId: PhaseId;
  name: string;
  status: TaskState;
  taskType: TaskType;
  plannedStart: string;
  plannedEnd: string;
  dependencyTaskIds: TaskId[];
  requiredCrewIds: CrewId[];
  requiredMaterialIds: MaterialId[];
  requiredEquipmentIds: EquipmentId[];
  /** Static documented task attribute — SoT §18. Not final Priority Engine tier output. */
  priorityWeight: number;
  isCriticalPath: boolean;
  actualStart?: string;
  actualEnd?: string;
};
