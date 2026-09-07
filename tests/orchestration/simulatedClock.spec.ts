import { describe, expect, it } from "vitest";

import {
  addMinutesIso,
  commitWorkflowStep,
  currentSimulatedAt,
  initialSimulatedClock,
  peekNextSimulatedAt,
  resetSimulatedClock,
  WORKFLOW_STEP_MINUTES,
} from "@/lib/orchestration/simulatedClock";

const BASELINE = "2026-03-14T06:30:00-04:00";

describe("simulated workflow clock", () => {
  it("starts at the deterministic baseline instant", () => {
    const clock = initialSimulatedClock(BASELINE);
    expect(clock.committedStepCount).toBe(0);
    expect(currentSimulatedAt(clock)).toBe(addMinutesIso(BASELINE, 0));
    expect(currentSimulatedAt(clock)).toBe("2026-03-14T10:30:00.000Z");
  });

  it("peeks the next instant without committing", () => {
    const clock = initialSimulatedClock(BASELINE);
    const peeked = peekNextSimulatedAt(clock);
    expect(peeked).toBe(addMinutesIso(BASELINE, WORKFLOW_STEP_MINUTES));
    expect(clock.committedStepCount).toBe(0);
    expect(currentSimulatedAt(clock)).toBe("2026-03-14T10:30:00.000Z");
    expect(peeked).toBe("2026-03-14T10:45:00.000Z");
  });

  it("advances exactly 15 minutes per committed step", () => {
    let clock = initialSimulatedClock(BASELINE);
    clock = commitWorkflowStep(clock);
    expect(currentSimulatedAt(clock)).toBe("2026-03-14T10:45:00.000Z");
    clock = commitWorkflowStep(clock);
    clock = commitWorkflowStep(clock);
    clock = commitWorkflowStep(clock);
    clock = commitWorkflowStep(clock);
    expect(clock.committedStepCount).toBe(5);
    expect(currentSimulatedAt(clock)).toBe("2026-03-14T11:45:00.000Z");
  });

  it("reset restores the baseline without changing the baseline instant", () => {
    let clock = commitWorkflowStep(initialSimulatedClock(BASELINE));
    clock = resetSimulatedClock(clock);
    expect(clock.committedStepCount).toBe(0);
    expect(clock.baselineSimulatedAt).toBe(BASELINE);
    expect(currentSimulatedAt(clock)).toBe("2026-03-14T10:30:00.000Z");
  });
});
