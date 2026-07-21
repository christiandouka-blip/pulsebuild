import type { ProjectSignal } from "@/domain/types/signalRuntime";

/**
 * Signal Engine — normalize and validate.
 *
 * Transitions a Detected signal to Validated. Pure and deterministic; returns
 * a new object and never mutates the input.
 */
export function normalizeSignal(signal: ProjectSignal): ProjectSignal {
  return { ...signal, status: "Validated" };
}

/** Transition a validated signal to Prioritized after priority classification. */
export function markPrioritized(signal: ProjectSignal): ProjectSignal {
  return { ...signal, status: "Prioritized" };
}
