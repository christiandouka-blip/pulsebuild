import { History } from "lucide-react";

import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import type { ReasoningTimelineEvent } from "@/domain/types/timeline";

type TimelinePanelShellProps = {
  events: ReasoningTimelineEvent[];
};

const kindLabel: Record<ReasoningTimelineEvent["kind"], string> = {
  observation: "Observation",
  analysis: "Analysis",
  recommendation: "Recommendation",
};

export function TimelinePanelShell({ events }: TimelinePanelShellProps) {
  const ordered = [...events].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  return (
    <Panel
      id="timeline"
      title="Operational Timeline"
      description="Permanent audit record of observations, analysis, and recommendations"
    >
      {ordered.length === 0 ? (
        <EmptyState
          icon={History}
          title="Every reasoning step will be logged here"
          description="Observation, priority analysis, and recommendation records are committed in order. Approval and verification records activate in a later phase."
        />
      ) : (
        <ol className="space-y-2">
          {ordered.map((event) => (
            <li
              key={event.id}
              className="rounded-md border border-surface-border bg-surface-elevated/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-signal-cyan">
                  {kindLabel[event.kind]}
                </span>
                <span className="font-data text-[10px] text-muted-text">
                  {event.committedAtSimulated}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-100">{event.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
