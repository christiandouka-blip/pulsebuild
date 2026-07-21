import type { Phase } from "@/domain/types/project";

export const seedPhases: Phase[] = [
  {
    id: "phase-sitework",
    projectId: "proj-harbor-point",
    name: "Sitework",
    plannedStart: "2025-11-01",
    plannedEnd: "2026-01-15",
    status: "completed",
  },
  {
    id: "phase-structure",
    projectId: "proj-harbor-point",
    name: "Structure",
    plannedStart: "2026-01-16",
    plannedEnd: "2026-08-30",
    status: "active",
  },
  {
    id: "phase-mep",
    projectId: "proj-harbor-point",
    name: "MEP Rough-in",
    plannedStart: "2026-09-01",
    plannedEnd: "2027-02-28",
    status: "planned",
  },
  {
    id: "phase-finishes",
    projectId: "proj-harbor-point",
    name: "Finishes",
    plannedStart: "2027-03-01",
    plannedEnd: "2027-06-30",
    status: "planned",
  },
];
