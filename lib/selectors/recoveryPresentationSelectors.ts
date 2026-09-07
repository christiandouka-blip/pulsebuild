/**
 * Presentation selectors for Phase 3C effective scores and recovery summary.
 * Pure. Do not advance the simulated clock. Do not recompute Health/Drift.
 */

import type { EffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import type { OperationalVerificationResult } from "@/domain/effects/types";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { IssueRecoveryHistoryEvent } from "@/domain/recovery/history";
import type { RecoveryRuntime } from "@/domain/recovery/runtime";
import type { DriftResult, HealthResult } from "@/domain/types/scoring";

export type RecoverySummaryView = {
  currentlyRecoveredCount: number;
  currentlyOpenCount: number;
  historicalRecoveredEpisodeCount: number;
  currentlyReopenedCount: number;
  explanation: string;
};

export function effectiveHealth(recovery: RecoveryRuntime | null): HealthResult | null {
  return recovery?.scores.health ?? null;
}

export function effectiveDrift(recovery: RecoveryRuntime | null): DriftResult | null {
  return recovery?.scores.drift ?? null;
}

/** Scores the Command Center displays: RecoveryRuntime when present, else Phase 3A. */
export function presentationScores(
  reasoning: ReasoningRuntime,
  recovery: RecoveryRuntime | null,
): { health: HealthResult; drift: DriftResult } {
  return {
    health: recovery?.scores.health ?? reasoning.health,
    drift: recovery?.scores.drift ?? reasoning.drift,
  };
}

export function recoverySummaryView(
  reasoning: ReasoningRuntime,
  recovery: RecoveryRuntime | null,
): RecoverySummaryView {
  if (!recovery) {
    const open = reasoning.reasonings.filter(
      (r) => r.issue !== null && r.issue.status === "open",
    ).length;
    return {
      currentlyRecoveredCount: 0,
      currentlyOpenCount: open,
      historicalRecoveredEpisodeCount: 0,
      currentlyReopenedCount: 0,
      explanation:
        open === 0
          ? "No operational issues in the current session."
          : "No verified operational recovery yet.",
    };
  }

  const currentlyRecoveredCount = recovery.currentlyRecoveredIssueIds.length;
  const currentlyOpenCount = recovery.scores.effectiveOpenIssueIds.length;
  const historicalRecoveredEpisodeCount = recovery.history.filter(
    (event) => event.type === "Recovered",
  ).length;
  const currentlyReopenedCount = countCurrentlyReopened(recovery);

  return {
    currentlyRecoveredCount,
    currentlyOpenCount,
    historicalRecoveredEpisodeCount,
    currentlyReopenedCount,
    explanation: recoveryExplanation(currentlyRecoveredCount, currentlyOpenCount),
  };
}

export function countEffectiveOpenTier1(
  reasoning: ReasoningRuntime,
  recovery: RecoveryRuntime | null,
): number {
  const openIds = new Set(
    recovery?.scores.effectiveOpenIssueIds ??
      reasoning.reasonings
        .filter((r) => r.issue !== null && r.issue.status === "open")
        .map((r) => r.issue!.id),
  );
  return reasoning.reasonings.filter(
    (r) =>
      r.issue !== null &&
      openIds.has(r.issue.id) &&
      r.issue.finalTier === "Tier1",
  ).length;
}

function countCurrentlyReopened(recovery: RecoveryRuntime): number {
  const recovered = new Set(recovery.currentlyRecoveredIssueIds);
  const lastType = new Map<string, "Recovered" | "Reopened">();
  for (const event of recovery.history) {
    lastType.set(event.issueId, event.type);
  }
  let count = 0;
  for (const [issueId, type] of lastType) {
    if (type === "Reopened" && !recovered.has(issueId)) count += 1;
  }
  return count;
}

function recoveryExplanation(
  recoveredCount: number,
  openCount: number,
): string {
  if (recoveredCount === 0 && openCount === 0) {
    return "No operational issues in the current session.";
  }
  if (recoveredCount === 0) {
    return "No verified operational recovery yet.";
  }
  if (openCount === 0) {
    return recoveredCount === 1
      ? "1 blocker recovered; no remaining open operational issues."
      : `${recoveredCount} blockers recovered; no remaining open operational issues.`;
  }
  const recovered =
    recoveredCount === 1 ? "1 blocker recovered" : `${recoveredCount} blockers recovered`;
  return `${recovered}; other active risks remain.`;
}

export type SignalRecoveryView = {
  issueId: string;
  currentlyRecovered: boolean;
  verificationRuleId: string | null;
  currentOutcome: OperationalVerificationResult["outcome"] | "None";
  evidence: readonly { entityType: string; entityId: string; fact: string }[];
  history: readonly IssueRecoveryHistoryEvent[];
  effectiveEntityFact: string | null;
};

export function signalRecoveryView(
  issueId: string,
  recovery: RecoveryRuntime | null,
  effective: EffectiveProjectSnapshot | null,
  relatedEntityType: string,
  relatedEntityId: string,
): SignalRecoveryView | null {
  if (!recovery) return null;
  const history = recovery.history.filter((event) => event.issueId === issueId);
  const verification = recovery.verificationResults.find((r) => r.issueId === issueId);
  if (history.length === 0 && !verification) return null;

  const currentlyRecovered = recovery.currentlyRecoveredIssueIds.includes(issueId);
  const last = history[history.length - 1];
  const verificationRuleId =
    last?.verificationRuleId ??
    (verification && "verificationRuleId" in verification
      ? verification.verificationRuleId
      : null);

  let evidence: SignalRecoveryView["evidence"] = [];
  if (verification?.outcome === "Recovered") {
    evidence = verification.provingFacts;
  } else if (verification?.outcome === "StillActive") {
    evidence = verification.remainingFacts;
  } else if (last) {
    evidence = last.evidence;
  }

  return {
    issueId,
    currentlyRecovered,
    verificationRuleId,
    currentOutcome: verification?.outcome ?? "None",
    evidence,
    history,
    effectiveEntityFact: effectiveEntityFact(
      effective,
      relatedEntityType,
      relatedEntityId,
    ),
  };
}

function effectiveEntityFact(
  effective: EffectiveProjectSnapshot | null,
  relatedEntityType: string,
  relatedEntityId: string,
): string | null {
  if (!effective) return null;
  const snapshot = effective.snapshot;
  if (relatedEntityType === "material") {
    const material = snapshot.materials.find((m) => m.id === relatedEntityId);
    return material
      ? `deliveryStatus=${material.deliveryStatus}; quantityReceived=${material.quantityReceived}`
      : null;
  }
  if (relatedEntityType === "task") {
    const task = snapshot.tasks.find((t) => t.id === relatedEntityId);
    return task ? `status=${task.status}` : null;
  }
  if (relatedEntityType === "crew") {
    const crew = snapshot.crews.find((c) => c.id === relatedEntityId);
    return crew
      ? `status=${crew.status}; currentTaskId=${crew.currentTaskId ?? "none"}`
      : null;
  }
  if (relatedEntityType === "inspection") {
    const inspection = snapshot.inspections.find((i) => i.id === relatedEntityId);
    return inspection ? `status=${inspection.status}` : null;
  }
  return null;
}
