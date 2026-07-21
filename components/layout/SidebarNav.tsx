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

type SidebarNavProps = {
  items: NavItem[];
};

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3">
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
              aria-disabled="true"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-text/60"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-steel-blue/30 text-signal-cyan"
                : "text-slate-300 hover:bg-surface-elevated hover:text-slate-100",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
