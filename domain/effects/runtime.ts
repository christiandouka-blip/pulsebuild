/**
 * Phase 3C OverlayRuntime — pure ownership of applied operational effects and
 * the derived effective project world.
 *
 * Intake order (documented source order, not business priority):
 * 1. Observation effects: ReasoningRuntime.reasonings array order
 *    (committed observation sequence).
 * 2. Decision effects: DecisionRuntime.decisions array order
 *    (existing runtime order; intake already sorts by decision id).
 *
 * Combined sync applies (1) then (2). Repeated sync skips effect ids already
 * present in effectHistory (deterministic ids from Step 2 / Step 4).
 *
 * Application itself is delegated to applyOperationalEffect (Step 3). This
 * module does not mutate crew/task/material records and does not invent
 * timestamps.
 */

import type { DecisionRuntime } from "@/domain/decisions/runtime";
import { applyOperationalEffect } from "@/domain/effects/applyEffect";
import {
  createEffectiveProjectSnapshot,
  type EffectiveProjectSnapshot,
} from "@/domain/effects/effectiveSnapshot";
import { resolveObservationEffect } from "@/domain/effects/observationEffects";
import { resolveOperationalEffect } from "@/domain/effects/resolveEffect";
import type {
  EffectApplicationResult,
  EffectResolution,
  ObservationEffectResolution,
  OperationalEffect,
} from "@/domain/effects/types";
import type { ReasoningRuntime } from "@/domain/engines/reasoningPipeline";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export type OverlayRuntime = {
  /** Derived world: baseline snapshot, effective snapshot, applied write log. */
  effective: EffectiveProjectSnapshot;
  /**
   * Operational effects submitted to the applicator, in input-array order.
   * Includes effects later Rejected at application time. Excludes
   * NoOperationalEffect / resolution-Rejected outcomes (those never become
   * OperationalEffect values).
   */
  effectHistory: readonly OperationalEffect[];
  /**
   * One application result per submitted effect, same order as effectHistory.
   * Applied, AlreadyApplied, and Rejected are all retained.
   */
  applicationResults: readonly EffectApplicationResult[];
};

export type DecisionEffectIntake = {
  decisionId: string;
  resolution: EffectResolution;
};

export type ObservationEffectIntake = {
  signalId: string;
  resolution: ObservationEffectResolution;
};

export function initialOverlayRuntime(snapshot: ProjectSnapshot): OverlayRuntime {
  return {
    effective: createEffectiveProjectSnapshot(snapshot),
    effectHistory: [],
    applicationResults: [],
  };
}

/**
 * Apply effects in caller-array order onto the current effective world.
 * Preserves Step 3 semantics, including AlreadyApplied for a repeated id in
 * the same call. Empty input returns the same runtime object.
 */
export function applyOverlayEffects(
  runtime: OverlayRuntime,
  effects: readonly OperationalEffect[],
): OverlayRuntime {
  if (effects.length === 0) return runtime;

  let effective = runtime.effective;
  const effectHistory = [...runtime.effectHistory];
  const applicationResults = [...runtime.applicationResults];

  for (const effect of effects) {
    const next = applyOperationalEffect(effective, effect);
    effective = next.effective;
    effectHistory.push(effect);
    applicationResults.push(next.result);
  }

  return { effective, effectHistory, applicationResults };
}

export function applyOverlayEffect(
  runtime: OverlayRuntime,
  effect: OperationalEffect,
): OverlayRuntime {
  return applyOverlayEffects(runtime, [effect]);
}

/**
 * Resolve every decision through the Step 2 gate. Only `Resolved` outcomes
 * yield OperationalEffect values. Unverified / workflow-only / rejected
 * decisions produce no overlay write.
 */
export function collectDecisionEffectIntake(
  decisions: DecisionRuntime,
): {
  intakes: readonly DecisionEffectIntake[];
  effects: readonly OperationalEffect[];
} {
  const intakes: DecisionEffectIntake[] = [];
  const effects: OperationalEffect[] = [];
  for (const decision of decisions.decisions) {
    const resolution = resolveOperationalEffect(decision);
    intakes.push({ decisionId: decision.id, resolution });
    if (resolution.outcome === "Resolved") {
      effects.push(resolution.effect);
    }
  }
  return { intakes, effects };
}

/**
 * Resolve every committed ProjectSignal through the Step 4 observation
 * resolver. Only DeliveryReceived and TaskComplete can yield effects.
 */
export function collectObservationEffectIntake(
  reasoning: ReasoningRuntime,
): {
  intakes: readonly ObservationEffectIntake[];
  effects: readonly OperationalEffect[];
} {
  const intakes: ObservationEffectIntake[] = [];
  const effects: OperationalEffect[] = [];
  for (const entry of reasoning.reasonings) {
    const resolution = resolveObservationEffect(entry.signal);
    intakes.push({ signalId: entry.signal.id, resolution });
    if (resolution.outcome === "Resolved") {
      effects.push(resolution.effect);
    }
  }
  return { intakes, effects };
}

/** Apply newly resolved decision effects. Already-seen effect ids are skipped. */
export function syncOverlayFromDecisions(
  runtime: OverlayRuntime,
  decisions: DecisionRuntime,
): OverlayRuntime {
  const { effects } = collectDecisionEffectIntake(decisions);
  return submitNewEffects(runtime, effects);
}

/**
 * Apply newly resolved observation effects from committed signals.
 * Already-seen effect ids are skipped.
 */
export function syncOverlayFromReasoning(
  runtime: OverlayRuntime,
  reasoning: ReasoningRuntime,
): OverlayRuntime {
  const { effects } = collectObservationEffectIntake(reasoning);
  return submitNewEffects(runtime, effects);
}

/**
 * Combined intake: observations in reasonings order, then decisions in
 * DecisionRuntime.decisions order.
 */
export function syncOverlayFromRuntimes(
  runtime: OverlayRuntime,
  reasoning: ReasoningRuntime,
  decisions: DecisionRuntime,
): OverlayRuntime {
  return syncOverlayFromDecisions(
    syncOverlayFromReasoning(runtime, reasoning),
    decisions,
  );
}

function submitNewEffects(
  runtime: OverlayRuntime,
  effects: readonly OperationalEffect[],
): OverlayRuntime {
  const seen = new Set(runtime.effectHistory.map((effect) => effect.id));
  const next = effects.filter((effect) => !seen.has(effect.id));
  return applyOverlayEffects(runtime, next);
}
