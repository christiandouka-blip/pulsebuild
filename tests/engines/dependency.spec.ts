import { describe, expect, it } from "vitest";

import { analyzeDependency } from "@/domain/engines/dependencyEngine";
import { transitiveSuccessors } from "@/lib/selectors/dependencySelectors";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import { freshSnapshot } from "./helpers";

function signalFor(taskId: string): ProjectSignal {
  return {
    id: "signal-test",
    projectId: "proj-harbor-point",
    type: "MaterialDeliveryDelayed",
    status: "Validated",
    source: "simulation",
    relatedEntityType: "task",
    relatedEntityId: taskId,
    relatedTaskId: taskId,
    severityHint: "Tier2",
    rawData: {},
    observedAtSimulated: "2026-03-14T11:00:00.000Z",
    originFixtureId: "fixture-test",
    sequenceOrder: 1,
  };
}

describe("dependencyEngine — transitive successors", () => {
  it("walks immediate and transitive successors from the pour", () => {
    const snapshot = freshSnapshot();
    const { immediate, affected, maxDepth } = transitiveSuccessors(
      snapshot.tasks,
      "task-pour-level-1-slab",
    );
    expect(immediate).toEqual(["task-frame-level-2"]);
    expect(affected).toContain("task-frame-level-2");
    expect(affected).toContain("task-steel-delivery-receive");
    expect(affected).toContain("task-electrical-rough");
    expect(maxDepth).toBe(3);
  });

  it("reports cascade depth and critical-path exposure via analyzeDependency", () => {
    const snapshot = freshSnapshot();
    const impact = analyzeDependency(signalFor("task-pour-level-1-slab"), snapshot);
    expect(impact.cascadeDepth).toBe(3);
    expect(impact.criticalPathImpacted).toBe(true);
    expect(impact.affectedTaskIds).toHaveLength(7);
    expect(impact.evidence.some((e) => e.fact.includes("Critical-path"))).toBe(true);
  });

  it("reports no downstream impact for a leaf-side drywall prep chain root with only one successor", () => {
    const snapshot = freshSnapshot();
    const impact = analyzeDependency(signalFor("task-interior-drywall-prep"), snapshot);
    expect(impact.immediateTaskIds).toEqual(["task-drywall-install"]);
    expect(impact.cascadeDepth).toBe(1);
  });
});
