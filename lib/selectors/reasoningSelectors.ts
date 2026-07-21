import type { SignalReasoning } from "@/domain/engines/reasoningPipeline";

/**
 * Count of open operational issues classified as Tier 1.
 * Pure selector — no engine logic; reads committed reasoning only.
 */
export function countOpenTier1Issues(reasonings: readonly SignalReasoning[]): number {
  return reasonings.filter(
    (r) =>
      r.issue !== null &&
      r.issue.status === "open" &&
      r.issue.finalTier === "Tier1",
  ).length;
}
