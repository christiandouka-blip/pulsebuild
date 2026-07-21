"use client";

import { type ReactNode } from "react";

import { CompactRailNav } from "@/components/layout/CompactRailNav";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { primaryNavItems } from "@/domain/types/navigation";

type AppShellProps = {
  children: ReactNode;
  bottomNav?: ReactNode;
};

export function AppShell({ children, bottomNav }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-command-navy text-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-surface-border bg-command-navy lg:flex">
        <div className="border-b border-surface-border px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
            PulseBuild
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            Operations Command
          </p>
        </div>
        <SidebarNav items={primaryNavItems} />
        <div className="mt-auto border-t border-surface-border px-5 py-4">
          <p className="text-xs text-muted-text">
            Reactive construction operations
          </p>
        </div>
      </aside>

      {/* Tablet compact rail */}
      <aside className="hidden w-16 shrink-0 flex-col border-r border-surface-border bg-command-navy md:flex lg:hidden">
        <div className="flex h-14 items-center justify-center border-b border-surface-border">
          <span
            className="font-data text-xs font-semibold text-signal-cyan"
            aria-label="PulseBuild"
          >
            PB
          </span>
        </div>
        <CompactRailNav items={primaryNavItems} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        {bottomNav}
      </div>
    </div>
  );
}
