/**
 * Deterministic Phase 3C workflow clock.
 *
 * Current time is baselineSimulatedAt + committedStepCount × 15 minutes.
 * The baseline is Project.currentSimulatedAt copied into clock state — the
 * ProjectSnapshot is never written. Offsets use the supplied ISO instant as
 * the only input (same arithmetic as observation intake). Wall-clock time is
 * never read.
 */

export const WORKFLOW_STEP_MINUTES = 15;

export type SimulatedClock = {
  baselineSimulatedAt: string;
  committedStepCount: number;
};

export function initialSimulatedClock(baselineSimulatedAt: string): SimulatedClock {
  return {
    baselineSimulatedAt,
    committedStepCount: 0,
  };
}

/** Current workflow instant. Step 0 is the baseline project instant. */
export function currentSimulatedAt(clock: SimulatedClock): string {
  return addMinutesIso(
    clock.baselineSimulatedAt,
    clock.committedStepCount * WORKFLOW_STEP_MINUTES,
  );
}

/** Instant that the next committed user action would record. Does not mutate. */
export function peekNextSimulatedAt(clock: SimulatedClock): string {
  return addMinutesIso(
    clock.baselineSimulatedAt,
    (clock.committedStepCount + 1) * WORKFLOW_STEP_MINUTES,
  );
}

/** Record one committed user workflow interaction (+15 minutes). */
export function commitWorkflowStep(clock: SimulatedClock): SimulatedClock {
  return {
    baselineSimulatedAt: clock.baselineSimulatedAt,
    committedStepCount: clock.committedStepCount + 1,
  };
}

export function resetSimulatedClock(clock: SimulatedClock): SimulatedClock {
  return initialSimulatedClock(clock.baselineSimulatedAt);
}

/**
 * Deterministic offset of an existing ISO instant. Parses `baseIso` only —
 * never the wall-clock epoch. Output is UTC ISO, matching observation intake.
 */
export function addMinutesIso(baseIso: string, minutes: number): string {
  const epoch = new Date(baseIso).getTime() + minutes * 60_000;
  return new Date(epoch).toISOString();
}
