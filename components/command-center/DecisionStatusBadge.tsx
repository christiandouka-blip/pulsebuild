import { Badge } from "@/components/layout/Badge";
import { cn } from "@/lib/cn";
import type { DecisionState } from "@/domain/decisions";

const statusCopy: Record<
  DecisionState,
  {
    label: string;
    variant: "tier1" | "tier2" | "tier3" | "tier4" | "status" | "muted";
  }
> = {
  PendingReview: { label: "Pending review", variant: "tier2" },
  Acknowledged: { label: "Acknowledged", variant: "muted" },
  Approved: { label: "Approved", variant: "status" },
  PendingExecution: { label: "Pending execution", variant: "tier2" },
  Executed: { label: "Executed", variant: "status" },
  Blocked: { label: "Blocked", variant: "tier1" },
  AwaitingVerification: { label: "Awaiting verification", variant: "tier2" },
  VerificationFailed: { label: "Verification failed", variant: "tier1" },
  Verified: { label: "Verified", variant: "tier4" },
  Rejected: { label: "Rejected", variant: "tier3" },
  Cancelled: { label: "Cancelled", variant: "muted" },
};

type DecisionStatusBadgeProps = {
  state: DecisionState;
  className?: string;
};

export function DecisionStatusBadge({ state, className }: DecisionStatusBadgeProps) {
  const copy = statusCopy[state];
  return (
    <Badge
      variant={copy.variant}
      className={cn(className)}
      aria-label={`Decision status: ${copy.label}`}
    >
      {copy.label}
    </Badge>
  );
}

export function decisionStateLabel(state: DecisionState): string {
  return statusCopy[state].label;
}
