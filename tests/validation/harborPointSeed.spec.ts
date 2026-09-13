import { describe, expect, it } from "vitest";

import { getInitialProjectSnapshot } from "@/data/index";
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import { productionConstructionSnapshot } from "@/tests/validation/productionSnapshot";

describe("Harbor Point seed validator", () => {
  it("accepts the Harbor Point seed snapshot", () => {
    const snapshot = getInitialProjectSnapshot();
    expect(validateHarborPointSeedSnapshot(snapshot).ok).toBe(true);
  });

  it("still enforces the exact Harbor Point currentSimulatedAt", () => {
    const snapshot = {
      ...getInitialProjectSnapshot(),
      project: {
        ...getInitialProjectSnapshot().project,
        currentSimulatedAt: "2026-09-07T15:00:00.000Z",
      },
    };
    const result = validateHarborPointSeedSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("2026-03-14T06:30:00-04:00"))).toBe(
      true,
    );
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("still enforces the pour Ready invariant", () => {
    const snapshot = getInitialProjectSnapshot();
    snapshot.tasks = snapshot.tasks.map((task) =>
      task.id === "task-pour-level-1-slab"
        ? { ...task, status: "Planned" }
        : task,
    );
    const result = validateHarborPointSeedSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "task-pour-level-1-slab must exist with status Ready",
    );
  });

  it("still enforces the 07:00 inspection invariant", () => {
    const snapshot = getInitialProjectSnapshot();
    snapshot.inspections = snapshot.inspections.map((item) =>
      item.id === "insp-slab-pre-pour"
        ? { ...item, scheduledTime: "2026-03-14T08:00:00-04:00" }
        : item,
    );
    const result = validateHarborPointSeedSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "insp-slab-pre-pour must be scheduled for 2026-03-14T07:00:00-04:00",
    );
  });

  it("still enforces exactly five Harbor Point fixtures", () => {
    const snapshot = getInitialProjectSnapshot();
    snapshot.scenarioFixtures = [];
    const result = validateHarborPointSeedSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("Exactly five"))).toBe(
      true,
    );
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("does not treat a valid production snapshot as Harbor Point", () => {
    const snapshot = productionConstructionSnapshot();
    expect(validateHarborPointSeedSnapshot(snapshot).ok).toBe(false);
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });
});
