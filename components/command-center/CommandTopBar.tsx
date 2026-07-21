import { RotateCcw, StepForward } from "lucide-react";

import { Badge } from "@/components/layout/Badge";
import { Button } from "@/components/layout/Button";

type CommandTopBarProps = {
  projectName: string;
  phase: string;
  dateLabel: string;
  timezone: string;
  canProcessNext: boolean;
  onProcessNext: () => void;
  onReset: () => void;
};

/**
 * Phase 3A manual observation control (PO Decision 9). One activation processes
 * exactly one approved fixture. No timers, no autoplay, no background simulation.
 */
export function CommandTopBar({
  projectName,
  phase,
  dateLabel,
  timezone,
  canProcessNext,
  onProcessNext,
  onReset,
}: CommandTopBarProps) {
  return (
    <header className="border-b border-surface-border bg-surface-elevated/60 px-4 py-4 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-signal-cyan">
            Command Center
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-100">
            {projectName}
          </h1>
          <p className="mt-1 text-sm text-muted-text">
            {phase} · {dateLabel} · {timezone}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-text">Reasoning</span>
            <Badge variant="status">Active</Badge>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={onProcessNext}
            disabled={!canProcessNext}
            aria-disabled={!canProcessNext}
            title={
              canProcessNext
                ? "Process the next approved observation"
                : "All observations processed"
            }
          >
            <StepForward className="h-3.5 w-3.5" aria-hidden />
            Process Next Observation
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} title="Reset reasoning runtime">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-text">
        Manual observation playback for a controlled demonstration. Each activation
        processes one approved scenario fixture in order. This is not production
        simulation execution.
      </p>
    </header>
  );
}
