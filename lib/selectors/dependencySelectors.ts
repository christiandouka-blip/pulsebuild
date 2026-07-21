import type { TaskId } from "@/domain/types/identifiers";
import type { Task } from "@/domain/types/task";

/**
 * Pure derived dependency traversal — no stored duplicates, no snapshot mutation.
 * Predecessors are stored on Task.dependencyTaskIds; successors are derived here.
 */

export function buildSuccessorMap(tasks: Task[]): Map<TaskId, TaskId[]> {
  const map = new Map<TaskId, TaskId[]>();
  for (const task of tasks) {
    for (const depId of task.dependencyTaskIds) {
      const existing = map.get(depId) ?? [];
      existing.push(task.id);
      map.set(depId, existing);
    }
  }
  return map;
}

export type TransitiveSuccessors = {
  immediate: TaskId[];
  affected: TaskId[];
  maxDepth: number;
};

/** Breadth-first walk of downstream tasks. Deterministic ordering by discovery. */
export function transitiveSuccessors(
  tasks: Task[],
  rootTaskId: TaskId,
): TransitiveSuccessors {
  const successorMap = buildSuccessorMap(tasks);
  const immediate = successorMap.get(rootTaskId) ?? [];
  const affected: TaskId[] = [];
  const seen = new Set<TaskId>([rootTaskId]);
  let maxDepth = 0;

  let frontier: TaskId[] = [...immediate];
  let depth = 1;
  while (frontier.length > 0) {
    const next: TaskId[] = [];
    for (const taskId of frontier) {
      if (seen.has(taskId)) continue;
      seen.add(taskId);
      affected.push(taskId);
      maxDepth = Math.max(maxDepth, depth);
      for (const child of successorMap.get(taskId) ?? []) {
        if (!seen.has(child)) next.push(child);
      }
    }
    frontier = next;
    depth += 1;
  }

  return { immediate: [...immediate], affected, maxDepth };
}
