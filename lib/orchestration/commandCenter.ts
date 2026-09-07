/**
 * Command Center application orchestration.
 *
 * Owns the committed-user-action sequence: clock → reasoning/decision update →
 * overlay sync → recovery recompute. Stores do not import each other here
 * except the existing decision → reasoning read for intake.
 *
 * Clock advances only after a successful committed user action. Failed
 * commands, selector reads, initialization, and reset do not advance time.
 */

import type { DecisionActionResult } from "@/store/useDecisionStore";
import type { SelectedActionSource } from "@/domain/decisions/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import {
  initializePhase3cRuntimes,
  resetPhase3cRuntimes,
  syncPhase3cRuntimes,
} from "@/lib/orchestration/phase3cRuntime";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useAgentStore } from "@/store/useAgentStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import { announceNewlyCommittedEvents, snapshotTimelineEventIds } from "@/lib/orchestration/voiceAnnouncements";

export type ProcessNextResult =
  | { ok: true; simulatedAt: string }
  | { ok: false; code: "NO_NEXT_OBSERVATION" };

function requireSnapshot(): ProjectSnapshot {
  if (!useProjectStore.getState().isLoaded) {
    useProjectStore.getState().loadSeedProject();
  }
  const snapshot = useProjectStore.getState().snapshot;
  if (!snapshot) {
    throw new Error("Project snapshot is not loaded.");
  }
  return snapshot;
}

export function ensureCommandCenterInitialized(): ProjectSnapshot {
  const snapshot = requireSnapshot();
  if (!useReasoningStore.getState().isInitialized) {
    useReasoningStore.getState().initializeReasoning();
  }
  if (useOverlayStore.getState().runtime === null) {
    initializePhase3cRuntimes(snapshot);
  }
  if (useRecoveryStore.getState().runtime === null) {
    useRecoveryStore.getState().initializeRecovery(snapshot);
  }
  if (useSimulatedClockStore.getState().clock === null) {
    useSimulatedClockStore
      .getState()
      .initializeClock(snapshot.project.currentSimulatedAt);
  }
  return snapshot;
}

function syncOperationalLayer(evaluationSimulatedAt: string): void {
  syncPhase3cRuntimes({
    reasoning: useReasoningStore.getState().runtime,
    decisions: useDecisionStore.getState().runtime,
    evaluationSimulatedAt,
  });
}

export function processNextObservationCommitted(): ProcessNextResult {
  ensureCommandCenterInitialized();
  if (!useReasoningStore.getState().canProcessNext) {
    return { ok: false, code: "NO_NEXT_OBSERVATION" };
  }
  const instant = useSimulatedClockStore.getState().peekNext();
  if (!instant) {
    return { ok: false, code: "NO_NEXT_OBSERVATION" };
  }
  const previousTimelineIds = snapshotTimelineEventIds();
  useSimulatedClockStore.getState().commitStep();
  useReasoningStore.getState().processNextObservation();
  const committed = useReasoningStore.getState().runtime;
  useDecisionStore.getState().syncFromReasoning(committed);
  syncOperationalLayer(instant);
  announceNewlyCommittedEvents(previousTimelineIds);
  return { ok: true, simulatedAt: instant };
}

export function resetCommandCenter(): void {
  const snapshot = requireSnapshot();
  useReasoningStore.getState().resetReasoning();
  useDecisionStore.getState().resetDecisions();
  resetPhase3cRuntimes(snapshot);
  if (useSimulatedClockStore.getState().clock === null) {
    useSimulatedClockStore
      .getState()
      .initializeClock(snapshot.project.currentSimulatedAt);
  } else {
    useSimulatedClockStore.getState().resetClock();
  }
  useUIStore.getState().closeSignal();
  useAgentStore.getState().clearHistory();
  useVoiceStore.getState().cancelSpeech();
  useVoiceStore.getState().clearSession();
}

function commitDecisionAction(
  run: (simulatedAt: string) => DecisionActionResult,
): DecisionActionResult {
  ensureCommandCenterInitialized();
  const instant = useSimulatedClockStore.getState().peekNext();
  if (!instant) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIMESTAMP",
        message: "Simulated workflow clock is not initialized.",
      },
    };
  }
  const previousTimelineIds = snapshotTimelineEventIds();
  const result = run(instant);
  if (!result.ok) return result;
  useSimulatedClockStore.getState().commitStep();
  syncOperationalLayer(instant);
  announceNewlyCommittedEvents(previousTimelineIds);
  return result;
}

export function approveDecisionCommitted(
  decisionId: string,
  input: {
    selectedActionSource?: SelectedActionSource;
    alternativeIndex?: number;
    notes?: string;
    proceed?: boolean;
  } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().approveDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function rejectDecisionCommitted(
  decisionId: string,
  input: { reason: string; notes?: string },
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().rejectDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function acknowledgeDecisionCommitted(
  decisionId: string,
  input: { notes?: string } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().acknowledgeDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function executeDecisionCommitted(
  decisionId: string,
  input: { notes?: string; advanceToVerification?: boolean } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().executeDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function advanceToVerificationCommitted(
  decisionId: string,
  input: { notes?: string } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().advanceToVerification(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function blockDecisionCommitted(
  decisionId: string,
  input: { reason: string; notes?: string },
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().blockDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function retryDecisionCommitted(
  decisionId: string,
  input: { notes?: string } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().retryDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function cancelDecisionCommitted(
  decisionId: string,
  input: { reason?: string; notes?: string } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().cancelDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function verifyDecisionCommitted(
  decisionId: string,
  input: { notes?: string } = {},
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().verifyDecision(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}

export function failVerificationCommitted(
  decisionId: string,
  input: { reason: string; notes?: string },
): DecisionActionResult {
  return commitDecisionAction((simulatedAt) =>
    useDecisionStore.getState().failVerification(decisionId, {
      ...input,
      simulatedAt,
    }),
  );
}
