import type { OrganizationMembership, User } from "@/domain/tenancy/types";

export type ProjectOwnership = {
  id: string;
  organizationId: string;
};

/**
 * Identity/membership lookup port used by authorization.
 * Not a ProjectSnapshot repository.
 */
export type IdentityDirectory = {
  findUserById(userId: string): Promise<User | null>;
  listOrganizationMemberships(
    userId: string,
  ): Promise<readonly OrganizationMembership[]>;
  findProjectInOrganization(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectOwnership | null>;
  hasProjectMembership(input: {
    userId: string;
    projectId: string;
    organizationId: string;
  }): Promise<boolean>;
};
