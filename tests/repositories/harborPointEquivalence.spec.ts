import { describe, expect, it } from "vitest";

import { buildProjectSnapshot, getInitialProjectSnapshot } from "@/data/index";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { mapProjectSnapshot } from "@/lib/repositories/projectSnapshotMapper";
import {
  HARBOR_POINT_OPERATIONAL_AT,
  harborPointRecords,
} from "@/tests/repositories/recordsFactory";

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function constructionWorld(snapshot: ProjectSnapshot) {
  return {
    project: snapshot.project,
    phases: byId(snapshot.phases),
    tasks: byId(snapshot.tasks),
    crews: byId(snapshot.crews),
    materials: byId(snapshot.materials),
    equipment: byId(snapshot.equipment),
    inspections: byId(snapshot.inspections),
    permits: byId(snapshot.permits),
    weather: byId(snapshot.weather),
    evidence: byId(snapshot.evidence),
  };
}

describe("Harbor Point production mapper equivalence", () => {
  it("maps persisted Harbor Point construction facts to the seed world", () => {
    const seed = buildProjectSnapshot();
    const mapped = mapProjectSnapshot(
      harborPointRecords(),
      HARBOR_POINT_OPERATIONAL_AT,
    );
    expect(mapped.status).toBe("Mapped");
    if (mapped.status !== "Mapped") {
      return;
    }

    expect(mapped.snapshot.scenarioFixtures).toEqual([]);
    expect(constructionWorld(mapped.snapshot)).toEqual(constructionWorld(seed));
  });

  it("keeps the five Harbor Point demo fixtures on the demo snapshot", () => {
    const demo = getInitialProjectSnapshot();
    expect(demo.scenarioFixtures).toHaveLength(5);
    expect(demo.scenarioFixtures.map((fixture) => fixture.id)).toEqual([
      "fixture-weather-alert",
      "fixture-material-delay",
      "fixture-inspection-missing",
      "fixture-delivery-received",
      "fixture-task-complete",
    ]);
  });
});
