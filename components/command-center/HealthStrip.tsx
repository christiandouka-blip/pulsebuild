import { HealthCard } from "@/components/cards/HealthCard";
import { DriftCard } from "@/components/cards/DriftCard";
import type { DriftResult, HealthResult } from "@/domain/types/scoring";

type HealthStripProps = {
  health: HealthResult;
  drift: DriftResult;
  tier1Count: number;
  unresolvedActions: number;
};

const healthTone = (band: HealthResult["band"]) =>
  band === "green" ? "green" : band === "amber" ? "amber" : "red";

const driftTone = (label: DriftResult["label"]) => {
  switch (label) {
    case "Normal":
      return "normal" as const;
    case "Warning":
      return "warning" as const;
    case "High Drift":
      return "high" as const;
    case "Critical Drift":
      return "critical" as const;
  }
};

export function HealthStrip({
  health,
  drift,
  tier1Count,
  unresolvedActions,
}: HealthStripProps) {
  return (
    <section aria-label="Operational metrics" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          score={String(health.score)}
          stateLabel={health.explanation}
          tone={healthTone(health.band)}
        />
        <DriftCard
          score={String(drift.score)}
          label={`${drift.label} · ${drift.explanation}`}
          tone={driftTone(drift.label)}
        />
        <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
            Tier 1 Blockers
          </p>
          <p className="font-data mt-1 text-3xl font-semibold text-slate-100">
            {tier1Count}
          </p>
          <p className="mt-1 text-xs text-muted-text">
            {tier1Count === 0 ? "No active blockers" : "Active Tier 1 issues"}
          </p>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
            Unresolved Actions
          </p>
          <p className="font-data mt-1 text-3xl font-semibold text-slate-100">
            {unresolvedActions}
          </p>
          <p className="font-data mt-1 text-xs text-muted-text">
            Approval &amp; verification activate in a later phase
          </p>
        </div>
      </div>
    </section>
  );
}
