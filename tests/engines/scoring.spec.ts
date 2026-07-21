import { describe, expect, it } from "vitest";

import { computeDrift } from "@/domain/engines/driftEngine";
import { computeHealth } from "@/domain/engines/healthEngine";
import type { OperationalIssue } from "@/domain/types/issue";

const tier1Issue = (id: string): OperationalIssue => ({
  id,
  signalId: `signal-${id}`,
  taskId: "task-pour-level-1-slab",
  kind: "MaterialDeliveryDelayed",
  status: "open",
  finalTier: "Tier1",
  openedAtSimulated: "2026-03-14T11:15:00.000Z",
});

describe("health engine (SoT §10)", () => {
  it("returns baseline 100 with no issues", () => {
    const health = computeHealth({
      openIssues: [],
      affectedDownstreamTaskIds: [],
      unresolvedRecommendationCount: 0,
    });
    expect(health.score).toBe(100);
    expect(health.explanation).toBe("No active operational issues.");
  });

  it("applies tier, affected-task, and unresolved-recommendation penalties with a breakdown", () => {
    const health = computeHealth({
      openIssues: [tier1Issue("issue-a")],
      affectedDownstreamTaskIds: ["t1", "t2", "t3"],
      unresolvedRecommendationCount: 1,
    });
    // 100 - 20 (Tier1) - 6 (3 tasks x2) - 5 (one recommendation) = 69
    expect(health.score).toBe(69);
    expect(health.band).toBe("amber");
    expect(health.breakdown).toHaveLength(3);
  });

  it("never drops below 0", () => {
    const health = computeHealth({
      openIssues: [tier1Issue("a"), tier1Issue("b"), tier1Issue("c"), tier1Issue("d"), tier1Issue("e"), tier1Issue("f")],
      affectedDownstreamTaskIds: [],
      unresolvedRecommendationCount: 0,
    });
    expect(health.score).toBe(0);
  });
});

describe("drift engine (bands PO Decision 2)", () => {
  it("returns baseline 0 with no issues", () => {
    const drift = computeDrift({
      openIssues: [],
      affectedTaskIds: [],
      idleCrewRiskCount: 0,
      unresolvedActionCount: 0,
    });
    expect(drift.score).toBe(0);
    expect(drift.label).toBe("Normal");
  });

  it("weights active tiers, affected tasks, and idle crews into the correct band", () => {
    const drift = computeDrift({
      openIssues: [tier1Issue("issue-a")],
      affectedTaskIds: ["t1", "t2"],
      idleCrewRiskCount: 1,
      unresolvedActionCount: 0,
    });
    // 25 (Tier1) + 10 (2 tasks x5) + 10 (1 idle crew) = 45 -> High Drift
    expect(drift.score).toBe(45);
    expect(drift.label).toBe("High Drift");
  });
});
