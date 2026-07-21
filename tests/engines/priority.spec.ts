import { describe, expect, it } from "vitest";

import { freshSnapshot, runFixture } from "./helpers";

describe("priority engine — documented rule table", () => {
  it("upgrades a weather alert on a blocked critical task above its Tier2 baseline hint", () => {
    const snapshot = freshSnapshot();
    const { priority } = runFixture(snapshot, "fixture-weather-alert");
    expect(priority.baselineHint).toBe("Tier2");
    expect(priority.finalTier).toBe("Tier1");
    // The final tier must be explained by adjustments, not a hidden threshold.
    expect(priority.adjustments.length).toBeGreaterThan(1);
    expect(priority.adjustments.some((a) => a.ruleId === "R3_active_block")).toBe(true);
  });

  it("keeps a missing inspection at Tier1", () => {
    const snapshot = freshSnapshot();
    const { priority } = runFixture(snapshot, "fixture-inspection-missing");
    expect(priority.baselineHint).toBe("Tier1");
    expect(priority.finalTier).toBe("Tier1");
  });

  it("never upgrades a positive recovery signal", () => {
    const snapshot = freshSnapshot();
    const complete = runFixture(snapshot, "fixture-task-complete");
    const delivery = runFixture(snapshot, "fixture-delivery-received");
    expect(complete.priority.finalTier).toBe("Tier4");
    expect(delivery.priority.finalTier).toBe("Tier4");
    expect(
      complete.priority.adjustments.some((a) => a.ruleId === "R13_positive_recovery"),
    ).toBe(true);
  });

  it("attaches evidence to every non-positive classification", () => {
    const snapshot = freshSnapshot();
    const { priority } = runFixture(snapshot, "fixture-material-delay");
    expect(priority.evidence.length).toBeGreaterThan(0);
  });
});
