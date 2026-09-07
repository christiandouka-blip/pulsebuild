/**
 * Phase 3C Recovery Store — owns RecoveryRuntime only.
 *
 * Verification uses verifyOperationalIssue. Scoring uses computeEffectiveScores.
 * History edges use applyRecoveryHistoryEdges. Does not import overlay,
 * reasoning, or decision stores. Does not call reasoning engines.
 */

import { create } from "zustand";

import type { EffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import {
  initialRecoveryRuntime,
  recomputeRecoveryRuntime,
  type RecomputeRecoveryResult,
  type RecoveryRuntime,
} from "@/domain/recovery/runtime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

type RecoveryStoreState = {
  runtime: RecoveryRuntime | null;
  initializeRecovery: (snapshot: ProjectSnapshot) => void;
  resetRecovery: (snapshot: ProjectSnapshot) => void;
  recompute: (input: {
    reasoning: ReasoningRuntime;
    effective: EffectiveProjectSnapshot;
    evaluationSimulatedAt?: string;
  }) => RecomputeRecoveryResult;
};

export const useRecoveryStore = create<RecoveryStoreState>((set, get) => ({
  runtime: null,

  initializeRecovery: (snapshot) => {
    set({ runtime: initialRecoveryRuntime(snapshot) });
  },

  resetRecovery: (snapshot) => {
    set({ runtime: initialRecoveryRuntime(snapshot) });
  },

  recompute: (input) => {
    const previous = get().runtime;
    const result = recomputeRecoveryRuntime({
      history: previous?.history ?? [],
      currentlyRecoveredIssueIds: previous?.currentlyRecoveredIssueIds ?? [],
      reasoning: input.reasoning,
      effective: input.effective,
      evaluationSimulatedAt: input.evaluationSimulatedAt,
    });
    if (result.ok) set({ runtime: result.runtime });
    return result;
  },
}));
