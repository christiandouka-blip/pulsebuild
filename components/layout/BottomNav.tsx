"use client";

import { LayoutDashboard, MessageSquare, Radio } from "lucide-react";

import type { MobilePanel } from "@/domain/types/ui";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/useUIStore";

type BottomNavProps = {
  onChatSelect: () => void;
};

const items: Array<{
  id: MobilePanel;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}> = [
  { id: "command", label: "Command", icon: LayoutDashboard },
  { id: "signals", label: "Signals", icon: Radio, disabled: true },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

export function BottomNav({ onChatSelect }: BottomNavProps) {
  const activeMobilePanel = useUIStore((state) => state.activeMobilePanel);
  const setActiveMobilePanel = useUIStore(
    (state) => state.setActiveMobilePanel,
  );

  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-command-navy px-2 pb-[env(safe-area-inset-bottom)] pt-2 lg:hidden"
    >
      <ul className="grid grid-cols-3 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeMobilePanel === item.id;

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                aria-disabled={item.disabled}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.id === "chat") {
                    onChatSelect();
                    return;
                  }
                  setActiveMobilePanel(item.id);
                }}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                  item.disabled
                    ? "cursor-not-allowed text-muted-text/50"
                    : isActive
                      ? "bg-steel-blue/30 text-signal-cyan"
                      : "text-slate-300 hover:bg-surface-elevated",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
