import { transitiveSuccessors } from "@/lib/selectors/dependencySelectors";
import type { DependencyImpact } from "@/domain/types/analysis";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { ReasoningEvidence } from "@/domain/types/reasoning";

/**
 * Dependency Engine (SoT §10, CRS §7).
 *
 * Walks the downstream dependency graph for the signal's related task. Pure and
 * deterministic; derives successors from Task.dependencyTaskIds without mutating
 * or duplicating snapshot data.
 */
export function analyzeDependency(
  signal: ProjectSignal,
  snapshot: ProjectSnapshot,
): DependencyImpact {
  const originTaskId = signal.relatedTaskId;
  const originTask = snapshot.tasks.find((t) => t.id === originTaskId);

  const { immediate, affected, maxDepth } = transitiveSuccessors(
    snapshot.tasks,
    originTaskId,
  );

  const criticalPathTaskIds = new Set(
    snapshot.tasks.filter((t) => t.isCriticalPath).map((t) => t.id),
  );
  const criticalPathImpacted =
    (originTask?.isCriticalPath ?? false) ||
    affected.some((id) => criticalPathTaskIds.has(id));

  const evidence: ReasoningEvidence[] = [
    {
      entityType: "task",
      entityId: originTaskId,
      fact: `${affected.length} downstream task(s) affected; cascade depth ${maxDepth}`,
    },
  ];
  if (criticalPathImpacted) {
    evidence.push({
      entityType: "task",
      entityId: originTaskId,
      fact: "Critical-path work is within the affected set",
    });
  }

  return {
    originTaskId,
    immediateTaskIds: immediate,
    affectedTaskIds: affected,
    cascadeDepth: maxDepth,
    criticalPathImpacted,
    evidence,
  };
}
