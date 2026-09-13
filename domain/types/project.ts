import type { PhaseId, ProjectId } from "@/domain/types/identifiers";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";

export type PhaseStatus = "planned" | "active" | "completed";

export type Project = {
  id: ProjectId;
  name: string;
  location: string;
  currentPhaseId: PhaseId;
  startDate: string;
  targetDate: string;
  status: ProjectStatus;
  /** IANA timezone for presentation. Harbor Point remains America/New_York. */
  timezone: string;
  /**
   * Transitional operational instant on the snapshot.
   *
   * Demo/test: deterministic 15-minute simulated clock value.
   * Production: explicit current operational instant from the application
   * TimeProvider. Not persisted in PostgreSQL. Do not read the system clock
   * inside mapping or engines. Field name retained for frozen Phase 3 compatibility.
   */
  currentSimulatedAt: string;
};

export type Phase = {
  id: PhaseId;
  projectId: ProjectId;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  status: PhaseStatus;
};
