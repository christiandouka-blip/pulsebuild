import { create } from "zustand";

import { getInitialProjectSnapshot } from "@/data/index";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
  type SignalReasoning,
} from "@/domain/engines/reasoningPipeline";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * Runtime reasoning state — Phase 3A.
 *
 * Holds only derived deterministic conclusions. The ProjectSnapshot remains the
 * read-only source of truth and is never mutated. All calculation is delegated
 * to pure engines via the reasoning pipeline.
 */
type ReasoningStoreState = {
  isInitialized: boolean;
  runtime: ReasoningRuntime;
  canProcessNext: boolean;
  initializeReasoning: (snapshot?: ProjectSnapshot) => void;
  processNextObservation: () => void;
  resetReasoning: () => void;
  getReasoningBySignalId: (signalId: string) => SignalReasoning | undefined;
};

/**
 * Memoized snapshot for the reasoning store. Validated once via
 * getInitialProjectSnapshot(); engines receive it as a read-only reference and
 * must not mutate it. Immutability is a contract enforced by pure engines and
 * tests — the cache is not Object.freeze'd.
 */
let cachedSnapshot: ProjectSnapshot | null = null;
function getSnapshot(snapshot?: ProjectSnapshot): ProjectSnapshot {
  if (snapshot) {
    cachedSnapshot = snapshot;
    return snapshot;
  }
  const project = useProjectStore.getState();
  if (project.source === "workspace") {
    if (!project.snapshot) {
      throw new Error("Workspace snapshot is not loaded.");
    }
    cachedSnapshot = project.snapshot;
    return project.snapshot;
  }
  if (project.isLoaded && project.snapshot) {
    cachedSnapshot = project.snapshot;
    return project.snapshot;
  }
  cachedSnapshot = getInitialProjectSnapshot();
  return cachedSnapshot;
}

function computeCanProcessNext(
  runtime: ReasoningRuntime,
  snapshot?: ProjectSnapshot,
): boolean {
  return nextFixtureId(getSnapshot(snapshot), runtime) !== null;
}

export const useReasoningStore = create<ReasoningStoreState>((set, get) => ({
  isInitialized: false,
  runtime: initialRuntime(),
  canProcessNext: true,
  initializeReasoning: (snapshot?: ProjectSnapshot) => {
    if (get().isInitialized) return;
    const runtime = initialRuntime();
    set({
      isInitialized: true,
      runtime,
      canProcessNext: computeCanProcessNext(runtime, snapshot),
    });
  },
  processNextObservation: () => {
    const snapshot = getSnapshot();
    const runtime = processNextObservation(snapshot, get().runtime);
    set({ runtime, canProcessNext: computeCanProcessNext(runtime) });
  },
  resetReasoning: () => {
    const runtime = initialRuntime();
    set({ runtime, canProcessNext: computeCanProcessNext(runtime) });
  },
  getReasoningBySignalId: (signalId: string) =>
    get().runtime.reasonings.find((r) => r.signal.id === signalId),
}));
