import type {
  DependencyImpact,
  PredictionResult,
  PriorityResult,
} from "@/domain/types/analysis";
import type { ContextSnapshot } from "@/domain/types/context";
import {
  resolveIdleCrewIds,
  signalIdleScope,
} from "@/domain/engines/idleCrewRisk";
import type { ExposureCategory, ReasoningEvidence } from "@/domain/types/reasoning";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

/**
 * Prediction Engine (CRS §10, PO Decision 1).
 *
 * Deterministic operational projection. Never mutates the snapshot and never
 * claims a projected outcome has occurred. Produces a numeric estimate only
 * when two known timestamps support it; otherwise an explicit exposure category.
 * Idle-crew risk uses the same scoped definition as Drift (signal-related only).
 */
export function predict(
  signal: ProjectSignal,
  snapshot: ProjectSnapshot,
  context: ContextSnapshot,
  dependency: DependencyImpact,
  priority: PriorityResult,
): PredictionResult {
  const evidence: ReasoningEvidence[] = [];

  const criticalPathExposure: ExposureCategory = dependency.criticalPathImpacted
    ? exposureFromTier(priority.finalTier)
    : "No measurable exposure";

  const idleCrewIds = resolveIdleCrewIds(
    snapshot,
    context,
    signalIdleScope(signal.relatedTaskId),
  );
  const idleCrewRisk = {
    category: exposureFromCount(idleCrewIds.length),
    crewIds: idleCrewIds,
  };
  if (idleCrewIds.length > 0) {
    evidence.push({
      entityType: "crew",
      entityId: idleCrewIds[0],
      fact: `${idleCrewIds.length} crew(s) at idle risk on signal-related blocked work`,
    });
  }

  const scheduleExposure = deriveScheduleExposure(signal, snapshot, priority);
  if (scheduleExposure.estimatedHours !== null) {
    evidence.push({
      entityType: "task",
      entityId: signal.relatedTaskId,
      fact: `Estimated schedule exposure ~${scheduleExposure.estimatedHours}h from known timestamps`,
    });
  }

  const projectedConsequence = `If unaddressed, ${dependency.affectedTaskIds.length} downstream task(s) face ${scheduleExposure.category}; critical-path exposure ${criticalPathExposure}; idle-crew risk ${idleCrewRisk.category}.`;

  return {
    affectedTaskIds: dependency.affectedTaskIds,
    cascadeDepth: dependency.cascadeDepth,
    criticalPathExposure,
    idleCrewRisk,
    scheduleExposure,
    projectedConsequence,
    confidence: priority.confidence,
    evidence,
  };
}

function exposureFromTier(tier: PriorityResult["finalTier"]): ExposureCategory {
  switch (tier) {
    case "Tier1":
      return "Critical exposure";
    case "Tier2":
      return "High exposure";
    case "Tier3":
      return "Moderate exposure";
    case "Tier4":
      return "No measurable exposure";
  }
}

function exposureFromCount(count: number): ExposureCategory {
  if (count <= 0) return "No measurable exposure";
  if (count === 1) return "Low exposure";
  if (count === 2) return "Moderate exposure";
  if (count === 3) return "High exposure";
  return "Critical exposure";
}

function deriveScheduleExposure(
  signal: ProjectSignal,
  snapshot: ProjectSnapshot,
  priority: PriorityResult,
): { category: ExposureCategory; estimatedHours: number | null } {
  const task = snapshot.tasks.find((t) => t.id === signal.relatedTaskId);
  const revisedEta = signal.rawData["revisedEta"];
  if (task && typeof revisedEta === "string") {
    const revised = new Date(revisedEta).getTime();
    const plannedStart = new Date(task.plannedStart).getTime();
    if (Number.isFinite(revised) && Number.isFinite(plannedStart) && revised > plannedStart) {
      const hours = Math.round((revised - plannedStart) / 3_600_000);
      return { category: hours >= 8 ? "High exposure" : "Moderate exposure", estimatedHours: hours };
    }
  }
  // No supportable numeric estimate — fall back to an explicit category.
  return { category: exposureFromTier(priority.finalTier), estimatedHours: null };
}
