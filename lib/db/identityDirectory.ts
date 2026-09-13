import { and, eq } from "drizzle-orm";

import type { OrganizationMembership, User } from "@/domain/tenancy/types";
import {
  organizationMemberships,
  projectMemberships,
  projects,
  users,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db/client";
import type {
  IdentityDirectory,
  ProjectOwnership,
} from "@/lib/auth/identityDirectory";

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.name ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toMembership(
  row: typeof organizationMemberships.$inferSelect,
): OrganizationMembership {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    role: row.role,
    createdAt: toIso(row.createdAt),
  };
}

export function createDrizzleIdentityDirectory(
  db: Database,
): IdentityDirectory {
  return {
    async findUserById(userId: string): Promise<User | null> {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ? toUser(row) : null;
    },

    async listOrganizationMemberships(
      userId: string,
    ): Promise<readonly OrganizationMembership[]> {
      const rows = await db
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, userId));
      return rows.map(toMembership);
    },

    async findProjectInOrganization(
      projectId: string,
      organizationId: string,
    ): Promise<ProjectOwnership | null> {
      const [row] = await db
        .select({
          id: projects.id,
          organizationId: projects.organizationId,
        })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.organizationId, organizationId),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async hasProjectMembership(input: {
      userId: string;
      projectId: string;
      organizationId: string;
    }): Promise<boolean> {
      const [row] = await db
        .select({ id: projectMemberships.id })
        .from(projectMemberships)
        .where(
          and(
            eq(projectMemberships.userId, input.userId),
            eq(projectMemberships.projectId, input.projectId),
            eq(projectMemberships.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
  };
}
