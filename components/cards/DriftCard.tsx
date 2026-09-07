import { cn } from "@/lib/cn";

type DriftTone = "normal" | "warning" | "high" | "critical" | "neutral";

type DriftCardProps = {
  title?: string;
  score?: string;
  label?: string;
  tone?: DriftTone;
  className?: string;
};

const toneClass: Record<DriftTone, string> = {
  normal: "text-build-green",
  warning: "text-warning-amber",
  high: "text-warning-amber",
  critical: "text-safety-red",
  neutral: "text-slate-100",
};

export function DriftCard({
  title = "Drift Score",
  score = "—",
  label = "Normal",
  tone = "neutral",
  className,
}: DriftCardProps) {
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
      <p className="mt-1 text-xs text-muted-text">{label}</p>
    </div>
  );
}
