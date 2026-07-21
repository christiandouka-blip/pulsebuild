import type { Equipment } from "@/domain/types/resources";

export const seedEquipment: Equipment[] = [
  {
    id: "equip-excavator",
    name: "Excavator",
    status: "available",
    assignedTaskId: null,
    availableFrom: "2025-10-01T07:00:00-04:00",
  },
  {
    id: "equip-pump-truck",
    name: "Concrete pump truck",
    status: "assigned",
    assignedTaskId: "task-pour-level-1-slab",
    availableFrom: "2026-03-14T06:00:00-04:00",
  },
  {
    id: "equip-crane",
    name: "Tower crane",
    status: "available",
    assignedTaskId: null,
    availableFrom: "2026-03-01T07:00:00-05:00",
  },
  {
    id: "equip-scissor-lift",
    name: "Scissor lift",
    status: "assigned",
    assignedTaskId: "task-interior-drywall-prep",
    availableFrom: "2026-03-10T07:00:00-04:00",
  },
];
