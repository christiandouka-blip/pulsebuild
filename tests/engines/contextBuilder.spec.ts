import { describe, expect, it } from "vitest";

import { buildContext } from "@/domain/engines/contextBuilder";
import { freshSnapshot } from "./helpers";

describe("contextBuilder — requirement satisfaction", () => {
  it("marks the Level 1 pour as blocked for material and inspection", () => {
    const context = buildContext(freshSnapshot());
    const pour = context.requirementStatusByTask["task-pour-level-1-slab"];
    expect(pour).toBeDefined();
    expect(pour.materialsReady).toBe("unsatisfied");
    expect(pour.inspectionsPassed).toBe("unsatisfied");
    expect(pour.isBlocked).toBe(true);
    expect(pour.blockingReasons).toEqual(
      expect.arrayContaining([
        "Required material not received",
        "Required inspection not passed",
      ]),
    );
  });

  it("records requirement-versus-assignment mismatches as facts, not errors", () => {
    const snapshot = freshSnapshot();
    const context = buildContext(snapshot);
    // Framing requires framing crew; crew is unassigned — separate operational facts.
    const frame = snapshot.tasks.find((t) => t.id === "task-frame-level-2")!;
    expect(frame.requiredCrewIds).toContain("crew-framing-a");
    expect(snapshot.crews.find((c) => c.id === "crew-framing-a")!.currentTaskId).toBeNull();
    // Frame is Planned (not active); crewAvailable still evaluates requirement vs availability.
    const frameReq = context.requirementStatusByTask["task-frame-level-2"];
    expect(frameReq.crewAvailable).toBe("satisfied"); // available status counts as satisfied
    // Pour crew is assigned to pour — assignment matches requirement for that task.
    expect(
      snapshot.crews.find((c) => c.id === "crew-concrete-a")!.currentTaskId,
    ).toBe("task-pour-level-1-slab");
    expect(context.requirementStatusByTask["task-pour-level-1-slab"].crewAvailable).toBe(
      "satisfied",
    );
  });

  it("marks concrete crew on the blocked pour as idle_risk in crewStates", () => {
    const context = buildContext(freshSnapshot());
    expect(context.crewStates["crew-concrete-a"]).toBe("idle_risk");
    expect(context.crewStates["crew-framing-a"]).toBe("unassigned");
  });
});
