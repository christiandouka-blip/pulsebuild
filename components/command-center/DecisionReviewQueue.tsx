"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { PriorityBadge } from "@/components/cards/PriorityBadge";
import { DecisionStatusBadge } from "@/components/command-center/DecisionStatusBadge";
import { DecisionWorkflowControls } from "@/components/command-center/DecisionWorkflowControls";
import { Badge } from "@/components/layout/Badge";
import { Button } from "@/components/layout/Button";
import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import type { DecisionRuntime } from "@/domain/decisions";
import type { SignalReasoning } from "@/domain/engines/reasoningPipeline";
import { tierToNumber } from "@/lib/tier";
import {
  actionKindLabel,
  canShowReviewControls,
  formatDecisionError,
  joinDecisionReviews,
  resolveSelectedActionFact,
  reviewEmptyMessage,
  type ActionSelection,
  type DecisionReviewItem,
} from "@/lib/selectors/decisionReviewSelectors";
import {
  workflowCounts,
  workflowStatusLabel,
} from "@/lib/selectors/decisionWorkflowSelectors";
import {
  acknowledgeDecisionCommitted,
  approveDecisionCommitted,
  rejectDecisionCommitted,
} from "@/lib/orchestration/commandCenter";

type DecisionReviewQueueProps = {
  reasonings: SignalReasoning[];
  decisionRuntime: DecisionRuntime;
};

export function DecisionReviewQueue({
  reasonings,
  decisionRuntime,
}: DecisionReviewQueueProps) {
  const items = useMemo(
    () => joinDecisionReviews(reasonings, decisionRuntime),
    [reasonings, decisionRuntime],
  );
  const pendingItems = items.filter((i) => i.decision?.state === "PendingReview");
  const otherItems = items.filter((i) => i.decision?.state !== "PendingReview");
  const empty = reviewEmptyMessage(reasonings, items);
  const counts = workflowCounts(decisionRuntime);

  return (
    <Panel
      id="decision-review-queue"
      title="Decision Review"
      description="Superintendent review, execution confirmation, and verification"
    >
      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-text">
            Needs decision · {counts.pendingReviewCount} · Awaiting execution ·{" "}
            {counts.pendingExecutionCount} · Blocked · {counts.blockedCount} ·
            Awaiting verification · {counts.awaitingVerificationCount} ·
            Verification failed · {counts.verificationFailedCount} · Verified ·{" "}
            {counts.verifiedCount}
          </p>
          {pendingItems.length === 0 && otherItems.length > 0 ? (
            <p className="text-xs text-muted-text" role="status">
              No pending reviews. Approved, in-progress, and completed decisions remain
              below as audit history.
            </p>
          ) : null}
          <ul className="space-y-3">
            {[...pendingItems, ...otherItems].map((item) => (
              <li key={item.recommendation.id}>
                <DecisionReviewCard item={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function DecisionReviewCard({ item }: { item: DecisionReviewItem }) {
  const formId = useId();
  const rejectReasonId = `${formId}-reject-reason`;
  const errorId = `${formId}-error`;

  const [selection, setSelection] = useState<ActionSelection>({
    source: "primary",
  });
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decision = item.decision;
  const facts = item.proposalFacts;
  const showControls = canShowReviewControls(decision);
  const approvalRequired = item.recommendation.approval.required;

  const selectedFact =
    facts && showControls ? resolveSelectedActionFact(facts, selection) : null;

  const evidencePreview = item.recommendation.evidence.slice(0, 3);

  function onApprove() {
    if (!decision || !selectedFact) {
      setError("Action no longer available: selected action could not be resolved.");
      return;
    }
    const result = approveDecisionCommitted(decision.id, {
      selectedActionSource: selection.source,
      alternativeIndex: selection.alternativeIndex,
    });
    if (!result.ok) {
      setError(formatDecisionError(result.error.code, result.error.message));
      return;
    }
    setError(null);
  }

  function onReject() {
    if (!decision) return;
    if (!rejectReason.trim()) {
      setError("Rejection reason required: enter a reason before rejecting.");
      return;
    }
    const result = rejectDecisionCommitted(decision.id, {
      reason: rejectReason.trim(),
    });
    if (!result.ok) {
      setError(formatDecisionError(result.error.code, result.error.message));
      return;
    }
    setError(null);
    setRejectReason("");
  }

  function onAcknowledge() {
    if (!decision) return;
    const result = acknowledgeDecisionCommitted(decision.id);
    if (!result.ok) {
      setError(formatDecisionError(result.error.code, result.error.message));
      return;
    }
    setError(null);
  }

  return (
    <article
      className="rounded-md border border-surface-border bg-surface-elevated/40 px-3 py-3"
      aria-labelledby={`${formId}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={`${formId}-title`} className="text-sm font-medium text-slate-100">
            {item.recommendation.primaryAction}
          </h3>
          <p className="text-xs text-muted-text">{item.expectedBenefit}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge tier={tierToNumber(item.finalTier)} />
          {decision ? (
            <DecisionStatusBadge state={decision.state} />
          ) : (
            <Badge variant="muted" aria-label="Decision status: intake pending">
              Intake pending
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-text">
        <Link
          href={`/signals/${item.signalId}`}
          className="text-signal-cyan underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
        >
          Signal · {item.signalType}
        </Link>
        <span>Confidence · {item.confidence}</span>
        {approvalRequired ? (
          <Badge variant="tier2">Approval required</Badge>
        ) : (
          <Badge variant="muted">No approval required</Badge>
        )}
      </div>

      {item.recommendation.approval.reason ? (
        <p className="mt-2 text-xs text-muted-text">
          Approval reason · {item.recommendation.approval.reason}
        </p>
      ) : null}

      {evidencePreview.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-text" aria-label="Evidence summary">
          {evidencePreview.map((e, i) => (
            <li key={`${e.entityId}-${i}`}>
              <span className="font-data text-slate-200">
                {e.entityType}:{e.entityId}
              </span>{" "}
              — {e.fact}
            </li>
          ))}
          {item.recommendation.evidence.length > evidencePreview.length ? (
            <li>
              +{item.recommendation.evidence.length - evidencePreview.length} more
              evidence facts
            </li>
          ) : null}
        </ul>
      ) : null}

      {decision && decision.state !== "PendingReview" ? (
        <div className="mt-3 space-y-1 text-xs text-muted-text" role="status">
          <p>Workflow · {workflowStatusLabel(decision.state)}</p>
          {decision.selectedAction ? (
            <p>
              Selected action ·{" "}
              <span className="text-slate-100">{decision.selectedAction}</span>
            </p>
          ) : null}
          {decision.state === "Acknowledged" ? (
            <p>Decision acknowledged. No further workflow actions.</p>
          ) : null}
          {decision.state === "Rejected" ? (
            <p>Decision rejected. No further workflow actions.</p>
          ) : null}
          {decision.state === "Cancelled" ? (
            <p>
              Decision cancelled before execution. The linked operational issue remains
              open.
            </p>
          ) : null}
          {decision.state === "Verified" ? (
            <p>
              Workflow verification: superintendent confirmed the action was carried
              out. Operational verification is separate and uses effective project
              facts to prove whether a blocker cleared.
            </p>
          ) : null}
        </div>
      ) : null}

      {decision ? <DecisionWorkflowControls decision={decision} /> : null}

      {!decision ? (
        <p className="mt-3 text-xs text-warning-amber" role="status">
          Recommendation exists but decision intake has not occurred.
        </p>
      ) : null}

      {showControls && facts && approvalRequired ? (
        <fieldset className="mt-3 space-y-2 border-0 p-0">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-text">
            Select action to approve
          </legend>
          <ActionOption
            id={`${formId}-primary`}
            name={`${formId}-action`}
            checked={selection.source === "primary"}
            onChange={() => setSelection({ source: "primary" })}
            label={facts.primaryAction.action}
            kind={actionKindLabel(facts.primaryAction.mutatesOperationalState)}
            mutates={facts.primaryAction.mutatesOperationalState}
          />
          {facts.alternatives.map((alt, index) => (
            <ActionOption
              key={`${alt.action}-${index}`}
              id={`${formId}-alt-${index}`}
              name={`${formId}-action`}
              checked={
                selection.source === "alternative" &&
                selection.alternativeIndex === index
              }
              onChange={() =>
                setSelection({ source: "alternative", alternativeIndex: index })
              }
              label={alt.action}
              kind={actionKindLabel(alt.mutatesOperationalState)}
              mutates={alt.mutatesOperationalState}
            />
          ))}
          {selectedFact ? (
            <p className="text-xs text-muted-text">
              Selected · {actionKindLabel(selectedFact.mutatesOperationalState)}. Approval
              records the decision only; it does not execute the action.
            </p>
          ) : (
            <p className="text-xs text-safety-red" role="alert">
              Selected action is not available on this recommendation.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onApprove}
              disabled={!selectedFact}
              title={
                selectedFact
                  ? "Approve the selected recommendation action"
                  : "Select a valid primary or alternative action"
              }
            >
              Approve selected action
            </Button>
          </div>
          <div className="space-y-2 pt-2">
            <label htmlFor={rejectReasonId} className="block text-xs text-muted-text">
              Rejection reason
            </label>
            <textarea
              id={rejectReasonId}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-surface-border bg-surface-card px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
              placeholder="Explain why this recommendation is rejected"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onReject}
              disabled={!rejectReason.trim()}
              title={
                rejectReason.trim()
                  ? "Reject this recommendation"
                  : "Enter a rejection reason first"
              }
              aria-describedby={rejectReason.trim() ? undefined : rejectReasonId}
            >
              Reject
            </Button>
          </div>
        </fieldset>
      ) : null}

      {showControls && !approvalRequired ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onAcknowledge}
            title="Acknowledge this informational recommendation"
          >
            Acknowledge
          </Button>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} className="mt-3 text-xs text-safety-red" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function ActionOption({
  id,
  name,
  checked,
  onChange,
  label,
  kind,
  mutates,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  kind: string;
  mutates: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer gap-2 rounded-md border border-surface-border/80 bg-surface-card/40 px-2 py-2 text-sm text-slate-100 focus-within:ring-2 focus-within:ring-signal-cyan/50"
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-text">
          {kind}
          {mutates ? " · will require execution later" : " · advisory only"}
        </span>
      </span>
    </label>
  );
}
