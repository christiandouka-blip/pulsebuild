/**
 * Pure authorization policy. No Auth.js, no database, no FSM.
 */

import {
  capabilitiesForRole,
  roleHasCapability,
  type Capability,
} from "@/domain/authorization/capabilities";
import type {
  AuthenticatedIdentity,
  AuthorizationResult,
} from "@/domain/authorization/types";
import type {
  OrganizationMembership,
  OrganizationRole,
  TenantScope,
} from "@/domain/tenancy/types";

export function deriveTenantScope(
  actorUserId: string,
  organizationId: string,
): TenantScope {
  return { organizationId, actorUserId };
}

export function roleRequiresProjectAssignment(role: OrganizationRole): boolean {
  return role !== "Owner";
}

export function hasAssignedProjectAccess(
  role: OrganizationRole,
  hasProjectMembership: boolean,
): boolean {
  if (role === "Owner") return true;
  return hasProjectMembership;
}

export type ActiveOrganizationResolution =
  | {
      status: "resolved";
      organizationId: string;
      membership: OrganizationMembership;
    }
  | { status: "NotOrganizationMember" }
  | { status: "InvalidActiveOrganization" }
  | { status: "ActiveOrganizationRequired" };

/**
 * Active organization must already be a membership. One membership may be
 * selected unambiguously. Multiple memberships never guess "first id".
 */
export function resolveActiveOrganization(
  memberships: readonly OrganizationMembership[],
  requestedOrganizationId: string | null | undefined,
): ActiveOrganizationResolution {
  if (memberships.length === 0) {
    return { status: "NotOrganizationMember" };
  }

  if (requestedOrganizationId) {
    const membership = memberships.find(
      (item) => item.organizationId === requestedOrganizationId,
    );
    if (!membership) {
      return { status: "InvalidActiveOrganization" };
    }
    return {
      status: "resolved",
      organizationId: membership.organizationId,
      membership,
    };
  }

  if (memberships.length === 1) {
    const membership = memberships[0];
    return {
      status: "resolved",
      organizationId: membership.organizationId,
      membership,
    };
  }

  return { status: "ActiveOrganizationRequired" };
}

export type ProjectAuthorizationFacts = {
  identity: AuthenticatedIdentity | null;
  userExists: boolean;
  memberships: readonly OrganizationMembership[];
  requestedOrganizationId: string | null | undefined;
  project: { id: string; organizationId: string } | null;
  hasProjectMembership: boolean;
  capability: Capability;
};

export function authorizeProjectAccess(
  facts: ProjectAuthorizationFacts,
): AuthorizationResult {
  if (!facts.identity) {
    return { status: "Unauthenticated" };
  }

  if (!facts.userExists) {
    return { status: "UnknownIdentity" };
  }

  const active = resolveActiveOrganization(
    facts.memberships,
    facts.requestedOrganizationId,
  );
  if (active.status !== "resolved") {
    return { status: active.status };
  }

  const { membership, organizationId } = active;
  const scope = deriveTenantScope(facts.identity.userId, organizationId);
  const capabilities = capabilitiesForRole(membership.role);

  if (!facts.project) {
    return { status: "ProjectNotFound" };
  }

  if (facts.project.organizationId !== organizationId) {
    return { status: "ProjectAccessDenied" };
  }

  if (!hasAssignedProjectAccess(membership.role, facts.hasProjectMembership)) {
    return { status: "ProjectAccessDenied" };
  }

  if (!roleHasCapability(membership.role, facts.capability)) {
    return { status: "CapabilityDenied", capability: facts.capability };
  }

  return {
    status: "Authorized",
    scope,
    role: membership.role,
    capabilities,
  };
}

export type OrganizationCapabilityFacts = {
  identity: AuthenticatedIdentity | null;
  userExists: boolean;
  memberships: readonly OrganizationMembership[];
  requestedOrganizationId: string | null | undefined;
  capability: Capability;
};

/**
 * Organization-scoped capability check. Used for creating a project that
 * does not exist yet. Phase 5D locks project:create to Owner.
 */
export function authorizeOrganizationCapability(
  facts: OrganizationCapabilityFacts,
): AuthorizationResult {
  if (!facts.identity) {
    return { status: "Unauthenticated" };
  }
  if (!facts.userExists) {
    return { status: "UnknownIdentity" };
  }

  const active = resolveActiveOrganization(
    facts.memberships,
    facts.requestedOrganizationId,
  );
  if (active.status !== "resolved") {
    return { status: active.status };
  }

  const { membership, organizationId } = active;
  if (!roleHasCapability(membership.role, facts.capability)) {
    return { status: "CapabilityDenied", capability: facts.capability };
  }

  return {
    status: "Authorized",
    scope: deriveTenantScope(facts.identity.userId, organizationId),
    role: membership.role,
    capabilities: capabilitiesForRole(membership.role),
  };
}
