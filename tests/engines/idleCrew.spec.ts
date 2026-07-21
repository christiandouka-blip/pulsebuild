import { describe, expect, it } from "vitest";

import { buildContext } from "@/domain/engines/contextBuilder";
import {
  openIssueIdleScope,
  resolveIdleCrewIds,
  signalIdleScope,
} from "@/domain/engines/idleCrewRisk";
import { freshSnapshot, runFixture } from "./helpers";

describe("idle-crew-risk — unified scoped definition", () => {
  it("includes the concrete crew for a pour-related signal", () => {
    const snapshot = freshSnapshot();
    const { prediction } = runFixture(snapshot, "fixture-material-delay");
    expect(prediction.idleCrewRisk.crewIds).toContain("crew-concrete-a");
    expect(prediction.idleCrewRisk.category).toBe("Low exposure");
  });

  it("excludes unrelated blocked-pour crews from a drywall TaskComplete prediction", () => {
    const snapshot = freshSnapshot();
    const { prediction } = runFixture(snapshot, "fixture-task-complete");
    expect(prediction.idleCrewRisk.crewIds).not.toContain("crew-concrete-a");
    expect(prediction.idleCrewRisk.crewIds).toHaveLength(0);
    expect(prediction.idleCrewRisk.category).toBe("No measurable exposure");
  });

  it("excludes framing crew when only the pour is in open-issue scope", () => {
    const snapshot = freshSnapshot();
    const context = buildContext(snapshot);
    const ids = resolveIdleCrewIds(
      snapshot,
      context,
      openIssueIdleScope(["task-pour-level-1-slab"]),
    );
    expect(ids).toContain("crew-concrete-a");
    expect(ids).not.toContain("crew-framing-a");
  });

  it("returns no idle crews for an empty signal scope", () => {
    const snapshot = freshSnapshot();
    const context = buildContext(snapshot);
    expect(resolveIdleCrewIds(snapshot, context, signalIdleScope("task-site-prep"))).toEqual(
      [],
    );
  });
});
