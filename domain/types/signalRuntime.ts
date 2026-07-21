import type { ProjectId, TaskId } from "@/domain/types/identifiers";
import type {
  PriorityTier,
  SignalLifecycleStatus,
  SignalType,
} from "@/domain/types/signal";

/** Runtime signal source — narrower than fixture source (seed maps to system). */
export type SignalSource = "simulation" | "user" | "system";

/**
 * Normalized runtime signal — Phase 3A.
 *
 * Distinct from a ScenarioFixture (descriptive source data) and from an
 * OperationalIssue (a derived problem). Created by the Observation Intake
 * engine and normalized by the Signal Engine. Never stored in ProjectSnapshot.
 */
export type ProjectSignal = {
  id: string;
  projectId: ProjectId;
  type: SignalType;
  status: SignalLifecycleStatus;
  source: SignalSource;
  relatedEntityType: string;
  relatedEntityId: string;
  relatedTaskId: TaskId;
  /** Baseline documented tier hint only — never the final priority. */
  severityHint: PriorityTier;
  rawData: Record<string, unknown>;
  observedAtSimulated: string;
  originFixtureId: string;
  sequenceOrder: number;
};

/** Narrow validation result — the only place an input may be rejected. */
export type ObservationIntakeResult = {
  ok: boolean;
  signal: ProjectSignal | null;
  warnings: string[];
};
