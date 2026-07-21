"use client";

import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";

import { PriorityBadge } from "@/components/cards/PriorityBadge";
import { Badge } from "@/components/layout/Badge";
import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import { useReasoningStore } from "@/store/useReasoningStore";
import { tierToNumber } from "@/lib/tier";

type SignalDetailShellProps = {
  signalId: string;
};

export function SignalDetailShell({ signalId }: SignalDetailShellProps) {
  const reasoning = useReasoningStore((s) => s.getReasoningBySignalId(signalId));

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-surface-border bg-surface-elevated/60 px-4 py-4 md:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-signal-cyan hover:text-signal-cyan/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Command Center
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-slate-100">Signal Detail</h1>
        <p className="font-data mt-1 text-sm text-muted-text">ID · {signalId}</p>
      </header>

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
        {!reasoning ? (
          <Panel title="Signal not available" description="No committed reasoning for this signal">
            <EmptyState
              icon={GitBranch}
              title="This signal has not been processed in the current session"
              description="Return to the Command Center and use “Process Next Observation” to generate deterministic reasoning, then open the signal from the Live Signal Feed."
            />
          </Panel>
        ) : (
          <>
            <Panel title="Why this matters" description="Deterministic operational analysis">
              <div className="space-y-3 text-sm text-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{reasoning.signal.type}</span>
                  <PriorityBadge tier={tierToNumber(reasoning.priority.finalTier)} />
                  <Badge variant="muted">
                    Baseline hint {reasoning.priority.baselineHint}
                  </Badge>
                  <Badge variant="status">
                    Confidence {reasoning.priority.confidence.category}
                  </Badge>
                </div>
                <p className="text-muted-text">
                  {reasoning.prediction.projectedConsequence}
                </p>
              </div>
            </Panel>

            <Panel title="Priority reasoning" description="Documented rule-table adjustments">
              <ul className="space-y-1 text-sm text-muted-text">
                {reasoning.priority.adjustments.map((adj, i) => (
                  <li key={`${adj.ruleId}-${i}`}>
                    <span className="text-slate-100">{adj.ruleId}</span> ·{" "}
                    {adj.effect} → {adj.resultingTier} — {adj.description}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Prediction" description="Deterministic operational projection">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <Fact label="Critical-path exposure" value={reasoning.prediction.criticalPathExposure} />
                <Fact
                  label="Schedule exposure"
                  value={
                    reasoning.prediction.scheduleExposure.estimatedHours !== null
                      ? `${reasoning.prediction.scheduleExposure.category} (~${reasoning.prediction.scheduleExposure.estimatedHours}h)`
                      : reasoning.prediction.scheduleExposure.category
                  }
                />
                <Fact label="Idle-crew risk" value={reasoning.prediction.idleCrewRisk.category} />
                <Fact label="Cascade depth" value={String(reasoning.prediction.cascadeDepth)} />
              </dl>
            </Panel>

            <Panel title="Dependency chain" description="Affected downstream work">
              {reasoning.dependency.affectedTaskIds.length === 0 ? (
                <p className="text-sm text-muted-text">No downstream tasks affected.</p>
              ) : (
                <p className="font-data text-sm text-slate-100">
                  {reasoning.signal.relatedTaskId} →{" "}
                  {reasoning.dependency.affectedTaskIds.join(" → ")}
                </p>
              )}
            </Panel>

            {reasoning.recommendation ? (
              <Panel title="Recommendation" description="Generation only — approval deferred">
                <p className="text-sm font-medium text-slate-100">
                  {reasoning.recommendation.primaryAction}
                </p>
                <p className="mt-1 text-sm text-muted-text">
                  {reasoning.recommendation.rationale}
                </p>
                <p className="mt-1 text-sm text-muted-text">
                  {reasoning.recommendation.expectedBenefit}
                </p>
                <div className="mt-2">
                  {reasoning.recommendation.approval.required ? (
                    <Badge variant="tier2">
                      Approval required · {reasoning.recommendation.approval.reason}
                    </Badge>
                  ) : (
                    <Badge variant="muted">No approval required</Badge>
                  )}
                </div>
              </Panel>
            ) : null}

            <Panel title="Evidence" description="Traceable supporting facts">
              <ul className="space-y-1 text-sm text-muted-text">
                {reasoning.priority.evidence.map((e, i) => (
                  <li key={`p-${i}`}>
                    <span className="font-data text-slate-100">
                      {e.entityType}:{e.entityId}
                    </span>{" "}
                    — {e.fact}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Approval &amp; verification" description="Activate in a later phase">
              <EmptyState
                icon={GitBranch}
                title="Approval and verification are deferred"
                description="Phase 3A generates deterministic analysis and recommendations only. Human approval, execution, and verification activate in a later approved increment."
                className="py-6"
              />
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-text">{label}</dt>
      <dd className="text-slate-100">{value}</dd>
    </div>
  );
}
