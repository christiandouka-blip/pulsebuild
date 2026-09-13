/**
 * Phase 5A production ownership contracts.
 *
 * Persistent identity and tenancy only. Not a dump of ProjectSnapshot.
 * Authorization policy belongs to Phase 5B.
 */

export const ORGANIZATION_ROLES = [
  "Owner",
  "ProjectManager",
  "Superintendent",
  "Viewer",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/**
 * Required argument for every future tenant-scoped repository operation.
 * Not persisted; derived from the authenticated session in Phase 5B.
 */
export type TenantScope = {
  organizationId: string;
  actorUserId: string;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMembership = {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  createdAt: string;
};

/**
 * Assigned-project access. Owner remains organization-wide in 5B policy.
 * Role is not duplicated here; it lives on OrganizationMembership.
 */
export type ProjectMembership = {
  id: string;
  userId: string;
  organizationId: string;
  projectId: string;
  createdAt: string;
};
