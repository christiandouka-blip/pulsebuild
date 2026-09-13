import { and, asc, eq } from "drizzle-orm";

import { projectMemberships, projects } from "@/drizzle/schema";
import type { Database } from "@/lib/db/client";
import type { AccessibleProject, ProjectCatalog } from "@/lib/workspace/types";

export function createDrizzleProjectCatalog(db: Database): ProjectCatalog {
  return {
    async listOrganizationProjects(
      organizationId: string,
    ): Promise<readonly AccessibleProject[]> {
      const rows = await db
        .select({
          id: projects.id,
          organizationId: projects.organizationId,
          name: projects.name,
          status: projects.status,
        })
        .from(projects)
        .where(eq(projects.organizationId, organizationId))
        .orderBy(asc(projects.name), asc(projects.id));
      return rows;
    },

    async listAssignedProjects(input: {
      userId: string;
      organizationId: string;
    }): Promise<readonly AccessibleProject[]> {
      const rows = await db
        .select({
          id: projects.id,
          organizationId: projects.organizationId,
          name: projects.name,
          status: projects.status,
        })
        .from(projectMemberships)
        .innerJoin(
          projects,
          and(
            eq(projects.id, projectMemberships.projectId),
            eq(projects.organizationId, projectMemberships.organizationId),
          ),
        )
        .where(
          and(
            eq(projectMemberships.userId, input.userId),
            eq(projectMemberships.organizationId, input.organizationId),
            eq(projects.organizationId, input.organizationId),
          ),
        )
        .orderBy(asc(projects.name), asc(projects.id));
      return rows;
    },
  };
}
