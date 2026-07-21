import type { Material } from "@/domain/types/resources";

export const seedMaterials: Material[] = [
  {
    id: "mat-concrete",
    name: "Ready-mix concrete — Level 1 slab",
    deliveryStatus: "in_transit",
    expectedDeliveryTime: "2026-03-14T10:30:00-04:00",
    quantityExpected: 120,
    quantityReceived: 0,
  },
  {
    id: "mat-rebar",
    name: "Rebar #5",
    deliveryStatus: "received",
    expectedDeliveryTime: "2026-02-15T08:00:00-05:00",
    quantityExpected: 200,
    quantityReceived: 200,
  },
  {
    id: "mat-drywall",
    name: "Drywall sheets 5/8",
    deliveryStatus: "received",
    expectedDeliveryTime: "2026-03-01T09:00:00-05:00",
    quantityExpected: 400,
    quantityReceived: 400,
  },
  {
    id: "mat-conduit",
    name: "Electrical conduit",
    deliveryStatus: "ordered",
    expectedDeliveryTime: "2026-08-20T10:00:00-04:00",
    quantityExpected: 1500,
    quantityReceived: 0,
  },
  {
    id: "mat-fixtures",
    name: "Plumbing fixtures package",
    deliveryStatus: "ordered",
    expectedDeliveryTime: "2027-04-01T10:00:00-04:00",
    quantityExpected: 48,
    quantityReceived: 0,
  },
];
