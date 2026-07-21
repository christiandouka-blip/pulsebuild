import type { CrewId, TaskId } from "@/domain/types/identifiers";
import type { ContextSnapshot } from "@/domain/types/context";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

/**
 * Unified idle-crew-risk definition (Phase 3A hardening).
 *
 * A crew is at idle risk only when ALL of the following hold:
 * 1. The crew is assigned to, or required by, a blocked task whose ID is in
 *    the provided scope (current signal related task and/or open-issue origin
 *    tasks — not unrelated blocked work elsewhere on the project).
 * 2. The crew has no approved alternate assignment — Phase 3A has no approval
 *    workflow, so an alternate exists only when the crew is currently assigned
 *    to a different, non-blocked task.
 * 3. The blocked-task fact is deterministically known from ContextSnapshot.
 *
 * Unrelated blocked-task crews outside the scope are never reported.
 */
export function resolveIdleCrewIds(
  snapshot: ProjectSnapshot,
  context: ContextSnapshot,
  scopedTaskIds: ReadonlySet<TaskId>,
): CrewId[] {
  if (scopedTaskIds.size === 0) return [];

  const blockedScoped = new Set<TaskId>();
  for (const taskId of scopedTaskIds) {
    const req = context.requirementStatusByTask[taskId];
    if (req?.isBlocked) blockedScoped.add(taskId);
  }
  if (blockedScoped.size === 0) return [];

  const ids: CrewId[] = [];
  for (const crew of snapshot.crews) {
    const assignedBlocked =
      crew.currentTaskId !== null && blockedScoped.has(crew.currentTaskId);

    const requiredByBlocked = snapshot.tasks.some(
      (task) =>
        blockedScoped.has(task.id) && task.requiredCrewIds.includes(crew.id),
    );

    if (!assignedBlocked && !requiredByBlocked) continue;

    // Approved alternate: assigned to a different task that is not blocked.
    const hasAlternate =
      crew.currentTaskId !== null &&
      !blockedScoped.has(crew.currentTaskId) &&
      context.requirementStatusByTask[crew.currentTaskId]?.isBlocked !== true;

    if (hasAlternate) continue;

    ids.push(crew.id);
  }

  return ids;
}

/** Scope for a single signal: related task only. */
export function signalIdleScope(relatedTaskId: TaskId): Set<TaskId> {
  return new Set([relatedTaskId]);
}

/** Scope for Drift: open-issue origin tasks only. */
export function openIssueIdleScope(openIssueTaskIds: readonly TaskId[]): Set<TaskId> {
  return new Set(openIssueTaskIds.filter((id): id is TaskId => id !== null));
}
