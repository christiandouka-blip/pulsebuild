"use client";

import { useId, useState } from "react";

import { Button } from "@/components/layout/Button";
import type { OperationalDecision } from "@/domain/decisions";
import {
  formatWorkflowError,
  latestAuditEvent,
  workflowControlModel,
} from "@/lib/selectors/decisionWorkflowSelectors";
import {
  useDecisionStore,
  type DecisionActionResult,
} from "@/store/useDecisionStore";

type DecisionWorkflowControlsProps = {
  decision: OperationalDecision;
  /** Simulated timestamp recorded on new audit events. */
  simulatedAt?: string;
};

/**
 * Execution and verification surfaces for an approved decision.
 *
 * Phase 3B execution and verification are workflow confirmation only: nothing
 * here mutates ProjectSnapshot, task/crew/material state, or the linked
 * OperationalIssue.
 */
export function DecisionWorkflowControls({
  decision,
  simulatedAt,
}: DecisionWorkflowControlsProps) {
  const baseId = useId();
  const blockReasonId = `${baseId}-block-reason`;
  const failReasonId = `${baseId}-fail-reason`;

  const executeDecision = useDecisionStore((s) => s.executeDecision);
  const blockDecision = useDecisionStore((s) => s.blockDecision);
  const retryDecision = useDecisionStore((s) => s.retryDecision);
  const cancelDecision = useDecisionStore((s) => s.cancelDecision);
  const advanceToVerification = useDecisionStore((s) => s.advanceToVerification);
  const verifyDecision = useDecisionStore((s) => s.verifyDecision);
  const failVerification = useDecisionStore((s) => s.failVerification);

  const [blockReason, setBlockReason] = useState("");
  const [failReason, setFailReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const controls = workflowControlModel(decision);
  const at = simulatedAt ?? decision.updatedAtSimulated;

  if (!controls.showExecutionPanel && !controls.showVerificationPanel) {
    return null;
  }

  const handle = (
    run: () => DecisionActionResult,
    onSuccess?: () => void,
  ) => {
    const result = run();
    if (!result.ok) {
      setError(formatWorkflowError(result.error.code, result.error.message));
      return;
    }
    setError(null);
    onSuccess?.();
  };

  const blockEvent = latestAuditEvent(decision, "BlockExecution");
  const failEvent = latestAuditEvent(decision, "FailVerification");
  const executedEvent = latestAuditEvent(decision, "MarkExecutionComplete");
  const approvedEvent = latestAuditEvent(decision, "ApproveDecision");

  return (
    <section
      className="mt-3 space-y-3 rounded-md border border-surface-border/80 bg-surface-card/30 px-3 py-3"
      aria-label={
        controls.showExecutionPanel
          ? "Execution workflow"
          : "Verification workflow"
      }
    >
      {controls.showExecutionPanel ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-text">
              Field execution
            </h4>
            {decision.selectedAction ? (
              <p className="text-sm text-slate-100">{decision.selectedAction}</p>
            ) : null}
            <p className="text-xs text-muted-text">
              Operational action · Marking this executed records the superintendent
              confirmation only. It does not change task, crew, material, inspection,
              permit, or project data.
            </p>
            {approvedEvent ? (
              <p className="text-xs text-muted-text">
                Approved by {approvedEvent.actor} · {approvedEvent.simulatedAt}
              </p>
            ) : null}
          </div>

          {blockEvent && decision.state === "Blocked" ? (
            <p className="text-xs text-warning-amber" role="status">
              Blocked · {blockEvent.reason} — {blockEvent.actor} ·{" "}
              {blockEvent.simulatedAt}
            </p>
          ) : null}

          {executedEvent && decision.state === "Executed" ? (
            <p className="text-xs text-muted-text" role="status">
              Execution recorded by {executedEvent.actor} ·{" "}
              {executedEvent.simulatedAt}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {controls.canMarkExecuted ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  handle(() => executeDecision(decision.id, { simulatedAt: at }))
                }
                title="Record that the approved field action was carried out"
              >
                Mark Executed
              </Button>
            ) : null}

            {controls.canAdvanceToVerification ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  handle(() =>
                    advanceToVerification(decision.id, { simulatedAt: at }),
                  )
                }
                title="Send the recorded execution to manual verification"
              >
                Send to verification
              </Button>
            ) : null}

            {controls.canRetryExecution ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  handle(() => retryDecision(decision.id, { simulatedAt: at }))
                }
                title="Return this decision to pending execution with the same approved action"
              >
                Retry Execution
              </Button>
            ) : null}

            {controls.canCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  handle(() => cancelDecision(decision.id, { simulatedAt: at }))
                }
                title="Cancel this approved decision without executing it"
              >
                Cancel
              </Button>
            ) : null}
          </div>

          {controls.canBlockExecution ? (
            <div className="space-y-2">
              <label htmlFor={blockReasonId} className="block text-xs text-muted-text">
                Block reason
              </label>
              <textarea
                id={blockReasonId}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-surface-border bg-surface-card px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
                placeholder="Explain what prevents execution"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!blockReason.trim()}
                aria-describedby={blockReason.trim() ? undefined : blockReasonId}
                title={
                  blockReason.trim()
                    ? "Record that execution is blocked"
                    : "Enter a block reason first"
                }
                onClick={() =>
                  handle(
                    () =>
                      blockDecision(decision.id, {
                        simulatedAt: at,
                        reason: blockReason.trim(),
                      }),
                    () => setBlockReason(""),
                  )
                }
              >
                Block
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {controls.showVerificationPanel ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-text">
              Manual verification
            </h4>
            {decision.selectedAction ? (
              <p className="text-sm text-slate-100">{decision.selectedAction}</p>
            ) : null}
            <p className="text-xs text-muted-text">
              Manual superintendent verification. Confirming records that the action
              was completed as intended. It does not resolve the linked operational
              issue, change project data, or adjust Health and Drift.
            </p>
            {executedEvent ? (
              <p className="text-xs text-muted-text">
                Execution recorded by {executedEvent.actor} ·{" "}
                {executedEvent.simulatedAt}
              </p>
            ) : (
              <p className="text-xs text-muted-text">
                Advisory action · no field execution record was required.
              </p>
            )}
            {failEvent && decision.state === "VerificationFailed" ? (
              <p className="text-xs text-safety-red" role="status">
                Verification failed · {failEvent.reason} — {failEvent.actor} ·{" "}
                {failEvent.simulatedAt}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {controls.canVerify ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() =>
                  handle(() => verifyDecision(decision.id, { simulatedAt: at }))
                }
                title="Confirm the recorded action was completed as intended"
              >
                Verify
              </Button>
            ) : null}

            {controls.canRetryExecution ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  handle(() => retryDecision(decision.id, { simulatedAt: at }))
                }
                title="Return this decision to pending execution with the same approved action"
              >
                Retry Execution
              </Button>
            ) : null}
          </div>

          {controls.canFailVerification ? (
            <div className="space-y-2">
              <label htmlFor={failReasonId} className="block text-xs text-muted-text">
                Verification failure reason
              </label>
              <textarea
                id={failReasonId}
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-surface-border bg-surface-card px-2 py-1.5 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
                placeholder="Explain what could not be confirmed"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!failReason.trim()}
                aria-describedby={failReason.trim() ? undefined : failReasonId}
                title={
                  failReason.trim()
                    ? "Record that verification failed"
                    : "Enter a verification failure reason first"
                }
                onClick={() =>
                  handle(
                    () =>
                      failVerification(decision.id, {
                        simulatedAt: at,
                        reason: failReason.trim(),
                      }),
                    () => setFailReason(""),
                  )
                }
              >
                Fail Verification
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-safety-red" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
