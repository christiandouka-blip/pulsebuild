import type { OrganizationMembership, OrganizationRole, User } from "@/domain/tenancy/types";
import type {
  IdentityDirectory,
  ProjectOwnership,
} from "@/lib/auth/identityDirectory";

const NOW = "2026-09-07T12:00:00.000Z";

export function makeUser(
  id: string,
  email: string,
  displayName = "User",
): User {
  return {
    id,
    email,
    displayName,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function makeMembership(
  userId: string,
  organizationId: string,
  role: OrganizationRole,
): OrganizationMembership {
  return {
    id: `mem-${userId}-${organizationId}`,
    userId,
    organizationId,
    role,
    createdAt: NOW,
  };
}

export class MemoryIdentityDirectory implements IdentityDirectory {
  users = new Map<string, User>();
  memberships: OrganizationMembership[] = [];
  projects: ProjectOwnership[] = [];
  assignments: Array<{
    userId: string;
    projectId: string;
    organizationId: string;
  }> = [];

  async findUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async listOrganizationMemberships(
    userId: string,
  ): Promise<readonly OrganizationMembership[]> {
    return this.memberships.filter((item) => item.userId === userId);
  }

  async findProjectInOrganization(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectOwnership | null> {
    return (
      this.projects.find(
        (project) =>
          project.id === projectId && project.organizationId === organizationId,
      ) ?? null
    );
  }

  async hasProjectMembership(input: {
    userId: string;
    projectId: string;
    organizationId: string;
  }): Promise<boolean> {
    return this.assignments.some(
      (row) =>
        row.userId === input.userId &&
        row.projectId === input.projectId &&
        row.organizationId === input.organizationId,
    );
  }
}
