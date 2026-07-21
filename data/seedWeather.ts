import type { WeatherEvent } from "@/domain/types/resources";

/** Baseline weather only — non-disruptive. Rain enters via scenario fixture only. */
export const seedWeather: WeatherEvent[] = [
  {
    id: "wx-baseline-clear",
    projectId: "proj-harbor-point",
    timestamp: "2026-03-14T06:30:00-04:00",
    condition: "Clear",
    severity: "low",
    affectedTaskTypes: [],
    startTime: "2026-03-14T06:00:00-04:00",
    endTime: "2026-03-14T12:00:00-04:00",
  },
];
