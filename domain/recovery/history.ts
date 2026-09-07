/**
 * Phase 3C append-only recovery-history events.
 *
 * Current recovered/active truth is NOT derived from this log. History records
 * edge transitions only. Recovered timestamps come from Step 5 proving records.
 * Reopened timestamps come from caller-supplied evaluationSimulatedAt.
 *
 * Monotonicity: a Reopened event must be strictly later than the latest
 * Recovered event for that issueId+verificationRuleId. Combined timeline
 * same-instant sequencing (source rank / sequence / id) does not apply to
 * this log, which has no sequenceOrder.
 */

import type {
  OperationalVerificationResult,
  VerificationFact,
  VerificationRecovered,
  VerificationRuleId,
} from "@/domain/effects/types";
import type { TaskId } from "@/domain/types/identifiers";

export type RecoveryHistoryEventType = "Recovered" | "Reopened";

export type IssueRecoveryHistoryEvent = {
  id: string;
  issueId: string;
  signalId: string;
  verificationRuleId: VerificationRuleId;
  episodeNumber: number;
  type: RecoveryHistoryEventType;
  simulatedAt: string;
  relatedEntityType: string;
  relatedEntityId: string;
  taskId: TaskId;
  sourceEffectIds: readonly string[];
  evidence: readonly VerificationFact[];
};

export type RecoveryHistoryTransitionErrorCode =
  | "MISSING_EVALUATION_SIMULATED_AT"
  | "REOPEN_TIMESTAMP_NOT_AFTER_RECOVERY";

export type RecoveryHistoryTransitionError = {
  code: RecoveryHistoryTransitionErrorCode;
  issueId: string;
  verificationRuleId: VerificationRuleId | null;
  episodeNumber: number;
  message: string;
  evaluationSimulatedAt: string | null;
  latestRecoverySimulatedAt: string | null;
};

export type ApplyRecoveryHistoryResult =
  | {
      ok: true;
      history: readonly IssueRecoveryHistoryEvent[];
    }
  | { ok: false; error: RecoveryHistoryTransitionError };

export type ApplyRecoveryHistoryInput = {
  history: readonly IssueRecoveryHistoryEvent[];
  currentlyRecoveredIssueIds: readonly string[];
  verificationResults: readonly OperationalVerificationResult[];
  evaluationSimulatedAt?: string;
};

export function recoveredEventId(
  issueId: string,
  ruleId: VerificationRuleId,
  episodeNumber: number,
): string {
  return `recovery-${issueId}-${ruleId}-episode-${episodeNumber}`;
}

export function reopenedEventId(
  issueId: string,
  ruleId: VerificationRuleId,
  episodeNumber: number,
): string {
  return `reopen-${issueId}-${ruleId}-episode-${episodeNumber}`;
}

export function applyRecoveryHistoryEdges(
  input: ApplyRecoveryHistoryInput,
): ApplyRecoveryHistoryResult {
  const previous = new Set(input.currentlyRecoveredIssueIds);
  const appended: IssueRecoveryHistoryEvent[] = [];

  for (const result of input.verificationResults) {
    const wasRecovered = previous.has(result.issueId);
    const isRecovered = result.outcome === "Recovered";

    if (!wasRecovered && isRecovered) {
      appended.push(
        recoveredEvent(result, [...input.history, ...appended]),
      );
      continue;
    }

    if (wasRecovered && !isRecovered) {
      const reopened = reopenedEvent(
        result.issueId,
        [...input.history, ...appended],
        remainingEvidence(result),
        input.evaluationSimulatedAt,
      );
      if (!reopened.ok) return reopened;
      appended.push(reopened.event);
    }
  }

  if (appended.length === 0) {
    return { ok: true, history: input.history };
  }
  return { ok: true, history: [...input.history, ...appended] };
}

function recoveredEvent(
  result: VerificationRecovered,
  history: readonly IssueRecoveryHistoryEvent[],
): IssueRecoveryHistoryEvent {
  const episodeNumber =
    recoveredEpisodeCount(history, result.issueId, result.verificationRuleId) +
    1;
  return {
    id: recoveredEventId(
      result.issueId,
      result.verificationRuleId,
      episodeNumber,
    ),
    issueId: result.issueId,
    signalId: result.signalId,
    verificationRuleId: result.verificationRuleId,
    episodeNumber,
    type: "Recovered",
    simulatedAt: result.simulatedAt,
    relatedEntityType: result.relatedEntityType,
    relatedEntityId: result.relatedEntityId,
    taskId: result.taskId,
    sourceEffectIds: result.sourceEffectIds,
    evidence: result.provingFacts,
  };
}

function reopenedEvent(
  issueId: string,
  history: readonly IssueRecoveryHistoryEvent[],
  evidence: readonly VerificationFact[],
  evaluationSimulatedAt: string | undefined,
):
  | { ok: true; event: IssueRecoveryHistoryEvent }
  | { ok: false; error: RecoveryHistoryTransitionError } {
  const lastRecovered = latestRecoveredEvent(history, issueId);
  if (!lastRecovered) {
    return {
      ok: false,
      error: {
        code: "MISSING_EVALUATION_SIMULATED_AT",
        issueId,
        verificationRuleId: null,
        episodeNumber: 0,
        message: `Issue ${issueId} was tracked as recovered but has no Recovered history event.`,
        evaluationSimulatedAt: evaluationSimulatedAt ?? null,
        latestRecoverySimulatedAt: null,
      },
    };
  }

  const evaluation = (evaluationSimulatedAt ?? "").trim();
  if (!evaluation) {
    return {
      ok: false,
      error: {
        code: "MISSING_EVALUATION_SIMULATED_AT",
        issueId,
        verificationRuleId: lastRecovered.verificationRuleId,
        episodeNumber: lastRecovered.episodeNumber,
        message: `Reopened history for ${issueId} requires an explicit evaluationSimulatedAt from the caller.`,
        evaluationSimulatedAt: null,
        latestRecoverySimulatedAt: lastRecovered.simulatedAt,
      },
    };
  }

  if (evaluation <= lastRecovered.simulatedAt) {
    return {
      ok: false,
      error: {
        code: "REOPEN_TIMESTAMP_NOT_AFTER_RECOVERY",
        issueId,
        verificationRuleId: lastRecovered.verificationRuleId,
        episodeNumber: lastRecovered.episodeNumber,
        message: `Reopened evaluationSimulatedAt ${evaluation} must be strictly after Recovered simulatedAt ${lastRecovered.simulatedAt} for ${issueId} episode ${lastRecovered.episodeNumber}.`,
        evaluationSimulatedAt: evaluation,
        latestRecoverySimulatedAt: lastRecovered.simulatedAt,
      },
    };
  }

  return {
    ok: true,
    event: {
      id: reopenedEventId(
        lastRecovered.issueId,
        lastRecovered.verificationRuleId,
        lastRecovered.episodeNumber,
      ),
      issueId: lastRecovered.issueId,
      signalId: lastRecovered.signalId,
      verificationRuleId: lastRecovered.verificationRuleId,
      episodeNumber: lastRecovered.episodeNumber,
      type: "Reopened",
      simulatedAt: evaluation,
      relatedEntityType: lastRecovered.relatedEntityType,
      relatedEntityId: lastRecovered.relatedEntityId,
      taskId: lastRecovered.taskId,
      sourceEffectIds: [],
      evidence,
    },
  };
}

function recoveredEpisodeCount(
  history: readonly IssueRecoveryHistoryEvent[],
  issueId: string,
  ruleId: VerificationRuleId,
): number {
  let count = 0;
  for (const event of history) {
    if (
      event.type === "Recovered" &&
      event.issueId === issueId &&
      event.verificationRuleId === ruleId
    ) {
      count += 1;
    }
  }
  return count;
}

function latestRecoveredEvent(
  history: readonly IssueRecoveryHistoryEvent[],
  issueId: string,
): IssueRecoveryHistoryEvent | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i];
    if (event.type === "Recovered" && event.issueId === issueId) return event;
  }
  return undefined;
}

function remainingEvidence(
  result: OperationalVerificationResult,
): readonly VerificationFact[] {
  if (result.outcome === "StillActive") {
    return [
      result.issueCondition,
      result.currentEffectiveCondition,
      ...result.remainingFacts,
    ];
  }
  if (result.outcome === "NotVerifiable") {
    return [
      {
        entityType: "issue",
        entityId: result.issueId,
        fact: result.missingRule,
      },
    ];
  }
  if (result.outcome === "Rejected") {
    return [
      {
        entityType: "issue",
        entityId: result.issueId,
        fact: result.message,
      },
    ];
  }
  return [];
}
