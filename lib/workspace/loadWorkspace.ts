import { isAuthorized } from "@/domain/authorization/types";
import type { AuthenticatedIdentity } from "@/domain/authorization/types";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import { authorizeProjectRequest } from "@/lib/auth/authorize";
import type { IdentityDirectory } from "@/lib/auth/identityDirectory";
import type { InstantClock } from "@/lib/import/clock";
import { loadOperationalWorkspace } from "@/lib/operations/service";
import type { OperationalStore } from "@/lib/operations/ports";
import {
  emptyOperationalBundle,
  reconstructOperationalWorkspace,
} from "@/lib/operations/reconstruct";
import { replayBaselineFromSnapshot } from "@/lib/operations/replaySnapshot";
import type { ProjectRepository } from "@/lib/repositories/types";
import type { WorkspaceFailureStatus, WorkspaceLoadResult } from "@/lib/workspace/types";
import type { OperationalFailureStatus } from "@/domain/operations/types";

/**
 * Production Command Center load path.
 * Auth → tenant-scoped repository → generic snapshot validation →
 * reconstruct committed operational history.
 * Harbor Point seed is never consulted.
 */
export async function loadProductionWorkspace(input: {
  identity: AuthenticatedIdentity | null;
  requestedOrganizationId: string | null | undefined;
  projectId: string;
  directory: IdentityDirectory;
  repository: ProjectRepository;
  clock: InstantClock;
  store?: OperationalStore;
}): Promise<WorkspaceLoadResult> {
  if (input.store) {
    const loaded = await loadOperationalWorkspace({
      identity: input.identity,
      requestedOrganizationId: input.requestedOrganizationId,
      projectId: input.projectId,
      directory: input.directory,
      repository: input.repository,
      store: input.store,
      clock: input.clock,
    });
    if (loaded.status !== "Loaded") {
      return { status: toWorkspaceFailure(loaded.status) };
    }
    return loaded;
  }

  const authorization = await authorizeProjectRequest({
    identity: input.identity,
    organizationId: input.requestedOrganizationId,
    projectId: input.projectId,
    capability: "project:view",
    directory: input.directory,
  });
  if (!isAuthorized(authorization)) {
    return { status: authorization.status };
  }

  const currentOperationalAt = input.clock.nowIso();
  const loaded = await input.repository.loadProjectSnapshot({
    tenantScope: authorization.scope,
    projectId: input.projectId,
    currentOperationalAt,
  });

  if (loaded.status === "DatabaseUnavailable") {
    return { status: "DatabaseUnavailable" };
  }
  if (loaded.status === "ProjectNotFound") {
    return { status: "ProjectNotFound" };
  }
  if (loaded.status === "InvalidProjectData") {
    return { status: "InvalidProjectData" };
  }

  const validation = validateProjectSnapshot(loaded.snapshot);
  if (!validation.ok) {
    return { status: "InvalidProjectData" };
  }

  const reconstructed = reconstructOperationalWorkspace(
    loaded.snapshot,
    emptyOperationalBundle({
      organizationId: authorization.scope.organizationId,
      projectId: loaded.snapshot.project.id,
      replayBaselineAt: replayBaselineFromSnapshot(loaded.snapshot),
    }),
  );
  if (reconstructed.status !== "Reconstructed") {
    return { status: reconstructed.status };
  }

  return {
    status: "Loaded",
    snapshot: loaded.snapshot,
    operational: reconstructed.operational,
    projectId: loaded.snapshot.project.id,
    organizationId: authorization.scope.organizationId,
    currentOperationalAt,
  };
}

function toWorkspaceFailure(status: OperationalFailureStatus): WorkspaceFailureStatus {
  if (
    status === "InvalidObservation" ||
    status === "InvalidTransition" ||
    status === "PersistenceConflict"
  ) {
    return "ReconstructionFailure";
  }
  return status;
}
