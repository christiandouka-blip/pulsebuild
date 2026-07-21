import { create } from "zustand";

import type { MobilePanel } from "@/domain/types/ui";

type UIState = {
  isChatCollapsed: boolean;
  activeMobilePanel: MobilePanel;
  selectedSignalId: string | null;
  setChatCollapsed: (collapsed: boolean) => void;
  toggleChatCollapsed: () => void;
  setActiveMobilePanel: (panel: MobilePanel) => void;
  openSignal: (signalId: string) => void;
  closeSignal: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  isChatCollapsed: true,
  activeMobilePanel: "command",
  selectedSignalId: null,
  setChatCollapsed: (collapsed) => set({ isChatCollapsed: collapsed }),
  toggleChatCollapsed: () =>
    set((state) => ({ isChatCollapsed: !state.isChatCollapsed })),
  setActiveMobilePanel: (panel) => set({ activeMobilePanel: panel }),
  openSignal: (signalId) => set({ selectedSignalId: signalId }),
  closeSignal: () => set({ selectedSignalId: null }),
}));
