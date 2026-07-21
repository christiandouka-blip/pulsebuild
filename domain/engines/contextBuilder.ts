import { COMPLETE_TASK_STATES } from "@/domain/constants/scoringConstants";
import type { CrewId, TaskId } from "@/domain/types/identifiers";
import type {
  ContextSnapshot,
  CrewOperationalState,
  RequirementState,
  TaskRequirementStatus,
} from "@/domain/types/context";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task, TaskState } from "@/domain/types/task";

/**
 * Context Builder (CRS §5).
 *
 * Assembles complete operational context from the read-only snapshot before
 * reasoning begins. Pure and deterministic; never mutates the snapshot.
 * Requirement-vs-assignment mismatches are recorded as facts, not errors.
 */
export function buildContext(snapshot: ProjectSnapshot): ContextSnapshot {
  const currentPhase = snapshot.phases.find(
    (p) => p.id === snapshot.project.currentPhaseId,
  );

  const requirementStatusByTask: Record<TaskId, TaskRequirementStatus> = {};
  const taskById = new Map(snapshot.tasks.map((t) => [t.id, t]));
  for (const task of snapshot.tasks) {
    requirementStatusByTask[task.id] = computeRequirementStatus(
      snapshot,
      task,
      taskById,
    );
  }

  const crewStates: Record<CrewId, CrewOperationalState> = {};
  for (const crew of snapshot.crews) {
    if (crew.currentTaskId === null) {
      crewStates[crew.id] = "unassigned";
      continue;
    }
    const assignedStatus = requirementStatusByTask[crew.currentTaskId];
    crewStates[crew.id] =
      assignedStatus && assignedStatus.isBlocked ? "idle_risk" : "active";
  }

  return {
    currentPhaseId: currentPhase?.id,
    currentPhaseName: currentPhase?.name,
    criticalPathTaskIds: snapshot.tasks
      .filter((t) => t.isCriticalPath)
      .map((t) => t.id),
    requirementStatusByTask,
    crewStates,
    builtAtSimulated: snapshot.project.currentSimulatedAt,
  };
}

function isComplete(status: TaskState): boolean {
  return (COMPLETE_TASK_STATES as readonly string[]).includes(status);
}

function computeRequirementStatus(
  snapshot: ProjectSnapshot,
  task: Task,
  taskById: Map<TaskId, Task>,
): TaskRequirementStatus {
  const blockingReasons: string[] = [];

  const predecessorsComplete: RequirementState =
    task.dependencyTaskIds.length === 0
      ? "satisfied"
      : task.dependencyTaskIds.every((id) => {
            const dep = taskById.get(id);
            return dep ? isComplete(dep.status) : false;
          })
        ? "satisfied"
        : "unsatisfied";
  if (predecessorsComplete === "unsatisfied") {
    blockingReasons.push("Predecessor task incomplete");
  }

  const materialsReady = requirementFromList(
    task.requiredMaterialIds,
    (id) => snapshot.materials.find((m) => m.id === id)?.deliveryStatus === "received",
  );
  if (materialsReady === "unsatisfied") blockingReasons.push("Required material not received");

  const gatingInspections = snapshot.inspections.filter(
    (i) => i.requiredBeforeTaskId === task.id,
  );
  const inspectionsPassed: RequirementState =
    gatingInspections.length === 0
      ? "satisfied"
      : gatingInspections.every((i) => i.status === "passed")
        ? "satisfied"
        : "unsatisfied";
  if (inspectionsPassed === "unsatisfied") blockingReasons.push("Required inspection not passed");

  const gatingPermits = snapshot.permits.filter(
    (p) => p.requiredForTaskId === task.id,
  );
  const permitsApproved: RequirementState =
    gatingPermits.length === 0
      ? "satisfied"
      : gatingPermits.every((p) => p.status === "approved")
        ? "satisfied"
        : "unsatisfied";
  if (permitsApproved === "unsatisfied") blockingReasons.push("Required permit not approved");

  const equipmentAvailable = requirementFromList(
    task.requiredEquipmentIds,
    (id) => {
      const equipment = snapshot.equipment.find((e) => e.id === id);
      if (!equipment) return false;
      return equipment.assignedTaskId === task.id || equipment.status === "available";
    },
  );
  if (equipmentAvailable === "unsatisfied") {
    blockingReasons.push("Required equipment unavailable or allocated elsewhere");
  }

  const crewAvailable = requirementFromList(task.requiredCrewIds, (id) => {
    const crew = snapshot.crews.find((c) => c.id === id);
    if (!crew) return false;
    return crew.currentTaskId === task.id || crew.status === "available";
  });
  if (crewAvailable === "unsatisfied") {
    blockingReasons.push("Required crew unavailable or assigned elsewhere");
  }

  // SoT §10 dependency logic: blocked if any required material, inspection,
  // permit, equipment, or crew is unavailable.
  const isBlocked =
    materialsReady === "unsatisfied" ||
    inspectionsPassed === "unsatisfied" ||
    permitsApproved === "unsatisfied" ||
    equipmentAvailable === "unsatisfied" ||
    crewAvailable === "unsatisfied";

  return {
    taskId: task.id,
    predecessorsComplete,
    materialsReady,
    inspectionsPassed,
    permitsApproved,
    equipmentAvailable,
    crewAvailable,
    isBlocked,
    blockingReasons,
  };
}

function requirementFromList(
  ids: readonly string[],
  satisfied: (id: string) => boolean,
): RequirementState {
  if (ids.length === 0) return "satisfied";
  return ids.every(satisfied) ? "satisfied" : "unsatisfied";
}
