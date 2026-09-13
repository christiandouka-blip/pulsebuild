import type { AuthorizationStatus } from "@/domain/authorization/types";
import type { ReconstructedOperationalState } from "@/domain/operations/types";
import type { ProjectStatus } from "@/domain/types/project";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

export type AccessibleProject = {
  id: string;
  organizationId: string;
  name: string;
  status: ProjectStatus;
};

export type ProjectCatalog = {
  listOrganizationProjects(
    organizationId: string,
  ): Promise<readonly AccessibleProject[]>;
  listAssignedProjects(input: {
    userId: string;
    organizationId: string;
  }): Promise<readonly AccessibleProject[]>;
};

export type WorkspaceFailureStatus =
  | Exclude<AuthorizationStatus, "Authorized">
  | "InvalidProjectData"
  | "DatabaseUnavailable"
  | "InvalidPersistedOperationalData"
  | "ReconstructionFailure";

export type WorkspaceLoadResult =
  | {
      status: "Loaded";
      snapshot: ProjectSnapshot;
      operational: ReconstructedOperationalState;
      projectId: string;
      organizationId: string;
      currentOperationalAt: string;
    }
  | { status: WorkspaceFailureStatus };

export type WorkspaceListResult =
  | {
      status: "Listed";
      organizationId: string;
      role: string;
      projects: readonly AccessibleProject[];
    }
  | { status: WorkspaceFailureStatus };
