/**
 * Phase 3C effective Health and Drift — pure scoring over the effective world
 * and currently proven issue resolutions.
 *
 * Reuses frozen computeHealth / computeDrift arithmetic. Substitutes only:
 * the effective open-issue set, affected-task union of those issues, idle-crew
 * risk against the EffectiveProjectSnapshot, and proven-recovery issue ids.
 *
 * A historical IssueResolutionRecord is current only if Step 5 verification
 * still returns Recovered against the current effective snapshot.
 */

import { verifyOperationalIssue } from "@/domain/effects/operationalVerification";
import type { EffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import type { IssueResolutionRecord } from "@/domain/effects/types";
import { buildContext } from "@/domain/engines/contextBuilder";
import { computeDrift } from "@/domain/engines/driftEngine";
import { computeHealth } from "@/domain/engines/healthEngine";
import {
  openIssueIdleScope,
  resolveIdleCrewIds,
} from "@/domain/engines/idleCrewRisk";
import type {
  ReasoningRuntime,
  SignalReasoning,
} from "@/domain/engines/reasoningPipeline";
import type { TaskId } from "@/domain/types/identifiers";
import type { OperationalIssue } from "@/domain/types/issue";
import type { DriftResult, HealthResult } from "@/domain/types/scoring";

export type ComputeEffectiveScoresInput = {
  runtime: ReasoningRuntime;
  effective: EffectiveProjectSnapshot;
  resolutionRecords: readonly IssueResolutionRecord[];
};

export type EffectiveScores = {
  health: HealthResult;
  drift: DriftResult;
  effectiveOpenIssueIds: readonly string[];
  currentlyResolvedIssueIds: readonly string[];
};

export function computeEffectiveScores(
  input: ComputeEffectiveScoresInput,
): EffectiveScores {
  const { runtime, effective, resolutionRecords } = input;
  const phase3aOpen = phase3aOpenReasonings(runtime);
  const currentlyResolved = currentlyResolvedIssueIds(
    phase3aOpen,
    effective,
    resolutionRecords,
  );
  const resolvedSet = new Set(currentlyResolved);
  const effectiveOpen = phase3aOpen.filter(
    (r) => r.issue !== null && !resolvedSet.has(r.issue.id),
  );
  const openIssues = effectiveOpen.map((r) => r.issue as OperationalIssue);
  const effectiveOpenIssueIds = openIssues.map((issue) => issue.id);

  const affectedSet = new Set<TaskId>();
  for (const r of effectiveOpen) {
    for (const id of r.dependency.affectedTaskIds) affectedSet.add(id);
  }
  const affectedTaskIds = [...affectedSet];

  const unresolvedRecommendationCount = effectiveOpen.filter(
    (r) => r.recommendation !== null,
  ).length;

  const openIssueTaskIds = openIssues
    .map((issue) => issue.taskId)
    .filter((id): id is TaskId => id !== null);
  const context = buildContext(effective.snapshot);
  const idleCrewIds = resolveIdleCrewIds(
    effective.snapshot,
    context,
    openIssueIdleScope(openIssueTaskIds),
  );

  const health = computeHealth({
    openIssues,
    affectedDownstreamTaskIds: affectedTaskIds,
    unresolvedRecommendationCount,
    provenResolvedIssueIds: currentlyResolved,
  });
  const drift = computeDrift({
    openIssues,
    affectedTaskIds,
    idleCrewRiskCount: idleCrewIds.length,
    unresolvedActionCount: 0,
  });

  return {
    health,
    drift,
    effectiveOpenIssueIds,
    currentlyResolvedIssueIds: currentlyResolved,
  };
}

function phase3aOpenReasonings(runtime: ReasoningRuntime): SignalReasoning[] {
  return runtime.reasonings.filter(
    (r) => r.issue !== null && r.issue.status === "open",
  );
}

/**
 * Re-verify each unique historical resolution against current effective facts.
 * Duplicate records for the same issue id are ignored after the first.
 */
function currentlyResolvedIssueIds(
  openReasonings: readonly SignalReasoning[],
  effective: EffectiveProjectSnapshot,
  resolutionRecords: readonly IssueResolutionRecord[],
): string[] {
  const byIssueId = new Map<string, SignalReasoning>();
  for (const reasoning of openReasonings) {
    if (reasoning.issue) byIssueId.set(reasoning.issue.id, reasoning);
  }

  const seen = new Set<string>();
  const current: string[] = [];
  for (const record of resolutionRecords) {
    if (seen.has(record.issueId)) continue;
    seen.add(record.issueId);
    const reasoning = byIssueId.get(record.issueId);
    if (!reasoning || reasoning.issue === null) continue;
    const result = verifyOperationalIssue({
      issue: reasoning.issue,
      signal: reasoning.signal,
      effective,
    });
    if (result.outcome === "Recovered") current.push(record.issueId);
  }
  return current;
}
