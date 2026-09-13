import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getInitialProjectSnapshot } from "@/data/index";
import { initialRuntime, processNextObservation } from "@/domain/engines/reasoningPipeline";
import {
  isValidIanaTimeZone,
  validateProjectSnapshot,
} from "@/domain/validation/validateProjectSnapshot";
import { productionConstructionSnapshot } from "@/tests/validation/productionSnapshot";

describe("generic ProjectSnapshot validator", () => {
  it("accepts Harbor Point under generic validation", () => {
    const snapshot = getInitialProjectSnapshot();
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("accepts a production snapshot with empty scenarioFixtures", () => {
    const snapshot = productionConstructionSnapshot();
    expect(snapshot.scenarioFixtures).toEqual([]);
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("does not require Harbor Point fixture ids", () => {
    const snapshot = productionConstructionSnapshot();
    const result = validateProjectSnapshot(snapshot);
    expect(result.ok).toBe(true);
    expect(result.errors.join(" ")).not.toContain("fixture-weather-alert");
  });

  it("does not require Harbor Point task ids", () => {
    const snapshot = productionConstructionSnapshot();
    expect(snapshot.tasks.some((task) => task.id === "task-pour-level-1-slab")).toBe(
      false,
    );
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("does not require Harbor Point inspection ids", () => {
    const snapshot = productionConstructionSnapshot();
    expect(
      snapshot.inspections.some((item) => item.id === "insp-slab-pre-pour"),
    ).toBe(false);
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("does not require the Harbor Point simulated start instant", () => {
    const snapshot = productionConstructionSnapshot({
      project: {
        ...productionConstructionSnapshot().project,
        currentSimulatedAt: "2026-11-02T18:30:00.000Z",
      },
    });
    expect(snapshot.project.currentSimulatedAt).not.toBe(
      "2026-03-14T06:30:00-04:00",
    );
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("accepts an explicit production operational instant on currentSimulatedAt", () => {
    const snapshot = productionConstructionSnapshot();
    expect(snapshot.project.currentSimulatedAt).toBe("2026-09-07T15:00:00.000Z");
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("rejects broken references", () => {
    const snapshot = productionConstructionSnapshot();
    snapshot.tasks[1] = {
      ...snapshot.tasks[1],
      requiredCrewIds: ["crew-missing"],
    };
    const result = validateProjectSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("required crew"))).toBe(
      true,
    );
  });

  it("rejects duplicate ids", () => {
    const snapshot = productionConstructionSnapshot();
    snapshot.crews = [...snapshot.crews, { ...snapshot.crews[0] }];
    const result = validateProjectSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Duplicate ID: crew-a");
  });

  it("rejects task dependency cycles", () => {
    const snapshot = productionConstructionSnapshot();
    snapshot.tasks = snapshot.tasks.map((task) =>
      task.id === "task-foundation"
        ? { ...task, status: "Planned", dependencyTaskIds: ["task-pour"] }
        : task,
    );
    const result = validateProjectSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Task dependency graph contains a cycle");
  });

  it("allows requirement-versus-assignment mismatch", () => {
    const snapshot = productionConstructionSnapshot();
    expect(snapshot.tasks[1].requiredCrewIds).toEqual(["crew-a"]);
    expect(snapshot.crews[0].currentTaskId).toBeNull();
    expect(snapshot.tasks[1].requiredEquipmentIds).toEqual(["equip-a"]);
    expect(snapshot.equipment[0].assignedTaskId).toBeNull();
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("rejects an invalid timezone", () => {
    const snapshot = productionConstructionSnapshot({
      project: {
        ...productionConstructionSnapshot().project,
        timezone: "NotAReal/TimeZone",
      },
    });
    const result = validateProjectSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("IANA"))).toBe(true);
  });

  it("keeps ProjectSnapshot compatible with the frozen reasoning pipeline", () => {
    const snapshot = getInitialProjectSnapshot();
    const runtime = processNextObservation(snapshot, initialRuntime());
    expect(runtime.reasonings).toHaveLength(1);
    expect(runtime.processedFixtureIds).toEqual(["fixture-weather-alert"]);
  });

  it("does not use Date.now in domain validation", () => {
    const files = [
      "domain/validation/validateProjectSnapshot.ts",
      "domain/validation/validateHarborPointSeedSnapshot.ts",
      "domain/types/project.ts",
      "domain/types/snapshot.ts",
      "data/index.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of [
        "Date.now(",
        "Math.random(",
        "randomUUID",
        "setTimeout(",
        "setInterval(",
        "@/lib/db",
        "next-auth",
      ]) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });
});

describe("IANA timezone contract", () => {
  it.each([
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
  ])("accepts %s", (timezone) => {
    expect(isValidIanaTimeZone(timezone)).toBe(true);
    const snapshot = productionConstructionSnapshot({
      project: {
        ...productionConstructionSnapshot().project,
        timezone,
      },
    });
    expect(validateProjectSnapshot(snapshot).ok).toBe(true);
  });

  it("rejects obviously invalid timezone values", () => {
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone(" America/Chicago")).toBe(false);
    expect(isValidIanaTimeZone("America/New York")).toBe(false);
    expect(isValidIanaTimeZone("NotAReal/TimeZone")).toBe(false);
  });
});
