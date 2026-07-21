import { describe, expect, it } from "vitest";

import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
  type ReasoningRuntime,
} from "@/domain/engines/reasoningPipeline";
import { freshSnapshot } from "./helpers";

function processAll(): ReasoningRuntime {
  const snapshot = freshSnapshot();
  let runtime = initialRuntime();
  while (nextFixtureId(snapshot, runtime) !== null) {
    runtime = processNextObservation(snapshot, runtime);
  }
  return runtime;
}

describe("determinism and idempotency", () => {
  it("produces identical output for identical input", () => {
    const a = processAll();
    const b = processAll();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("processes exactly one fixture per activation", () => {
    const snapshot = freshSnapshot();
    let runtime = initialRuntime();
    runtime = processNextObservation(snapshot, runtime);
    expect(runtime.reasonings).toHaveLength(1);
    expect(runtime.processedFixtureIds).toEqual(["fixture-weather-alert"]);
  });

  it("processes all five fixtures then disables further processing", () => {
    const runtime = processAll();
    expect(runtime.reasonings).toHaveLength(5);
    expect(runtime.processedFixtureIds).toHaveLength(5);
    expect(nextFixtureId(freshSnapshot(), runtime)).toBeNull();
  });

  it("is idempotent once all fixtures are processed", () => {
    const snapshot = freshSnapshot();
    const exhausted = processAll();
    const again = processNextObservation(snapshot, exhausted);
    expect(again.reasonings).toHaveLength(5);
    expect(JSON.stringify(again)).toBe(JSON.stringify(exhausted));
  });

  it("does not mutate the read-only snapshot", () => {
    const snapshot = freshSnapshot();
    const before = JSON.stringify(snapshot);
    let runtime = initialRuntime();
    while (nextFixtureId(snapshot, runtime) !== null) {
      runtime = processNextObservation(snapshot, runtime);
    }
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("computes the documented aggregate Health and Drift after the full sequence", () => {
    const runtime = processAll();
    // 3 open Tier1 issues, 7 affected downstream tasks, 3 unresolved recommendations.
    expect(runtime.health.score).toBe(11);
    expect(runtime.health.band).toBe("red");
    // 3xTier1(25) + 7 affected(5) + 1 idle crew(10) = 120 -> Critical Drift.
    expect(runtime.drift.score).toBe(120);
    expect(runtime.drift.label).toBe("Critical Drift");
  });
});

describe("duplicate observations and positive recovery", () => {
  it("does not reprocess an already-committed fixture", () => {
    const snapshot = freshSnapshot();
    const fixture = snapshot.scenarioFixtures[0];
    let runtime = initialRuntime();
    runtime = processNextObservation(snapshot, runtime);
    // Second activation must move to the next fixture, not repeat the first.
    runtime = processNextObservation(snapshot, runtime);
    const ids = runtime.reasonings.map((r) => r.signal.originFixtureId);
    expect(ids.filter((id) => id === fixture.id)).toHaveLength(1);
  });

  it("creates no issue for positive recovery signals", () => {
    const snapshot = freshSnapshot();
    let runtime = initialRuntime();
    while (nextFixtureId(snapshot, runtime) !== null) {
      runtime = processNextObservation(snapshot, runtime);
    }
    const positives = runtime.reasonings.filter(
      (r) => r.signal.type === "TaskComplete" || r.signal.type === "DeliveryReceived",
    );
    expect(positives).toHaveLength(2);
    for (const r of positives) {
      expect(r.issue).toBeNull();
      expect(r.recommendation).toBeNull();
    }
  });
});
