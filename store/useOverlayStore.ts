/**
 * Phase 3C Overlay Store — owns OverlayRuntime only.
 *
 * All writes go through the pure overlay runtime / Step 3 applicator.
 * Does not import reasoning, decision, or recovery stores. Does not call
 * reasoning engines. Does not mutate ProjectSnapshot.
 */

import { create } from "zustand";

import type { DecisionRuntime } from "@/domain/decisions/runtime";
import type { OperationalEffect } from "@/domain/effects/types";
import {
  applyOverlayEffect,
  applyOverlayEffects,
  initialOverlayRuntime,
  syncOverlayFromDecisions,
  syncOverlayFromReasoning,
  type OverlayRuntime,
} from "@/domain/effects/runtime";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

type OverlayStoreState = {
  runtime: OverlayRuntime | null;
  initializeOverlay: (snapshot: ProjectSnapshot) => void;
  resetOverlay: (snapshot: ProjectSnapshot) => void;
  applyEffect: (effect: OperationalEffect) => OverlayRuntime;
  applyEffects: (effects: readonly OperationalEffect[]) => OverlayRuntime;
  syncFromDecisions: (decisions: DecisionRuntime) => OverlayRuntime;
  syncFromReasoning: (reasoning: ReasoningRuntime) => OverlayRuntime;
  effective: () => OverlayRuntime["effective"] | null;
  applicationResults: () => OverlayRuntime["applicationResults"];
};

function requireRuntime(runtime: OverlayRuntime | null): OverlayRuntime {
  if (runtime === null) {
    throw new Error(
      "OverlayStore is not initialized. Call initializeOverlay(snapshot) first.",
    );
  }
  return runtime;
}

export const useOverlayStore = create<OverlayStoreState>((set, get) => ({
  runtime: null,

  initializeOverlay: (snapshot) => {
    set({ runtime: initialOverlayRuntime(snapshot) });
  },

  resetOverlay: (snapshot) => {
    set({ runtime: initialOverlayRuntime(snapshot) });
  },

  applyEffect: (effect) => {
    const runtime = applyOverlayEffect(requireRuntime(get().runtime), effect);
    set({ runtime });
    return runtime;
  },

  applyEffects: (effects) => {
    const runtime = applyOverlayEffects(requireRuntime(get().runtime), effects);
    set({ runtime });
    return runtime;
  },

  syncFromDecisions: (decisions) => {
    const runtime = syncOverlayFromDecisions(
      requireRuntime(get().runtime),
      decisions,
    );
    set({ runtime });
    return runtime;
  },

  syncFromReasoning: (reasoning) => {
    const runtime = syncOverlayFromReasoning(
      requireRuntime(get().runtime),
      reasoning,
    );
    set({ runtime });
    return runtime;
  },

  effective: () => get().runtime?.effective ?? null,

  applicationResults: () => get().runtime?.applicationResults ?? [],
}));
