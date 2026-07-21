import type { Inspection } from "@/domain/types/resources";

export const seedInspections: Inspection[] = [
  {
    id: "insp-slab-pre-pour",
    type: "Slab pre-pour",
    status: "scheduled",
    requiredBeforeTaskId: "task-pour-level-1-slab",
    scheduledTime: "2026-03-14T07:00:00-04:00",
    inspectorName: "J. Martinez",
  },
  {
    id: "insp-framing",
    type: "Framing inspection",
    status: "not_scheduled",
    requiredBeforeTaskId: "task-frame-level-2",
  },
  {
    id: "insp-electrical-rough",
    type: "Electrical rough-in inspection",
    status: "not_scheduled",
    requiredBeforeTaskId: "task-electrical-rough",
  },
  {
    id: "insp-safety-walk",
    type: "Safety walkthrough",
    status: "passed",
    requiredBeforeTaskId: "task-site-prep",
    scheduledTime: "2025-10-28T09:00:00-04:00",
    inspectorName: "Safety Lead",
  },
];
