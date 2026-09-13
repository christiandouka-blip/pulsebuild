import type { TaskState } from "@/domain/types/task";

/**
 * Explicit external → canonical TaskState table.
 * "In Progress" maps to Executing (canonical). There is no InProgress state.
 */
const TASK_STATE_MAP: Record<string, TaskState> = {
  planned: "Planned",
  "not started": "Planned",
  notstarted: "Planned",
  "not-started": "Planned",
  ready: "Ready",
  waiting: "Waiting",
  blocked: "Blocked",
  executing: "Executing",
  "in progress": "Executing",
  inprogress: "Executing",
  "in-progress": "Executing",
  paused: "Paused",
  completed: "Completed",
  complete: "Completed",
  verified: "Verified",
  closed: "Closed",
};

export function normalizeTaskState(
  raw: string | undefined,
): { status: TaskState } | { unknown: string } {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) {
    return { unknown: "" };
  }
  const status = TASK_STATE_MAP[key];
  if (!status) {
    return { unknown: raw!.trim() };
  }
  return { status };
}
