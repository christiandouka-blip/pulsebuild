import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-surface-elevated text-slate-200 border border-surface-border",
        tier1: "bg-safety-red/15 text-safety-red border border-safety-red/30",
        tier2: "bg-warning-amber/15 text-warning-amber border border-warning-amber/30",
        tier3: "bg-surface-elevated text-muted-text border border-surface-border",
        tier4: "bg-build-green/10 text-build-green border border-build-green/25",
        status: "bg-signal-cyan/10 text-signal-cyan border border-signal-cyan/25",
        muted: "bg-surface-elevated text-muted-text border border-surface-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
