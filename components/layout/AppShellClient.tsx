"use client";

import { type ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { BottomNav } from "@/components/layout/BottomNav";
import { useUIStore } from "@/store/useUIStore";

type AppShellClientProps = {
  children: ReactNode;
};

export function AppShellClient({ children }: AppShellClientProps) {
  const setActiveMobilePanel = useUIStore((state) => state.setActiveMobilePanel);
  const setChatCollapsed = useUIStore((state) => state.setChatCollapsed);

  const handleChatSelect = () => {
    setActiveMobilePanel("chat");
    setChatCollapsed(false);
  };

  return (
    <AppShell bottomNav={<BottomNav onChatSelect={handleChatSelect} />}>
      {children}
    </AppShell>
  );
}
