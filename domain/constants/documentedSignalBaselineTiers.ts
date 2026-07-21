import type { PriorityTier, SignalType } from "@/domain/types/signal";

/**
 * DOCUMENTED_SIGNAL_BASELINE_TIERS
 *
 * Source-document default tier hints from SoT §9 only.
 * This is NOT final operational priority.
 * Must NOT be shown by the UI as the final tier.
 * Must NOT bypass the future Priority Engine, which recalculates
 * contextual priority using safety, compliance, dependency impact,
 * critical path, cascade depth, idle labor, and combined signals.
 */
export const DOCUMENTED_SIGNAL_BASELINE_TIERS: Readonly<
  Record<SignalType, PriorityTier>
> = {
  SafetyIncident: "Tier1",
  InspectionFailed: "Tier1",
  InspectionMissing: "Tier1",
  CriticalEquipmentFailure: "Tier1",
  MaterialDeliveryDelayed: "Tier2",
  CrewShortage: "Tier2",
  WeatherAlert: "Tier2",
  PermitPending: "Tier2",
  TaskBehindSchedule: "Tier2",
  MinorDelay: "Tier3",
  TaskComplete: "Tier4",
  DeliveryReceived: "Tier4",
};
