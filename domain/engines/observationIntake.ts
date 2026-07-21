import { DOCUMENTED_SIGNAL_BASELINE_TIERS } from "@/domain/constants/documentedSignalBaselineTiers";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type {
  ObservationIntakeResult,
  ProjectSignal,
  SignalSource,
} from "@/domain/types/signalRuntime";
import type { ScenarioFixture } from "@/domain/types/signal";

/**
 * Observation Intake Engine.
 *
 * Detects only — never interprets (CRS §4). Converts one approved scenario
 * fixture into a normalized ProjectSignal draft. Rejects an already-processed
 * fixture or an unresolved reference (the only place an input may be rejected).
 * Pure and deterministic; does not mutate the snapshot or the fixture.
 */
export function intakeObservation(
  snapshot: ProjectSnapshot,
  fixture: ScenarioFixture,
  processedFixtureIds: readonly string[],
): ObservationIntakeResult {
  const warnings: string[] = [];

  if (processedFixtureIds.includes(fixture.id)) {
    return {
      ok: false,
      signal: null,
      warnings: [`Fixture ${fixture.id} already processed`],
    };
  }

  if (!entityExists(snapshot, fixture.relatedEntityType, fixture.relatedEntityId)) {
    warnings.push(
      `Related entity ${fixture.relatedEntityType}:${fixture.relatedEntityId} not found`,
    );
  }
  if (!snapshot.tasks.some((t) => t.id === fixture.relatedTaskId)) {
    warnings.push(`Related task ${fixture.relatedTaskId} not found`);
  }
  if (warnings.length > 0) {
    return { ok: false, signal: null, warnings };
  }

  const signal: ProjectSignal = {
    id: `signal-${fixture.id}`,
    projectId: snapshot.project.id,
    type: fixture.signalType,
    status: "Detected",
    source: mapSource(fixture.sourceType),
    relatedEntityType: fixture.relatedEntityType,
    relatedEntityId: fixture.relatedEntityId,
    relatedTaskId: fixture.relatedTaskId,
    severityHint: DOCUMENTED_SIGNAL_BASELINE_TIERS[fixture.signalType],
    rawData: fixture.rawObservation,
    observedAtSimulated: addMinutes(
      snapshot.project.currentSimulatedAt,
      fixture.observedAtOffsetMinutes,
    ),
    originFixtureId: fixture.id,
    sequenceOrder: fixture.sequenceOrder,
  };

  return { ok: true, signal, warnings: [] };
}

function mapSource(source: ScenarioFixture["sourceType"]): SignalSource {
  return source === "seed" ? "system" : source;
}

/** Deterministic: base instant + offset minutes, expressed as a UTC ISO string. */
function addMinutes(baseIso: string, minutes: number): string {
  const epoch = new Date(baseIso).getTime() + minutes * 60_000;
  return new Date(epoch).toISOString();
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
      return snapshot.phases.some((p) => p.id === entityId);
    case "task":
      return snapshot.tasks.some((t) => t.id === entityId);
    case "crew":
      return snapshot.crews.some((c) => c.id === entityId);
    case "material":
      return snapshot.materials.some((m) => m.id === entityId);
    case "equipment":
      return snapshot.equipment.some((e) => e.id === entityId);
    case "inspection":
      return snapshot.inspections.some((i) => i.id === entityId);
    case "permit":
      return snapshot.permits.some((p) => p.id === entityId);
    case "weather":
      return snapshot.weather.some((w) => w.id === entityId);
    default:
      return false;
  }
}
