import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-surface-border bg-surface-elevated/40 px-4 py-8 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-surface-border bg-surface-card">
          <Icon className="h-5 w-5 text-signal-cyan" aria-hidden />
        </div>
      ) : null}
      <h3 className="text-sm font-medium text-slate-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-text">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
