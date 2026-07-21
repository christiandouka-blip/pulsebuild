import type { Crew } from "@/domain/types/resources";

export const seedCrews: Crew[] = [
  {
    id: "crew-concrete-a",
    name: "Concrete Crew A",
    trade: "concrete",
    requiredWorkers: 8,
    availableWorkers: 8,
    status: "assigned",
    currentTaskId: "task-pour-level-1-slab",
  },
  {
    id: "crew-framing-a",
    name: "Framing Crew A",
    trade: "framing",
    requiredWorkers: 10,
    availableWorkers: 10,
    status: "available",
    currentTaskId: null,
  },
  {
    id: "crew-drywall-a",
    name: "Drywall Crew A",
    trade: "drywall",
    requiredWorkers: 5,
    availableWorkers: 5,
    status: "assigned",
    currentTaskId: "task-interior-drywall-prep",
  },
  {
    id: "crew-electrical-a",
    name: "Electrical Crew A",
    trade: "electrical",
    requiredWorkers: 6,
    availableWorkers: 6,
    status: "available",
    currentTaskId: null,
  },
  {
    id: "crew-general-a",
    name: "General Labor Crew A",
    trade: "general",
    requiredWorkers: 4,
    availableWorkers: 4,
    status: "available",
    currentTaskId: null,
  },
];
