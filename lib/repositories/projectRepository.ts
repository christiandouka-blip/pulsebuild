import type {
  LoadProjectSnapshotInput,
  LoadProjectSnapshotResult,
  ProjectRepository,
  ProjectWorldSource,
} from "@/lib/repositories/types";
import { mapProjectSnapshot } from "@/lib/repositories/projectSnapshotMapper";

/**
 * Shared production load path:
 * TenantScope required → tenant-scoped world source → map → generic snapshot validation.
 * Harbor Point seed validation is not part of this path.
 * Operational time is supplied by the caller.
 */
export function createProjectRepository(
  worldSource: ProjectWorldSource,
): ProjectRepository {
  return {
    async loadProjectSnapshot(
      input: LoadProjectSnapshotInput,
    ): Promise<LoadProjectSnapshotResult> {
      const diagnostics = requireLoadInput(input);
      if (diagnostics.length > 0) {
        return { status: "InvalidProjectData", diagnostics };
      }

      let records;
      try {
        records = await worldSource.loadProjectWorld({
          organizationId: input.tenantScope.organizationId,
          projectId: input.projectId,
        });
      } catch {
        return {
          status: "DatabaseUnavailable",
          message: "Project database is unavailable",
        };
      }

      if (!records) {
        return { status: "ProjectNotFound" };
      }

      const mapped = mapProjectSnapshot(records, input.currentOperationalAt);
      if (mapped.status === "InvalidProjectData") {
        return mapped;
      }

      return { status: "Loaded", snapshot: mapped.snapshot };
    },
  };
}

export function requireLoadInput(input: LoadProjectSnapshotInput): string[] {
  const diagnostics: string[] = [];
  if (!input.tenantScope?.organizationId?.trim()) {
    diagnostics.push("TenantScope.organizationId is required");
  }
  if (!input.tenantScope?.actorUserId?.trim()) {
    diagnostics.push("TenantScope.actorUserId is required");
  }
  if (!input.projectId?.trim()) {
    diagnostics.push("projectId is required");
  }
  if (!input.currentOperationalAt?.trim()) {
    diagnostics.push("currentOperationalAt is required");
  }
  return diagnostics;
}
