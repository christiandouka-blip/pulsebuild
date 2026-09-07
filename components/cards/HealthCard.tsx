import { cn } from "@/lib/cn";

type HealthTone = "green" | "amber" | "red" | "neutral";

type HealthCardProps = {
  title?: string;
  score?: string;
  stateLabel?: string;
  tone?: HealthTone;
  className?: string;
};

const toneClass: Record<HealthTone, string> = {
  green: "text-build-green",
  amber: "text-warning-amber",
  red: "text-safety-red",
  neutral: "text-slate-100",
};

export function HealthCard({
  title = "Health Score",
  score = "—",
  stateLabel = "Awaiting signals",
  tone = "neutral",
  className,
}: HealthCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-surface-border bg-surface-card px-4 py-3",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
        {title}
      </p>
      <p className={cn("font-data mt-1 text-3xl font-semibold", toneClass[tone])}>
        {score}
      </p>
      <p className="mt-1 text-xs text-muted-text">{stateLabel}</p>
    </div>
  );
}
