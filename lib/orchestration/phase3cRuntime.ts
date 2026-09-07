/**
 * Phase 3C application-layer orchestration.
 *
 * Receives runtime values and invokes overlay / recovery store actions.
 * OverlayStore does not import RecoveryStore (or the reverse). Reasoning and
 * decision stores are not imported here — callers pass their runtimes in.
 *
 * Sync order: observation effects, then decision effects, then recovery
 * recompute. That is source-runtime order, not a business-priority sort.
 */

import type { DecisionRuntime } from "@/domain/decisions/runtime";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";

export function initializePhase3cRuntimes(snapshot: ProjectSnapshot): void {
  useOverlayStore.getState().initializeOverlay(snapshot);
  useRecoveryStore.getState().initializeRecovery(snapshot);
}

export function resetPhase3cRuntimes(snapshot: ProjectSnapshot): void {
  useOverlayStore.getState().resetOverlay(snapshot);
  useRecoveryStore.getState().resetRecovery(snapshot);
}

export function syncPhase3cRuntimes(input: {
  reasoning: ReasoningRuntime;
  decisions: DecisionRuntime;
  /** Required later when a Reopened edge is recorded. Ignored for Recovered timestamps. */
  evaluationSimulatedAt?: string;
}): void {
  const overlay = useOverlayStore.getState();
  overlay.syncFromReasoning(input.reasoning);
  overlay.syncFromDecisions(input.decisions);
  const effective = useOverlayStore.getState().runtime?.effective;
  if (!effective) return;
  useRecoveryStore.getState().recompute({
    reasoning: input.reasoning,
    effective,
    evaluationSimulatedAt: input.evaluationSimulatedAt,
  });
}
