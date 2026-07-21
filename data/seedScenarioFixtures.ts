import type { ScenarioFixture } from "@/domain/types/signal";

/** Exactly five descriptive scenario fixtures — PO Decision 7. Observations only; no mutations. */
export const seedScenarioFixtures: ScenarioFixture[] = [
  {
    id: "fixture-weather-alert",
    sequenceOrder: 1,
    signalType: "WeatherAlert",
    title: "Rain forecast overlaps afternoon concrete operations",
    description:
      "Forecast rain is expected to affect outdoor concrete task types during the Level 1 pour window.",
    sourceType: "simulation",
    relatedEntityType: "weather",
    relatedEntityId: "wx-baseline-clear",
    relatedTaskId: "task-pour-level-1-slab",
    observedAtOffsetMinutes: 30,
    rawObservation: {
      condition: "Rain",
      severity: "moderate",
      affectedTaskTypes: ["concrete"],
      windowStart: "2026-03-14T13:00:00-04:00",
      windowEnd: "2026-03-14T18:00:00-04:00",
    },
    evidenceIds: ["ev-baseline-weather"],
  },
  {
    id: "fixture-material-delay",
    sequenceOrder: 2,
    signalType: "MaterialDeliveryDelayed",
    title: "Concrete delivery ETA slips beyond pour need",
    description:
      "Ready-mix concrete delivery is delayed relative to the planned Level 1 slab pour start.",
    sourceType: "simulation",
    relatedEntityType: "material",
    relatedEntityId: "mat-concrete",
    relatedTaskId: "task-pour-level-1-slab",
    observedAtOffsetMinutes: 45,
    rawObservation: {
      previousEta: "2026-03-14T10:30:00-04:00",
      revisedEta: "2026-03-14T14:00:00-04:00",
      deliveryStatus: "delayed",
    },
    evidenceIds: ["ev-concrete-eta"],
  },
  {
    id: "fixture-inspection-missing",
    sequenceOrder: 3,
    signalType: "InspectionMissing",
    title: "Required slab pre-pour inspection not completed",
    description:
      "The slab pre-pour inspection scheduled for 07:00 has not been recorded as completed before pour readiness.",
    sourceType: "simulation",
    relatedEntityType: "inspection",
    relatedEntityId: "insp-slab-pre-pour",
    relatedTaskId: "task-pour-level-1-slab",
    observedAtOffsetMinutes: 60,
    rawObservation: {
      scheduledTime: "2026-03-14T07:00:00-04:00",
      inspectionStatus: "scheduled",
      pourPlannedStart: "2026-03-14T09:00:00-04:00",
    },
    evidenceIds: ["ev-inspection-scheduled", "ev-pour-ready"],
  },
  {
    id: "fixture-delivery-received",
    sequenceOrder: 4,
    signalType: "DeliveryReceived",
    title: "Concrete delivery received on revised schedule",
    description:
      "Ready-mix concrete arrival confirmed after recovery actions in the demo path.",
    sourceType: "simulation",
    relatedEntityType: "material",
    relatedEntityId: "mat-concrete",
    relatedTaskId: "task-pour-level-1-slab",
    observedAtOffsetMinutes: 240,
    rawObservation: {
      quantityReceived: 120,
      deliveryStatus: "received",
    },
    evidenceIds: ["ev-concrete-eta"],
  },
  {
    id: "fixture-task-complete",
    sequenceOrder: 5,
    signalType: "TaskComplete",
    title: "Interior drywall prep task completed",
    description:
      "Interior drywall prep — Level 1 task is recorded as completed and ready for downstream finish planning.",
    sourceType: "simulation",
    relatedEntityType: "task",
    relatedEntityId: "task-interior-drywall-prep",
    relatedTaskId: "task-interior-drywall-prep",
    observedAtOffsetMinutes: 300,
    rawObservation: {
      taskStatus: "Completed",
      taskName: "Interior drywall prep — Level 1",
      completedAt: "2026-03-18T16:45:00-04:00",
    },
    evidenceIds: ["ev-drywall-prep-complete"],
  },
];
