import type { TaskType } from "@/domain/types/task";

const TASK_TYPE_MAP: Record<string, TaskType> = {
  sitework: "sitework",
  "site work": "sitework",
  "site-work": "sitework",
  concrete: "concrete",
  framing: "framing",
  steel: "steel",
  interior_prep: "interior_prep",
  "interior prep": "interior_prep",
  "interior-prep": "interior_prep",
  envelope: "envelope",
  electrical_rough: "electrical_rough",
  "electrical rough": "electrical_rough",
  "electrical-rough": "electrical_rough",
  plumbing_rough: "plumbing_rough",
  "plumbing rough": "plumbing_rough",
  "plumbing-rough": "plumbing_rough",
  drywall: "drywall",
  finishes: "finishes",
  finish: "finishes",
};

export function normalizeTaskType(
  raw: string | undefined,
): { taskType: TaskType } | { unknown: string } {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) {
    return { unknown: "" };
  }
  const taskType = TASK_TYPE_MAP[key];
  if (!taskType) {
    return { unknown: raw!.trim() };
  }
  return { taskType };
}
