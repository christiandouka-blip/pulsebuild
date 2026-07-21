import Link from "next/link";
import { Radio } from "lucide-react";

import { PriorityBadge } from "@/components/cards/PriorityBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import type { SignalReasoning } from "@/domain/engines/reasoningPipeline";
import { tierToNumber } from "@/lib/tier";

type LiveSignalFeedShellProps = {
  reasonings: SignalReasoning[];
};

export function LiveSignalFeedShell({ reasonings }: LiveSignalFeedShellProps) {
  const ordered = [...reasonings].sort(
    (a, b) => b.signal.sequenceOrder - a.signal.sequenceOrder,
  );

  return (
    <Panel
      id="live-signal-feed"
      title="Live Signal Feed"
      description="Newest operational events with priority classification"
    >
      {ordered.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No observations processed yet"
          description="Use “Process Next Observation” to detect the next approved operational event. Signals will appear here newest first with their calculated priority tier."
        />
      ) : (
        <ul className="space-y-2">
          {ordered.map((r) => (
            <li key={r.signal.id}>
              <Link
                href={`/signals/${r.signal.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-surface-border bg-surface-elevated/40 px-3 py-2 transition-colors hover:bg-surface-elevated"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {r.signal.type}
                  </p>
                  <p className="font-data truncate text-xs text-muted-text">
                    {r.signal.relatedTaskId} · {r.signal.source}
                  </p>
                </div>
                <PriorityBadge tier={tierToNumber(r.priority.finalTier)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
