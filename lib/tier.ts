import type { PriorityTier } from "@/domain/types/signal";

/** Map the canonical PriorityTier to the 1-4 numeric form used by PriorityBadge. */
export function tierToNumber(tier: PriorityTier): 1 | 2 | 3 | 4 {
  switch (tier) {
    case "Tier1":
      return 1;
    case "Tier2":
      return 2;
    case "Tier3":
      return 3;
    case "Tier4":
      return 4;
  }
}
