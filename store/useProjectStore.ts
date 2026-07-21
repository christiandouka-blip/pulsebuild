import { create } from "zustand";

import { getInitialProjectSnapshot } from "@/data/index";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

type ProjectStoreState = {
  snapshot: ProjectSnapshot | null;
  isLoaded: boolean;
  loadSeedProject: () => void;
};

export const useProjectStore = create<ProjectStoreState>((set) => ({
  snapshot: null,
  isLoaded: false,
  loadSeedProject: () => {
    const snapshot = getInitialProjectSnapshot();
    set({ snapshot, isLoaded: true });
  },
}));
