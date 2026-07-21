import type { Permit } from "@/domain/types/resources";

export const seedPermits: Permit[] = [
  {
    id: "perm-electrical",
    type: "Electrical permit",
    status: "approved",
    requiredForTaskId: "task-electrical-rough",
    expirationDate: "2027-01-31",
  },
  {
    id: "perm-road-closure",
    type: "Road closure permit",
    status: "approved",
    requiredForTaskId: "task-site-prep",
    expirationDate: "2025-12-31",
  },
  {
    id: "perm-occupancy-partial",
    type: "Partial occupancy permit",
    status: "pending",
    requiredForTaskId: "task-fixture-install",
    expirationDate: "2027-12-31",
  },
];
