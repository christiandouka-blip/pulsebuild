import type { TaskId } from "@/domain/types/identifiers";
import type { PriorityTier } from "@/domain/types/signal";

/**
 * Operational issue lifecycle — Phase 3A subset.
 * Later transitions (resolved/archived) are deferred to 3B/3C.
 */
export type IssueStatus = "open" | "monitoring";

/**
 * A derived operational problem — PO Decision 7.
 *
 * Separate from ProjectSignal. Not every signal creates an issue; positive
 * recovery signals (TaskComplete, DeliveryReceived) create none.
 */
export type OperationalIssue = {
  id: string;
  signalId: string;
  taskId: TaskId | null;
  kind: string;
  status: IssueStatus;
  finalTier: PriorityTier;
  openedAtSimulated: string;
};
