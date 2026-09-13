import {
  capabilitiesForRole,
  type Capability,
} from "@/domain/authorization/capabilities";
import {
  authorizeOrganizationCapability,
  authorizeProjectAccess,
  deriveTenantScope,
  resolveActiveOrganization,
} from "@/domain/authorization/policy";
import type {
  AuthenticatedIdentity,
  AuthorizationResult,
} from "@/domain/authorization/types";
import type { IdentityDirectory } from "@/lib/auth/identityDirectory";

export type AuthorizeProjectInput = {
  identity: AuthenticatedIdentity | null;
  organizationId: string | null | undefined;
  projectId: string;
  capability: Capability;
  directory: IdentityDirectory;
};

export async function authorizeProjectRequest(
  input: AuthorizeProjectInput,
): Promise<AuthorizationResult> {
  if (!input.identity) {
    return { status: "Unauthenticated" };
  }

  const user = await input.directory.findUserById(input.identity.userId);
  const memberships = user
    ? await input.directory.listOrganizationMemberships(input.identity.userId)
    : [];

  const active = resolveActiveOrganization(memberships, input.organizationId);
  const scopedProject =
    active.status === "resolved"
      ? await input.directory.findProjectInOrganization(
          input.projectId,
          active.organizationId,
        )
      : null;

  const hasProjectMembership =
    active.status === "resolved" && scopedProject
      ? await input.directory.hasProjectMembership({
          userId: input.identity.userId,
          projectId: input.projectId,
          organizationId: active.organizationId,
        })
      : false;

  return authorizeProjectAccess({
    identity: input.identity,
    userExists: Boolean(user),
    memberships,
    requestedOrganizationId: input.organizationId,
    project: scopedProject,
    hasProjectMembership,
    capability: input.capability,
  });
}

export type AuthorizeOrganizationInput = {
  identity: AuthenticatedIdentity | null;
  organizationId: string | null | undefined;
  directory: IdentityDirectory;
};

export async function authorizeOrganizationContext(
  input: AuthorizeOrganizationInput,
): Promise<AuthorizationResult> {
  if (!input.identity) {
    return { status: "Unauthenticated" };
  }

  const user = await input.directory.findUserById(input.identity.userId);
  if (!user) {
    return { status: "UnknownIdentity" };
  }

  const memberships = await input.directory.listOrganizationMemberships(
    input.identity.userId,
  );
  const active = resolveActiveOrganization(memberships, input.organizationId);
  if (active.status !== "resolved") {
    return { status: active.status };
  }

  return {
    status: "Authorized",
    scope: deriveTenantScope(input.identity.userId, active.organizationId),
    role: active.membership.role,
    capabilities: capabilitiesForRole(active.membership.role),
  };
}

export type AuthorizeProjectCreateInput = {
  identity: AuthenticatedIdentity | null;
  organizationId: string | null | undefined;
  directory: IdentityDirectory;
};

export async function authorizeProjectCreateRequest(
  input: AuthorizeProjectCreateInput,
): Promise<AuthorizationResult> {
  if (!input.identity) {
    return { status: "Unauthenticated" };
  }

  const user = await input.directory.findUserById(input.identity.userId);
  const memberships = user
    ? await input.directory.listOrganizationMemberships(input.identity.userId)
    : [];

  return authorizeOrganizationCapability({
    identity: input.identity,
    userExists: Boolean(user),
    memberships,
    requestedOrganizationId: input.organizationId,
    capability: "project:create",
  });
}
