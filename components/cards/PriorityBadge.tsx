import { Badge } from "@/components/layout/Badge";
import { cn } from "@/lib/cn";

type PriorityTier = 1 | 2 | 3 | 4;

const tierLabels: Record<PriorityTier, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
};

const tierVariants: Record<
  PriorityTier,
  "tier1" | "tier2" | "tier3" | "tier4"
> = {
  1: "tier1",
  2: "tier2",
  3: "tier3",
  4: "tier4",
};

type PriorityBadgeProps = {
  tier: PriorityTier;
  className?: string;
};

export function PriorityBadge({ tier, className }: PriorityBadgeProps) {
  return (
    <Badge variant={tierVariants[tier]} className={cn(className)}>
      {tierLabels[tier]}
    </Badge>
  );
}
