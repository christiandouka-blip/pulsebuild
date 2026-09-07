import { History } from "lucide-react";

import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import type { OperationalDecision } from "@/domain/decisions";
import type { OverlayRuntime } from "@/domain/effects/runtime";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { ReasoningTimelineEvent } from "@/domain/types/timeline";
import { joinOperationalTimeline } from "@/lib/selectors/combinedTimelineSelectors";

type TimelinePanelShellProps = {
  events: ReasoningTimelineEvent[];
  decisions?: readonly OperationalDecision[];
  overlay?: OverlayRuntime | null;
  recovery?: RecoveryRuntime | null;
};

const sourceClass: Record<string, string> = {
  decision: "text-xs font-medium uppercase tracking-wide text-build-green",
  overlay: "text-xs font-medium uppercase tracking-wide text-warning-amber",
  recovery: "text-xs font-medium uppercase tracking-wide text-signal-cyan",
  score: "text-xs font-medium uppercase tracking-wide text-slate-200",
  reasoning: "text-xs font-medium uppercase tracking-wide text-signal-cyan",
};

export function TimelinePanelShell({
  events,
  decisions = [],
  overlay = null,
  recovery = null,
}: TimelinePanelShellProps) {
  const entries = joinOperationalTimeline(events, decisions, {
    effectHistory: overlay?.effectHistory,
    applicationResults: overlay?.applicationResults,
    recoveryHistory: recovery?.history,
  });

  return (
    <Panel
      id="timeline"
      title="Operational Timeline"
      description="Audit record of reasoning, decisions, overlay writes, and operational recovery"
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Every reasoning, decision, and recovery step will be logged here"
          description="Observation, analysis, and recommendation records are committed in order, followed by workflow decisions, overlay effects, and proven operational recovery."
        />
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li
              key={`${entry.source}-${entry.id}`}
              className="rounded-md border border-surface-border bg-surface-elevated/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={sourceClass[entry.source] ?? sourceClass.reasoning}>
                  {entry.source === "reasoning" ? "" : `${labelPrefix(entry.source)} · `}
                  {entry.label}
                </span>
                <span className="font-data text-[10px] text-muted-text">
                  {entry.simulatedAt}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-100">{entry.summary}</p>
              {entry.facts.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-text">
                  {entry.facts.map((fact, index) => (
                    <li key={`${entry.id}-fact-${index}`}>{fact}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function labelPrefix(source: string): string {
  switch (source) {
    case "decision":
      return "Decision";
    case "overlay":
      return "Overlay";
    case "recovery":
      return "Recovery";
    case "score":
      return "Score";
    default:
      return "";
  }
}
