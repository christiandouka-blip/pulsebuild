"use client";

import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/domain/types/navigation";
import { cn } from "@/lib/cn";

const iconMap = {
  command: LayoutDashboard,
  signals: Radio,
  chat: MessageSquare,
} as const;

type CompactRailNavProps = {
  items: NavItem[];
};

export function CompactRailNav({ items }: CompactRailNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex flex-1 flex-col items-center gap-2 px-2 py-4"
    >
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));

        if (item.disabled) {
          return (
            <span
              key={item.id}
              title={item.label}
              aria-disabled="true"
              aria-label={item.label}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-text/50"
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-md transition-colors",
              isActive
                ? "bg-steel-blue/30 text-signal-cyan"
                : "text-slate-300 hover:bg-surface-elevated hover:text-slate-100",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}
