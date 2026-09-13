import type { PhaseStatus } from "@/domain/types/project";
import type {
  CrewStatus,
  DeliveryStatus,
  EquipmentStatus,
  InspectionStatus,
  PermitStatus,
  WeatherSeverity,
} from "@/domain/types/resources";

function lookup<T extends string>(
  table: Record<string, T>,
  raw: string | undefined,
): { value: T } | { unknown: string } {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return { unknown: "" };
  const value = table[key];
  if (!value) return { unknown: raw!.trim() };
  return { value };
}

const PHASE_STATUS: Record<string, PhaseStatus> = {
  planned: "planned",
  active: "active",
  "in progress": "active",
  inprogress: "active",
  completed: "completed",
  complete: "completed",
};

const CREW_STATUS: Record<string, CrewStatus> = {
  available: "available",
  assigned: "assigned",
  idle: "idle",
  off_site: "off_site",
  "off site": "off_site",
  "off-site": "off_site",
};

const DELIVERY_STATUS: Record<string, DeliveryStatus> = {
  ordered: "ordered",
  in_transit: "in_transit",
  "in transit": "in_transit",
  "in-transit": "in_transit",
  delayed: "delayed",
  received: "received",
  partial: "partial",
};

const EQUIPMENT_STATUS: Record<string, EquipmentStatus> = {
  available: "available",
  assigned: "assigned",
  maintenance: "maintenance",
  unavailable: "unavailable",
};

const INSPECTION_STATUS: Record<string, InspectionStatus> = {
  not_scheduled: "not_scheduled",
  "not scheduled": "not_scheduled",
  "not-scheduled": "not_scheduled",
  scheduled: "scheduled",
  passed: "passed",
  failed: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
};

const PERMIT_STATUS: Record<string, PermitStatus> = {
  pending: "pending",
  approved: "approved",
  expired: "expired",
  revoked: "revoked",
};

const WEATHER_SEVERITY: Record<string, WeatherSeverity> = {
  low: "low",
  moderate: "moderate",
  high: "high",
  severe: "severe",
};

export const normalizePhaseStatus = (raw: string | undefined) =>
  lookup(PHASE_STATUS, raw);
export const normalizeCrewStatus = (raw: string | undefined) =>
  lookup(CREW_STATUS, raw);
export const normalizeDeliveryStatus = (raw: string | undefined) =>
  lookup(DELIVERY_STATUS, raw);
export const normalizeEquipmentStatus = (raw: string | undefined) =>
  lookup(EQUIPMENT_STATUS, raw);
export const normalizeInspectionStatus = (raw: string | undefined) =>
  lookup(INSPECTION_STATUS, raw);
export const normalizePermitStatus = (raw: string | undefined) =>
  lookup(PERMIT_STATUS, raw);
export const normalizeWeatherSeverity = (raw: string | undefined) =>
  lookup(WEATHER_SEVERITY, raw);
