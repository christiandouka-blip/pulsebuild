/**
 * Phase 3C observation-effect resolver — pure translation of a committed
 * ProjectSignal into a typed operational effect.
 *
 * Reads only structured signal fields. The committed signal stores fixture
 * rawObservation as `rawData` (not `rawObservation`). Never reads
 * ScenarioFixture, recommendation prose, or UI copy.
 */

import type {
  MaterialDeliveryReceivedEffect,
  ObservationEffectRejected,
  ObservationEffectRejectionCode,
  ObservationEffectResolution,
  TaskCompletedEffect,
} from "@/domain/effects/types";
import type { DeliveryStatus } from "@/domain/types/resources";
import type { ProjectSignal } from "@/domain/types/signalRuntime";

const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "ordered",
  "in_transit",
  "delayed",
  "received",
  "partial",
];

/**
 * Resolve the operational effect of one committed ProjectSignal.
 *
 * Pure. Never throws for a normal domain rejection.
 */
export function resolveObservationEffect(
  signal: ProjectSignal,
): ObservationEffectResolution {
  switch (signal.type) {
    case "DeliveryReceived":
      return resolveDeliveryReceived(signal);
    case "TaskComplete":
      return resolveTaskComplete(signal);
    default:
      return {
        outcome: "NoOperationalEffect",
        reason: "unsupported_signal_type",
        signalId: signal.id,
        signalType: signal.type,
        simulatedAt: signal.observedAtSimulated,
      };
  }
}

function resolveDeliveryReceived(
  signal: ProjectSignal,
): ObservationEffectResolution {
  const identity = validateSignalIdentity(signal);
  if (identity) return identity;

  if (signal.relatedEntityType !== "material") {
    return observationRejected(
      signal,
      "WRONG_RELATED_ENTITY_TYPE",
      `DeliveryReceived requires relatedEntityType "material"; received "${signal.relatedEntityType}".`,
    );
  }
  if (!hasText(signal.relatedEntityId)) {
    return observationRejected(
      signal,
      "MISSING_RELATED_ENTITY_ID",
      "DeliveryReceived requires a non-empty relatedEntityId naming the material.",
    );
  }

  const raw = signal.rawData;
  const status = raw.deliveryStatus;
  if (!isDeliveryStatus(status)) {
    return observationRejected(
      signal,
      "INVALID_DELIVERY_STATUS",
      "DeliveryReceived rawData.deliveryStatus is missing or is not a valid DeliveryStatus.",
    );
  }
  if (status !== "received") {
    return observationRejected(
      signal,
      "DELIVERY_STATUS_NOT_RECEIVED",
      `DeliveryReceived requires rawData.deliveryStatus "received"; received "${status}".`,
    );
  }

  const quantity = raw.quantityReceived;
  if (!isValidQuantity(quantity)) {
    return observationRejected(
      signal,
      "INVALID_QUANTITY_RECEIVED",
      "DeliveryReceived requires rawData.quantityReceived to be a finite non-negative number.",
    );
  }

  const effect: MaterialDeliveryReceivedEffect = {
    id: observationEffectId(signal.id, "MaterialDeliveryReceived"),
    source: "observation",
    signalId: signal.id,
    effectType: "MaterialDeliveryReceived",
    simulatedAt: signal.observedAtSimulated,
    materialId: signal.relatedEntityId,
    deliveryStatus: "received",
    quantityReceived: quantity,
  };

  return { outcome: "Resolved", effect };
}

function resolveTaskComplete(signal: ProjectSignal): ObservationEffectResolution {
  const identity = validateSignalIdentity(signal);
  if (identity) return identity;

  if (signal.relatedEntityType !== "task") {
    return observationRejected(
      signal,
      "WRONG_RELATED_ENTITY_TYPE",
      `TaskComplete requires relatedEntityType "task"; received "${signal.relatedEntityType}".`,
    );
  }
  if (!hasText(signal.relatedEntityId)) {
    return observationRejected(
      signal,
      "MISSING_RELATED_ENTITY_ID",
      "TaskComplete requires a non-empty relatedEntityId naming the task.",
    );
  }

  const effect: TaskCompletedEffect = {
    id: observationEffectId(signal.id, "TaskCompleted"),
    source: "observation",
    signalId: signal.id,
    effectType: "TaskCompleted",
    simulatedAt: signal.observedAtSimulated,
    taskId: signal.relatedEntityId,
    status: "Completed",
    actualEnd: signal.observedAtSimulated,
  };

  return { outcome: "Resolved", effect };
}

function validateSignalIdentity(
  signal: ProjectSignal,
): ObservationEffectRejected | null {
  if (!hasText(signal.id)) {
    return observationRejected(
      signal,
      "INVALID_SIGNAL_IDENTITY",
      "Committed signal id is required and must be a non-empty string.",
    );
  }
  if (!hasText(signal.observedAtSimulated)) {
    return observationRejected(
      signal,
      "MISSING_OBSERVED_AT",
      "Committed signal observedAtSimulated is required and is the authoritative completion time.",
    );
  }
  return null;
}

function observationEffectId(signalId: string, effectType: string): string {
  return `effect-observation-${signalId}-${effectType}`;
}

function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return (
    typeof value === "string" &&
    (DELIVERY_STATUSES as readonly string[]).includes(value)
  );
}

function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function observationRejected(
  signal: ProjectSignal,
  code: ObservationEffectRejectionCode,
  message: string,
): ObservationEffectRejected {
  return { outcome: "Rejected", code, signalId: signal.id, message };
}

function hasText(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
