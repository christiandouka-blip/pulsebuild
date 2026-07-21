import { describe, expect, it } from "vitest";

import { freshSnapshot, runFixture } from "./helpers";

describe("prediction engine — deterministic projection", () => {
  it("derives a numeric schedule exposure only from two known timestamps", () => {
    const snapshot = freshSnapshot();
    const { prediction } = runFixture(snapshot, "fixture-material-delay");
    // revisedEta 14:00 minus plannedStart 09:00 = 5 hours.
    expect(prediction.scheduleExposure.estimatedHours).toBe(5);
    expect(prediction.scheduleExposure.category).toBe("Moderate exposure");
  });

  it("does not invent a numeric estimate when timestamps are unavailable", () => {
    const snapshot = freshSnapshot();
    const { prediction } = runFixture(snapshot, "fixture-inspection-missing");
    expect(prediction.scheduleExposure.estimatedHours).toBeNull();
  });

  it("reports critical-path exposure and the full affected downstream set", () => {
    const snapshot = freshSnapshot();
    const { prediction } = runFixture(snapshot, "fixture-material-delay");
    expect(prediction.criticalPathExposure).toBe("Critical exposure");
    expect(prediction.affectedTaskIds).toHaveLength(7);
    expect(prediction.cascadeDepth).toBe(3);
  });

  it("scopes idle-crew risk to the signal-related task only", () => {
    const snapshot = freshSnapshot();
    const pour = runFixture(snapshot, "fixture-weather-alert");
    const drywall = runFixture(snapshot, "fixture-task-complete");
    expect(pour.prediction.idleCrewRisk.crewIds).toContain("crew-concrete-a");
    expect(drywall.prediction.idleCrewRisk.crewIds).not.toContain("crew-concrete-a");
  });
});
