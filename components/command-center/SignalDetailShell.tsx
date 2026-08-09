"use client";

import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";

import { PriorityBadge } from "@/components/cards/PriorityBadge";
import { DecisionStatusBadge } from "@/components/command-center/DecisionStatusBadge";
import { DecisionWorkflowControls } from "@/components/command-center/DecisionWorkflowControls";
import { Badge } from "@/components/layout/Badge";
import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { workflowStatusLabel } from "@/lib/selectors/decisionWorkflowSelectors";
import { tierToNumber } from "@/lib/tier";

type SignalDetailShellProps = {
  signalId: string;
};

export function SignalDetailShell({ signalId }: SignalDetailShellProps) {
  const reasoning = useReasoningStore((s) => s.getReasoningBySignalId(signalId));
  const decisions = useDecisionStore((s) => s.bySignalId(signalId));
  const decision = decisions[0] ?? null;

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
              <Panel title="Recommendation" description="Immutable Phase 3A proposal">
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

            <Panel
              title="Decision workflow"
              description="Superintendent review status and audit trail"
            >
              {!reasoning.recommendation ? (
                <p className="text-sm text-muted-text">
                  No recommendation was generated for this signal.
                </p>
              ) : !decision ? (
                <EmptyState
                  icon={GitBranch}
                  title="Decision intake has not occurred"
                  description="Return to the Command Center and process observations so Decision Review can open a workflow record for this recommendation."
                  className="py-6"
                />
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <DecisionStatusBadge state={decision.state} />
                    {decision.approvalRequired ? (
                      <Badge variant="tier2">Approval required</Badge>
                    ) : (
                      <Badge variant="muted">No approval required</Badge>
                    )}
                  </div>
                  <p className="text-muted-text">
                    Workflow · {workflowStatusLabel(decision.state)}
                  </p>
                  {decision.selectedAction ? (
                    <p className="text-slate-100">
                      Selected action · {decision.selectedAction}
                      {decision.selectedActionSource
                        ? ` (${decision.selectedActionSource})`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-muted-text">No action selected yet.</p>
                  )}
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-text">
                      Audit trail
                    </h3>
                    {decision.auditTrail.length === 0 ? (
                      <p className="mt-1 text-muted-text">No decision events recorded yet.</p>
                    ) : (
                      <ol className="mt-2 space-y-2">
                        {decision.auditTrail.map((event) => (
                          <li
                            key={event.id}
                            className="rounded-md border border-surface-border/70 bg-surface-card/30 px-2 py-2 text-xs text-muted-text"
                          >
                            <p className="text-slate-100">
                              {event.command}: {event.fromState} → {event.toState}
                            </p>
                            <p>
                              Actor · {event.actor} · {event.simulatedAt}
                            </p>
                            {event.reason ? <p>Reason · {event.reason}</p> : null}
                            {event.notes ? <p>Notes · {event.notes}</p> : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <DecisionWorkflowControls decision={decision} />
                  <p className="text-xs text-muted-text">
                    Execution and verification here are workflow confirmations only.
                    Project data, operational issues, Health, and Drift are unchanged.
                  </p>
                </div>
              )}
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
