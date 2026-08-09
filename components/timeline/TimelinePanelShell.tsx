import { History } from "lucide-react";

import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import type { OperationalDecision } from "@/domain/decisions";
import type { ReasoningTimelineEvent } from "@/domain/types/timeline";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";

type TimelinePanelShellProps = {
  events: ReasoningTimelineEvent[];
  /** Phase 3B decision history, joined for display only. */
  decisions?: readonly OperationalDecision[];
};

export function TimelinePanelShell({
  events,
  decisions = [],
}: TimelinePanelShellProps) {
  const entries = joinOperationalTimeline(events, decisions);

  return (
    <Panel
      id="timeline"
      title="Operational Timeline"
      description="Permanent audit record of reasoning and superintendent decisions"
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Every reasoning and decision step will be logged here"
          description="Observation, priority analysis, and recommendation records are committed in order, followed by approval, execution, and verification decisions."
        />
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li
              key={`${entry.source}-${entry.id}`}
              className="rounded-md border border-surface-border bg-surface-elevated/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    entry.source === "decision"
                      ? "text-xs font-medium uppercase tracking-wide text-build-green"
                      : "text-xs font-medium uppercase tracking-wide text-signal-cyan"
                  }
                >
                  {entry.source === "decision" ? "Decision · " : ""}
                  {entry.label}
                </span>
                <span className="font-data text-[10px] text-muted-text">
                  {entry.simulatedAt}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-100">{entry.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
