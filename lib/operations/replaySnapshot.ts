import { intakeObservation } from "@/domain/engines/observationIntake";
import type { PersistedObservation } from "@/domain/operations/types";
import type { ScenarioFixture } from "@/domain/types/signal";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export function replayBaselineFromSnapshot(snapshot: ProjectSnapshot): string {
  const start = snapshot.project.startDate.trim();
  if (!start) return "1970-01-01T00:00:00.000Z";
  if (start.includes("T")) return new Date(start).toISOString();
  return `${start}T00:00:00.000Z`;
}

export function observationToFixture(
  observation: PersistedObservation,
  replayBaselineAt: string,
): ScenarioFixture {
  const offsetMinutes =
    (new Date(observation.committedAt).getTime() -
      new Date(replayBaselineAt).getTime()) /
    60_000;
  return {
    id: observation.id,
    sequenceOrder: observation.sequenceOrder,
    signalType: observation.signalType,
    title: observation.title,
    description: observation.description,
    sourceType: observation.sourceType,
    relatedEntityType: observation.relatedEntityType,
    relatedEntityId: observation.relatedEntityId,
    relatedTaskId: observation.relatedTaskId,
    observedAtOffsetMinutes: offsetMinutes,
    rawObservation: observation.payload,
    evidenceIds: [...observation.evidenceIds],
  };
}

export function buildReplaySnapshot(
  snapshot: ProjectSnapshot,
  observations: readonly PersistedObservation[],
  replayBaselineAt: string,
): ProjectSnapshot {
  const fixtures = [...observations]
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    .map((observation) => observationToFixture(observation, replayBaselineAt));
  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      currentSimulatedAt: replayBaselineAt,
    },
    scenarioFixtures: fixtures,
  };
}

export function trialObservationIntake(
  snapshot: ProjectSnapshot,
  observation: PersistedObservation,
  prior: readonly PersistedObservation[],
  replayBaselineAt: string,
): { ok: boolean; warnings: string[] } {
  const replay = buildReplaySnapshot(
    snapshot,
    [...prior, observation],
    replayBaselineAt,
  );
  const fixture = observationToFixture(observation, replayBaselineAt);
  const processed = prior.map((item) => item.id);
  const intake = intakeObservation(replay, fixture, processed);
  return { ok: intake.ok && intake.signal !== null, warnings: intake.warnings };
}
