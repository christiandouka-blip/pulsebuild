import { buildProjectSnapshot } from "@/data/index";
import { analyzeDependency } from "@/domain/engines/dependencyEngine";
import { buildContext } from "@/domain/engines/contextBuilder";
import { classifyPriority } from "@/domain/engines/priorityEngine";
import { intakeObservation } from "@/domain/engines/observationIntake";
import { markPrioritized, normalizeSignal } from "@/domain/engines/signalEngine";
import { predict } from "@/domain/engines/predictionEngine";
import { recommend } from "@/domain/engines/recommendationEngine";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

/** Run one fixture through the deterministic pipeline (test convenience only). */
export function runFixture(snapshot: ProjectSnapshot, fixtureId: string) {
  const fixture = snapshot.scenarioFixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new Error(`fixture ${fixtureId} not found`);

  const intake = intakeObservation(snapshot, fixture, []);
  if (!intake.ok || !intake.signal) {
    throw new Error(`intake failed: ${intake.warnings.join(", ")}`);
  }

  const context = buildContext(snapshot);
  let signal = normalizeSignal(intake.signal);
  const dependency = analyzeDependency(signal, snapshot);
  const priority = classifyPriority(signal, snapshot, context, dependency);
  signal = markPrioritized(signal);
  const prediction = predict(signal, snapshot, context, dependency, priority);
  const positive = signal.type === "TaskComplete" || signal.type === "DeliveryReceived";
  const issueId = positive ? null : `issue-${signal.id}`;
  const recommendation = recommend({
    signal,
    snapshot,
    context,
    dependency,
    priority,
    prediction,
    issueId,
  });

  return { signal, context, dependency, priority, prediction, recommendation };
}

export function freshSnapshot(): ProjectSnapshot {
  return buildProjectSnapshot();
}
