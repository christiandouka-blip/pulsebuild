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
  timezone: "America/New_York";
  /** Canonical simulated start instant — 2026-03-14T06:30:00-04:00 */
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
