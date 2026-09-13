import { create } from "zustand";

import { getInitialProjectSnapshot } from "@/data/index";
import type { ReconstructedOperationalState } from "@/domain/operations/types";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export type ProjectSnapshotSource = "demo" | "workspace";

type ProjectStoreState = {
  snapshot: ProjectSnapshot | null;
  isLoaded: boolean;
  source: ProjectSnapshotSource;
  operational: ReconstructedOperationalState | null;
  loadSeedProject: () => void;
  loadWorkspaceSnapshot: (
    snapshot: ProjectSnapshot,
    operational?: ReconstructedOperationalState | null,
  ) => void;
};

export const useProjectStore = create<ProjectStoreState>((set) => ({
  snapshot: null,
  isLoaded: false,
  source: "demo",
  operational: null,
  loadSeedProject: () => {
    const snapshot = getInitialProjectSnapshot();
    set({ snapshot, isLoaded: true, source: "demo", operational: null });
  },
  loadWorkspaceSnapshot: (snapshot, operational = null) => {
    set({
      snapshot,
      isLoaded: true,
      source: "workspace",
      operational: operational ?? null,
    });
  },
}));
