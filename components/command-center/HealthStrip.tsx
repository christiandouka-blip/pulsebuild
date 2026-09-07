import { HealthCard } from "@/components/cards/HealthCard";
import { DriftCard } from "@/components/cards/DriftCard";
import type { RecoverySummaryView } from "@/lib/selectors/recoveryPresentationSelectors";
import type { DriftResult, HealthResult } from "@/domain/types/scoring";

type HealthStripProps = {
  health: HealthResult;
  drift: DriftResult;
  tier1Count: number;
  recovery: RecoverySummaryView;
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
  recovery,
}: HealthStripProps) {
  return (
    <section aria-label="Operational metrics" className="space-y-3">
      <p className="text-xs text-muted-text">
        Current operational scores after verified recovery effects. A recovered
        blocker is not the same as a recovered project.
      </p>
      <p className="text-sm text-slate-100" role="status">
        {recovery.explanation}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          title="Effective Health"
          score={String(health.score)}
          stateLabel={`Band ${health.band} · after verified recovery`}
          tone={healthTone(health.band)}
        />
        <DriftCard
          title="Effective Drift"
          score={String(drift.score)}
          label={`${drift.label} · after verified recovery`}
          tone={driftTone(drift.label)}
        />
        <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
            Effective Tier 1 blockers
          </p>
          <p className="font-data mt-1 text-3xl font-semibold text-slate-100">
            {tier1Count}
          </p>
          <p className="mt-1 text-xs text-muted-text">
            {tier1Count === 0
              ? "No currently open Tier 1 issues"
              : "Currently open Tier 1 issues after verified recovery"}
          </p>
        </div>
        <div
          className="rounded-lg border border-surface-border bg-surface-card px-4 py-3"
          aria-label="Operational recovery summary"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
            Operational recovery
          </p>
          <p className="font-data mt-1 text-3xl font-semibold text-slate-100">
            {recovery.currentlyRecoveredCount}
            <span className="ml-1 text-base font-normal text-muted-text">
              currently recovered
            </span>
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-text">
            <li>Open issues · {recovery.currentlyOpenCount}</li>
            <li>
              Historical recovery episodes · {recovery.historicalRecoveredEpisodeCount}
            </li>
            <li>Currently reopened · {recovery.currentlyReopenedCount}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
