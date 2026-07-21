import { type ReactNode } from "react";

import { cn } from "@/lib/cn";

type PanelProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Panel({
  title,
  description,
  action,
  children,
  className,
  id,
}: PanelProps) {
  return (
    <section
      id={id}
      className={cn(
        "flex flex-col rounded-lg border border-surface-border bg-surface-card",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-surface-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-text">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </section>
  );
}
