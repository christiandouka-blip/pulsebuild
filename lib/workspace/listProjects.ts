import { isAuthorized } from "@/domain/authorization/types";
import type { AuthenticatedIdentity } from "@/domain/authorization/types";
import { authorizeOrganizationContext } from "@/lib/auth/authorize";
import type { IdentityDirectory } from "@/lib/auth/identityDirectory";
import type {
  ProjectCatalog,
  WorkspaceListResult,
} from "@/lib/workspace/types";

export async function listAuthorizedWorkspaceProjects(input: {
  identity: AuthenticatedIdentity | null;
  requestedOrganizationId: string | null | undefined;
  directory: IdentityDirectory;
  catalog: ProjectCatalog;
}): Promise<WorkspaceListResult> {
  const authorization = await authorizeOrganizationContext({
    identity: input.identity,
    organizationId: input.requestedOrganizationId,
    directory: input.directory,
  });
  if (!isAuthorized(authorization)) {
    return { status: authorization.status };
  }

  const { organizationId, actorUserId } = authorization.scope;
  const projects =
    authorization.role === "Owner"
      ? await input.catalog.listOrganizationProjects(organizationId)
      : await input.catalog.listAssignedProjects({
          userId: actorUserId,
          organizationId,
        });

  return {
    status: "Listed",
    organizationId,
    role: authorization.role,
    projects: projects.filter(
      (project) => project.organizationId === organizationId,
    ),
  };
}
