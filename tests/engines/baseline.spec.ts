import { describe, expect, it } from "vitest";

import { initialRuntime } from "@/domain/engines/reasoningPipeline";

describe("baseline reasoning runtime", () => {
  it("starts at Health 100 with the documented explanation", () => {
    const runtime = initialRuntime();
    expect(runtime.health.score).toBe(100);
    expect(runtime.health.band).toBe("green");
    expect(runtime.health.explanation).toBe("No active operational issues.");
  });

  it("starts at Drift 0 with the documented explanation", () => {
    const runtime = initialRuntime();
    expect(runtime.drift.score).toBe(0);
    expect(runtime.drift.label).toBe("Normal");
    expect(runtime.drift.explanation).toBe("Project aligned with plan.");
  });

  it("starts with no signals, issues, or timeline events", () => {
    const runtime = initialRuntime();
    expect(runtime.reasonings).toHaveLength(0);
    expect(runtime.timeline).toHaveLength(0);
    expect(runtime.processedFixtureIds).toHaveLength(0);
  });
});
