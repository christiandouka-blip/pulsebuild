import { describe, expect, it } from "vitest";

import { getInitialProjectSnapshot } from "@/data/index";
import {
  initialRuntime,
  nextFixtureId,
  processNextObservation,
} from "@/domain/engines/reasoningPipeline";

describe("Harbor Point reasoning freeze after validator split", () => {
  it("does not change Harbor Point deterministic pipeline outputs", () => {
    const snapshot = getInitialProjectSnapshot();
    let runtime = initialRuntime();
    while (nextFixtureId(snapshot, runtime) !== null) {
      runtime = processNextObservation(snapshot, runtime);
    }

    expect(runtime.processedFixtureIds).toEqual([
      "fixture-weather-alert",
      "fixture-material-delay",
      "fixture-inspection-missing",
      "fixture-delivery-received",
      "fixture-task-complete",
    ]);
    expect(runtime.reasonings).toHaveLength(5);
    expect(runtime.reasonings.map((item) => item.signal.type)).toEqual([
      "WeatherAlert",
      "MaterialDeliveryDelayed",
      "InspectionMissing",
      "DeliveryReceived",
      "TaskComplete",
    ]);

    const replay = getInitialProjectSnapshot();
    let again = initialRuntime();
    while (nextFixtureId(replay, again) !== null) {
      again = processNextObservation(replay, again);
    }
    expect(JSON.stringify(runtime)).toBe(JSON.stringify(again));
  });
});
