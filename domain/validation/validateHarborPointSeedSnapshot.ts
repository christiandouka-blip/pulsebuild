import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { SignalType } from "@/domain/types/signal";
import type { ValidationResult } from "@/domain/validation/validateProjectSnapshot";

const HARBOR_POINT_SIMULATED_AT = "2026-03-14T06:30:00-04:00";
const HARBOR_POINT_POUR_TASK_ID = "task-pour-level-1-slab";
const HARBOR_POINT_INSPECTION_ID = "insp-slab-pre-pour";
const HARBOR_POINT_INSPECTION_TIME = "2026-03-14T07:00:00-04:00";
const HARBOR_POINT_BASELINE_WEATHER_ID = "wx-baseline-clear";

const APPROVED_FIXTURE_IDS = new Set([
  "fixture-weather-alert",
  "fixture-material-delay",
  "fixture-inspection-missing",
  "fixture-delivery-received",
  "fixture-task-complete",
]);

const APPROVED_FIXTURE_SIGNAL_TYPES: Record<string, SignalType> = {
  "fixture-weather-alert": "WeatherAlert",
  "fixture-material-delay": "MaterialDeliveryDelayed",
  "fixture-inspection-missing": "InspectionMissing",
  "fixture-delivery-received": "DeliveryReceived",
  "fixture-task-complete": "TaskComplete",
};

/**
 * Harbor Point demo/seed invariants only.
 * Production loaders must not call this.
 */
export function validateHarborPointSeedSnapshot(
  snapshot: ProjectSnapshot,
): ValidationResult {
  const errors: string[] = [];

  if (snapshot.project.currentSimulatedAt !== HARBOR_POINT_SIMULATED_AT) {
    errors.push(
      `Project currentSimulatedAt must be ${HARBOR_POINT_SIMULATED_AT}, got ${snapshot.project.currentSimulatedAt}`,
    );
  }

  const criticalPathCount = snapshot.tasks.filter((t) => t.isCriticalPath).length;
  if (criticalPathCount < 3) {
    errors.push(
      `At least three critical-path tasks required, found ${criticalPathCount}`,
    );
  }

  const pourTask = snapshot.tasks.find((t) => t.id === HARBOR_POINT_POUR_TASK_ID);
  if (!pourTask || pourTask.status !== "Ready") {
    errors.push("task-pour-level-1-slab must exist with status Ready");
  }

  const slabInspection = snapshot.inspections.find(
    (i) => i.id === HARBOR_POINT_INSPECTION_ID,
  );
  if (
    !slabInspection ||
    slabInspection.scheduledTime !== HARBOR_POINT_INSPECTION_TIME
  ) {
    errors.push(
      "insp-slab-pre-pour must be scheduled for 2026-03-14T07:00:00-04:00",
    );
  }

  if (snapshot.scenarioFixtures.length !== 5) {
    errors.push(
      `Exactly five scenario fixtures required, found ${snapshot.scenarioFixtures.length}`,
    );
  }

  for (const fixture of snapshot.scenarioFixtures) {
    if (!APPROVED_FIXTURE_IDS.has(fixture.id)) {
      errors.push(`Unauthorized scenario fixture id: ${fixture.id}`);
    }
    const expectedSignalType = APPROVED_FIXTURE_SIGNAL_TYPES[fixture.id];
    if (
      expectedSignalType !== undefined &&
      fixture.signalType !== expectedSignalType
    ) {
      errors.push(
        `Fixture ${fixture.id} signalType must be ${expectedSignalType}, got ${fixture.signalType}`,
      );
    }
  }

  const disruptiveRain = snapshot.weather.some(
    (w) =>
      w.condition.toLowerCase().includes("rain") &&
      w.severity !== "low" &&
      w.id !== HARBOR_POINT_BASELINE_WEATHER_ID,
  );
  if (disruptiveRain) {
    errors.push("Disruptive rain must not exist as baseline weather");
  }

  return { ok: errors.length === 0, errors };
}
