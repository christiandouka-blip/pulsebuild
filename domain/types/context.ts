import type {
  CrewId,
  PhaseId,
  TaskId,
} from "@/domain/types/identifiers";

/** Whether a requirement fact is known-satisfied, known-unsatisfied, or unknown. */
export type RequirementState = "satisfied" | "unsatisfied" | "unknown";

/**
 * Per-task requirement satisfaction derived from the read-only snapshot.
 * Requirement-vs-assignment mismatches are recorded as facts, never errors.
 */
export type TaskRequirementStatus = {
  taskId: TaskId;
  predecessorsComplete: RequirementState;
  materialsReady: RequirementState;
  inspectionsPassed: RequirementState;
  permitsApproved: RequirementState;
  equipmentAvailable: RequirementState;
  crewAvailable: RequirementState;
  isBlocked: boolean;
  blockingReasons: string[];
};

export type CrewOperationalState =
  | "active"
  | "idle_risk"
  | "unassigned";

/** Complete operational context assembled before reasoning (CRS §5). */
export type ContextSnapshot = {
  currentPhaseId: PhaseId | undefined;
  currentPhaseName: string | undefined;
  criticalPathTaskIds: TaskId[];
  requirementStatusByTask: Record<TaskId, TaskRequirementStatus>;
  crewStates: Record<CrewId, CrewOperationalState>;
  builtAtSimulated: string;
};
