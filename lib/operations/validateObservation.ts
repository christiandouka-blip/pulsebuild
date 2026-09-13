import type { ProductionObservationInput } from "@/domain/operations/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { SignalType } from "@/domain/types/signal";

const SIGNAL_TYPES: readonly SignalType[] = [
  "SafetyIncident",
  "InspectionFailed",
  "InspectionMissing",
  "CriticalEquipmentFailure",
  "MaterialDeliveryDelayed",
  "CrewShortage",
  "WeatherAlert",
  "PermitPending",
  "TaskBehindSchedule",
  "MinorDelay",
  "TaskComplete",
  "DeliveryReceived",
];

const SIGNAL_TYPE_SET = new Set<string>(SIGNAL_TYPES);

export function validateProductionObservation(
  snapshot: ProjectSnapshot,
  input: ProductionObservationInput,
): string[] {
  const errors: string[] = [];
  if (!SIGNAL_TYPE_SET.has(input.signalType)) {
    errors.push("Unknown signal type.");
  }
  if (!input.title.trim()) errors.push("Title is required.");
  if (!input.description.trim()) errors.push("Description is required.");
  if (!input.relatedEntityType.trim()) errors.push("Related entity type is required.");
  if (!input.relatedEntityId.trim()) errors.push("Related entity id is required.");
  if (!input.relatedTaskId.trim()) errors.push("Related task id is required.");
  if (input.payload && !isPlainObject(input.payload)) {
    errors.push("Observation payload must be a structured object.");
  }
  if (
    input.relatedTaskId.trim() &&
    !snapshot.tasks.some((task) => task.id === input.relatedTaskId)
  ) {
    errors.push("Related task is not in this project.");
  }
  if (
    input.relatedEntityType.trim() &&
    input.relatedEntityId.trim() &&
    !entityExists(snapshot, input.relatedEntityType, input.relatedEntityId)
  ) {
    errors.push("Related entity is not in this project.");
  }
  return errors;
}

export function isSignalType(value: string): value is SignalType {
  return SIGNAL_TYPE_SET.has(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entityExists(
  snapshot: ProjectSnapshot,
  entityType: string,
  entityId: string,
): boolean {
  switch (entityType) {
    case "project":
      return snapshot.project.id === entityId;
    case "phase":
      return snapshot.phases.some((item) => item.id === entityId);
    case "task":
      return snapshot.tasks.some((item) => item.id === entityId);
    case "crew":
      return snapshot.crews.some((item) => item.id === entityId);
    case "material":
      return snapshot.materials.some((item) => item.id === entityId);
    case "equipment":
      return snapshot.equipment.some((item) => item.id === entityId);
    case "inspection":
      return snapshot.inspections.some((item) => item.id === entityId);
    case "permit":
      return snapshot.permits.some((item) => item.id === entityId);
    case "weather":
      return snapshot.weather.some((item) => item.id === entityId);
    default:
      return false;
  }
}
