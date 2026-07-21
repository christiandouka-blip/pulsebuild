import { ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/layout/Badge";
import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import type { SignalReasoning } from "@/domain/engines/reasoningPipeline";

type RecommendationQueueShellProps = {
  reasonings: SignalReasoning[];
};

export function RecommendationQueueShell({
  reasonings,
}: RecommendationQueueShellProps) {
  const withRecommendation = reasonings.filter((r) => r.recommendation !== null);

  return (
    <Panel
      id="recommendation-queue"
      title="Recommendation Queue"
      description="Corrective actions requiring superintendent review"
    >
      {withRecommendation.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Recommendations appear once an operational issue is detected"
          description="Each open issue produces one primary recommendation with evidence, expected impact, and a confidence category. Approval and verification activate in a later phase."
        />
      ) : (
        <ul className="space-y-3">
          {withRecommendation.map((r) => {
            const rec = r.recommendation!;
            return (
              <li
                key={rec.id}
                className="rounded-md border border-surface-border bg-surface-elevated/40 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-100">
                    {rec.primaryAction}
                  </p>
                  {rec.approval.required ? (
                    <Badge variant="tier2">Approval required</Badge>
                  ) : (
                    <Badge variant="muted">Informational</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-text">{rec.expectedBenefit}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-text">
                  <span>Confidence · {rec.confidence.category}</span>
                  <span>Alternatives · {rec.alternatives.length}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
