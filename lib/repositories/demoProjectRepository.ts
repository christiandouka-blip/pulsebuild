import { getInitialProjectSnapshot } from "@/data/index";
import type {
  LoadProjectSnapshotInput,
  LoadProjectSnapshotResult,
  ProjectRepository,
} from "@/lib/repositories/types";
import { requireLoadInput } from "@/lib/repositories/projectRepository";

/**
 * Demo-only Harbor Point loader.
 * TenantScope is still required on the contract; organization/project lookup
 * is ignored because this path is never selected in production mode.
 * currentOperationalAt is ignored so Harbor Point seed time stays frozen.
 */
export function createDemoProjectRepository(): ProjectRepository {
  return {
    async loadProjectSnapshot(
      input: LoadProjectSnapshotInput,
    ): Promise<LoadProjectSnapshotResult> {
      const diagnostics = requireLoadInput(input);
      if (diagnostics.length > 0) {
        return { status: "InvalidProjectData", diagnostics };
      }

      const snapshot = getInitialProjectSnapshot();
      return { status: "Loaded", snapshot };
    },
  };
}
