/**
 * Phase 3C RecoveryRuntime — historical recovery episodes plus derived scores.
 *
 * Historical: append-only IssueRecoveryHistoryEvent log (Recovered / Reopened).
 * Current: Step 5 verification against the current EffectiveProjectSnapshot.
 *
 * evaluationSimulatedAt is caller metadata for Reopened edges only. It does
 * not date Recovered events and does not mutate ProjectSnapshot or other
 * runtimes.
 */

import {
  createEffectiveProjectSnapshot,
  type EffectiveProjectSnapshot,
} from "@/domain/effects/effectiveSnapshot";
import { verifyOperationalIssue } from "@/domain/effects/operationalVerification";
import type {
  IssueResolutionRecord,
  OperationalVerificationResult,
} from "@/domain/effects/types";
import {
  initialRuntime,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import {
  computeEffectiveScores,
  type EffectiveScores,
} from "@/domain/recovery/effectiveScores";
import {
  applyRecoveryHistoryEdges,
  type IssueRecoveryHistoryEvent,
  type RecoveryHistoryTransitionError,
} from "@/domain/recovery/history";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export type RecoveryRuntime = {
  /** Append-only Recovered / Reopened episodes. Never deleted on reopen. */
  history: readonly IssueRecoveryHistoryEvent[];
  /** Current verification-derived recovered issue ids after the last successful recompute. */
  currentlyRecoveredIssueIds: readonly string[];
  /** Current verification pass over Phase 3A open issues. Replaced each recompute. */
  verificationResults: readonly OperationalVerificationResult[];
  /** Derived EffectiveScores from current verification, not historical episode count. */
  scores: EffectiveScores;
};

export type RecomputeRecoveryInput = {
  history: readonly IssueRecoveryHistoryEvent[];
  currentlyRecoveredIssueIds: readonly string[];
  reasoning: ReasoningRuntime;
  effective: EffectiveProjectSnapshot;
  /**
   * Simulated instant of this recovery evaluation. Required when a Reopened
   * edge would be recorded. Ignored for Recovered timestamps.
   */
  evaluationSimulatedAt?: string;
};

export type RecomputeRecoveryResult =
  | { ok: true; runtime: RecoveryRuntime }
  | { ok: false; error: RecoveryHistoryTransitionError };

export function initialRecoveryRuntime(snapshot: ProjectSnapshot): RecoveryRuntime {
  const reasoning = initialRuntime();
  const effective = createEffectiveProjectSnapshot(snapshot);
  return {
    history: [],
    currentlyRecoveredIssueIds: [],
    verificationResults: [],
    scores: computeEffectiveScores({
      runtime: reasoning,
      effective,
      resolutionRecords: [],
    }),
  };
}

/**
 * Verify currently open Phase 3A issues, append edge-triggered history, and
 * recompute EffectiveScores from this pass's Recovered outcomes only.
 */
export function recomputeRecoveryRuntime(
  input: RecomputeRecoveryInput,
): RecomputeRecoveryResult {
  const verificationResults = verifyOpenIssues(input.reasoning, input.effective);
  const historyResult = applyRecoveryHistoryEdges({
    history: input.history,
    currentlyRecoveredIssueIds: input.currentlyRecoveredIssueIds,
    verificationResults,
    evaluationSimulatedAt: input.evaluationSimulatedAt,
  });
  if (!historyResult.ok) return historyResult;

  const currentlyRecoveredIssueIds = currentlyRecoveredIds(verificationResults);
  const scores = computeEffectiveScores({
    runtime: input.reasoning,
    effective: input.effective,
    resolutionRecords: currentResolutionRecords(verificationResults),
  });

  return {
    ok: true,
    runtime: {
      history: historyResult.history,
      currentlyRecoveredIssueIds,
      verificationResults,
      scores,
    },
  };
}

function verifyOpenIssues(
  reasoning: ReasoningRuntime,
  effective: EffectiveProjectSnapshot,
): OperationalVerificationResult[] {
  const results: OperationalVerificationResult[] = [];
  for (const entry of reasoning.reasonings) {
    if (entry.issue === null || entry.issue.status !== "open") continue;
    results.push(
      verifyOperationalIssue({
        issue: entry.issue,
        signal: entry.signal,
        effective,
      }),
    );
  }
  return results;
}

function currentlyRecoveredIds(
  results: readonly OperationalVerificationResult[],
): string[] {
  const ids: string[] = [];
  for (const result of results) {
    if (result.outcome === "Recovered") ids.push(result.issueId);
  }
  return ids;
}

function currentResolutionRecords(
  results: readonly OperationalVerificationResult[],
): IssueResolutionRecord[] {
  const records: IssueResolutionRecord[] = [];
  for (const result of results) {
    if (result.outcome === "Recovered") records.push(result.resolution);
  }
  return records;
}
