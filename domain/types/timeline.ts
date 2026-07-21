/** Append-only committed reasoning record — the sole future voice input. */
export type TimelineEventKind = "observation" | "analysis" | "recommendation";

export type ReasoningTimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  signalId: string;
  summary: string;
  facts: string[];
  committedAtSimulated: string;
  sequenceOrder: number;
};
